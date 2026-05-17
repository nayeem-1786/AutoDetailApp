import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-i regression — pins the appointment-side coupon fallback
// in GET /api/pos/jobs/[id]/checkout-items.
//
// Pre-fix, the route only recovered a coupon via `quotes.coupon_code` joined
// through `job.quote_id`. Online-booking-originated jobs have no `quote_id`,
// so their booking-wizard-applied coupon (stored on `appointments.coupon_code`)
// silently disappeared at the cashier. Fix: when the quote-side lookup yields
// nothing, fall back to the appointment's coupon_code. The client re-validates
// via /api/pos/coupons/validate so the discount value is re-derived.
// ──────────────────────────────────────────────────────────────────────────────

const state = {
  posEmployee: {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  } as
    | null
    | {
        employee_id: string;
        auth_user_id: string;
        role: string;
        first_name: string;
        last_name: string;
        email: string;
      },
  viewGranted: true,
  job: null as Record<string, unknown> | null,
  quote: null as Record<string, unknown> | null,
  appointment: null as Record<string, unknown> | null,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async () => state.viewGranted,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

function makeBuilder(table: string): unknown {
  const filters: Record<string, unknown> = {};

  async function resolve(): Promise<{ data: unknown; error: unknown }> {
    if (table === 'jobs') return { data: state.job, error: state.job ? null : { message: 'not found' } };
    if (table === 'quotes') return { data: state.quote, error: null };
    if (table === 'appointments') return { data: state.appointment, error: null };
    // Empty fallthrough for services/products/quote_items/transactions/payments —
    // those branches don't affect the coupon assertions in these tests.
    if (table === 'quote_items') return { data: [], error: null };
    if (table === 'payments') return { data: [], error: null };
    if (table === 'transactions') return { data: null, error: null };
    if (table === 'services') return { data: [], error: null };
    if (table === 'products') return { data: [], error: null };
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return builder;
    },
    in: () => builder,
    not: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => resolve(),
    maybeSingle: () => resolve(),
    then: (
      onfulfilled: (v: unknown) => unknown,
      onrejected?: (r: unknown) => unknown
    ) => resolve().then(onfulfilled, onrejected),
  };

  return builder;
}

import { GET } from '../route';

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/pos/jobs/job-1/checkout-items', {
    method: 'GET',
  });
}

const ctx = { params: Promise.resolve({ id: 'job-1' }) };

const BASE_JOB = {
  id: 'job-1',
  status: 'in_progress',
  services: [],
  customer_id: 'cust-1',
  vehicle_id: 'veh-1',
  customer: null,
  vehicle: null,
  addons: [],
};

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
  state.job = null;
  state.quote = null;
  state.appointment = null;
});

describe('GET /api/pos/jobs/[id]/checkout-items — coupon recovery (Item 15g Layer 15g-i)', () => {
  it('returns the coupon_code from the linked quote when present', async () => {
    state.job = { ...BASE_JOB, quote_id: 'q-1', appointment_id: 'a-1' };
    state.quote = { coupon_code: 'QUOTE25' };
    state.appointment = { coupon_code: 'APPT99' }; // would lose if read

    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.coupon_code).toBe('QUOTE25');
  });

  it('falls back to appointments.coupon_code when no quote_id bridge exists', async () => {
    state.job = { ...BASE_JOB, quote_id: null, appointment_id: 'a-1' };
    state.quote = null;
    state.appointment = { coupon_code: 'BOOKING50' };

    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.coupon_code).toBe('BOOKING50');
  });

  it('falls back to appointments.coupon_code when the linked quote has no coupon', async () => {
    state.job = { ...BASE_JOB, quote_id: 'q-1', appointment_id: 'a-1' };
    state.quote = { coupon_code: null };
    state.appointment = { coupon_code: 'APPT10' };

    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.coupon_code).toBe('APPT10');
  });

  it('returns no coupon for a pure walk-in (no quote, no appointment coupon)', async () => {
    state.job = { ...BASE_JOB, quote_id: null, appointment_id: null };

    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.coupon_code).toBeNull();
  });
});
