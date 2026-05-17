/**
 * Item 15f Layer 4 — `computeExpectedPrice` server-side booking-price
 * validator, rewritten as a thin wrapper around `resolveServicePriceWithSale`
 * from the canonical engine.
 *
 * Pre-Layer-4 the function had the same drift bugs Layer 3d fixed in
 * `service-resolver.ts`: missing exotic/classic size_class branches,
 * no per_unit / custom handling (per_unit and custom remain `return null`
 * by design — see the function-doc — but the underlying tier resolution
 * for vehicle_size/scope/specialty now flows through the canonical
 * engine).
 *
 * Tests pin the bug fixes against canonical fixtures + the preserved
 * return contract (`number | null`).
 */
import { describe, it, expect } from 'vitest';
import { computeExpectedPrice } from '../_pricing';
import type { ServicePricing } from '@/lib/supabase/types';

function tier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: 'p1',
    service_id: 's1',
    tier_name: 'sedan',
    tier_label: 'Sedan',
    price: 100,
    sale_price: null,
    display_order: 0,
    is_vehicle_size_aware: false,
    vehicle_size_sedan_price: null,
    vehicle_size_truck_suv_price: null,
    vehicle_size_suv_van_price: null,
    vehicle_size_exotic_price: null,
    vehicle_size_classic_price: null,
    max_qty: null,
    qty_label: null,
    created_at: '',
    ...overrides,
  };
}

describe('computeExpectedPrice — flat', () => {
  it('flat returns flat_price', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'flat',
          flat_price: 175,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [],
        },
        null,
        null,
      ),
    ).toBe(175);
  });

  it('flat with active sale returns sale_price', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'flat',
          flat_price: 200,
          sale_price: 150,
          sale_starts_at: '2020-01-01T00:00:00Z',
          sale_ends_at: '2099-12-31T23:59:59Z',
          per_unit_price: null,
          service_pricing: [],
        },
        null,
        null,
      ),
    ).toBe(150);
  });

  it('flat with flat_price null returns null', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'flat',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [],
        },
        null,
        null,
      ),
    ).toBeNull();
  });
});

describe('computeExpectedPrice — vehicle_size row-based (exotic / classic fix)', () => {
  // Row-based pattern: each tier IS a size_class.
  const rowTiers: ServicePricing[] = [
    tier({ id: 'p-sedan', tier_name: 'sedan', price: 200 }),
    tier({ id: 'p-exotic', tier_name: 'exotic', price: 450 }),
    tier({ id: 'p-classic', tier_name: 'classic', price: 725 }),
  ];

  it('exotic Ferrari with row-pattern returns $450, NOT sedan fallback', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'vehicle_size',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: rowTiers,
        },
        'exotic',
        'exotic',
      ),
    ).toBe(450);
  });

  it('classic 1-Year Ceramic Shield returns $725 (canonical fixture)', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'vehicle_size',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: rowTiers,
        },
        'classic',
        'classic',
      ),
    ).toBe(725);
  });
});

describe('computeExpectedPrice — column-based (engine reads per-size column)', () => {
  // Single tier with all 5 per-size columns set.
  const columnTier = tier({
    tier_name: 'standard',
    price: 100,
    is_vehicle_size_aware: true,
    vehicle_size_sedan_price: 200,
    vehicle_size_truck_suv_price: 250,
    vehicle_size_suv_van_price: 300,
    vehicle_size_exotic_price: 500,
    vehicle_size_classic_price: 600,
  });

  it('exotic vehicle reads vehicle_size_exotic_price (was silent fallback pre-Layer-4)', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'scope',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [columnTier],
        },
        'standard',
        'exotic',
      ),
    ).toBe(500);
  });

  it('classic vehicle reads vehicle_size_classic_price', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'scope',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [columnTier],
        },
        'standard',
        'classic',
      ),
    ).toBe(600);
  });

  it('sedan vehicle reads vehicle_size_sedan_price', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'scope',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [columnTier],
        },
        'standard',
        'sedan',
      ),
    ).toBe(200);
  });
});

describe('computeExpectedPrice — preserved skip-validation contract', () => {
  it('per_unit returns null (deferred validation)', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'per_unit',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: 150,
          service_pricing: [],
        },
        null,
        null,
      ),
    ).toBeNull();
  });

  it('custom returns null (operator-assessed, skip validation)', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'custom',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [],
        },
        null,
        null,
      ),
    ).toBeNull();
  });

  it('vehicle_size with missing tier returns null (skip rather than mis-validate)', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'vehicle_size',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [tier({ tier_name: 'sedan', price: 200 })],
        },
        'nonexistent_tier',
        'sedan',
      ),
    ).toBeNull();
  });

  it('unknown pricing_model returns null', () => {
    expect(
      computeExpectedPrice(
        {
          pricing_model: 'mystery_future_model',
          flat_price: null,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          service_pricing: [],
        },
        null,
        null,
      ),
    ).toBeNull();
  });
});
