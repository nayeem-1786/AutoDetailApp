/**
 * W7 (Unit B audit, 2026-05-30 — Session U-B.5 / Path B Session 1, 2026-06-02) —
 * server-side addon-vehicle-compatibility check for the booking route.
 *
 * The audit's W7 finding: addon services carry their own
 * `vehicle_compatibility` JSONB (same shape as primary services), but
 * the Step 2 addon list at `step-service-select.tsx:382–456` and the
 * server's primary-only vehicle-compat check at `route.ts:343` both
 * ignore it. An addon that lists `vehicle_compatibility: ['standard']`
 * (automobile-only) would be shown to — and bookable by — a customer
 * with an RV vehicle. Low-impact in practice because cross-category
 * addons are uncommon, but the rule is the same as the primary's: an
 * addon must be compatible with the customer's vehicle.
 *
 * Two-layer defense-in-depth (mirrors W1 / `_classification.ts`,
 * W2 / `_mobile-eligibility.ts`, W3 / `_staff-assessed.ts`,
 * W5 / `_prereq-enforcement.ts`):
 *   1. **Client (`step-service-select.tsx`)** filters the addon list
 *      by `addon.vehicle_compatibility includes customerVehicleCategory`
 *      (with empty/null treated as compatible-with-all) BEFORE
 *      rendering, so incompatible addons simply never appear in the
 *      picker. Unlike W1's filter-out / W3's keep-visible-suppress
 *      pattern, addons get the filter-out treatment because they're
 *      optional — there's no value in showing a "you can't add this"
 *      affordance to a customer who hasn't asked for it.
 *   2. **Server (this route's POST handler)** uses
 *      `checkAddonsVehicleCompatible` to reject any submission whose
 *      addon list includes an incompatible addon — catches tampered/
 *      replayed requests and the case of a customer who selected the
 *      addon for one vehicle category then swapped vehicles mid-flow
 *      (the client filter only runs at render time).
 *
 * Why this helper checks addons-only (unlike W2 / W3 which handle
 * primary + addons in a single call): the primary's
 * `vehicle_compatibility` is already validated by the existing
 * compat check at `route.ts:343` against the canonical find-or-create
 * row, which is the more authoritative source (it doesn't trust the
 * client-supplied category in cases where the existing-vehicle path
 * resolves a different one). Layering another primary check here
 * would just duplicate that gate. The audit's W7 finding is
 * specifically the addon gap.
 *
 * Empty/null `vehicle_compatibility` on an addon is treated as
 * "compatible with all vehicles" (the implicit default — matches
 * how `route.ts:343` interprets the same shape for the primary).
 *
 * Extracted from `route.ts` (mirrors the `_classification.ts` /
 * `_mobile-eligibility.ts` / `_staff-assessed.ts` /
 * `_prereq-enforcement.ts` extraction pattern; underscore prefix
 * excludes the file from Next.js route resolution) so the rule can
 * be unit-tested without standing up the route handler's Supabase/
 * Stripe/Twilio dependencies.
 *
 * Return contract:
 *   { ok: true }                              → all addons compatible
 *                                               (or no addons / no
 *                                               vehicle category)
 *   { ok: false, serviceName }                → caller emits 400 with
 *                                               the per-addon message
 */

import { categoryToCompatibilityKey, type VehicleCategory } from '@/lib/utils/vehicle-categories';

export interface CompatAddon {
  name: string;
  vehicle_compatibility: string[] | null;
}

export type AddonVehicleCompatibilityCheck =
  | { ok: true }
  | { ok: false; serviceName: string };

/**
 * Pure check. Returns `{ ok: true }` when:
 *  - no addons supplied (empty array), OR
 *  - no vehicle category supplied (caller has nothing to check
 *    against — symmetric with the prereq helper, the route's main
 *    vehicle handling is the canonical authority on vehicle/service
 *    mismatch), OR
 *  - every addon has empty/null `vehicle_compatibility` (implicit
 *    "compatible with all"), OR
 *  - every addon's `vehicle_compatibility` includes the customer's
 *    category compat key.
 *
 * Returns `{ ok: false, serviceName }` on the FIRST incompatible
 * addon by array order (mirrors `_mobile-eligibility.ts`'s
 * first-fail behavior so the customer addresses one addon at a
 * time rather than seeing a list).
 */
export function checkAddonsVehicleCompatible(
  addons: CompatAddon[],
  vehicleCategory: VehicleCategory | null
): AddonVehicleCompatibilityCheck {
  if (!vehicleCategory || addons.length === 0) return { ok: true };

  const compatKey = categoryToCompatibilityKey(vehicleCategory);

  const incompatible = addons.find((a) => {
    const compat = Array.isArray(a.vehicle_compatibility) ? a.vehicle_compatibility : [];
    // Empty/null compat = compatible with all (implicit default).
    return compat.length > 0 && !compat.includes(compatKey);
  });

  if (incompatible) return { ok: false, serviceName: incompatible.name };
  return { ok: true };
}

/**
 * Convenience message-builder so the route + tests share the same
 * customer-facing string verbatim. Wording mirrors the W2 pattern:
 * "{name} <why> Please <next step>." — the imperative closes with
 * "Please remove it and try again." because addons are optional and
 * the customer can resolve the block by unchecking the incompatible
 * addon (unlike a primary mismatch, which requires picking a
 * different service entirely).
 */
export function addonVehicleIncompatibleErrorMessage(serviceName: string): string {
  return `${serviceName} is not available for your vehicle. Please remove it and try again.`;
}
