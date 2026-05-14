import type { SupabaseClient } from '@supabase/supabase-js';

export interface BarcodeLookupResult {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  retail_price_cents: number;
  cost_price_cents: number | null;
  is_taxable: boolean;
  is_active: boolean;
  quantity_on_hand: number;
  reorder_threshold: number | null;
  image_url: string | null;
  category_id: string | null;
  is_loyalty_eligible: boolean;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
}

const SELECT_COLUMNS =
  'id, name, sku, barcode, retail_price_cents, cost_price_cents, is_taxable, ' +
  'is_active, quantity_on_hand, reorder_threshold, image_url, category_id, ' +
  'is_loyalty_eligible, sale_price_cents, sale_starts_at, sale_ends_at';

/**
 * Resolve a scanned code to a product. Matches against `barcode` OR `sku`,
 * active products only. The SKU fallback exists because historical imports
 * (e.g. from Square) placed scan codes in the sku column. This is the
 * canonical resolution — both POS and admin endpoints MUST use this helper
 * to stay in sync.
 *
 * Throws on query error; returns null for no-match. Callers decide their
 * own HTTP shape on miss (POS returns 404, admin returns 200 with null).
 */
export async function lookupProductByScanCode(
  supabase: SupabaseClient,
  scanCode: string,
): Promise<BarcodeLookupResult | null> {
  const trimmed = scanCode.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .or(`barcode.eq.${trimmed},sku.eq.${trimmed}`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as BarcodeLookupResult | null) ?? null;
}
