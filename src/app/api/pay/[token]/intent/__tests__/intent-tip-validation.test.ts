/**
 * Item 2 (2026-06-20) — `/api/pay/[token]/intent` accepts an optional
 * `tipCents` in the POST body. Tests the validation chain that gates the
 * tip:
 *   1. Body shape (non-integer, negative, missing — defaults to 0)
 *   2. Full-payment gate: tip > 0 rejected on partial-payment links
 *   3. Sanity ceiling: tip ≤ chargeCents
 *   4. PI metadata: `tip_cents` stamped when > 0, omitted when 0
 *   5. PI amount: chargeCents + tipCents
 *   6. Response shape: returns clientSecret + amountCents + tipCents + totalCents
 *
 * Self-contained Stripe + Supabase mock. The PI creation is intercepted
 * to capture the create payload so we can assert tip-bearing fields
 * without a real Stripe round-trip.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------------
// Mock state
// -----------------------------------------------------------------------------

interface MockAppointment {
  id: string;
  status: string;
  total_amount: number;
  payment_status: string;
  payment_link_amount_cents: number | null;
}

const state = {
  appointment: null as MockAppointment | null,
  existingTransactions: [] as Array<{ id: string }>,
  existingPayments: [] as Array<{ amount: number }>,
};

let capturedPiCreate: Record<string, unknown> | null = null;

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

vi.mock('stripe', () => {
  function Stripe(this: unknown) {
    return {
      paymentIntents: {
        create: async (payload: Record<string, unknown>) => {
          capturedPiCreate = payload;
          return {
            id: 'pi_test_intent_1',
            client_secret: 'pi_test_intent_1_secret_xyz',
          };
        },
      },
    };
  }
  return { default: Stripe };
});

vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({ name: 'Test Co' }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildQuery(table),
  }),
}));

function buildQuery(table: string): unknown {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (_col: string, _value: unknown) => chain,
    in: (_col: string, _values: unknown[]) =>
      Promise.resolve(
        table === 'payments'
          ? { data: state.existingPayments, error: null }
          : { data: [], error: null }
      ),
    maybeSingle: async () => {
      if (table === 'appointments') {
        return state.appointment
          ? { data: state.appointment, error: null }
          : { data: null, error: null };
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
}

// Imported AFTER mocks
import { POST } from '../route';

const APPT_ID = '33333333-3333-3333-3333-333333333333';
const TOKEN = 'tipped123';

function freshAppointment(overrides: Partial<MockAppointment> = {}): MockAppointment {
  return {
    id: APPT_ID,
    status: 'confirmed',
    total_amount: 100,
    payment_status: 'pending',
    payment_link_amount_cents: null, // null = full-payment link
    ...overrides,
  };
}

function makeRequest(body: unknown | null): NextRequest {
  return new NextRequest(`http://localhost/api/pay/${TOKEN}/intent`, {
    method: 'POST',
    headers: body !== null ? { 'Content-Type': 'application/json' } : {},
    body: body !== null ? JSON.stringify(body) : null,
  });
}

async function callPost(body: unknown | null) {
  return POST(makeRequest(body), { params: Promise.resolve({ token: TOKEN }) });
}

beforeEach(() => {
  state.appointment = null;
  state.existingTransactions = [];
  state.existingPayments = [];
  capturedPiCreate = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('POST /api/pay/[token]/intent — Item 2 tipCents validation', () => {
  it('no body: tipCents defaults to 0 + PI created at chargeCents + no tip_cents in metadata', async () => {
    state.appointment = freshAppointment();

    const res = await callPost(null);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.amountCents).toBe(10000);
    expect(data.tipCents).toBe(0);
    expect(data.totalCents).toBe(10000);

    expect(capturedPiCreate).toBeDefined();
    expect(capturedPiCreate!.amount).toBe(10000);
    const metadata = capturedPiCreate!.metadata as Record<string, string>;
    expect(metadata.type).toBe('appointment_payment_link');
    expect(metadata.appointment_id).toBe(APPT_ID);
    expect(metadata.tip_cents).toBeUndefined(); // not stamped when 0
  });

  it('valid tipCents=2000 on full-payment link: PI amount=12000 + metadata.tip_cents="2000"', async () => {
    state.appointment = freshAppointment();

    const res = await callPost({ tipCents: 2000 });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.amountCents).toBe(10000);
    expect(data.tipCents).toBe(2000);
    expect(data.totalCents).toBe(12000);

    expect(capturedPiCreate!.amount).toBe(12000);
    const metadata = capturedPiCreate!.metadata as Record<string, string>;
    expect(metadata.tip_cents).toBe('2000');
  });

  it('tipCents=0 explicit: same as omitted — PI at chargeCents, metadata clean', async () => {
    state.appointment = freshAppointment();

    const res = await callPost({ tipCents: 0 });
    expect(res.status).toBe(200);

    expect(capturedPiCreate!.amount).toBe(10000);
    const metadata = capturedPiCreate!.metadata as Record<string, string>;
    expect(metadata.tip_cents).toBeUndefined();
  });

  it('non-integer tipCents: 422', async () => {
    state.appointment = freshAppointment();

    const res = await callPost({ tipCents: 1500.5 });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/integer/i);

    expect(capturedPiCreate).toBeNull(); // no PI created on validation fail
  });

  it('negative tipCents: 422', async () => {
    state.appointment = freshAppointment();

    const res = await callPost({ tipCents: -100 });
    expect(res.status).toBe(422);
    expect(capturedPiCreate).toBeNull();
  });

  it('non-number tipCents (string): 422', async () => {
    state.appointment = freshAppointment();

    const res = await callPost({ tipCents: '2000' });
    expect(res.status).toBe(422);
    expect(capturedPiCreate).toBeNull();
  });

  it('partial-payment link + tipCents > 0: 422 (full-payment gate)', async () => {
    // Operator sent a partial link ($50 of a $100 appointment); customer
    // somehow gets tipCents>0 to the server (client bypass / direct curl).
    // Server rejects.
    state.appointment = freshAppointment({
      payment_link_amount_cents: 5000, // $50 partial
    });

    const res = await callPost({ tipCents: 1000 });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/partial/i);

    expect(capturedPiCreate).toBeNull();
  });

  it('partial-payment link + tipCents=0: allowed (auto-mount flow)', async () => {
    state.appointment = freshAppointment({
      payment_link_amount_cents: 5000,
    });

    const res = await callPost({ tipCents: 0 });
    expect(res.status).toBe(200);

    expect(capturedPiCreate!.amount).toBe(5000); // charge = stored amount
  });

  it('partial-payment link + no body: allowed (legacy clients)', async () => {
    state.appointment = freshAppointment({
      payment_link_amount_cents: 5000,
    });

    const res = await callPost(null);
    expect(res.status).toBe(200);
    expect(capturedPiCreate!.amount).toBe(5000);
  });

  it('stored amount ≥ remaining (link became full-pay after issue): tip allowed', async () => {
    // Operator issued a $100 deposit link on a $100 appointment. The link
    // is structurally "partial" by amount_cents being set, but it covers
    // 100% of remaining — so it's effectively full-pay. The gate uses
    // `customAmountCents >= remainingCents` to recognize this and allow
    // the tip.
    state.appointment = freshAppointment({
      total_amount: 100,
      payment_link_amount_cents: 10000, // $100 link on $100 appt = full
    });

    const res = await callPost({ tipCents: 1500 });
    expect(res.status).toBe(200);
    expect(capturedPiCreate!.amount).toBe(11500);
  });

  it('tipCents > chargeCents (100% ceiling): 422', async () => {
    state.appointment = freshAppointment();

    // chargeCents = 10000; tip = 10001 → over the ceiling
    const res = await callPost({ tipCents: 10001 });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/exceed/i);

    expect(capturedPiCreate).toBeNull();
  });

  it('tipCents exactly = chargeCents: allowed (boundary)', async () => {
    state.appointment = freshAppointment();

    const res = await callPost({ tipCents: 10000 });
    expect(res.status).toBe(200);
    expect(capturedPiCreate!.amount).toBe(20000);
  });

  it('cancelled appointment: 409 regardless of tip', async () => {
    state.appointment = freshAppointment({ status: 'cancelled' });

    const res = await callPost({ tipCents: 1000 });
    expect(res.status).toBe(409);
    expect(capturedPiCreate).toBeNull();
  });

  it('already-paid (alreadyPaid: true) bypass: returns 200 with alreadyPaid before tip checks', async () => {
    // Appointment paid in full by other means; remaining = 0. The early
    // alreadyPaid branch fires before our new tip validation, so even a
    // misformed tip wouldn't reach a 422.
    state.appointment = freshAppointment({ total_amount: 100 });
    state.existingTransactions = [{ id: 'tx-1' }];
    state.existingPayments = [{ amount: 100 }]; // fully paid

    const res = await callPost({ tipCents: 9999 });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyPaid).toBe(true);
    expect(capturedPiCreate).toBeNull();
  });

  it('malformed JSON body: 400', async () => {
    state.appointment = freshAppointment();

    const badReq = new NextRequest(`http://localhost/api/pay/${TOKEN}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    const res = await POST(badReq, { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(400);
    expect(capturedPiCreate).toBeNull();
  });

  it('response shape: includes amountCents + tipCents + totalCents for client display sync', async () => {
    state.appointment = freshAppointment();

    const res = await callPost({ tipCents: 1500 });
    const data = await res.json();

    expect(data).toMatchObject({
      clientSecret: 'pi_test_intent_1_secret_xyz',
      amountCents: 10000,
      tipCents: 1500,
      totalCents: 11500,
      alreadyPaid: false,
    });
  });
});
