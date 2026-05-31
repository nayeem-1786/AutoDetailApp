/**
 * W2 (Unit B audit, 2026-05-30) — server-side mobile-eligibility
 * defense-in-depth helper for the booking route.
 *
 * The Step 2 client already gates the "Add mobile service" UI on
 * `selectedService.mobile_eligible` (step-service-select.tsx:475) and
 * the addon-card mobile pill on `service.mobile_eligible` (`:870`), but
 * a tampered or replayed POST to `/api/book` could submit
 * `is_mobile=true` with a non-eligible primary service or addon. This
 * helper is the server's check.
 *
 * Extracted from `route.ts` (mirrors the `_pricing.ts` extraction
 * pattern; underscore prefix excludes it from Next.js route resolution)
 * so the rule can be unit-tested without standing up the full route
 * handler's Supabase/Stripe/Twilio dependencies.
 *
 * Return contract:
 *   { ok: true }                              → all services eligible
 *   { ok: false, serviceName }                → caller emits 400 with
 *                                               the per-service message
 */

export interface MobileEligibleService {
  mobile_eligible: boolean;
  name: string;
}

export type MobileEligibilityCheck =
  | { ok: true }
  | { ok: false; serviceName: string };

export function checkMobileEligibility(
  primary: MobileEligibleService,
  addons: MobileEligibleService[]
): MobileEligibilityCheck {
  if (!primary.mobile_eligible) {
    return { ok: false, serviceName: primary.name };
  }
  const ineligibleAddon = addons.find((a) => !a.mobile_eligible);
  if (ineligibleAddon) {
    return { ok: false, serviceName: ineligibleAddon.name };
  }
  return { ok: true };
}

/**
 * Convenience message-builder so the route + tests share the same
 * customer-facing string verbatim. Changing the message in one place
 * keeps the test assertion locked to the production behavior.
 */
export function mobileIneligibleErrorMessage(serviceName: string): string {
  return `${serviceName} is not available as a mobile service. Please remove it or choose in-shop booking.`;
}
