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
 * Decision returned by `routeServiceTap`. The first four actions mirror the
 * conditional branches in `<CatalogBrowser>`'s `handleTapServiceDirect`
 * (lines 333-419) and `handleTapServiceDirectUnchecked` (lines 446-488).
 * `open-custom-price-dialog` is new in Item 15f Layer 2 and has no
 * corresponding branch in `<CatalogBrowser>` — that surface will continue
 * to dead-end on `pricing_model === 'custom'` until it is migrated to the
 * hook (Layer 3a / 3d).
 *
 * - `open-per-unit-picker` — service has `pricing_model === 'per_unit'` and
 *   a non-null `per_unit_price`. The caller should mount the
 *   `<ServicePricingPicker>` (which delegates to `<PerUnitPicker>`).
 * - `open-custom-price-dialog` — service has `pricing_model === 'custom'`.
 *   The caller (via `useServicePicker`) mounts `<CustomPriceDialog>` so the
 *   operator can enter a staff-assessed final price. The hook synthesizes
 *   the `ServicePricing` row at confirm time (Layer 2 owns that synthesis,
 *   not this routing function, to keep the route a pure decision).
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
  | { action: 'open-custom-price-dialog' }
  | { action: 'quick-add'; pricing: ServicePricing }
  | { action: 'quick-add-synthetic-flat'; pricing: ServicePricing }
  | { action: 'open-picker-dialog' };

const VEHICLE_SIZE_CLASSES_SET = new Set<string>(VEHICLE_SIZE_CLASS_KEYS);

/**
 * Canonical tier selector — given a service's `service_pricing` rows and the
 * current vehicle size class, return the single tier whose price should be
 * used (the resolver reads the final amount via `resolveServicePrice`).
 *
 * Handles both storage patterns (CLAUDE.md Rule 22):
 *  - **Single non-size-aware tier** (`length === 1 && !is_vehicle_size_aware`):
 *    a flat price that does not vary by vehicle → return it (vehicle-agnostic).
 *  - **Row-based size tiers** (`pricing_model = 'vehicle_size'`, Pattern B):
 *    multiple rows, one per size_class, each `is_vehicle_size_aware = false`.
 *    Return the row whose `tier_name === vehicleSizeClass`.
 *  - **Column-based single row** (`is_vehicle_size_aware = true`, Pattern A):
 *    one row holding all per-size prices in columns. Return that row;
 *    `resolveServicePrice` reads the correct column downstream.
 *
 * Returns `null` when no tier can be auto-selected — i.e. an unrecognized
 * multi-tier shape (scope/specialty), a size-dependent service with no
 * vehicle context, or a row-based service with no row matching the vehicle's
 * size_class (a data gap). Callers decide what `null` means for them:
 *  - Interactive add paths (catalog browser, register favorites, the
 *    `routeServiceTap` decision) fall through to the manual picker.
 *  - Automated add paths (prerequisite auto-add) block with a warning rather
 *    than silently mis-pricing.
 *
 * This centralizes the size-tier selection logic previously duplicated across
 * `<CatalogBrowser>` (handleTapServiceDirect + the unchecked variant),
 * `<RegisterTab>`, and `routeServiceTap` (CLAUDE.md Rule 22). It was a 1-line
 * copy of this that the prerequisite auto-add path skipped — it grabbed
 * `prereqPricing[0]` (always the sedan/first tier) instead of the size match
 * (see `docs/dev/POS_PREREQUISITE_PRICING_AUDIT.md`).
 *
 * NOTE: flat-price synthesis for a service with NO `service_pricing` rows
 * (`length === 0 && services.flat_price != null`) is intentionally NOT handled
 * here — it requires `services.flat_price`, which this row-only selector does
 * not receive. Callers keep that synthesis inline (see `routeServiceTap`'s
 * `quick-add-synthetic-flat` branch) and only reach this selector with the
 * service's actual pricing rows.
 */
export function selectPricingTierForVehicle(
  pricing: ServicePricing[],
  vehicleSizeClass: VehicleSizeClass | null,
): ServicePricing | null {
  if (pricing.length === 0) return null;

  // A single non-size-aware tier is the price regardless of vehicle.
  if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
    return pricing[0];
  }

  // Everything below varies by vehicle size — without a size class the caller
  // must fall through to its own handling (manual picker / block).
  if (!vehicleSizeClass) return null;

  // Row-based size tiers (Pattern B): one row per size_class, matched by name.
  const isVehicleSizeTiers =
    pricing.length > 1 &&
    pricing.every((t) => VEHICLE_SIZE_CLASSES_SET.has(t.tier_name));
  if (isVehicleSizeTiers) {
    return pricing.find((t) => t.tier_name === vehicleSizeClass) ?? null;
  }

  // Column-based single row (Pattern A): resolveServicePrice reads the column.
  if (pricing.length === 1 && pricing[0].is_vehicle_size_aware) {
    return pricing[0];
  }

  // Unrecognized multi-tier shape (scope/specialty) → caller decides.
  return null;
}

/**
 * Pure routing function — given a service and the current vehicle size class,
 * decide what UI action the caller should take. The non-custom branches are
 * byte-identical to the routing logic at `<CatalogBrowser>:333-419` (and the
 * duplicate at 446-488).
 *
 * Item 15f Layer 2 adds the `open-custom-price-dialog` branch for
 * `pricing_model === 'custom'` (e.g., "Flood Damage / Mold Extraction"
 * with `custom_starting_price` set but no `service_pricing` rows). The
 * branch fires regardless of `pricing` / `flat_price` state — `custom`
 * means "operator assesses the final price," so we never quick-add a
 * stale value. `<CatalogBrowser>` does NOT have this branch yet; the
 * canonical engine is intentionally ahead of the catalog browser until
 * Layer 3a/3d migrates the relevant surfaces.
 */
export function routeServiceTap(
  service: CatalogService,
  vehicleSizeClass: VehicleSizeClass | null,
): ServiceTapRoute {
  // Per-unit services always need the quantity picker.
  if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
    return { action: 'open-per-unit-picker' };
  }

  // Custom services always need the operator staff-assessment prompt.
  // Layer 2: `custom_starting_price` is treated as reference-only — the
  // operator-entered amount is the truth. The hook synthesizes the
  // `ServicePricing` row at dialog-confirm time so this function stays a
  // pure decision.
  if (service.pricing_model === 'custom') {
    return { action: 'open-custom-price-dialog' };
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

  // Vehicle prequalification: auto-add the size-matched tier when one resolves
  // (canonical selection — see `selectPricingTierForVehicle`). `null` covers
  // both "no vehicle yet" and "no tier matches this size" → manual picker.
  const tier = selectPricingTierForVehicle(pricing, vehicleSizeClass);
  if (tier) {
    return { action: 'quick-add', pricing: tier };
  }

  // Fallback: open the manual picker.
  return { action: 'open-picker-dialog' };
}
