import type { TicketItem } from '../types';
import { calculateItemTax } from './tax';

/**
 * Phase 3 Class (b) Track A — shared REMOVE_ITEM handler (C.1 step 6).
 *
 * Both ticket-reducer.ts and quote-reducer.ts had byte-identical REMOVE_ITEM
 * cases pre-extraction (modulo a single explanatory comment on the Sale side:
 * `// Revert to sale price if available, otherwise standard`). Phase A.1 audit
 * confirmed this as one of 13 byte-identical shared actions.
 *
 * Memory #8 override authorized for multi-session structural extraction scope.
 *
 * The combo-promotion logic this handler implements is non-trivial — see the
 * docblock on `applyRemoveItem` for the semantics.
 */

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared REMOVE_ITEM action shape. Both `TicketAction` and `QuoteAction`
 * define this case inline byte-for-byte (see types.ts:146, :268).
 */
export interface RemoveItemAction {
  type: 'REMOVE_ITEM';
  itemId: string;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared REMOVE_ITEM handler. Both reducers delegate here. Returns a new
 * state object — items[] reference always changes (the parent is filtered
 * out, children are either promoted or filtered out too).
 *
 * Behavior (combo-promotion + child cleanup):
 *   1. Find all children of the removed item (parentItemId match).
 *   2. Combo-priced children get PROMOTED to standalone with their pricingType
 *      reverted to 'sale' (if saleEffectivePrice exists) or 'standard'. Their
 *      parentItemId is cleared and unitPrice/totalPrice/taxAmount/comboSource-
 *      PrimaryId fields are recomputed at the reverted price.
 *   3. Non-combo children are REMOVED alongside the parent.
 *   4. The final items[] excludes the parent and removed children; promoted
 *      children replace their original entries (preserving order).
 *
 * Architectural notes:
 *   - The `<S extends { items: TicketItem[] }>` generic preserves surface-
 *     specific state fields via spread; this helper only touches `state.items`.
 *   - Behavior is byte-equivalent to pre-extraction ticket-reducer.ts:157-192.
 */
export function applyRemoveItem<S extends { items: TicketItem[] }>(
  state: S,
  action: RemoveItemAction,
): S {
  // Find any children of the removed item
  const children = state.items.filter((i) => i.parentItemId === action.itemId);

  // Combo-priced children get promoted to standalone; others are removed
  const promotedChildren = children
    .filter((child) => child.pricingType === 'combo')
    .map((child) => {
      // Revert to sale price if available, otherwise standard
      const revertPrice = child.saleEffectivePrice ?? child.standardPrice;
      const newPricingType: 'sale' | 'standard' = child.saleEffectivePrice != null ? 'sale' : 'standard';
      const totalPrice = revertPrice * child.quantity;
      return {
        ...child,
        parentItemId: null,
        unitPrice: revertPrice,
        totalPrice,
        taxAmount: calculateItemTax(totalPrice, child.isTaxable),
        pricingType: newPricingType,
        comboSourcePrimaryId: null,
      };
    });

  const removedChildIds = new Set(
    children.filter((child) => child.pricingType !== 'combo').map((c) => c.id)
  );

  const items = state.items
    .filter((i) => i.id !== action.itemId && !removedChildIds.has(i.id))
    .map((i) => {
      const promoted = promotedChildren.find((p) => p.id === i.id);
      return promoted ?? i;
    });

  return { ...state, items };
}
