/**
 * Phase 3 Theme D.1 — Cancel orchestration helper (AC-9 foundation).
 *
 * The canonical "cancel an appointment with money handling" primitive. Pre-D.1
 * the four cancel endpoints (admin / POS / customer self-cancel / POS job
 * cancel) only flipped `appointments.status='cancelled'` and dispatched
 * notifications; none of them invoked Stripe refunds, none created customer
 * credits, none deducted a cancellation fee from money paid. The refund engine
 * at `/api/pos/refunds` was reachable only via a separate operator
 * navigation. This module merges all three side effects into one atomic-ish
 * call so the operator can cancel-and-refund or cancel-and-credit in a single
 * server request.
 *
 * Two pathways (locked at AC-9 v1.0):
 *
 *   - Pathway A — Cancel & Refund: refund the customer's prior payments (minus
 *     an optional cancellation fee) via Stripe. The refund engine's existing
 *     `refunds` table records the movement; the per-source LIFO walk from
 *     `pos/refunds/route.ts` is simplified here to "refund the most-recent
 *     completed Stripe-PI-bearing transaction" because cancel-time refunds are
 *     almost always single-source (deposit at booking) and the multi-source
 *     LIFO case is rare enough that the standalone POS Refund UI remains the
 *     right surface for it. Theme D.3 will add the `charge.refunded` webhook
 *     listener so async refund completion events are reconciled — D.1 ships
 *     the synchronous-only path.
 *
 *   - Pathway B — Cancel & Retain credit: no Stripe call; the full paid amount
 *     is issued as a `customer_credits` row via E.1's `createCustomerCredit`
 *     (`reason: 'cancellation_refund'`). The credit lands on the customer's
 *     account ledger; E.2's apply-credit path handles redemption at a future
 *     checkout. This is the "no cash back; full credit toward a future visit"
 *     option the operator surfaces at cancel time.
 *
 * Job handling (BOTH pathways): if the appointment has a non-terminal job, the
 * orchestrator marks `jobs.status='cancelled'` + `cancelled_at` + `cancelled_by`
 * (mirrors `/api/pos/jobs/[id]/cancel`'s A.4 pattern verified by the
 * refund/credit/cancellation-fee audit `3e633156` Target A.4). Terminal jobs
 * (`completed` / `closed` / `cancelled`) are left untouched — they represent
 * delivered work and must not be retroactively un-cancelled.
 *
 *   IMPORTANT — DOES NOT call `executeUnMaterialize`. That helper's contract
 *   is "revert appointment to `pending` + DELETE the job" (used by the operator
 *   "Revert Job" affordance). Its `transaction_linked` guard returns 409 when
 *   money is attached, which is precisely the case Pathway A handles. Cancel
 *   semantically wants the job marked-cancelled-and-preserved (audit history
 *   intact), not deleted. See Memory #11 verification note in the audit at
 *   3e633156 Target E.2.
 *
 * Atomicity boundaries:
 *
 *   The orchestrator follows Memory #2 by mirroring the existing refund
 *   engine's order: external API call FIRST, then DB writes. This means a
 *   Stripe-refund-then-DB-update failure leaves a hanging Stripe refund and an
 *   un-cancelled appointment — surfaced honestly via the partial-success audit
 *   log entry. The same partial-state semantics exist in the refund engine
 *   today (`pos/refunds/route.ts:736-746`) and operators recover via the manual
 *   refund-against-PI affordance + appointment status edit. No new partial-
 *   state surface is introduced.
 *
 *   Pathway B is cleaner: `createCustomerCredit` is a single Supabase INSERT
 *   that runs after the appointment is already in cancellation-eligible state;
 *   a failure leaves the customer-uncancelled (the inverse of Pathway A) but
 *   no external-API resource is leaked.
 *
 * Money types: this module is NEW per Rule #20 (Money-Unify) — all internal
 * money is integer cents. The existing `appointments.cancellation_fee` column
 * is dollars (NUMERIC); conversion happens at the column-write boundary via
 * `fromCents()`. The same conversion happens at the `transactions.total_amount`
 * + `payments.amount` read boundary.
 *
 * Customer-facing dispatch (Theme G compliance): NEVER calls `fireWebhook`
 * (that subsystem was removed by Theme G `851639ef`; no n8n receiver exists).
 * Customer SMS + email dispatch is delegated to the existing
 * `sendCancellationNotifications` helper which already handles inline
 * SMS + email via `sendSms` + `sendTemplatedEmail`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { logAudit } from '@/lib/services/audit';
import { sendCancellationNotifications } from '@/lib/email/send-cancellation-email';
import { createCustomerCredit } from '@/lib/credits/repository';
import { toCents, fromCents } from '@/lib/utils/money';

const TERMINAL_APPT_STATUSES = new Set(['completed', 'cancelled']);
const TERMINAL_JOB_STATUSES = new Set(['completed', 'closed', 'cancelled']);

/** business_settings row key for the AC-14 default cancellation fee. Stored as
 *  cents (JSON number) per Memory #20 — explicit `_cents` suffix prevents
 *  dollars-vs-cents misinterpretation at read sites. See migration
 *  `20260608015513_seed_cancellation_fee_default_setting.sql` for the seed
 *  rationale and the architecture-doc-divergence note. */
export const CANCELLATION_FEE_SETTING_KEY = 'cancellation_fee_default_cents';

/**
 * Read the configured default cancellation fee (in cents) from
 * `business_settings`. Returns 0 (no fee) when the row is missing, the value
 * is null, the value is non-numeric, or the read errors — never throws.
 *
 * Phase 3 Theme D.2 (AC-14): the orchestrator's contract is "`undefined` →
 * use this default; explicit number-or-null → use the explicit value." This
 * helper covers the default-read side. The graceful-zero fallback exists so
 * a database hiccup or accidental row deletion cannot block a cancel — the
 * operator can still cancel, just without the configured fee.
 */
export async function getDefaultCancellationFeeCents(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', CANCELLATION_FEE_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error(
      '[cancel-orchestration] business_settings read failed for cancellation_fee_default_cents (defaulting to 0):',
      error.message
    );
    return 0;
  }
  if (!data || data.value === null || data.value === undefined) return 0;

  // business_settings.value is JSONB. The seed migration stores a JSON
  // number (`5000`) but legacy double-serialization (per
  // `src/lib/data/booking.ts:316`) means a string is also possible. Coerce
  // permissively and discard non-finite results.
  const raw = data.value as unknown;
  let parsed: number;
  if (typeof raw === 'number') {
    parsed = raw;
  } else if (typeof raw === 'string') {
    parsed = Number(raw);
  } else {
    parsed = NaN;
  }
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export type CancelPathway = 'refund' | 'credit';

export type CancelledBy =
  | 'staff_admin'
  | 'staff_pos'
  | 'customer'
  | 'voice_agent';

export interface CancelOrchestrationActor {
  /** Auth-user id; null for customer self-cancel paths where the customer isn't an employee. */
  userId: string | null;
  userEmail: string | null;
  employeeName: string | null;
  /** Required for Pathway A (drives `refunds.processed_by`); optional for Pathway B (drives `customer_credits.created_by_employee_id`). */
  employeeId: string | null;
}

export interface CancelOrchestrationInput {
  appointmentId: string;
  pathway: CancelPathway;
  /** Operator-typed reason; surfaced into the audit log, the cancellation_reason
   *  column, and the customer SMS / email body. */
  reason: string;
  /**
   * Pathway A only. Integer cents per Rule #20.
   *
   * Resolution contract (Phase 3 Theme D.2 AC-14):
   *   - `undefined` or `null` → read default from `business_settings`
   *                             (`cancellation_fee_default_cents`)
   *   - any explicit number   → use as-is (negatives clamped to 0; pass
   *                             `0` to explicitly waive)
   *
   * Pre-D.2 the contract was `?? 0` — both `undefined` and `null` collapsed
   * to "no fee." D.2 promotes the absent / nullish path to "use the
   * configured default" (the AC-14 commitment); explicit waive is now `0`
   * rather than `null`. Callers that intend "no fee" (e.g. the customer
   * self-cancel route, where the 24h window is the fee-equivalent gate)
   * must pass `0` explicitly; previously `null` covered that intent.
   */
  cancellation_fee_cents?: number | null;
  /** Whether to dispatch the customer-facing cancellation SMS + email. Defaults
   *  to true on the admin path; the POS path explicitly opts in via the
   *  "Notify customer" checkbox; the customer self-cancel path is always
   *  notified (the customer initiated, they get the confirmation). */
  notifyCustomer: boolean;
  cancelledBy: CancelledBy;
  actor: CancelOrchestrationActor;
  ipAddress: string | null;
}

/** Per-pathway result shape; either `refund_*` fields (A) or `credit_*` fields
 *  (B) populate, never both. `job_cancelled` is common across both. */
export interface CancelOrchestrationSuccess {
  ok: true;
  appointment_id: string;
  pathway: CancelPathway;
  // Pathway A:
  refund_amount_cents?: number;
  refund_id?: string;
  stripe_refund_id?: string | null;
  cancellation_fee_cents?: number;
  // Pathway B:
  credit_id?: string;
  credit_amount_cents?: number;
  // Common:
  job_cancelled: boolean;
  /** Amount that was already paid against this appointment (sum of completed
   *  transactions' total_amount + tip), in cents. Useful for operator UI to
   *  confirm the breakdown. */
  amount_paid_cents: number;
}

export type CancelOrchestrationError =
  | 'not_found'
  | 'already_cancelled'
  | 'terminal_status'
  | 'invalid_pathway'
  | 'no_payment_to_refund'
  | 'stripe_failed'
  | 'db_failed'
  | 'unknown';

export interface CancelOrchestrationFailure {
  ok: false;
  httpStatus: number;
  error: CancelOrchestrationError;
  message: string;
  /** Populated when Pathway A's Stripe call succeeded but a subsequent DB
   *  write failed — the audit log row records this; the operator needs to
   *  reconcile manually via the standalone refund UI + status PATCH. */
  partial_state?: {
    stripe_refund_id?: string;
    refund_amount_cents?: number;
  };
}

export type CancelOrchestrationResult =
  | CancelOrchestrationSuccess
  | CancelOrchestrationFailure;

// ---------------------------------------------------------------------------
// Stripe SDK (singleton; lazy so tests can mock the import without env vars).
// ---------------------------------------------------------------------------
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
}

// Test-only seam: lets the test suite inject a mock Stripe client without
// touching the env var or the module's singleton state. Not exported in the
// public-facing barrel; only the test file imports it.
export function __setStripeForTesting(stripe: Stripe | null): void {
  _stripe = stripe;
}

// ---------------------------------------------------------------------------
// Schema-accurate Stripe-PI extractor (Session #147 Commit C).
// ---------------------------------------------------------------------------

/**
 * Find the Stripe PaymentIntent ID for the card-method payment on a given
 * transaction's payments array, or null if no card payment with a PI exists.
 *
 * Schema reality: `payments.stripe_payment_intent_id` is the per-charge
 * canonical PI (per `supabase/migrations/20260201000018_create_payments.sql:8`).
 * `transactions` has NO `stripe_payment_intent_id` column at any point in the
 * migration history — the orchestrator pre-#147 selected the column from the
 * wrong table, blocking every cancel attempt with a PostgREST schema error.
 *
 * Canonical pattern: mirrors `src/app/api/pos/refunds/route.ts:316-317`:
 *   const cardPmt = sp.payments.find((p) => p.method === 'card');
 *   if (cardPmt && !cardPmt.stripe_payment_intent_id) { ... }
 *
 * Structural (not nominal) parameter type — accepts the orchestrator's
 * function-scoped `TxRow` AND any future caller whose row matches the same
 * minimal shape, without forcing a module-scope type extraction.
 *
 * Split-tender semantics: at most one card-method payment per transaction in
 * current data shapes; `.find()` returns the first match. If multi-card
 * split-tender becomes a real path, this helper extends naturally to return
 * all PIs and the caller picks the appropriate one.
 */
function extractCardPi(tx: {
  payments: Array<{
    method: string | null;
    stripe_payment_intent_id: string | null;
  }> | null;
}): string | null {
  const cardPmt = (tx.payments ?? []).find((p) => p.method === 'card');
  return cardPmt?.stripe_payment_intent_id ?? null;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

/**
 * Cancel an appointment with money handling.
 *
 * Step order (Pathway A):
 *   1. Load appointment + cancellable check
 *   2. Compute amount paid, refund target, fee
 *   3. Stripe refund (external) — fail-fast if zero refund target
 *   4. Insert `refunds` row referencing the source transaction
 *   5. Cancel non-terminal job if any
 *   6. Flip appointment to `cancelled` + persist fee + reason
 *   7. Audit log
 *   8. Notifications (fire-and-forget)
 *
 * Step order (Pathway B):
 *   1. Load appointment + cancellable check
 *   2. Compute amount paid (becomes credit amount; no fee deduction in D.1)
 *   3. (No Stripe call.)
 *   4. Cancel non-terminal job if any
 *   5. Flip appointment to `cancelled` + persist reason
 *   6. Create `customer_credits` row (after status flip so the source FK is
 *      pointed at an already-cancelled appointment, matching the credit's
 *      reason semantics)
 *   7. Audit log
 *   8. Notifications (fire-and-forget)
 */
export async function cancelAppointmentOrchestrated(
  supabase: SupabaseClient,
  input: CancelOrchestrationInput
): Promise<CancelOrchestrationResult> {
  if (input.pathway !== 'refund' && input.pathway !== 'credit') {
    return {
      ok: false,
      httpStatus: 400,
      error: 'invalid_pathway',
      message: `pathway must be 'refund' or 'credit' (got '${input.pathway}')`,
    };
  }

  // 1. Load the appointment + linked transactions + linked job in one query
  //    shape. We pull payments via a nested select so the multi-source case
  //    (deposit + pay-link) is covered without a second round-trip.
  //
  // Session #147 (Commit C — Bug 2 Layer 3, schema-accurate read): the outer
  // transactions SELECT does NOT include `stripe_payment_intent_id` — that
  // column has never existed on `transactions` (full migration trace via
  // `20260201000016_create_transactions.sql` + every subsequent
  // `ALTER TABLE transactions`). Pre-#147 (Commit A) it did, and PostgREST
  // aliased the embed as `transactions_1` then failed to resolve
  // `transactions_1.stripe_payment_intent_id` against the real schema,
  // returning the operator-visible "column does not exist" error AND
  // blocking every cancel attempt that reached the orchestrator. The PI
  // lives on the child `payments` rows (`payments.stripe_payment_intent_id`
  // per `20260201000018_create_payments.sql:8`), and the inner embed at the
  // next line ALREADY selects it correctly — the outer reference was a
  // Theme D.1 (2026-06-07) authoring typo. See `extractCardPi` below for
  // the canonical pattern (mirrors `src/app/api/pos/refunds/route.ts:316-317`).
  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .select(
      `id, status, customer_id, total_amount,
       transactions:transactions!appointment_id(
         id, status, total_amount, tip_amount, created_at,
         payments:payments!transaction_id(amount, method, stripe_payment_intent_id)
       ),
       jobs:jobs!appointment_id(id, status)`
    )
    .eq('id', input.appointmentId)
    .maybeSingle();

  // Session #147 (Commit A — Bug 2 Layer 1): distinguish PostgREST query error
  // from missing-row. Pre-#147 both branches collapsed into the same 404
  // "Appointment {id} not found" message AND the underlying `apptErr` was
  // silently swallowed (no console.error). When a PostgREST embed failed at
  // runtime — e.g. nested `payments:payments!transaction_id(...)` failing
  // schema-cache resolution — the operator saw a misleading 404 with nothing
  // diagnostic in the server logs. Split:
  //   - apptErr non-null → log + 500 with the underlying message
  //   - appointment null → keep the existing 404 (true missing-row case)
  // The 500 path is what unblocks diagnosis of Bug 2 Layer 3 (the actual
  // current cancel failure mode for unpaid appointments) — Commit C scope.
  if (apptErr) {
    console.error('[cancel-orchestration] appt lookup failed:', apptErr);
    return {
      ok: false,
      httpStatus: 500,
      error: 'db_failed',
      message: `Failed to load appointment: ${apptErr.message}`,
    };
  }
  if (!appointment) {
    return {
      ok: false,
      httpStatus: 404,
      error: 'not_found',
      message: `Appointment ${input.appointmentId} not found`,
    };
  }

  if (appointment.status === 'cancelled') {
    return {
      ok: false,
      httpStatus: 400,
      error: 'already_cancelled',
      message: 'Appointment is already cancelled',
    };
  }
  if (TERMINAL_APPT_STATUSES.has(appointment.status)) {
    return {
      ok: false,
      httpStatus: 400,
      error: 'terminal_status',
      message: `Cannot cancel an appointment that is already ${appointment.status}`,
    };
  }

  // 2. Compute amount paid across all completed transactions for this
  //    appointment. `total_amount` is dollars (NUMERIC); convert to cents at
  //    the boundary.
  // Session #147 (Commit C): `stripe_payment_intent_id` is intentionally
  // absent from TxRow — it does NOT exist on the `transactions` table
  // schema. The per-charge PI lives on the child `payments` rows; the
  // canonical access pattern is `extractCardPi(tx)` below.
  type TxRow = {
    id: string;
    status: string;
    total_amount: number;
    tip_amount: number | null;
    created_at: string;
    payments: Array<{
      amount: number;
      method: string | null;
      stripe_payment_intent_id: string | null;
    }> | null;
  };
  type JobRow = { id: string; status: string };

  const allTxs = ((appointment.transactions ?? []) as TxRow[]).filter(
    (t) => t.status === 'completed'
  );
  const amountPaidCents = allTxs.reduce(
    (sum, t) =>
      sum + toCents(Number(t.total_amount) + Number(t.tip_amount ?? 0)),
    0
  );

  // 3. Pathway-specific side effects.
  let pathwayResult:
    | { kind: 'refund'; refund_id: string | null; stripe_refund_id: string | null; refund_amount_cents: number; fee_cents: number }
    | { kind: 'credit'; credit_id: string | null; credit_amount_cents: number }
    | { kind: 'noop' };

  if (input.pathway === 'refund') {
    // Phase 3 Theme D.2 (AC-14): fee resolution contract — `undefined` /
    // `null` reads the business-settings default; any explicit number is
    // used as-is (including `0` for explicit waive). Pre-D.2 the contract
    // was `?? 0` (both nullish → no fee); D.2 promotes nullish to
    // "use configured default" per AC-14. Callers that intend "no fee
    // ever" (customer self-cancel — the 24h window is the fee gate) pass
    // `0` explicitly.
    const feeCents =
      input.cancellation_fee_cents === undefined ||
      input.cancellation_fee_cents === null
        ? await getDefaultCancellationFeeCents(supabase)
        : Math.max(0, input.cancellation_fee_cents);
    const refundTargetCents = Math.max(0, amountPaidCents - feeCents);

    if (amountPaidCents === 0 && feeCents === 0) {
      // Pure noop — no payment to refund AND no fee assessed. Cancel +
      // status flip only; no money-side-effects. Operator may have
      // selected Pathway A on a pay-on-site appointment that was never
      // paid AND chose to waive any fee (Mode A's "Waive" button or 0
      // input).
      pathwayResult = { kind: 'noop' };
    } else if (amountPaidCents === 0 && feeCents > 0) {
      // Session #147 Commit B (Mode A — no payment + fee assessed):
      // record the fee on `appointments.cancellation_fee` via the
      // feeForColumn write below so reporting captures operator intent
      // (D.2 fee policy applies regardless of payment state). No Stripe
      // call (nothing to refund); no refunds row. Same downstream shape
      // as the `refundTargetCents === 0` branch below (fee >= paid)
      // — symmetric. Pre-Commit-B this branch was `pathwayResult = noop`
      // which structurally DISCARDED any operator-entered fee — silent
      // data loss in the no-payment cancel case the Mode A UX surfaces.
      pathwayResult = {
        kind: 'refund',
        refund_id: null,
        stripe_refund_id: null,
        refund_amount_cents: 0,
        fee_cents: feeCents,
      };
    } else if (refundTargetCents === 0) {
      // Fee >= paid → keep entirety as fee revenue; no Stripe call, no
      // refunds row. We still record the fee against the appointment column
      // when we flip status below so reporting is consistent.
      pathwayResult = {
        kind: 'refund',
        refund_id: null,
        stripe_refund_id: null,
        refund_amount_cents: 0,
        fee_cents: feeCents,
      };
    } else {
      // Pick the source: most-recent completed transaction with a Stripe PI.
      // Cancel-time refunds are almost always single-source (the deposit);
      // multi-source LIFO is handled by the standalone refund UI when the
      // operator needs it.
      //
      // Session #147 (Commit C): the per-charge Stripe PI lives on the
      // child `payments` row whose `method === 'card'` — NOT on the parent
      // transaction. Canonical pattern from
      // `src/app/api/pos/refunds/route.ts:316-317`:
      //   const cardPmt = sp.payments.find((p) => p.method === 'card');
      //   if (cardPmt && !cardPmt.stripe_payment_intent_id) { ... }
      // Pre-#147 the orchestrator read `tx.stripe_payment_intent_id` which
      // doesn't exist on the transactions schema and caused the PostgREST
      // SELECT to fail. `extractCardPi` is the schema-accurate equivalent
      // — returns the card-payment's PI or null.
      const sourceTxEntry = allTxs
        .map((tx) => ({ tx, pi: extractCardPi(tx) }))
        .filter((entry): entry is { tx: TxRow; pi: string } => entry.pi !== null)
        .sort((a, b) => b.tx.created_at.localeCompare(a.tx.created_at))[0];

      if (!sourceTxEntry) {
        return {
          ok: false,
          httpStatus: 400,
          error: 'no_payment_to_refund',
          message:
            'Cannot issue Stripe refund: no completed transaction with a payment_intent found. Use Pathway B (credit) or refund manually via POS > Transactions.',
        };
      }
      const sourceTx = sourceTxEntry.tx;
      const sourcePi = sourceTxEntry.pi;

      // Stripe refund. The amount is in cents directly to the Stripe SDK.
      let stripeRefundId: string;
      try {
        const stripeRefund = await getStripe().refunds.create({
          payment_intent: sourcePi,
          // Stripe SDK's `amount` parameter takes integer cents; its field
          // name is the Stripe API contract, not ours, so we can't rename.
          // eslint-disable-next-line money/no-unsuffixed-money-prop
          amount: refundTargetCents,
          metadata: {
            appointment_id: appointment.id,
            cancellation_fee_cents: feeCents.toString(),
            cancel_pathway: 'refund',
          },
        });
        stripeRefundId = stripeRefund.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stripe refund failed';
        console.error('[cancel-orchestration] Stripe refund failed:', msg);
        return {
          ok: false,
          httpStatus: 500,
          error: 'stripe_failed',
          message: `Stripe refund failed: ${msg}`,
        };
      }

      // Refunds row. `processed_by` mirrors the existing refund engine's
      // pattern: NULL for customer-self-cancel paths, non-NULL for staff
      // actions. The `amount` column is dollars; the column rename to cents
      // is a future Money-Unify migration (out of scope per Memory #29).
      const { data: refundRow, error: refundInsertErr } = await supabase
        .from('refunds')
        .insert({
          transaction_id: sourceTx.id,
          status: 'processed',
          amount: fromCents(refundTargetCents),
          reason: `Appointment cancelled: ${input.reason}`,
          processed_by: input.actor.employeeId,
          stripe_refund_id: stripeRefundId,
          notes: JSON.stringify({
            source: 'cancel_orchestration',
            cancellation_fee_cents: feeCents,
            pathway: 'refund',
          }),
        })
        .select('id')
        .single();

      if (refundInsertErr || !refundRow) {
        // Partial-state: Stripe refund succeeded but the DB record didn't
        // land. The Stripe Dashboard still shows the refund; the operator
        // must manually reconcile via the standalone refund engine + status
        // PATCH. Audit log records this clearly.
        console.error(
          '[cancel-orchestration] PARTIAL STATE: Stripe refund succeeded but refunds insert failed:',
          refundInsertErr?.message
        );
        await logAudit({
          userId: input.actor.userId,
          userEmail: input.actor.userEmail,
          employeeName: input.actor.employeeName,
          action: 'refund',
          entityType: 'booking',
          entityId: input.appointmentId,
          entityLabel: `PARTIAL: Stripe refund ${stripeRefundId} succeeded but refunds row insert failed`,
          details: {
            partial_state: true,
            stripe_refund_id: stripeRefundId,
            refund_amount_cents: refundTargetCents,
            source: 'cancel_orchestration',
            cancellation_fee_cents: feeCents,
            cancel_pathway: 'refund',
          },
          ipAddress: input.ipAddress,
          source: actorSourceFor(input.cancelledBy),
        });
        return {
          ok: false,
          httpStatus: 500,
          error: 'db_failed',
          message:
            'Stripe refund succeeded but refunds record insert failed. Manual reconciliation needed.',
          partial_state: {
            stripe_refund_id: stripeRefundId,
            refund_amount_cents: refundTargetCents,
          },
        };
      }

      // Bump source transaction status to reflect the refund. Mirrors
      // pos/refunds/route.ts:644-678 — full vs partial. The source
      // transaction's max refundable is its total + tip.
      const sourceMaxRefundableCents = toCents(
        Number(sourceTx.total_amount) + Number(sourceTx.tip_amount ?? 0)
      );
      const sourceNewStatus =
        refundTargetCents >= sourceMaxRefundableCents
          ? 'refunded'
          : 'partial_refund';
      await supabase
        .from('transactions')
        .update({ status: sourceNewStatus })
        .eq('id', sourceTx.id);

      pathwayResult = {
        kind: 'refund',
        refund_id: refundRow.id,
        stripe_refund_id: stripeRefundId,
        refund_amount_cents: refundTargetCents,
        fee_cents: feeCents,
      };
    }
  } else {
    // Pathway B — credit. Issued AFTER the status flip below.
    pathwayResult =
      amountPaidCents > 0
        ? {
            kind: 'credit',
            credit_id: null, // populated after the insert below
            credit_amount_cents: amountPaidCents,
          }
        : { kind: 'noop' };
  }

  // 4. Job: mark cancelled if non-terminal. Mirrors pos/jobs/[id]/cancel
  //    (the A.4 pattern) — does NOT call executeUnMaterialize (wrong
  //    semantic; deletes the job + reverts to pending).
  //
  // Session #147 (Commit A — Bug 2 Layer 2): `jobs.appointment_id` carries a
  // UNIQUE constraint (migration `20260329000002`), so PostgREST infers 1:1
  // cardinality and returns the embedded `jobs` relation as a SINGLE OBJECT
  // `{id, status}` (or null) — NOT an array — even though the embed visually
  // reads as to-many. Pre-#147 the `(appointment.jobs ?? []) as JobRow[]`
  // cast lied at runtime: when the appointment had a materialized job, the
  // subsequent `.find(...)` threw `TypeError: (intermediate value).find is
  // not a function` → 500 "Internal server error" on every cancel attempt.
  // This is the Session #110 corrective applied symmetrically to the
  // orchestrator (GET `/api/pos/appointments/[id]` already normalizes at
  // `route.ts:83-87`). See CLAUDE.md "Supabase relation cardinality".
  const jobsRaw = appointment.jobs as JobRow | JobRow[] | null | undefined;
  const jobs: JobRow[] = Array.isArray(jobsRaw)
    ? jobsRaw
    : jobsRaw
      ? [jobsRaw]
      : [];
  const activeJob = jobs.find((j) => !TERMINAL_JOB_STATUSES.has(j.status));
  let jobCancelled = false;
  if (activeJob) {
    const { error: jobUpdErr } = await supabase
      .from('jobs')
      .update({
        status: 'cancelled',
        cancellation_reason: input.reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: input.actor.employeeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeJob.id);
    if (jobUpdErr) {
      console.error(
        '[cancel-orchestration] Job cancel failed (non-blocking, appointment cancel continues):',
        jobUpdErr.message
      );
    } else {
      jobCancelled = true;
    }
  }

  // 5. Appointment: flip status + persist fee (Pathway A only) + reason.
  const feeForColumn =
    pathwayResult.kind === 'refund' && pathwayResult.fee_cents > 0
      ? fromCents(pathwayResult.fee_cents)
      : null;
  const { error: apptUpdErr } = await supabase
    .from('appointments')
    .update({
      status: 'cancelled',
      cancellation_reason: input.reason,
      cancellation_fee: feeForColumn,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.appointmentId);

  if (apptUpdErr) {
    console.error(
      '[cancel-orchestration] Appointment status flip failed:',
      apptUpdErr.message
    );
    // Note: Pathway A may have a Stripe refund + refunds row that succeeded
    // before this failure. The refunds row is the receipt; the operator can
    // re-cancel after fixing the DB issue and the orchestrator will detect
    // the existing refund (`amountPaidCents` will show the refunded amount
    // is already gone). Honest reporting via 500.
    return {
      ok: false,
      httpStatus: 500,
      error: 'db_failed',
      message: `Appointment status flip failed: ${apptUpdErr.message}`,
    };
  }

  // 6. Pathway B credit issuance (deferred until after status flip so the
  //    credit row's source_appointment_id points at an already-cancelled
  //    appointment).
  let creditId: string | null = null;
  let creditAmountCents = 0;
  if (input.pathway === 'credit' && pathwayResult.kind === 'credit') {
    try {
      const credit = await createCustomerCredit(supabase, {
        customer_id: appointment.customer_id,
        amount_cents: pathwayResult.credit_amount_cents,
        reason: 'cancellation_refund',
        reason_note: input.reason,
        source_appointment_id: input.appointmentId,
        created_by_employee_id: input.actor.employeeId ?? undefined,
      });
      creditId = credit.id;
      creditAmountCents = credit.amount_cents;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Credit issue failed';
      console.error(
        '[cancel-orchestration] Credit issue failed AFTER appointment status flip:',
        msg
      );
      // Status is already cancelled at this point. The credit row failed to
      // land — the customer has lost track of their money in the ledger.
      // Audit log records the partial state; operator can manually issue the
      // credit via E.3's admin Credits tab.
      await logAudit({
        userId: input.actor.userId,
        userEmail: input.actor.userEmail,
        employeeName: input.actor.employeeName,
        action: 'update',
        entityType: 'booking',
        entityId: input.appointmentId,
        entityLabel: `PARTIAL: Appointment cancelled but credit insert failed`,
        details: {
          partial_state: true,
          intended_credit_amount_cents: pathwayResult.credit_amount_cents,
          customer_id: appointment.customer_id,
          source: 'cancel_orchestration',
          cancel_pathway: 'credit',
        },
        ipAddress: input.ipAddress,
        source: actorSourceFor(input.cancelledBy),
      });
      return {
        ok: false,
        httpStatus: 500,
        error: 'db_failed',
        message: `Appointment was cancelled but credit issue failed: ${msg}. Manual credit creation needed via admin Credits tab.`,
      };
    }
  }

  // 7. Audit log — single canonical entry per successful cancel.
  await logAudit({
    userId: input.actor.userId,
    userEmail: input.actor.userEmail,
    employeeName: input.actor.employeeName,
    action: 'delete',
    entityType: 'booking',
    entityId: input.appointmentId,
    entityLabel: `Appointment #${input.appointmentId.slice(0, 8)} (cancelled via ${input.cancelledBy})`,
    details: {
      cancel_pathway: input.pathway,
      cancelled_by: input.cancelledBy,
      reason: input.reason,
      amount_paid_cents: amountPaidCents,
      job_cancelled: jobCancelled,
      refund_amount_cents:
        pathwayResult.kind === 'refund' ? pathwayResult.refund_amount_cents : null,
      stripe_refund_id:
        pathwayResult.kind === 'refund' ? pathwayResult.stripe_refund_id : null,
      cancellation_fee_cents:
        pathwayResult.kind === 'refund' ? pathwayResult.fee_cents : null,
      credit_id: creditId,
      credit_amount_cents: creditAmountCents || null,
      notify_customer: input.notifyCustomer,
    },
    ipAddress: input.ipAddress,
    source: actorSourceFor(input.cancelledBy),
  });

  // 8. Notifications — fire-and-forget. Inline dispatch only; NO fireWebhook
  //    (Theme G removed that subsystem).
  if (input.notifyCustomer) {
    sendCancellationNotifications(input.appointmentId, input.reason).catch(
      (err) =>
        console.error(
          '[cancel-orchestration] Cancellation notifications failed (non-blocking):',
          err
        )
    );
  }

  // 9. Compose success result.
  const result: CancelOrchestrationSuccess = {
    ok: true,
    appointment_id: input.appointmentId,
    pathway: input.pathway,
    job_cancelled: jobCancelled,
    amount_paid_cents: amountPaidCents,
  };
  if (pathwayResult.kind === 'refund') {
    result.refund_amount_cents = pathwayResult.refund_amount_cents;
    result.refund_id = pathwayResult.refund_id ?? undefined;
    result.stripe_refund_id = pathwayResult.stripe_refund_id;
    result.cancellation_fee_cents = pathwayResult.fee_cents;
  } else if (input.pathway === 'credit') {
    result.credit_id = creditId ?? undefined;
    result.credit_amount_cents = creditAmountCents;
  }
  return result;
}

/** Translate the orchestrator's `cancelledBy` actor tag into the
 *  `audit_log.source` enum value the existing logger expects. */
function actorSourceFor(
  cancelledBy: CancelledBy
): 'admin' | 'pos' | 'customer_portal' | 'api' {
  switch (cancelledBy) {
    case 'staff_admin':
      return 'admin';
    case 'staff_pos':
      return 'pos';
    case 'customer':
      return 'customer_portal';
    case 'voice_agent':
      return 'api';
  }
}
