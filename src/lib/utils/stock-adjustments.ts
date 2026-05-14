import type { SupabaseClient } from '@supabase/supabase-js';

export type AdjustmentType =
  | 'manual'
  | 'received'
  | 'sold'
  | 'returned'
  | 'damaged'
  | 'recount'
  | 'shop_use'
  | 'customer_retained'
  | 'voided';

export type ReferenceType =
  | 'purchase_order'
  | 'transaction'
  | 'refund'
  | 'shop_use'
  | 'stock_count'
  | 'order'
  | null;

export interface StockAdjustmentInput {
  supabase: SupabaseClient;
  product_id: string;
  adjustment_type: AdjustmentType;
  /** Signed — negative for decrement, positive for increment, 0 for audit-only rows (damage/kept). */
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_id?: string | null;
  reference_type?: ReferenceType;
  created_by: string;
  /**
   * Snapshot of unit cost in cents at call time (Phase Money-Unify-2).
   * Used by shop_use + sold rows.
   * Source is `products.cost_price_cents` (Family D, still dollars) converted
   * via `toCents()` at the call site — that's the Unify-D shim. After
   * Family D migrates, callers pass `product.cost_price_cents` directly.
   */
  unit_cost_cents?: number | null;
}

/**
 * Write a stock_adjustments audit row. Returns the inserted row ID or error.
 *
 * This helper does NOT update products.quantity_on_hand. Callers must
 * update quantity separately and pass the before/after values here.
 *
 * Every inventory movement should pass through here, including movements
 * that don't change quantity (damage write-offs, customer-retained refunds)
 * — the purpose is the audit trail, not just the quantity delta.
 */
export async function logStockAdjustment(
  input: StockAdjustmentInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { supabase, ...row } = input;
  const { data, error } = await supabase
    .from('stock_adjustments')
    .insert({
      product_id: row.product_id,
      adjustment_type: row.adjustment_type,
      quantity_change: row.quantity_change,
      quantity_before: row.quantity_before,
      quantity_after: row.quantity_after,
      reason: row.reason,
      reference_id: row.reference_id ?? null,
      reference_type: row.reference_type ?? null,
      created_by: row.created_by,
      unit_cost_cents: row.unit_cost_cents ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('stock_adjustments insert failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}
