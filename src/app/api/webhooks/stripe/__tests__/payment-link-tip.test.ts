/**
 * Item 2 (2026-06-20) — Stripe webhook tip extraction from PI metadata on
 * the `appointment_payment_link` branch.
 *
 * Tests the surgical extension that reads `pi.metadata.tip_cents`,
 * defaults to 0 when absent, caps at `amount_received` on corrupted
 * input, and writes `tip_amount` / `tip_net` to both the `transactions`
 * row (POS convention) and the `payments` row (with the 5% CC fee
 * deduction on tip_net for card method).
 *
 * Mirrors `payment-link-status-flip.test.ts`'s mock infrastructure
 * pattern — self-contained, distinguishes SELECT vs UPDATE vs INSERT,
 * captures all DB calls for assertion. The two test files share the
 * webhook `route.ts` POST handler but stay independent fixtures so
 * neither's beforeEach can interfere with the other.
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
}

interface CapturedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; value: unknown }>;
}

interface CapturedInsert {
  table: string;
  payload: Record<string, unknown>;
}

const state = {
  event: null as Record<string, unknown> | null,
  signatureValid: true,
  appointment: null as MockAppointment | null,
  existingPaymentForPi: null as { id: string } | null,
  existingTransactions: [] as Array<{ id: string }>,
  existingPaymentsForTransactions: [] as Array<{ amount: number }>,
};

const capturedUpdates: CapturedUpdate[] = [];
const capturedInserts: CapturedInsert[] = [];
const consoleWarns: string[] = [];

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

  const insertChain = (payload: Record<string, unknown>) => {
    capturedInserts.push({ table, payload });
    return {
      select: (_cols: string) => ({
        single: async () => ({ data: { id: `${table}-row-1` }, error: null }),
      }),
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        resolve({ data: null, error: null }),
    };
  };

  return {
    select: () => selectChain(),
    update: (payload: Record<string, unknown>) => updateChain(payload),
    insert: (payload: Record<string, unknown>) => insertChain(payload),
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

const PI_ID = 'pi_test_tip_1';
const APPT_ID = '22222222-2222-2222-2222-222222222222';

function payLinkEventWithTip(opts: {
  amountReceived: number;
  tipCents?: number | string | null;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    type: 'appointment_payment_link',
    appointment_id: APPT_ID,
    payment_link_token: 'tipped123',
  };
  if (opts.tipCents !== undefined && opts.tipCents !== null) {
    metadata.tip_cents = opts.tipCents;
  }
  return {
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: PI_ID,
        amount: opts.amountReceived,
        amount_received: opts.amountReceived,
        latest_charge: 'ch_test_1',
        metadata,
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
    status: 'confirmed', // skip the status-flip path; that's tested elsewhere
    ...overrides,
  };
}

function findTransactionInsert(): Record<string, unknown> | undefined {
  return capturedInserts.find((i) => i.table === 'transactions')?.payload;
}

function findPaymentInsert(): Record<string, unknown> | undefined {
  return capturedInserts.find((i) => i.table === 'payments')?.payload;
}

beforeEach(() => {
  state.event = null;
  state.signatureValid = true;
  state.appointment = null;
  state.existingPaymentForPi = null;
  state.existingTransactions = [];
  state.existingPaymentsForTransactions = [];
  capturedUpdates.length = 0;
  capturedInserts.length = 0;
  consoleWarns.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation((msg: string) => {
    consoleWarns.push(typeof msg === 'string' ? msg : String(msg));
  });
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('POST /api/webhooks/stripe — pay-link branch — Item 2 tip extraction', () => {
  it('no tip metadata: writes tip_amount=0 to transactions + payments (backwards compatible)', async () => {
    // $100 charge, no tip on the PI (old client, deposit branch, etc.)
    state.event = payLinkEventWithTip({ amountReceived: 10000 });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const tx = findTransactionInsert();
    expect(tx).toBeDefined();
    expect(tx!.tip_amount).toBe(0);
    expect(tx!.total_amount).toBe(100); // amountReceived
    expect(tx!.subtotal).toBe(100); // appt.total_amount

    const pay = findPaymentInsert();
    expect(pay).toBeDefined();
    expect(pay!.amount).toBe(100); // subtotal = full amount in no-tip case
    expect(pay!.tip_amount).toBe(0);
    expect(pay!.tip_net).toBe(0);
  });

  it('valid tip metadata: writes tip_amount + tip_net (5% CC fee) + payments.amount = subtotal only', async () => {
    // Customer pays $100 service + $20 tip = $120
    state.event = payLinkEventWithTip({
      amountReceived: 12000,
      tipCents: '2000', // Stripe metadata is string-only
    });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const tx = findTransactionInsert();
    expect(tx).toBeDefined();
    expect(tx!.tip_amount).toBe(20); // tip portion in dollars
    expect(tx!.total_amount).toBe(120); // what customer paid (incl tip)
    expect(tx!.subtotal).toBe(100); // appt.total_amount unchanged

    const pay = findPaymentInsert();
    expect(pay).toBeDefined();
    expect(pay!.amount).toBe(100); // subtotal — POS convention
    expect(pay!.tip_amount).toBe(20);
    // tip_net = 20 * (1 - 0.05) = 19.00 for card
    expect(pay!.tip_net).toBe(19);
  });

  it('tip exactly = amount_received: cap is a no-op (boundary)', async () => {
    // Pathological but legal: customer's "tip" equals the entire charge.
    // Sanity ceiling on intent route rejects this for full-pay flows; but
    // if a PI ever lands here with that shape, math must still work.
    state.event = payLinkEventWithTip({
      amountReceived: 10000,
      tipCents: '10000',
    });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const tx = findTransactionInsert();
    expect(tx!.tip_amount).toBe(100);
    expect(tx!.total_amount).toBe(100);
    // subtotal stays as appt.total_amount (separate field meaning)
    expect(tx!.subtotal).toBe(100);

    const pay = findPaymentInsert();
    expect(pay!.amount).toBe(0); // 100 - 100 = 0 subtotal portion
    expect(pay!.tip_amount).toBe(100);

    expect(consoleWarns.filter((w) => w.includes('tip_cents'))).toHaveLength(0);
  });

  it('tip > amount_received: capped to amount_received + console.warn (defensive)', async () => {
    // Corrupted metadata: tip_cents claims $200 but only $120 was actually
    // charged. We cap to the real amount_received to avoid writing negative
    // subtotal.
    state.event = payLinkEventWithTip({
      amountReceived: 12000,
      tipCents: '20000',
    });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const pay = findPaymentInsert();
    expect(pay!.tip_amount).toBe(120); // capped at amount_received
    expect(pay!.amount).toBe(0); // 120 - 120 (the floor)

    expect(consoleWarns.some((w) => w.includes('tip_cents') && w.includes('capping'))).toBe(true);
  });

  it('non-numeric tip metadata: defaults to 0', async () => {
    state.event = payLinkEventWithTip({
      amountReceived: 10000,
      tipCents: 'not-a-number',
    });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const tx = findTransactionInsert();
    expect(tx!.tip_amount).toBe(0);
    const pay = findPaymentInsert();
    expect(pay!.amount).toBe(100);
    expect(pay!.tip_amount).toBe(0);
  });

  it('negative tip metadata: defaults to 0 (defensive floor)', async () => {
    state.event = payLinkEventWithTip({
      amountReceived: 10000,
      tipCents: '-500',
    });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const tx = findTransactionInsert();
    expect(tx!.tip_amount).toBe(0);
  });

  it('fractional tip metadata: floored to integer cents', async () => {
    state.event = payLinkEventWithTip({
      amountReceived: 10000,
      tipCents: '1500.7',
    });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const tx = findTransactionInsert();
    expect(tx!.tip_amount).toBe(15); // 1500 cents = $15
  });

  it('payment_status math: full-pay with tip → "paid" (tip never counts toward outstanding)', async () => {
    // remaining=$100, customer pays $100 service + $20 tip. payment_status
    // MUST = 'paid'. Pre-Item-2 code compared `amount_received >= remaining`
    // which would also evaluate true here, but the new code's correctness
    // depends on `subtotal >= remaining` so the tip-aware path must agree.
    state.event = payLinkEventWithTip({
      amountReceived: 12000,
      tipCents: '2000',
    });
    state.appointment = freshAppointment({ total_amount: 100 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const apptUpdate = capturedUpdates.find(
      (u) => u.table === 'appointments' && u.payload.payment_link_paid_at !== undefined
    );
    expect(apptUpdate!.payload.payment_status).toBe('paid');
  });

  it('payment_status math: partial-pay + tip → "partial" (tip does not promote partial → paid)', async () => {
    // total=$200, customer pays $100 service + $20 tip = $120 PI amount.
    // payment_status must be 'partial', NOT 'paid' — the old amount-based
    // compare WOULD say 'partial' too ($120 < $200), but only because the
    // tip happened to fit under remaining. Defense against future
    // refactoring: assert against the subtotal-based math directly.
    state.event = payLinkEventWithTip({
      amountReceived: 12000,
      tipCents: '2000',
    });
    state.appointment = freshAppointment({ total_amount: 200 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const apptUpdate = capturedUpdates.find(
      (u) => u.table === 'appointments' && u.payload.payment_link_paid_at !== undefined
    );
    expect(apptUpdate!.payload.payment_status).toBe('partial');
  });

  it('regression: amount_received ($100) + tip ($20) on $80 appointment → "paid" even when amount > remaining', async () => {
    // The exact scenario the new math protects against. Pre-Item-2:
    // amount_received=$120 vs remaining=$80 → paid (right answer for the
    // wrong reason). Post-Item-2: subtotal=$100 vs remaining=$80 → paid
    // (right answer for the right reason). Same outcome here, but the
    // reasoning matters for the partial case above.
    state.event = payLinkEventWithTip({
      amountReceived: 12000,
      tipCents: '2000',
    });
    state.appointment = freshAppointment({ total_amount: 80 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const apptUpdate = capturedUpdates.find(
      (u) => u.table === 'appointments' && u.payload.payment_link_paid_at !== undefined
    );
    expect(apptUpdate!.payload.payment_status).toBe('paid');
  });
});
