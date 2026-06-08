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

interface TxRow {
  id: string;
  status: string;
  total_amount: number;
  tip_amount: number | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
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
  apptUpdateError: null as null | { message: string },
  jobUpdateError: null as null | { message: string },
  refundInsertError: null as null | { message: string },
  txUpdateError: null as null | { message: string },
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
            return { data: state.appointment, error: null };
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

function makeTx(overrides: Partial<TxRow> = {}): TxRow {
  return {
    id: 'tx-1',
    status: 'completed',
    total_amount: 50,
    tip_amount: 0,
    created_at: '2026-06-01T10:00:00Z',
    stripe_payment_intent_id: 'pi_test_1',
    payments: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.appointment = null;
  state.apptUpdateError = null;
  state.jobUpdateError = null;
  state.refundInsertError = null;
  state.txUpdateError = null;
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
    // Paid via cash only — no stripe_payment_intent_id on the transaction.
    seedAppointment({
      transactions: [makeTx({ stripe_payment_intent_id: null })],
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
    seedAppointment({
      transactions: [
        makeTx({
          id: 'tx-deposit',
          stripe_payment_intent_id: 'pi_deposit',
          created_at: '2026-06-01T10:00:00Z',
          total_amount: 30,
        }),
        makeTx({
          id: 'tx-paylink',
          stripe_payment_intent_id: 'pi_paylink',
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
