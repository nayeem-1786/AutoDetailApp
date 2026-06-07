/**
 * Phase 3 Theme B.1 (AC-11) — Stripe webhook flips appointments.status from
 * pending → confirmed when a payment-link payment_intent.succeeded arrives.
 *
 * Tests the surgical extension of the existing `appointment_payment_link`
 * metadata sub-branch in `src/app/api/webhooks/stripe/route.ts`. The branch
 * was previously untested (per Phase 3.0.2 audit `10421f23` Target A.6) and
 * carries the 60+ lines of multi-table-write logic that this status-flip
 * extends. These tests cover the new flip behavior + regression-lock the
 * full branch's existing payment-write semantics.
 *
 * Design notes:
 * - Self-contained mock infrastructure (no shared with the existing
 *   `payment-intent-succeeded.test.ts` — that file's `buildQuery` is tightly
 *   scoped to the e-commerce order branch).
 * - The `appointments` table query patterns differ between SELECT (lookup +
 *   dedupe-fetch shape) and the two distinct UPDATEs (payment fields with
 *   `.eq('id')`, status with `.eq('id').eq('status', 'pending')` for race
 *   protection). The mock distinguishes by capturing the full `.eq()` chain.
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

interface AuditCall {
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  source: string;
}

const state = {
  event: null as Record<string, unknown> | null,
  signatureValid: true,
  appointment: null as MockAppointment | null,
  existingPaymentForPi: null as { id: string } | null,
  existingTransactions: [] as Array<{ id: string }>,
  existingPaymentsForTransactions: [] as Array<{ amount: number }>,
  // Force errors at specific call sites for negative tests
  forceErrors: {
    apptLookup: null as string | null,
    paymentDedupeLookup: null as string | null,
    statusFlipUpdate: null as string | null,
  },
  // Snapshot the appointment.status flag after the SELECT — used to assert
  // race protection: a concurrent operator confirms the appointment between
  // the SELECT and the status-flip UPDATE.
  injectRaceConcurrentConfirm: false,
};

const capturedUpdates: CapturedUpdate[] = [];
const capturedInserts: CapturedInsert[] = [];
const auditCalls: AuditCall[] = [];

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
  logAudit: vi.fn(async (params: AuditCall & { entityType: string; entityId: string; entityLabel: string }) => {
    auditCalls.push({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      entity_label: params.entityLabel ?? null,
      details: params.details ?? null,
      source: params.source,
    });
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildQuery(table),
  }),
}));

function buildQuery(table: string): unknown {
  // SELECT chain — captures up to 2 .eq() filters then resolves at maybeSingle/single
  const selectChain = () => {
    const filters: Array<{ col: string; value: unknown }> = [];
    const chain: Record<string, unknown> = {
      eq: (col: string, value: unknown) => {
        filters.push({ col, value });
        return chain;
      },
      in: (_col: string, _values: unknown[]) => {
        // payments.select('amount').in('transaction_id', txIds) shape
        return Promise.resolve(
          table === 'payments'
            ? { data: state.existingPaymentsForTransactions, error: null }
            : { data: [], error: null }
        );
      },
      single: async () => {
        if (table === 'appointments') {
          if (state.forceErrors.apptLookup) {
            return { data: null, error: { message: state.forceErrors.apptLookup } };
          }
          return state.appointment
            ? { data: state.appointment, error: null }
            : { data: null, error: null };
        }
        if (table === 'transactions') {
          // transactions.insert(...).select('id').single()
          return { data: { id: 'tx-test-1' }, error: null };
        }
        if (table === 'business_settings') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'appointments') {
          if (state.forceErrors.apptLookup) {
            return { data: null, error: { message: state.forceErrors.apptLookup } };
          }
          return state.appointment
            ? { data: state.appointment, error: null }
            : { data: null, error: null };
        }
        if (table === 'payments') {
          if (state.forceErrors.paymentDedupeLookup) {
            return { data: null, error: { message: state.forceErrors.paymentDedupeLookup } };
          }
          return { data: state.existingPaymentForPi, error: null };
        }
        return { data: null, error: null };
      },
      // For transactions.select('id').eq('appointment_id', ...) — resolves as
      // array via thenable when awaited.
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (table === 'transactions') {
          return resolve({ data: state.existingTransactions, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return chain;
  };

  // UPDATE chain — captures filters + payload
  const updateChain = (payload: Record<string, unknown>) => {
    const filters: Array<{ col: string; value: unknown }> = [];
    const chain: Record<string, unknown> = {
      eq: (col: string, value: unknown) => {
        filters.push({ col, value });
        // Resolve as awaitable on terminal call; the route awaits the
        // update().eq(...).eq(...) chain directly.
        chain.then = (resolve: (v: { data: null; error: null | { message: string } }) => unknown) => {
          capturedUpdates.push({ table, payload, filters: [...filters] });
          // Race-protection: status-flip UPDATE with .eq('status', 'pending')
          // when injectRaceConcurrentConfirm is set returns 0-row no-op via
          // null data + null error (Supabase semantics — UPDATE with no match).
          if (
            state.injectRaceConcurrentConfirm &&
            table === 'appointments' &&
            payload.status === 'confirmed' &&
            filters.some((f) => f.col === 'status' && f.value === 'pending')
          ) {
            return resolve({ data: null, error: null });
          }
          if (
            state.forceErrors.statusFlipUpdate &&
            table === 'appointments' &&
            payload.status === 'confirmed'
          ) {
            return resolve({ data: null, error: { message: state.forceErrors.statusFlipUpdate } });
          }
          return resolve({ data: null, error: null });
        };
        return chain;
      },
    };
    return chain;
  };

  // INSERT chain — captures payload, supports both .select().single() and plain await
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

function req(
  headers: Record<string, string> = { 'stripe-signature': 'sig_ok' }
): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

const PI_ID = 'pi_test_payment_link_1';
const APPT_ID = '11111111-1111-1111-1111-111111111111';

function payLinkEvent(): Record<string, unknown> {
  return {
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: PI_ID,
        amount: 5000,
        amount_received: 5000,
        latest_charge: 'ch_test_1',
        metadata: {
          type: 'appointment_payment_link',
          appointment_id: APPT_ID,
          payment_link_token: 'abc123',
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
    status: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  state.event = null;
  state.signatureValid = true;
  state.appointment = null;
  state.existingPaymentForPi = null;
  state.existingTransactions = [];
  state.existingPaymentsForTransactions = [];
  state.forceErrors = { apptLookup: null, paymentDedupeLookup: null, statusFlipUpdate: null };
  state.injectRaceConcurrentConfirm = false;
  capturedUpdates.length = 0;
  capturedInserts.length = 0;
  auditCalls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('POST /api/webhooks/stripe — pay-link branch — AC-11 status flip', () => {
  it('happy path: pending appointment → status flips to confirmed + audit + outbound webhook fire', async () => {
    state.event = payLinkEvent();
    state.appointment = freshAppointment({ status: 'pending', total_amount: 50 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    // Status flip UPDATE captured with race-protection filter
    const statusFlipUpdates = capturedUpdates.filter(
      (u) =>
        u.table === 'appointments' &&
        u.payload.status === 'confirmed'
    );
    expect(statusFlipUpdates).toHaveLength(1);
    expect(statusFlipUpdates[0].filters).toEqual(
      expect.arrayContaining([
        { col: 'id', value: APPT_ID },
        { col: 'status', value: 'pending' },
      ])
    );

    // Audit log entry
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      action: 'update',
      entity_type: 'booking',
      entity_id: APPT_ID,
      source: 'api',
      details: {
        trigger: 'webhook_payment_link',
        stripe_payment_intent_id: PI_ID,
        previous_status: 'pending',
        new_status: 'confirmed',
      },
    });

    // Theme G removed the outbound `appointment_confirmed` n8n webhook fire
    // from the B.1 status-flip block; the audit_log assertion above is now
    // the full side-effect contract.
  });

  it('already-confirmed appointment: status NOT re-flipped + no audit + no outbound webhook', async () => {
    state.event = payLinkEvent();
    // total_amount = 50 with $50 payment → newPaymentStatus = 'paid' so we can
    // assert the full-payment-write path on a pre-confirmed appointment.
    state.appointment = freshAppointment({ status: 'confirmed', total_amount: 50 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    // No status-flip UPDATE
    const statusFlipUpdates = capturedUpdates.filter(
      (u) =>
        u.table === 'appointments' &&
        u.payload.status === 'confirmed'
    );
    expect(statusFlipUpdates).toHaveLength(0);

    // Payment fields still written (existing branch behavior preserved)
    const paymentFieldUpdate = capturedUpdates.find(
      (u) =>
        u.table === 'appointments' &&
        u.payload.payment_link_paid_at !== undefined
    );
    expect(paymentFieldUpdate).toBeDefined();
    expect(paymentFieldUpdate?.payload.payment_status).toBe('paid');

    expect(auditCalls).toHaveLength(0);
  });

  it.each(['cancelled', 'no_show', 'completed', 'in_progress'] as const)(
    'non-pending status (%s): no flip + payment fields still written',
    async (status) => {
      state.event = payLinkEvent();
      state.appointment = freshAppointment({ status });

      const res = await POST(req());
      expect(res.status).toBe(200);

      const statusFlipUpdates = capturedUpdates.filter(
        (u) =>
          u.table === 'appointments' &&
          u.payload.status === 'confirmed'
      );
      expect(statusFlipUpdates).toHaveLength(0);

      // Payment-fields UPDATE still happens — pay-link branch preserves its
      // existing semantic regardless of status.
      const paymentFieldUpdate = capturedUpdates.find(
        (u) =>
          u.table === 'appointments' &&
          u.payload.payment_link_paid_at !== undefined
      );
      expect(paymentFieldUpdate).toBeDefined();

      expect(auditCalls).toHaveLength(0);
    }
  );

  it('idempotency: webhook fires twice for same PI — second event short-circuits, status flip + audit + webhook fire exactly once', async () => {
    state.event = payLinkEvent();
    state.appointment = freshAppointment({ status: 'pending' });

    // First firing — full processing
    await POST(req());

    expect(
      capturedUpdates.filter(
        (u) => u.table === 'appointments' && u.payload.status === 'confirmed'
      )
    ).toHaveLength(1);
    expect(auditCalls).toHaveLength(1);

    // Simulate retry: payments dedup lookup returns the prior insert
    state.existingPaymentForPi = { id: 'payments-row-1' };

    const res2 = await POST(req());
    expect(res2.status).toBe(200);

    // No additional status-flip / audit / webhook side effects on retry
    expect(
      capturedUpdates.filter(
        (u) => u.table === 'appointments' && u.payload.status === 'confirmed'
      )
    ).toHaveLength(1);
    expect(auditCalls).toHaveLength(1);

    // No second transaction or payment insert
    expect(capturedInserts.filter((i) => i.table === 'transactions')).toHaveLength(1);
    expect(capturedInserts.filter((i) => i.table === 'payments')).toHaveLength(1);
  });

  it('race protection: operator concurrently confirms appointment between SELECT and status-flip UPDATE — UPDATE no-ops gracefully', async () => {
    state.event = payLinkEvent();
    // SELECT returns status='pending' but UPDATE will return 0 rows because
    // the row's actual status is now 'confirmed' (concurrent operator flip).
    state.appointment = freshAppointment({ status: 'pending' });
    state.injectRaceConcurrentConfirm = true;

    const res = await POST(req());
    expect(res.status).toBe(200);

    // The flip-attempt UPDATE WAS issued with the race-protection filter.
    const statusFlipAttempts = capturedUpdates.filter(
      (u) =>
        u.table === 'appointments' &&
        u.payload.status === 'confirmed' &&
        u.filters.some((f) => f.col === 'status' && f.value === 'pending')
    );
    expect(statusFlipAttempts).toHaveLength(1);

    // Audit + outbound webhook still fire — the SELECTed status was pending,
    // so the handler treats this as a flip event. The race-protection filter
    // prevents DB corruption, but a stale audit/webhook record is acceptable
    // (the actual final state is `confirmed` either way — no orphan state).
    // This is intentional: we'd rather log a benign double-confirmation event
    // than miss a real flip.
    expect(auditCalls).toHaveLength(1);
  });

  it('missing appointment_id in metadata: branch skipped entirely, no DB writes, returns 200', async () => {
    state.event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: PI_ID,
          amount: 5000,
          amount_received: 5000,
          latest_charge: 'ch_test_1',
          metadata: {
            type: 'appointment_payment_link',
            // appointment_id missing
          },
        },
      },
    };

    const res = await POST(req());
    expect(res.status).toBe(200);

    expect(capturedUpdates).toHaveLength(0);
    expect(capturedInserts).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('appointment not found: throws → 500 → Stripe retries; no side effects', async () => {
    state.event = payLinkEvent();
    state.appointment = null;

    await expect(POST(req())).rejects.toThrow();

    expect(
      capturedUpdates.filter((u) => u.table === 'appointments')
    ).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('non-pay-link metadata: e-commerce order PI path unaffected by pay-link extension', async () => {
    // payment_intent.succeeded with metadata.order_id (NOT pay-link)
    // The order branch is preserved by the early-return at `if (!orderId)`.
    // No pay-link writes should be captured.
    state.event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_order_1',
          amount: 5000,
          latest_charge: 'ch_order_1',
          metadata: { order_id: 'order-test-1' },
        },
      },
    };

    const res = await POST(req());
    // Order lookup returns null → 200 fallthrough; key assertion is that
    // the pay-link extension did NOT fire on a non-pay-link PI.
    expect(res.status).toBe(200);

    expect(
      capturedUpdates.filter((u) => u.table === 'appointments')
    ).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('status-flip UPDATE returns DB error: throws → 500 → Stripe retries', async () => {
    state.event = payLinkEvent();
    state.appointment = freshAppointment({ status: 'pending' });
    state.forceErrors.statusFlipUpdate = 'simulated_db_failure';

    await expect(POST(req())).rejects.toThrow(/appointment status flip failed/);

    // Audit + webhook should NOT have fired because the throw happens
    // BEFORE those calls.
    expect(auditCalls).toHaveLength(0);
  });

  it('signature verification preserved: invalid signature returns 400 + zero DB writes (regression lock)', async () => {
    state.signatureValid = false;
    state.event = payLinkEvent();
    state.appointment = freshAppointment({ status: 'pending' });

    const res = await POST(req());
    expect(res.status).toBe(400);

    expect(capturedUpdates).toHaveLength(0);
    expect(capturedInserts).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('partial-payment (deposit not full): still flips status to confirmed per AC-11 commitment', async () => {
    // The lifecycle architecture (AC-11) locks `confirmed = deposit OR full
    // payment received`. So a partial payment (newPaymentStatus='partial')
    // MUST still trigger the flip — this is the operator-locked semantic.
    state.event = payLinkEvent();
    // total_amount=200, payment=50 → newPaymentStatus='partial'
    state.appointment = freshAppointment({ status: 'pending', total_amount: 200 });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const paymentFieldUpdate = capturedUpdates.find(
      (u) =>
        u.table === 'appointments' &&
        u.payload.payment_link_paid_at !== undefined
    );
    expect(paymentFieldUpdate?.payload.payment_status).toBe('partial');

    // Status flip STILL fires on partial payment
    const statusFlipUpdates = capturedUpdates.filter(
      (u) =>
        u.table === 'appointments' &&
        u.payload.status === 'confirmed'
    );
    expect(statusFlipUpdates).toHaveLength(1);
    expect(auditCalls).toHaveLength(1);
  });

  // Theme G removed the outbound `appointment_confirmed` webhook fire from the
  // B.1 status-flip block (no n8n receiver wired in Smart Details; audit
  // f5e714a8). The pre-Theme-G test "outbound webhook failure does NOT block
  // the 200 response (fire-and-forget)" is deleted alongside the production
  // path it guarded — no webhook fire means no fire-failure path to test.
});
