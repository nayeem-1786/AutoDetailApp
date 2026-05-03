// Shared LIFO source-plan resolver for close-out / appointment-linked refunds.
// Server and client both call the same logic so they cannot drift.
//
// - Refund route (/api/pos/refunds/route.ts) uses it to pick which source
//   transactions to walk when a close-out is being refunded.
// - GET endpoint (/api/pos/refunds/source-plan/[id]/route.ts) returns the
//   plan to the refund modal so it can show "Refund will be issued from:"
//   before the staff member commits.
//
// Inputs needed: a Supabase admin client + the target transaction's id, notes,
// appointment_id, total_amount, tip_amount, and its joined payments[]. The
// helper takes care of the sibling lookup.

import type { SupabaseClient } from '@supabase/supabase-js';
import { toCents } from '@/lib/utils/refund-math';
import {
  derivePaymentSourceLabel,
  type PaymentMethodLike,
} from '@/lib/utils/payment-source-label';

export interface SourcePayment {
  method: string;
  amount: number;
  stripe_payment_intent_id: string | null;
  /** ISO timestamp — populated for the API response so the modal can render
   * "Source · date". The server-side refund route doesn't use this field. */
  created_at?: string;
}

export interface SourceEntry {
  transaction_id: string;
  /** Recognizable label assembled via derivePaymentSourceLabel from the source
   * transaction's notes prefix. Single value per transaction (the tx is one
   * unit even when it has split tenders); the renderer adds a method
   * suffix for cash/card distinction if needed. */
  source_label: string;
  /** Newest payment timestamp on this source — drives LIFO ordering and the
   * "Source · date" label rendering. */
  newest_paid_at: string;
  payments: SourcePayment[];
  remaining_refundable_cents: number;
  total_amount: number;
  tip_amount: number;
  notes: string | null;
}

interface ResolveOpts {
  /** When true, returns the LIFO source plan even for non-close-out paths.
   * The server route uses this to fall back to a single-entry plan; the
   * modal-facing API uses isCloseOut detection only. */
  forceClose?: boolean;
}

/**
 * Detect a close-out target by the durable notes marker (Pay-Link Session 4b),
 * with a defensive secondary check for appointment-linked transactions whose
 * own payments don't cover the requested refund amount.
 */
export function isCloseOutTransaction(tx: {
  notes: string | null;
  appointment_id: string | null;
  payments?: Array<{ amount: number }> | null;
}): boolean {
  if (tx.notes === 'Closed out — fully pre-paid') return true;
  if (!tx.appointment_id) return false;
  const ownPaidCents = (tx.payments ?? []).reduce(
    (s, p) => s + toCents(Number(p.amount)),
    0
  );
  return ownPaidCents === 0;
}

/**
 * Gather LIFO sibling completed transactions on the same appointment. Each
 * source entry carries its remaining-refundable cents (cap minus prior
 * refunds), payments list, and a derived source_label. Sources with zero
 * remaining are filtered out.
 *
 * Caller is expected to have already passed the close-out detection — this
 * function returns an empty array for non-appointment-linked transactions.
 */
export async function resolveRefundSourcePlan(
  supabase: SupabaseClient,
  target: {
    id: string;
    appointment_id: string | null;
  },
  _opts: ResolveOpts = {}
): Promise<SourceEntry[]> {
  if (!target.appointment_id) return [];

  // Sibling completed transactions on the same appointment, newest first.
  // Excludes the target itself — the close-out shell has no money to refund
  // against (its payments[] is empty by design).
  const { data: siblings } = await supabase
    .from('transactions')
    .select(
      'id, total_amount, tip_amount, status, notes, transaction_date, payments(*)'
    )
    .eq('appointment_id', target.appointment_id)
    .eq('status', 'completed')
    .neq('id', target.id)
    .order('transaction_date', { ascending: false });

  const out: SourceEntry[] = [];
  for (const sib of (siblings ?? []) as Array<{
    id: string;
    total_amount: number;
    tip_amount: number | null;
    notes: string | null;
    transaction_date: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments?: any[];
  }>) {
    const payments = (sib.payments ?? []) as Array<{
      method: string;
      amount: number;
      stripe_payment_intent_id: string | null;
      created_at: string;
    }>;
    const sibPaidCents = payments.reduce(
      (s, p) => s + toCents(Number(p.amount)),
      0
    );
    if (sibPaidCents <= 0) continue;

    // Subtract any prior processed refunds against this source.
    const { data: priorRefunds } = await supabase
      .from('refunds')
      .select('amount')
      .eq('transaction_id', sib.id)
      .eq('status', 'processed');
    const priorRefundedCents = (priorRefunds ?? []).reduce(
      (s, r: { amount: number }) => s + toCents(Number(r.amount)),
      0
    );
    const remaining = Math.max(0, sibPaidCents - priorRefundedCents);
    if (remaining <= 0) continue;

    // Source label assembled from the FIRST payment's method (close-out
    // sources are typically single-tender — pay-link is card, deposit is
    // card, in-store cash sale is cash). The notes prefix takes priority.
    const firstMethod = (payments[0]?.method ?? 'cash') as PaymentMethodLike;
    const source_label = derivePaymentSourceLabel(sib.notes, firstMethod);

    // Newest payment timestamp on this source — used for LIFO ordering across
    // sources (already coming from the query order) and for the "Source ·
    // date" display. Falls back to transaction_date if payments lack
    // created_at (defensive).
    const newest_paid_at =
      payments
        .map((p) => p.created_at)
        .filter(Boolean)
        .sort()
        .pop() ?? sib.transaction_date;

    out.push({
      transaction_id: sib.id,
      source_label,
      newest_paid_at,
      payments: payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        stripe_payment_intent_id: p.stripe_payment_intent_id ?? null,
        created_at: p.created_at,
      })),
      remaining_refundable_cents: remaining,
      total_amount: Number(sib.total_amount),
      tip_amount: Number(sib.tip_amount ?? 0),
      notes: sib.notes,
    });
  }
  return out;
}

/**
 * Pure client/server-shared LIFO walk: given a sorted source plan and a
 * requested refund amount in cents, return the per-source allocations the
 * refund will draw from. Stops as soon as the requested amount is met.
 *
 * The modal calls this on every line-item selection change so the displayed
 * "Refund will be issued from:" rows match what the server will actually do.
 */
export interface SourceAllocation {
  transaction_id: string;
  source_label: string;
  newest_paid_at: string;
  amount_cents: number;
}

export function walkLifoAllocation(
  plan: SourceEntry[],
  requestedCents: number
): SourceAllocation[] {
  const out: SourceAllocation[] = [];
  let need = requestedCents;
  for (const entry of plan) {
    if (need <= 0) break;
    const portion = Math.min(need, entry.remaining_refundable_cents);
    if (portion <= 0) continue;
    out.push({
      transaction_id: entry.transaction_id,
      source_label: entry.source_label,
      newest_paid_at: entry.newest_paid_at,
      amount_cents: portion,
    });
    need -= portion;
  }
  return out;
}
