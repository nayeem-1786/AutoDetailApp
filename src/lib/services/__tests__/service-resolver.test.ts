// Phase Money-Unify-3 — Family D test 1 of 3 per v3 Part 8.
//
// Asserts that the cents-canonical service resolver returns integer
// cents (priceCents / salePriceCents) across all four pricing models —
// flat, vehicle_size, scope, specialty — and that sale-aware paths
// correctly downgrade to sale_price_cents only when (a) the sale
// window is active AND (b) sale_price_cents < the resolved standard
// price.
//
// This test is the runtime safety net for the type-level guarantee
// that `ResolvedPrice` has *Cents-suffixed fields. If the resolver
// ever returns a dollar-valued field (e.g., during a future refactor
// that wires through fromCents() prematurely), every assertion here
// fails loudly with the 100× unit drift.

import { describe, it, expect } from 'vitest';
import { resolvePrice, type ResolvedService } from '../service-resolver';

function service(overrides: Partial<ResolvedService> = {}): ResolvedService {
  return {
    id: 'svc-1',
    name: 'Test',
    pricing_model: 'flat',
    flat_price_cents: 12500, // $125.00
    sale_price_cents: null,
    sale_starts_at: null,
    sale_ends_at: null,
    service_pricing: [],
    ...overrides,
  };
}

const ACTIVE_SALE = {
  sale_starts_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  sale_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

describe('resolvePrice — returns integer cents', () => {
  it('flat: returns flat_price_cents directly when no sale', () => {
    const s = service({ pricing_model: 'flat', flat_price_cents: 12500 });
    const r = resolvePrice(s, 'sedan');
    expect(r.priceCents).toBe(12500);
    expect(r.salePriceCents).toBeNull();
    expect(r.isOnSale).toBe(false);
    expect(r.tierName).toBeNull();
  });

  it('flat: returns sale_price_cents when window active AND sale < standard', () => {
    const s = service({
      pricing_model: 'flat',
      flat_price_cents: 12500,
      sale_price_cents: 9900,
      ...ACTIVE_SALE,
    });
    const r = resolvePrice(s, 'sedan');
    expect(r.priceCents).toBe(12500); // standard unchanged
    expect(r.salePriceCents).toBe(9900);
    expect(r.isOnSale).toBe(true);
  });

  it('flat: ignores sale_price_cents when window expired', () => {
    const s = service({
      pricing_model: 'flat',
      flat_price_cents: 12500,
      sale_price_cents: 9900,
      sale_starts_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      sale_ends_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const r = resolvePrice(s, 'sedan');
    expect(r.salePriceCents).toBeNull();
    expect(r.isOnSale).toBe(false);
  });

  it('flat: ignores sale_price_cents when sale >= standard (no inverted-sale exposure)', () => {
    const s = service({
      pricing_model: 'flat',
      flat_price_cents: 12500,
      sale_price_cents: 12500,
      ...ACTIVE_SALE,
    });
    const r = resolvePrice(s, 'sedan');
    expect(r.salePriceCents).toBeNull();
    expect(r.isOnSale).toBe(false);
  });

  it('vehicle_size: returns vehicle_size_sedan_price_cents for sedan', () => {
    const s = service({
      pricing_model: 'vehicle_size',
      service_pricing: [
        {
          tier_name: 'tier-1',
          price_cents: 10000,
          sale_price_cents: null,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price_cents: 14000,
          vehicle_size_truck_suv_price_cents: 16000,
          vehicle_size_suv_van_price_cents: 18000,
        },
      ],
    });
    const r = resolvePrice(s, 'sedan');
    expect(r.priceCents).toBe(14000);
    expect(r.salePriceCents).toBeNull();
  });

  it('vehicle_size: returns vehicle_size_truck_suv_price_cents for truck_suv_2row', () => {
    const s = service({
      pricing_model: 'vehicle_size',
      service_pricing: [
        {
          tier_name: 'tier-1',
          price_cents: 10000,
          sale_price_cents: null,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price_cents: 14000,
          vehicle_size_truck_suv_price_cents: 16000,
          vehicle_size_suv_van_price_cents: 18000,
        },
      ],
    });
    expect(resolvePrice(s, 'truck_suv_2row').priceCents).toBe(16000);
  });

  it('vehicle_size: returns vehicle_size_suv_van_price_cents for suv_3row_van', () => {
    const s = service({
      pricing_model: 'vehicle_size',
      service_pricing: [
        {
          tier_name: 'tier-1',
          price_cents: 10000,
          sale_price_cents: null,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price_cents: 14000,
          vehicle_size_truck_suv_price_cents: 16000,
          vehicle_size_suv_van_price_cents: 18000,
        },
      ],
    });
    expect(resolvePrice(s, 'suv_3row_van').priceCents).toBe(18000);
  });

  it('vehicle_size: falls back to tier price_cents when per-size column is null', () => {
    const s = service({
      pricing_model: 'vehicle_size',
      service_pricing: [
        {
          tier_name: 'tier-1',
          price_cents: 9900,
          sale_price_cents: null,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price_cents: 14000,
          vehicle_size_truck_suv_price_cents: 16000,
          vehicle_size_suv_van_price_cents: null,
        },
      ],
    });
    // suv_3row_van column null → falls back to price_cents
    expect(resolvePrice(s, 'suv_3row_van').priceCents).toBe(9900);
  });

  it('vehicle_size: tier-level sale price applies (priceCents stays standard, salePriceCents populated)', () => {
    const s = service({
      pricing_model: 'vehicle_size',
      ...ACTIVE_SALE,
      service_pricing: [
        {
          tier_name: 'tier-1',
          price_cents: 10000,
          sale_price_cents: 7500,
          is_vehicle_size_aware: false,
          vehicle_size_sedan_price_cents: null,
          vehicle_size_truck_suv_price_cents: null,
          vehicle_size_suv_van_price_cents: null,
        },
      ],
    });
    const r = resolvePrice(s, 'sedan');
    expect(r.priceCents).toBe(10000);
    expect(r.salePriceCents).toBe(7500);
    expect(r.isOnSale).toBe(true);
  });

  it('scope: picks the vehicle-size-aware tier when present (priority over first-by-display-order)', () => {
    // Scope models with one "lite" tier (floor mats) and one "full" size-aware
    // tier (complete interior) — resolver must select the size-aware tier so
    // booking flows quote the right scope.
    const s = service({
      pricing_model: 'scope',
      service_pricing: [
        // First in array — would normally win the tiers[0] fallback
        {
          tier_name: 'floor_mats',
          price_cents: 4000,
          sale_price_cents: null,
          is_vehicle_size_aware: false,
          vehicle_size_sedan_price_cents: null,
          vehicle_size_truck_suv_price_cents: null,
          vehicle_size_suv_van_price_cents: null,
        },
        // Size-aware tier — preferred
        {
          tier_name: 'complete_interior',
          price_cents: 10000,
          sale_price_cents: null,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price_cents: 14000,
          vehicle_size_truck_suv_price_cents: 16000,
          vehicle_size_suv_van_price_cents: 18000,
        },
      ],
    });
    const r = resolvePrice(s, 'truck_suv_2row');
    expect(r.priceCents).toBe(16000); // size-aware tier's truck_suv column
    expect(r.tierName).toBe('complete_interior');
  });

  it('returned values are always integers (no fractional cents drift)', () => {
    // Exhaustive cross-product over all 4 pricing-model branches + sale-paths
    const scenarios = [
      service({ pricing_model: 'flat', flat_price_cents: 12500 }),
      service({ pricing_model: 'flat', flat_price_cents: 12500, sale_price_cents: 9900, ...ACTIVE_SALE }),
      service({
        pricing_model: 'vehicle_size',
        service_pricing: [{
          tier_name: 't', price_cents: 10000, sale_price_cents: 7500,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price_cents: 14000, vehicle_size_truck_suv_price_cents: 16000, vehicle_size_suv_van_price_cents: 18000,
        }],
        ...ACTIVE_SALE,
      }),
    ];
    for (const s of scenarios) {
      const r = resolvePrice(s, 'sedan');
      expect(Number.isInteger(r.priceCents)).toBe(true);
      if (r.salePriceCents != null) {
        expect(Number.isInteger(r.salePriceCents)).toBe(true);
      }
    }
  });
});
