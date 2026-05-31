/**
 * W1 (Unit B audit, 2026-05-30) — server-side classification check for
 * the booking route, plus the shared "primary bookable" predicate that
 * the public-booking data layer (`src/lib/data/booking.ts`) uses for
 * its source-of-truth query filter.
 *
 * Operator's Q-A LOCKED rule (Session #134 / U-B.2): only services
 * with `classification IN ('primary', 'both')` may be booked as the
 * standalone primary service on Step 2 of public booking. Services
 * with `classification = 'addon_only'` must never appear as standalone
 * options (they remain valid as add-ons to a primary service — that's
 * the whole point of the `addon_only` classification; the rule
 * forbids them only in the primary slot).
 *
 * Two-layer defense-in-depth (mirrors W2 / `_mobile-eligibility.ts`):
 *   1. **Client / data layer (`booking.ts`)** uses
 *      `PRIMARY_BOOKABLE_CLASSIFICATIONS` in a Supabase `.in()` filter
 *      so addon_only services never reach the Step 2 picker on a
 *      properly-rendered page (smaller payload, no leak risk).
 *   2. **Server (this route's POST handler)** uses
 *      `checkPrimaryClassification` to reject any submission whose
 *      primary `service_id` resolves to an addon_only service — catches
 *      tampered/replayed requests and deep-links that bypass the UI.
 *
 * Extracted from `route.ts` so the rule can be unit-tested without
 * standing up the route handler's Supabase/Stripe/Twilio dependencies
 * (mirrors the `_pricing.ts` + `_mobile-eligibility.ts` extraction
 * pattern; underscore prefix excludes from Next.js route resolution).
 *
 * `classification === 'both'` counts as primary by design — the schema
 * intent is "usable both standalone AND as an addon"; the Step 2
 * primary picker is one of the two surfaces it's permitted on.
 *
 * Return contract:
 *   { ok: true }                              → primary is bookable
 *   { ok: false, serviceName }                → caller emits 400 with
 *                                               the per-service message
 */

import type { ServiceClassification } from '@/lib/supabase/types';

export interface ClassifiedService {
  classification: ServiceClassification;
  name: string;
}

/**
 * Canonical predicate. Single source of truth for "is this service
 * allowed as a standalone primary on Step 2?" Used by both the client
 * filter (via the constant below) and the server check.
 */
export function isPrimaryBookable(classification: ServiceClassification): boolean {
  return classification === 'primary' || classification === 'both';
}

/**
 * Convenience list for Supabase `.in('classification', …)` filters.
 * Kept in sync with `isPrimaryBookable` by reading the same intent —
 * if either drifts, the helper's unit tests fail.
 */
export const PRIMARY_BOOKABLE_CLASSIFICATIONS: readonly ServiceClassification[] = [
  'primary',
  'both',
];

export type PrimaryClassificationCheck =
  | { ok: true }
  | { ok: false; serviceName: string };

export function checkPrimaryClassification(
  primary: ClassifiedService
): PrimaryClassificationCheck {
  if (!isPrimaryBookable(primary.classification)) {
    return { ok: false, serviceName: primary.name };
  }
  return { ok: true };
}

/**
 * Convenience message-builder so the route + tests share the same
 * customer-facing string verbatim. Changing the message in one place
 * keeps the test assertion locked to the production behavior.
 */
export function primaryClassificationErrorMessage(serviceName: string): string {
  return `${serviceName} cannot be booked as a standalone service. Please select a different service.`;
}
