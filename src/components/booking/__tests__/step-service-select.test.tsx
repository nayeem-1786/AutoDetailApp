import { describe, it, expect } from 'vitest';
import { computePrice, getServicePriceDisplay } from '../step-service-select';
import type { BookableService } from '@/lib/data/booking';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

// Item 15f Layer 3c — Booking wizard price-math migration to canonical engine.
// These tests pin the wizard's price math against the 6 `pricing_model` values.
// All computations flow through `resolveServicePrice` /
// `resolveServicePriceWithSale` from `src/lib/services/picker-engine.ts` per
// CLAUDE.md Rule 22; the wizard's only contribution is synthesizing tier rows
// for `flat`/`per_unit` and multiplying by quantity for `per_unit`.

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

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

function service(overrides: Partial<BookableService> = {}): BookableService {
  return {
    id: 'svc-1',
    name: 'Test Service',
    slug: 'test-service',
    description: null,
    category_id: null,
    pricing_model: 'flat',
    classification: 'service',
    base_duration_minutes: 60,
    flat_price: null,
    custom_starting_price: null,
    per_unit_price: null,
    per_unit_max: null,
    per_unit_label: null,
    mobile_eligible: true,
    online_bookable: true,
    staff_assessed: false,
    is_taxable: true,
    vehicle_compatibility: [],
    special_requirements: null,
    image_url: null,
    image_alt: null,
    is_active: true,
    show_on_website: true,
    is_featured: false,
    display_order: 0,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    created_at: '',
    updated_at: '',
    service_pricing: [],
    service_addon_suggestions: [],
    ...overrides,
  } as BookableService;
}

// ───────────────────────────────────────────────────────────────
// computePrice — exhaustive per pricing_model
// ───────────────────────────────────────────────────────────────

describe('computePrice — flat pricing_model', () => {
  it('Engine Bay Detail (flat $175) — no tier dependency', () => {
    const svc = service({ pricing_model: 'flat', flat_price: 175 });
    expect(computePrice(svc, undefined, null, 1)).toBe(175);
  });

  it('flat_price null returns 0', () => {
    const svc = service({ pricing_model: 'flat', flat_price: null });
    expect(computePrice(svc, undefined, null, 1)).toBe(0);
  });

  it('flat with active sale uses sale_price when lower', () => {
    const svc = service({
      pricing_model: 'flat',
      flat_price: 200,
      sale_price: 150,
      sale_starts_at: '2020-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T23:59:59Z',
    });
    expect(computePrice(svc, undefined, null, 1)).toBe(150);
  });
});

describe('computePrice — vehicle_size pricing_model (row-based pattern)', () => {
  // Row-based: tier_name = size_class, is_vehicle_size_aware = false on each row.
  // Wizard picks the row matching vehicle size; engine returns tier.price directly.
  const sedanTier = tier({ id: 'p-sedan', tier_name: 'sedan', price: 200 });
  const truckTier = tier({ id: 'p-truck', tier_name: 'truck_suv_2row', price: 250 });
  const vanTier = tier({ id: 'p-van', tier_name: 'suv_3row_van', price: 300 });
  const exoticTier = tier({ id: 'p-exotic', tier_name: 'exotic', price: 450 });
  const classicTier = tier({ id: 'p-classic', tier_name: 'classic', price: 725 });

  const exoticService = service({
    pricing_model: 'vehicle_size',
    service_pricing: [sedanTier, truckTier, vanTier, exoticTier, classicTier],
  });

  it('Exotic vehicle resolves to exotic tier ($450, NOT sedan $200)', () => {
    expect(computePrice(exoticService, exoticTier, 'exotic', 1)).toBe(450);
  });

  it('Classic vehicle + 1-Year Ceramic Shield = $725 (canonical fixture)', () => {
    expect(computePrice(exoticService, classicTier, 'classic', 1)).toBe(725);
  });

  it('Sedan vehicle resolves to sedan tier price', () => {
    expect(computePrice(exoticService, sedanTier, 'sedan', 1)).toBe(200);
  });
});

describe('computePrice — vehicle_size_aware tier (column-based pattern)', () => {
  // Column-based: single tier row with is_vehicle_size_aware = true.
  // Engine reads per-size columns; exotic/classic supported.
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
  const svc = service({ pricing_model: 'scope', service_pricing: [columnTier] });

  it('exotic vehicle reads vehicle_size_exotic_price', () => {
    expect(computePrice(svc, columnTier, 'exotic', 1)).toBe(500);
  });

  it('classic vehicle reads vehicle_size_classic_price', () => {
    expect(computePrice(svc, columnTier, 'classic', 1)).toBe(600);
  });

  it('sedan vehicle reads vehicle_size_sedan_price', () => {
    expect(computePrice(svc, columnTier, 'sedan', 1)).toBe(200);
  });
});

describe('computePrice — scope pricing_model', () => {
  it('non-vehicle_size_aware scope returns tier.price', () => {
    const t = tier({ tier_name: 'exterior_only', price: 75, is_vehicle_size_aware: false });
    const svc = service({ pricing_model: 'scope', service_pricing: [t] });
    expect(computePrice(svc, t, null, 1)).toBe(75);
  });

  it('selectedTier null returns 0 (no fallback)', () => {
    const svc = service({ pricing_model: 'scope', service_pricing: [] });
    expect(computePrice(svc, undefined, null, 1)).toBe(0);
  });
});

describe('computePrice — per_unit pricing_model', () => {
  it('Scratch Repair $150 × 3 = $450 (quantity multiplied)', () => {
    const svc = service({
      pricing_model: 'per_unit',
      per_unit_price: 150,
      per_unit_label: 'scratch',
      per_unit_max: 10,
    });
    expect(computePrice(svc, undefined, null, 3)).toBe(450);
  });

  it('per_unit × 1 = single unit price', () => {
    const svc = service({ pricing_model: 'per_unit', per_unit_price: 150 });
    expect(computePrice(svc, undefined, null, 1)).toBe(150);
  });

  it('per_unit_price null returns 0', () => {
    const svc = service({ pricing_model: 'per_unit', per_unit_price: null });
    expect(computePrice(svc, undefined, null, 5)).toBe(0);
  });

  it('per_unit on sale: sale_price × qty', () => {
    const svc = service({
      pricing_model: 'per_unit',
      per_unit_price: 150,
      sale_price: 100,
      sale_starts_at: '2020-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T23:59:59Z',
    });
    expect(computePrice(svc, undefined, null, 3)).toBe(300);
  });
});

describe('computePrice — specialty pricing_model', () => {
  // Aircraft Interior Clean: tier per specialty (motorcycle, boat, aircraft, rv).
  // Wizard selects the matching tier by vehicle.specialty_tier.
  const motorcycleTier = tier({ tier_name: 'motorcycle', tier_label: 'Motorcycle', price: 200 });
  const aircraftTier = tier({ tier_name: 'aircraft', tier_label: 'Aircraft', price: 800 });
  const boatTier = tier({ tier_name: 'boat', tier_label: 'Boat', price: 600 });

  const svc = service({
    pricing_model: 'specialty',
    service_pricing: [motorcycleTier, aircraftTier, boatTier],
  });

  it('Aircraft specialty_tier resolves to aircraft tier ($800)', () => {
    expect(computePrice(svc, aircraftTier, null, 1)).toBe(800);
  });

  it('Boat specialty_tier resolves to boat tier ($600)', () => {
    expect(computePrice(svc, boatTier, null, 1)).toBe(600);
  });

  it('Motorcycle specialty_tier resolves to motorcycle tier ($200)', () => {
    expect(computePrice(svc, motorcycleTier, null, 1)).toBe(200);
  });
});

describe('computePrice — custom pricing_model', () => {
  it('Flood Damage custom = custom_starting_price (until 15g-ii)', () => {
    const svc = service({
      pricing_model: 'custom',
      custom_starting_price: 475,
    });
    expect(computePrice(svc, undefined, null, 1)).toBe(475);
  });

  it('custom_starting_price null returns 0', () => {
    const svc = service({ pricing_model: 'custom', custom_starting_price: null });
    expect(computePrice(svc, undefined, null, 1)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────
// getServicePriceDisplay — the ServiceCard label
// ───────────────────────────────────────────────────────────────

describe('getServicePriceDisplay', () => {
  it('flat — formats price label', () => {
    const svc = service({ pricing_model: 'flat', flat_price: 175 });
    const r = getServicePriceDisplay(svc);
    expect(r.priceLabel).toBe('$175.00');
    expect(r.isOnSale).toBe(false);
  });

  it('flat on sale — line-through + sale price', () => {
    const svc = service({
      pricing_model: 'flat',
      flat_price: 200,
      sale_price: 150,
      sale_starts_at: '2020-01-01T00:00:00Z',
      sale_ends_at: '2099-12-31T23:59:59Z',
    });
    const r = getServicePriceDisplay(svc);
    expect(r.priceLabel).toBe('$150.00');
    expect(r.originalPrice).toBe('$200.00');
    expect(r.isOnSale).toBe(true);
  });

  it('vehicle_size — known classic vehicle picks classic tier price', () => {
    const svc = service({
      pricing_model: 'vehicle_size',
      service_pricing: [
        tier({ tier_name: 'sedan', price: 200 }),
        tier({ tier_name: 'classic', price: 725 }),
      ],
    });
    const r = getServicePriceDisplay(svc, 'classic' as VehicleSizeClass);
    expect(r.priceLabel).toBe('$725.00');
  });

  it('vehicle_size — no vehicle size shows "From $X" min', () => {
    const svc = service({
      pricing_model: 'vehicle_size',
      service_pricing: [
        tier({ tier_name: 'sedan', price: 200 }),
        tier({ tier_name: 'truck_suv_2row', price: 250 }),
        tier({ tier_name: 'classic', price: 725 }),
      ],
    });
    const r = getServicePriceDisplay(svc);
    expect(r.priceLabel).toBe('From $200.00');
  });

  it('per_unit — formats per-unit label', () => {
    const svc = service({
      pricing_model: 'per_unit',
      per_unit_price: 150,
      per_unit_label: 'scratch',
    });
    const r = getServicePriceDisplay(svc);
    expect(r.priceLabel).toBe('$150.00 / scratch');
  });

  it('custom — surfaces custom_starting_price', () => {
    const svc = service({
      pricing_model: 'custom',
      custom_starting_price: 475,
    });
    const r = getServicePriceDisplay(svc);
    expect(r.priceLabel).toBe('From $475.00');
  });

  it('specialty — known specialty_tier picks that tier', () => {
    const svc = service({
      pricing_model: 'specialty',
      service_pricing: [
        tier({ tier_name: 'motorcycle', price: 200 }),
        tier({ tier_name: 'aircraft', price: 800 }),
      ],
    });
    const r = getServicePriceDisplay(svc, null, 'aircraft');
    expect(r.priceLabel).toBe('$800.00');
  });
});
