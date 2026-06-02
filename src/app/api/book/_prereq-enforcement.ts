/**
 * W5 (Unit B audit, 2026-05-30 — Session U-B.5 / Path B Session 1, 2026-06-02) —
 * server-side prerequisite-vehicle-compatibility check for the booking route.
 *
 * Q-W5-UX LOCKED rule (Session U-B.5): when a primary service has
 * prerequisites configured AND at least one of those prerequisite
 * services is NOT compatible with the customer's vehicle category
 * (`prerequisite_service.vehicle_compatibility` excludes the category's
 * compat key), the customer can NEVER self-service their way to the
 * dependent service — they need staff assistance. The client surfaces
 * a "Custom Quote" badge on the service card and replaces the
 * configure panel with `<RequestQuoteCard>` (same UX as W3
 * staff_assessed); the server's job is to catch tampered/replayed
 * requests where the customer skipped the client gate and submitted
 * the booking directly.
 *
 * **Public-booking SUBSET semantics (Q-Arch-1 LOCKED, expanded
 * architectural audit 709befa5):** unlike POS — which gates prereqs by
 * SATISFACTION (history/same-ticket) and offers a manager override —
 * public booking does NOT enforce satisfaction (the surface is too
 * thin to reason about a customer's history reliably, and POS owns
 * that semantic) and does NOT support override (the customer's escape
 * hatch is RequestQuoteCard → staff follow-up). This helper checks
 * one axis only: prereq vehicle-compatibility. That's the axis a
 * customer can never resolve themselves; satisfaction is something
 * staff will work out via the quote request.
 *
 * Two-layer defense-in-depth (mirrors W1 / `_classification.ts`,
 * W2 / `_mobile-eligibility.ts`, W3 / `_staff-assessed.ts`):
 *   1. **Client (`step-service-select.tsx`)** computes the same
 *      compatibility check per primary service (using
 *      `selectedCategoryKey` + the prereq data embedded in
 *      `getBookableServices`) and either:
 *        (a) shows a "Custom Quote" badge on the service card, OR
 *        (b) replaces the configure panel with `<RequestQuoteCard>`
 *            when the service is selected (suppressing the Continue
 *            button + price summary on desktop sidebar + mobile sticky
 *            footer).
 *      Together with W3's existing staff_assessed branch, the wizard
 *      treats W5 prereq-incompatibility as "requires staff quote."
 *   2. **Server (this route's POST handler)** uses
 *      `assertPrereqsCompatible` to reject any submission whose
 *      primary `service_id` resolves to a service with a
 *      vehicle-incompatible prerequisite.
 *
 * Empty/null `vehicle_compatibility` on a prerequisite service is
 * treated as "compatible with all vehicles" (the implicit default —
 * matches how `categoryToCompatibilityKey` + the main service
 * compat check at `route.ts:343` interpret the same shape).
 *
 * Q-W5-UX LOCKED: when blocked, the customer is routed to
 * `RequestQuoteCard` with `request_type='staff_assessed_service'`
 * (reuses the W3 discriminator — see Session U-B.5 decision; no
 * strong reason to split the analytics axis since the staff triage
 * path is identical). The error message wording closes with "Please
 * request a quote." — same imperative as `_staff-assessed.ts` so
 * the client routes the customer to the same affordance.
 *
 * Extracted from `route.ts` (mirrors the `_classification.ts` /
 * `_mobile-eligibility.ts` / `_staff-assessed.ts` extraction pattern;
 * underscore prefix excludes the file from Next.js route resolution)
 * so the rule can be unit-tested without standing up the route
 * handler's Supabase/Stripe/Twilio dependencies.
 *
 * Return contract:
 *   { ok: true }                                       → all prereqs
 *                                                        compatible (or
 *                                                        no prereqs)
 *   { ok: false, serviceName, offendingPrereqs }       → caller emits
 *                                                        400 with the
 *                                                        message
 */

import { categoryToCompatibilityKey, type VehicleCategory } from '@/lib/utils/vehicle-categories';

/**
 * Shape of a single prerequisite row as embedded from the
 * `service_prerequisites` table with the prereq service joined for
 * its `vehicle_compatibility`. The `prerequisite_service` join may
 * be null in pathological cases (deleted target) — the helper
 * skips those rather than treating them as incompatible.
 */
export interface PrereqRow {
  prerequisite_service: {
    name: string;
    vehicle_compatibility: string[] | null;
  } | null;
}

export interface PrereqPrimaryService {
  name: string;
  service_prerequisites: PrereqRow[];
}

export interface OffendingPrereq {
  service_name: string;
  vehicle_compatibility: string[];
}

export type PrereqCompatibilityCheck =
  | { ok: true }
  | { ok: false; serviceName: string; offendingPrereqs: OffendingPrereq[] };

/**
 * Pure check. Returns `{ ok: true }` when:
 *  - the primary has no prereqs configured, OR
 *  - no vehicle category is supplied (caller has nothing to check
 *    against — the route's main vehicle-compatibility check at
 *    `:343` is the canonical authority on vehicle/service mismatch
 *    when there IS a vehicle), OR
 *  - every prereq has empty/null `vehicle_compatibility` (implicit
 *    "compatible with all"), OR
 *  - every prereq's `vehicle_compatibility` includes the customer's
 *    category compat key.
 *
 * Returns `{ ok: false, serviceName, offendingPrereqs }` listing
 * every incompatible prereq (not just the first) so the caller can
 * surface either a single-prereq or a multi-prereq error message —
 * see `prereqIncompatibleErrorMessage` for the wording lock.
 */
export function assertPrereqsCompatible(
  primary: PrereqPrimaryService,
  vehicleCategory: VehicleCategory | null
): PrereqCompatibilityCheck {
  // No vehicle category supplied — caller may be in a path where the
  // canonical vehicle hasn't been resolved yet. Pass through; the
  // existing vehicle_compatibility check on the primary at
  // `route.ts:343` runs against the find-or-create canonical row and
  // is the authoritative gate when there IS a vehicle.
  if (!vehicleCategory) return { ok: true };

  const prereqs = primary.service_prerequisites ?? [];
  if (prereqs.length === 0) return { ok: true };

  const compatKey = categoryToCompatibilityKey(vehicleCategory);
  const offending: OffendingPrereq[] = [];

  for (const row of prereqs) {
    const ps = row.prerequisite_service;
    if (!ps) continue;
    const compat = Array.isArray(ps.vehicle_compatibility) ? ps.vehicle_compatibility : [];
    // Empty/null compat = compatible with all (implicit default — matches
    // the same shape's interpretation at `route.ts:343` and in
    // `check-prerequisites/route.ts:163`).
    if (compat.length === 0) continue;
    if (!compat.includes(compatKey)) {
      offending.push({
        service_name: ps.name,
        vehicle_compatibility: compat,
      });
    }
  }

  if (offending.length === 0) return { ok: true };
  return { ok: false, serviceName: primary.name, offendingPrereqs: offending };
}

/**
 * Convenience message-builder so the route + tests share the same
 * customer-facing string verbatim. Wording mirrors the W3 pattern:
 * "{name} <why> Please request a quote." — same imperative as
 * `_staff-assessed.ts` so the customer is routed to the same
 * `RequestQuoteCard` CTA on the next page-load.
 *
 * Two flavors based on the number of offending prereqs:
 *   single → names the offending prereq inline so the staff who
 *            receives the quote request can see what specifically
 *            tripped the gate (the customer sees the same context).
 *   multi  → comma-joins the offenders.
 */
export function prereqIncompatibleErrorMessage(
  serviceName: string,
  offendingPrereqs: OffendingPrereq[]
): string {
  if (offendingPrereqs.length === 0) {
    // Defensive — caller should not invoke the builder on an ok result,
    // but if they do, emit a generic message rather than an empty list.
    return `${serviceName} requires a custom quote for your vehicle. Please request a quote.`;
  }
  if (offendingPrereqs.length === 1) {
    return `${serviceName} requires ${offendingPrereqs[0].service_name}, which is not available for your vehicle. Please request a quote.`;
  }
  const names = offendingPrereqs.map((p) => p.service_name).join(', ');
  return `${serviceName} requires services (${names}) that are not available for your vehicle. Please request a quote.`;
}
