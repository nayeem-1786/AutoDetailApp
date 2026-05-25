import { describe, it, expect } from 'vitest';

import {
  formatServicesSummary,
  type ServicesSummaryItem,
} from '@/lib/quotes/services-summary';

// --------------------------------------------------------------------------
// Fixture builders mirror the live-DB shape verified in the Issue 39 audit
// (Target 2 SQL output). Reduces noise in each test case and makes
// operator-locked decisions readable as data.
// --------------------------------------------------------------------------

const HOT_SHAMPOO_ID = 'hot-shampoo-extraction-uuid';
const EXPRESS_INTERIOR_ID = 'express-interior-clean-uuid';
const CERAMIC_SHIELD_ID = '1-year-ceramic-shield-uuid';
const MOTORCYCLE_ID = 'complete-motorcycle-detail-uuid';

function hotShampoo(
  tier: 'floor_mats' | 'per_row' | 'carpet_mats' | 'complete',
  quantity: number,
  overrides: Partial<ServicesSummaryItem> = {},
): ServicesSummaryItem {
  const meta = {
    floor_mats: { label: 'Floor Mats Only', qty_label: null, order: 0, unit: 75 },
    per_row: { label: 'Per Seat Row', qty_label: 'row', order: 1, unit: 125 },
    carpet_mats: { label: 'Carpet & Mats Package', qty_label: null, order: 2, unit: 175 },
    complete: { label: 'Complete Interior', qty_label: null, order: 3, unit: 450 },
  }[tier];
  return {
    service_id: HOT_SHAMPOO_ID,
    service_name: 'Hot Shampoo Extraction',
    service_pricing_model: 'scope',
    tier_name: tier,
    tier_label: meta.label,
    qty_label: meta.qty_label,
    quantity,
    unit_price: meta.unit,
    total_price: meta.unit * quantity,
    display_order: meta.order,
    ...overrides,
  };
}

function expressInterior(
  tier: 'sedan' | 'truck_suv_2row' | 'suv_3row_van',
  quantity = 1,
): ServicesSummaryItem {
  const label = {
    sedan: 'Sedan',
    truck_suv_2row: 'Truck/SUV (2-Row)',
    suv_3row_van: 'SUV (3-Row) / Van',
  }[tier];
  const unit = { sedan: 120, truck_suv_2row: 140, suv_3row_van: 160 }[tier];
  return {
    service_id: EXPRESS_INTERIOR_ID,
    service_name: 'Express Interior Clean',
    service_pricing_model: 'vehicle_size',
    tier_name: tier,
    tier_label: label,
    qty_label: null,
    quantity,
    unit_price: unit,
    total_price: unit * quantity,
    display_order: { sedan: 0, truck_suv_2row: 1, suv_3row_van: 2 }[tier],
  };
}

function ceramicShield(): ServicesSummaryItem {
  return {
    service_id: CERAMIC_SHIELD_ID,
    service_name: '1-Year Ceramic Shield',
    service_pricing_model: 'vehicle_size',
    tier_name: 'sedan',
    tier_label: 'Sedan',
    qty_label: null,
    quantity: 1,
    unit_price: 400,
    total_price: 400,
    display_order: 0,
  };
}

function motorcycle(tier: 'standard_cruiser' | 'touring_bagger'): ServicesSummaryItem {
  const label = tier === 'standard_cruiser' ? 'Standard/Cruiser' : 'Touring/Bagger';
  const unit = tier === 'standard_cruiser' ? 200 : 250;
  return {
    service_id: MOTORCYCLE_ID,
    service_name: 'Complete Motorcycle Detail',
    service_pricing_model: 'specialty',
    tier_name: tier,
    tier_label: label,
    qty_label: null,
    quantity: 1,
    unit_price: unit,
    total_price: unit,
    display_order: tier === 'standard_cruiser' ? 0 : 1,
  };
}

// --------------------------------------------------------------------------

describe('formatServicesSummary — D45 chip composer (Issue 39)', () => {
  describe('operator-locked empirical scenarios', () => {
    it('multi-tier same-service ordered by total_price DESC (THE Issue 39 trigger / operator decision 1)', () => {
      // floor_mats × 1 @ $75 + per_row × 2 @ $125 → $250 line
      // $250 > $75 → "2 Rows" first, then "Floor Mats Only"
      const result = formatServicesSummary([
        hotShampoo('floor_mats', 1),
        hotShampoo('per_row', 2),
      ]);
      expect(result).toBe(
        'Hot Shampoo Extraction (2 Rows + Floor Mats Only)',
      );
    });

    it('single scope tier qty>1 surfaces "N Rows" (operator decision 4)', () => {
      const result = formatServicesSummary([hotShampoo('per_row', 3)]);
      expect(result).toBe('Hot Shampoo Extraction (3 Rows)');
    });

    it('single scope tier qty=1 with operator-locked tier_label kept in parens (operator decision 5, post-Issue-40)', () => {
      const result = formatServicesSummary([
        hotShampoo('carpet_mats', 1, { tier_label: 'Carpet & Mats' }),
      ]);
      expect(result).toBe('Hot Shampoo Extraction (Carpet & Mats)');
    });

    it('single scope tier qty=1 with pre-Issue-40 verbose tier_label kept in parens (operator decision 5, pre-edit)', () => {
      const result = formatServicesSummary([hotShampoo('carpet_mats', 1)]);
      expect(result).toBe(
        'Hot Shampoo Extraction (Carpet & Mats Package)',
      );
    });

    it('multi-tier scope + single-tier vehicle_size mixed (operator decision 6)', () => {
      // Hot Shampoo (parens with both tiers, ordered) + Ceramic Shield (no parens)
      const result = formatServicesSummary([
        hotShampoo('floor_mats', 1),
        hotShampoo('per_row', 2),
        ceramicShield(),
      ]);
      expect(result).toBe(
        'Hot Shampoo Extraction (2 Rows + Floor Mats Only), 1-Year Ceramic Shield',
      );
    });
  });

  describe('pricing-model-aware parens rule', () => {
    it('vehicle_size single-tier qty=1 omits parens (operator decision 6)', () => {
      expect(formatServicesSummary([expressInterior('sedan')])).toBe(
        'Express Interior Clean',
      );
    });

    it('specialty single-tier qty=1 omits parens (operator decision 6)', () => {
      expect(formatServicesSummary([motorcycle('touring_bagger')])).toBe(
        'Complete Motorcycle Detail',
      );
    });

    it('scope single-tier qty=1 ALWAYS shows parens (condition (c) — informative tier_label)', () => {
      const result = formatServicesSummary([
        hotShampoo('complete', 1),
      ]);
      expect(result).toBe('Hot Shampoo Extraction (Complete Interior)');
    });

    it('vehicle_size qty>1 forces parens even on non-scope service (defensive; max_qty validation prevents this in production but helper must handle)', () => {
      // Hypothetical: Express Interior with qty=2 (would be rejected by D43
      // max_qty validation since vehicle_size tiers don't carry qty_label,
      // but helper's behavior in this edge case must be sensible).
      const result = formatServicesSummary([expressInterior('sedan', 2)]);
      // qty>1 + qty_label=null → defensive "2 × tier_label" fallback per
      // tier-display.ts contract. Parens forced because quantity > 1.
      expect(result).toMatch(/Express Interior Clean \(2 × Sedan\)/);
    });
  });

  describe('tier ordering within a service group', () => {
    it('three different tiers sort all DESC by total_price', () => {
      // complete × 1 = $450, per_row × 2 = $250, floor_mats × 1 = $75
      const result = formatServicesSummary([
        hotShampoo('floor_mats', 1),
        hotShampoo('complete', 1),
        hotShampoo('per_row', 2),
      ]);
      // Order: complete ($450), per_row ($250), floor_mats ($75)
      expect(result).toBe(
        'Hot Shampoo Extraction (Complete Interior + 2 Rows + Floor Mats Only)',
      );
    });

    it('two tiers with identical total_price tie-break by display_order ASC', () => {
      // Synthesize two hypothetical $100 tiers via override
      const result = formatServicesSummary([
        hotShampoo('carpet_mats', 1, {
          tier_label: 'Tier B',
          unit_price: 100,
          total_price: 100,
          display_order: 5,
        }),
        hotShampoo('floor_mats', 1, {
          tier_label: 'Tier A',
          unit_price: 100,
          total_price: 100,
          display_order: 2,
          tier_name: 'tier_a_slug',
        }),
      ]);
      // Tie → display_order ASC → "Tier A" (display_order=2) before "Tier B" (display_order=5)
      expect(result).toBe('Hot Shampoo Extraction (Tier A + Tier B)');
    });
  });

  describe('edge cases', () => {
    it('empty items array returns empty string', () => {
      expect(formatServicesSummary([])).toBe('');
    });

    it('single service single tier qty=1 with NO pricing_model field defaults to no parens (graceful default)', () => {
      const item: ServicesSummaryItem = {
        service_id: 'some-uuid',
        service_name: 'Mystery Service',
        // service_pricing_model omitted
        tier_name: 'mystery_tier',
        tier_label: 'Mystery Tier',
        qty_label: null,
        quantity: 1,
        unit_price: 100,
      };
      expect(formatServicesSummary([item])).toBe('Mystery Service');
    });

    it('null service_id items group under sentinel and render correctly', () => {
      // Product-only or legacy rows with null service_id should not crash
      const result = formatServicesSummary([
        {
          service_id: null,
          service_name: 'Detail Spray Bottle',
          service_pricing_model: null,
          tier_name: null,
          tier_label: null,
          qty_label: null,
          quantity: 1,
          unit_price: 12,
        },
      ]);
      expect(result).toBe('Detail Spray Bottle');
    });

    it('mixed: scope service (parens) + flat-pricing service (no parens) → correctly differentiated', () => {
      const flatService: ServicesSummaryItem = {
        service_id: 'engine-bay-uuid',
        service_name: 'Engine Bay Detail',
        service_pricing_model: 'flat',
        tier_name: 'default',
        tier_label: null,
        qty_label: null,
        quantity: 1,
        unit_price: 175,
        total_price: 175,
      };
      const result = formatServicesSummary([
        hotShampoo('per_row', 2),
        flatService,
      ]);
      // Hot Shampoo gets parens (scope + qty>1); Engine Bay does not
      // (flat pricing_model + qty=1, tier_name='default' returns null token).
      expect(result).toBe(
        'Hot Shampoo Extraction (2 Rows), Engine Bay Detail',
      );
    });
  });

  describe('regression / backward compatibility', () => {
    it('pre-D43 quote fixture (no tier_name on items) renders bare service names like current behavior', () => {
      const result = formatServicesSummary([
        {
          service_id: 'legacy-uuid',
          service_name: 'Legacy Wash',
          service_pricing_model: 'flat',
          tier_name: null,
          tier_label: null,
          qty_label: null,
          quantity: 1,
          unit_price: 50,
        },
      ]);
      expect(result).toBe('Legacy Wash');
    });

    it('two different services single-tier each → "Service A, Service B" (no parens — byte-identical to pre-D45 naive join)', () => {
      const result = formatServicesSummary([
        expressInterior('sedan'),
        ceramicShield(),
      ]);
      expect(result).toBe('Express Interior Clean, 1-Year Ceramic Shield');
    });

    it('three services mixed (multi-tier scope + single-tier vehicle_size + single-tier specialty) all render correctly', () => {
      const result = formatServicesSummary([
        hotShampoo('floor_mats', 1),
        hotShampoo('per_row', 2),
        expressInterior('sedan'),
        motorcycle('touring_bagger'),
      ]);
      expect(result).toBe(
        'Hot Shampoo Extraction (2 Rows + Floor Mats Only), Express Interior Clean, Complete Motorcycle Detail',
      );
    });
  });
});
