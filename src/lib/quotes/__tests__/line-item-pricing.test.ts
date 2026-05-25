import { describe, it, expect } from 'vitest';
import {
  getLineItemPricingInfo,
  sumLineItemSavings,
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
