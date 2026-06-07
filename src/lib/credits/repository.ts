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
