import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential receipt number (SD-XXXXX, 5-digit, continues
 * from current MAX of existing SD-XXXXX rows).
 *
 * Phase 3 Theme A (AC-10 v1.4): receipt generation moved from the
 * `tr_transaction_receipt_number` BEFORE INSERT trigger (now dropped) to
 * explicit application-side calls into `next_identifier('receipt')`. The
 * trigger's pre-Theme-A 6-digit format (SD-XXXXXX) is gone — every existing
 * row was reformatted to 5-digit in the v1.4 backfill, and every new row
 * issues at 5-digit from the unified sequence.
 *
 * Every transaction-creating callsite MUST call this helper and supply the
 * returned value in the `receipt_number` column of the INSERT payload —
 * without the trigger to backfill NULLs, an omitted column would leave the
 * row's receipt_number as NULL (the column itself stays NULLABLE for
 * historical reasons + the small set of code paths that intentionally
 * create transaction rows without a receipt — see DB_SCHEMA.md).
 */
export async function generateReceiptNumber(
  supabase?: SupabaseClient | ReturnType<typeof createAdminClient>
): Promise<string> {
  const client = supabase ?? createAdminClient();

  const { data, error } = await client.rpc('next_identifier', {
    p_entity_type: 'receipt',
  });

  if (error || !data) {
    throw new Error(
      `Failed to generate receipt_number: ${error?.message ?? 'no value returned'}`
    );
  }

  return data as string;
}
