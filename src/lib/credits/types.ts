/**
 * Phase 3 Theme E.1 — customer_credits types.
 *
 * Mirrors the schema laid down by
 * supabase/migrations/20260607184158_customer_credits_table.sql.
 * All money fields are integer cents per Rule #20 (Money-Unify). Foundation
 * for E.2 (credit application) and E.3 (operator UI).
 */

export type CustomerCreditReason =
  | 'cancellation_refund'
  | 'manual_adjustment'
  | 'goodwill'
  | 'promotional'
  | 'refund_as_credit';

export interface CustomerCredit {
  id: string;
  customer_id: string;
  amount_cents: number;
  reason: CustomerCreditReason;
  reason_note: string | null;
  source_appointment_id: string | null;
  source_transaction_id: string | null;
  applied_at: string | null;
  applied_to_appointment_id: string | null;
  applied_to_transaction_id: string | null;
  applied_amount_cents: number | null;
  expires_at: string | null;
  created_at: string;
  created_by_employee_id: string | null;
  updated_at: string;
}

export interface CreateCustomerCreditInput {
  customer_id: string;
  amount_cents: number;
  reason: CustomerCreditReason;
  reason_note?: string;
  source_appointment_id?: string;
  source_transaction_id?: string;
  expires_at?: string;
  created_by_employee_id?: string;
}

export interface CustomerCreditBalance {
  customer_id: string;
  total_issued_cents: number;
  total_applied_cents: number;
  available_balance_cents: number;
  /** Unapplied + unexpired credits, sorted by expires_at NULLS LAST then created_at ASC. */
  unapplied_credits: CustomerCredit[];
}
