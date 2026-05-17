/**
 * Item 15f Layer 4 — server-side booking-price validator helper.
 *
 * Extracted from `route.ts` because Next.js route files only permit
 * specific exports (GET / POST / etc.); the helper lives in a sibling
 * `_pricing.ts` file (underscore prefix excludes it from route resolution)
 * so tests can import it directly.
 *
 * Rewritten as a thin wrapper around `resolveServicePriceWithSale` from
 * the canonical engine (`picker-engine.ts`) per CLAUDE.md Rule 22.
 *
 * Pre-Layer-4 (the original bespoke implementation) had the same drift
 * bugs Layer 3d fixed in `service-resolver.ts`:
 *   - Missing `exotic` / `classic` size_class branches — Ferrari + 1-Year
 *     Ceramic Shield silently fell through to `tier.price` (the base price,
 *     not the exotic per-size column).
 *   - No `per_unit` handling — returned null in the original (preserved
 *     here: per-unit-quantity validation is intentionally skipped at this
 *     layer; the caller does not validate per_unit total against catalog).
 *   - No `custom` handling — returned null in the original (preserved
 *     here: customer-submitted starting price for custom services bypasses
 *     server-side validation until operator assesses post-booking).
 *
 * Return contract (preserved byte-identically for the route caller):
 *   number  → server compares against `data.price`; reject if mismatch
 *   null    → skip validation (per_unit / custom / unknown / no-tier-match)
 *
 * The original tier-fallback semantics are preserved for vehicle_size /
 * scope / specialty: if the named tier is missing from `service_pricing`,
 * return null (skip validation rather than silently use a different tier).
 */
import { resolveServicePriceWithSale } from '@/lib/services/picker-engine';
import { VEHICLE_SIZE_CLASS_KEYS } from '@/lib/utils/constants';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

export function computeExpectedPrice(
  service: {
    pricing_model: string;
    flat_price: number | null;
    sale_price: number | null;
    sale_starts_at: string | null;
    sale_ends_at: string | null;
    per_unit_price: number | null;
    service_pricing: ServicePricing[];
  },
  tierName: string | null | undefined,
  sizeClass: string | null | undefined
): number | null {
  const saleWindow = {
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  };
  const vsc = VEHICLE_SIZE_CLASS_KEYS.includes(sizeClass as VehicleSizeClass)
    ? (sizeClass as VehicleSizeClass)
    : null;

  switch (service.pricing_model) {
    case 'flat': {
      if (service.flat_price == null) return null;
      const synthetic: ServicePricing = {
        id: `synthetic-flat-${service.flat_price}`,
        service_id: '',
        tier_name: 'flat',
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
      return resolveServicePriceWithSale(synthetic, null, saleWindow).effectivePrice;
    }

    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      if (!tierName) return null;
      const tier = service.service_pricing.find((t) => t.tier_name === tierName);
      if (!tier) return null;
      return resolveServicePriceWithSale(tier, vsc, saleWindow).effectivePrice;
    }

    case 'per_unit':
      // Per-unit validation is intentionally deferred — the booking flow
      // submits per-unit quantity separately and validates against
      // catalog at the quote-item layer.
      return null;

    default:
      // Unknown pricing_model (e.g., `custom` — operator-assessed) — skip
      // validation rather than reject an otherwise-valid submission.
      return null;
  }
}
