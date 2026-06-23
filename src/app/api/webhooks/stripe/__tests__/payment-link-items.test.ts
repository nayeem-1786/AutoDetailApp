/**
 * Q4 (Session #163) — Stripe webhook writes `transaction_items` on the
 * `appointment_payment_link` branch.
 *
 * Pre-Q4 the branch wrote a `transactions` row + `payments` row but NO line
 * items, so pay-link receipts rendered an empty items block (totals with
 * nothing itemizing them — docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md
 * Q4, SD-06444 case). This change reconstructs the line items from
 * `appointment_services` (+ `services` for name / is_taxable / classification)
 * and the appointment's mobile fields, mirroring the booking-deposit
 * item-write pattern (book/route.ts:744-819) EXACTLY.
 *
 * Mirrors `payment-link-tip.test.ts`'s self-contained mock infrastructure —
 * distinguishes SELECT vs UPDATE vs INSERT, captures all DB calls, resets per
 * test. Independent fixtures so neither file's beforeEach interferes with the
 * other.
 *
 * Covers:
 *  1. Items written from appointment_services correctly (regression guard).
 *  2. Mobile-fee item included when appt.is_mobile (edge case).
 *  3. Multi-service appointment writes all service lines (is_addon derived).
 *  4. Empty appointment_services → console.warn + transaction still commits.
 *  5. transaction_items insert failure → console.error, NO throw, payment
 *     + appointment update still succeed (idempotency / non-fatal guard).
 *  6. Discount case → items at FULL price_at_booking; transactions.subtotal
 *     stays the net appt.total_amount (documents the pre-existing discount
 *     gap deferred to Option A Phase 3).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------------
// Mock state
// -----------------------------------------------------------------------------

interface MockAppointment {
  id: string;
  customer_id: string;
  vehicle_id: string;
  total_amount: number;
  payment_status: string | null;
  payment_link_paid_at: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  is_mobile: boolean;
  mobile_surcharge: number | null;
  mobile_zone_name_snapshot: string | null;
}

interface MockApptService {
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
}

interface MockServiceMeta {
  id: string;
  name: string | null;
  is_taxable: boolean | null;
  classification: string | null;
}

interface CapturedInsert {
  table: string;
  payload: Record<string, unknown> | Array<Record<string, unknown>>;
}

interface CapturedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; value: unknown }>;
}

const state = {
  event: null as Record<string, unknown> | null,
  signatureValid: true,
  appointment: null as MockAppointment | null,
  existingPaymentForPi: null as { id: string } | null,
  existingTransactions: [] as Array<{ id: string }>,
  existingPaymentsForTransactions: [] as Array<{ amount: number }>,
  appointmentServices: [] as MockApptService[],
  serviceMeta: [] as MockServiceMeta[],
  failTransactionItemsInsert: false,
};

const capturedInserts: CapturedInsert[] = [];
const capturedUpdates: CapturedUpdate[] = [];
const consoleWarns: string[] = [];
const consoleErrors: string[] = [];

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

vi.mock('stripe', () => {
  function Stripe(this: unknown) {
    return {
      webhooks: {
        constructEvent: () => {
          if (!state.signatureValid) throw new Error('bad signature');
          return state.event;
        },
      },
    };
  }
  return { default: Stripe };
});

vi.mock('@/lib/utils/order-number', () => ({
  generateOrderNumber: async () => 'ORD-TEST-0001',
}));

vi.mock('@/lib/utils/receipt-number', () => ({
  generateReceiptNumber: async () => 'SD-TEST-1',
}));

vi.mock('@/lib/utils/email', () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({ name: 'Test Co', phone: '555', email: 'a@b.c' }),
}));

vi.mock('@/lib/utils/format', () => ({
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
}));

vi.mock('@/lib/utils/stripe-card-details', () => ({
  extractCardDetailsFromCharge: async () => ({ card_brand: 'visa', card_last_four: '4242' }),
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildQuery(table),
  }),
}));

function buildQuery(table: string): unknown {
  const selectChain = () => {
    const filters: Array<{ col: string; value: unknown }> = [];
    const chain: Record<string, unknown> = {
      eq: (col: string, value: unknown) => {
        filters.push({ col, value });
        return chain;
      },
      in: (_col: string, _values: unknown[]) =>
        Promise.resolve(
          table === 'payments'
            ? { data: state.existingPaymentsForTransactions, error: null }
            : table === 'services'
              ? { data: state.serviceMeta, error: null }
              : { data: [], error: null }
        ),
      single: async () => {
        if (table === 'transactions') {
          return { data: { id: 'tx-test-1' }, error: null };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'appointments') {
          return state.appointment
            ? { data: state.appointment, error: null }
            : { data: null, error: null };
        }
        if (table === 'payments') {
          return { data: state.existingPaymentForPi, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (table === 'transactions') {
          return resolve({ data: state.existingTransactions, error: null });
        }
        if (table === 'appointment_services') {
          return resolve({ data: state.appointmentServices, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return chain;
  };

  const updateChain = (payload: Record<string, unknown>) => {
    const filters: Array<{ col: string; value: unknown }> = [];
    const chain: Record<string, unknown> = {
      eq: (col: string, value: unknown) => {
        filters.push({ col, value });
        chain.then = (resolve: (v: { data: null; error: null }) => unknown) => {
          capturedUpdates.push({ table, payload, filters: [...filters] });
          return resolve({ data: null, error: null });
        };
        return chain;
      },
    };
    return chain;
  };

  const insertChain = (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
    capturedInserts.push({ table, payload });
    return {
      select: (_cols: string) => ({
        single: async () => ({ data: { id: `${table}-row-1` }, error: null }),
      }),
      then: (resolve: (v: { data: null; error: { message: string } | null }) => unknown) =>
        resolve(
          table === 'transaction_items' && state.failTransactionItemsInsert
            ? { data: null, error: { message: 'simulated transaction_items insert failure' } }
            : { data: null, error: null }
        ),
    };
  };

  return {
    select: () => selectChain(),
    update: (payload: Record<string, unknown>) => updateChain(payload),
    insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) =>
      insertChain(payload),
  };
}

// Imported AFTER mocks
import { POST } from '../route';

function req(headers: Record<string, string> = { 'stripe-signature': 'sig_ok' }): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

const PI_ID = 'pi_test_items_1';
const APPT_ID = '33333333-3333-3333-3333-333333333333';

function payLinkEvent(amountReceived: number): Record<string, unknown> {
  return {
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: PI_ID,
        amount: amountReceived,
        amount_received: amountReceived,
        latest_charge: 'ch_test_1',
        metadata: {
          type: 'appointment_payment_link',
          appointment_id: APPT_ID,
          payment_link_token: 'items123',
        },
      },
    },
  };
}

function freshAppointment(overrides: Partial<MockAppointment> = {}): MockAppointment {
  return {
    id: APPT_ID,
    customer_id: 'cust-1',
    vehicle_id: 'veh-1',
    total_amount: 100,
    payment_status: 'pending',
    payment_link_paid_at: null,
    stripe_payment_intent_id: null,
    status: 'confirmed', // skip the status-flip path; tested elsewhere
    is_mobile: false,
    mobile_surcharge: 0,
    mobile_zone_name_snapshot: null,
    ...overrides,
  };
}

function findTransactionInsert(): Record<string, unknown> | undefined {
  return capturedInserts.find((i) => i.table === 'transactions')?.payload as
    | Record<string, unknown>
    | undefined;
}

function findItemsInsert(): Array<Record<string, unknown>> | undefined {
  const hit = capturedInserts.find((i) => i.table === 'transaction_items');
  return hit ? (hit.payload as Array<Record<string, unknown>>) : undefined;
}

beforeEach(() => {
  state.event = null;
  state.signatureValid = true;
  state.appointment = null;
  state.existingPaymentForPi = null;
  state.existingTransactions = [];
  state.existingPaymentsForTransactions = [];
  state.appointmentServices = [];
  state.serviceMeta = [];
  state.failTransactionItemsInsert = false;
  capturedInserts.length = 0;
  capturedUpdates.length = 0;
  consoleWarns.length = 0;
  consoleErrors.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation((msg: unknown) => {
    consoleWarns.push(typeof msg === 'string' ? msg : String(msg));
  });
  vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
    consoleErrors.push(typeof msg === 'string' ? msg : String(msg));
  });
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('POST /api/webhooks/stripe — pay-link branch — Q4 transaction_items', () => {
  it('writes a service line item from appointment_services (regression guard)', async () => {
    state.event = payLinkEvent(10000);
    state.appointment = freshAppointment({ total_amount: 100 });
    state.appointmentServices = [
      { service_id: 'svc-a', price_at_booking: 100, tier_name: 'sedan' },
    ];
    state.serviceMeta = [
      { id: 'svc-a', name: 'Full Detail', is_taxable: true, classification: 'primary' },
    ];

    const res = await POST(req());
    expect(res.status).toBe(200);

    const items = findItemsInsert();
    expect(items).toBeDefined();
    expect(items).toHaveLength(1);
    const item = items![0];
    expect(item.transaction_id).toBe('transactions-row-1');
    expect(item.item_type).toBe('service');
    expect(item.service_id).toBe('svc-a');
    expect(item.item_name).toBe('Full Detail');
    expect(item.quantity).toBe(1);
    expect(item.unit_price).toBe(100);
    expect(item.total_price).toBe(100);
    expect(item.tax_amount).toBe(0); // no tax collected at payment time
    expect(item.is_taxable).toBe(true);
    expect(item.tier_name).toBe('sedan');
    expect(item.standard_price).toBe(100);
    expect(item.pricing_type).toBe('standard');
    expect(item.is_addon).toBe(false); // classification 'primary'
    expect(item.vehicle_size_class).toBeNull();
  });

  it('includes a non-taxable mobile_fee line when appt.is_mobile', async () => {
    state.event = payLinkEvent(14000);
    state.appointment = freshAppointment({
      total_amount: 140,
      is_mobile: true,
      mobile_surcharge: 40,
      mobile_zone_name_snapshot: 'South Bay',
    });
    state.appointmentServices = [
      { service_id: 'svc-a', price_at_booking: 100, tier_name: null },
    ];
    state.serviceMeta = [
      { id: 'svc-a', name: 'Express Wash', is_taxable: true, classification: 'primary' },
    ];

    const res = await POST(req());
    expect(res.status).toBe(200);

    const items = findItemsInsert();
    expect(items).toHaveLength(2);
    const mobile = items!.find((i) => i.item_type === 'mobile_fee');
    expect(mobile).toBeDefined();
    expect(mobile!.item_name).toBe('South Bay');
    expect(mobile!.unit_price).toBe(40);
    expect(mobile!.total_price).toBe(40);
    expect(mobile!.is_taxable).toBe(false); // CDTFA Pub 100 — separately stated
    expect(mobile!.is_addon).toBe(false);
    expect(mobile!.service_id).toBeNull();
  });

  it('writes all service lines for a multi-service appointment with is_addon derived', async () => {
    state.event = payLinkEvent(18000);
    state.appointment = freshAppointment({ total_amount: 180 });
    state.appointmentServices = [
      { service_id: 'svc-a', price_at_booking: 100, tier_name: 'sedan' },
      { service_id: 'svc-b', price_at_booking: 50, tier_name: null },
      { service_id: 'svc-c', price_at_booking: 30, tier_name: null },
    ];
    state.serviceMeta = [
      { id: 'svc-a', name: 'Full Detail', is_taxable: true, classification: 'primary' },
      { id: 'svc-b', name: 'Engine Bay', is_taxable: true, classification: 'addon_only' },
      { id: 'svc-c', name: 'Pet Hair', is_taxable: true, classification: 'addon_only' },
    ];

    const res = await POST(req());
    expect(res.status).toBe(200);

    const items = findItemsInsert();
    expect(items).toHaveLength(3);
    const byId = new Map(items!.map((i) => [i.service_id, i]));
    expect(byId.get('svc-a')!.is_addon).toBe(false);
    expect(byId.get('svc-b')!.is_addon).toBe(true);
    expect(byId.get('svc-c')!.is_addon).toBe(true);
    const sum = items!.reduce((acc, i) => acc + Number(i.total_price), 0);
    expect(sum).toBe(180);
  });

  it('empty appointment_services → console.warn, transaction + payment still commit', async () => {
    state.event = payLinkEvent(10000);
    state.appointment = freshAppointment({ total_amount: 100 });
    state.appointmentServices = []; // anomaly: no service rows

    const res = await POST(req());
    expect(res.status).toBe(200);

    // No items written, but the transaction + payment DID commit.
    expect(findItemsInsert()).toBeUndefined();
    expect(findTransactionInsert()).toBeDefined();
    expect(capturedInserts.some((i) => i.table === 'payments')).toBe(true);
    expect(
      consoleWarns.some((w) => w.includes('no appointment_services rows'))
    ).toBe(true);
  });

  it('transaction_items insert failure → console.error, NO throw, payment + appointment update still succeed', async () => {
    state.event = payLinkEvent(10000);
    state.appointment = freshAppointment({ total_amount: 100 });
    state.appointmentServices = [
      { service_id: 'svc-a', price_at_booking: 100, tier_name: null },
    ];
    state.serviceMeta = [
      { id: 'svc-a', name: 'Full Detail', is_taxable: true, classification: 'primary' },
    ];
    state.failTransactionItemsInsert = true;

    const res = await POST(req());
    // Non-fatal: the webhook must NOT 500 on an items-insert failure.
    expect(res.status).toBe(200);

    // The insert WAS attempted (captured before the simulated failure).
    expect(findItemsInsert()).toBeDefined();
    // Failure logged as non-fatal.
    expect(
      consoleErrors.some((e) => e.includes('transaction_items write failed'))
    ).toBe(true);
    // Execution continued past the items block: the appointment payment-update
    // (payment_link_paid_at) still ran — proves the throw was swallowed.
    const apptUpdate = capturedUpdates.find(
      (u) => u.table === 'appointments' && u.payload.payment_link_paid_at !== undefined
    );
    expect(apptUpdate).toBeDefined();
    expect(apptUpdate!.payload.payment_status).toBe('paid');
  });

  it('discount case: items at FULL price_at_booking while transactions.subtotal stays net (known-gap guard)', async () => {
    // Reem / SD-06444 shape: $435 service total, $65.25 manual discount applied
    // at POS → appt.total_amount = $369.75 (net). appointment_services rows
    // keep the FULL pre-discount price. The webhook writes items at full price
    // and leaves transactions.subtotal = appt.total_amount (net) — so the items
    // sum to MORE than the subtotal. This is the pre-existing discount-fidelity
    // gap (deferred to Option A Phase 3), identical to the booking-deposit
    // transaction's shape today. This test locks that intended behavior.
    state.event = payLinkEvent(36975); // $369.75 charged
    state.appointment = freshAppointment({ total_amount: 369.75 });
    state.appointmentServices = [
      { service_id: 'svc-a', price_at_booking: 435, tier_name: 'sedan' },
    ];
    state.serviceMeta = [
      { id: 'svc-a', name: 'Ceramic Coating', is_taxable: true, classification: 'primary' },
    ];

    const res = await POST(req());
    expect(res.status).toBe(200);

    const items = findItemsInsert();
    const itemsSum = items!.reduce((acc, i) => acc + Number(i.total_price), 0);
    expect(itemsSum).toBe(435); // FULL pre-discount price, NOT the net

    const tx = findTransactionInsert();
    expect(tx!.subtotal).toBe(369.75); // appt.total_amount (net) — Item 2 untouched
    expect(tx!.discount_amount).toBe(0); // discount_amount stays 0 on this branch
    // The documented gap: items sum (435) exceeds the net subtotal (369.75).
    expect(itemsSum).toBeGreaterThan(Number(tx!.subtotal));
  });
});
