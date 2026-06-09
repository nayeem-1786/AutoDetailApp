/**
 * Phase 3 Theme D.1 (AC-9 foundation) — cancel orchestration tests.
 *
 * Covers:
 *   - Pathway A (refund): happy path, with fee, fee>=paid, no Stripe-PI,
 *     no payment at all, Stripe-fail, refunds-insert-fail (partial state).
 *   - Pathway B (credit): happy path, no payment, credit creation failure
 *     (partial state).
 *   - Job cascade: non-terminal job → marked cancelled; terminal job → no-op;
 *     no job → no-op.
 *   - Appointment guards: not found, already cancelled, terminal status.
 *   - Audit log: written with canonical details on every successful cancel.
 *   - Notifications: fired only when notifyCustomer=true; never via webhook.
 *
 * Mock approach: self-contained stateful supabase + stripe injection. Mirrors
 * the pattern used by `lifecycle-sync.test.ts` (audit-mock injection at the
 * module boundary + Supabase chain mock with op capture).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelAppointmentOrchestrated,
  __setStripeForTesting,
  type CancelOrchestrationInput,
} from '../cancel-orchestration';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Audit log capture — fire-and-forget; we just record calls.
const auditCalls: Array<Record<string, unknown>> = [];
vi.mock('@/lib/services/audit', () => ({
  logAudit: async (entry: Record<string, unknown>) => {
    auditCalls.push(entry);
  },
}));

// Cancellation notifications — capture invocations, never actually send.
const notificationCalls: Array<{ appointmentId: string; reason?: string }> = [];
vi.mock('@/lib/email/send-cancellation-email', () => ({
  sendCancellationNotifications: async (appointmentId: string, reason?: string) => {
    notificationCalls.push({ appointmentId, reason });
    return { emailSent: true, smsSent: true, usedTemplate: true };
  },
}));

// Credit repository — capture createCustomerCredit calls + return a fake row.
const creditCalls: Array<Record<string, unknown>> = [];
let creditCreateShouldThrow: string | null = null;
vi.mock('@/lib/credits/repository', () => ({
  createCustomerCredit: async (
    _client: unknown,
    input: Record<string, unknown>
  ) => {
    creditCalls.push(input);
    if (creditCreateShouldThrow) {
      throw new Error(creditCreateShouldThrow);
    }
    return {
      id: 'credit-id-1',
      customer_id: input.customer_id,
      amount_cents: input.amount_cents,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      source_appointment_id: input.source_appointment_id ?? null,
      source_transaction_id: null,
      applied_at: null,
      applied_to_appointment_id: null,
      applied_to_transaction_id: null,
      applied_amount_cents: null,
      expires_at: null,
      created_at: new Date().toISOString(),
      created_by_employee_id: input.created_by_employee_id ?? null,
      updated_at: new Date().toISOString(),
    };
  },
}));

// ---------------------------------------------------------------------------
// State + Supabase mock builder
// ---------------------------------------------------------------------------

// Session #147 (Commit C): mirrors the orchestrator's TxRow shape.
// `stripe_payment_intent_id` is intentionally absent from the top level —
// it does NOT exist on the `transactions` schema. The per-charge PI lives
// on each child `payments` row (`method === 'card'` carries the card PI).
interface TxRow {
  id: string;
  status: string;
  total_amount: number;
  tip_amount: number | null;
  created_at: string;
  payments: Array<{ amount: number; method: string | null; stripe_payment_intent_id: string | null }> | null;
}
interface JobRow {
  id: string;
  status: string;
}
interface ApptRow {
  id: string;
  status: string;
  customer_id: string;
  total_amount: number;
  transactions: TxRow[];
  jobs: JobRow[];
}

const state = {
  appointment: null as ApptRow | null,
  // Session #147 (Commit A — Bug 2 Layer 1): force a PostgREST-style error on
  // the initial appointment SELECT. Pre-#147 the orchestrator silently
  // swallowed this error and returned 404 "not found"; post-#147 it returns
  // 500 with the underlying message. When non-null, the appointment lookup
  // returns `{data: null, error: this}` regardless of `state.appointment`.
  apptLookupError: null as null | { message: string },
  apptUpdateError: null as null | { message: string },
  jobUpdateError: null as null | { message: string },
  refundInsertError: null as null | { message: string },
  txUpdateError: null as null | { message: string },
  // Phase 3 Theme D.2 (AC-14): business_settings.cancellation_fee_default_cents
  // row stub. `undefined` → row missing (helper returns 0). `null` value →
  // explicit-null in DB (helper returns 0). Any number/string → value used by
  // helper after coercion.
  cancellationFeeSetting: undefined as unknown,
  businessSettingsReadError: null as null | { message: string },
  // Captures
  apptUpdates: [] as Record<string, unknown>[],
  jobUpdates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  refundInserts: [] as Record<string, unknown>[],
  txStatusUpdates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
};

function makeAdmin(): SupabaseClient {
  return {
    from(table: string) {
      // Builder with table-aware select/update/insert/eq/maybeSingle/single.
      const b: {
        _table: string;
        _op: 'select' | 'update' | 'insert' | null;
        _payload: Record<string, unknown> | null;
        _eqId: string | null;
        select: (cols?: string) => typeof b;
        update: (payload: Record<string, unknown>) => typeof b;
        insert: (payload: Record<string, unknown>) => typeof b;
        eq: (col: string, value: unknown) => typeof b;
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
        single: () => Promise<{ data: unknown; error: { message: string } | null }>;
        then: (
          onF: (v: { error: { message: string } | null }) => unknown,
          onR?: (e: unknown) => unknown
        ) => Promise<unknown>;
      } = {
        _table: table,
        _op: null,
        _payload: null,
        _eqId: null,
        select() {
          if (!this._op) this._op = 'select';
          return this;
        },
        update(payload: Record<string, unknown>) {
          this._op = 'update';
          this._payload = payload;
          return this;
        },
        insert(payload: Record<string, unknown>) {
          this._op = 'insert';
          this._payload = payload;
          return this;
        },
        eq(col: string, value: unknown) {
          if (col === 'id') this._eqId = value as string;
          return this;
        },
        async maybeSingle() {
          if (this._table === 'appointments' && this._op === 'select') {
            // Session #147 (Commit A — Bug 2 Layer 1): when the lookup-error
            // knob is set, return the PostgREST-style error so the
            // orchestrator's new diagnostic path can be exercised.
            if (state.apptLookupError) {
              return { data: null, error: state.apptLookupError };
            }
            return { data: state.appointment, error: null };
          }
          // Phase 3 Theme D.2 (AC-14): business_settings.value read for the
          // default-cancellation-fee helper. The helper only ever looks up the
          // `cancellation_fee_default_cents` key, so a single sticky stub
          // suffices. `cancellationFeeSetting === undefined` → row missing
          // (returns data:null). Any other value (number / string / null) →
          // returns it as the `value` column.
          if (this._table === 'business_settings' && this._op === 'select') {
            if (state.businessSettingsReadError) {
              return { data: null, error: state.businessSettingsReadError };
            }
            if (state.cancellationFeeSetting === undefined) {
              return { data: null, error: null };
            }
            return {
              data: { value: state.cancellationFeeSetting },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        async single() {
          if (this._table === 'appointments' && this._op === 'select') {
            return state.appointment
              ? { data: state.appointment, error: null }
              : { data: null, error: { message: 'not found' } };
          }
          if (this._table === 'refunds' && this._op === 'insert') {
            if (state.refundInsertError) {
              state.refundInserts.push(this._payload as Record<string, unknown>);
              return { data: null, error: state.refundInsertError };
            }
            state.refundInserts.push(this._payload as Record<string, unknown>);
            return { data: { id: `refund-${state.refundInserts.length}` }, error: null };
          }
          return { data: null, error: null };
        },
        // PromiseLike for UPDATE-then-await without .single()
        then(onF, onR) {
          return (async () => {
            if (this._op === 'update' && this._payload) {
              if (this._table === 'appointments') {
                state.apptUpdates.push(this._payload);
                if (state.apptUpdateError) {
                  return { error: state.apptUpdateError };
                }
              }
              if (this._table === 'jobs') {
                state.jobUpdates.push({
                  id: this._eqId ?? '?',
                  payload: this._payload,
                });
                if (state.jobUpdateError) {
                  return { error: state.jobUpdateError };
                }
              }
              if (this._table === 'transactions') {
                state.txStatusUpdates.push({
                  id: this._eqId ?? '?',
                  payload: this._payload,
                });
                if (state.txUpdateError) {
                  return { error: state.txUpdateError };
                }
              }
            }
            return { error: null };
          })().then(onF, onR);
        },
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Stripe mock
// ---------------------------------------------------------------------------

const stripeCalls: Array<{ payment_intent: string; amount: number; metadata?: Record<string, string> }> = [];
let stripeRefundIdCounter = 0;
let stripeShouldThrow: string | null = null;
function makeStripe() {
  return {
    refunds: {
      create: async (args: {
        payment_intent: string;
        amount: number;
        metadata?: Record<string, string>;
      }) => {
        stripeCalls.push({
          payment_intent: args.payment_intent,
          amount: args.amount,
          metadata: args.metadata,
        });
        if (stripeShouldThrow) {
          throw new Error(stripeShouldThrow);
        }
        return { id: `re_test_${++stripeRefundIdCounter}` };
      },
    },
  } as unknown as Parameters<typeof __setStripeForTesting>[0];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseInput(
  overrides: Partial<CancelOrchestrationInput> = {}
): CancelOrchestrationInput {
  return {
    appointmentId: 'appt-1',
    pathway: 'refund',
    reason: 'customer requested',
    cancellation_fee_cents: null,
    notifyCustomer: true,
    cancelledBy: 'staff_admin',
    actor: {
      userId: 'auth-1',
      userEmail: 'staff@example.com',
      employeeName: 'Jane Staff',
      employeeId: 'emp-1',
    },
    ipAddress: '10.0.0.1',
    ...overrides,
  };
}

function seedAppointment(overrides: Partial<ApptRow> = {}): void {
  state.appointment = {
    id: 'appt-1',
    status: 'confirmed',
    customer_id: 'cust-1',
    total_amount: 100,
    transactions: [],
    jobs: [],
    ...overrides,
  };
}

// Session #147 (Commit C): default `payments` seeds a single card payment
// whose `stripe_payment_intent_id` is the canonical PI fixture — mirrors
// the production data shape where the PI lives on the payments row, not
// the transaction. Tests needing the cash-only / no-PI cases override
// `payments` directly (e.g. `payments: []` or `payments: [{method:'cash',...}]`).
function makeTx(overrides: Partial<TxRow> = {}): TxRow {
  const total_amount = overrides.total_amount ?? 50;
  const tip_amount = overrides.tip_amount ?? 0;
  const defaultPayments = [
    {
      amount: total_amount + tip_amount,
      method: 'card' as string | null,
      stripe_payment_intent_id: 'pi_test_1' as string | null,
    },
  ];
  return {
    id: 'tx-1',
    status: 'completed',
    total_amount,
    tip_amount,
    created_at: '2026-06-01T10:00:00Z',
    payments: defaultPayments,
    ...overrides,
  };
}

beforeEach(() => {
  state.appointment = null;
  state.apptLookupError = null;
  state.apptUpdateError = null;
  state.jobUpdateError = null;
  state.refundInsertError = null;
  state.txUpdateError = null;
  state.cancellationFeeSetting = undefined;
  state.businessSettingsReadError = null;
  state.apptUpdates = [];
  state.jobUpdates = [];
  state.refundInserts = [];
  state.txStatusUpdates = [];
  auditCalls.length = 0;
  notificationCalls.length = 0;
  creditCalls.length = 0;
  stripeCalls.length = 0;
  stripeShouldThrow = null;
  stripeRefundIdCounter = 0;
  creditCreateShouldThrow = null;
  __setStripeForTesting(makeStripe());
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('cancelAppointmentOrchestrated — guards', () => {
  it('returns 404 not_found when appointment does not exist', async () => {
    state.appointment = null;
    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(404);
      expect(result.error).toBe('not_found');
    }
  });

  // Session #147 (Commit A — Bug 2 Layer 1) — regression lock.
  //
  // Pre-#147 a PostgREST-style error on the initial appointment SELECT
  // (e.g. a nested embed failing schema-cache resolution) was silently
  // swallowed by the orchestrator AND the resulting 404 carried the same
  // "Appointment {id} not found" message as the true missing-row case. That
  // conflation made Bug 2 (Ian Austria 06/10 unpaid cancel) undiagnosable
  // from the operator-facing error toast alone — server logs also contained
  // nothing helpful because the apptErr was never logged.
  //
  // Post-#147 the two paths are split:
  //   - apptErr non-null → 500 db_failed with the underlying message echoed
  //   - appointment null → 404 not_found (unchanged behavior)
  // This test pins the split so a future "consolidate the error paths"
  // refactor fails here loudly.
  it('returns 500 db_failed (NOT 404 not_found) when the appointment lookup errors', async () => {
    // Note: state.appointment is irrelevant here — even if a row exists, a
    // PostgREST error on the SELECT short-circuits before the row is read.
    state.apptLookupError = { message: 'embed metadata cache miss for transactions!appointment_id' };
    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(500);
      expect(result.error).toBe('db_failed');
      // The underlying PostgREST message must echo into the operator-facing
      // text so the server-log path is no longer the ONLY diagnostic surface.
      expect(result.message).toContain('embed metadata cache miss');
    }
  });

  it('returns 400 already_cancelled when appointment is already cancelled', async () => {
    seedAppointment({ status: 'cancelled' });
    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(400);
      expect(result.error).toBe('already_cancelled');
    }
    // No Stripe call should have fired.
    expect(stripeCalls).toHaveLength(0);
  });

  it('returns 400 terminal_status for completed appointments', async () => {
    seedAppointment({ status: 'completed' });
    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('terminal_status');
    }
  });

  it('returns 400 invalid_pathway for unknown pathway values', async () => {
    seedAppointment();
    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ pathway: 'mystery' as unknown as 'refund' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_pathway');
    }
  });
});

// ---------------------------------------------------------------------------
// Pathway A — refund
// ---------------------------------------------------------------------------

describe('cancelAppointmentOrchestrated — Pathway A (refund)', () => {
  it('happy path: paid deposit → Stripe refund + refunds row + status flip', async () => {
    seedAppointment({
      transactions: [makeTx({ total_amount: 50, tip_amount: 0 })],
    });

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pathway).toBe('refund');
      expect(result.amount_paid_cents).toBe(5000);
      expect(result.refund_amount_cents).toBe(5000);
      expect(result.cancellation_fee_cents).toBe(0);
      expect(result.stripe_refund_id).toMatch(/^re_test_/);
    }

    // Stripe was called with the full paid amount, no fee.
    expect(stripeCalls).toHaveLength(1);
    expect(stripeCalls[0].payment_intent).toBe('pi_test_1');
    expect(stripeCalls[0].amount).toBe(5000);

    // Refunds row inserted with the source transaction id.
    expect(state.refundInserts).toHaveLength(1);
    expect(state.refundInserts[0].transaction_id).toBe('tx-1');
    expect(state.refundInserts[0].amount).toBe(50);
    expect(state.refundInserts[0].stripe_refund_id).toMatch(/^re_test_/);

    // Appointment flipped.
    expect(state.apptUpdates).toHaveLength(1);
    expect(state.apptUpdates[0].status).toBe('cancelled');
  });

  it('with fee: refund = paid - fee; column persisted in dollars', async () => {
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: 2500 })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount_paid_cents).toBe(10000);
      expect(result.cancellation_fee_cents).toBe(2500);
      expect(result.refund_amount_cents).toBe(7500);
    }
    expect(stripeCalls[0].amount).toBe(7500);
    // The appointment column receives the fee in DOLLARS (legacy column shape).
    expect(state.apptUpdates[0].cancellation_fee).toBe(25);
  });

  it('fee >= paid: no Stripe call, no refunds row, fee retained', async () => {
    seedAppointment({
      transactions: [makeTx({ total_amount: 40 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: 5000 })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount_paid_cents).toBe(4000);
      expect(result.refund_amount_cents).toBe(0);
      expect(result.cancellation_fee_cents).toBe(5000);
      expect(result.stripe_refund_id).toBeNull();
    }
    expect(stripeCalls).toHaveLength(0);
    expect(state.refundInserts).toHaveLength(0);
    // The appointment column STILL receives the fee in DOLLARS.
    expect(state.apptUpdates[0].cancellation_fee).toBe(50);
  });

  it('no payment to refund: appointment still cancels but no Stripe, no refunds row', async () => {
    // Pay-on-site appointment, never paid.
    seedAppointment({ transactions: [] });

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount_paid_cents).toBe(0);
      expect(result.refund_amount_cents).toBeUndefined();
    }
    expect(stripeCalls).toHaveLength(0);
    expect(state.refundInserts).toHaveLength(0);
    expect(state.apptUpdates[0].status).toBe('cancelled');
  });

  it('returns 400 no_payment_to_refund when paid but no Stripe-PI source exists', async () => {
    // Paid via cash only — no card-method payment row, so extractCardPi
    // returns null and the orchestrator hits the no_payment_to_refund branch.
    // (Session #147 Commit C: PI lives on payments rows; cash-only paths
    // have a payments row with method='cash' and no PI.)
    seedAppointment({
      transactions: [
        makeTx({
          payments: [
            { amount: 50, method: 'cash', stripe_payment_intent_id: null },
          ],
        }),
      ],
    });

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(400);
      expect(result.error).toBe('no_payment_to_refund');
      expect(result.message).toContain('Pathway B');
    }
  });

  it('most-recent PI-bearing transaction wins source selection (multi-payment case)', async () => {
    // Session #147 Commit C: each transaction's PI is now sourced from its
    // child payments row whose method='card'. Multi-payment case still
    // selects the most-recent transaction by created_at.
    seedAppointment({
      transactions: [
        makeTx({
          id: 'tx-deposit',
          payments: [
            { amount: 30, method: 'card', stripe_payment_intent_id: 'pi_deposit' },
          ],
          created_at: '2026-06-01T10:00:00Z',
          total_amount: 30,
        }),
        makeTx({
          id: 'tx-paylink',
          payments: [
            { amount: 70, method: 'card', stripe_payment_intent_id: 'pi_paylink' },
          ],
          created_at: '2026-06-05T10:00:00Z',
          total_amount: 70,
        }),
      ],
    });

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    expect(result.ok).toBe(true);
    // Refund issued against the newest PI.
    expect(stripeCalls[0].payment_intent).toBe('pi_paylink');
    expect(state.refundInserts[0].transaction_id).toBe('tx-paylink');
  });

  it('returns 500 stripe_failed when Stripe API throws; no DB writes commit', async () => {
    seedAppointment({
      transactions: [makeTx()],
    });
    stripeShouldThrow = 'card_declined';

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(500);
      expect(result.error).toBe('stripe_failed');
    }
    expect(state.refundInserts).toHaveLength(0);
    expect(state.apptUpdates).toHaveLength(0);
  });

  it('refunds insert failure after Stripe success: returns 500 db_failed with partial_state', async () => {
    seedAppointment({
      transactions: [makeTx()],
    });
    state.refundInsertError = { message: 'unique violation' };

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('db_failed');
      expect(result.partial_state?.stripe_refund_id).toMatch(/^re_test_/);
      expect(result.partial_state?.refund_amount_cents).toBe(5000);
    }
    // Audit log should include a partial-state entry describing the hang.
    const partialAuditEntries = auditCalls.filter(
      (e) => (e.details as Record<string, unknown>)?.partial_state === true
    );
    expect(partialAuditEntries.length).toBeGreaterThan(0);
  });

  it('passes Stripe metadata: appointment_id + cancellation_fee_cents + cancel_pathway', async () => {
    seedAppointment({
      transactions: [makeTx({ total_amount: 80 })],
    });

    await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: 1000 })
    );

    expect(stripeCalls[0].metadata).toEqual({
      appointment_id: 'appt-1',
      cancellation_fee_cents: '1000',
      cancel_pathway: 'refund',
    });
  });

  it('marks source transaction refunded when refund equals max-refundable; partial_refund otherwise', async () => {
    // Single source $100; refund the full 100.
    seedAppointment({
      transactions: [makeTx({ total_amount: 100, tip_amount: 0 })],
    });
    const fullResult = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(fullResult.ok).toBe(true);
    expect(state.txStatusUpdates).toHaveLength(1);
    expect(state.txStatusUpdates[0].payload.status).toBe('refunded');

    // Reset, but refund only partial.
    state.txStatusUpdates = [];
    state.apptUpdates = [];
    state.refundInserts = [];
    stripeCalls.length = 0;
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });
    const partialResult = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: 4000 })
    );
    expect(partialResult.ok).toBe(true);
    expect(state.txStatusUpdates[0].payload.status).toBe('partial_refund');
  });
});

// ---------------------------------------------------------------------------
// Pathway B — credit
// ---------------------------------------------------------------------------

describe('cancelAppointmentOrchestrated — Pathway B (credit)', () => {
  it('happy path: paid appointment → credit issued; NO Stripe call', async () => {
    seedAppointment({
      transactions: [makeTx({ total_amount: 75 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ pathway: 'credit' })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pathway).toBe('credit');
      expect(result.credit_id).toBe('credit-id-1');
      expect(result.credit_amount_cents).toBe(7500);
    }
    expect(stripeCalls).toHaveLength(0);
    expect(creditCalls).toHaveLength(1);
    expect(creditCalls[0]).toMatchObject({
      customer_id: 'cust-1',
      amount_cents: 7500,
      reason: 'cancellation_refund',
      source_appointment_id: 'appt-1',
    });
  });

  it('no payment: no credit issued, appointment still cancels', async () => {
    seedAppointment({ transactions: [] });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ pathway: 'credit' })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credit_amount_cents).toBe(0);
      expect(result.credit_id).toBeUndefined();
    }
    expect(creditCalls).toHaveLength(0);
    expect(state.apptUpdates[0].status).toBe('cancelled');
  });

  it('credit creation failure after status flip returns 500 db_failed with partial_state audit', async () => {
    seedAppointment({
      transactions: [makeTx({ total_amount: 50 })],
    });
    creditCreateShouldThrow = 'check constraint violated';

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ pathway: 'credit' })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('db_failed');
      expect(result.message).toContain('credit issue failed');
    }
    // Appointment IS already cancelled by the time the credit fails.
    expect(state.apptUpdates[0].status).toBe('cancelled');
    // Partial-state audit entry written.
    const partialEntries = auditCalls.filter(
      (e) => (e.details as Record<string, unknown>)?.partial_state === true
    );
    expect(partialEntries.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Job cascade
// ---------------------------------------------------------------------------

describe('cancelAppointmentOrchestrated — job cascade', () => {
  it('marks non-terminal job cancelled', async () => {
    seedAppointment({
      transactions: [],
      jobs: [{ id: 'job-1', status: 'in_progress' }],
    });

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.job_cancelled).toBe(true);
    expect(state.jobUpdates).toHaveLength(1);
    expect(state.jobUpdates[0].id).toBe('job-1');
    expect(state.jobUpdates[0].payload.status).toBe('cancelled');
    expect(state.jobUpdates[0].payload.cancelled_at).toBeDefined();
    expect(state.jobUpdates[0].payload.cancelled_by).toBe('emp-1');
  });

  it('skips terminal jobs (completed/closed/cancelled)', async () => {
    for (const terminalStatus of ['completed', 'closed', 'cancelled']) {
      state.appointment = null;
      state.apptUpdates = [];
      state.jobUpdates = [];
      seedAppointment({
        transactions: [],
        jobs: [{ id: `job-${terminalStatus}`, status: terminalStatus }],
      });
      const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.job_cancelled).toBe(false);
      expect(state.jobUpdates).toHaveLength(0);
    }
  });

  it('returns job_cancelled=false when no jobs are linked', async () => {
    seedAppointment({ jobs: [] });
    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.job_cancelled).toBe(false);
  });

  // Session #147 (Commit A — Bug 2 Layer 2) — regression lock.
  //
  // `jobs.appointment_id` carries a UNIQUE constraint (migration
  // `20260329000002_jobs_appointment_id_unique_constraint.sql`), so PostgREST
  // infers 1:1 cardinality and returns the embedded `jobs` relation as a
  // SINGLE OBJECT `{id, status}` (or null) — NOT an array — even though
  // `jobs:jobs!appointment_id(id, status)` visually reads as a to-many embed.
  // Pre-#147 the orchestrator's `(appointment.jobs ?? []) as JobRow[]` cast
  // lied at runtime: when the appointment had a materialized job, the
  // subsequent `.find(...)` threw TypeError → 500 "Internal server error"
  // on every cancel attempt against a materialized appointment. Same
  // Session #110 crash class fixed in the GET endpoint at
  // `/api/pos/appointments/[id]/route.ts:83-87`; this test pins the
  // symmetric corrective on the orchestrator.
  //
  // The test seeds `appointment.jobs` as a SINGLE OBJECT (not an array) to
  // exercise the production PostgREST shape — the rest of the test suite
  // uses array form so this is the one place the cardinality-corrective is
  // load-bearing.
  it('handles jobs embed returning a SINGLE OBJECT (PostgREST UNIQUE-FK cardinality) without crashing', async () => {
    seedAppointment({
      transactions: [],
      // Cast through `unknown` because the test's `ApptRow` type declares
      // `jobs: JobRow[]` for ergonomics across the rest of the suite. In
      // production PostgREST returns a single object on this UNIQUE-FK
      // embed, which is exactly what we need to inject here. The cast is
      // localized to this one test so the array shape stays the default
      // for every other assertion.
      jobs: ({ id: 'job-single-1', status: 'scheduled' } as unknown) as JobRow[],
    });

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    // Orchestrator must succeed (no TypeError from `.find` on a non-array).
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.job_cancelled).toBe(true);
    // The single object must be normalized into an array and processed by
    // the job-cancel branch — verify the UPDATE fired for the seeded job id.
    expect(state.jobUpdates).toHaveLength(1);
    expect(state.jobUpdates[0].id).toBe('job-single-1');
    expect(state.jobUpdates[0].payload.status).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------------
// Audit + notifications
// ---------------------------------------------------------------------------

describe('cancelAppointmentOrchestrated — audit + notifications', () => {
  it('writes a canonical audit entry on successful cancel', async () => {
    seedAppointment({
      transactions: [makeTx({ total_amount: 50 })],
    });

    await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    const successEntries = auditCalls.filter(
      (e) =>
        (e.details as Record<string, unknown>)?.partial_state !== true &&
        e.action === 'delete'
    );
    expect(successEntries.length).toBe(1);
    const entry = successEntries[0];
    expect(entry.entityType).toBe('booking');
    expect(entry.entityId).toBe('appt-1');
    const details = entry.details as Record<string, unknown>;
    expect(details.cancel_pathway).toBe('refund');
    expect(details.cancelled_by).toBe('staff_admin');
    expect(details.amount_paid_cents).toBe(5000);
    expect(details.refund_amount_cents).toBe(5000);
    expect(details.stripe_refund_id).toMatch(/^re_test_/);
  });

  it('fires sendCancellationNotifications when notifyCustomer=true; never via webhook', async () => {
    seedAppointment({ transactions: [] });

    await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ notifyCustomer: true })
    );

    // Wait for fire-and-forget Promise to settle.
    await new Promise((r) => setImmediate(r));
    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0].appointmentId).toBe('appt-1');
  });

  it('does NOT fire notifications when notifyCustomer=false', async () => {
    seedAppointment({ transactions: [] });

    await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ notifyCustomer: false })
    );
    await new Promise((r) => setImmediate(r));
    expect(notificationCalls).toHaveLength(0);
  });

  it('audit source mapping: staff_admin → admin; staff_pos → pos; customer → customer_portal; voice_agent → api', async () => {
    const mappings = [
      ['staff_admin', 'admin'],
      ['staff_pos', 'pos'],
      ['customer', 'customer_portal'],
      ['voice_agent', 'api'],
    ] as const;
    for (const [cancelledBy, expectedSource] of mappings) {
      state.appointment = null;
      auditCalls.length = 0;
      seedAppointment({ transactions: [] });
      await cancelAppointmentOrchestrated(
        makeAdmin(),
        baseInput({ cancelledBy })
      );
      const entry = auditCalls.find((e) => e.action === 'delete');
      expect(entry?.source).toBe(expectedSource);
    }
  });
});

// ---------------------------------------------------------------------------
// Theme G compliance
// ---------------------------------------------------------------------------

describe('cancelAppointmentOrchestrated — Theme G compliance (no fireWebhook)', () => {
  it('the source file does not CALL fireWebhook or import the n8n_webhook_urls helper', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'cancel-orchestration.ts'),
      'utf-8'
    );
    // The comment-form "fireWebhook" mentions in the file header are
    // intentional documentation (explaining Theme G compliance). The
    // call-form `fireWebhook(` would be an invocation — which must NOT
    // exist. The import-form would be the require/import line — which
    // also must not exist.
    expect(source).not.toMatch(/fireWebhook\s*\(/);
    expect(source).not.toMatch(/from\s+['"][^'"]*webhook['"]/);
    expect(source).not.toMatch(/n8n_webhook_urls/);
  });
});

// ---------------------------------------------------------------------------
// Session #147 (Commit C — Bug 2 Layer 3) — schema-accurate Stripe PI source
// ---------------------------------------------------------------------------
//
// Pre-#147 the orchestrator's outer transactions SELECT listed
// `stripe_payment_intent_id` — a column that does not exist on `transactions`
// (per `supabase/migrations/20260201000016_create_transactions.sql` + every
// subsequent `ALTER TABLE transactions`). PostgREST aliased the embed as
// `transactions_1`, failed to resolve `transactions_1.stripe_payment_intent_id`
// against the real schema, and returned the operator-visible
// "column transactions_1.stripe_payment_intent_id does not exist" error.
// This blocked every cancel attempt that reached the orchestrator until
// Commit A's diagnostic split (#147 Layer 1) surfaced the error to the
// operator, and Commit C now corrects the read path.
//
// Schema reality + canonical pattern: `payments.stripe_payment_intent_id`
// is the per-charge PI (`supabase/migrations/20260201000018_create_payments.sql:8`).
// The canonical refund engine reads it from there too
// (`src/app/api/pos/refunds/route.ts:316-317`). The orchestrator now mirrors
// that pattern via `extractCardPi(tx)`.
//
// Two regression locks below: a source-text pin (catches the typo class at
// write-time) + a functional pin (catches a future refactor that re-couples
// the PI lookup to the wrong table at runtime).

describe('cancelAppointmentOrchestrated — Bug 2 Layer 3 schema-accurate PI read', () => {
  it('the orchestrator source does NOT select stripe_payment_intent_id from the transactions table', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'cancel-orchestration.ts'),
      'utf-8'
    );

    // Capture the SELECT region between the outer
    // `transactions:transactions!appointment_id(` paren and the inner
    // `payments:payments!transaction_id` embed. The inner embed is allowed
    // to (and SHOULD) list `stripe_payment_intent_id` — that's the canonical
    // location. Anywhere ELSE in the outer-transactions column list, the
    // token is the bug class this lock catches.
    const outerSelectMatch = source.match(
      /transactions:transactions!appointment_id\(([\s\S]*?)payments:payments!transaction_id/
    );
    expect(outerSelectMatch, 'outer transactions SELECT region not found in source').not.toBeNull();
    const outerSelectRegion = outerSelectMatch![1];

    // The bug shape was: `... created_at, stripe_payment_intent_id,` in the
    // outer SELECT list. The fix is to remove that token entirely from this
    // region. The inner embed (selected AFTER this region) still carries
    // the token correctly.
    expect(
      outerSelectRegion,
      'stripe_payment_intent_id must NOT appear in the outer transactions SELECT list — it is not a column on the transactions table; the per-charge PI lives on the child payments rows'
    ).not.toContain('stripe_payment_intent_id');
  });

  it('refund dispatches against the PI from the card-method payments row (not from a transactions column)', async () => {
    // Single-tx happy-path with explicit canonical-PI fixture. Locks the
    // end-to-end lookup path: payments row → extractCardPi → Stripe SDK.
    // Note the PI value is intentionally unique to this test so we can pin
    // the exact value flowing through, distinct from `makeTx`'s default.
    seedAppointment({
      transactions: [
        makeTx({
          id: 'tx-canonical',
          total_amount: 100,
          tip_amount: 0,
          payments: [
            {
              amount: 100,
              method: 'card',
              stripe_payment_intent_id: 'pi_canonical_locked',
            },
          ],
        }),
      ],
    });

    const result = await cancelAppointmentOrchestrated(makeAdmin(), baseInput());

    expect(result.ok).toBe(true);
    // Stripe was called once with the payments-row PI, not undefined or null.
    expect(stripeCalls).toHaveLength(1);
    expect(stripeCalls[0].payment_intent).toBe('pi_canonical_locked');
    // Refunds row references the transaction id (not the PI itself).
    expect(state.refundInserts).toHaveLength(1);
    expect(state.refundInserts[0].transaction_id).toBe('tx-canonical');
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Theme D.2 (AC-14) — default cancellation fee from business_settings
// ---------------------------------------------------------------------------
//
// Locks the fee-resolution contract:
//   `undefined` or `null`  → read default from
//                            `business_settings.cancellation_fee_default_cents`
//   any explicit number    → use as-is (negatives clamped to 0; pass 0 to
//                            explicitly waive)
//
// Pre-D.2 both undefined and null collapsed to 0; the test suite's existing
// "happy path: paid deposit" assertion (`cancellation_fee_cents: 0` on
// result) still passes here because `state.cancellationFeeSetting` defaults
// to `undefined` per beforeEach → helper returns 0 → orchestrator uses 0.

import { getDefaultCancellationFeeCents } from '../cancel-orchestration';

describe('cancelAppointmentOrchestrated — Phase 3 Theme D.2 (AC-14) fee resolution', () => {
  it('undefined fee + setting=5000 → orchestrator uses 5000 (default applied)', async () => {
    state.cancellationFeeSetting = 5000; // $50
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: undefined })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(5000);
      expect(result.refund_amount_cents).toBe(5000); // 10000 - 5000
    }
    expect(stripeCalls[0].amount).toBe(5000);
  });

  it('null fee + setting=5000 → orchestrator uses 5000 (null treated same as undefined per D.2 contract)', async () => {
    state.cancellationFeeSetting = 5000;
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: null })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(5000);
    }
  });

  it('explicit 0 fee + setting=5000 → orchestrator uses 0 (explicit waiver wins over default)', async () => {
    state.cancellationFeeSetting = 5000;
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: 0 })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(0);
      expect(result.refund_amount_cents).toBe(10000); // no fee deducted
    }
  });

  it('explicit 2500 fee + setting=5000 → orchestrator uses 2500 (override wins over default)', async () => {
    state.cancellationFeeSetting = 5000;
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: 2500 })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(2500);
      expect(result.refund_amount_cents).toBe(7500);
    }
  });

  it('undefined fee + setting missing → orchestrator uses 0 (graceful fallback)', async () => {
    state.cancellationFeeSetting = undefined; // row absent
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: undefined })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(0);
      expect(result.refund_amount_cents).toBe(10000);
    }
  });

  it('undefined fee + setting=null in DB → orchestrator uses 0', async () => {
    state.cancellationFeeSetting = null;
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: undefined })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(0);
    }
  });

  it('undefined fee + setting is string "5000" (legacy double-serialization) → coerces to 5000', async () => {
    state.cancellationFeeSetting = '5000';
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: undefined })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(5000);
    }
  });

  it('undefined fee + business_settings read errors → orchestrator falls back to 0 (cancel still succeeds)', async () => {
    state.cancellationFeeSetting = 5000;
    state.businessSettingsReadError = { message: 'connection refused' };
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({ cancellation_fee_cents: undefined })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cancellation_fee_cents).toBe(0);
      expect(result.refund_amount_cents).toBe(10000);
    }
  });

  it('Pathway B (credit) with setting=5000 → fee is irrelevant; full paid amount issued as credit', async () => {
    state.cancellationFeeSetting = 5000;
    seedAppointment({
      transactions: [makeTx({ total_amount: 100 })],
    });

    const result = await cancelAppointmentOrchestrated(
      makeAdmin(),
      baseInput({
        pathway: 'credit',
        cancellation_fee_cents: undefined,
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pathway).toBe('credit');
      // Pathway B doesn't apply fees — credit = full paid amount.
      expect(result.credit_amount_cents).toBe(10000);
    }
    // No Stripe call on credit path.
    expect(stripeCalls).toHaveLength(0);
  });
});

describe('getDefaultCancellationFeeCents — Phase 3 Theme D.2 (AC-14) reader helper', () => {
  it('returns 0 when row missing', async () => {
    state.cancellationFeeSetting = undefined;
    const result = await getDefaultCancellationFeeCents(makeAdmin());
    expect(result).toBe(0);
  });

  it('returns the number when row has a number value', async () => {
    state.cancellationFeeSetting = 7500;
    const result = await getDefaultCancellationFeeCents(makeAdmin());
    expect(result).toBe(7500);
  });

  it('coerces string-typed values (legacy double-serialization)', async () => {
    state.cancellationFeeSetting = '5000';
    const result = await getDefaultCancellationFeeCents(makeAdmin());
    expect(result).toBe(5000);
  });

  it('returns 0 on negative configured values (defensive)', async () => {
    state.cancellationFeeSetting = -100;
    const result = await getDefaultCancellationFeeCents(makeAdmin());
    expect(result).toBe(0);
  });

  it('returns 0 on non-finite / unparseable values', async () => {
    state.cancellationFeeSetting = 'not-a-number';
    const result = await getDefaultCancellationFeeCents(makeAdmin());
    expect(result).toBe(0);
  });

  it('returns 0 on DB read error', async () => {
    state.cancellationFeeSetting = 5000;
    state.businessSettingsReadError = { message: 'connection lost' };
    const result = await getDefaultCancellationFeeCents(makeAdmin());
    expect(result).toBe(0);
  });

  it('floors fractional configured values (cents must be integer)', async () => {
    state.cancellationFeeSetting = 5000.7;
    const result = await getDefaultCancellationFeeCents(makeAdmin());
    expect(result).toBe(5000);
  });
});
