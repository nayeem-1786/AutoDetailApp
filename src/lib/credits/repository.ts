/**
 * Phase 3 Theme E.1 — customer_credits repository (AC-15 foundation).
 *
 * Minimal read/write surface for the customer_credits table. Mirrors the
 * existing codebase repository convention (see src/lib/quotes/quote-service.ts
 * and src/lib/refunds/source-plan.ts): callers pass a SupabaseClient — usually
 * createAdminClient() — so the same module is callable from any server context
 * and trivially mockable in tests.
 *
 * Subsequent themes build on this surface:
 *   - E.2 (credit application logic) extends this with applyCredit / consume
 *     paths that update applied_at + applied_amount_cents + applied_to_*.
 *   - E.3 (operator UI) consumes getCustomerCreditBalance + getCustomerCreditById
 *     for the Admin > Customer > Credits tab.
 *
 * No application logic here — only direct table I/O + balance derivation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CustomerCredit,
  CreateCustomerCreditInput,
  CustomerCreditBalance,
} from './types';

/**
 * Insert a new credit row. Returns the persisted credit (with id, timestamps).
 * Throws on DB constraint violation (e.g., amount_cents <= 0).
 *
 * Used by: cancel-with-credit flow (Theme D), operator manual adjustments (E.3).
 */
export async function createCustomerCredit(
  supabase: SupabaseClient,
  input: CreateCustomerCreditInput
): Promise<CustomerCredit> {
  const { data, error } = await supabase
    .from('customer_credits')
    .insert({
      customer_id: input.customer_id,
      amount_cents: input.amount_cents,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      source_appointment_id: input.source_appointment_id ?? null,
      source_transaction_id: input.source_transaction_id ?? null,
      expires_at: input.expires_at ?? null,
      created_by_employee_id: input.created_by_employee_id ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create customer credit: ${error.message}`);
  }
  return data as CustomerCredit;
}

/**
 * Compute the customer's credit balance from the ledger.
 *
 * - total_issued_cents: sum of amount_cents across ALL rows (applied + unapplied).
 * - total_applied_cents: sum of applied_amount_cents (NULL treated as 0).
 * - available_balance_cents: total_issued - total_applied.
 * - unapplied_credits: rows where applied_at IS NULL AND not expired, sorted
 *   by expires_at (NULLS LAST) then created_at ASC. E.2's checkout-apply path
 *   walks this list in order so soonest-expiring credits are consumed first.
 *
 * Used by: checkout flow (E.2), operator UI (E.3).
 */
export async function getCustomerCreditBalance(
  supabase: SupabaseClient,
  customerId: string
): Promise<CustomerCreditBalance> {
  // We fetch all rows (not just unapplied) so total_issued + total_applied
  // are exact. The customer_credits_customer_id_idx makes this cheap; per-
  // customer credit volume is bounded (one row per cancel/adjustment event).
  const { data: allCredits, error } = await supabase
    .from('customer_credits')
    .select('*')
    .eq('customer_id', customerId)
    .order('expires_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(
      `Failed to fetch credits for customer ${customerId}: ${error.message}`
    );
  }

  const credits = (allCredits ?? []) as CustomerCredit[];

  const now = Date.now();
  let totalIssued = 0;
  let totalApplied = 0;
  const unapplied: CustomerCredit[] = [];

  for (const credit of credits) {
    totalIssued += credit.amount_cents;
    if (credit.applied_amount_cents !== null) {
      totalApplied += credit.applied_amount_cents;
    }

    // Unapplied + unexpired. Expiration is exclusive: expires_at < now means
    // expired; expires_at === now is borderline (E.2 will reject at apply-time
    // via the same comparison).
    const isExpired =
      credit.expires_at !== null && new Date(credit.expires_at).getTime() < now;
    if (credit.applied_at === null && !isExpired) {
      unapplied.push(credit);
    }
  }

  return {
    customer_id: customerId,
    total_issued_cents: totalIssued,
    total_applied_cents: totalApplied,
    available_balance_cents: totalIssued - totalApplied,
    unapplied_credits: unapplied,
  };
}

/**
 * Single-row fetch for operator UI detail views (E.3).
 * Returns null when the credit doesn't exist (PGRST116 / no rows).
 */
export async function getCustomerCreditById(
  supabase: SupabaseClient,
  creditId: string
): Promise<CustomerCredit | null> {
  const { data, error } = await supabase
    .from('customer_credits')
    .select('*')
    .eq('id', creditId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch credit ${creditId}: ${error.message}`);
  }
  return (data ?? null) as CustomerCredit | null;
}

// ============================================================================
// Phase 3 Theme E.2 — credit application (AC-15 application logic).
//
// Race-safety: applyCustomerCredit issues a conditional UPDATE — the WHERE clause
// includes `applied_at IS NULL`, so two concurrent operators racing to apply the
// same credit row produce exactly one winning UPDATE; the loser's UPDATE matches
// zero rows and surfaces as PGRST116 (no row returned by .single()), which we
// translate to a typed error the caller can recover from. The `customer_credits_
// applied_consistency` CHECK constraint (E.1 schema) backstops over-application
// at the DB layer (applied_amount_cents > amount_cents → rejected pre-commit).
//
// Credits are NOT a payment method — they're a discount applied BEFORE payment
// processing. The checkout caller computes target_amount_cents ≤ available
// balance, calls applyCustomerCreditsToTransaction, then collects cash/card for
// the REMAINING amount due. No money flows through this module.
// ============================================================================

export interface ApplyCustomerCreditInput {
  credit_id: string;
  /** How much of the credit to apply. Must be > 0 and ≤ the credit's amount_cents. */
  amount_cents: number;
  applied_to_transaction_id: string;
  applied_to_appointment_id?: string;
}

export interface ApplyCustomerCreditsToTransactionInput {
  customer_id: string;
  /** Total amount to apply across the walked credits. > 0. */
  target_amount_cents: number;
  applied_to_transaction_id: string;
  applied_to_appointment_id?: string;
}

export interface ApplyCustomerCreditsToTransactionResult {
  applied_credits: CustomerCredit[];
  total_applied_cents: number;
  remaining_balance_cents: number;
}

/** Thrown when the credit's `applied_at IS NULL` precondition fails (already applied or removed). */
export class CreditAlreadyAppliedError extends Error {
  constructor(public readonly creditId: string) {
    super(`Credit ${creditId} is already applied (race condition or missing)`);
    this.name = 'CreditAlreadyAppliedError';
  }
}

/** Thrown when the customer's available balance cannot cover target_amount_cents. */
export class InsufficientCreditBalanceError extends Error {
  constructor(
    public readonly customerId: string,
    public readonly requestedCents: number,
    public readonly availableCents: number
  ) {
    super(
      `Insufficient credit balance for customer ${customerId}: requested ${requestedCents} cents, available ${availableCents} cents`
    );
    this.name = 'InsufficientCreditBalanceError';
  }
}

/**
 * Apply a single credit (partially or fully) to a transaction.
 *
 * Race-safe via the `.is('applied_at', null)` precondition: concurrent callers
 * targeting the same credit row produce one winner + one CreditAlreadyAppliedError.
 *
 * The customer_credits_applied_consistency CHECK constraint enforces
 * applied_amount_cents <= amount_cents at the DB layer; over-application surfaces
 * as a generic insert/update error from Supabase.
 *
 * Used by: applyCustomerCreditsToTransaction (multi-credit walk), and any future
 * caller that needs single-credit application (e.g., operator UI in E.3).
 */
export async function applyCustomerCredit(
  supabase: SupabaseClient,
  input: ApplyCustomerCreditInput
): Promise<CustomerCredit> {
  if (input.amount_cents <= 0) {
    throw new Error(
      `applyCustomerCredit: amount_cents must be > 0 (got ${input.amount_cents})`
    );
  }

  const { data, error } = await supabase
    .from('customer_credits')
    .update({
      applied_at: new Date().toISOString(),
      applied_amount_cents: input.amount_cents,
      applied_to_transaction_id: input.applied_to_transaction_id,
      applied_to_appointment_id: input.applied_to_appointment_id ?? null,
    })
    .eq('id', input.credit_id)
    .is('applied_at', null) // race-protection: only apply if not already applied
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to apply credit ${input.credit_id}: ${error.message}`
    );
  }
  if (!data) {
    // Zero rows updated → another path already consumed this credit OR the id
    // doesn't exist. Either way the caller can't proceed with this specific row.
    throw new CreditAlreadyAppliedError(input.credit_id);
  }
  return data as CustomerCredit;
}

/**
 * Apply multiple credits to a transaction in expiry-first order.
 *
 * Walks the customer's unapplied + unexpired credits (already sorted by
 * expires_at NULLS LAST then created_at ASC inside getCustomerCreditBalance)
 * and consumes each in turn until target_amount_cents is reached. The last
 * credit walked may be partially consumed (applied_amount_cents < amount_cents).
 *
 * Race handling: if a credit was applied concurrently by another path, the
 * single-credit application throws CreditAlreadyAppliedError and we skip to
 * the next credit. After the loop, if remaining > 0 we throw
 * InsufficientCreditBalanceError — the caller is responsible for refunding
 * any partially-applied credits if the rollback semantics matter (the
 * checkout caller does NOT proceed with a half-paid transaction; it surfaces
 * the error to the operator and the partial applications stand as ledger
 * entries against the un-finalized transaction id).
 *
 * No retry loop — one walk through balance.unapplied_credits is sufficient.
 * Inserting a retry would only paper over a genuine concurrent-overdraw scenario
 * that the caller needs to know about.
 */
export async function applyCustomerCreditsToTransaction(
  supabase: SupabaseClient,
  input: ApplyCustomerCreditsToTransactionInput
): Promise<ApplyCustomerCreditsToTransactionResult> {
  if (input.target_amount_cents <= 0) {
    throw new Error(
      `applyCustomerCreditsToTransaction: target_amount_cents must be > 0 (got ${input.target_amount_cents})`
    );
  }

  const balance = await getCustomerCreditBalance(supabase, input.customer_id);

  if (input.target_amount_cents > balance.available_balance_cents) {
    throw new InsufficientCreditBalanceError(
      input.customer_id,
      input.target_amount_cents,
      balance.available_balance_cents
    );
  }

  const appliedCredits: CustomerCredit[] = [];
  let remainingCents = input.target_amount_cents;

  for (const credit of balance.unapplied_credits) {
    if (remainingCents <= 0) break;

    const applyAmountCents = Math.min(credit.amount_cents, remainingCents);

    try {
      const applied = await applyCustomerCredit(supabase, {
        credit_id: credit.id,
        amount_cents: applyAmountCents,
        applied_to_transaction_id: input.applied_to_transaction_id,
        applied_to_appointment_id: input.applied_to_appointment_id,
      });
      appliedCredits.push(applied);
      remainingCents -= applyAmountCents;
    } catch (err) {
      // Race condition: this specific row was consumed by another path between
      // our balance fetch and our UPDATE. Skip and try the next credit.
      if (err instanceof CreditAlreadyAppliedError) continue;
      throw err;
    }
  }

  if (remainingCents > 0) {
    // Race losses left us short. Surface the gap — the caller decides whether
    // to roll back the partially-applied credits or surface the error to the
    // operator. We do NOT auto-unapply here: that would suppress the signal
    // the operator needs to see.
    throw new InsufficientCreditBalanceError(
      input.customer_id,
      input.target_amount_cents,
      input.target_amount_cents - remainingCents
    );
  }

  const totalAppliedCents = input.target_amount_cents - remainingCents;
  return {
    applied_credits: appliedCredits,
    total_applied_cents: totalAppliedCents,
    remaining_balance_cents: balance.available_balance_cents - totalAppliedCents,
  };
}

/**
 * Reverse a credit application — clears applied_at + applied_amount_cents + targets.
 *
 * Used by: refund flows that revoke credit usage (Theme D cancel orchestration
 * will call this when a transaction-with-applied-credits is voided), operator
 * manual corrections (E.3).
 *
 * Symmetric race-protection: `.not('applied_at', 'is', null)` ensures we only
 * unapply rows that are currently applied. A no-op call (already unapplied) is
 * treated as a soft failure rather than a thrown error — the caller can decide
 * via the returned row whether action was actually taken.
 */
export async function unapplyCustomerCredit(
  supabase: SupabaseClient,
  creditId: string
): Promise<CustomerCredit | null> {
  const { data, error } = await supabase
    .from('customer_credits')
    .update({
      applied_at: null,
      applied_amount_cents: null,
      applied_to_transaction_id: null,
      applied_to_appointment_id: null,
    })
    .eq('id', creditId)
    .not('applied_at', 'is', null) // only unapply if currently applied
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to unapply credit ${creditId}: ${error.message}`);
  }
  // null = either the credit doesn't exist OR it was already unapplied.
  // Both are equivalent no-ops from the caller's perspective.
  return (data ?? null) as CustomerCredit | null;
}
