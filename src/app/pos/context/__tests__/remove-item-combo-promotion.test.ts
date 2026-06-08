/**
 * Phase 3 Class (b) C.1 step 6 regression test — REMOVE_ITEM combo-promotion
 * + child-cleanup behavior on BOTH reducers (Sale/Quote parity).
 *
 * Fills the test coverage gap identified during C.1 step 6 review: the
 * combo-promotion path of REMOVE_ITEM was previously uncovered by the
 * existing 383-test POS suite. Protects:
 *
 *   1. The shared `applyRemoveItem` helper's combo-promotion semantics:
 *      - Parent removed
 *      - Combo-priced children PROMOTED to standalone with `parentItemId`
 *        cleared, pricingType reverted to 'sale' (if saleEffectivePrice
 *        exists) or 'standard', and unitPrice/totalPrice/comboSourcePrimaryId
 *        recomputed
 *      - Non-combo children FILTERED OUT alongside parent
 *
 *   2. Reducer parity — every assertion runs against BOTH `ticketReducer` and
 *      `quoteReducer` and `expect(quoteResult.items).toEqual(ticketResult.items)`
 *      enforces that the shared helper produces byte-identical results across
 *      both surfaces.
 *
 * Failure mode this catches: a future paste error in the helper's promoted-
 * children return shape (e.g., dropping `...child` spread, `parentItemId: null`,
 * `unitPrice: revertPrice`, or `totalPrice` recompute) would silently leave
 * combo children mispriced with dangling parent linkage after their parent
 * is removed — without this test, the 383-pass invariant would not have
 * fired. Same protection extends to any future modification of
 * `apply-remove-item.ts`.
 */
import { describe, it, expect } from 'vitest';
import { ticketReducer, initialTicketState } from '../ticket-reducer';
import { quoteReducer, initialQuoteState } from '../quote-reducer';
import type { TicketItem, TicketState, QuoteState } from '../../types';

/**
 * Build a TicketItem with all required fields. Test fixtures override only
 * what's relevant per case; everything else defaults to a neutral shape
 * (no tier, no per-unit, no vehicle, no prereq, no notes).
 */
function buildItem(overrides: Partial<TicketItem> & { id: string }): TicketItem {
  return {
    // id comes from ...overrides spread below; explicit field removed to silence
    // TS2783 (the spread's id is identical to overrides.id but TS flags the duplicate).
    itemType: 'service',
    productId: null,
    serviceId: null,
    categoryId: null,
    itemName: 'Test Item',
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    taxAmount: 0,
    isTaxable: false,
    tierName: null,
    vehicleSizeClass: null,
    notes: null,
    perUnitQty: null,
    perUnitLabel: null,
    perUnitPrice: null,
    perUnitMax: null,
    parentItemId: null,
    standardPrice: 0,
    pricingType: 'standard',
    comboSourcePrimaryId: null,
    saleEffectivePrice: null,
    prerequisiteNote: null,
    prerequisiteForServiceId: null,
    ...overrides,
  };
}

/**
 * Dispatch REMOVE_ITEM against the same starting items[] on BOTH reducers,
 * assert resulting items[] arrays are byte-identical (parity invariant), and
 * return the items array for case-specific assertions.
 */
function dispatchOnBoth(items: TicketItem[], itemId: string): TicketItem[] {
  const ticketState: TicketState = { ...initialTicketState, items };
  const quoteState: QuoteState = { ...initialQuoteState, items };
  const ticketResult = ticketReducer(ticketState, { type: 'REMOVE_ITEM', itemId });
  const quoteResult = quoteReducer(quoteState, { type: 'REMOVE_ITEM', itemId });
  // Parity invariant — Sale and Quote MUST produce identical items[] for the
  // same input (the structural guarantee C.1 enforces).
  expect(quoteResult.items).toEqual(ticketResult.items);
  return ticketResult.items;
}

describe('REMOVE_ITEM — combo-promotion + child cleanup (Sale/Quote parity)', () => {
  it('removes parent and filters non-combo child entirely (both reducers)', () => {
    const parent = buildItem({
      id: 'parent',
      itemName: 'Parent',
      unitPrice: 100,
      totalPrice: 100,
      standardPrice: 100,
    });
    const stdChild = buildItem({
      id: 'std-child',
      itemName: 'Standard Child',
      parentItemId: 'parent',
      unitPrice: 25,
      totalPrice: 25,
      standardPrice: 25,
      pricingType: 'standard',
    });
    const result = dispatchOnBoth([parent, stdChild], 'parent');
    expect(result).toEqual([]);
  });

  it('promotes combo child (no saleEffectivePrice) to standalone with reverted standard pricing (both reducers)', () => {
    const parent = buildItem({
      id: 'parent',
      itemName: 'Parent',
      unitPrice: 100,
      totalPrice: 100,
      standardPrice: 100,
    });
    const comboChild = buildItem({
      id: 'combo-child',
      itemName: 'Combo Child',
      quantity: 2,
      parentItemId: 'parent',
      unitPrice: 30,        // combo price
      totalPrice: 60,
      standardPrice: 50,     // standalone catalog price
      pricingType: 'combo',
      comboSourcePrimaryId: 'parent',
      saleEffectivePrice: null,
    });
    const result = dispatchOnBoth([parent, comboChild], 'parent');
    expect(result).toHaveLength(1);
    const promoted = result[0];
    expect(promoted.id).toBe('combo-child');               // ...child spread preserved
    expect(promoted.itemName).toBe('Combo Child');         // ...child spread preserved
    expect(promoted.parentItemId).toBeNull();              // parentItemId cleared
    expect(promoted.pricingType).toBe('standard');         // reverted (no sale price)
    expect(promoted.unitPrice).toBe(50);                   // reverted to standardPrice
    expect(promoted.totalPrice).toBe(50 * 2);              // revertPrice × quantity
    expect(promoted.comboSourcePrimaryId).toBeNull();      // combo linkage cleared
    expect(promoted.standardPrice).toBe(50);               // preserved via spread
    expect(promoted.quantity).toBe(2);                     // preserved via spread
  });

  it('promotes combo child (with saleEffectivePrice) to standalone with reverted sale pricing (both reducers)', () => {
    const parent = buildItem({
      id: 'parent',
      itemName: 'Parent',
      unitPrice: 100,
      totalPrice: 100,
      standardPrice: 100,
    });
    const comboChild = buildItem({
      id: 'combo-child',
      itemName: 'Combo Child',
      quantity: 3,
      parentItemId: 'parent',
      unitPrice: 30,           // combo price
      totalPrice: 90,
      standardPrice: 50,        // standalone catalog price
      pricingType: 'combo',
      comboSourcePrimaryId: 'parent',
      saleEffectivePrice: 40,   // active sale at $40
    });
    const result = dispatchOnBoth([parent, comboChild], 'parent');
    expect(result).toHaveLength(1);
    const promoted = result[0];
    expect(promoted.id).toBe('combo-child');               // ...child spread preserved
    expect(promoted.parentItemId).toBeNull();              // parentItemId cleared
    expect(promoted.pricingType).toBe('sale');             // reverted (sale price exists)
    expect(promoted.unitPrice).toBe(40);                   // reverted to saleEffectivePrice
    expect(promoted.totalPrice).toBe(40 * 3);              // revertPrice × quantity
    expect(promoted.comboSourcePrimaryId).toBeNull();      // combo linkage cleared
    expect(promoted.standardPrice).toBe(50);               // preserved via spread
    expect(promoted.saleEffectivePrice).toBe(40);          // preserved via spread (still on sale)
  });

  it('handles mixed children — combo child promoted, non-combo child filtered (both reducers)', () => {
    const parent = buildItem({
      id: 'parent',
      itemName: 'Parent',
      unitPrice: 100,
      totalPrice: 100,
      standardPrice: 100,
    });
    const comboChild = buildItem({
      id: 'combo-child',
      itemName: 'Combo Child',
      quantity: 1,
      parentItemId: 'parent',
      unitPrice: 30,
      totalPrice: 30,
      standardPrice: 50,
      pricingType: 'combo',
      comboSourcePrimaryId: 'parent',
    });
    const stdChild = buildItem({
      id: 'std-child',
      itemName: 'Standard Child',
      parentItemId: 'parent',
      unitPrice: 25,
      totalPrice: 25,
      standardPrice: 25,
      pricingType: 'standard',
    });
    const result = dispatchOnBoth([parent, comboChild, stdChild], 'parent');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('combo-child');
    expect(result[0].parentItemId).toBeNull();
    expect(result[0].pricingType).toBe('standard');
    expect(result[0].unitPrice).toBe(50);
    expect(result[0].totalPrice).toBe(50);                 // 50 × 1
    expect(result[0].comboSourcePrimaryId).toBeNull();
    // Non-combo sibling is filtered out
    expect(result.find((i) => i.id === 'std-child')).toBeUndefined();
  });
});
