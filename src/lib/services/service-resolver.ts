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

/**
 * Single select clause reused by both the exact-match query and the
 * fallback fetch-all query. Extracted in D42 (Issue 37) when the
 * resolver gained prefix-match fallback tiers; keeping it as a single
 * source of truth so a schema column add only touches one place.
 */
const SERVICE_SELECT_QUERY = `
  id, name, pricing_model, flat_price, per_unit_price, custom_starting_price,
  sale_price, sale_starts_at, sale_ends_at,
  service_pricing(
    id, service_id, tier_name, tier_label, price, sale_price, display_order,
    is_vehicle_size_aware,
    vehicle_size_sedan_price, vehicle_size_truck_suv_price, vehicle_size_suv_van_price,
    vehicle_size_exotic_price, vehicle_size_classic_price,
    max_qty, qty_label, created_at
  )
`;

/**
 * Case-insensitive service lookup with pricing tiers. Three-tier fallback
 * resolves the common agent-verbalization pattern where the LLM appends
 * a tier label to the service name (e.g., "Hot Shampoo Extraction Complete"
 * → "Hot Shampoo Extraction"). See D42 (Issue 37, 2026-05-24) for the
 * empirical case and decision details.
 *
 * Tier 1 — exact case-insensitive match via `.ilike(name)`. Fastest path,
 * unchanged from pre-D42 behavior; all existing callers see identical
 * results when their service name matches the catalog exactly.
 *
 * Tier 2 — prefix match where the QUERY starts with a catalog name plus
 * a separator (space / comma / hyphen). Closes the Issue 37 case:
 * "Hot Shampoo Extraction Complete" → "Hot Shampoo Extraction". Requires
 * the separator so "Express" doesn't false-match against "Express Wash".
 * Longest catalog name wins to prefer specificity (e.g., "Express Wash
 * Premium Complete" matches "Express Wash Premium" over "Express Wash").
 *
 * Tier 3 — reverse prefix where a CATALOG name starts with the query
 * plus a separator. Bonus safety for short/incomplete agent names like
 * "Hot Shampoo" → "Hot Shampoo Extraction". Unique match only — ambiguous
 * matches (e.g., "Hot Shampoo" when both "Hot Shampoo Extraction" and
 * "Hot Shampoo Spot Treatment" exist) return null + warn.
 *
 * Returns null when no tier matches (caller convention: warn + skip).
 */
export async function resolveServiceByName(
  admin: SupabaseClient,
  name: string
): Promise<ResolvedService | null> {
  const normalizedName = name.trim();
  if (!normalizedName) return null;

  // Tier 1 — exact case-insensitive match. Single-row path; ignores
  // error so zero-rows returns null (preserves pre-D42 contract).
  const { data: exactMatch } = await admin
    .from('services')
    .select(SERVICE_SELECT_QUERY)
    .ilike('name', normalizedName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (exactMatch) return exactMatch as unknown as ResolvedService;

  // Tier 2/3 — fetch all active services for client-side prefix matching.
  // Catalog size is ~30 services per CLAUDE.md (~18KB cached at the voice
  // endpoint level); the cost of fetching is small and only paid when
  // the exact-match path missed.
  const { data: allServices } = await admin
    .from('services')
    .select(SERVICE_SELECT_QUERY)
    .eq('is_active', true);

  if (!allServices || allServices.length === 0) return null;

  const lowerQuery = normalizedName.toLowerCase();
  const SEPARATORS = [' ', ',', '-'];

  // Tier 2 — query starts with catalog name + separator. Longest wins
  // (prefers the most specific catalog match when multiple are prefixes).
  const prefixMatches = (allServices as unknown as ResolvedService[]).filter((s) => {
    const serviceName = s.name.toLowerCase();
    if (lowerQuery === serviceName) return true;
    return SEPARATORS.some((sep) => lowerQuery.startsWith(serviceName + sep));
  });
  if (prefixMatches.length > 0) {
    prefixMatches.sort((a, b) => b.name.length - a.name.length);
    return prefixMatches[0];
  }

  // Tier 3 — catalog name starts with query + separator. Unique match
  // only; ambiguous matches return null + warn so the caller falls
  // through to its skip-and-warn branch rather than guessing.
  const reversePrefixMatches = (allServices as unknown as ResolvedService[]).filter((s) => {
    const serviceName = s.name.toLowerCase();
    return SEPARATORS.some((sep) => serviceName.startsWith(lowerQuery + sep));
  });
  if (reversePrefixMatches.length === 1) {
    return reversePrefixMatches[0];
  }
  if (reversePrefixMatches.length > 1) {
    console.warn(
      `[resolveServiceByName] Ambiguous reverse-prefix match for "${normalizedName}": ${reversePrefixMatches.map((s) => s.name).join(', ')}`
    );
    return null;
  }

  return null;
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

  /**
   * Issue 38 D43 (2026-05-25) — agent-verbalized tier intent.
   *
   * When supplied as a non-empty string AND the service has a tier whose
   * `tier_name` matches, this overrides the default selection precedence
   * for `scope` / `vehicle_size` / `specialty` branches.
   *
   * Semantics:
   * - Supplied + match found → that tier is used; canonical engine still
   *   dispatches per-size when the matched tier is `is_vehicle_size_aware`.
   * - Supplied + NO match (typo, hallucination, deleted tier) → function
   *   returns `null`. Caller surfaces the error (e.g., 400 +
   *   `instructions_for_agent` so the LLM recovers conversationally).
   *   Intentional fail-loud — never silently fall back to the default
   *   precedence when the caller asked for a specific tier.
   * - Empty string / null / undefined → existing precedence is preserved
   *   byte-identically (no behavior change for any caller that doesn't
   *   opt in).
   *
   * For `specialty`, when both `tierName` and `specialtyTier` are
   * supplied, `tierName` wins. If `tierName` is supplied but does NOT
   * match, the function returns null without consulting `specialtyTier`
   * — explicit caller intent dominates inferred vehicle metadata.
   *
   * Ignored for `flat` / `per_unit` / `custom` and the default
   * fallthrough branch — those have no tier to select against.
   *
   * Use case: SMS-AI v2 `send_quote_sms` (D44 / Session C) passes the
   * tier the agent verbalized to the customer (e.g., `per_row`) so the
   * persisted quote item matches what the customer was told.
   */
  tierName?: string | null;
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
 *
 * Issue 38 D43 (2026-05-25) — `options.tierName` opt-in:
 * When the caller supplies a non-empty `options.tierName`, the function
 * returns `null` if no tier on this service matches the requested name.
 * This is opt-in: callers that omit `options.tierName` (or pass it as
 * null / undefined / empty string) get the existing precedence and the
 * existing non-nullable return type via overload 1 / 2. Only the
 * explicit-tier-intent overload (3) widens the return type to
 * `ResolvedPrice | null`. See `ResolvePriceOptions.tierName` for full
 * semantics and the rationale for fail-loud-on-no-match.
 */
// Overload 1 — no options arg. Existing call shape; never returns null.
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string | null | undefined,
): ResolvedPrice;
// Overload 2 — options supplied without `tierName` (or with an explicit
// null/undefined `tierName`). Covers existing callers that pass only
// `{ specialtyTier: ... }`; never returns null.
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string | null | undefined,
  options: Omit<ResolvePriceOptions, 'tierName'> & { tierName?: null | undefined },
): ResolvedPrice;
// Overload 3 — `options.tierName` supplied as a non-null string. May
// return null if no tier matches (caller surfaces the error). Picked
// only when the call site narrows `tierName` to `string` — if a caller
// has a `string | null | undefined` value, they should branch on it
// before calling so the resolved type matches their intent.
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string | null | undefined,
  options: ResolvePriceOptions & { tierName: string },
): ResolvedPrice | null;
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string | null | undefined,
  options: ResolvePriceOptions = {}
): ResolvedPrice | null {
  const tiers = service.service_pricing || [];
  const saleWindow = {
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  };
  const sized = coerceSizeClass(sizeClass);

  // Issue 38 D43: normalize the explicit tier intent. Empty string,
  // null, and undefined collapse to `null` (= no intent), so every
  // caller that doesn't opt in follows the legacy precedence below
  // unchanged.
  const tierIntent =
    typeof options.tierName === 'string' && options.tierName.length > 0
      ? options.tierName
      : null;

  switch (service.pricing_model) {
    case 'flat': {
      // tierIntent IGNORED: flat services have no tiers to select against.
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
      // Issue 38 D43: explicit tier intent fails loud when the named
      // tier doesn't exist on this service (typo, hallucination, deleted
      // tier). Position: ABOVE the misconfigured-service fallback so a
      // tierIntent + zero-tier shape correctly returns null rather than
      // silently returning flat_price.
      if (tierIntent) {
        const tier = tiers.find((t) => t.tier_name === tierIntent);
        if (!tier) return null;
        const r = resolveServicePriceWithSale(tier, sized, saleWindow);
        return {
          price: r.standardPrice,
          salePrice: r.isOnSale ? r.effectivePrice : null,
          tierName: tier.tier_name,
          isOnSale: r.isOnSale,
        };
      }

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
      // tierIntent IGNORED: per_unit services carry no service_pricing
      // rows; price comes from `service.per_unit_price`.
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
      // Issue 38 D43: explicit tier intent dominates the inferred
      // `specialtyTier`. When both are supplied and tierIntent matches a
      // tier, tierIntent wins. When tierIntent is supplied but does NOT
      // match, return null — do NOT silently fall back to specialtyTier.
      // Explicit caller intent dominates inferred vehicle metadata.
      if (tierIntent) {
        const tier = tiers.find((t) => t.tier_name === tierIntent);
        if (!tier) return null;
        const r = resolveServicePriceWithSale(tier, null, saleWindow);
        return {
          price: r.standardPrice,
          salePrice: r.isOnSale ? r.effectivePrice : null,
          tierName: tier.tier_name,
          isOnSale: r.isOnSale,
        };
      }

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
      // tierIntent IGNORED: custom services are operator-assessed and
      // carry no tiers. `custom_starting_price` is a reference value.
      // No sale logic applies (caller can override at quote-item time
      // if needed).
      return {
        price: service.custom_starting_price ?? 0,
        salePrice: null,
        tierName: null,
        isOnSale: false,
      };
    }

    default: {
      // Unknown pricing_model — match pre-Layer-3d fallthrough
      // conservatively. tierIntent IGNORED: we don't know how to
      // interpret tier identity for an unknown model.
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
