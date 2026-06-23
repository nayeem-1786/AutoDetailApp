/**
 * Q2 — Booking-side loyalty affordability + canonical discount recompute.
 *
 * Integration pins for the wiring in `api/book/route.ts` (the pure decision
 * logic is locked separately in
 * `src/lib/loyalty/__tests__/redemption-guard.test.ts`):
 *   1. redemption within the live balance → 201, server-RECOMPUTED
 *      loyalty_discount persisted on the appointment (not the client value).
 *   2. redemption exceeding the live balance → 422, NO appointment written.
 *   3. tampered client loyalty_discount → server overrides with the canonical
 *      points-derived value (anti-tamper regression guard).
 *
 * Booking does NOT debit customers.loyalty_points_balance — that structural
 * fix is deferred to Option A Phase 3. See
 * docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md Q2 follow-up.
 *
 * Harness mirrors `deposit-tax-persistence.test.ts` (the proven booking-route
 * mock shape) so future readers see one style across the suite.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface InsertCapture {
  table: string;
  row: Record<string, unknown> | { _array: Record<string, unknown>[] };
}

const captured: InsertCapture[] = [];

const state = {
  primaryService: {
    id: 'svc-primary-1',
    name: 'Full Detail',
    pricing_model: 'flat',
    flat_price: 200,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    per_unit_price: null,
    is_active: true,
    online_bookable: true,
    classification: 'primary',
    mobile_eligible: true,
    staff_assessed: false,
    is_taxable: false,
    vehicle_compatibility: [],
    service_pricing: [],
  } as Record<string, unknown>,
  // Existing customer fixture — carries the loyalty balance read by the
  // affordability check. Both the phone lookup and the loyalty-balance SELECT
  // resolve to this object in the harness.
  existingCustomer: {
    id: 'cust-loyal-1',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    customer_type: 'enthusiast',
    loyalty_points_balance: 250,
  } as Record<string, unknown>,
  overlapping: [] as Record<string, unknown>[],
};

vi.mock('@/lib/utils/sms', () => ({ sendSms: vi.fn(async () => undefined) }));
vi.mock('@/lib/utils/email', () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/send-templated-email', () => ({
  sendTemplatedEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/email/send-welcome-email', () => ({
  sendWelcomeEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(async () => undefined),
  getRequestIp: () => '127.0.0.1',
}));
vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: vi.fn(async () => ({
    body: '',
    isActive: false,
    canSilence: false,
    recipientType: 'customer' as const,
    recipientPhones: null,
  })),
}));
vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: vi.fn(async () => true),
}));
vi.mock('@/lib/utils/sale-pricing', () => ({
  getSaleStatus: () => ({ isOnSale: false }),
}));
vi.mock('@/lib/utils/sms-consent', () => ({
  updateSmsConsent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/utils/mobile-address-action', () => ({
  resolveMobileAddressAction: vi.fn(async () => null),
}));
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: vi.fn(async () => ({
    name: 'Smart Details',
    phone: '+15555550100',
    email: 'biz@example.com',
    address: '123 Test St',
  })),
}));
vi.mock('@/lib/utils/assign-detailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/assign-detailer')>(
    '@/lib/utils/assign-detailer'
  );
  return {
    ...actual,
    findAvailableDetailer: vi.fn(async () => 'emp-detailer-1'),
  };
});
vi.mock('@/lib/services/combo-resolver', () => ({
  applyCombosToQuoteItems: vi.fn(async (_supabase: unknown, items: unknown[]) => items),
}));
vi.mock('stripe', () => {
  const Stripe = vi.fn().mockImplementation(() => ({
    paymentIntents: {
      retrieve: vi.fn(async () => ({ id: 'pi_test_q2', latest_charge: 'ch_test_q2' })),
    },
  }));
  return { default: Stripe };
});
vi.mock('@/lib/utils/stripe-card-details', () => ({
  extractCardDetailsFromCharge: vi.fn(async () => ({
    card_brand: 'visa',
    card_last_four: '4242',
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));
vi.mock('@/lib/utils/appointment-number', () => ({
  generateAppointmentNumber: vi.fn(async () => 'A-TEST-10001'),
}));
vi.mock('@/lib/utils/receipt-number', () => ({
  generateReceiptNumber: vi.fn(async () => 'SD-TEST-10001'),
}));

function makeBuilder(table: string): unknown {
  let pendingInsert: Record<string, unknown> | null = null;
  let pendingInsertArray: Record<string, unknown>[] | null = null;
  let usedIn = false;

  async function resolveTerminal(): Promise<{ data: unknown; error: unknown }> {
    if (table === 'services') {
      if (usedIn) return { data: [], error: null }; // addon-row fetch (none)
      return { data: state.primaryService, error: null };
    }
    if (table === 'appointments') {
      if (pendingInsert) {
        const row = { id: 'appt-q2-1', ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      return { data: state.overlapping, error: null };
    }
    if (table === 'customers') {
      if (pendingInsert) {
        const row = { id: 'cust-new-q2', ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      // Both the phone lookup AND the loyalty-balance SELECT land here.
      return { data: state.existingCustomer, error: null };
    }
    if (table === 'transactions') {
      if (pendingInsert) {
        const row = { id: 'tx-q2-1', ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      return { data: null, error: null };
    }
    if (table === 'transaction_items') {
      if (pendingInsertArray) {
        captured.push({ table, row: { _array: pendingInsertArray } });
        pendingInsertArray = null;
      } else if (pendingInsert) {
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
      }
      return { data: null, error: null };
    }
    if (table === 'appointment_services' || table === 'payments') {
      if (pendingInsert) {
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
      }
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    lt: () => builder,
    gt: () => builder,
    is: () => builder,
    in: () => {
      usedIn = true;
      return builder;
    },
    limit: () => builder,
    order: () => builder,
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      if (Array.isArray(payload)) pendingInsertArray = payload;
      else pendingInsert = payload;
      return builder;
    },
    update: () => builder,
    single: () => resolveTerminal(),
    maybeSingle: () => resolveTerminal(),
    then: (onfulfilled: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
      resolveTerminal().then(onfulfilled, onrejected),
  };

  return builder;
}

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SERVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAYMENT_INTENT_ID = 'pi_test_q2_book_deposit';

function buildBookingBody(overrides: Record<string, unknown> = {}) {
  return {
    service_id: SERVICE_ID,
    price: 200,
    date: '2026-06-01',
    time: '10:00',
    duration_minutes: 120,
    is_mobile: false,
    payment_intent_id: PAYMENT_INTENT_ID,
    deposit_amount: 50,
    customer: {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '(424) 555-1234',
      email: 'jane@example.com',
      sms_consent: false,
      email_consent: false,
    },
    vehicle: {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: 'sedan',
      year: 2024,
      make: 'Tesla',
      model: 'Model 3',
      color: 'White',
    },
    addons: [],
    channel: 'online',
    ...overrides,
  };
}

function getAppointmentRow(): Record<string, unknown> {
  const cap = captured.find((c) => c.table === 'appointments');
  if (!cap) throw new Error('No appointments insert captured');
  return cap.row as Record<string, unknown>;
}

beforeEach(() => {
  captured.length = 0;
  state.existingCustomer = {
    id: 'cust-loyal-1',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    customer_type: 'enthusiast',
    loyalty_points_balance: 250,
  };
  state.overlapping = [];
});

describe('Q2 booking — loyalty affordability gate', () => {
  it('redemption within balance → 201, server-recomputed loyalty_discount persisted', async () => {
    state.existingCustomer.loyalty_points_balance = 250;
    const res = await POST(
      makeReq(buildBookingBody({ loyalty_points_used: 100, loyalty_discount: 5 }))
    );
    expect(res.status).toBe(201);

    const appt = getAppointmentRow();
    expect(appt.loyalty_points_redeemed).toBe(100);
    // 100 points → $5.00 canonical (pointsToCents(100)/100).
    expect(appt.loyalty_discount).toBe(5);
    // discount_amount folds coupon(0) + loyalty(5).
    expect(appt.discount_amount).toBe(5);
  });

  it('redemption EXCEEDING balance → 422, no appointment written', async () => {
    state.existingCustomer.loyalty_points_balance = 100;
    const res = await POST(
      makeReq(buildBookingBody({ loyalty_points_used: 300, loyalty_discount: 15 }))
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe(
      'Insufficient loyalty balance — requested 300 points, have 100 available'
    );
    // Rejected before the appointment INSERT — nothing persisted.
    expect(captured.find((c) => c.table === 'appointments')).toBeUndefined();
  });

  it('tampered client loyalty_discount → server overrides with canonical value', async () => {
    // Client submits an inflated $999 discount for 100 points. The server
    // ignores it and recomputes $5.00 from the points.
    state.existingCustomer.loyalty_points_balance = 1000;
    const res = await POST(
      makeReq(buildBookingBody({ loyalty_points_used: 100, loyalty_discount: 999 }))
    );
    expect(res.status).toBe(201);

    const appt = getAppointmentRow();
    expect(appt.loyalty_discount).toBe(5);
    expect(appt.loyalty_discount).not.toBe(999);
  });

  it('no redemption (0 points) → 201, zero discount, balance untouched', async () => {
    const res = await POST(makeReq(buildBookingBody({ loyalty_points_used: 0 })));
    expect(res.status).toBe(201);

    const appt = getAppointmentRow();
    expect(appt.loyalty_points_redeemed).toBe(0);
    expect(appt.loyalty_discount).toBe(0);
  });
});
