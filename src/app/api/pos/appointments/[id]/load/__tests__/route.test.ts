import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/pos/appointments/[id]/load — Item 15f Phase 1 Layer 8b
 *
 * Sibling of `GET /api/pos/jobs/[id]/checkout-items` for appointments without
 * a linked job yet. Verifies:
 *
 *   - Auth: 401 missing session, 403 when `pos.jobs.manage` denied
 *   - 404 on missing appointment
 *   - 400 on completed / cancelled appointment (matches PUT cascade guard)
 *   - Returns customer + vehicle + services + modifier snapshot + deposit
 *   - Modifier preservation: coupon_code / coupon_discount / loyalty /
 *     manual_discount surface unchanged on the response
 *   - Mobile-fee synthesis when appointment is mobile
 */

interface ApptRow {
  id: string;
  status: string;
  customer_id: string | null;
  vehicle_id: string | null;
  is_mobile: boolean;
  mobile_surcharge: number;
  mobile_zone_name_snapshot: string | null;
  payment_type: string | null;
  deposit_amount: number | null;
  coupon_code: string | null;
  coupon_discount: number | null;
  loyalty_points_redeemed: number | null;
  loyalty_discount: number | null;
  manual_discount_value: number | null;
  manual_discount_label: string | null;
  customer: unknown;
  vehicle: unknown;
  appointment_services: Array<{
    id: string;
    service_id: string;
    price_at_booking: number;
    tier_name: string | null;
  }>;
}

const state = {
  posEmployee: {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'detailer',
    first_name: 'Sam',
    last_name: 'D',
    email: 'sam@example.com',
  } as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  manageGranted: true,
  appointment: null as ApptRow | null,
  serviceMeta: [] as Array<{ id: string; name: string; is_taxable: boolean; category_id: string | null }>,
  depositTxn: null as null | { transaction_date: string },
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async (
    _supabase: unknown,
    _role: string,
    _emp: string,
    key: string
  ) => (key === 'pos.jobs.manage' ? state.manageGranted : true),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildTableMock(table),
  }),
}));

function buildTableMock(table: string) {
  if (table === 'appointments') {
    return {
      select: () => ({
        eq: () => ({
          single: async () => {
            if (!state.appointment) {
              return { data: null, error: { message: 'not found' } };
            }
            return { data: state.appointment, error: null };
          },
        }),
      }),
    };
  }
  if (table === 'services') {
    return {
      select: () => ({
        in: () => Promise.resolve({ data: state.serviceMeta, error: null }),
      }),
    };
  }
  if (table === 'transactions') {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: state.depositTxn, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
  }
  return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
}

import { GET } from '../route';

const APPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SVC_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SVC_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function req(): NextRequest {
  return new NextRequest(`http://localhost/api/pos/appointments/${APPT_ID}/load`, {
    method: 'GET',
  });
}

const params = { params: Promise.resolve({ id: APPT_ID }) };

function makeAppt(overrides: Partial<ApptRow> = {}): ApptRow {
  return {
    id: APPT_ID,
    status: 'scheduled',
    customer_id: 'cust-1',
    vehicle_id: 'veh-1',
    is_mobile: false,
    mobile_surcharge: 0,
    mobile_zone_name_snapshot: null,
    payment_type: null,
    deposit_amount: null,
    coupon_code: null,
    coupon_discount: null,
    loyalty_points_redeemed: null,
    loyalty_discount: null,
    manual_discount_value: null,
    manual_discount_label: null,
    customer: {
      id: 'cust-1',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+13105550000',
      email: 'jane@example.com',
      customer_type: null,
      tags: null,
    },
    vehicle: {
      id: 'veh-1',
      year: 2020,
      make: 'Honda',
      model: 'Civic',
      color: 'Blue',
      size_class: 'sedan',
    },
    appointment_services: [
      { id: 'aps-1', service_id: SVC_A, price_at_booking: 200, tier_name: 'sedan' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'detailer',
    first_name: 'Sam',
    last_name: 'D',
    email: 'sam@example.com',
  };
  state.manageGranted = true;
  state.appointment = makeAppt();
  state.serviceMeta = [
    { id: SVC_A, name: 'Full Detail', is_taxable: false, category_id: 'cat-1' },
    { id: SVC_B, name: 'Wax', is_taxable: false, category_id: 'cat-1' },
  ];
  state.depositTxn = null;
});

describe('GET /api/pos/appointments/[id]/load — auth', () => {
  it('returns 401 when POS session is missing', async () => {
    state.posEmployee = null;
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
  });

  it('returns 403 when pos.jobs.manage is denied', async () => {
    state.manageGranted = false;
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/pos/appointments/[id]/load — record state', () => {
  it('returns 404 when appointment is missing', async () => {
    state.appointment = null;
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
  });

  it('returns 400 on completed appointment (matches PUT cascade)', async () => {
    state.appointment = makeAppt({ status: 'completed' });
    const res = await GET(req(), params);
    expect(res.status).toBe(400);
  });

  it('returns 400 on cancelled appointment (matches PUT cascade)', async () => {
    state.appointment = makeAppt({ status: 'cancelled' });
    const res = await GET(req(), params);
    expect(res.status).toBe(400);
  });

  it('returns 400 on no_show appointment (Layer 8d-bis audit finding #5)', async () => {
    // Per the appointment + job status flow audit (2026-05-17) §6.4,
    // no_show is a terminal state — customer didn't arrive, so editing
    // services is semantically nonsensical. Lockstep with the cascade
    // endpoint's guard in src/lib/appointments/service-edit.ts.
    state.appointment = makeAppt({ status: 'no_show' });
    const res = await GET(req(), params);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/pos/appointments/[id]/load — happy path shape', () => {
  it('returns customer + vehicle + items + modifier snapshot', async () => {
    state.appointment = makeAppt({
      coupon_code: 'SUMMER10',
      coupon_discount: 20,
      loyalty_points_redeemed: 150,
      loyalty_discount: 7.5,
      manual_discount_value: 25,
      manual_discount_label: 'VIP',
    });
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.data;
    expect(data.appointment_id).toBe(APPT_ID);
    expect(data.customer.first_name).toBe('Jane');
    expect(data.vehicle.size_class).toBe('sedan');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      item_type: 'service',
      service_id: SVC_A,
      item_name: 'Full Detail',
      unit_price: 200,
      tier_name: 'sedan',
      is_taxable: false,
      category_id: 'cat-1',
    });
    expect(data.coupon_code).toBe('SUMMER10');
    expect(data.coupon_discount).toBe(20);
    expect(data.loyalty_points_redeemed).toBe(150);
    expect(data.loyalty_discount).toBe(7.5);
    expect(data.manual_discount_value).toBe(25);
    expect(data.manual_discount_label).toBe('VIP');
  });

  it('surfaces nulls for unset modifier columns (drain distinguishes "unset" from 0)', async () => {
    const res = await GET(req(), params);
    const body = await res.json();
    expect(body.data.coupon_discount).toBeNull();
    expect(body.data.loyalty_points_redeemed).toBeNull();
    expect(body.data.manual_discount_value).toBeNull();
    expect(body.data.manual_discount_label).toBeNull();
  });

  it('synthesizes mobile_fee line when appointment is_mobile + surcharge > 0', async () => {
    state.appointment = makeAppt({
      is_mobile: true,
      mobile_surcharge: 30,
      mobile_zone_name_snapshot: 'Torrance / Lomita',
    });
    const res = await GET(req(), params);
    const body = await res.json();
    const mobileItem = body.data.items.find((i: { item_type: string }) => i.item_type === 'mobile_fee');
    expect(mobileItem).toBeTruthy();
    expect(mobileItem.unit_price).toBe(30);
    expect(mobileItem.item_name).toBe('Torrance / Lomita');
  });

  it('returns deposit_amount + deposit_date when payment_type=deposit and a paid transaction exists', async () => {
    state.appointment = makeAppt({
      payment_type: 'deposit',
      deposit_amount: 50,
    });
    state.depositTxn = { transaction_date: '2026-04-12' };
    const res = await GET(req(), params);
    const body = await res.json();
    expect(body.data.deposit_amount).toBe(50);
    expect(body.data.deposit_date).toBe('2026-04-12');
  });

  it('returns deposit_amount=0 when payment_type is not "deposit"', async () => {
    state.appointment = makeAppt({
      payment_type: 'pay_on_site',
      deposit_amount: 50, // present but irrelevant
    });
    const res = await GET(req(), params);
    const body = await res.json();
    expect(body.data.deposit_amount).toBe(0);
    expect(body.data.deposit_date).toBeNull();
  });
});
