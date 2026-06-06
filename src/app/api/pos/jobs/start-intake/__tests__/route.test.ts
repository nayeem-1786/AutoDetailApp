import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── CRITICAL INVARIANT (Session 2.1, AC-3) ──────────────────────────────────
// POST /api/pos/jobs/start-intake is the canonical materialization event.
// Future-dated and non-confirmed appointments MUST be rejected at the gate
// before any job row is created. Idempotency relies on the
// `jobs.appointment_id` UNIQUE constraint — two concurrent presses MUST result
// in exactly ONE job row, and the second call MUST return the same job_id.

const PINNED_TODAY = '2026-05-15';
const PINNED_NOW_ISO = '2026-05-15T17:00:00.000Z';

const auditCalls: Array<Record<string, unknown>> = [];

interface AppointmentRow {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  employee_id: string | null;
  scheduled_date: string;
  scheduled_end_time: string | null;
  status: string;
  is_mobile: boolean;
  mobile_surcharge: number;
  mobile_zone_name_snapshot: string | null;
}

interface AptServiceRow {
  service_id: string;
  price_at_booking: number;
  service: { id: string; name: string };
}

const state = {
  posEmployee: null as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  permission: true,
  appointment: null as AppointmentRow | null,
  existingJob: null as { id: string } | null,
  aptServices: [] as AptServiceRow[],
  // captures
  insertedJob: null as Record<string, unknown> | null,
  insertedJobId: 'job-new',
  appointmentUpdatePayload: null as Record<string, unknown> | null,
  upsertError: null as { message: string } | null,
  appointmentUpdateError: null as { message: string } | null,
  /** If true, upsert ignores duplicate (no row returned), then the recovery
   *  SELECT must find the pre-existing row id. Simulates a race condition. */
  upsertReturnsEmpty: false,
  raceWinnerId: null as string | null,
  fromTables: [] as string[],
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async () => state.permission,
}));

vi.mock('@/lib/utils/pst-date', () => ({
  getTodayPst: () => PINNED_TODAY,
  pstStartOfDayLiteral: (d: string) => `${d}T00:00:00-08:00`,
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    auditCalls.push(entry);
    return Promise.resolve();
  },
  getRequestIp: () => '127.0.0.1',
}));

function makeBuilder(table: string) {
  state.fromTables.push(table);
  const b: {
    _table: string;
    _op: 'select' | 'update' | 'upsert' | null;
    _payload: unknown;
    select: (cols?: string) => typeof b;
    eq: (col: string, val: unknown) => typeof b;
    update: (p: Record<string, unknown>) => typeof b;
    upsert: (rows: unknown[], opts?: unknown) => typeof b;
    single: () => Promise<unknown>;
    maybeSingle: () => Promise<unknown>;
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    _table: table,
    _op: null,
    _payload: null,
    select(cols?: string) {
      void cols;
      this._op = this._op ?? 'select';
      return this;
    },
    eq() {
      return this;
    },
    update(p: Record<string, unknown>) {
      this._op = 'update';
      this._payload = p;
      return this;
    },
    upsert(rows: unknown[]) {
      this._op = 'upsert';
      this._payload = rows;
      return this;
    },
    single() {
      return Promise.resolve(resolveSingle(this));
    },
    maybeSingle() {
      return Promise.resolve(resolveSingle(this));
    },
    then(onF, onR) {
      return Promise.resolve(resolveAwait(this)).then(onF, onR);
    },
  };
  return b;
}

function resolveSingle(b: { _table: string }) {
  if (b._table === 'appointments') {
    return state.appointment
      ? { data: state.appointment, error: null }
      : { data: null, error: { message: 'not found' } };
  }
  if (b._table === 'jobs') {
    return state.existingJob
      ? { data: state.existingJob, error: null }
      : { data: null, error: null };
  }
  return { data: null, error: null };
}

function resolveAwait(b: { _table: string; _op: string | null; _payload: unknown }) {
  if (b._table === 'appointment_services' && b._op === 'select') {
    return { data: state.aptServices, error: null };
  }
  if (b._table === 'jobs' && b._op === 'upsert') {
    state.insertedJob = ((b._payload as unknown[])?.[0] ?? null) as Record<string, unknown> | null;
    if (state.upsertError) {
      return { data: null, error: state.upsertError };
    }
    // Simulate idempotent upsert: when a row exists already and we ignore
    // duplicates, returned array is empty; otherwise it contains the new id.
    if (state.upsertReturnsEmpty) {
      // The next SELECT (recovery) returns the race winner.
      state.existingJob = state.raceWinnerId ? { id: state.raceWinnerId } : null;
      return { data: [], error: null };
    }
    // Mark the new job as the canonical existing job — covers idempotent
    // re-call within the same test session (existingJob is checked next time).
    state.existingJob = { id: state.insertedJobId };
    return { data: [{ id: state.insertedJobId }], error: null };
  }
  if (b._table === 'appointments' && b._op === 'update') {
    state.appointmentUpdatePayload = b._payload as Record<string, unknown>;
    if (state.appointmentUpdateError) {
      return { error: state.appointmentUpdateError };
    }
    // Mutate the in-memory appointment so re-reads see the new status.
    if (state.appointment) {
      state.appointment = {
        ...state.appointment,
        status: String((b._payload as Record<string, unknown>).status),
      };
    }
    return { error: null };
  }
  return { data: null, error: null };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

import { POST } from '../route';

let dateSpy: ReturnType<typeof vi.spyOn>;

function makeReq(body?: unknown): NextRequest {
  if (body === undefined) {
    return new NextRequest('http://localhost/api/pos/jobs/start-intake', {
      method: 'POST',
    });
  }
  return new NextRequest('http://localhost/api/pos/jobs/start-intake', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function appt(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'apt-1',
    customer_id: 'c1',
    vehicle_id: 'v1',
    employee_id: 'e1',
    scheduled_date: PINNED_TODAY,
    scheduled_end_time: '11:00:00',
    status: 'confirmed',
    is_mobile: false,
    mobile_surcharge: 0,
    mobile_zone_name_snapshot: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  };
  state.permission = true;
  state.appointment = null;
  state.existingJob = null;
  state.aptServices = [];
  state.insertedJob = null;
  state.insertedJobId = 'job-new';
  state.appointmentUpdatePayload = null;
  state.upsertError = null;
  state.appointmentUpdateError = null;
  state.upsertReturnsEmpty = false;
  state.raceWinnerId = null;
  state.fromTables = [];
  auditCalls.length = 0;
  // Pin Date so work_started_at + audit timestamps are deterministic.
  dateSpy = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(PINNED_NOW_ISO);
});

afterEach(() => {
  dateSpy.mockRestore();
});

describe('POST /api/pos/jobs/start-intake — auth and validation', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is not JSON', async () => {
    const res = await POST(makeReq('not-json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid request body/);
  });

  it('returns 400 when appointment_id is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/appointment_id is required/);
  });

  it('returns 400 when appointment_id is not a non-empty string', async () => {
    const res = await POST(makeReq({ appointment_id: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when operator lacks appointments.update_status permission', async () => {
    state.permission = false;
    state.appointment = appt();
    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/pos/jobs/start-intake — gates', () => {
  it('returns 404 when appointment does not exist', async () => {
    state.appointment = null;
    const res = await POST(makeReq({ appointment_id: 'no-such-apt' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 422 future_date with appointment_date when scheduled_date > today', async () => {
    state.appointment = appt({ scheduled_date: '2026-06-01' });
    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('future_date');
    expect(body.appointment_date).toBe('2026-06-01');
    // Hard proof: no job INSERT happened.
    expect(state.insertedJob).toBeNull();
    expect(state.appointmentUpdatePayload).toBeNull();
  });

  it('returns 422 invalid_status when appointment.status = pending', async () => {
    state.appointment = appt({ status: 'pending' });
    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('invalid_status');
    expect(body.appointment_status).toBe('pending');
    expect(state.insertedJob).toBeNull();
  });

  it('returns 422 invalid_status when appointment.status = completed', async () => {
    state.appointment = appt({ status: 'completed' });
    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('invalid_status');
    expect(body.appointment_status).toBe('completed');
  });

  it('returns 422 invalid_status when appointment.status = cancelled', async () => {
    state.appointment = appt({ status: 'cancelled' });
    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(422);
  });

  it('returns 422 invalid_status when appointment.status = no_show', async () => {
    state.appointment = appt({ status: 'no_show' });
    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(422);
  });
});

describe('POST /api/pos/jobs/start-intake — successful materialization', () => {
  it('returns 201 with new job_id; inserts job at status=intake with work_started_at; updates appointment to in_progress', async () => {
    state.appointment = appt({ status: 'confirmed' });
    state.aptServices = [
      { service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
      { service_id: 's2', price_at_booking: 50, service: { id: 's2', name: 'Wax' } },
    ];

    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.job_id).toBe('job-new');
    expect(body.appointment_id).toBe('apt-1');
    expect(body.already_materialized).toBe(false);

    // Job insert shape verification
    expect(state.insertedJob).toMatchObject({
      appointment_id: 'apt-1',
      customer_id: 'c1',
      vehicle_id: 'v1',
      assigned_staff_id: 'e1',
      status: 'intake',
      work_started_at: PINNED_NOW_ISO,
      intake_started_at: PINNED_NOW_ISO,
      created_by: 'emp-1',
    });

    // Services snapshot includes both rows
    const services = (state.insertedJob?.services as unknown[]) ?? [];
    expect(services).toHaveLength(2);
    expect(services[0]).toMatchObject({ id: 's1', name: 'Wash', price: 100 });
    expect(services[1]).toMatchObject({ id: 's2', name: 'Wax', price: 50 });

    // Appointment advanced to in_progress
    expect(state.appointmentUpdatePayload).toMatchObject({ status: 'in_progress' });
  });

  it('appends mobile-fee entry to services when appointment.is_mobile and surcharge > 0', async () => {
    state.appointment = appt({
      is_mobile: true,
      mobile_surcharge: 25,
      mobile_zone_name_snapshot: 'Torrance Zone A',
    });
    state.aptServices = [
      { service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
    ];

    await POST(makeReq({ appointment_id: 'apt-1' }));

    const services = (state.insertedJob?.services as unknown[]) ?? [];
    expect(services).toHaveLength(2);
    expect(services[1]).toMatchObject({
      id: null,
      name: 'Torrance Zone A',
      price: 25,
      is_mobile_fee: true,
    });
  });

  it('does NOT update appointment.status when it is already in_progress (no-op write)', async () => {
    state.appointment = appt({ status: 'in_progress' });
    state.aptServices = [
      { service_id: 's1', price_at_booking: 80, service: { id: 's1', name: 'Detail' } },
    ];

    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(201);
    expect(state.appointmentUpdatePayload).toBeNull();
  });

  it('writes an audit_log entry with action=create, entityType=job, trigger=start_intake', async () => {
    state.appointment = appt({ status: 'confirmed' });
    state.aptServices = [
      { service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
    ];

    await POST(makeReq({ appointment_id: 'apt-1' }));

    expect(auditCalls).toHaveLength(1);
    const entry = auditCalls[0];
    expect(entry).toMatchObject({
      action: 'create',
      entityType: 'job',
      entityId: 'job-new',
      source: 'pos',
      employeeName: 'Pat Cashier',
    });
    expect(entry.details).toMatchObject({
      trigger: 'start_intake',
      appointment_id: 'apt-1',
      previous_appointment_status: 'confirmed',
      services_count: 1,
    });
  });
});

describe('POST /api/pos/jobs/start-intake — idempotency', () => {
  it('returns 200 with already_materialized=true and the existing job_id when a job already exists', async () => {
    state.appointment = appt({ status: 'in_progress' });
    state.existingJob = { id: 'existing-job-id' };

    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.job_id).toBe('existing-job-id');
    expect(body.already_materialized).toBe(true);

    // No INSERT happened — fast path returned at the existing-job check.
    expect(state.insertedJob).toBeNull();
    // No appointment update — fast path returns before the status advance.
    expect(state.appointmentUpdatePayload).toBeNull();
    // No audit row — materialization didn't actually happen.
    expect(auditCalls).toHaveLength(0);
  });

  it('recovers the race-winner job_id when upsert returns empty (concurrent caller won)', async () => {
    state.appointment = appt({ status: 'confirmed' });
    state.aptServices = [
      { service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
    ];
    state.upsertReturnsEmpty = true;
    state.raceWinnerId = 'race-winner-job-id';

    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    const body = await res.json();

    // 201 status (we didn't hit the existing-job fast path; we attempted insert)
    expect(res.status).toBe(201);
    expect(body.job_id).toBe('race-winner-job-id');
    expect(body.already_materialized).toBe(false);

    // The audit row carries race_winner_returned=true so post-hoc analysis can
    // distinguish "we won the race" from "concurrent caller won".
    expect(auditCalls[0]?.details).toMatchObject({
      race_winner_returned: true,
    });
  });
});

describe('POST /api/pos/jobs/start-intake — error handling', () => {
  it('returns 500 unknown when job upsert fails', async () => {
    state.appointment = appt({ status: 'confirmed' });
    state.aptServices = [
      { service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
    ];
    state.upsertError = { message: 'simulated insert failure' };
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('unknown');

    // The appointment was NOT updated (we never reached the appointment update step).
    expect(state.appointmentUpdatePayload).toBeNull();
    logSpy.mockRestore();
  });

  it('returns 500 unknown with job_id when appointment update fails after job insert (recoverable partial state)', async () => {
    state.appointment = appt({ status: 'confirmed' });
    state.aptServices = [
      { service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
    ];
    state.appointmentUpdateError = { message: 'simulated update failure' };
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeReq({ appointment_id: 'apt-1' }));
    expect(res.status).toBe(500);

    // Job WAS inserted — the partial state is recoverable (next press hits the
    // idempotent fast path and re-attempts the appointment update).
    expect(state.insertedJob).not.toBeNull();
    logSpy.mockRestore();
  });
});
