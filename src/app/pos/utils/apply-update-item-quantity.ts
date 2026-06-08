import type { TicketItem } from '../types';
import { calculateItemTax } from './tax';

/**
 * Phase 3 Class (b) Track A — shared UPDATE_ITEM_QUANTITY handler (C.1 step 4).
 *
 * Both ticket-reducer.ts and quote-reducer.ts had byte-identical
 * UPDATE_ITEM_QUANTITY cases pre-extraction (modulo a single explanatory
 * comment on the Sale side: `// Remove item if quantity goes below 1`).
 * Phase A.1 audit confirmed this as one of 13 byte-identical shared actions.
 *
 * Memory #8 override authorized for multi-session structural extraction scope.
 */

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared UPDATE_ITEM_QUANTITY action shape. Both `TicketAction` and
 * `QuoteAction` define this case inline byte-for-byte (see types.ts:144, :266).
 */
export interface UpdateItemQuantityAction {
  type: 'UPDATE_ITEM_QUANTITY';
  itemId: string;
  quantity: number;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared UPDATE_ITEM_QUANTITY handler. Both reducers delegate here. Returns a
 * new state object — the items[] array reference always changes (either
 * filtered when quantity < 1, or mapped when quantity ≥ 1), so the helper
 * never returns reference-equal state.
 *
 * Behavior:
 *   - `quantity < 1` → filter out the item entirely (remove-on-zero pattern;
 *     also lets the operator decrement to zero to remove a line).
 *   - `quantity ≥ 1` → update the matching item's quantity, totalPrice,
 *     and taxAmount.
 *
 * Architectural notes:
 *   - The `<S extends { items: TicketItem[] }>` generic preserves surface-
 *     specific state fields via spread; this helper only touches `state.items`.
 *   - Behavior is byte-equivalent to pre-extraction ticket-reducer.ts:144-165.
 */
export function applyUpdateItemQuantity<S extends { items: TicketItem[] }>(
  state: S,
  action: UpdateItemQuantityAction,
): S {
  const { itemId, quantity } = action;
  if (quantity < 1) {
    // Remove item if quantity goes below 1
    const items = state.items.filter((i) => i.id !== itemId);
    return { ...state, items };
  }
  const items = state.items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          quantity,
          totalPrice: item.unitPrice * quantity,
          taxAmount: calculateItemTax(
            item.unitPrice * quantity,
            item.isTaxable
          ),
        }
      : item
  );
  return { ...state, items };
}
