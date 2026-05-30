import { describe, it, expect } from 'vitest';
import {
  resolveServicePrice,
  resolveServicePriceWithSale,
  getServicePriceRange,
  routeServiceTap,
  selectPricingTierForVehicle,
} from '../picker-engine';
import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
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

function mockService(overrides: Partial<CatalogService> = {}): CatalogService {
  return {
    id: 'svc-1',
    name: 'Test Service',
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
    pricing: [],
    ...overrides,
  } as CatalogService;
}

// ───────────────────────────────────────────────────────────────
// resolveServicePrice — exhaustive
// ───────────────────────────────────────────────────────────────

describe('resolveServicePrice', () => {
  it('returns pricing.price when is_vehicle_size_aware is false (sedan)', () => {
    const tier = mockTier({ price: 150, is_vehicle_size_aware: false });
    expect(resolveServicePrice(tier, 'sedan')).toBe(150);
  });

  it('returns pricing.price when is_vehicle_size_aware is false (every size)', () => {
    const tier = mockTier({ price: 150, is_vehicle_size_aware: false });
    const sizes: VehicleSizeClass[] = [
      'sedan',
      'truck_suv_2row',
      'suv_3row_van',
      'exotic',
      'classic',
    ];
    for (const s of sizes) expect(resolveServicePrice(tier, s)).toBe(150);
  });

  it('returns pricing.price when vehicleSizeClass is null', () => {
    const tier = mockTier({ price: 100, is_vehicle_size_aware: true });
    expect(resolveServicePrice(tier, null)).toBe(100);
  });

  it('returns sedan column for sedan vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price: 100,
      vehicle_size_truck_suv_price: 150,
      vehicle_size_suv_van_price: 200,
      vehicle_size_exotic_price: 500,
      vehicle_size_classic_price: 350,
    });
    expect(resolveServicePrice(tier, 'sedan')).toBe(100);
  });

  it('returns truck_suv column for truck_suv_2row vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_truck_suv_price: 150,
    });
    expect(resolveServicePrice(tier, 'truck_suv_2row')).toBe(150);
  });

  it('returns suv_van column for suv_3row_van vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_suv_van_price: 200,
    });
    expect(resolveServicePrice(tier, 'suv_3row_van')).toBe(200);
  });

  it('returns exotic column for exotic vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_exotic_price: 500,
    });
    expect(resolveServicePrice(tier, 'exotic')).toBe(500);
  });

  it('returns classic column for classic vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_classic_price: 350,
    });
    expect(resolveServicePrice(tier, 'classic')).toBe(350);
  });

  it('falls back to pricing.price when sedan column is null', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 200,
      vehicle_size_sedan_price: null,
    });
    expect(resolveServicePrice(tier, 'sedan')).toBe(200);
  });

  it('falls back to pricing.price when truck_suv column is null', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 210,
      vehicle_size_truck_suv_price: null,
    });
    expect(resolveServicePrice(tier, 'truck_suv_2row')).toBe(210);
  });

  it('falls back to pricing.price when suv_van column is null', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 220,
      vehicle_size_suv_van_price: null,
    });
    expect(resolveServicePrice(tier, 'suv_3row_van')).toBe(220);
  });

  it('falls back to pricing.price when exotic column is null', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 200,
      vehicle_size_exotic_price: null,
    });
    expect(resolveServicePrice(tier, 'exotic')).toBe(200);
  });

  it('falls back to pricing.price when classic column is null', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 250,
      vehicle_size_classic_price: null,
    });
    expect(resolveServicePrice(tier, 'classic')).toBe(250);
  });
});

// ───────────────────────────────────────────────────────────────
// resolveServicePriceWithSale
// ───────────────────────────────────────────────────────────────

describe('resolveServicePriceWithSale', () => {
  it('returns standard price when sale window is null', () => {
    const tier = mockTier({ price: 100, sale_price: 80 });
    const result = resolveServicePriceWithSale(tier, null, null);
    expect(result.isOnSale).toBe(false);
    expect(result.effectivePrice).toBe(100);
    expect(result.standardPrice).toBe(100);
    expect(result.saleSavings).toBe(0);
  });

  it('returns standard price when tier.sale_price is null', () => {
    const tier = mockTier({ price: 100, sale_price: null });
    const result = resolveServicePriceWithSale(tier, null, {
      sale_starts_at: null,
      sale_ends_at: null,
    });
    expect(result.isOnSale).toBe(false);
    expect(result.effectivePrice).toBe(100);
  });

  it('applies sale_price when sale active and sale_price < standardPrice', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_exotic_price: 500,
      sale_price: 400,
    });
    const result = resolveServicePriceWithSale(tier, 'exotic', {
      sale_starts_at: null,
      sale_ends_at: null,
    });
    expect(result.isOnSale).toBe(true);
    expect(result.standardPrice).toBe(500);
    expect(result.effectivePrice).toBe(400);
    expect(result.saleSavings).toBe(100);
  });

  it('does NOT apply sale_price when sale_price >= standardPrice', () => {
    const tier = mockTier({ price: 100, sale_price: 100 });
    const result = resolveServicePriceWithSale(tier, null, {
      sale_starts_at: null,
      sale_ends_at: null,
    });
    expect(result.isOnSale).toBe(false);
    expect(result.effectivePrice).toBe(100);
  });

  it('does NOT apply sale_price when sale window is in the future', () => {
    const tier = mockTier({ price: 100, sale_price: 80 });
    const future = new Date(Date.now() + 86400_000).toISOString();
    const result = resolveServicePriceWithSale(tier, null, {
      sale_starts_at: future,
      sale_ends_at: null,
    });
    expect(result.isOnSale).toBe(false);
    expect(result.effectivePrice).toBe(100);
  });

  it('does NOT apply sale_price when sale window has ended', () => {
    const tier = mockTier({ price: 100, sale_price: 80 });
    const past = new Date(Date.now() - 86400_000).toISOString();
    const result = resolveServicePriceWithSale(tier, null, {
      sale_starts_at: null,
      sale_ends_at: past,
    });
    expect(result.isOnSale).toBe(false);
    expect(result.effectivePrice).toBe(100);
  });
});

// ───────────────────────────────────────────────────────────────
// getServicePriceRange
// ───────────────────────────────────────────────────────────────

describe('getServicePriceRange', () => {
  it('returns [price, price] when is_vehicle_size_aware is false', () => {
    const tier = mockTier({ price: 100, is_vehicle_size_aware: false });
    expect(getServicePriceRange(tier)).toEqual([100, 100]);
  });

  it('returns [min, max] across populated per-size columns', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price: 100,
      vehicle_size_truck_suv_price: 150,
      vehicle_size_suv_van_price: 200,
      vehicle_size_exotic_price: 500,
      vehicle_size_classic_price: 350,
    });
    expect(getServicePriceRange(tier)).toEqual([100, 500]);
  });

  it('falls back to pricing.price for null columns when computing range', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 175,
      vehicle_size_sedan_price: 100,
      vehicle_size_truck_suv_price: 150,
      vehicle_size_suv_van_price: 200,
      // exotic + classic null → fallback to price (175)
    });
    expect(getServicePriceRange(tier)).toEqual([100, 200]);
  });

  it('returns [price, price] when all 5 columns are null', () => {
    const tier = mockTier({ is_vehicle_size_aware: true, price: 175 });
    expect(getServicePriceRange(tier)).toEqual([175, 175]);
  });
});

// ───────────────────────────────────────────────────────────────
// routeServiceTap — one test per pricing_model
// ───────────────────────────────────────────────────────────────

describe('routeServiceTap', () => {
  it('pricing_model: per_unit → open-per-unit-picker', () => {
    const svc = mockService({
      pricing_model: 'per_unit',
      per_unit_price: 12.5,
      per_unit_max: 10,
      per_unit_label: 'row',
      pricing: [],
    });
    expect(routeServiceTap(svc, null)).toEqual({ action: 'open-per-unit-picker' });
    expect(routeServiceTap(svc, 'sedan')).toEqual({ action: 'open-per-unit-picker' });
  });

  it('pricing_model: per_unit but per_unit_price=null → falls through, not the per-unit branch', () => {
    const svc = mockService({ pricing_model: 'per_unit', per_unit_price: null, pricing: [] });
    expect(routeServiceTap(svc, null)).toEqual({ action: 'open-picker-dialog' });
  });

  it('pricing_model: flat, no pricing rows, flat_price set → quick-add-synthetic-flat', () => {
    const svc = mockService({ pricing_model: 'flat', flat_price: 45, pricing: [] });
    const route = routeServiceTap(svc, 'sedan');
    expect(route.action).toBe('quick-add-synthetic-flat');
    if (route.action === 'quick-add-synthetic-flat') {
      expect(route.pricing.price).toBe(45);
      expect(route.pricing.tier_name).toBe('default');
      expect(route.pricing.is_vehicle_size_aware).toBe(false);
      expect(route.pricing.id).toBe('flat');
      expect(route.pricing.service_id).toBe(svc.id);
    }
  });

  it('pricing_model: flat, no pricing rows, flat_price=null → falls through to open-picker-dialog (dead end)', () => {
    const svc = mockService({ pricing_model: 'flat', flat_price: null, pricing: [] });
    expect(routeServiceTap(svc, 'sedan')).toEqual({ action: 'open-picker-dialog' });
  });

  it('pricing_model: vehicle_size Pattern B (rows per size_class), matching vehicle → quick-add the row', () => {
    const rows: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'sedan', price: 100 }),
      mockTier({ id: 'r2', tier_name: 'truck_suv_2row', price: 150 }),
      mockTier({ id: 'r3', tier_name: 'suv_3row_van', price: 200 }),
      mockTier({ id: 'r4', tier_name: 'exotic', price: 500 }),
      mockTier({ id: 'r5', tier_name: 'classic', price: 350 }),
    ];
    const svc = mockService({ pricing_model: 'vehicle_size', pricing: rows });
    const route = routeServiceTap(svc, 'exotic');
    expect(route.action).toBe('quick-add');
    if (route.action === 'quick-add') {
      expect(route.pricing.id).toBe('r4');
      expect(route.pricing.price).toBe(500);
    }
  });

  it('pricing_model: vehicle_size Pattern A (single size-aware row), vehicle set → quick-add', () => {
    const row = mockTier({
      id: 'r1',
      tier_name: 'base',
      price: 100,
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price: 100,
      vehicle_size_exotic_price: 500,
    });
    const svc = mockService({ pricing_model: 'vehicle_size', pricing: [row] });
    const route = routeServiceTap(svc, 'exotic');
    expect(route.action).toBe('quick-add');
    if (route.action === 'quick-add') expect(route.pricing.id).toBe('r1');
  });

  it('pricing_model: specialty → open-picker-dialog (highlight-only, no auto-add)', () => {
    const rows: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'small_yacht', price: 800 }),
      mockTier({ id: 'r2', tier_name: 'large_yacht', price: 1500 }),
    ];
    const svc = mockService({ pricing_model: 'specialty', pricing: rows });
    expect(routeServiceTap(svc, null)).toEqual({ action: 'open-picker-dialog' });
    // Vehicle set but tier_name values are NOT in VEHICLE_SIZE_CLASS_KEYS,
    // so the "Pattern B" auto-add branch does not match.
    expect(routeServiceTap(svc, 'sedan')).toEqual({ action: 'open-picker-dialog' });
  });

  it('pricing_model: scope → open-picker-dialog (multiple tiers; operator must pick)', () => {
    const rows: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'half_floor', price: 75 }),
      mockTier({ id: 'r2', tier_name: 'full_interior', price: 150 }),
    ];
    const svc = mockService({ pricing_model: 'scope', pricing: rows });
    expect(routeServiceTap(svc, 'sedan')).toEqual({ action: 'open-picker-dialog' });
    expect(routeServiceTap(svc, null)).toEqual({ action: 'open-picker-dialog' });
  });

  // Layer 2 — `custom` is now routed to its dedicated dialog. Fires
  // regardless of vehicle size (operator assesses the final price; vehicle
  // info is reference only). Canonical fixture: "Flood Damage / Mold
  // Extraction" — `pricing_model: 'custom'`, `custom_starting_price: 475`,
  // no `service_pricing` rows.
  it('pricing_model: custom (Layer 2) → open-custom-price-dialog', () => {
    const svc = mockService({
      pricing_model: 'custom',
      custom_starting_price: 475,
      flat_price: null,
      pricing: [],
    });
    expect(routeServiceTap(svc, 'sedan')).toEqual({ action: 'open-custom-price-dialog' });
    expect(routeServiceTap(svc, null)).toEqual({ action: 'open-custom-price-dialog' });
    expect(routeServiceTap(svc, 'exotic')).toEqual({ action: 'open-custom-price-dialog' });
  });

  // Layer 2 — custom-price routing wins over flat_price and pricing rows.
  // The operator must always assess a custom service; we never silently
  // use a stale value even if those fields were set on the row.
  it('pricing_model: custom routes to dialog even if flat_price or pricing rows exist', () => {
    const svcWithFlat = mockService({
      pricing_model: 'custom',
      flat_price: 100,
      pricing: [],
    });
    expect(routeServiceTap(svcWithFlat, null).action).toBe('open-custom-price-dialog');

    const svcWithPricing = mockService({
      pricing_model: 'custom',
      flat_price: null,
      pricing: [mockTier({ tier_name: 'default', price: 200 })],
    });
    expect(routeServiceTap(svcWithPricing, null).action).toBe('open-custom-price-dialog');
  });

  // ─── Edge cases ───────────────────────────────────────────────

  it('no vehicle, single non-size-aware tier → quick-add', () => {
    const row = mockTier({ id: 'r1', tier_name: 'standard', price: 75 });
    const svc = mockService({ pricing_model: 'flat', pricing: [row] });
    const route = routeServiceTap(svc, null);
    expect(route.action).toBe('quick-add');
    if (route.action === 'quick-add') expect(route.pricing.id).toBe('r1');
  });

  it('no vehicle, multiple size-class rows → open-picker-dialog (manual pick)', () => {
    const rows: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'sedan', price: 100 }),
      mockTier({ id: 'r2', tier_name: 'truck_suv_2row', price: 150 }),
    ];
    const svc = mockService({ pricing_model: 'vehicle_size', pricing: rows });
    expect(routeServiceTap(svc, null)).toEqual({ action: 'open-picker-dialog' });
  });

  it('vehicle set, single size-aware tier but vehicle does not narrow → still quick-add (resolver handles)', () => {
    // A single is_vehicle_size_aware row with vehicle set → quick-add; resolver decides which column to read.
    const row = mockTier({
      id: 'r1',
      tier_name: 'base',
      price: 100,
      is_vehicle_size_aware: true,
      vehicle_size_classic_price: 250,
    });
    const svc = mockService({ pricing_model: 'vehicle_size', pricing: [row] });
    expect(routeServiceTap(svc, 'classic').action).toBe('quick-add');
  });

  it('vehicle set, mixed tier_names (not all in VEHICLE_SIZE_CLASS_KEYS) → open-picker-dialog', () => {
    // Pattern B's quick-add only fires when EVERY tier_name is a size_class.
    const rows: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'sedan', price: 100 }),
      mockTier({ id: 'r2', tier_name: 'express', price: 80 }),
    ];
    const svc = mockService({ pricing_model: 'vehicle_size', pricing: rows });
    expect(routeServiceTap(svc, 'sedan')).toEqual({ action: 'open-picker-dialog' });
  });
});

// ───────────────────────────────────────────────────────────────
// selectPricingTierForVehicle — the canonical tier selector
// (extracted to fix the prerequisite auto-add mispricing — see
//  docs/dev/POS_PREREQUISITE_PRICING_AUDIT.md)
// ───────────────────────────────────────────────────────────────

describe('selectPricingTierForVehicle', () => {
  // Real row-based vehicle_size pricing from the audit live-data check:
  // "Express Exterior Wash" — one row per size_class, is_vehicle_size_aware=false.
  function expressExteriorWashTiers(): ServicePricing[] {
    return [
      mockTier({ id: 'sedan', tier_name: 'sedan', price: 75, display_order: 0 }),
      mockTier({ id: 'truck', tier_name: 'truck_suv_2row', price: 90, display_order: 1 }),
      mockTier({ id: 'suvvan', tier_name: 'suv_3row_van', price: 110, display_order: 2 }),
      mockTier({ id: 'exotic', tier_name: 'exotic', price: 150, display_order: 3 }),
      mockTier({ id: 'classic', tier_name: 'classic', price: 175, display_order: 4 }),
    ];
  }

  it('row-based tiers + suv_3row_van → selects the $110 row, NOT [0]/sedan ($75) — the prereq bug', () => {
    const tiers = expressExteriorWashTiers();
    const tier = selectPricingTierForVehicle(tiers, 'suv_3row_van');
    expect(tier?.id).toBe('suvvan');
    expect(tier?.price).toBe(110);
    // Guard: prove the regression. The old code used tiers[0] (sedan = $75).
    expect(tiers[0].price).toBe(75);
    expect(tier).not.toBe(tiers[0]);
  });

  it('row-based tiers + sedan → selects the sedan row', () => {
    const tiers = expressExteriorWashTiers();
    expect(selectPricingTierForVehicle(tiers, 'sedan')?.price).toBe(75);
  });

  it('row-based tiers + exotic when no exotic tier exists → null (data gap)', () => {
    const tiers = expressExteriorWashTiers().filter((t) => t.tier_name !== 'exotic');
    expect(selectPricingTierForVehicle(tiers, 'exotic')).toBeNull();
  });

  it('row-based tiers + null vehicleSizeClass → null (caller falls through / blocks)', () => {
    expect(selectPricingTierForVehicle(expressExteriorWashTiers(), null)).toBeNull();
  });

  it('single column-based (is_vehicle_size_aware) row → returns that row regardless of size', () => {
    const row = mockTier({
      id: 'colrow',
      tier_name: 'base',
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price: 100,
      vehicle_size_suv_van_price: 160,
    });
    expect(selectPricingTierForVehicle([row], 'suv_3row_van')?.id).toBe('colrow');
    expect(selectPricingTierForVehicle([row], 'sedan')?.id).toBe('colrow');
  });

  it('single non-size-aware tier → returned regardless of vehicle (vehicle-agnostic flat)', () => {
    const row = mockTier({ id: 'flatrow', tier_name: 'standard', price: 60, is_vehicle_size_aware: false });
    expect(selectPricingTierForVehicle([row], 'exotic')?.id).toBe('flatrow');
    expect(selectPricingTierForVehicle([row], null)?.id).toBe('flatrow');
  });

  it('empty pricing array → null', () => {
    expect(selectPricingTierForVehicle([], 'sedan')).toBeNull();
    expect(selectPricingTierForVehicle([], null)).toBeNull();
  });

  it('unrecognized multi-tier shape (scope/specialty, non-size tier_names) + vehicle → null', () => {
    const rows: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'half_floor', price: 75 }),
      mockTier({ id: 'r2', tier_name: 'full_interior', price: 150 }),
    ];
    expect(selectPricingTierForVehicle(rows, 'sedan')).toBeNull();
    expect(selectPricingTierForVehicle(rows, null)).toBeNull();
  });

  it('mixed tier_names (only some are size classes) + vehicle → null (must be ALL size classes)', () => {
    const rows: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'sedan', price: 100 }),
      mockTier({ id: 'r2', tier_name: 'express', price: 80 }),
    ];
    expect(selectPricingTierForVehicle(rows, 'sedan')).toBeNull();
  });

  // V1+V2 (Session #130) — cross-category contract pin. The engine intentionally
  // does NOT know about vehicle_compatibility (that's an upstream concern); when
  // a specialty-tier service (e.g. RV-only with tier_name='rv_up_to_24') is
  // passed alongside a sedan size_class, this selector returns null for the same
  // structural reason any unrecognized multi-tier shape does. The prereq
  // auto-add path gates on the server's `is_compatible_with_vehicle` flag
  // BEFORE invoking this selector, so the operator gets the precise
  // category-specific error rather than this null surfacing the generic
  // "no price configured for this vehicle size" toast.
  it('specialty-tier rows (RV) + sedan size_class → null (caller MUST upstream-gate on vehicle_compatibility)', () => {
    const rvTiers: ServicePricing[] = [
      mockTier({ id: 'r1', tier_name: 'rv_up_to_24', price: 200 }),
      mockTier({ id: 'r2', tier_name: 'rv_25_35', price: 300 }),
      mockTier({ id: 'r3', tier_name: 'rv_36_plus', price: 400 }),
    ];
    // Same null result for ANY automobile size_class — confirms the engine
    // surfaces null structurally; cross-category awareness lives upstream.
    expect(selectPricingTierForVehicle(rvTiers, 'sedan')).toBeNull();
    expect(selectPricingTierForVehicle(rvTiers, 'truck_suv_2row')).toBeNull();
    expect(selectPricingTierForVehicle(rvTiers, 'suv_3row_van')).toBeNull();
    expect(selectPricingTierForVehicle(rvTiers, 'exotic')).toBeNull();
    expect(selectPricingTierForVehicle(rvTiers, 'classic')).toBeNull();
  });
});
