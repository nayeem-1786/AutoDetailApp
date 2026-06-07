import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-iv — Scenario B end-to-end pin for the POS Quote →
// Appointment → Job → Checkout-items chain.
//
// Individual stages have unit coverage (`convert-service.test.ts`,
// `coupon-fallback.test.ts`, `handle-checkout-coupon.test.tsx`,
// `quote-service.modifiers.test.ts`). This file pins the *chain semantics*:
// a quote persisted with all 3 modifier types must produce an appointment
// whose modifier columns match the quote, and `/api/pos/jobs/[id]/checkout-items`
// must surface those same values to the POS register hydration step.
//
// The single shared state fixture below acts as a stand-in for the database —
// `convertQuote` writes into it (appointment INSERT), and the checkout-items
// handler reads back out of it (appointment SELECT). If the contract drifts at
// any stage, this test surfaces the divergence in one place.
// ──────────────────────────────────────────────────────────────────────────────

const sharedState = {
  quote: null as Record<string, unknown> | null,
  appointment: null as Record<string, unknown> | null,
  job: null as Record<string, unknown> | null,
  posEmployee: {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  },
};

// ── Mocks shared across both SUTs (convert-service + checkout-items route) ──
vi.mock('@/lib/utils/assign-detailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/assign-detailer')>(
    '@/lib/utils/assign-detailer'
  );
  return {
    ...actual,
    findAvailableDetailer: vi.fn(async () => 'emp-detailer-1'),
  };
});
vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async () => undefined),
}));
vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => sharedState.posEmployee,
}));
vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async () => true,
}));

// Phase 3 Theme A (AC-10): convertQuote now generates appointment_number via
// next_identifier('appointment'). The shared in-memory supabase mock below
// does not implement .rpc(), so we short-circuit the helper directly.
vi.mock('@/lib/utils/appointment-number', () => ({
  generateAppointmentNumber: vi.fn(async () => 'A-CHAIN-10001'),
}));

// One supabase mock services both the convert-service (direct call) and the
// checkout-items route (via createAdminClient). Both query the same in-memory
// state above so the chain stays consistent.
function makeSharedSupabase() {
  function builder(table: string): unknown {
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;

    async function resolve(): Promise<{ data: unknown; error: unknown }> {
      if (table === 'quotes') {
        if (pendingUpdate) {
          if (sharedState.quote) {
            Object.assign(sharedState.quote, pendingUpdate);
          }
          pendingUpdate = null;
          return { data: null, error: null };
        }
        return { data: sharedState.quote, error: sharedState.quote ? null : { message: 'not found' } };
      }
      if (table === 'appointments') {
        if (pendingInsert) {
          const row = { id: 'appt-chain-1', ...pendingInsert };
          sharedState.appointment = row;
          pendingInsert = null;
          return { data: row, error: null };
        }
        return { data: sharedState.appointment, error: null };
      }
      if (table === 'jobs') {
        return { data: sharedState.job, error: sharedState.job ? null : { message: 'not found' } };
      }
      if (table === 'appointment_services') {
        pendingInsert = null;
        return { data: null, error: null };
      }
      // Other tables in checkout-items chain — empty fallthrough.
      return { data: null, error: null };
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      not: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        pendingInsert = Array.isArray(payload) ? { _array: payload } : payload;
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        pendingUpdate = payload;
        return chain;
      },
      single: () => resolve(),
      maybeSingle: () => resolve(),
      then: (
        onfulfilled: (v: unknown) => unknown,
        onrejected?: (r: unknown) => unknown
      ) => resolve().then(onfulfilled, onrejected),
    };
    return chain;
  }
  return { from: builder };
}

const sharedSupabase = makeSharedSupabase();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => sharedSupabase,
}));

import { convertQuote } from '../convert-service';
import { GET as getCheckoutItems } from '@/app/api/pos/jobs/[id]/checkout-items/route';

const BASE_QUOTE = {
  id: 'quote-chain-1',
  quote_number: 'Q-CHAIN-1',
  customer_id: 'cust-1',
  vehicle_id: 'veh-1',
  status: 'sent',
  subtotal: 400,
  tax_amount: 36,
  total_amount: 290, // post-15g-v writers persist net: 400 + 36 - (25 + 50 + 71) = 290
  notes: null,
  is_mobile: false,
  mobile_zone_id: null,
  mobile_address: null,
  mobile_surcharge: 0,
  mobile_zone_name_snapshot: null,
  // All 3 modifier types persisted on the quote (Layer 15g-ii schema).
  coupon_code: 'CHAIN25',
  coupon_discount: 25,
  loyalty_points_to_redeem: 1000,
  loyalty_discount: 50,
  manual_discount_type: 'dollar',
  manual_discount_value: 71,
  manual_discount_label: 'VIP courtesy',
  items: [
    {
      service_id: 'svc-1',
      product_id: null,
      item_name: 'Full Detail',
      quantity: 1,
      unit_price: 400,
      total_price: 400,
      tier_name: null,
      pricing_type: 'standard',
      standard_price: 400,
      notes: null,
    },
  ],
};

const CONVERT_INPUT = {
  date: '2026-05-20',
  time: '10:00',
  duration_minutes: 120,
  employee_id: null,
};

const BASE_JOB = {
  id: 'job-chain-1',
  status: 'in_progress',
  services: [],
  customer_id: 'cust-1',
  vehicle_id: 'veh-1',
  quote_id: 'quote-chain-1',
  appointment_id: 'appt-chain-1',
  customer: null,
  vehicle: null,
  addons: [],
};

function buildCheckoutReq(): NextRequest {
  return new NextRequest('http://localhost/api/pos/jobs/job-chain-1/checkout-items', {
    method: 'GET',
  });
}

beforeEach(() => {
  sharedState.quote = null;
  sharedState.appointment = null;
  sharedState.job = null;
});

describe('Item 15g Layer 15g-iv — Scenario B chain pin: Quote → Appointment → Job → Checkout', () => {
  it('preserves all 3 modifier types end-to-end with consistent values at every stage', async () => {
    sharedState.quote = { ...BASE_QUOTE };
    sharedState.job = { ...BASE_JOB };

    // STAGE 1: Quote → Appointment
    const convertResult = await convertQuote(
      sharedSupabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-chain-1',
      CONVERT_INPUT
    );
    expect(convertResult.success).toBe(true);

    // Appointment row must mirror the quote's modifier snapshot.
    const appt = sharedState.appointment!;
    expect(appt.coupon_code).toBe('CHAIN25');
    expect(appt.coupon_discount).toBe(25);
    expect(appt.loyalty_points_redeemed).toBe(1000);
    expect(appt.loyalty_discount).toBe(50);
    expect(appt.manual_discount_value).toBe(71);
    expect(appt.manual_discount_label).toBe('VIP courtesy');
    expect(appt.discount_amount).toBe(146); // 25 + 50 + 71

    // Total trusts the quote's persisted net value (Layer 15g-v writer contract).
    expect(appt.total_amount).toBe(290);

    // Quote row is mutated to status=converted.
    expect(sharedState.quote!.status).toBe('converted');
    expect(sharedState.quote!.converted_appointment_id).toBe('appt-chain-1');

    // STAGE 2: Job (existing fixture) → Checkout-items hydration
    const res = await getCheckoutItems(buildCheckoutReq(), {
      params: Promise.resolve({ id: 'job-chain-1' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const data = json.data;

    // Modifier values surfaced to the POS register must match the appointment
    // (which matches the quote). This is the chain-consistency contract.
    expect(data.coupon_code).toBe('CHAIN25');
    expect(data.coupon_discount).toBe(25);
    expect(data.loyalty_points_redeemed).toBe(1000);
    expect(data.loyalty_discount).toBe(50);
    expect(data.manual_discount_value).toBe(71);
    expect(data.manual_discount_label).toBe('VIP courtesy');
  });

  it('coupon-only quote stays coupon-only through the chain', async () => {
    sharedState.quote = {
      ...BASE_QUOTE,
      coupon_code: 'POSCOUP10',
      coupon_discount: 10,
      loyalty_points_to_redeem: 0,
      loyalty_discount: 0,
      manual_discount_type: null,
      manual_discount_value: null,
      manual_discount_label: null,
      total_amount: 426, // 400 + 36 - 10
    };
    sharedState.job = { ...BASE_JOB };

    await convertQuote(
      sharedSupabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-chain-1',
      CONVERT_INPUT
    );

    const appt = sharedState.appointment!;
    expect(appt.coupon_code).toBe('POSCOUP10');
    expect(appt.coupon_discount).toBe(10);
    expect(appt.loyalty_points_redeemed).toBe(0);
    expect(appt.loyalty_discount).toBe(0);
    expect(appt.manual_discount_value).toBeNull();
    expect(appt.discount_amount).toBe(10);

    const res = await getCheckoutItems(buildCheckoutReq(), {
      params: Promise.resolve({ id: 'job-chain-1' }),
    });
    const data = (await res.json()).data;
    expect(data.coupon_code).toBe('POSCOUP10');
    expect(data.coupon_discount).toBe(10);
    expect(data.loyalty_points_redeemed).toBe(0);
    expect(data.loyalty_discount).toBe(0);
    expect(data.manual_discount_value).toBeNull();
    expect(data.manual_discount_label).toBeNull();
  });

  it('modifier-free quote produces a clean appointment + clean checkout response (negative case)', async () => {
    sharedState.quote = {
      ...BASE_QUOTE,
      coupon_code: null,
      coupon_discount: null,
      loyalty_points_to_redeem: 0,
      loyalty_discount: 0,
      manual_discount_type: null,
      manual_discount_value: null,
      manual_discount_label: null,
      total_amount: 436, // 400 + 36, no modifiers
    };
    sharedState.job = { ...BASE_JOB, quote_id: null }; // walk-in-style chain

    await convertQuote(
      sharedSupabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-chain-1',
      CONVERT_INPUT
    );

    const appt = sharedState.appointment!;
    expect(appt.coupon_code).toBeNull();
    expect(appt.coupon_discount).toBeNull();
    expect(appt.loyalty_points_redeemed).toBe(0);
    expect(appt.loyalty_discount).toBe(0);
    expect(appt.manual_discount_value).toBeNull();
    expect(appt.manual_discount_label).toBeNull();
    expect(appt.discount_amount).toBe(0);
    expect(appt.total_amount).toBe(436);

    const res = await getCheckoutItems(buildCheckoutReq(), {
      params: Promise.resolve({ id: 'job-chain-1' }),
    });
    const data = (await res.json()).data;
    expect(data.coupon_code).toBeNull();
    expect(data.coupon_discount).toBeNull();
    expect(data.loyalty_points_redeemed).toBe(0);
    expect(data.loyalty_discount).toBe(0);
    expect(data.manual_discount_value).toBeNull();
    expect(data.manual_discount_label).toBeNull();
  });

  it('manual_discount_type=percent resolves to dollar against quote subtotal during convert', async () => {
    sharedState.quote = {
      ...BASE_QUOTE,
      coupon_code: null,
      coupon_discount: null,
      loyalty_points_to_redeem: 0,
      loyalty_discount: 0,
      manual_discount_type: 'percent',
      manual_discount_value: 15, // 15% of $400 subtotal = $60
      manual_discount_label: 'Holiday promo',
      total_amount: 376, // 400 + 36 - 60
    };
    sharedState.job = { ...BASE_JOB };

    await convertQuote(
      sharedSupabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-chain-1',
      CONVERT_INPUT
    );

    const appt = sharedState.appointment!;
    expect(appt.manual_discount_value).toBe(60); // percent resolved to dollar
    expect(appt.manual_discount_label).toBe('Holiday promo');
    expect(appt.discount_amount).toBe(60);

    const res = await getCheckoutItems(buildCheckoutReq(), {
      params: Promise.resolve({ id: 'job-chain-1' }),
    });
    const data = (await res.json()).data;
    expect(data.manual_discount_value).toBe(60);
    expect(data.manual_discount_label).toBe('Holiday promo');
  });
});
