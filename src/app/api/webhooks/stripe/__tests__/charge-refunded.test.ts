/**
 * Phase 3 Theme D.3 (Phase 3.0.2 audit F.4) — Stripe webhook reconciles
 * `charge.refunded` events.
 *
 * Covers the new branch added to `src/app/api/webhooks/stripe/route.ts` that
 * closes the refund-event-listener loop. Pre-D.3, refunds initiated outside
 * the cancel-orchestration layer (manual Stripe dashboard refunds, refunds
 * via Stripe API directly, dispute-resolution refunds) left Smart Details DB
 * out-of-sync with Stripe's source-of-truth. This branch records the refund
 * in `refunds`, bumps source transaction status, and writes an audit row.
 *
 * Test design mirrors the sibling `payment-link-status-flip.test.ts`:
 * self-contained mock infrastructure, captured updates/inserts/audit calls,
 * per-test state reset. Distinct from `payment-intent-succeeded.test.ts`'s
 * mock to avoid cross-test pollution.
 *
 * NOTE — appointment.status is intentionally NEVER updated by this branch.
 * Refund alone is not a cancel signal; operators explicitly cancel via D.1's
 * orchestrator. Tests assert this guarantee.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------------
// Mock state
// -----------------------------------------------------------------------------

interface MockTransaction {
  id: string;
  appointment_id: string | null;
  customer_id: string | null;
  total_amount: number;
  tip_amount: number | null;
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
  sourceTransaction: null as MockTransaction | null,
  existingRefundIds: new Set<string>(),
  forceErrors: {
    transactionLookup: null as string | null,
    existingRefundLookup: null as string | null,
    refundInsert: null as string | null,
    transactionUpdate: null as string | null,
  },
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
  getBusinessInfo: async () => ({
    name: 'Test Co',
    phone: '555',
    email: 'a@b.c',
  }),
}));

vi.mock('@/lib/utils/format', () => ({
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
}));

vi.mock('@/lib/utils/stripe-card-details', () => ({
  extractCardDetailsFromCharge: async () => ({
    card_brand: null,
    card_last_four: null,
  }),
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(
    async (
      params: AuditCall & {
        entityType: string;
        entityId: string;
        entityLabel: string;
      }
    ) => {
      auditCalls.push({
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        entity_label: params.entityLabel ?? null,
        details: params.details ?? null,
        source: params.source,
      });
    }
  ),
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
      maybeSingle: async () => {
        if (table === 'transactions') {
          if (state.forceErrors.transactionLookup) {
            return {
              data: null,
              error: { message: state.forceErrors.transactionLookup },
            };
          }
          return { data: state.sourceTransaction, error: null };
        }
        if (table === 'refunds') {
          if (state.forceErrors.existingRefundLookup) {
            return {
              data: null,
              error: { message: state.forceErrors.existingRefundLookup },
            };
          }
          const stripeRefundFilter = filters.find(
            (f) => f.col === 'stripe_refund_id'
          );
          const refundId = stripeRefundFilter?.value as string | undefined;
          if (refundId && state.existingRefundIds.has(refundId)) {
            return { data: { id: `refunds-existing-${refundId}` }, error: null };
          }
          return { data: null, error: null };
        }
        if (table === 'appointments' || table === 'payments') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };

  const updateChain = (payload: Record<string, unknown>) => {
    const filters: Array<{ col: string; value: unknown }> = [];
    const chain: Record<string, unknown> = {
      eq: (col: string, value: unknown) => {
        filters.push({ col, value });
        chain.then = (
          resolve: (v: {
            data: null;
            error: null | { message: string };
          }) => unknown
        ) => {
          capturedUpdates.push({ table, payload, filters: [...filters] });
          if (state.forceErrors.transactionUpdate && table === 'transactions') {
            return resolve({
              data: null,
              error: { message: state.forceErrors.transactionUpdate },
            });
          }
          return resolve({ data: null, error: null });
        };
        return chain;
      },
    };
    return chain;
  };

  const insertChain = (payload: Record<string, unknown>) => {
    capturedInserts.push({ table, payload });
    if (state.forceErrors.refundInsert && table === 'refunds') {
      return {
        select: () => ({
          single: async () => ({
            data: null,
            error: { message: state.forceErrors.refundInsert },
          }),
        }),
        then: (
          resolve: (v: {
            data: null;
            error: { message: string };
          }) => unknown
        ) =>
          resolve({
            data: null,
            error: { message: state.forceErrors.refundInsert as string },
          }),
      };
    }
    return {
      select: () => ({
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

const PI_ID = 'pi_test_pay_link_1';
const CHARGE_ID = 'ch_test_1';
const REFUND_ID_1 = 're_test_refund_1';
const REFUND_ID_2 = 're_test_refund_2';
const TX_ID = 'tx-test-1';
const APPT_ID = '11111111-1111-1111-1111-111111111111';
const CUST_ID = 'cust-test-1';

function freshSourceTransaction(
  overrides: Partial<MockTransaction> = {}
): MockTransaction {
  return {
    id: TX_ID,
    appointment_id: APPT_ID,
    customer_id: CUST_ID,
    total_amount: 100, // $100 — 10_000 cents max refundable (no tip)
    tip_amount: 0,
    status: 'completed',
    ...overrides,
  };
}

function chargeRefundedEvent(
  refunds: Array<{ id: string; amount: number; reason?: string | null }>,
  cumulativeAmountRefundedCents: number,
  overrides: { payment_intent?: string | null } = {}
): Record<string, unknown> {
  return {
    type: 'charge.refunded',
    data: {
      object: {
        id: CHARGE_ID,
        payment_intent:
          overrides.payment_intent === undefined
            ? PI_ID
            : overrides.payment_intent,
        amount_refunded: cumulativeAmountRefundedCents,
        refunds: {
          data: refunds.map((r) => ({
            id: r.id,
            amount: r.amount,
            reason: r.reason ?? null,
          })),
        },
      },
    },
  };
}

beforeEach(() => {
  state.event = null;
  state.signatureValid = true;
  state.sourceTransaction = null;
  state.existingRefundIds = new Set<string>();
  state.forceErrors = {
    transactionLookup: null,
    existingRefundLookup: null,
    refundInsert: null,
    transactionUpdate: null,
  };
  capturedUpdates.length = 0;
  capturedInserts.length = 0;
  auditCalls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('POST /api/webhooks/stripe — charge.refunded — Theme D.3 (F.4)', () => {
  it('happy path: full refund on known PI → refunds row inserted + tx status flips to refunded + audit', async () => {
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 10_000, reason: 'requested_by_customer' }],
      10_000
    );
    state.sourceTransaction = freshSourceTransaction(); // $100, no tip → 10_000c max

    const res = await POST(req());
    expect(res.status).toBe(200);

    // refunds row inserted with the orchestrator-mirrored shape
    const refundInserts = capturedInserts.filter((i) => i.table === 'refunds');
    expect(refundInserts).toHaveLength(1);
    expect(refundInserts[0].payload).toMatchObject({
      transaction_id: TX_ID,
      status: 'processed',
      amount: 100, // dollars (fromCents(10_000))
      stripe_refund_id: REFUND_ID_1,
      processed_by: null, // webhook has no employee actor
      reason: 'requested_by_customer',
    });
    const notes = JSON.parse(refundInserts[0].payload.notes as string);
    expect(notes).toMatchObject({
      source: 'stripe_webhook_charge_refunded',
      charge_id: CHARGE_ID,
      refund_amount_cents: 10_000,
    });

    // tx status update: completed → refunded (full refund)
    const txUpdates = capturedUpdates.filter((u) => u.table === 'transactions');
    expect(txUpdates).toHaveLength(1);
    expect(txUpdates[0].payload).toMatchObject({ status: 'refunded' });
    expect(txUpdates[0].filters).toEqual(
      expect.arrayContaining([{ col: 'id', value: TX_ID }])
    );

    // Audit row distinguishable from cancel-orchestration's booking audit
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      action: 'refund',
      entity_type: 'transaction',
      entity_id: TX_ID,
      source: 'api',
      details: {
        trigger: 'stripe_webhook_charge_refunded',
        stripe_refund_id: REFUND_ID_1,
        stripe_charge_id: CHARGE_ID,
        stripe_payment_intent_id: PI_ID,
        refund_amount_cents: 10_000,
        cumulative_refunded_cents: 10_000,
        source_transaction_status: 'refunded',
        appointment_id: APPT_ID,
        customer_id: CUST_ID,
      },
    });

    // appointment.status NEVER updated — refund alone is not a cancel signal
    const apptUpdates = capturedUpdates.filter(
      (u) => u.table === 'appointments'
    );
    expect(apptUpdates).toHaveLength(0);
  });

  it('partial refund: refunds row inserted + tx status flips to partial_refund', async () => {
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 3_000 }],
      3_000
    );
    state.sourceTransaction = freshSourceTransaction(); // 10_000c max

    const res = await POST(req());
    expect(res.status).toBe(200);

    const txUpdates = capturedUpdates.filter((u) => u.table === 'transactions');
    expect(txUpdates).toHaveLength(1);
    expect(txUpdates[0].payload).toMatchObject({ status: 'partial_refund' });

    expect(auditCalls[0].details).toMatchObject({
      source_transaction_status: 'partial_refund',
      refund_amount_cents: 3_000,
      cumulative_refunded_cents: 3_000,
    });
  });

  it('unknown PI: log + skip → 200, no inserts, no audit', async () => {
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 5_000 }],
      5_000
    );
    state.sourceTransaction = null; // lookup returns null

    const res = await POST(req());
    expect(res.status).toBe(200);

    expect(capturedInserts.filter((i) => i.table === 'refunds')).toHaveLength(
      0
    );
    expect(capturedUpdates.filter((u) => u.table === 'transactions')).toHaveLength(
      0
    );
    expect(auditCalls).toHaveLength(0);
  });

  it('idempotency: refund already recorded → skip insert + skip status update + skip audit', async () => {
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 10_000 }],
      10_000
    );
    state.sourceTransaction = freshSourceTransaction();
    state.existingRefundIds.add(REFUND_ID_1); // D.1 already recorded this one

    const res = await POST(req());
    expect(res.status).toBe(200);

    expect(capturedInserts.filter((i) => i.table === 'refunds')).toHaveLength(
      0
    );
    // No tx status flip because the refund was previously handled
    expect(capturedUpdates.filter((u) => u.table === 'transactions')).toHaveLength(
      0
    );
    expect(auditCalls).toHaveLength(0);
  });

  it('multi-refund event with mixed idempotency: only the new refund is recorded', async () => {
    // Charge has two refunds — older one was recorded by D.1's orchestrator,
    // newer one is from a Stripe-dashboard partial refund issued later. Only
    // the newer one needs a refunds row + audit.
    state.event = chargeRefundedEvent(
      [
        { id: REFUND_ID_2, amount: 2_000 },
        { id: REFUND_ID_1, amount: 5_000 }, // already recorded
      ],
      7_000
    );
    state.sourceTransaction = freshSourceTransaction({
      status: 'partial_refund',
    });
    state.existingRefundIds.add(REFUND_ID_1);

    const res = await POST(req());
    expect(res.status).toBe(200);

    const refundInserts = capturedInserts.filter((i) => i.table === 'refunds');
    expect(refundInserts).toHaveLength(1);
    expect(refundInserts[0].payload.stripe_refund_id).toBe(REFUND_ID_2);
    expect(refundInserts[0].payload.amount).toBe(20); // fromCents(2000)

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].details).toMatchObject({
      stripe_refund_id: REFUND_ID_2,
      refund_amount_cents: 2_000,
      cumulative_refunded_cents: 7_000,
    });
  });

  it('multi-refund event hits full-refund threshold: tx flips to refunded', async () => {
    // First refund $30 → partial; second refund $70 → cumulative $100 = full.
    // Cumulative_refunded_cents on the Charge is what drives the status flip.
    state.event = chargeRefundedEvent(
      [
        { id: REFUND_ID_2, amount: 7_000 },
        { id: REFUND_ID_1, amount: 3_000 }, // earlier; already recorded
      ],
      10_000
    );
    state.sourceTransaction = freshSourceTransaction({
      status: 'partial_refund',
    });
    state.existingRefundIds.add(REFUND_ID_1);

    const res = await POST(req());
    expect(res.status).toBe(200);

    const txUpdates = capturedUpdates.filter((u) => u.table === 'transactions');
    expect(txUpdates).toHaveLength(1);
    expect(txUpdates[0].payload).toMatchObject({ status: 'refunded' });
  });

  it('source tx already at target status: status update is skipped (no-op optimization)', async () => {
    // Refund recorded against a tx already at `refunded` — the inserted
    // refunds row is the audit trail; no redundant UPDATE.
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 10_000 }],
      10_000
    );
    state.sourceTransaction = freshSourceTransaction({ status: 'refunded' });

    const res = await POST(req());
    expect(res.status).toBe(200);

    expect(capturedInserts.filter((i) => i.table === 'refunds')).toHaveLength(
      1
    );
    expect(
      capturedUpdates.filter((u) => u.table === 'transactions')
    ).toHaveLength(0);
    expect(auditCalls).toHaveLength(1);
  });

  it('empty refunds array: log + skip → 200, no side effects', async () => {
    state.event = chargeRefundedEvent([], 0);
    state.sourceTransaction = freshSourceTransaction();

    const res = await POST(req());
    expect(res.status).toBe(200);

    expect(capturedInserts).toHaveLength(0);
    expect(capturedUpdates).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('missing payment_intent on Charge: log + skip → 200, no side effects', async () => {
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 5_000 }],
      5_000,
      { payment_intent: null }
    );
    state.sourceTransaction = freshSourceTransaction();

    const res = await POST(req());
    expect(res.status).toBe(200);

    expect(capturedInserts).toHaveLength(0);
    expect(capturedUpdates).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('signature verification preserved: invalid signature → 400 + zero side effects (regression lock)', async () => {
    state.signatureValid = false;
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 10_000 }],
      10_000
    );
    state.sourceTransaction = freshSourceTransaction();

    const res = await POST(req());
    expect(res.status).toBe(400);

    expect(capturedInserts).toHaveLength(0);
    expect(capturedUpdates).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('refund insert failure: throws → 500 → Stripe retries (loud reconciliation failure)', async () => {
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 10_000 }],
      10_000
    );
    state.sourceTransaction = freshSourceTransaction();
    state.forceErrors.refundInsert = 'simulated_db_failure';

    await expect(POST(req())).rejects.toThrow(/refunds insert failed/);

    // Audit NOT written because insertion failed before the audit call
    expect(auditCalls).toHaveLength(0);
  });

  it('NO fireWebhook call (Theme G regression lock): inserts contain no webhook surface', async () => {
    state.event = chargeRefundedEvent(
      [{ id: REFUND_ID_1, amount: 5_000 }],
      5_000
    );
    state.sourceTransaction = freshSourceTransaction();

    await POST(req());

    // The handler module never imports fireWebhook (verified in source); this
    // test additionally asserts the audit + DB shape doesn't carry any
    // n8n/webhook fields that would suggest a re-introduction.
    expect(auditCalls[0].details).not.toHaveProperty('n8n_webhook_url');
    expect(auditCalls[0].details).not.toHaveProperty('webhook_fired');
  });
});
