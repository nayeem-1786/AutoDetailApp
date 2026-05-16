import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { getSaleStatus, type SaleWindow } from '@/lib/utils/sale-pricing';
import { VEHICLE_SIZE_CLASS_KEYS } from '@/lib/utils/constants';

/**
 * Item 15f Layer 1 — Canonical service-pricing engine.
 *
 * Per CLAUDE.md Rule 22: any code that computes a service price MUST go
 * through `resolveServicePrice` / `resolveServicePriceWithSale` from this
 * module (the canonical engine). The two storage patterns — column-based
 * `is_vehicle_size_aware` + `vehicle_size_*_price` columns, and row-based
 * `tier_name` = size_class — both flow through this resolver. Never inspect
 * `service_pricing.price` or `vehicle_size_*_price` columns directly outside
 * this engine.
 *
 * These functions originally lived in `src/app/pos/utils/pricing.ts`; that
 * file is now a thin re-export shim for backward compat. The shim will be
 * removed once all call sites migrate (Layer 3b — deferred indefinitely).
 *
 * `routeServiceTap` extracts the routing decision tree from
 * `<CatalogBrowser>:333-419` (and the duplicate at 446-488) into a pure
 * function. Logic is byte-identical to the catalog browser's existing flow.
 */

// ─── Price resolution ───────────────────────────────────────────

/**
 * Resolve the correct price from a ServicePricing tier based on vehicle size.
 * Falls back to the base tier price if no vehicle-size-specific price exists.
 *
 * Session 29: size_class is 5-value ('sedan' | 'truck_suv_2row' | 'suv_3row_van' |
 * 'exotic' | 'classic'). Exotic and classic are first-class members — no special
 * dispatch needed. A missing per-size column (e.g., vehicle_size_exotic_price on a
 * service that only has sedan/truck/van fan-out configured) falls back to pricing.price.
 */
export function resolveServicePrice(
  pricing: ServicePricing,
  vehicleSizeClass: VehicleSizeClass | null
): number {
  if (!pricing.is_vehicle_size_aware || !vehicleSizeClass) {
    return pricing.price;
  }

  switch (vehicleSizeClass) {
    case 'sedan':
      return pricing.vehicle_size_sedan_price ?? pricing.price;
    case 'truck_suv_2row':
      return pricing.vehicle_size_truck_suv_price ?? pricing.price;
    case 'suv_3row_van':
      return pricing.vehicle_size_suv_van_price ?? pricing.price;
    case 'exotic':
      return pricing.vehicle_size_exotic_price ?? pricing.price;
    case 'classic':
      return pricing.vehicle_size_classic_price ?? pricing.price;
    default:
      return pricing.price;
  }
}

/**
 * Resolve the correct price with sale pricing awareness.
 * Returns both the standard price and the effective (possibly discounted) price.
 */
export interface ResolvedPrice {
  standardPrice: number;
  effectivePrice: number;
  isOnSale: boolean;
  saleSavings: number;
}

export function resolveServicePriceWithSale(
  pricing: ServicePricing,
  vehicleSizeClass: VehicleSizeClass | null,
  saleWindow: SaleWindow | null
): ResolvedPrice {
  const standardPrice = resolveServicePrice(pricing, vehicleSizeClass);
  if (!saleWindow || !pricing.sale_price) {
    return { standardPrice, effectivePrice: standardPrice, isOnSale: false, saleSavings: 0 };
  }
  const { isOnSale } = getSaleStatus(saleWindow);
  if (isOnSale && pricing.sale_price < standardPrice) {
    return {
      standardPrice,
      effectivePrice: pricing.sale_price,
      isOnSale: true,
      saleSavings: standardPrice - pricing.sale_price,
    };
  }
  return { standardPrice, effectivePrice: standardPrice, isOnSale: false, saleSavings: 0 };
}

/**
 * Get the display price range for a service pricing tier.
 * Returns [min, max] or [price, price] if all the same.
 */
export function getServicePriceRange(pricing: ServicePricing): [number, number] {
  if (!pricing.is_vehicle_size_aware) {
    return [pricing.price, pricing.price];
  }

  const prices = [
    pricing.vehicle_size_sedan_price ?? pricing.price,
    pricing.vehicle_size_truck_suv_price ?? pricing.price,
    pricing.vehicle_size_suv_van_price ?? pricing.price,
    pricing.vehicle_size_exotic_price ?? pricing.price,
    pricing.vehicle_size_classic_price ?? pricing.price,
  ];

  return [Math.min(...prices), Math.max(...prices)];
}

// ─── Tap routing ────────────────────────────────────────────────

/**
 * Decision returned by `routeServiceTap`. The four actions mirror the
 * conditional branches in `<CatalogBrowser>`'s `handleTapServiceDirect`
 * (lines 333-419) and `handleTapServiceDirectUnchecked` (lines 446-488).
 *
 * - `open-per-unit-picker` — service has `pricing_model === 'per_unit'` and
 *   a non-null `per_unit_price`. The caller should mount the
 *   `<ServicePricingPicker>` (which delegates to `<PerUnitPicker>`).
 * - `quick-add` — caller can add the supplied `pricing` row directly to the
 *   ticket / cart without opening a dialog.
 * - `quick-add-synthetic-flat` — service has no `service_pricing` rows but
 *   a non-null `services.flat_price`. The caller adds the supplied
 *   synthetic `ServicePricing` row.
 * - `open-picker-dialog` — no quick-add path matched. Caller mounts the
 *   `<ServicePricingPicker>` so the operator selects a tier manually.
 */
export type ServiceTapRoute =
  | { action: 'open-per-unit-picker' }
  | { action: 'quick-add'; pricing: ServicePricing }
  | { action: 'quick-add-synthetic-flat'; pricing: ServicePricing }
  | { action: 'open-picker-dialog' };

const VEHICLE_SIZE_CLASSES_SET = new Set<string>(VEHICLE_SIZE_CLASS_KEYS);

/**
 * Pure routing function — given a service and the current vehicle size class,
 * decide what UI action the caller should take. Byte-identical to the routing
 * logic at `<CatalogBrowser>:333-419` (and the duplicate at 446-488) so the
 * shim and hook callers behave the same as the existing direct mounts.
 *
 * NOTE on `pricing_model === 'custom'`: not yet handled. Falls through to
 * `open-picker-dialog`, which today dead-ends at "No pricing tiers available"
 * inside `<ServicePricingPicker>`. Layer 2 of Item 15f will add the operator
 * custom-price prompt.
 */
export function routeServiceTap(
  service: CatalogService,
  vehicleSizeClass: VehicleSizeClass | null,
): ServiceTapRoute {
  // Per-unit services always need the quantity picker.
  if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
    return { action: 'open-per-unit-picker' };
  }

  const pricing = service.pricing ?? [];

  // Quick-add: single tier, not vehicle-size-aware.
  if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
    return { action: 'quick-add', pricing: pricing[0] };
  }

  // Quick-add: flat price (no pricing tiers).
  if (pricing.length === 0 && service.flat_price != null) {
    const syntheticPricing: ServicePricing = {
      id: 'flat',
      service_id: service.id,
      tier_name: 'default',
      tier_label: null,
      price: service.flat_price,
      sale_price: service.sale_price ?? null,
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
    };
    return { action: 'quick-add-synthetic-flat', pricing: syntheticPricing };
  }

  // Vehicle prequalification: auto-add when vehicle is set.
  if (vehicleSizeClass) {
    const isVehicleSizeTiers =
      pricing.length > 1 && pricing.every((t) => VEHICLE_SIZE_CLASSES_SET.has(t.tier_name));
    if (isVehicleSizeTiers) {
      const matchingTier = pricing.find((t) => t.tier_name === vehicleSizeClass);
      if (matchingTier) {
        return { action: 'quick-add', pricing: matchingTier };
      }
    }
    if (pricing.length === 1 && pricing[0].is_vehicle_size_aware) {
      return { action: 'quick-add', pricing: pricing[0] };
    }
  }

  // Fallback: open the manual picker.
  return { action: 'open-picker-dialog' };
}
