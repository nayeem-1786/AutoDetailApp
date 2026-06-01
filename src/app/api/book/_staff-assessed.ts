/**
 * W3 (Unit B audit, 2026-05-30) — server-side staff-assessed check for
 * the booking route.
 *
 * Q-B LOCKED rule (Session U-B.3): services with `staff_assessed=true`
 * require staff evaluation for pricing — they MUST NOT be bookable as a
 * standalone primary (or as an add-on) on Step 2 of public booking. The
 * customer is routed to a "Request a Quote" CTA instead (rendered by
 * `RequestQuoteCard` in `step-service-select.tsx`), which posts to the
 * generalized `/api/public/specialty-callback` endpoint with
 * `request_type='staff_assessed_service'` and triggers a staff
 * notification SMS.
 *
 * Two-layer defense-in-depth (mirrors W1 / `_classification.ts` and
 * W2 / `_mobile-eligibility.ts`):
 *   1. **Client (`step-service-select.tsx`)** branches the configure
 *      panel on `selectedService.staff_assessed` — when true it renders
 *      `RequestQuoteCard` in place of the configure UI + Continue
 *      button, so a customer cannot complete a normal booking flow on
 *      a staff_assessed service through the rendered page.
 *   2. **Server (this route's POST handler)** uses
 *      `checkNotStaffAssessed` to reject any submission whose primary
 *      OR addon `service_id` resolves to a `staff_assessed=true` row —
 *      catches tampered/replayed requests and deep-links that bypass
 *      the UI.
 *
 * Why both primary AND addons (mirroring W2 not W1): `staff_assessed`
 * is a per-service pricing-trust flag, semantically the same shape as
 * `mobile_eligible` (both are "this service can/cannot be self-booked
 * along axis X"). An add-on flagged `staff_assessed=true` carries the
 * same staff-evaluation requirement as a primary — the rule should
 * apply uniformly. `_classification.ts` checks primary only because
 * `classification='addon_only'` is EXPECTED and CORRECT in the addon
 * slot (different semantics — that flag describes WHERE the service is
 * usable, not whether it needs human review).
 *
 * Extracted from `route.ts` (mirrors the `_pricing.ts` + `_classification`
 * + `_mobile-eligibility` extraction pattern; underscore prefix excludes
 * it from Next.js route resolution) so the rule can be unit-tested
 * without standing up the route handler's Supabase/Stripe/Twilio
 * dependencies.
 *
 * Return contract:
 *   { ok: true }                              → no staff-assessed flags
 *   { ok: false, serviceName }                → caller emits 400 with
 *                                               the per-service message
 */

export interface StaffAssessedService {
  staff_assessed: boolean;
  name: string;
}

export type StaffAssessedCheck =
  | { ok: true }
  | { ok: false; serviceName: string };

export function checkNotStaffAssessed(
  primary: StaffAssessedService,
  addons: StaffAssessedService[]
): StaffAssessedCheck {
  // Primary precedence — if both primary and an addon are flagged, the
  // primary's name surfaces first so the customer addresses the root
  // problem (the service they picked) before the addon. Mirrors the
  // primary-precedence ordering in `_mobile-eligibility.ts`.
  if (primary.staff_assessed) {
    return { ok: false, serviceName: primary.name };
  }
  const flaggedAddon = addons.find((a) => a.staff_assessed);
  if (flaggedAddon) {
    return { ok: false, serviceName: flaggedAddon.name };
  }
  return { ok: true };
}

/**
 * Convenience message-builder so the route + tests share the same
 * customer-facing string verbatim. Changing the message in one place
 * keeps the test assertion locked to the production behavior.
 *
 * Wording mirrors the W1 / W2 pattern: "{name} <why> Please <next step>."
 * The "Please request a quote." closer is what routes the customer to
 * the RequestQuoteCard CTA on the next page-load — keep the imperative
 * verb-phrase aligned with the Step 2 affordance label.
 */
export function staffAssessedQuoteRequiredErrorMessage(serviceName: string): string {
  return `${serviceName} requires a custom quote and cannot be booked directly online. Please request a quote.`;
}
