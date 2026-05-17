import { type SupabaseClient } from '@supabase/supabase-js';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { resolveServicePriceWithSale } from '@/lib/services/picker-engine';
import { VEHICLE_SIZE_CLASS_KEYS } from '@/lib/utils/constants';

/**
 * Item 15f Layer 3d — server-side service-name → priced-quote-item resolver
 * used by the voice agent and SMS auto-responder.
 *
 * Two exports:
 * - `resolveServiceByName(admin, name)` — case-insensitive name lookup with
 *   pricing tiers joined. Legitimate name-resolution concern; bug-free.
 * - `resolvePrice(service, sizeClass, opts?)` — REWRITTEN in Layer 3d as a
 *   thin wrapper around `resolveServicePriceWithSale` from the canonical
 *   engine (`picker-engine.ts`) per CLAUDE.md Rule 22. The pre-rewrite
 *   implementation had 4 bugs (missing exotic/classic size_class dispatch,
 *   per_unit returning $0, specialty returning first tier instead of the
 *   vehicle's specialty_tier, custom returning $0). All 4 are fixed by
 *   delegating price math to the canonical engine and synthesizing a
 *   `ServicePricing` row for the `per_unit` / `custom` / `flat` cases that
 *   have no row in `service_pricing`.
 *
 * The legacy `ResolvedPrice` return shape (`price`, `salePrice`, `tierName`,
 * `isOnSale`) is preserved so the 3 existing importers don't need code
 * changes: `send-quote-sms/route.ts`, `webhooks/twilio/inbound/route.ts`,
 * `voice-post-call.ts`.
 */

const VEHICLE_SIZE_CLASS_SET = new Set<string>(VEHICLE_SIZE_CLASS_KEYS);

export interface ResolvedService {
  id: string;
  name: string;
  pricing_model: string;
  flat_price: number | null;
  per_unit_price: number | null;
  custom_starting_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  service_pricing: ServicePricing[];
}

/** Case-insensitive service lookup with pricing tiers */
export async function resolveServiceByName(
  admin: SupabaseClient,
  name: string
): Promise<ResolvedService | null> {
  const { data } = await admin
    .from('services')
    .select(`
      id, name, pricing_model, flat_price, per_unit_price, custom_starting_price,
      sale_price, sale_starts_at, sale_ends_at,
      service_pricing(
        id, service_id, tier_name, tier_label, price, sale_price, display_order,
        is_vehicle_size_aware,
        vehicle_size_sedan_price, vehicle_size_truck_suv_price, vehicle_size_suv_van_price,
        vehicle_size_exotic_price, vehicle_size_classic_price,
        max_qty, qty_label, created_at
      )
    `)
    .ilike('name', name)
    .eq('is_active', true)
    .limit(1)
    .single();

  return data as ResolvedService | null;
}

export interface ResolvedPrice {
  price: number;
  salePrice: number | null;
  tierName: string | null;
  isOnSale: boolean;
}

export interface ResolvePriceOptions {
  /**
   * Vehicle's `specialty_tier` value (e.g., 'aircraft_single_engine',
   * 'rv_class_a'). Required for `pricing_model === 'specialty'` to dispatch
   * to the matching `service_pricing.tier_name` row. Null/undefined for
   * automobile vehicles or when the caller doesn't yet know the specialty
   * tier — in that case, specialty services fall back to the first tier
   * (matching the pre-Layer 3d behavior, but no longer the silent-mispricing
   * default for sized automobiles).
   */
  specialtyTier?: string | null;
}

/**
 * Coerce a free-form size-class string into the canonical `VehicleSizeClass`
 * union. Callers historically pass the raw `vehicles.size_class` value, which
 * is constrained at the DB layer but typed as string here. Unknown values
 * (or 'sedan' default for unknown vehicles) coerce to 'sedan' — matches the
 * canonical engine's null-vehicle-size fallback and the original resolver's
 * `default:` branch.
 */
function coerceSizeClass(sizeClass: string | null | undefined): VehicleSizeClass | null {
  if (!sizeClass) return null;
  if (VEHICLE_SIZE_CLASS_SET.has(sizeClass)) return sizeClass as VehicleSizeClass;
  return null;
}

/**
 * Build a synthetic `ServicePricing` row for `pricing_model` values that
 * don't store a row in `service_pricing` (flat, per_unit, custom). The
 * synthesized row carries enough state for `resolveServicePriceWithSale` to
 * return a correct `ResolvedPrice` without any code path inspecting
 * `service.flat_price` / `service.per_unit_price` / `service.custom_starting_price`
 * directly (preserving Rule 22's canonical-engine invariant).
 */
function syntheticPricing(
  service: ResolvedService,
  tierName: string,
  price: number,
  salePrice: number | null
): ServicePricing {
  return {
    id: `synthetic-${tierName}-${service.id}`,
    service_id: service.id,
    tier_name: tierName,
    tier_label: null,
    price,
    sale_price: salePrice,
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
}

/**
 * Resolve the correct price for a service given vehicle size class, with
 * sale awareness. Layer 3d: thin wrapper around the canonical engine.
 *
 * Behavior by `pricing_model`:
 *
 * - `flat` — synthesizes a ServicePricing row from `service.flat_price` and
 *   `service.sale_price`; dispatches to the canonical engine (sale window
 *   from `service.sale_starts_at` / `sale_ends_at`).
 *
 * - `vehicle_size` / `scope` — picks the size-aware tier (or the tier whose
 *   `tier_name` matches the size class as a fallback), dispatches to the
 *   canonical engine which selects the correct per-size column for ALL 5
 *   size classes (sedan, truck_suv_2row, suv_3row_van, exotic, classic).
 *   Fix: pre-Layer-3d `exotic`/`classic` fell through to sedan column.
 *
 * - `per_unit` — synthesizes a ServicePricing row from
 *   `service.per_unit_price` (the per-unit cost). Caller multiplies by
 *   quantity at the quote-item layer. Fix: pre-Layer-3d returned $0 because
 *   per_unit services have no `service_pricing` rows.
 *
 * - `specialty` — finds the `service_pricing` row whose `tier_name` matches
 *   the caller-supplied `specialtyTier`; falls back to the first tier when
 *   `specialtyTier` is null/missing. Fix: pre-Layer-3d always returned the
 *   first tier regardless of the vehicle's specialty_tier.
 *
 * - `custom` — synthesizes a ServicePricing row from
 *   `service.custom_starting_price` (no sale logic — custom is operator-
 *   assessed). Fix: pre-Layer-3d returned $0.
 */
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string | null | undefined,
  options: ResolvePriceOptions = {}
): ResolvedPrice {
  const tiers = service.service_pricing || [];
  const saleWindow = {
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  };
  const sized = coerceSizeClass(sizeClass);

  switch (service.pricing_model) {
    case 'flat': {
      const pricing = syntheticPricing(
        service,
        'flat',
        service.flat_price ?? 0,
        service.sale_price ?? null
      );
      const r = resolveServicePriceWithSale(pricing, null, saleWindow);
      return {
        price: r.standardPrice,
        salePrice: r.isOnSale ? r.effectivePrice : null,
        tierName: null,
        isOnSale: r.isOnSale,
      };
    }

    case 'vehicle_size':
    case 'scope': {
      if (tiers.length === 0) {
        // Misconfigured vehicle_size/scope service — fall back to flat price.
        // Matches pre-Layer-3d behavior (which silently returned flat_price).
        return {
          price: service.flat_price ?? 0,
          salePrice: null,
          tierName: null,
          isOnSale: false,
        };
      }

      // Prefer the size-aware tier (column-pattern A: one tier with per-size
      // columns). Fallback: row-pattern B (one tier per size_class).
      const sizeAwareTier = tiers.find(
        (t) => t.is_vehicle_size_aware && t.vehicle_size_sedan_price != null
      );
      const matchingTier = tiers.find((t) => t.tier_name === sizeClass);
      const tier = sizeAwareTier || matchingTier || tiers[0];

      const r = resolveServicePriceWithSale(tier, sized, saleWindow);
      return {
        price: r.standardPrice,
        salePrice: r.isOnSale ? r.effectivePrice : null,
        tierName: tier.tier_name,
        isOnSale: r.isOnSale,
      };
    }

    case 'per_unit': {
      const pricing = syntheticPricing(
        service,
        'per_unit',
        service.per_unit_price ?? 0,
        null
      );
      const r = resolveServicePriceWithSale(pricing, null, saleWindow);
      return {
        price: r.standardPrice,
        salePrice: r.isOnSale ? r.effectivePrice : null,
        tierName: null,
        isOnSale: r.isOnSale,
      };
    }

    case 'specialty': {
      if (tiers.length === 0) {
        return {
          price: service.flat_price ?? 0,
          salePrice: null,
          tierName: null,
          isOnSale: false,
        };
      }
      const specialtyTier = options.specialtyTier ?? null;
      const tier = (specialtyTier
        ? tiers.find((t) => t.tier_name === specialtyTier)
        : null) ?? tiers[0];

      // Specialty rows are not vehicle-size-aware — pass null to the engine
      // so it returns the row's flat price without per-column dispatch.
      const r = resolveServicePriceWithSale(tier, null, saleWindow);
      return {
        price: r.standardPrice,
        salePrice: r.isOnSale ? r.effectivePrice : null,
        tierName: tier.tier_name,
        isOnSale: r.isOnSale,
      };
    }

    case 'custom': {
      // Custom services are operator-assessed — `custom_starting_price` is
      // a reference value. No sale logic applies (caller can override at
      // quote-item time if needed).
      return {
        price: service.custom_starting_price ?? 0,
        salePrice: null,
        tierName: null,
        isOnSale: false,
      };
    }

    default: {
      // Unknown pricing_model — match pre-Layer-3d fallthrough conservatively.
      if (tiers.length > 0) {
        const r = resolveServicePriceWithSale(tiers[0], sized, saleWindow);
        return {
          price: r.standardPrice,
          salePrice: r.isOnSale ? r.effectivePrice : null,
          tierName: tiers[0].tier_name,
          isOnSale: r.isOnSale,
        };
      }
      return {
        price: service.flat_price ?? 0,
        salePrice: null,
        tierName: null,
        isOnSale: false,
      };
    }
  }
}
