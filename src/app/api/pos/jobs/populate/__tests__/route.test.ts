import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── CRITICAL INVARIANT (Item 15e Phase 1A) ──────────────────────────────────
// POST /api/pos/jobs/populate must materialize jobs for TODAY/PAST only. A
// FUTURE-dated target must short-circuit BEFORE any DB query and create ZERO
// job rows. This is the server-side half of the retire arc's load-bearing
// populate gate (the client-side half is tested in Phase 1B's job-queue tests).

const PINNED_TODAY = '2026-05-15';

const state = {
  posEmployee: null as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  appointments: [] as Array<Record<string, unknown>>,
  existingJobs: [] as Array<{ appointment_id: string }>,
  aptServices: [] as Array<Record<string, unknown>>,
  createdJobs: [] as Array<Record<string, unknown>>,
  fromTables: [] as string[],
  upsertCalled: false,
  upsertRows: null as unknown,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/utils/pst-date', () => ({
  getTodayPst: () => PINNED_TODAY,
  // Returns a value whose last 6 chars are a usable offset for `.slice(-6)`.
  pstStartOfDayLiteral: (d: string) => `${d}T00:00:00-08:00`,
}));

function makeChain(table: string) {
  state.fromTables.push(table);
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    upsert: (rows: unknown) => {
      state.upsertCalled = true;
      state.upsertRows = rows;
      return builder;
    },
    then: (resolve: (r: unknown) => void) => {
      let data: unknown;
      if (table === 'appointments') data = state.appointments;
      else if (table === 'appointment_services') data = state.aptServices;
      else if (table === 'jobs') data = state.upsertCalled ? state.createdJobs : state.existingJobs;
      else data = [];
      resolve({ data, error: null });
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeChain(table),
  }),
}));

import { POST } from '../route';

let logSpy: ReturnType<typeof vi.spyOn>;

function makeReq(date?: string): NextRequest {
  if (date === undefined) {
    return new NextRequest('http://localhost/api/pos/jobs/populate', { method: 'POST' });
  }
  return new NextRequest('http://localhost/api/pos/jobs/populate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date }),
  });
}

function appt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'apt-1',
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
  state.appointments = [];
  state.existingJobs = [];
  state.aptServices = [];
  state.createdJobs = [];
  state.fromTables = [];
  state.upsertCalled = false;
  state.upsertRows = null;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('POST /api/pos/jobs/populate — future-date gate', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('GATE: skips a future-dated target before any DB query (zero materialization)', async () => {
    state.appointments = [appt({ id: 'future-apt' })]; // would materialize if reached
    const res = await POST(makeReq('2026-06-01'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.created).toBe(0);
    expect(body.data.skipped).toBe('future_date');
    // Hard proof: no Supabase table was ever touched, and no upsert occurred.
    expect(state.fromTables).toEqual([]);
    expect(state.upsertCalled).toBe(false);
  });

  it('GATE: fires the defensive log line for a future date', async () => {
    await POST(makeReq('2026-06-01'));
    expect(logSpy).toHaveBeenCalledWith('[populate] skipped — future date 2026-06-01');
  });

  it('GATE: a future in_progress appointment is also skipped (date-based, status-agnostic)', async () => {
    state.appointments = [appt({ id: 'future-ip', status: 'in_progress' })];
    const res = await POST(makeReq('2026-12-31'));
    const body = await res.json();
    expect(body.data.skipped).toBe('future_date');
    expect(state.upsertCalled).toBe(false);
  });

  it('REGRESSION: a today-dated confirmed appointment IS materialized', async () => {
    state.appointments = [appt({ id: 'today-apt', status: 'confirmed' })];
    state.aptServices = [
      { appointment_id: 'today-apt', service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
    ];
    state.createdJobs = [{ id: 'job-1' }];
    const res = await POST(makeReq()); // no date → defaults to today
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(state.fromTables).toContain('appointments'); // gate let it through
    expect(state.upsertCalled).toBe(true);
    expect(body.data.created).toBe(1);
  });

  it('REGRESSION: a today-dated in_progress appointment IS materialized', async () => {
    state.appointments = [appt({ id: 'today-ip', status: 'in_progress' })];
    state.aptServices = [
      { appointment_id: 'today-ip', service_id: 's1', price_at_booking: 80, service: { id: 's1', name: 'Detail' } },
    ];
    state.createdJobs = [{ id: 'job-2' }];
    const res = await POST(makeReq(PINNED_TODAY));
    const body = await res.json();
    expect(state.upsertCalled).toBe(true);
    expect(body.data.created).toBe(1);
  });

  it('REGRESSION: a PAST date still populates (gate blocks future only)', async () => {
    state.appointments = []; // none to create, but the query must still run
    const res = await POST(makeReq('2026-05-10'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.skipped).toBeUndefined();
    expect(state.fromTables).toContain('appointments'); // gate did NOT short-circuit
  });

  it('does not double-materialize when the appointment already has a job', async () => {
    state.appointments = [appt({ id: 'has-job' })];
    state.existingJobs = [{ appointment_id: 'has-job' }];
    const res = await POST(makeReq(PINNED_TODAY));
    const body = await res.json();
    expect(body.data.created).toBe(0);
    expect(state.upsertCalled).toBe(false); // filtered out before insert
  });
});
