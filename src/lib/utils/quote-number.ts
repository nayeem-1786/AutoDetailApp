import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential quote number.
 *
 * Phase 3 Theme A (AC-10 v1.4): identifier generation is unified under the
 * shared `identifier_sequences` table + `next_identifier(entity_type)` DB
 * function. The function holds a row-level lock for the duration of its
 * counter advance, so concurrent calls serialize and cannot produce duplicate
 * values. This closes the pre-Theme-A items-error cleanup REUSE window in
 * quote-service.ts (the counter advances regardless of whether the surrounding
 * INSERT commits — a rolled-back INSERT leaves a gap, never a reuse).
 *
 * New format is Q-XXXXX starting at Q-10001; legacy 4-digit Q-XXXX rows
 * (those created before Theme A) are preserved as-is in the database and
 * surface unchanged in reporting / display.
 *
 * The function signature is unchanged — callers receive the formatted string
 * and pass it into the quotes INSERT payload exactly as before.
 */
export async function generateQuoteNumber(
  supabase?: SupabaseClient | ReturnType<typeof createAdminClient>
): Promise<string> {
  const client = supabase ?? createAdminClient();

  const { data, error } = await client.rpc('next_identifier', {
    p_entity_type: 'quote',
  });

  if (error || !data) {
    throw new Error(
      `Failed to generate quote_number: ${error?.message ?? 'no value returned'}`
    );
  }

  return data as string;
}
