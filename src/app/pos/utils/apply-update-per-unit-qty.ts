import type { TicketItem } from '../types';
import { calculateItemTax } from './tax';

/**
 * Phase 3 Class (b) Track A — shared UPDATE_PER_UNIT_QTY handler (C.1 step 5).
 *
 * Both ticket-reducer.ts and quote-reducer.ts had truly byte-identical
 * UPDATE_PER_UNIT_QTY cases pre-extraction (same comment, same whitespace,
 * same structure). Phase A.1 audit confirmed this as one of 13 byte-identical
 * shared actions.
 *
 * Memory #8 override authorized for multi-session structural extraction scope.
 */

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared UPDATE_PER_UNIT_QTY action shape. Both `TicketAction` and
 * `QuoteAction` define this case inline byte-for-byte (see types.ts:145, :267).
 */
export interface UpdatePerUnitQtyAction {
  type: 'UPDATE_PER_UNIT_QTY';
  itemId: string;
  perUnitQty: number;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared UPDATE_PER_UNIT_QTY handler. Both reducers delegate here. Adjusts
 * the per-unit quantity on a per-unit-like item (per_unit service OR scope-
 * tier-with-qty service per applyAddService's classification). Recomputes
 * unitPrice + standardPrice + saleEffectivePrice + totalPrice + taxAmount.
 *
 * Returns a new state object — items[] always changes via filter (when
 * perUnitQty < 1) or map (when perUnitQty ≥ 1). The map preserves items
 * that lack perUnitPrice unchanged (the `if (item.id !== itemId ||
 * !item.perUnitPrice) return item` guard), so dispatching on a non-per-unit
 * item is a silent no-op in items content but still produces a new array ref.
 *
 * Sale price preservation: when the existing item is on sale, the per-unit
 * sale rate is derived (saleEffectivePrice / existing.perUnitQty) and
 * re-applied at the new perUnitQty. Standard-priced items use the static
 * perUnitPrice * perUnitQty calculation.
 *
 * Architectural notes:
 *   - The `<S extends { items: TicketItem[] }>` generic preserves surface-
 *     specific state fields via spread; this helper only touches `state.items`.
 *   - Behavior is byte-equivalent to pre-extraction ticket-reducer.ts:151-176.
 */
export function applyUpdatePerUnitQty<S extends { items: TicketItem[] }>(
  state: S,
  action: UpdatePerUnitQtyAction,
): S {
  const { itemId, perUnitQty } = action;
  if (perUnitQty < 1) {
    const items = state.items.filter((i) => i.id !== itemId);
    return { ...state, items };
  }
  const items = state.items.map((item) => {
    if (item.id !== itemId || !item.perUnitPrice) return item;
    const newStandardPrice = item.perUnitPrice * perUnitQty;
    // Use sale per-unit price when on sale
    const salePricePerUnit = item.pricingType === 'sale' && item.saleEffectivePrice != null && item.perUnitQty
      ? item.saleEffectivePrice / item.perUnitQty
      : null;
    const unitPrice = salePricePerUnit != null ? salePricePerUnit * perUnitQty : newStandardPrice;
    const newSaleEffective = salePricePerUnit != null ? salePricePerUnit * perUnitQty : null;
    return {
      ...item,
      perUnitQty,
      unitPrice,
      standardPrice: newStandardPrice,
      saleEffectivePrice: newSaleEffective,
      totalPrice: unitPrice * item.quantity,
      taxAmount: calculateItemTax(unitPrice * item.quantity, item.isTaxable),
    };
  });
  return { ...state, items };
}
