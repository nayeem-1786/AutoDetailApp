import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Session 1.5 — admin PATCH /api/appointments/[id]. This file did not exist
// pre-1.5; admin PATCH was previously permissive (no STATUS_TRANSITIONS guard)
// and did not invoke the un-materialize cascade. AC-5 commits both PATCH
// endpoints (admin + POS) to the shared map AND the shared cascade. This file
// pins the new admin behavior so admin/POS symmetry is regression-locked.
//
// Mirror shape of pos/appointments/[id]/__tests__/patch.test.ts — same mock
// approach (state object + per-table dispatch on `from(table)`).

const state = {
  employee: {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'admin@example.com',
    first_name: 'Ada',
    last_name: 'Min',
  } as null | {
    id: string;
    auth_user_id: string;
    email: string;
    first_name: string;
    last_name: string;
  },
  rescheduleDenied: false,
  statusDenied: false,
  notesDenied: false,
  appointment: null as null | {
    id: string;
    status: string;
    scheduled_date: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    job_notes: string | null;
    internal_notes: string | null;
  },
  overlapping: [] as Array<{ id: string }>,
  appointmentUpdates: [] as Array<Record<string, unknown>>,
  auditCalls: [] as Array<Record<string, unknown>>,
  webhookFires: [] as Array<{ event: string; payload: unknown }>,
  linkedJob: null as null | { id: string },
  cascadeCalls: [] as Array<{ appointmentId: string; options: Record<string, unknown> }>,
  cascadeResult: { ok: true, httpStatus: 200, data: { jobId: 'job-1' } } as Record<string, unknown>,
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async (_id: string, key: string) => {
    if (key === 'appointments.reschedule' && state.rescheduleDenied) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    if (key === 'appointments.update_status' && state.statusDenied) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    if (key === 'appointments.add_notes' && state.notesDenied) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    return null;
  },
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
  getRequestIp: () => '127.0.0.1',
  buildChangeDetails: (
    current: Record<string, unknown>,
    next: Record<string, unknown>,
    fields: string[]
  ) => {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of fields) {
      if (next[f] !== undefined && current[f] !== next[f]) {
        changes[f] = { from: current[f], to: next[f] };
      }
    }
    return { changes };
  },
}));

vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async (event: string, payload: unknown) => {
    state.webhookFires.push({ event, payload });
  }),
}));

vi.mock('@/lib/appointments/lifecycle-sync', () => ({
  executeUnMaterialize: vi.fn(
    async (_supabase: unknown, appointmentId: string, options: Record<string, unknown>) => {
      state.cascadeCalls.push({ appointmentId, options });
      return state.cascadeResult;
    }
  ),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'appointments') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => {
                if (!state.appointment) return { data: null, error: { message: 'not found' } };
                return { data: state.appointment, error: null };
              },
              neq: (_c1: string, _v1: string) => ({
                neq: (_c2: string, _v2: string) => ({
                  lt: (_c3: string, _v3: string) => ({
                    gt: (_c4: string, _v4: string) => ({
                      limit: (_n: number) =>
                        Promise.resolve({ data: state.overlapping, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: string) => ({
              select: (_c: string) => ({
                single: async () => {
                  state.appointmentUpdates.push(payload);
                  return {
                    data: { id: 'appt-1', status: payload.status ?? state.appointment?.status },
                    error: null,
                  };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'jobs') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: state.linkedJob, error: null }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

import { PATCH } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/appointments/appt-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'appt-1' });

beforeEach(() => {
  state.employee = {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'admin@example.com',
    first_name: 'Ada',
    last_name: 'Min',
  };
  state.rescheduleDenied = false;
  state.statusDenied = false;
  state.notesDenied = false;
  state.appointment = {
    id: 'appt-1',
    status: 'confirmed',
    scheduled_date: '2026-05-15',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    job_notes: null,
    internal_notes: null,
  };
  state.overlapping = [];
  state.appointmentUpdates = [];
  state.auditCalls = [];
  state.webhookFires = [];
  state.linkedJob = null;
  state.cascadeCalls = [];
  state.cascadeResult = { ok: true, httpStatus: 200, data: { jobId: 'job-1' } };
});

describe('PATCH /api/appointments/[id] — Session 1.5 admin/POS symmetry', () => {
  it('returns 401 when no employee session', async () => {
    state.employee = null;
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(401);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 403 when status change but appointments.update_status denied', async () => {
    state.statusDenied = true;
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(403);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('Session 1.5: blocks completed → pending (admin PATCH now enforces STATUS_TRANSITIONS)', async () => {
    // Pre-1.5 admin PATCH had no state-machine guard — completed → pending
    // would have been accepted. Post-1.5 it must mirror POS PATCH and reject.
    state.appointment!.status = 'completed';
    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
    expect(state.cascadeCalls).toHaveLength(0);
  });

  it('Session 1.5: blocks cancelled → confirmed (terminal status — empty allowed-next set)', async () => {
    state.appointment!.status = 'cancelled';
    const res = await PATCH(makeReq({ status: 'confirmed' }), { params });
    expect(res.status).toBe(400);
  });

  it('Session 1.5: confirmed → pending with active job invokes cascade with admin source', async () => {
    state.appointment!.status = 'confirmed';
    state.linkedJob = { id: 'job-1' };

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(200);

    expect(state.cascadeCalls).toHaveLength(1);
    expect(state.cascadeCalls[0].appointmentId).toBe('appt-1');
    // ADMIN source — key differentiator from POS PATCH's same-shape cascade call.
    expect(state.cascadeCalls[0].options.source).toBe('admin');
    expect((state.cascadeCalls[0].options.actor as Record<string, unknown>).employeeName).toBe('Ada Min');

    // status omitted from the PATCH UPDATE — cascade owned that write.
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBeUndefined();
    expect(state.webhookFires).toHaveLength(0);

    // Audit records the status change through the synthetic payload.
    const audit = state.auditCalls[0];
    const changes = (audit.details as { changes: Record<string, { from: unknown; to: unknown }> }).changes;
    expect(changes.status).toEqual({ from: 'confirmed', to: 'pending' });
    expect(audit.source).toBe('admin');
  });

  it('Session 1.5: in_progress → pending without active job is a plain status flip (no cascade)', async () => {
    state.appointment!.status = 'in_progress';
    state.linkedJob = null;

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(200);

    expect(state.cascadeCalls).toHaveLength(0);
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBe('pending');
  });

  it('Session 1.5: cascade 409 transaction_linked propagates to admin PATCH caller', async () => {
    state.appointment!.status = 'in_progress';
    state.linkedJob = { id: 'job-x' };
    state.cascadeResult = { ok: false, httpStatus: 409, error: 'transaction_linked' };

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('transaction_linked');
    expect(state.appointmentUpdates).toHaveLength(0);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('accepts pending → confirmed and fires appointment_confirmed webhook', async () => {
    state.appointment!.status = 'pending';
    const res = await PATCH(makeReq({ status: 'confirmed' }), { params });
    expect(res.status).toBe(200);
    expect(state.webhookFires).toHaveLength(1);
    expect(state.webhookFires[0].event).toBe('appointment_confirmed');
  });

  it('passes the pre-1.5 happy paths (notes-only update) without cascade or state-machine interference', async () => {
    const res = await PATCH(makeReq({ job_notes: 'wax on', internal_notes: 'vip' }), { params });
    expect(res.status).toBe(200);
    expect(state.cascadeCalls).toHaveLength(0);
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].job_notes).toBe('wax on');
    expect(state.appointmentUpdates[0].internal_notes).toBe('vip');
  });
});
