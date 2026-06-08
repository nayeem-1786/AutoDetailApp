import type { TicketItem } from '../types';
import { calculateItemTax } from './tax';
import { generateId } from './generate-id';

/**
 * Phase 3 Class (b) Track A — shared ADD_CUSTOM_ITEM handler (C.1 step 3).
 *
 * Both ticket-reducer.ts and quote-reducer.ts had truly byte-identical
 * ADD_CUSTOM_ITEM cases pre-extraction — no comment differences, no
 * whitespace differences, no structural divergence (the cleanest extraction
 * candidate of the 13 shared actions). Phase A.1 audit confirmed this.
 *
 * Memory #8 override authorized for multi-session structural extraction scope.
 * No surface-specific behavior knob required (no intentional divergences to
 * preserve).
 */

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared ADD_CUSTOM_ITEM action shape. Both `TicketAction` and `QuoteAction`
 * define this case inline byte-for-byte (see types.ts:143, :265). The helper
 * accepts this structural type so a narrowed action from either reducer-
 * specific union is assignable without modifying types.ts.
 */
export interface AddCustomItemAction {
  type: 'ADD_CUSTOM_ITEM';
  name: string;
  price: number;
  isTaxable: boolean;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared ADD_CUSTOM_ITEM handler. Both reducers delegate here from their
 * `case 'ADD_CUSTOM_ITEM':` block. Returns a new state object — items[]
 * always changes (a custom item is unconditionally appended; no dedup
 * because custom items have no stable identity to match against). The
 * helper never returns reference-equal state. Consumers wrap the result in
 * their surface-specific `recalculateTotals`.
 *
 * Custom items represent staff-entered ad-hoc charges (e.g., a one-off fee
 * or service that isn't in the catalog). They have:
 *   - `itemType: 'custom'`
 *   - No productId / serviceId / categoryId
 *   - Operator-supplied name + price + isTaxable
 *   - quantity: 1 (no aggregation; each custom item is its own row)
 *   - No tier, no per-unit, no parent, no combo, no prereq
 *
 * Architectural notes:
 *   - The `<S extends { items: TicketItem[] }>` generic preserves surface-
 *     specific state fields (deposit/edit-mode/mobile/quote-meta/etc.) via
 *     spread; this helper only touches `state.items`.
 *   - Behavior is byte-equivalent to pre-extraction ticket-reducer.ts:136-169
 *     (the "Sale is the reference" rule from POS_SALE_VS_QUOTES_PARITY_AUDIT.md).
 */
export function applyAddCustomItem<S extends { items: TicketItem[] }>(
  state: S,
  action: AddCustomItemAction,
): S {
  const { name, price, isTaxable } = action;
  const newItem: TicketItem = {
    id: generateId(),
    itemType: 'custom',
    productId: null,
    serviceId: null,
    categoryId: null,
    itemName: name,
    quantity: 1,
    unitPrice: price,
    totalPrice: price,
    taxAmount: calculateItemTax(price, isTaxable),
    isTaxable,
    tierName: null,
    vehicleSizeClass: null,
    notes: null,
    perUnitQty: null,
    perUnitLabel: null,
    perUnitPrice: null,
    perUnitMax: null,
    parentItemId: null,
    standardPrice: price,
    pricingType: 'standard',
    comboSourcePrimaryId: null,
    saleEffectivePrice: null,
    prerequisiteNote: null,
    prerequisiteForServiceId: null,
  };
  return { ...state, items: [...state.items, newItem] };
}
