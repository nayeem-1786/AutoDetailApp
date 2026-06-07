import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential work-order number.
 *
 * Phase 3 Theme A (AC-10 v1.4): identifier generation is unified under the
 * shared `identifier_sequences` table + `next_identifier(entity_type)` DB
 * function with row-level locking. See `quote-number.ts` for the full
 * rationale.
 *
 * New format is WO-XXXXX starting at WO-10001; legacy 5-digit WO-XXXXX rows
 * issued by the pre-Theme-A γ generator (counter ≤ ~10042 per Phase 3.0.1
 * audit) are preserved as-is — the new sequence's 10001 floor is below the
 * legacy ceiling but the deferred-to-payment-success assignment timing
 * ensures the next call after Theme A returns a value above the
 * identifier_sequences seed (10001) regardless of the legacy max.
 *
 * Assignment timing is unchanged — the order_number is still issued at
 * payment-success time (Stripe webhook), not at order-creation time. The
 * generator's contract (return next formatted string) matches the pre-Theme-A
 * shape exactly.
 */
export async function generateOrderNumber(
  supabase?: SupabaseClient | ReturnType<typeof createAdminClient>
): Promise<string> {
  const client = supabase ?? createAdminClient();

  const { data, error } = await client.rpc('next_identifier', {
    p_entity_type: 'work_order',
  });

  if (error || !data) {
    throw new Error(
      `Failed to generate order_number: ${error?.message ?? 'no value returned'}`
    );
  }

  return data as string;
}
