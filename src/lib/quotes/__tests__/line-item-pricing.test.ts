import { describe, it, expect } from 'vitest';
import {
  getLineItemPricingInfo,
  sumLineItemSavings,
  computePreDiscountSubtotal,
  type LineItemPricingInput,
} from '../line-item-pricing';

function makeItem(overrides: Partial<LineItemPricingInput> = {}): LineItemPricingInput {
  return {
    unit_price: 100,
    standard_price: null,
    pricing_type: 'standard',
    quantity: 1,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────
// getLineItemPricingInfo — predicate + computation
// ───────────────────────────────────────────────────────────────

describe('getLineItemPricingInfo — no-discount paths', () => {
  it('returns hasDiscount=false for pricing_type=standard', () => {
    const info = getLineItemPricingInfo(makeItem({ pricing_type: 'standard' }));
    expect(info).toEqual({
      hasDiscount: false,
      label: null,
      standardPrice: null,
      savingsPerUnit: 0,
      totalSavings: 0,
    });
  });

  it('returns hasDiscount=false when pricing_type is null', () => {
    const info = getLineItemPricingInfo(
      makeItem({ pricing_type: null, standard_price: 125 }),
    );
    expect(info.hasDiscount).toBe(false);
  });

  it('returns hasDiscount=false when standard_price is null even with pricing_type=combo (defensive)', () => {
    const info = getLineItemPricingInfo(
      makeItem({ pricing_type: 'combo', standard_price: null }),
    );
    expect(info.hasDiscount).toBe(false);
  });

  it('returns hasDiscount=false when standard_price equals unit_price (no actual savings)', () => {
    const info = getLineItemPricingInfo(
      makeItem({ pricing_type: 'sale', standard_price: 100, unit_price: 100 }),
    );
    expect(info.hasDiscount).toBe(false);
  });

  it('returns hasDiscount=false when standard_price is LESS than unit_price (anomalous data — defensive)', () => {
    const info = getLineItemPricingInfo(
      makeItem({ pricing_type: 'sale', standard_price: 80, unit_price: 100 }),
    );
    expect(info.hasDiscount).toBe(false);
  });

  it("returns hasDiscount=false for pricing_type='standard' even when standard_price > unit_price (no discount unless combo or sale)", () => {
    const info = getLineItemPricingInfo(
      makeItem({ pricing_type: 'standard', standard_price: 125, unit_price: 100 }),
    );
    expect(info.hasDiscount).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// getLineItemPricingInfo — discount paths
// ───────────────────────────────────────────────────────────────

describe('getLineItemPricingInfo — combo discount', () => {
  it('returns hasDiscount=true with label=Combo and correct savings', () => {
    const info = getLineItemPricingInfo(
      makeItem({ pricing_type: 'combo', standard_price: 125, unit_price: 100 }),
    );
    expect(info).toEqual({
      hasDiscount: true,
      label: 'Combo',
      standardPrice: 125,
      savingsPerUnit: 25,
      totalSavings: 25,
    });
  });

  it('multiplies totalSavings by quantity', () => {
    const info = getLineItemPricingInfo(
      makeItem({
        pricing_type: 'combo',
        standard_price: 125,
        unit_price: 100,
        quantity: 3,
      }),
    );
    expect(info.savingsPerUnit).toBe(25);
    expect(info.totalSavings).toBe(75);
  });

  it('defaults quantity to 1 when undefined', () => {
    const info = getLineItemPricingInfo({
      pricing_type: 'combo',
      standard_price: 125,
      unit_price: 100,
    });
    expect(info.totalSavings).toBe(25);
  });
});

describe('getLineItemPricingInfo — sale discount', () => {
  it('returns hasDiscount=true with label=Sale and correct savings', () => {
    const info = getLineItemPricingInfo(
      makeItem({ pricing_type: 'sale', standard_price: 200, unit_price: 150 }),
    );
    expect(info).toEqual({
      hasDiscount: true,
      label: 'Sale',
      standardPrice: 200,
      savingsPerUnit: 50,
      totalSavings: 50,
    });
  });
});

// ───────────────────────────────────────────────────────────────
// sumLineItemSavings — aggregation
// ───────────────────────────────────────────────────────────────

describe('sumLineItemSavings', () => {
  it('returns 0 for empty array', () => {
    expect(sumLineItemSavings([])).toBe(0);
  });

  it('returns 0 when all items are standard pricing', () => {
    const items = [
      makeItem({ pricing_type: 'standard' }),
      makeItem({ pricing_type: 'standard', unit_price: 200 }),
    ];
    expect(sumLineItemSavings(items)).toBe(0);
  });

  it('sums savings across mixed combo and sale items', () => {
    const items: LineItemPricingInput[] = [
      makeItem({ pricing_type: 'combo', standard_price: 125, unit_price: 100 }), // 25
      makeItem({ pricing_type: 'sale', standard_price: 200, unit_price: 150 }), // 50
      makeItem({ pricing_type: 'standard', unit_price: 50 }), // 0
    ];
    expect(sumLineItemSavings(items)).toBe(75);
  });

  it('respects quantity in the aggregate', () => {
    const items: LineItemPricingInput[] = [
      makeItem({ pricing_type: 'combo', standard_price: 125, unit_price: 100, quantity: 2 }), // 50
      makeItem({ pricing_type: 'sale', standard_price: 100, unit_price: 80, quantity: 3 }), // 60
    ];
    expect(sumLineItemSavings(items)).toBe(110);
  });

  it('skips items where standard_price is null or pricing_type is standard', () => {
    const items: LineItemPricingInput[] = [
      makeItem({ pricing_type: 'combo', standard_price: null, unit_price: 100 }),
      makeItem({ pricing_type: 'standard', standard_price: 125, unit_price: 100 }),
      makeItem({ pricing_type: 'sale', standard_price: 120, unit_price: 100 }), // 20
    ];
    expect(sumLineItemSavings(items)).toBe(20);
  });
});

// ───────────────────────────────────────────────────────────────
// computePreDiscountSubtotal — retail-convention pre-discount math
// ───────────────────────────────────────────────────────────────

describe('computePreDiscountSubtotal', () => {
  it('returns 0 for empty array', () => {
    expect(computePreDiscountSubtotal([])).toBe(0);
  });

  it('all standard pricing → returns sum of unit_prices', () => {
    const items = [
      makeItem({ pricing_type: 'standard', unit_price: 85 }),
      makeItem({ pricing_type: 'standard', unit_price: 175 }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(260);
  });

  it('single combo item → contributes standard_price, not unit_price', () => {
    const items = [
      makeItem({ pricing_type: 'combo', standard_price: 125, unit_price: 100 }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(125);
  });

  it('single sale item → contributes standard_price, not unit_price', () => {
    const items = [
      makeItem({ pricing_type: 'sale', standard_price: 200, unit_price: 150 }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(200);
  });

  it('mixed combo + standard → combo uses standard, others use unit_price', () => {
    const items = [
      makeItem({ pricing_type: 'standard', unit_price: 85 }),
      makeItem({ pricing_type: 'combo', standard_price: 125, unit_price: 100 }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(210); // 85 + 125
  });

  it('Q-0084 scenario: Express Interior + Pet Hair combo + Stain Treatment', () => {
    const items = [
      makeItem({ pricing_type: 'standard', unit_price: 85 }), // Express Interior
      makeItem({ pricing_type: 'combo', standard_price: 125, unit_price: 100 }), // Pet Hair combo
      makeItem({ pricing_type: 'standard', unit_price: 175 }), // Stain Treatment
    ];
    expect(computePreDiscountSubtotal(items)).toBe(385); // 85 + 125 + 175
  });

  it('respects quantity for discounted items (standard_price × qty)', () => {
    const items = [
      makeItem({
        pricing_type: 'combo',
        standard_price: 125,
        unit_price: 100,
        quantity: 3,
      }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(375); // 125 × 3
  });

  it('respects quantity for non-discounted items (unit_price × qty)', () => {
    const items = [
      makeItem({ pricing_type: 'standard', unit_price: 50, quantity: 4 }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(200);
  });

  it('discounted item with null standard_price → falls back to unit_price (defensive)', () => {
    const items = [
      makeItem({ pricing_type: 'combo', standard_price: null, unit_price: 100 }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(100);
  });

  it('discounted item where standard_price <= unit_price → falls back to unit_price (no real discount)', () => {
    const items = [
      makeItem({ pricing_type: 'sale', standard_price: 80, unit_price: 100 }),
    ];
    expect(computePreDiscountSubtotal(items)).toBe(100);
  });

  // ───────────────────────────────────────────────────────────────
  // The load-bearing invariant: subtotal - savings === total
  // ───────────────────────────────────────────────────────────────

  it('invariant: subtotal - savings === sum(unit_price × quantity) — Q-0084 scenario', () => {
    const items = [
      makeItem({ pricing_type: 'standard', unit_price: 85 }),
      makeItem({ pricing_type: 'combo', standard_price: 125, unit_price: 100 }),
      makeItem({ pricing_type: 'standard', unit_price: 175 }),
    ];
    const subtotal = computePreDiscountSubtotal(items);
    const savings = sumLineItemSavings(items);
    const total = items.reduce(
      (sum, i) => sum + i.unit_price * (i.quantity ?? 1),
      0,
    );
    expect(subtotal - savings).toBe(total);
    expect(subtotal).toBe(385);
    expect(savings).toBe(25);
    expect(total).toBe(360);
  });

  it('invariant: subtotal - savings === total — mixed combo + sale + standard', () => {
    const items: LineItemPricingInput[] = [
      makeItem({ pricing_type: 'sale', standard_price: 75, unit_price: 50, quantity: 1 }),
      makeItem({ pricing_type: 'combo', standard_price: 100, unit_price: 80, quantity: 1 }),
      makeItem({ pricing_type: 'standard', unit_price: 200 }),
    ];
    const subtotal = computePreDiscountSubtotal(items);
    const savings = sumLineItemSavings(items);
    const total = items.reduce(
      (sum, i) => sum + i.unit_price * (i.quantity ?? 1),
      0,
    );
    expect(subtotal - savings).toBe(total);
    expect(subtotal).toBe(375); // 75 + 100 + 200
    expect(savings).toBe(45); // 25 + 20
    expect(total).toBe(330); // 50 + 80 + 200
  });

  it('invariant: subtotal === total when no discounts apply (savings row hidden)', () => {
    const items = [
      makeItem({ pricing_type: 'standard', unit_price: 85 }),
      makeItem({ pricing_type: 'standard', unit_price: 175 }),
    ];
    const subtotal = computePreDiscountSubtotal(items);
    const savings = sumLineItemSavings(items);
    expect(subtotal).toBe(260);
    expect(savings).toBe(0);
    expect(subtotal - savings).toBe(subtotal);
  });
});
