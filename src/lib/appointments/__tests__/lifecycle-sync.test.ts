import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  jobStatusForAppointmentStatus,
  isEarlierState,
  executeUnMaterialize,
} from '../lifecycle-sync';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL INVARIANT (Item 15e Phase 2C):
// Un-materialize MUST revert appointments.status='pending' BEFORE deleting the
// job, so `populate` (which materializes only confirmed/in_progress appointments)
// can never re-create the deleted job. The "ordering" test below is the unit-level
// proxy for that load-bearing invariant.
// ─────────────────────────────────────────────────────────────────────────────

const auditCalls: Array<Record<string, unknown>> = [];
vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    auditCalls.push(entry);
  },
}));

// ── Stateful Supabase mock ───────────────────────────────────────────────────
interface JobRow {
  id: string;
  status: string;
  transaction_id: string | null;
  timer_seconds: number;
  intake_notes: string | null;
}
const state = {
  appointment: null as null | { id: string; status: string },
  job: null as null | JobRow,
  photoCount: 0,
  addonCount: 0,
  photoRows: [] as Array<{ storage_path: string | null }>,
  apptUpdateError: null as null | { message: string },
  jobDeleteError: null as null | { message: string },
  storageError: null as null | { message: string },
  // captured
  apptUpdatePayload: null as null | Record<string, unknown>,
  jobDeleted: false,
  storageRemoved: null as null | string[],
  opOrder: [] as string[],
};

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {
    _table: table,
    _select: null as string | null,
    _head: false,
    _count: false,
    _op: null as string | null,
    _payload: null as Record<string, unknown> | null,
  };
  b.select = (cols: string, opts?: { count?: string; head?: boolean }) => {
    b._select = cols;
    b._head = !!opts?.head;
    b._count = opts?.count === 'exact';
    return b;
  };
  b.update = (payload: Record<string, unknown>) => {
    b._op = 'update';
    b._payload = payload;
    return b;
  };
  b.delete = () => {
    b._op = 'delete';
    return b;
  };
  b.eq = () => b;
  b.single = async () => resolveSingle(b);
  b.maybeSingle = async () => resolveSingle(b);
  b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(resolveAwait(b)).then(onF, onR);
  return b;
}

function resolveSingle(b: Record<string, unknown>) {
  if (b._table === 'appointments') {
    return state.appointment
      ? { data: state.appointment, error: null }
      : { data: null, error: { message: 'not found' } };
  }
  if (b._table === 'jobs') {
    return state.job ? { data: state.job, error: null } : { data: null, error: null };
  }
  return { data: null, error: null };
}

function resolveAwait(b: Record<string, unknown>) {
  if (b._op === 'update' && b._table === 'appointments') {
    state.apptUpdatePayload = b._payload as Record<string, unknown>;
    state.opOrder.push('appt_update');
    if (state.appointment && state.apptUpdateError === null) {
      state.appointment.status = String((b._payload as Record<string, unknown>).status);
    }
    return { error: state.apptUpdateError };
  }
  if (b._op === 'delete' && b._table === 'jobs') {
    state.opOrder.push('job_delete');
    if (state.jobDeleteError === null) state.jobDeleted = true;
    return { error: state.jobDeleteError };
  }
  if (b._table === 'job_photos' && b._head && b._count) {
    return { count: state.photoCount, error: null };
  }
  if (b._table === 'job_addons' && b._head && b._count) {
    return { count: state.addonCount, error: null };
  }
  if (b._table === 'job_photos' && b._select === 'storage_path') {
    return { data: state.photoRows, error: null };
  }
  return { data: null, error: null };
}

const mockSupabase = {
  from: (table: string) => makeBuilder(table),
  storage: {
    from: (_bucket: string) => ({
      remove: async (paths: string[]) => {
        state.storageRemoved = paths;
        return { error: state.storageError };
      },
    }),
  },
} as unknown as SupabaseClient;

const actor = { userId: 'u1', userEmail: 'op@example.com', employeeName: 'Op Erator' };

function call(confirmString?: string) {
  return executeUnMaterialize(mockSupabase, 'apt-1', {
    confirmString,
    actor,
    source: 'pos',
    ipAddress: '127.0.0.1',
  });
}

beforeEach(() => {
  state.appointment = { id: 'apt-1', status: 'confirmed' };
  state.job = { id: 'job-1', status: 'scheduled', transaction_id: null, timer_seconds: 0, intake_notes: null };
  state.photoCount = 0;
  state.addonCount = 0;
  state.photoRows = [];
  state.apptUpdateError = null;
  state.jobDeleteError = null;
  state.storageError = null;
  state.apptUpdatePayload = null;
  state.jobDeleted = false;
  state.storageRemoved = null;
  state.opOrder = [];
  auditCalls.length = 0;
});

describe('jobStatusForAppointmentStatus (forward mapping — Phase 2C scope)', () => {
  it('no job → none', () => {
    expect(jobStatusForAppointmentStatus('pending', null, false)).toEqual({ kind: 'none' });
  });
  it('has job + pending → delete_job (un_materialize)', () => {
    expect(jobStatusForAppointmentStatus('pending', 'scheduled', true)).toEqual({
      kind: 'delete_job',
      reason: 'un_materialize',
    });
  });
  it('has job + confirmed/in_progress/completed → none (Item 15h territory)', () => {
    expect(jobStatusForAppointmentStatus('confirmed', 'scheduled', true)).toEqual({ kind: 'none' });
    expect(jobStatusForAppointmentStatus('in_progress', 'in_progress', true)).toEqual({ kind: 'none' });
    expect(jobStatusForAppointmentStatus('completed', 'completed', true)).toEqual({ kind: 'none' });
  });
  it('walk-in pairing (in_progress appt + scheduled job) is left untouched', () => {
    expect(jobStatusForAppointmentStatus('in_progress', 'scheduled', true)).toEqual({ kind: 'none' });
  });
});

describe('isEarlierState', () => {
  it('pending is earlier than confirmed/in_progress/completed', () => {
    expect(isEarlierState('pending', 'confirmed')).toBe(true);
    expect(isEarlierState('pending', 'in_progress')).toBe(true);
    expect(isEarlierState('confirmed', 'in_progress')).toBe(true);
  });
  it('forward or same moves are NOT earlier', () => {
    expect(isEarlierState('confirmed', 'pending')).toBe(false);
    expect(isEarlierState('confirmed', 'confirmed')).toBe(false);
    expect(isEarlierState('completed', 'in_progress')).toBe(false);
  });
  it('cancelled / no_show are not ranked → never earlier-state reverts', () => {
    expect(isEarlierState('cancelled', 'confirmed')).toBe(false);
    expect(isEarlierState('no_show', 'confirmed')).toBe(false);
    expect(isEarlierState('pending', 'cancelled')).toBe(false);
  });
});

describe('executeUnMaterialize', () => {
  it('404 when appointment missing', async () => {
    state.appointment = null;
    const r = await call();
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(404);
    expect(r.error).toBe('not_found');
    expect(state.jobDeleted).toBe(false);
  });

  it('404 when no job exists for the appointment', async () => {
    state.job = null;
    const r = await call();
    expect(r.httpStatus).toBe(404);
    expect(r.error).toBe('not_found');
  });

  it('409 transaction_linked when job has a transaction', async () => {
    state.job!.transaction_id = 'txn-1';
    const r = await call();
    expect(r.httpStatus).toBe(409);
    expect(r.error).toBe('transaction_linked');
    expect(state.jobDeleted).toBe(false);
    expect(state.apptUpdatePayload).toBeNull();
  });

  it('409 terminal for completed/closed/cancelled jobs', async () => {
    for (const s of ['completed', 'closed', 'cancelled']) {
      state.job = { id: 'job-1', status: s, transaction_id: null, timer_seconds: 0, intake_notes: null };
      const r = await call();
      expect(r.httpStatus).toBe(409);
      expect(r.error).toBe('terminal');
    }
  });

  it('422 confirm_required for in_progress without "DELETE" — returns enumeration, no delete', async () => {
    state.job!.status = 'in_progress';
    state.photoCount = 5;
    state.addonCount = 2;
    state.job!.intake_notes = 'scratch on bumper';
    const r = await call();
    expect(r.httpStatus).toBe(422);
    expect(r.error).toBe('confirm_required');
    expect(r.data?.confirmRequired).toBe(true);
    expect(r.data?.photoCount).toBe(5);
    expect(r.data?.addonCount).toBe(2);
    expect(r.data?.hasIntakeNotes).toBe(true);
    expect(state.jobDeleted).toBe(false);
    expect(state.apptUpdatePayload).toBeNull();
  });

  it('422 when confirmString is wrong case ("delete" ≠ "DELETE")', async () => {
    state.job!.status = 'in_progress';
    const r = await call('delete');
    expect(r.httpStatus).toBe(422);
    expect(r.error).toBe('confirm_required');
    expect(state.jobDeleted).toBe(false);
  });

  it('200 in_progress proceeds with exact "DELETE"', async () => {
    state.job!.status = 'in_progress';
    const r = await call('DELETE');
    expect(r.ok).toBe(true);
    expect(r.httpStatus).toBe(200);
    expect(state.jobDeleted).toBe(true);
  });

  it('200 free un-materialize for scheduled job (no confirmString needed)', async () => {
    const r = await call();
    expect(r.ok).toBe(true);
    expect(r.httpStatus).toBe(200);
    expect(state.jobDeleted).toBe(true);
  });

  it('CRITICAL-INVARIANT: reverts appointment to pending BEFORE deleting the job', async () => {
    await call();
    // The ordering is the re-materialization invariant: populate only
    // materializes confirmed/in_progress appointments, so an appointment already
    // flipped to 'pending' before the job delete can never be re-materialized.
    expect(state.opOrder).toEqual(['appt_update', 'job_delete']);
    expect(state.apptUpdatePayload?.status).toBe('pending');
    // Final appointment status is NOT in the materializing set.
    expect(['confirmed', 'in_progress']).not.toContain(state.appointment?.status);
    expect(state.appointment?.status).toBe('pending');
  });

  it('deletes job_photos storage objects (main + _thumb), best-effort', async () => {
    state.photoRows = [{ storage_path: 'jobs/job-1/a.jpg' }, { storage_path: 'jobs/job-1/b.jpg' }];
    const r = await call();
    expect(r.ok).toBe(true);
    expect(state.storageRemoved).toEqual([
      'jobs/job-1/a.jpg',
      'jobs/job-1/a_thumb.jpg',
      'jobs/job-1/b.jpg',
      'jobs/job-1/b_thumb.jpg',
    ]);
    expect(r.storageFilesDeleted).toBe(4);
  });

  it('storage failure does NOT roll back the DB delete (best-effort)', async () => {
    state.photoRows = [{ storage_path: 'jobs/job-1/a.jpg' }];
    state.storageError = { message: 'storage down' };
    const r = await call();
    expect(r.ok).toBe(true); // success despite storage failure
    expect(state.jobDeleted).toBe(true);
    expect(r.storageFilesDeleted).toBe(0);
  });

  it('writes a pos-source delete audit row with previous_job_status', async () => {
    await call();
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].action).toBe('delete');
    expect(auditCalls[0].entityType).toBe('job');
    expect(auditCalls[0].source).toBe('pos');
    const details = auditCalls[0].details as Record<string, unknown>;
    expect(details.reason).toBe('un_materialize');
    expect(details.previous_job_status).toBe('scheduled');
  });

  it('appointment-revert failure → 500, job NOT deleted (nothing materializable lost)', async () => {
    state.apptUpdateError = { message: 'update failed' };
    const r = await call();
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(500);
    expect(state.jobDeleted).toBe(false);
  });
});
