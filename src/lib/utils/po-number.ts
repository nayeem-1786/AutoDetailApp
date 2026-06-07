import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential purchase-order number (PO-XXXXX, 5-digit;
 * new namespace starting at PO-10001, with the 2 legacy PO-00000X records
 * preserved as-is).
 *
 * Phase 3 Theme A (AC-10 v1.4): PO generation moved from the `tr_po_number`
 * BEFORE INSERT trigger (now dropped) to explicit application-side calls
 * into `next_identifier('purchase_order')`. The single PO-creating
 * callsite (api/admin/purchase-orders/route.ts) must call this helper and
 * supply the returned value in the INSERT payload.
 */
export async function generatePoNumber(
  supabase?: SupabaseClient | ReturnType<typeof createAdminClient>
): Promise<string> {
  const client = supabase ?? createAdminClient();

  const { data, error } = await client.rpc('next_identifier', {
    p_entity_type: 'purchase_order',
  });

  if (error || !data) {
    throw new Error(
      `Failed to generate po_number: ${error?.message ?? 'no value returned'}`
    );
  }

  return data as string;
}
