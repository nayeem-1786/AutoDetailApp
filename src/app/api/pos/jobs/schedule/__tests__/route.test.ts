import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── CRITICAL INVARIANT (Item 15e Phase 1A) ──────────────────────────────────
// GET /api/pos/jobs/schedule is a PURE READ. It must NEVER write the `jobs`
// table (insert/upsert) and NEVER call populate. If a `jobs` write assertion
// below regresses, future appointments are being prematurely materialized —
// breaking the retire-and-absorb architecture. The companion server-side gate
// is tested in ../../populate/__tests__/route.test.ts; the client-side gate
// (the load-bearing invariant test) lands in Phase 1B's job-queue tests.

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
  viewGranted: true,
  appointments: [] as Array<Record<string, unknown>>,
  existingJobs: [] as Array<{ appointment_id: string }>,
  error: null as null | { message: string },
  captured: {
    gte: '',
    lte: '',
    not: '',
    channel: '',
    jobsInIds: [] as string[],
  },
  // Any forbidden write attempt against `jobs` is recorded here.
  jobsWrites: [] as string[],
  fromTables: [] as string[],
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async (
    _supabase: unknown,
    _role: string,
    _employeeId: string,
    permissionKey: string
  ) => {
    if (permissionKey === 'appointments.view_today') return state.viewGranted;
    return true;
  },
}));

vi.mock('@/lib/utils/pst-date', () => ({
  getTodayPst: () => PINNED_TODAY,
}));

// Self-chaining thenable. Every builder method returns the same builder, and
// the builder resolves (await) to the table-appropriate dataset. `insert` /
// `upsert` are present ONLY to catch forbidden writes — they record and throw.
function makeChain(table: string) {
  state.fromTables.push(table);
  const builder: Record<string, unknown> = {
    select: () => builder,
    gte: (_c: string, v: string) => {
      state.captured.gte = v;
      return builder;
    },
    lte: (_c: string, v: string) => {
      state.captured.lte = v;
      return builder;
    },
    not: (_c: string, _op: string, v: string) => {
      state.captured.not = v;
      return builder;
    },
    eq: (c: string, v: string) => {
      if (c === 'channel') state.captured.channel = v;
      return builder;
    },
    in: (_c: string, v: string[]) => {
      if (table === 'jobs') state.captured.jobsInIds = v;
      return builder;
    },
    order: () => builder,
    insert: () => {
      state.jobsWrites.push(`${table}.insert`);
      throw new Error(`Forbidden write: ${table}.insert in schedule endpoint`);
    },
    upsert: () => {
      state.jobsWrites.push(`${table}.upsert`);
      throw new Error(`Forbidden write: ${table}.upsert in schedule endpoint`);
    },
    then: (resolve: (r: unknown) => void) => {
      const data = table === 'jobs' ? state.existingJobs : state.appointments;
      resolve({ data, error: state.error });
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeChain(table),
  }),
}));

import { GET } from '../route';

function makeReq(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/pos/jobs/schedule${query}`, {
    method: 'GET',
  });
}

function appt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'apt-1',
    scheduled_date: '2026-05-20',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    status: 'confirmed',
    channel: 'online',
    total_amount: 150,
    deposit_amount: 50,
    customer: { id: 'c1', first_name: 'Sam', last_name: 'Lee', phone: null, email: null },
    vehicle: { id: 'v1', year: 2020, make: 'Toyota', model: 'Camry', color: 'Blue' },
    detailer: { id: 'e1', first_name: 'Dana', last_name: 'Detailer' },
    appointment_services: [
      { id: 'as1', service_id: 's1', price_at_booking: 150, tier_name: null, quantity: 1, service: { id: 's1', name: 'Wash' } },
    ],
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
  state.viewGranted = true;
  state.appointments = [];
  state.existingJobs = [];
  state.error = null;
  state.captured = { gte: '', lte: '', not: '', channel: '', jobsInIds: [] };
  state.jobsWrites = [];
  state.fromTables = [];
});

describe('GET /api/pos/jobs/schedule', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 403 when view permission denied', async () => {
    state.viewGranted = false;
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('defaults the window to tomorrow → tomorrow+30d (excludes today)', async () => {
    state.appointments = [appt()];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    // tomorrow relative to pinned today 2026-05-15
    expect(state.captured.gte).toBe('2026-05-16');
    expect(state.captured.lte).toBe('2026-06-15');
  });

  it('honors explicit from / to params', async () => {
    state.appointments = [appt()];
    const res = await GET(makeReq('?from=2026-06-01&to=2026-06-10'));
    expect(res.status).toBe(200);
    expect(state.captured.gte).toBe('2026-06-01');
    expect(state.captured.lte).toBe('2026-06-10');
  });

  it('clamps a from at/below today up to tomorrow (future-only floor)', async () => {
    state.appointments = [appt()];
    // Ask for a window starting today; endpoint must clamp the lower bound to tomorrow.
    const res = await GET(makeReq(`?from=${PINNED_TODAY}&to=2026-05-25`));
    expect(res.status).toBe(200);
    expect(state.captured.gte).toBe('2026-05-16');
  });

  it('returns empty when the requested window is entirely today/past', async () => {
    const res = await GET(makeReq('?from=2026-05-10&to=2026-05-15'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    // Short-circuits before querying appointments.
    expect(state.fromTables).not.toContain('appointments');
  });

  it('excludes cancelled / no_show / completed via the status filter', async () => {
    state.appointments = [appt()];
    await GET(makeReq());
    expect(state.captured.not).toContain('cancelled');
    expect(state.captured.not).toContain('no_show');
    expect(state.captured.not).toContain('completed');
  });

  it('drops appointments that already have a materialized job', async () => {
    state.appointments = [appt({ id: 'apt-materialized' }), appt({ id: 'apt-open' })];
    state.existingJobs = [{ appointment_id: 'apt-materialized' }];
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('apt-open');
  });

  it('applies the channel filter when provided', async () => {
    state.appointments = [appt()];
    await GET(makeReq('?channel=walk_in'));
    expect(state.captured.channel).toBe('walk_in');
  });

  it('maps rows to PosScheduleEntry shape with scope discriminator + quantity', async () => {
    state.appointments = [appt()];
    const res = await GET(makeReq());
    const body = await res.json();
    const entry = body.data[0];
    expect(entry.scope).toBe('schedule');
    expect(entry.appointment_services[0].quantity).toBe(1);
    expect(entry.total_amount).toBe(150);
    expect(entry.deposit_amount).toBe(50);
    expect(entry.detailer).toEqual({ id: 'e1', first_name: 'Dana', last_name: 'Detailer' });
  });

  it('rejects malformed dates and inverted ranges', async () => {
    expect((await GET(makeReq('?from=2026-13-99'))).status).toBe(400);
    expect((await GET(makeReq('?from=2026-06-10&to=2026-06-01'))).status).toBe(400);
    expect((await GET(makeReq('?from=2026-06-01&to=2026-09-01'))).status).toBe(400); // > 31d
  });

  it('CRITICAL: performs ZERO writes to the jobs table', async () => {
    state.appointments = [appt({ id: 'a' }), appt({ id: 'b' })];
    state.existingJobs = [{ appointment_id: 'a' }];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    // The only `jobs` touch is the dedup SELECT — never insert/upsert.
    expect(state.jobsWrites).toEqual([]);
    expect(state.captured.jobsInIds).toEqual(['a', 'b']);
  });
});
