import type { Product } from '@/lib/supabase/types';
import type { TicketItem } from '../types';
import { calculateItemTax } from './tax';
import { generateId } from './generate-id';

/**
 * Phase 3 Class (b) Track A — shared ADD_PRODUCT handler (C.1 step 2).
 *
 * Both ticket-reducer.ts and quote-reducer.ts had byte-identical ADD_PRODUCT
 * cases pre-extraction (modulo a single explanatory comment in
 * ticket-reducer.ts:127 that quote-reducer.ts lacked — code identical).
 * Phase A.1 audit confirmed this as one of 13 byte-identical shared actions;
 * this is the second to be extracted (first was applyAddService in C.1 step 1).
 *
 * Memory #8 override authorized for multi-session structural extraction scope.
 * No surface-specific behavior knobs required (no intentional divergences to
 * preserve — `ApplyAddServiceOptions`-style knob is unnecessary here).
 */

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared ADD_PRODUCT action shape. Both `TicketAction` and `QuoteAction`
 * define this case inline byte-for-byte (see types.ts:141, :263). The helper
 * accepts this structural type so a narrowed action from either reducer-
 * specific union is assignable without modifying types.ts.
 */
export interface AddProductAction {
  type: 'ADD_PRODUCT';
  product: Product;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared ADD_PRODUCT handler. Both reducers delegate here from their
 * `case 'ADD_PRODUCT':` block. Returns a new state object — items[] ALWAYS
 * changes (existing match → quantity increment; no match → new item appended),
 * so the helper never returns reference-equal state. Consumers wrap the
 * result in their surface-specific `recalculateTotals`.
 *
 * Behavior:
 *   - Existing product on the cart (same productId) → increment quantity by 1,
 *     recompute totalPrice and taxAmount on that row.
 *   - No existing product → append a new TicketItem with default fields,
 *     pricingType: 'standard', no parent/prereq linkage.
 *
 * Architectural notes:
 *   - The `<S extends { items: TicketItem[] }>` generic preserves surface-
 *     specific state fields (deposit/edit-mode/mobile/quote-meta/etc.) via
 *     spread; this helper only touches `state.items`.
 *   - Behavior is byte-equivalent to pre-extraction ticket-reducer.ts:125-179
 *     (the "Sale is the reference" rule from POS_SALE_VS_QUOTES_PARITY_AUDIT.md).
 */
export function applyAddProduct<S extends { items: TicketItem[] }>(
  state: S,
  action: AddProductAction,
): S {
  const { product } = action;

  // Check if product already in cart — increment quantity.
  const existing = state.items.find(
    (i) => i.itemType === 'product' && i.productId === product.id
  );

  let items: TicketItem[];
  if (existing) {
    items = state.items.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            quantity: item.quantity + 1,
            totalPrice: item.unitPrice * (item.quantity + 1),
            taxAmount: calculateItemTax(
              item.unitPrice * (item.quantity + 1),
              item.isTaxable
            ),
          }
        : item
    );
  } else {
    const totalPrice = product.retail_price;
    const newItem: TicketItem = {
      id: generateId(),
      itemType: 'product',
      productId: product.id,
      serviceId: null,
      categoryId: product.category_id ?? null,
      itemName: product.name,
      quantity: 1,
      unitPrice: product.retail_price,
      totalPrice,
      taxAmount: calculateItemTax(totalPrice, product.is_taxable),
      isTaxable: product.is_taxable,
      tierName: null,
      vehicleSizeClass: null,
      notes: null,
      perUnitQty: null,
      perUnitLabel: null,
      perUnitPrice: null,
      perUnitMax: null,
      parentItemId: null,
      standardPrice: product.retail_price,
      pricingType: 'standard',
      comboSourcePrimaryId: null,
      saleEffectivePrice: null,
      prerequisiteNote: null,
      prerequisiteForServiceId: null,
    };
    items = [...state.items, newItem];
  }
  return { ...state, items };
}
