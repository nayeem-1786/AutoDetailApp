# File Tree Reference — Smart Details Auto Spa

> **Purpose:** Exact file paths for every route, page, lib module, component, and migration.
> Claude Code prompts MUST reference this file instead of guessing paths.
>
> **Last updated:** 2026-04-22 (Session 42G — drawer X buttons + POS Clear button gate)

---

## API Routes (`src/app/api/`)

### Account (Customer Portal)
```
src/app/api/account/orders/[id]/route.ts
src/app/api/account/orders/route.ts
src/app/api/account/photos/route.ts
src/app/api/account/services/[jobId]/route.ts
src/app/api/account/services/route.ts
```

### Admin
```
src/app/api/admin/appointments/[id]/mobile-address/route.ts  # PATCH mobile_address only (Phase Mobile-1.6)
src/app/api/admin/appointments/[id]/mobile-service/route.ts  # PATCH full mobile picker — toggle/zone/custom/address (Phase Mobile-1.9)
src/app/api/admin/appointments/stats/route.ts
src/app/api/admin/audit-log/export/route.ts
src/app/api/admin/audit-log/route.ts
src/app/api/admin/current-ip/route.ts
src/app/api/admin/customers/[id]/credits/route.ts                          # Phase 3 Theme E.3 (AC-15 operator UI) — admin customer-credits endpoint: GET (balance fetch) + POST (manual issuance). Thin wrapper over createCustomerCredit + getCustomerCreditBalance (E.1 repository). POST gated under `customers.adjust_loyalty` (semantically identical to manual loyalty ledger writes); GET gated by admin session only. Reasons restricted to `manual_adjustment` / `goodwill` / `promotional` / `refund_as_credit` (cancellation_refund reserved for cancel flow).
src/app/api/admin/customers/[id]/credits/__tests__/route.test.ts          # Phase 3 Theme E.3 — 10 endpoint tests: POST 201 + audit, 401 unauthed, 403 unpermitted, 400 negative/zero amount, 400 non-integer amount, 400 invalid/missing reason, expires_at passthrough; GET 200 balance, 401 unauthed, 500 on repo throw.
src/app/api/admin/customers/[id]/photos/route.ts
src/app/api/admin/customers/[id]/portal-access/route.ts
src/app/api/admin/customers/[id]/reset-password/route.ts
src/app/api/admin/customers/[id]/restore/route.ts
src/app/api/admin/customers/[id]/route.ts
src/app/api/admin/customers/check-duplicate/route.ts
src/app/api/admin/customers/route.ts
src/app/api/admin/customers/search/route.ts
src/app/api/admin/customers/stats/route.ts
src/app/api/admin/customers/purge/route.ts
src/app/api/admin/customers/[id]/purge-preview/route.ts
src/app/api/admin/orphan-conversations/route.ts
src/app/api/admin/orphan-conversations/purge/route.ts
src/app/api/admin/global-search/route.ts
src/app/api/admin/footer/bottom-links/route.ts
src/app/api/admin/footer/columns/[columnId]/links/route.ts
src/app/api/admin/footer/columns/reorder/route.ts
src/app/api/admin/footer/columns/route.ts
src/app/api/admin/footer/sections/route.ts
src/app/api/admin/jobs/[id]/route.ts
src/app/api/admin/jobs/route.ts
src/app/api/admin/messaging/[conversationId]/summary/route.ts
src/app/api/admin/notification-recipients/[id]/route.ts
src/app/api/admin/notification-recipients/route.ts
src/app/api/admin/orders/[id]/refund/route.ts
src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts
src/app/api/admin/orders/[id]/route.ts
src/app/api/admin/orders/route.ts
src/app/api/admin/products/[id]/group/route.ts
src/app/api/admin/products/[id]/variants/route.ts
src/app/api/admin/products/group/route.ts
src/app/api/admin/products/barcode-lookup/route.ts
src/app/api/admin/photos/[id]/route.ts
src/app/api/admin/photos/bulk/route.ts
src/app/api/admin/photos/route.ts
src/app/api/admin/photos/tags/route.ts
src/app/api/admin/photos/gallery-preview/route.ts
src/app/api/admin/purchase-orders/[id]/receive/route.ts
src/app/api/admin/purchase-orders/[id]/route.ts
src/app/api/admin/purchase-orders/route.ts
src/app/api/admin/quotes/route.ts
src/app/api/admin/quotes/stats/route.ts
src/app/api/admin/receipt-logo/route.ts
src/app/api/admin/shop-expenses/export/route.ts
src/app/api/admin/stock-adjustments/route.ts
src/app/api/admin/inventory/counts/route.ts
src/app/api/admin/inventory/counts/[id]/route.ts
src/app/api/admin/inventory/counts/[id]/items/route.ts
src/app/api/admin/inventory/counts/[id]/commit/route.ts
src/app/api/admin/inventory/counts/[id]/cancel/route.ts
src/app/api/admin/inventory/counts/[id]/transition/route.ts
src/app/api/admin/inventory/counts/[id]/revert/route.ts
src/app/api/admin/inventory/counts/[id]/revert-preview/route.ts
src/app/api/admin/inventory/counts/__tests__/commit.test.ts
src/app/api/admin/inventory/counts/__tests__/revert.test.ts
src/app/api/admin/inventory/counts/__tests__/revert-preview.test.ts
src/app/admin/inventory/counts/__tests__/revert-flow.test.tsx
src/app/api/admin/transactions/stats/route.ts
src/app/api/admin/upload/content-image/route.ts
```

### Admin — Email Templates
```
src/app/api/admin/email-templates/route.ts
src/app/api/admin/email-templates/[id]/route.ts
src/app/api/admin/email-templates/[id]/preview/route.ts
src/app/api/admin/email-templates/[id]/test-send/route.ts
src/app/api/admin/email-templates/[id]/reset/route.ts
src/app/api/admin/email-templates/assignments/route.ts
src/app/api/admin/email-templates/gallery-photos/route.ts
src/app/api/admin/email-templates/brand-kit/route.ts
src/app/api/admin/email-templates/layouts/route.ts
src/app/api/admin/email-templates/layouts/[id]/route.ts
```

### Admin — Drip Sequences
```
src/app/api/admin/drip-sequences/route.ts
src/app/api/admin/drip-sequences/[id]/route.ts
src/app/api/admin/drip-sequences/[id]/steps/route.ts
src/app/api/admin/drip-sequences/[id]/steps/[stepId]/route.ts
src/app/api/admin/drip-sequences/[id]/enrollments/route.ts
src/app/api/admin/drip-sequences/[id]/enrollments/[enrollId]/route.ts
src/app/api/admin/drip-sequences/[id]/analytics/route.ts
```

### Admin — CMS
```
src/app/api/admin/cms/ads/analytics/route.ts
src/app/api/admin/cms/ads/creatives/[id]/route.ts
src/app/api/admin/cms/ads/creatives/route.ts
src/app/api/admin/cms/ads/placements/[id]/route.ts
src/app/api/admin/cms/ads/placements/route.ts
src/app/api/admin/cms/ads/zones/route.ts
src/app/api/admin/cms/catalog/products/route.ts
src/app/api/admin/cms/catalog/services/route.ts
src/app/api/admin/cms/products/ai-enrich/route.ts
src/app/api/admin/cms/products/ai-enrich/apply/route.ts
src/app/api/admin/cms/products/ai-enrich/status/route.ts
src/app/api/admin/cms/products/ai-enrich/results/route.ts
src/app/api/admin/cms/products/ai-enrich/delete-errors/route.ts
src/app/api/admin/cms/content/[id]/route.ts
src/app/api/admin/cms/migrate-data/route.ts
src/app/api/admin/cms/content/ai-generate/route.ts
src/app/api/admin/cms/migrate-markdown/route.ts
src/app/api/admin/cms/content/reorder/route.ts
src/app/api/admin/cms/content/route.ts
src/app/api/admin/cms/global-blocks/route.ts
src/app/api/admin/cms/global-blocks/[id]/route.ts
src/app/api/admin/cms/global-blocks/[id]/place/route.ts
src/app/api/admin/cms/homepage-settings/route.ts
src/app/api/admin/cms/hero/[id]/route.ts
src/app/api/admin/cms/hero/config/route.ts
src/app/api/admin/cms/hero/reorder/route.ts
src/app/api/admin/cms/hero/route.ts
src/app/api/admin/cms/navigation/[id]/route.ts
src/app/api/admin/cms/navigation/reorder/route.ts
src/app/api/admin/cms/navigation/route.ts
src/app/api/admin/cms/pages/[id]/route.ts
src/app/api/admin/cms/pages/[id]/preview/route.ts
src/app/api/admin/cms/pages/[id]/revisions/route.ts
src/app/api/admin/cms/pages/[id]/revisions/[revisionId]/route.ts
src/app/api/admin/cms/pages/[id]/revisions/[revisionId]/restore/route.ts
src/app/api/admin/cms/pages/ai-draft/route.ts
src/app/api/admin/cms/pages/route.ts
src/app/api/admin/cms/seo/ai-apply/route.ts
src/app/api/admin/cms/seo/ai-generate/route.ts
src/app/api/admin/cms/seo/ai-txt/route.ts
src/app/api/admin/cms/seo/cities/[id]/route.ts
src/app/api/admin/cms/seo/cities/route.ts
src/app/api/admin/cms/seo/pages/[encodedPath]/route.ts
src/app/api/admin/cms/seo/pages/route.ts
src/app/api/admin/cms/site-theme/reset/route.ts
src/app/api/admin/cms/site-theme/route.ts
src/app/api/admin/cms/themes/[id]/activate/route.ts
src/app/api/admin/cms/themes/[id]/deactivate/route.ts
src/app/api/admin/cms/themes/[id]/route.ts
src/app/api/admin/cms/themes/route.ts
src/app/api/admin/cms/tickers/[id]/route.ts
src/app/api/admin/cms/tickers/reorder/route.ts
src/app/api/admin/cms/tickers/route.ts
```

### Admin — Integrations (QuickBooks)
```
src/app/api/admin/integrations/qbo/accounts/route.ts
src/app/api/admin/integrations/qbo/callback/route.ts
src/app/api/admin/integrations/qbo/connect/route.ts
src/app/api/admin/integrations/qbo/disconnect/route.ts
src/app/api/admin/integrations/qbo/reports/export/route.ts
src/app/api/admin/integrations/qbo/reports/route.ts
src/app/api/admin/integrations/qbo/settings/route.ts
src/app/api/admin/integrations/qbo/status/route.ts
src/app/api/admin/integrations/qbo/sync/log/export/route.ts
src/app/api/admin/integrations/qbo/sync/log/route.ts
src/app/api/admin/integrations/qbo/sync/retry/route.ts
src/app/api/admin/integrations/qbo/sync/route.ts
```

### Admin — Marketing Analytics
```
src/app/api/admin/marketing/analytics/ab-tests/route.ts
src/app/api/admin/marketing/analytics/audience/route.ts
src/app/api/admin/marketing/analytics/automations/route.ts
src/app/api/admin/marketing/analytics/campaigns/[id]/route.ts
src/app/api/admin/marketing/analytics/campaigns/route.ts
src/app/api/admin/marketing/analytics/coupons/route.ts
src/app/api/admin/marketing/analytics/route.ts
src/app/api/admin/marketing/promotions/batch/route.ts
src/app/api/admin/marketing/promotions/clear/route.ts
src/app/api/admin/marketing/promotions/history/route.ts
src/app/api/admin/marketing/promotions/route.ts
```

### Admin — Settings
```
src/app/api/admin/settings/business/route.ts
src/app/api/admin/settings/revalidate-business/route.ts
src/app/api/admin/settings/shipping/carriers/route.ts
src/app/api/admin/settings/shipping/route.ts
src/app/api/admin/settings/shipping/test-connection/route.ts
src/app/api/admin/settings/shipping/validate-address/route.ts
```

### POS — Settings
```
src/app/api/pos/settings/quote-defaults/route.ts
```

### Admin — Credentials
```
src/app/api/admin/credentials/route.ts
src/app/api/admin/credentials/[id]/route.ts
src/app/api/admin/credentials/reorder/route.ts
```

### Admin — Team Members
```
src/app/api/admin/team-members/route.ts
src/app/api/admin/team-members/[id]/route.ts
src/app/api/admin/team-members/reorder/route.ts
```

### Admin — Vehicle Categories
```
src/app/api/admin/vehicle-categories/route.ts
src/app/api/admin/vehicle-categories/[id]/route.ts
src/app/api/admin/vehicle-categories/[id]/image/route.ts
```

### Admin — Vehicle Makes
```
src/app/api/admin/vehicle-makes/route.ts
```

### Admin — Staff & Roles
```
src/app/api/admin/staff/[id]/permissions/route.ts
src/app/api/admin/staff/[id]/reset-password/route.ts
src/app/api/admin/staff/[id]/route.ts
src/app/api/admin/staff/roles/[id]/reset/route.ts
src/app/api/admin/staff/roles/[id]/route.ts
src/app/api/admin/staff/roles/route.ts
```

### Admin — Stripe
```
src/app/api/admin/stripe/debug/route.ts
src/app/api/admin/stripe/locations/route.ts
src/app/api/admin/stripe/readers/[id]/route.ts
src/app/api/admin/stripe/readers/register/route.ts
src/app/api/admin/stripe/readers/route.ts
```

### Appointments
```
src/app/api/appointments/[id]/cancel/route.ts                       # POST cancel — Session 1.8 added direct sendSms dispatch loop for waitlist-notified customers (replaces dead fireWebhook; webhook fire retained alongside for forward-compat); audit f5e714a8 Target D.4
src/app/api/appointments/[id]/__tests__/cancel.test.ts              # Session 1.8 — 5 cases pinning waitlist SMS dispatch / no-phone skip / inactive-template skip / forward-compat webhook
src/app/api/appointments/[id]/notify/route.ts
src/app/api/appointments/[id]/route.ts                              # PATCH admin appointment edit — Session 1.5 added STATUS_TRANSITIONS guard (closes pre-1.5 permissive hole) + executeUnMaterialize cascade for `confirmed → pending` / `in_progress → pending` backward reverts when an active job exists. Admin/POS symmetry per AC-5.
src/app/api/appointments/[id]/__tests__/patch.test.ts               # Session 1.5 — 9 cases pinning admin PATCH state-machine guard + cascade invocation with admin source + pre-1.5 happy-path regressions
```

### Auth
```
src/app/api/auth/my-permissions/route.ts
src/app/api/authorize/[token]/approve/route.ts
src/app/api/authorize/[token]/decline/route.ts
src/app/api/authorize/[token]/route.ts
```

### Booking (Public)
```
src/app/api/book/check-customer/route.ts
src/app/api/book/check-phone/route.ts
src/app/api/book/payment-intent/route.ts
src/app/api/book/route.ts
src/app/api/book/_mobile-eligibility.ts                 # Session #133 (U-B.1 W2, 2026-05-30) — pure helper `checkMobileEligibility(primary, addons)` + `mobileIneligibleErrorMessage(name)`. Server-side defense-in-depth for `services.mobile_eligible` — the Step 2 client already gates the mobile UI but a tampered/replayed request could submit `is_mobile=true` with a non-eligible service. Extracted from `route.ts` so the rule can be unit-tested without standing up Supabase/Stripe/Twilio (mirrors `_pricing.ts` pattern; underscore prefix excludes from Next.js route resolution). Return contract: `{ ok: true }` | `{ ok: false; serviceName }` — caller emits 400 with the per-service message. Primary precedence: primary's name surfaces first if both ineligible.
src/app/api/book/_classification.ts                     # Session #134 (U-B.2 W1, 2026-05-30) — pure helper closing W1 from Unit B audit. Exports `isPrimaryBookable(c)` canonical predicate (single source of truth for "is bookable as standalone primary"), `PRIMARY_BOOKABLE_CLASSIFICATIONS = ['primary', 'both']` constant (imported by `src/lib/data/booking.ts` for its Supabase `.in('classification', …)` filter — same constant drives client filter + server check, drift guard), `checkPrimaryClassification(primary)` runtime check, `primaryClassificationErrorMessage(name)` wording lock. Q-A LOCKED rule: only `primary` + `both` classifications may appear as standalone on Step 2; `addon_only` services stay valid AS ADD-ONS but never as standalone primary. `'both' === primary on Step 2` is explicit in the predicate (schema intent: usable in BOTH surfaces, Step 2 primary picker is one). Mirrors `_mobile-eligibility.ts` byte-symmetrically; underscore prefix excludes from Next.js route resolution; helper unit-testable without Supabase/Stripe/Twilio.
src/app/api/book/_staff-assessed.ts                      # Session #137 (U-B.3 W3, 2026-06-01) — pure helper closing W3 from Unit B audit. Exports `checkNotStaffAssessed(primary, addons)` runtime check + `staffAssessedQuoteRequiredErrorMessage(name)` wording lock. Q-B LOCKED rule: services with `staff_assessed=true` require staff evaluation for pricing — must NOT be bookable as standalone primary OR as add-on; customer routed to "Request a Quote" CTA via `<RequestQuoteCard>` in step-service-select.tsx. Mirrors `_mobile-eligibility.ts` byte-symmetrically (primary precedence; addon detected by array order). `(primary, addons)` shape mirrors W2's because both checks are per-service boolean flags that can attach to either slot — unlike W1 which checks primary only (`classification='addon_only'` is EXPECTED in the addon slot). Server-layer 2 defense for the W3 fix; layer 1 is the visible CTA in step-service-select.tsx. Invoked in `/api/book/route.ts` AFTER classification check + BEFORE price validation (staff_assessed has no canonical price, so this error surfaces first and is actionable). Underscore prefix excludes from Next.js route resolution; helper unit-testable without Supabase/Stripe/Twilio.
src/app/api/book/_prereq-enforcement.ts                  # Session #140 (U-B.5 / Path B Session 1 W5, 2026-06-02) — pure helper closing W5 from Unit B audit. Exports `assertPrereqsCompatible(primary, vehicleCategory)` runtime check + `prereqIncompatibleErrorMessage(serviceName, offendingPrereqs)` wording lock. Q-W5-UX LOCKED Option 1 rule: when a primary service has prerequisites configured AND at least one prereq's `vehicle_compatibility` excludes the customer's vehicle category, the customer cannot self-service the dependent service — they are routed to `<RequestQuoteCard>` with `request_type='staff_assessed_service'` (reuses W3 discriminator). Public-booking SUBSET semantics: unlike POS — which gates by SATISFACTION (history/same-ticket) + offers manager override — this helper checks ONE axis only: prereq vehicle-compatibility (the axis the customer can never resolve themselves). NO override on this surface. Mirrors `_classification.ts` / `_staff-assessed.ts` byte-symmetrically. Empty/null prereq `vehicle_compatibility` = compatible-with-all (implicit default, matches `route.ts:343` interpretation). Returns `{ ok: true }` | `{ ok: false; serviceName; offendingPrereqs[] }`. Error builder has 2 variants: single-offender names prereq inline (`"{primary} requires {prereq}, which is not available for your vehicle. Please request a quote."`); multi-offender comma-joins. Both close with "Please request a quote." — same imperative as W3 (`_staff-assessed.ts`) so the customer is routed to the same RequestQuoteCard CTA on the next page-load. Invoked in `/api/book/route.ts` AFTER staff_assessed check + BEFORE price validation (mirrors W3 ordering — surface gate errors before price-mismatch fallback). Underscore prefix excludes from Next.js route resolution; helper unit-testable without Supabase/Stripe/Twilio.
src/app/api/book/_addon-vehicle-compat.ts                # Session #140 (U-B.5 / Path B Session 1 W7, 2026-06-02) — pure helper closing W7 from Unit B audit. Exports `checkAddonsVehicleCompatible(addons, vehicleCategory)` runtime check + `addonVehicleIncompatibleErrorMessage(name)` wording lock. Each addon carries its own `vehicle_compatibility` (same shape as primary); the audit found this field was dead on both client (step-service-select.tsx addon list rendered all suggestions regardless of category) and server (route.ts:343 checked primary only). Layer-1 client fix filters addonSuggestions BEFORE rendering (filter-out pattern, NOT keep-visible-suppress — addons are optional so there's no value in showing a "you can't add this" affordance). Layer-2 server helper invoked against the shared `addonServiceRows` (extended in this session to include `vehicle_compatibility` — now serves 4 consumers: W2 + W3 + W4 + W7 in one query). First-fail by array order (mirrors `_mobile-eligibility.ts`). Empty/null `vehicle_compatibility` = compatible-with-all. Error wording closes with "Please remove it and try again." — DIFFERENT closer from W5 because addons are resolvable client-side (no staff escalation needed). Mirrors `_classification.ts` / `_mobile-eligibility.ts` / `_staff-assessed.ts` byte-symmetrically. Underscore prefix excludes from Next.js route resolution; helper unit-testable without Supabase/Stripe/Twilio.
src/app/api/book/slots/route.ts
src/app/api/book/validate-coupon/route.ts
src/app/api/book/__tests__/modifier-persistence.test.ts  # 4 tests — pins Item 15g Layer 15g-iv Scenario A: POST /api/book persists coupon + loyalty to dedicated columns, never to internal_notes (post-cleanup contract)
src/app/api/book/__tests__/booking-combo.test.ts        # NEW Issue 33 Layer 1 — 11 tests. Boundary pin: bookingVehicleSchema rejects exotic/classic size_class at Zod layer (CUSTOMER_SELF_SERVICE_SIZE_CLASSES). Combo HIT/MISS on booking-shaped items (primary + addons), lowestWins prevents combo from raising addon price.
src/app/api/book/__tests__/mobile-eligibility.test.ts   # Session #133 (U-B.1 W2, 2026-05-30) — 7 tests pinning the server-side mobile-eligibility rule. Covers primary ineligible (no addons), addon ineligible (eligible primary), primary-before-addon precedence, first-ineligible-by-array-order, single-addon edge cases (start + end of array), and `mobileIneligibleErrorMessage` wording lock (so the customer-facing string is byte-stable across refactors).
src/app/api/book/__tests__/classification.test.ts       # Session #134 (U-B.2 W1, 2026-05-30) — 11 tests pinning the operator's Q-A LOCKED rule: only `classification IN ('primary', 'both')` may be booked as standalone primary on Step 2. Covers `isPrimaryBookable` predicate × 3 classifications (primary ✓, both ✓, addon_only ✗), `PRIMARY_BOOKABLE_CLASSIFICATIONS` constant drift guard × 3 cases (exact value match, every value passes predicate, addon_only NOT in constant), `checkPrimaryClassification` runtime check × 3 outcomes, `primaryClassificationErrorMessage` wording lock × 2 (clean name + punctuation edge). Drift guards ensure the predicate + constant stay in sync if either is edited in isolation.
src/app/api/book/__tests__/staff-assessed.test.ts        # Session #137 (U-B.3 W3, 2026-06-01) — 11 tests pinning the operator's Q-B LOCKED rule: services with `staff_assessed=true` cannot be booked as standalone primary OR as add-on. Covers `checkNotStaffAssessed` primary precedence (primary's name surfaces first when both flagged), addon-by-array-order detection (first staff_assessed addon by index wins), single-addon edge cases (start + end of array), empty-array contract (clean primary + no addons → ok), and `staffAssessedQuoteRequiredErrorMessage` wording lock × 3 (clean name + hyphenated + ampersand variants). The lone customer-facing string lives in the helper so the route + tests share it; changing it in one place keeps the test assertion locked to the production behavior.
src/app/api/book/__tests__/deposit-tax-persistence.test.ts # Session #138 (U-B.4 W4, 2026-06-01) — 8 tests pinning the operator's Q-C-1 LOCKED Option A: line-item `is_taxable` persistence on the deposit `transaction_items` rows reflects `services.is_taxable` per-row; `tax_amount` stays 0 on items + the deposit transaction because no tax is collected at deposit time (CA CDTFA Pub 100). Mirrors `modifier-persistence.test.ts` harness style (Stripe + combo-resolver + card-detail mocked; supabase builder extended for `transactions` + `transaction_items` + `payments` + `services.in()`). Coverage: primary taxable + primary non-taxable (anti-overshoot guard against always-true regressions); mixed-flag addon case (one taxable + one non-taxable in the SAME submission proves per-row `Map` lookup actually varies vs a bulk "all addons get the same flag" regression); missing addon row defensive default (POS finalization re-reads canonical at drain time); CDTFA mobile-fee always-false regression pin (defends against a blanket "use serviceRow flag everywhere" refactor — the one legitimate post-W4 hardcoded-false); `tax_amount=0` invariant on all items + on the deposit transaction row (anti-overshoot guard against future Option-B drift); no-deposit path writes zero `transaction_items` rows (boundary pin — the W4 invariants only apply to the deposit branch).
src/app/api/book/__tests__/prereq-enforcement.test.ts    # Session #140 (U-B.5 / Path B Session 1 W5, 2026-06-02) — 16 tests pinning the Q-W5-UX LOCKED Option 1 rule: prereq vehicle-compatibility check on `/api/book` rejects primary services whose configured prereqs are incompatible with the customer's vehicle category. Covers: no prereqs configured → ok; null vehicleCategory → ok (no axis to check); prereq with empty/null vehicle_compatibility → ok (implicit "compatible-with-all"); single prereq compatible (automobile → standard mapping) → ok; multiple prereqs all compatible → ok; single offender → `{ok: false, offendingPrereqs: [...]}`; mixed list (one offender among compatible) → lists only the offender; multi-offender → lists ALL (not first-only) so staff see full gap context; null prereq_service join (deleted target) → skipped defensively rather than treated as incompatible; automobile→standard compat-key mapping symmetry × 4 non-automobile categories (motorcycle/rv/boat/aircraft — anti-regression for an easy-to-invert vocabulary translation); wording-lock × 4 (single inline, multi comma-join, defensive empty list, regex-pinned "Please request a quote." closer to match W3's imperative byte-for-byte so customer routes to same RequestQuoteCard CTA). Companion to `classification.test.ts` (W1), `mobile-eligibility.test.ts` (W2), `staff-assessed.test.ts` (W3), `addon-vehicle-compat.test.ts` (W7).
src/app/api/book/__tests__/addon-vehicle-compat.test.ts  # Session #140 (U-B.5 / Path B Session 1 W7, 2026-06-02) — 14 tests pinning the W7 rule: each addon's own `vehicle_compatibility` is honored on `/api/book`. Covers: empty addons → ok; null vehicleCategory → ok (no axis); all addons empty/null compat → ok (implicit "compatible-with-all"); single category match → ok; multi-category compat list with one matching value → ok; mixed list of restricted + unrestricted addons all compatible → ok; first-fail by array order (anti-regression for "check all but report first" pattern — mirrors `_mobile-eligibility.ts`); single incompatible → `{ok: false, serviceName}`; standard↔automobile mapping anti-regression × 4 non-automobile categories (automobile-only addon rejected for motorcycle/rv/boat/aircraft); wording-lock × 3 (exact match, punctuation/ampersand variant, regex-pinned "Please remove it and try again." closer + NEGATIVE assertion that the message does NOT contain "request a quote" — anti-regression against accidentally re-using W5/W3's customer-escalation closer for an optional-addon block). Companion to `prereq-enforcement.test.ts` (W5).
```

### Checkout (Online Store)
```
src/app/api/checkout/create-payment-intent/route.ts
src/app/api/checkout/customer-info/route.ts
src/app/api/checkout/order/route.ts
src/app/api/checkout/shipping-rates/route.ts
src/app/api/checkout/validate-address/route.ts
```

### Pay Link (Appointment Payment Links)
```
src/app/api/pay/[token]/intent/route.ts   — POST: create PI for /pay/[token] (Pay-Link Session 2)
```

### Cron (Internal Scheduler)
```
src/app/api/cron/cleanup-audit-log/route.ts
src/app/api/cron/cleanup-idempotency/route.ts
src/app/api/cron/cleanup-orders/route.ts
src/app/api/cron/cleanup-verification-codes/route.ts
src/app/api/cron/conversation-summaries/route.ts
src/app/api/cron/google-reviews/route.ts
src/app/api/cron/lifecycle-engine/route.ts
src/app/api/cron/qbo-sync/route.ts
src/app/api/cron/booking-reminders/route.ts
src/app/api/cron/quote-reminders/route.ts
src/app/api/cron/stock-alerts/route.ts
src/app/api/cron/theme-activation/route.ts
src/app/api/cron/voice-calls-poll/route.ts
```

### Customer Portal API
```
src/app/api/customer/appointments/[id]/cancel/route.ts
src/app/api/customer/appointments/[id]/route.ts
src/app/api/customer/check-exists/route.ts
src/app/api/customer/coupons/route.ts
src/app/api/customer/complete-profile/route.ts
src/app/api/customer/link-account/route.ts
src/app/api/customer/dismiss-email-prompt/route.ts
src/app/api/customer/email/route.ts
src/app/api/customer/email/send-code/route.ts
src/app/api/customer/email/verify-code/route.ts
src/app/api/customer/link-by-phone/route.ts
src/app/api/customer/loyalty/route.ts
src/app/api/customer/profile/route.ts
src/app/api/customer/profile/address/route.ts
src/app/api/customer/receipts/html/route.ts
src/app/api/customer/transactions/[id]/route.ts
src/app/api/customer/transactions/route.ts
src/app/api/customer/vehicles/[id]/route.ts
src/app/api/customer/vehicles/[id]/__tests__/route.test.ts  # Session #136 (U-B.3, 2026-05-31) — 5 tests pinning B3/B4 PATCH null-preservation. Covers client-sent specialty_tier:null WRITTEN as NULL (operator-confirmed B3 scenario where specialty→automobile category change silently dropped the null pre-#136), missing-field-with-no-default SKIPPED contract, classifier-resolved size_class override regression (Session 29 anti-gaming preserved), and updated_at timestamp always set.
src/app/api/customer/vehicles/route.ts
```

### Marketing
```
src/app/api/marketing/automations/[id]/route.ts
src/app/api/marketing/automations/route.ts
src/app/api/marketing/campaigns/[id]/duplicate/route.ts
src/app/api/marketing/campaigns/[id]/recipients/route.ts
src/app/api/marketing/campaigns/[id]/route.ts
src/app/api/marketing/campaigns/[id]/send/route.ts
src/app/api/marketing/campaigns/audience-preview/route.ts
src/app/api/marketing/campaigns/audience-sample/route.ts
src/app/api/marketing/campaigns/process-scheduled/route.ts
src/app/api/marketing/campaigns/route.ts
src/app/api/marketing/compliance/opt-out/route.ts
src/app/api/marketing/compliance/route.ts
src/app/api/marketing/coupons/[id]/route.ts
src/app/api/marketing/coupons/[id]/stats/route.ts
src/app/api/marketing/coupons/[id]/summary/route.ts
src/app/api/marketing/coupons/route.ts
```

### Messaging (Two-Way SMS)
```
src/app/api/messaging/conversations/[id]/messages/route.ts
src/app/api/messaging/conversations/[id]/read/route.ts
src/app/api/messaging/conversations/[id]/route.ts
src/app/api/messaging/conversations/counts/route.ts
src/app/api/messaging/conversations/route.ts
src/app/api/messaging/send/route.ts
src/app/api/messaging/unread-count/route.ts
```

### Migration (Data Import)
```
src/app/api/migration/customers/route.ts
src/app/api/migration/loyalty/route.ts
src/app/api/migration/products/route.ts
src/app/api/migration/transactions/route.ts
src/app/api/migration/vehicles/route.ts
```

### POS
```
src/app/api/pos/appointments/route.ts                         # GET list (date range, default today+tomorrow) — Roadmap Item 12
src/app/api/pos/appointments/__tests__/list.test.ts
src/app/api/pos/appointments/[id]/route.ts                     # GET single appointment (Item 15c) + PATCH combined edit (Item 15e Phase 2A — HMAC + per-field perms + STATUS_TRANSITIONS enforced + webhooks fire; backs the reused admin dialog in POS Schedule scope). Session 1.5 added executeUnMaterialize cascade for `confirmed → pending` / `in_progress → pending` backward reverts when an active job exists; cascade error propagation bubbles 422 confirm_required / 409 transaction_linked / 409 terminal up to the caller.
src/app/api/pos/appointments/[id]/__tests__/get.test.ts
src/app/api/pos/appointments/[id]/__tests__/patch.test.ts      # Item 15e Phase 2A — 17 cases: auth/per-field perms/transition validation/overlap/webhook firing/response shape
src/app/api/pos/appointments/[id]/cancel/route.ts              # POST cancel — POS-specific, notify_customer flag default false (Roadmap Item 15b)
src/app/api/pos/appointments/[id]/cancel/__tests__/cancel.test.ts
src/app/api/pos/appointments/[id]/load/route.ts                # Item 15f Phase 1 Layer 8b — GET TicketState-shaped payload for POS deep-link drain (`/pos?source=appointment&id=...`). Sibling of jobs/checkout-items. Gates on pos.jobs.manage (matches PUT cascade); refuses completed/cancelled status (matches save guard).
src/app/api/pos/appointments/[id]/load/__tests__/route.test.ts # 10 cases — auth (401/403), 404 missing, 400 completed/cancelled, modifier-column passthrough, mobile_fee synthesis, deposit + deposit_date lookup
src/app/api/pos/appointments/[id]/mobile-address/route.ts     # PATCH mobile_address only (Phase Mobile-1.6)
src/app/api/pos/appointments/[id]/mobile-service/route.ts     # PATCH full mobile picker — toggle/zone/custom/address (Phase Mobile-1.9)
src/app/api/pos/appointments/[id]/notify/route.ts
src/app/api/pos/appointments/[id]/reschedule/route.ts          # PATCH date/time/detailer — notification suppression (Roadmap Item 12)
src/app/api/pos/appointments/[id]/reschedule/__tests__/reschedule.test.ts
src/app/api/pos/appointments/[id]/send-payment-link/route.ts   — Send pay-link via SMS/email/both (Pay-Link Session 3)
src/app/api/pos/auth/logout/route.ts
src/app/api/pos/auth/pin-login/route.ts
src/app/api/pos/auth/verify-override/route.ts
src/app/api/pos/card-customer/route.ts
src/app/api/pos/coupons/validate/route.ts
src/app/api/pos/customers/[id]/route.ts
src/app/api/pos/customers/[id]/address/route.ts
src/app/api/pos/customers/[id]/type/route.ts
src/app/api/pos/customers/[id]/vehicles/route.ts
src/app/api/pos/customers/__tests__/route.test.ts
src/app/api/pos/customers/check-duplicate/route.ts
src/app/api/pos/customers/route.ts
src/app/api/pos/customers/search/route.ts
src/app/api/pos/end-of-day/route.ts
src/app/api/pos/end-of-day/summary/route.ts
src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts
src/app/api/pos/jobs/[id]/addons/route.ts
src/app/api/pos/jobs/[id]/cancel/route.ts
src/app/api/pos/jobs/[id]/checkout-items/route.ts
src/app/api/pos/jobs/[id]/checkout-items/__tests__/coupon-fallback.test.ts  # 4 tests — pins Item 15g Layer 15g-i appointment-side coupon fallback when no job.quote_id bridge
src/app/api/pos/jobs/[id]/complete/route.ts
src/app/api/pos/jobs/[id]/link-transaction/route.ts
src/app/api/pos/jobs/[id]/photos/[photoId]/route.ts
src/app/api/pos/jobs/[id]/photos/route.ts
src/app/api/pos/jobs/[id]/reschedule/route.ts
src/app/api/pos/jobs/[id]/route.ts
src/app/api/pos/jobs/[id]/start-work/route.ts
src/app/api/pos/jobs/[id]/timer/route.ts
# src/app/api/pos/jobs/populate/{route.ts, __tests__/route.test.ts}  RETIRED Session 2.5 (AC-3 finalization). The endpoint was the pre-2.5 auto-materialization seam on Today-scope mount; Start Intake (the start-intake/ sibling below) is now the canonical operator-initiated materialization trigger. The walk-in atomic create at src/app/api/pos/jobs/route.ts is the only other materialization path. See docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md Session 2.5 block for the retirement audit trail.
src/app/api/pos/jobs/start-intake/route.ts                      # POST — Session 2.1 (AC-3): operator-initiated job materialization. Confirmed/in_progress appointment + Start Intake → job @ status='intake' + work_started_at=NOW + appointment.status='in_progress'. 422 future_date / 422 invalid_status. Idempotent via jobs.appointment_id UNIQUE constraint.
src/app/api/pos/jobs/start-intake/__tests__/route.test.ts       # 19 tests — Session 2.1: auth + validation + gates (404/422 future_date/422 invalid_status × 4) + successful materialization (job INSERT shape, mobile-fee append, no-op when already in_progress, audit shape) + idempotency (fast path + race-recovery) + error handling (upsert fail, appt-update fail recoverable)
src/app/api/pos/jobs/route.ts
src/app/api/pos/jobs/schedule/route.ts                          # GET — Item 15e Phase 1A Schedule scope: future appointments (tomorrow→+30d), pure read, ZERO jobs writes, excludes materialized
src/app/api/pos/jobs/schedule/__tests__/route.test.ts           # 12 tests — Item 15e Phase 1A schedule endpoint: future-only floor, status/materialized exclusion, channel filter, CRITICAL zero-jobs-writes invariant
src/app/api/pos/jobs/__tests__/walk-in-modifier-persistence.test.ts  # 6 tests — pins Item 15g Layer 15g-iv Scenario C: walk-in synthetic appointment persists 7-field modifier snapshot, percent → dollar resolution, over-discount clamp; + Item 15f Phase 1 Layer 8e — `scheduled_*_time` minute-precision shape
src/app/api/pos/jobs/settings/route.ts
src/app/api/pos/loyalty/earn/route.ts
src/app/api/pos/loyalty/redeem/route.ts
src/app/api/admin/mobile-zones/route.ts                       # GET (admin auth, Phase Mobile-1.9 — modal picker dropdown)
src/app/api/pos/mobile-zones/route.ts
src/app/api/pos/my-permissions/route.ts
src/app/api/pos/products/barcode-lookup/route.ts
src/app/api/pos/promotions/available/route.ts
src/app/api/pos/quotes/[id]/communications/route.ts
src/app/api/pos/quotes/[id]/convert/route.ts
src/app/api/pos/quotes/[id]/route.ts
src/app/api/pos/quotes/[id]/send/route.ts
src/app/api/pos/quotes/route.ts
src/app/api/pos/receipts/cash-drawer/route.ts
src/app/api/pos/receipts/email/route.ts
src/app/api/pos/receipts/html/route.ts
src/app/api/pos/receipts/print/route.ts
src/app/api/pos/receipts/print-copier/route.ts
src/app/api/pos/receipts/print-jobs/[id]/route.ts
src/app/api/pos/receipts/print-server/route.ts
src/app/api/pos/receipts/sms/route.ts
src/app/api/pos/refunds/route.ts
src/app/api/pos/shop-use/route.ts
src/app/api/pos/services/check-prerequisites/route.ts
src/app/api/pos/services/durations/route.ts
src/app/api/pos/services/route.ts
src/app/api/pos/staff/available/route.ts
src/app/api/pos/stripe/capture-payment/route.ts
src/app/api/pos/stripe/connection-token/route.ts
src/app/api/pos/stripe/payment-intent/route.ts
src/app/api/pos/sync-offline-transaction/route.ts
src/app/api/pos/transactions/[id]/apply-credit/route.ts
src/app/api/pos/transactions/[id]/route.ts
src/app/api/pos/transactions/route.ts
src/app/api/pos/transactions/search/route.ts
src/app/api/pos/version/route.ts
```

### Public API
```
src/app/api/public/business-info/route.ts
src/app/api/public/cms/ads/click/route.ts
src/app/api/public/cms/ads/impression/route.ts
src/app/api/public/cms/ads/route.ts
src/app/api/public/cms/hero/route.ts
src/app/api/public/cms/site-theme/route.ts
src/app/api/public/cms/theme/route.ts
src/app/api/public/cms/theme-preview/route.ts
src/app/api/public/cms/tickers/route.ts
src/app/api/public/products/search/route.ts
src/app/api/public/specialty-block-view/route.ts
src/app/api/public/specialty-callback/route.ts
src/app/api/public/specialty-callback/__tests__/route.test.ts   # Session #139 (2026-06-02) — pins the four-concern bundle: Concern 1 per-request_type slug lookup, Concern 2 footgun (empty/null recipient_phones drops + warn-log), Concern 3 universal customer SMS for both variants. 21 tests.
```

### Quotes
```
src/app/api/quotes/[id]/accept/route.ts
src/app/api/quotes/[id]/pdf/route.ts
src/app/api/quotes/[id]/route.ts
src/app/api/quotes/[id]/send/route.ts
src/app/api/quotes/route.ts
```

### Staff (Schedules & Blocked Dates)
```
src/app/api/staff/blocked-dates/[id]/route.ts
src/app/api/staff/blocked-dates/route.ts
src/app/api/staff/create/route.ts
src/app/api/staff/schedules/[employeeId]/route.ts
src/app/api/staff/schedules/route.ts
```

### Webhooks
```
src/app/api/webhooks/mailgun/route.ts
src/app/api/webhooks/elevenlabs/call-complete/route.ts
src/app/api/webhooks/stripe/route.ts
src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts
src/app/api/webhooks/twilio/inbound/route.ts
src/app/api/webhooks/twilio/inbound/__tests__/sms-ai-v2-routing.test.ts  # 13 tests (Layer 4) — v2 routing decision: allowlist→v2, non-allowlist→legacy, globallyEnabled, killSwitch overrides, flag-throw fall-through, return-200 TwiML, dispatch-reject swallowed, 5 existing-gate skip cases, input-shape contract (3-key match, NO customerId — runner uses phone+conversationId via getCustomerContext).
src/app/api/webhooks/twilio/inbound/__tests__/auto-quote-combo.test.ts   # NEW Issue 33 Layer 1 — 5 tests pinning the auto-quote loop's data-shape contract with applyCombosToQuoteItems (combo HIT/MISS, mapVehicleSizeClass values flow through helper, sale-vs-combo lowest-wins).
src/app/api/webhooks/twilio/status/route.ts
src/app/api/webhooks/twilio/voice/route.ts
```

### Vehicle Categories (Public)
```
src/app/api/vehicle-categories/route.ts
```

### Vehicle Makes (Public)
```
src/app/api/vehicle-makes/route.ts
src/app/api/classify-vehicle/route.ts                     # Session #142 (Vehicle Classifier Restoration, 2026-06-02) — public GET endpoint for the vehicle classifier (`?make=&model=&year=`). Internally calls `resolveVehicleClassification(adminClient, ...)`. The architectural fix for C1 from `VEHICLE_CLASSIFIER_BEHAVIOR_AUDIT.md` (5e3d3388): pre-#142 the classifier ran on the browser-side Supabase client which is subject to the `vehicle_makes` RLS policy (`FOR SELECT TO authenticated`); anonymous public-booking customers hit RLS denial and the spinner stuck. Post-#142 the browser-side caller routes through this endpoint, server uses admin client (RLS bypassed), and one canonical classifier execution path serves both anonymous + authenticated callers. Mirrors `/api/vehicle-makes`'s pattern (public + admin-client + no auth required — vehicle makes are public knowledge). Browser caller wrapper is `src/lib/utils/classify-vehicle-client.ts`. Response shape: `{ classification: VehicleClassification }`.
```

### Other
```
src/app/api/gallery/route.ts
src/app/api/jobs/[token]/photos/route.ts
src/app/api/t/[code]/route.ts
src/app/api/unsubscribe/[customerId]/route.ts
src/app/api/voice-agent/appointments/route.ts
src/app/api/voice-agent/availability/route.ts
src/app/api/voice-agent/context/route.ts
src/app/api/voice-agent/customers/route.ts
src/app/api/voice-agent/finalize-call/route.ts
src/app/api/voice-agent/initiation/route.ts
src/app/api/voice-agent/products/route.ts
src/app/api/voice-agent/products/details/route.ts
src/app/api/voice-agent/quotes/route.ts
src/app/api/voice-agent/quotes/__tests__/route.test.ts  # NEW Issue 33 Layer 1 — 9 tests (no existing coverage). Combo HIT/MISS through this route's bespoke pricing loop, standard_price + pricing_type column persistence (Layer-1 alignment with createQuote pattern), subtotal recompute from combo-rewritten items.
src/app/api/voice-agent/send-info-sms/route.ts
src/app/api/voice-agent/notify-staff/route.ts
src/app/api/voice-agent/send-payment-link/route.ts  # NEW Phase 3 Theme B.2 — 14th voice-agent tool (AC-11 completion); validateApiKey + channels[]→method translation + delegates to src/lib/payment-link/send.ts shared helper
src/app/api/voice-agent/send-payment-link/__tests__/route.test.ts  # NEW Phase 3 Theme B.2 — 21 tests for the new route (auth, body validation, channels translation, success/error pass-through, amount_cents forwarding)
src/app/api/voice-agent/send-quote-sms/route.ts
src/app/api/voice-agent/services/route.ts
src/app/api/voice-agent/vehicle-classify/route.ts
src/app/api/voice-agent/appointments/__tests__/status-pin-removal.test.ts  # NEW Phase 3 Theme B.2 — 10 source-string regression tests for the payment_intent_id → initialStatus derivation at both branches (direct + quote-conversion)
src/app/api/waitlist/[id]/route.ts
src/app/api/waitlist/route.ts
```

### Top-Level Route Handlers (`src/app/`)
```
src/app/ai.txt/route.ts                 — AI crawler instructions
src/app/robots.txt/route.ts             — Dynamic robots.txt
src/app/sitemap.xml/route.ts            — Dynamic sitemap
```

---

## Admin Pages (`src/app/admin/`)

### Dashboard
```
src/app/admin/page.tsx
```

### Appointments
```
src/app/admin/appointments/page.tsx
src/app/admin/appointments/has-active-job.ts                  # Session #110: withHasActiveJob mapper + asRelationArray (normalizes Supabase 1:1 UNIQUE-FK embed shape — single object|null|array — into an array). Extracted from page.tsx (Next.js pages can't export named fns). Tested in __tests__/with-has-active-job.test.ts.
src/app/admin/appointments/__tests__/with-has-active-job.test.ts # Session #110: 7 cases — object/null/undefined/array shapes + raw-jobs stripping.
src/app/admin/appointments/scheduling/page.tsx
src/app/admin/appointments/waitlist/page.tsx
```

### Catalog
```
src/app/admin/catalog/categories/page.tsx
src/app/admin/catalog/products/[id]/page.tsx
src/app/admin/catalog/products/[id]/_components/stock-history-card.tsx
src/app/admin/catalog/products/[id]/__tests__/stock-history-card.test.tsx
src/app/admin/catalog/products/enrichment-review/page.tsx
src/app/admin/catalog/products/new/page.tsx
src/app/admin/catalog/products/page.tsx
src/app/admin/catalog/products/components/quick-edit-drawer.tsx
src/app/admin/catalog/services/[id]/page.tsx
src/app/admin/catalog/services/[id]/prereq-helpers.ts # Session #123 (extended #124) — pure helper `getEditPrereqOptions(allServices, prerequisites, editingPrereqServiceId, parentServiceId)` replacing the prior `editingPrereq ? allServices : prereqEligibleServices` ternary that paired with `disabled={!!editingPrereq}`. Returns current value PLUS every unused non-parent service so the edit-mode dropdown preserves the selection while excluding other already-used prereqs that would collide with UNIQUE `(service_id, prerequisite_service_id)` at save and the parent service that would violate CHECK `service_id <> prerequisite_service_id`. See `docs/dev/PREREQ_SERVICE_DROPDOWN_AUDIT.md`.
src/app/admin/catalog/services/[id]/addon-helpers.ts # Session #124 — sibling to `prereq-helpers.ts`. Pure `getEditAddonOptions(allServices, addons, editingAddonServiceId, parentServiceId)` replacing the prior `editingAddon ? allServices.filter(s => s.classification !== 'primary') : addonEligibleServices` ternary that paired with `disabled={!!editingAddon}`. Returns current value PLUS unused non-primary services that are not the parent (UNIQUE `(primary_service_id, addon_service_id)` collision guard + CHECK `primary_service_id <> addon_service_id` guard + semantic primary-not-an-addon filter).
src/app/admin/catalog/services/[id]/__tests__/prereq-helpers.test.ts # Session #123 (extended #124) — 6 unit cases locking `getEditPrereqOptions` invariants (current value always included; unused included; other already-used excluded; degenerate no-prereqs; defensive duplicate-in-list; parent-self excluded). Mirrors #119 precedent: no admin-page render harness for a ~2150-line component.
src/app/admin/catalog/services/[id]/__tests__/addon-helpers.test.ts # Session #124 — 7 unit cases mirroring prereq-helpers.test.ts plus the addon-specific classification clause (current value always present; unused non-primary included; primary excluded; other-used excluded; parent excluded; defensive: current value preserved even if primary-classified or duplicated in list).
src/app/admin/catalog/services/[id]/__tests__/pricing-model-tooltip.test.ts # Session #144 — Q-Arch-D regression pins. 5 source-string assertions (mirrors `services-summary-adoption.test.ts` precedent vs. mounting the 2200-line Edit page with disproportionate mocks) covering (1) `Info` lucide import, (2) tooltip wrapper + locked constraint/workaround wording, (3) keyboard-discoverability (`tabIndex={0}` + `aria-describedby` + matching `id` + `role="tooltip"` + `group-focus-within` + `sr-only` accessible name), (4) `onSaveDetails` PUT-payload regression guard against `pricing_model:` ever being added back, (5) `Q-Arch-D LOCKED (KEEP-IMMUTABLE)` + `CATALOG_CRUD_WIRING_AUDIT.md Q4` comment at the PUT site. Closes Q4 from the catalog audit and Q-Arch-D from `PUBLIC_BOOKING_ARCHITECTURAL_AUDIT.md` (709befa5); NO behavior change in #144 — the PUT route still omits `pricing_model` exactly as pre-session.
src/app/admin/catalog/services/new/page.tsx
src/app/admin/catalog/services/page.tsx
```

### Customers
```
src/app/admin/customers/[id]/credits-tab.tsx                              # Phase 3 Theme E.3 (AC-15 operator UI) — admin Credits tab component: balance card + history table + manual Issue Credit dialog. Mirrors the Loyalty tab shape (balance + ledger + adjust dialog). Reads + writes via /api/admin/customers/[id]/credits. Reasons restricted to manual_adjustment/goodwill/promotional/refund_as_credit. Issue button hidden when canIssue=false (caller passes the customers.adjust_loyalty permission grant).
src/app/admin/customers/[id]/page.tsx
src/app/admin/customers/duplicates/page.tsx
src/app/admin/customers/new/page.tsx
src/app/admin/customers/page.tsx
```

### Inventory
```
src/app/admin/inventory/layout.tsx
src/app/admin/inventory/page.tsx
src/app/admin/inventory/counts/page.tsx
src/app/admin/inventory/counts/[id]/page.tsx
src/app/admin/inventory/counts/__tests__/detail-page.test.tsx
src/app/admin/inventory/purchase-orders/[id]/page.tsx
src/app/admin/inventory/purchase-orders/new/page.tsx
src/app/admin/inventory/purchase-orders/page.tsx
src/app/admin/inventory/shop-expenses/page.tsx
src/app/admin/inventory/stock-history/page.tsx
src/app/admin/inventory/vendors/[id]/page.tsx
src/app/admin/inventory/vendors/page.tsx
```

### Jobs
```
src/app/admin/jobs/[id]/page.tsx
src/app/admin/jobs/page.tsx
```

### Marketing
```
src/app/admin/marketing/page.tsx
src/app/admin/marketing/analytics/page.tsx
src/app/admin/marketing/automations/[id]/page.tsx
src/app/admin/marketing/automations/new/page.tsx
src/app/admin/marketing/automations/page.tsx
src/app/admin/marketing/campaigns/[id]/analytics/page.tsx
src/app/admin/marketing/campaigns/[id]/edit/page.tsx
src/app/admin/marketing/campaigns/[id]/page.tsx
src/app/admin/marketing/campaigns/new/page.tsx
src/app/admin/marketing/campaigns/page.tsx
src/app/admin/marketing/campaigns/_components/campaign-tabs.tsx
src/app/admin/marketing/campaigns/drip/new/page.tsx
src/app/admin/marketing/campaigns/drip/[id]/page.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-builder.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-steps-editor.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-step-card.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-analytics.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-enrollments-table.tsx
src/app/admin/marketing/compliance/page.tsx
src/app/admin/marketing/coupons/[id]/page.tsx
src/app/admin/marketing/coupons/new/page.tsx
src/app/admin/marketing/coupons/page.tsx
src/app/admin/marketing/promotions/page.tsx
src/app/admin/marketing/promotions/_components/promotion-row.tsx
src/app/admin/marketing/promotions/_components/quick-sale-dialog.tsx
src/app/admin/marketing/promotions/_components/sale-history-section.tsx
src/app/admin/marketing/email-templates/page.tsx
src/app/admin/marketing/email-templates/[id]/page.tsx
src/app/admin/marketing/email-templates/_components/template-list.tsx
src/app/admin/marketing/email-templates/_components/brand-settings.tsx
src/app/admin/marketing/email-templates/_components/email-block-editor.tsx
src/app/admin/marketing/email-templates/_components/block-palette.tsx
src/app/admin/marketing/email-templates/_components/block-canvas.tsx
src/app/admin/marketing/email-templates/_components/block-properties.tsx
src/app/admin/marketing/email-templates/_components/photo-gallery-picker.tsx
src/app/admin/marketing/email-templates/_components/variable-inserter.tsx
src/app/admin/marketing/email-templates/_components/email-preview.tsx
src/app/admin/marketing/email-templates/_components/template-picker-modal.tsx
src/app/admin/marketing/email-templates/layouts/page.tsx
src/app/admin/marketing/email-templates/layouts/[id]/page.tsx
```

### Messaging
```
src/app/admin/messaging/page.tsx
```

### Migration
```
src/app/admin/migration/page.tsx
```

### Orders
```
src/app/admin/orders/[id]/page.tsx
src/app/admin/orders/page.tsx
```

### Photos
```
src/app/admin/photos/page.tsx
```

### Quotes
```
src/app/admin/quotes/[id]/page.tsx
src/app/admin/quotes/page.tsx
```

### Settings
```
src/app/admin/settings/page.tsx
src/app/admin/settings/audit-log/page.tsx
src/app/admin/settings/data-management/page.tsx
src/app/admin/settings/business-profile/page.tsx
src/app/admin/settings/card-reader/page.tsx
src/app/admin/settings/coupon-enforcement/page.tsx
src/app/admin/settings/enrichment/page.tsx
src/app/admin/settings/feature-toggles/page.tsx
src/app/admin/settings/integrations/quickbooks/page.tsx
src/app/admin/settings/messaging/page.tsx
src/app/admin/settings/mobile-zones/page.tsx
src/app/admin/settings/notifications/page.tsx
src/app/admin/settings/pos-favorites/page.tsx
src/app/admin/settings/pos-settings/page.tsx
src/app/admin/settings/pos-security/page.tsx
src/app/admin/settings/receipt-printer/page.tsx
src/app/admin/settings/reviews/page.tsx
src/app/admin/settings/shipping/page.tsx
src/app/admin/settings/tax-config/page.tsx
```

### Staff
```
src/app/admin/staff/[id]/page.tsx
src/app/admin/staff/new/page.tsx
src/app/admin/staff/page.tsx
src/app/admin/staff/roles/page.tsx
```

### Transactions
```
src/app/admin/transactions/page.tsx
src/app/admin/reports/payments/page.tsx           # Phase 1A.5: payments report grouped by method+platform, date-range, CSV export
```

### Website (CMS)
```
src/app/admin/website/page.tsx
src/app/admin/website/ads/creatives/[id]/page.tsx
src/app/admin/website/ads/page.tsx
src/app/admin/website/catalog/page.tsx
src/app/admin/website/credentials/page.tsx
src/app/admin/website/footer/page.tsx
src/app/admin/website/global-blocks/page.tsx
src/app/admin/website/hero/[id]/page.tsx
src/app/admin/website/hero/page.tsx
src/app/admin/website/homepage/page.tsx
src/app/admin/website/navigation/page.tsx
src/app/admin/website/pages/[id]/page.tsx
src/app/admin/website/pages/new/page.tsx
src/app/admin/website/pages/page.tsx
src/app/admin/website/seo/cities/page.tsx
src/app/admin/website/seo/page.tsx
src/app/admin/website/team/page.tsx
src/app/admin/website/theme-settings/page.tsx
src/app/admin/website/themes/[id]/page.tsx
src/app/admin/website/themes/page.tsx
src/app/admin/website/tickers/[id]/page.tsx
src/app/admin/website/tickers/page.tsx
```

---

## Customer-Facing Pages

### Public Site (`src/app/(public)/`)
```
src/app/(public)/layout.tsx              — Public layout (header, footer, tickers, theme)
src/app/(public)/page.tsx                — Homepage
src/app/(public)/services/page.tsx       — Service category listing
src/app/(public)/services/[categorySlug]/page.tsx
src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx
src/app/(public)/products/page.tsx       — Product category listing
src/app/(public)/products/[categorySlug]/page.tsx
src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx
src/app/(public)/gallery/page.tsx        — Photo gallery
src/app/(public)/areas/page.tsx          — Service areas
src/app/(public)/areas/[citySlug]/page.tsx
src/app/(public)/cart/page.tsx           — Shopping cart
src/app/(public)/checkout/page.tsx       — Checkout
src/app/(public)/checkout/confirmation/page.tsx
src/app/(public)/terms/page.tsx          — Terms & conditions
src/app/(public)/book/page.tsx           — Booking wizard
src/app/(public)/team/[memberSlug]/page.tsx — Team member detail page
src/app/(public)/p/[...slug]/page.tsx    — CMS dynamic pages
```

### Customer Auth (`src/app/(customer-auth)/`)
```
src/app/(customer-auth)/layout.tsx
src/app/(customer-auth)/signin/page.tsx
src/app/(customer-auth)/signin/reset-password/page.tsx
src/app/(customer-auth)/signup/page.tsx
```

### Admin Login (`src/app/(auth)/`)
```
src/app/(auth)/layout.tsx
src/app/(auth)/login/page.tsx               — Admin login page
src/app/(auth)/login/reset-password/page.tsx — Admin password reset
```

### Auth (`src/app/auth/`)
```
src/app/auth/callback/route.ts              — OAuth/magic-link code exchange
src/app/auth/reset-password/page.tsx        — Staff password reset landing page
```

### Customer Portal (`src/app/(account)/`)
```
src/app/(account)/layout.tsx
src/app/(account)/account/page.tsx              — Dashboard / overview
src/app/(account)/account/appointments/page.tsx — Upcoming & past appointments
src/app/(account)/account/loyalty/page.tsx      — Loyalty points
src/app/(account)/account/orders/page.tsx       — Order history
src/app/(account)/account/orders/[id]/page.tsx  — Order detail
src/app/(account)/account/photos/page.tsx       — My photos
src/app/(account)/account/profile/page.tsx      — Profile settings
src/app/(account)/account/services/page.tsx     — Service history
src/app/(account)/account/services/[jobId]/page.tsx — Service detail
src/app/(account)/account/transactions/page.tsx — Transaction history
src/app/(account)/account/vehicles/page.tsx     — My vehicles
```

### Dev-Only (`src/app/(dev)/`)
```
src/app/(dev)/receipt-preview/page.tsx          — Phase 0b.3 placeholder (NODE_ENV-gated). Future 12-scenario × 4-surface receipt visual harness.
```

### POS Pages (`src/app/pos/`)
```
src/app/pos/page.tsx                     — POS main workspace
src/app/pos/login/page.tsx               — POS PIN login
src/app/pos/end-of-day/page.tsx          — End-of-day cash count & reconciliation
src/app/pos/jobs/page.tsx                — Jobs management
src/app/pos/jobs/components/schedule-types.ts  — Item 15e Phase 1A: PosScheduleEntry type (future-appointment shape for the Jobs Schedule scope; scope:'schedule' discriminator vs JobListItem). Session 2.2: + PosUnstartedAppointment (today's un-materialized confirmed/in_progress appointments; scope:'today_unstarted' discriminator; field-shape sibling of PosScheduleEntry).
src/app/pos/jobs/components/unstarted-appointment-card.tsx       # Session 2.2 (AC-3 second half): appointment card with Start Intake button + 422 future_date popup (PATCH-date + retry affordance). Distinct visual treatment from job cards (dashed blue border, "Not Started" badge, no timer/photos/addons). Powers the un-started strip in Today scope.
src/app/pos/jobs/components/__tests__/unstarted-appointment-card.test.tsx  # 11 tests — Session 2.2: rendering (customer/vehicle/services/time/badge/detailer) + Start Intake happy path (201 + POST shape + onMaterialized + toast) + 422 future_date popup (open/cancel/confirm-PATCH-retry/confirm-PATCH-fail) + 422 invalid_status + 500 generic.
src/app/pos/jobs/components/__tests__/job-queue-today-unstarted.test.tsx  # 4 tests — Session 2.2: Today scope un-started strip (empty/1-row/3-rows/backward-compat-missing-field).
src/app/pos/jobs/components/__tests__/job-queue-forward-arrow.test.tsx  # 5 tests — Session 2.3 (AC-8): forward-arrow routing — from-today routes push to ?sched_pills=other&sched_from=tomorrow&sched_to=tomorrow + flips scope; from-yesterday/-3d stays in Today via setDate replace; back arrow unchanged; flag-OFF legacy day-step fallback.
src/app/pos/jobs/components/__tests__/job-queue-include-terminal.test.tsx  # 9 tests — Session 2.4 (AC-7): terminal-state toggle — chip presence, default OFF / aria-checked=false / label "Show terminal", default fetch omits include_terminal, click writes ?include_terminal=1 + ON state + label "Showing terminal" + refetch with param, initial URL ?include_terminal=1 mounts ON + threads into first fetch, ON→OFF strips the param.
src/app/pos/jobs/components/__tests__/job-queue-summary-shape-alpha.test.tsx  # 8 tests — Session 2.6 (Phase 0.3 F.1 LOCKED Shape α): daily summary cards aggregate jobs + un-started appointments (empty bar hidden / jobs-only pre-2.6 regression / un-started-only Shape α visible / mixed sum / cancelled excluded / no_show excluded / completed included / completedCount stays jobs-only). Queries scoped via `within(getByTestId('daily-summary-bar'))` to avoid collisions with card-internal `formatCurrency` renders.
src/app/api/pos/jobs/__tests__/today-unstarted-appointments.test.ts        # 10 tests — Session 2.2: Today endpoint un-started field (confirmed + in_progress returned, dedup against materialized jobs, past/future date today-only gate, backward compat `data` preserved, filter=mine/unassigned employee_id scoping, 401 auth, graceful empty default).
src/app/pos/jobs/components/schedule-pill-row.tsx  — Session #148 (N+1): POS Schedule filter date-pill row (6 card-style pills + inline From/To drawer for "Other"). Reuses <Input> for native iOS date pickers; local DatePillButton avoids growing TogglePill's API.
src/app/pos/jobs/components/__tests__/schedule-pill-row.test.tsx  — 18 tests for the pill row: render, active state, multi-select toggle, click-again-deselect, drawer show/hide, X1 floor + To<From validation, cascading `min` on To input.
src/lib/utils/schedule-date-range.ts  — Session #148 (N+1): pure helper. computeScheduleDateRange(selectedPills, otherRange, todayYmd) → {from,to} envelope passed to /api/pos/jobs/schedule. Honors X1 future-only floor + X3 31-day ceiling. YYYY-MM-DD strings throughout.
src/lib/utils/__tests__/schedule-date-range.test.ts  — 30 tests: per-pill range table + envelope reduction + edge cases (Sun this_week collapse, last-day this_month collapse, past-from other rejection, all-null fallback, X3 clipping).
src/lib/utils/schedule-entry-matches.ts  — Session #149 (N+2): pure per-row predicate. entryMatchesFilters(entry, {search, status, detailerId}) → boolean. OR-within search (first/last name, phone digit-substring, vehicle make/model) + AND across categories. Empty/null filter = no constraint. Detailer sentinel 'unassigned' matches rows with detailer: null.
src/lib/utils/__tests__/schedule-entry-matches.test.ts  — 27 tests: empty filters / status / detailer / search text / search phone digit-substring / AND-across-categories / OR-within-search.
src/app/pos/jobs/__tests__/handle-checkout-coupon.test.tsx  # 3 tests — pins Item 15g Layer 15g-i handleCheckout dispatch (RESTORE_TICKET coupon=null → SET_COUPON via /api/pos/coupons/validate) + idempotency
src/app/pos/offline/page.tsx             — Offline fallback page
src/app/pos/quotes/page.tsx              — Quote builder & list
src/app/pos/transactions/page.tsx        — Transaction list
src/app/pos/transactions/[id]/page.tsx   — Transaction detail
```

### Standalone Public Pages
```
src/app/(public)/quote/[token]/page.tsx         — Public quote view/accept
src/app/(public)/quote/[token]/accept-button.tsx — Accept quote button component
src/app/(public)/receipt/[token]/page.tsx        — Public receipt view (token-based, no login)
src/app/(public)/receipt/[token]/print-button.tsx — Print/save-as-PDF button
src/app/(public)/pay/[token]/page.tsx            — Public appointment pay page (Pay-Link Session 2)
src/app/(public)/pay/[token]/pay-form.tsx        — Stripe Elements form for /pay/[token]
src/app/(public)/pay/[token]/processing-refresh.tsx — Auto-refresh helper for post-redirect "confirming" state
src/app/q/[token]/page.tsx               — Short quote URL redirect
src/app/s/[code]/route.ts               — Short link redirect (route handler)
src/app/authorize/[token]/page.tsx       — Job authorization (approve/decline)
src/app/jobs/[token]/photos/page.tsx     — Customer photo upload for jobs
src/app/unsubscribe/[customerId]/page.tsx — Email/SMS unsubscribe
```

---

## Lib Modules (`src/lib/`)

### Auth
```
src/lib/auth/api-key.ts
src/lib/auth/auth-provider.tsx             — Admin auth context provider
src/lib/auth/check-permission.ts
src/lib/auth/customer-auth-provider.tsx    — Customer auth context provider
src/lib/auth/customer-helpers.ts
src/lib/auth/auth-errors.ts               — Shared auth error string constants (used by auth hooks)
src/lib/auth/customer-signout.ts          — Shared customer sign-out utility (all customer sign-out call sites)
src/lib/auth/get-employee.ts
src/lib/auth/permission-context.tsx        — Permission context & provider
src/lib/auth/permissions.ts
src/lib/auth/require-permission.ts
src/lib/auth/roles.ts
```

### Campaigns
```
src/lib/campaigns/ab-testing.ts
```

### Cron
```
src/lib/cron/scheduler.ts
```

### Credits (customer_credits ledger — AC-15 foundation)
```
src/lib/credits/index.ts                                  # Phase 3 Theme E.1: barrel — re-exports types + repository
src/lib/credits/types.ts                                  # Phase 3 Theme E.1: CustomerCreditReason union (5 values), CustomerCredit row, CreateCustomerCreditInput, CustomerCreditBalance
src/lib/credits/repository.ts                             # Phase 3 Theme E.1: createCustomerCredit / getCustomerCreditBalance (sums + unapplied+unexpired sorted expires_at NULLS LAST then created_at) / getCustomerCreditById — accepts SupabaseClient param (mirrors quotes/refunds pattern)
src/lib/credits/__tests__/repository.test.ts              # 16 tests — Phase 3 Theme E.1: live-DB integration (describeIfCreds) — create + balance + sorting + CHECK constraints + ENUM + updated_at trigger + migration integrity (all 5 ENUM values + 15 columns)
```

### Cross-cutting migration-integrity tests
```
src/lib/__tests__/theme-c-1-schema.test.ts                # 6 tests — Phase 3 Theme C.1: live-DB integration (describeIfCreds) — appointment_channel enum carries 'customer_accept'; scheduled_date_placeholder default FALSE; staff_acknowledged_at TIMESTAMPTZ update; appointments_quote_id_uniq UNIQUE constraint rejects duplicate; quote_id ↔ converted_appointment_id backfill round-trip; pending_appointment_sla_alert SMS template seed shape
```

### Data Access
```
src/lib/data/booking.ts
src/lib/data/business-defaults.ts
src/lib/data/business-hours.ts
src/lib/data/business.ts
src/lib/data/cities.ts
src/lib/data/cms.ts
src/lib/data/credentials.ts
src/lib/data/featured-photos.ts
src/lib/data/homepage-settings.ts
src/lib/data/page-content.ts
src/lib/data/products.ts
src/lib/data/receipt-composer.ts                    — Phase 0b.1: pure composer for payment/refund/totals aggregation
src/lib/data/receipt-config.ts
src/lib/data/receipt-data.ts
src/lib/data/__tests__/receipt-composer.test.ts     — Phase 0b.1 / 1A: composer unit tests + 28 fixture byte-equality regressions
src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts — 17 ReceiptTransaction scenarios shared by capture script + tests (Phase 1A-followup: +scenarios 16 legacy-paid-in-full + 17 legacy-partial-payment; Phase 1A.5: +scenario 15 digital-zelle; Phase 1A: +scenarios 13 loyalty-only + 14 loyalty+cash+tax)
src/lib/data/__tests__/__fixtures__/receipt-baselines/*.html       — 14 captured HTML fixtures (regenerable)
src/lib/data/__tests__/__fixtures__/receipt-baselines/*.thermal.txt — 14 captured thermal fixtures (regenerable)
src/lib/data/refund-sources.ts
src/lib/data/reviews.ts
src/lib/data/services.ts
src/lib/data/team-members.ts
src/lib/data/vehicle-count.ts
src/lib/data/website-pages.ts
```

### Contexts
```
src/lib/contexts/cart-context.tsx           — Shopping cart context provider
```

### Hooks
```
src/lib/hooks/feature-flag-provider.tsx     — Feature flag context provider
src/lib/hooks/use-async-action.ts
src/lib/hooks/use-barcode-scanner.ts        — BT/USB scanner keystroke detection (mounted per-page)
src/lib/hooks/use-business-info.ts
src/lib/hooks/use-drag-drop-reorder.ts
src/lib/hooks/use-enter-submit.ts
src/lib/hooks/use-feature-flag.ts
src/lib/hooks/use-form-validation.ts
src/lib/hooks/use-online-status.ts
src/lib/hooks/use-permission.ts
src/lib/hooks/use-unsaved-changes.ts
src/lib/hooks/useCustomerLink.ts          — Customer linking API wrapper hook (check-exists, link-by-phone, link-account)
src/lib/hooks/usePhoneOtp.ts              — Phone OTP state machine hook (send, verify, resend, cooldown)
src/lib/hooks/useTableState.ts            — Admin table state hook (search, filters, sort, pagination) with URL sync
```

### Migration
```
src/lib/migration/phone-utils.ts
src/lib/migration/types.ts
```

### Security
```
src/lib/security/host-routing.ts
src/lib/security/ip-whitelist.ts
```

### POS
```
src/lib/payment-link/send.ts                              # Phase 3 Theme B.2: shared sendPaymentLink() orchestration extracted from POS route — token mint, balance compute, multi-channel dispatch, success stamping; consumed by /api/pos/appointments/[id]/send-payment-link (POS session auth) AND /api/voice-agent/send-payment-link (Bearer voice_agent_api_key auth, 14th tool)
src/lib/payment-link/__tests__/send.test.ts               # 26 tests — Phase 3 Theme B.2: validation chain (return-before-mutation, all 422/404/409 paths) + token mint + reuse + per-channel dispatch shapes + partial failure + SMS body composition
src/lib/pos/api-auth.ts
src/lib/pos/check-permission.ts
src/lib/pos/offline-queue.ts
src/lib/pos/session.ts
src/lib/pos/tile-colors.ts
```

### QuickBooks
```
src/lib/qbo/client.ts
src/lib/qbo/index.ts
src/lib/qbo/settings.ts
src/lib/qbo/sync-batch.ts
src/lib/qbo/sync-catalog.ts
src/lib/qbo/sync-customer.ts
src/lib/qbo/sync-log.ts
src/lib/qbo/sync-transaction.ts
src/lib/qbo/types.ts
```

### Email Template System
```
src/lib/email/types.ts
src/lib/email/block-renderers.ts
src/lib/email/layout-renderer.ts
src/lib/email/photo-resolver.ts
src/lib/email/template-resolver.ts
src/lib/email/send-cancellation-email.ts
src/lib/email/send-templated-email.ts
src/lib/email/send-void-notification.ts
src/lib/email/send-welcome-email.ts
src/lib/email/variables.ts
src/lib/email/drip-engine.ts
```

### SMS Template System
```
src/lib/sms/render-sms-template.ts          # Generic over SmsSlug (Session 2A.5); test-only __renderSmsTemplateForTesting export
src/lib/sms/sms-contracts.source.ts         # Hand-edited single source of truth (Session 2A.5)
src/lib/sms/palette.ts                      # AUTO-GENERATED from sms-contracts.source.ts (Session 2A.5; was hand-edited 2A)
src/lib/sms/generated-contracts.ts          # AUTO-GENERATED — SmsSlug, SMS_SLUGS, CONTRACTS_BY_SLUG, RenderVarsBySlug (Session 2A.5)
src/lib/sms/contract.ts                     # Zod contract schema + validators (Session 2A)
src/lib/sms/composites.ts                   # Caller-built composite chip builders (Session 2A)
src/lib/sms/dedup.ts                        # isRecentDuplicateSms — messages-log dedup helper (Session 2D.2)
src/lib/sms/hardcoded-messages.ts           # Static read-only display list for admin UI; also exports derived INTENTIONALLY_HARDCODED_SMS slug list (Sessions 2E.1b, 2E.2)
src/lib/sms/__tests__/render-sms-template.test.ts
src/lib/sms/__tests__/render-sms-template-contract.test.ts

# SMS AI v2 (Layer 1+2 foundation — declarative + routing only; Layer 3a runner core; Layer 3b tool dispatcher; Layer 4 webhook integration)
src/lib/sms-ai/feature-flag.ts                    # shouldUseSmsAiV2 pure router + loadSmsAiV2Flags DB reader. Three flags: sms_ai_v2_kill_switch, sms_ai_v2_enabled_phones, sms_ai_v2_globally_enabled. Safe default = legacy.
src/lib/sms-ai/tools.ts                           # 12 Anthropic tool definitions (declarative; no runner). Side-effecting tools carry "Only call when explicitly confirmed" gates. TOOL_NAMES const for type-safe runtime dispatch. Layer 3c added approve_addon + decline_addon (10 → 12).
src/lib/sms-ai/system-prompt.ts                   # buildV2SystemPrompt — 9 sections: identity, channel rules, critical rules, tool guide, escalation guide, conversation flow, pending addon authorization (Layer 3c), context placeholder, grounding. Structured for prompt caching (audit §4.5). {CUSTOMER_CONTEXT} token left un-substituted for runner injection.
src/lib/sms-ai/agent-runner.ts                    # SMS AI v2 Layer 3a + 3b + 3c — runSmsAiV2Agent() agent runner core. Builds cached system prompt (cache_control: ephemeral), substitutes {CUSTOMER_CONTEXT}, loops up to 6 tool-use round-trips, forces tools-omitted final call on iteration cap, handles end_turn / unknown stop_reason / APIError. Layer 3b: parallel tool dispatch via Promise.all (tool_result blocks reassembled in original order); per-inbound dispatcher reset via __resetForAgentRun(). Layer 3c: renderCustomerContextBundle() renders pending_addons block with full UUID + price/delay/expiry/operator-message fields when non-empty.
src/lib/sms-ai/tool-dispatcher.ts                 # SMS AI v2 Layer 3b + 3c — real dispatcher. 9 HTTP-wrapped tools call /api/voice-agent/* via shared voiceAgentFetch (AbortController + per-tool timeout 5s read/classify | 10s SLOW); notify_staff + approve_addon + decline_addon in-process via the corresponding helpers + Promise.race for timeout. Bearer key cached per agent run; reset via __resetForAgentRun() at the start of every inbound (operator key rotation takes effect on next message). NO retries (audit §4.4). DispatchToolResult contract preserved from 3a.
src/lib/sms-ai/background-dispatch.ts             # SMS AI v2 Layer 4 — runV2AgentInBackground({inboundMessageBody, conversationId, phone}). Fire-and-forget wrapper called from the Twilio webhook AFTER it has already returned 200 to Twilio. Loads businessName + businessHours + currentDate internally, calls runSmsAiV2Agent, on end_turn/max_iterations + non-blank text chunks via splitSmsMessage + sends each via sendSms + INSERTs outbound `messages` rows with channel='sms' (matches legacy; messages_channel_check allows only 'sms' or 'voice'; agent identity via sender_type='ai') + updates conversation last_message_at/preview. INSERT + UPDATE return values are error-checked (supabase-js does NOT throw on PG-side errors); failures are logged with code + message + details under [SmsAiV2 background]. On api_error/unknown/blank/null text: logs noReply=true, sends nothing, no retry. All paths try/catch — function NEVER throws.
src/lib/sms-ai/__tests__/feature-flag.test.ts     # 22 tests — kill-switch precedence, global enable, allowlist (E.164 normalization symmetric), DB reader coercion + safe defaults on missing keys.
src/lib/sms-ai/__tests__/tools.test.ts            # 18 tests — schema validity, name uniqueness, required fields, side-effect-tool confirmation gate, enum coverage (info types, reason codes).
src/lib/sms-ai/__tests__/system-prompt.test.ts    # 16 tests — interpolation, 8 sections present, all 10 tools named, all 7 reasons listed, STOP/UNSUBSCRIBE rule, deterministic output.
src/lib/sms-ai/__tests__/agent-runner.test.ts     # 13 tests (Layer 3a 9 + Layer 3b 4) — happy path end_turn, one tool round-trip, 6-iter cap forces tools-omitted final, prompt-caching wire shape, {CUSTOMER_CONTEXT} substitution, API error, unknown stop_reason, history mapping (customer→user/staff+ai→assistant/system dropped), idempotent inbound append, parallel dispatch concurrency proof, mixed success+failure pass-through, notify_staff input forwarded unmodified, dispatcher reset called once per run. Establishes the first Anthropic-SDK mock pattern (discovery §F gap).
src/lib/sms-ai/__tests__/tool-dispatcher.test.ts  # 28 tests (Layer 3b) — per-tool routing for all 10 tools (URL/method/body/header), missing-input guards, HTTP non-2xx + thrown fetch, fake-timer timeout pre-emption (HTTP + in-process), notify_staff success/failure mapping (success:false → isError:true), Bearer-key load failures (4 cases), cache lifecycle.
src/lib/sms-ai/__tests__/background-dispatch.test.ts # 12 tests (Layer 4) — happy end_turn (chunk+send+log+conv update), runner input shape from internal businessInfo/hours/currentDate lookups, max_iterations forwarding, multi-chunk path, no-reply paths (api_error/unknown/blank/null text), defensive runner-reject swallowed + logged + non-propagating, getBusinessInfo/Hours throws fall back, failed sendSms outbound-row contract (status='failed', twilio_sid=null).

# Anthropic SDK thin client (Layer 3a — one place for SDK construction; future migration target for the 9 existing direct-fetch sites)
src/lib/anthropic/client.ts                       # MODELS const (SONNET = 'claude-sonnet-4-6', HAIKU = 'claude-haiku-4-5' dateless aliases per workspace canonical IDs) + lazy-init getAnthropicClient() singleton. Throws on missing ANTHROPIC_API_KEY. No retry/timeout overrides — runner controls per-call deadline.
src/lib/anthropic/__tests__/client.test.ts        # 3 tests (Layer 3a) — throws on missing env, returns singleton, MODELS non-empty. Uses // @vitest-environment node (SDK refuses to instantiate under jsdom default).
src/app/api/admin/sms-templates/route.ts
src/app/api/admin/sms-templates/[slug]/route.ts
src/app/api/admin/sms-templates/[slug]/__tests__/route.test.ts
src/app/api/admin/sms-templates/[slug]/reset/route.ts
src/app/api/admin/sms-templates/[slug]/test/route.ts
src/app/api/pos/transactions/__tests__/auto-receipt-interlock.test.ts
src/app/api/pos/jobs/[id]/complete/__tests__/job-complete-vehicle-literal.test.ts
src/app/admin/settings/messaging/sms-templates/page.tsx
```

### Products
```
src/lib/products/barcode-lookup.ts          — Shared barcode/SKU lookup helper (POS + admin use this)
```

### Quotes
```
src/lib/quotes/convert-service.ts
src/lib/quotes/quote-service.ts                          # Layer 15g-v: extracted `computeQuoteTotals` writer-side helper (canonical net-of-modifiers formula); updateQuote recomputes on modifier-only PATCHes (items-guard lifted)
src/lib/quotes/send-service.ts                           # Layer 15g-v: templated email path passes composite `quote_modifier_block` + 6 individual modifier vars; HTML+text fallback renders modifier rows above Total
src/lib/quotes/manual-discount.ts                        # Layer 15g-v: extracted pure resolver (`resolveManualDiscountAmount`) so client-bundle consumers reach it without dragging convert-side deps
src/lib/quotes/modifier-display.ts                       # Layer 15g-v: shared `resolveQuoteModifierRows(quote)` consumed by all 5 receipt surfaces (public landing, email HTML, email text, PDF, POS quote-detail)
src/lib/quotes/source-labels.ts                          # Phase Quote-Source-1: `getQuoteSourceLabel` + `buildQuoteNotesDisplay` — channel-of-origin labels (sms_agent / voice_agent / pos / admin / online_booking / twilio_legacy) shared by all 4 quote-notes render surfaces
src/lib/quotes/__tests__/source-labels.test.ts          # 19 tests — Phase Quote-Source-1: every enum value mapping + NULL fallback + combined-display truth table
src/lib/quotes/__tests__/convert-service.test.ts        # 15 tests — pins Layer 15g-i coupon_code propagation (3) + Layer 15g-ii full modifier propagation (8) + Layer 15g-v writer-trust contract (4: coupon-only / loyalty-only / Q-0067-combined / defense-in-depth clamp)
src/lib/quotes/__tests__/quote-service.modifiers.test.ts  # 25 tests — Layer 15g-ii modifier persistence (13) + Layer 15g-v writer-side total_amount = net formula (12: createQuote single-modifier × 4 / combined / over-discount clamp; updateQuote recompute triggers + non-financial PATCH skip + full-replacement deterministic math)
src/lib/quotes/__tests__/modifier-display.test.ts        # 19 tests — Layer 15g-v shared helper: empty / coupon w+wo discount / loyalty w+wo points / manual label fallback / percent resolution / dollar clamp / partial collapse / ordering / Supabase NUMERIC-as-string coercion
src/lib/quotes/__tests__/modifier-chain.test.ts          # 4 tests — Layer 15g-iv Scenario B chain integration: Quote → convertQuote → checkout-items reads back identical modifier values; all-3 / coupon-only / modifier-free / manual percent → dollar resolution
src/lib/quotes/__tests__/derive-comm-pill.test.ts
src/lib/quotes/__tests__/send-service.test.ts            # Extended in Layer 15g-v with 4 cases: templated path passes composite+individual modifier vars (populated + empty); fallback HTML+text contain modifier rows (populated + omitted)
```

### Migrations
```
supabase/migrations/20260517052147_quote_sent_template_modifier_block.sql   # Layer 15g-v: update seeded `quote_sent` email template body to render {quote_modifier_block} between Tax and Total; widen variables list with 7 new modifier-related variables. Guarded by `is_customized = false` to preserve operator-customized templates.
supabase/migrations/20260525030037_add_quote_source.sql                     # Phase Quote-Source-1: CREATE TYPE quote_source ENUM (6 values) + ALTER TABLE quotes ADD COLUMN source quote_source NULL. No backfill — historical rows render notes verbatim via NULL-source fallback.
supabase/migrations/20260527000000_pos_jobs_unified_schedule_flag.sql       # Item 15e Phase 1B: DATA seed only — INSERT feature_flags row `pos_jobs_unified_schedule` (enabled=false, category 'Core POS'), ON CONFLICT DO NOTHING. Gates the POS Jobs Today/Schedule scope toggle. No schema change.
supabase/migrations/20260603000000_enable_pos_jobs_unified_schedule.sql     # Session #146 — flag-flip companion: UPDATE feature_flags SET enabled=true WHERE key='pos_jobs_unified_schedule'. Idempotent. Pre-flight audit at docs/dev/POS_JOBS_UNIFIED_SCHEDULE_FLAG_FLIP_PREFLIGHT.md verified clean drift on the gated paths since 15e closed. Rollback is a one-line UPDATE flipping enabled=false.
supabase/migrations/20260606105901_seed_waitlist_slot_available_sms_template.sql  # Session 1.8 — seed customer-facing `waitlist_slot_available` SMS template; replaces dead fireWebhook in appointments/[id]/cancel/route.ts. Idempotent INSERT ... ON CONFLICT (slug) DO NOTHING. Audit f5e714a8 Target D.4.
supabase/migrations/20260607181649_drop_legacy_identifier_triggers.sql  # Phase 3 Theme A.1 (2026-06-07) — DROP TRIGGER `tr_transaction_receipt_number` ON `transactions` + DROP FUNCTION `generate_receipt_number()`; DROP TRIGGER `tr_po_number` ON `purchase_orders` + DROP FUNCTION `generate_po_number()`. Post-Theme-A cleanup: retires the BEFORE INSERT safety-net triggers that Theme A's Migration 6 deliberately kept alive to avoid a post-migrate / pre-deploy outage window. Application-side `generateReceiptNumber()` / `generatePoNumber()` helpers (wired in Theme A) supply the columns explicitly at all 6 INSERT callsites; the triggers' `WHEN (NEW.column IS NULL)` gates were already shadowed and never fired post-Theme-A.
supabase/migrations/20260607184158_customer_credits_table.sql  # Phase 3 Theme E.1 (2026-06-07) — AC-15 foundation: CREATE TYPE `customer_credit_reason` (5-value ENUM: cancellation_refund, manual_adjustment, goodwill, promotional, refund_as_credit) + CREATE TABLE `customer_credits` (15 columns: id, customer_id [ON DELETE RESTRICT — protects audit trail], amount_cents [INTEGER >0 CHECK — Rule #20], reason, reason_note, source_appointment_id + source_transaction_id [ON DELETE SET NULL], applied_at + applied_to_appointment_id + applied_to_transaction_id + applied_amount_cents [partial-app supported], expires_at, created_at, created_by_employee_id [employees(id) — NOT staff; Memory #11], updated_at) + 4 partial/composite indexes (customer_id, source_appointment_id partial, applied_at partial, unapplied composite) + `customer_credits_applied_consistency` CHECK (applied rows require applied_at + applied_amount_cents non-NULL AND ≤ amount_cents) + BEFORE UPDATE trigger advancing `updated_at`. Greenfield work — no migration of existing data (no prior `customer_credits` table existed per audit `3e633156`). Foundation only; E.2 (credit application) and E.3 (operator UI) build on this schema.
```

### Search
```
src/lib/search/customer-search.ts
src/lib/search/customer-create-routing.ts          — Routes Find Customer query into New Customer form fields (phone/email/firstName/lastName) when search returns no results
src/lib/search/tokenize.ts
src/lib/search/__tests__/customer-search.test.ts
src/lib/search/__tests__/customer-create-routing.test.ts
src/lib/search/__tests__/tokenize.test.ts
```

### SEO
```
src/lib/seo/json-ld.ts
src/lib/seo/known-pages.ts
src/lib/seo/metadata.ts
src/lib/seo/page-seo.ts
```

### Services
```
src/lib/services/ai-content-writer.ts
src/lib/services/ai-product-enrichment.ts
src/lib/services/ai-seo.ts
src/lib/services/audit.ts
src/lib/services/coupon-summary.ts
src/lib/services/job-addons.ts
src/lib/services/messaging-ai-prompt.ts
src/lib/services/messaging-ai.ts
src/lib/services/conversation-summary.ts
src/lib/services/conversation-history.ts          # getConversationHistory — small helper (SMS AI v2 Layer 1+2). By conversationId or phone, configurable limit, optional system-message exclusion.
src/lib/services/customer-context.ts              # getCustomerContext — unified single-call snapshot bundle (SMS AI v2 Layer 1+2 + 3c). Returns customer + vehicles + upcoming_appointments + recent_quotes + recent_transactions (cents) + pending_addons (Layer 3c — pending+non-expired only, money in cents) + conversation_history. Used by SMS AI v2 runner (Layer 3) + webhook handler (Layer 4). Defaults: 20 history messages, 5 transactions for known customers only, 5 appointments, 3 quotes.
src/lib/services/staff-notification.ts            # notifyStaff — canonical staff-alert dispatcher (SMS AI v2 Layer 1+2). Extracted from /api/voice-agent/notify-staff body. 7 reason codes including human_handoff. Renders staff_notification template via renderSmsTemplate; recipient chain: template.recipient_phones → business_phone → BUSINESS_DEFAULTS.phone. Returns per-recipient success/error summary.
src/lib/services/__tests__/conversation-history.test.ts # 10 tests — by conversationId, phone fallback, chronological order, limit cap, system-message exclusion.
src/lib/services/__tests__/customer-context.test.ts     # 15 tests — known customer happy path, unknown phone, includeTransactions toggle, maxHistoryMessages cap, is_ai_enabled propagation, dollars→cents conversion.
src/lib/services/__tests__/staff-notification.test.ts   # 15 tests — all 7 reason codes + isStaffNotificationReason guard, recipient fallback chain, partial-failure reporting, template-inactive short-circuit, audit-log to customer thread.
src/lib/services/page-content-extractor.ts
src/lib/services/service-resolver.ts                 # resolveServiceByName + resolvePrice for voice agent / SMS auto-responder. Layer 3d: resolvePrice rewritten as thin wrapper around canonical engine; 4 silent-mispricing bugs (exotic/classic, per_unit, specialty, custom) closed.
src/lib/services/combo-resolver.ts                    # Issue 33 Layer 1 — applyCombosFromSuggestions (pure) + applyCombosToQuoteItems (admin-injected wrapper) + isComboInSeason. Detects combo eligibility from the SET of services in a quote and rewrites addon line items with combo_price + pricing_type='combo'. Adopted in send_quote_sms, voice-agent quotes, Twilio inbound auto-quote, voice-post-call, and the public booking form.
src/lib/services/voice-post-call.ts
src/lib/services/shippo.ts
src/lib/services/picker-engine.ts                    # Canonical service-pricing engine (Item 15f Layer 1; Layer 2 added `open-custom-price-dialog` ServiceTapRoute variant + branch; Session #113 added `selectPricingTierForVehicle` — canonical tier selector, now used by all 6 tier-selection sites incl. the 2 prereq auto-add paths) — resolveServicePrice, resolveServicePriceWithSale, getServicePriceRange, routeServiceTap, selectPricingTierForVehicle. Per CLAUDE.md Rule 22.
src/lib/services/use-service-picker.ts               # useServicePicker hook returning { CatalogPane, ActiveDialog, selectedServiceIds, tapService, reset } (Item 15f Layer 1; Layer 2 added tapService + custom-dialog wiring)
src/lib/services/custom-price-dialog.tsx             # <CustomPriceDialog> + buildCustomPricing helper for pricing_model='custom' (Item 15f Layer 2) — staff-assessment prompt with Stripe-min validation
src/lib/services/index.ts                            # Public barrel — re-exports engine + hook + custom-dialog + types (Item 15f Layer 1 + 2; Layer 8e removed `EditServicesDialog` export when the component was deleted)
src/lib/services/__tests__/picker-engine.test.ts     # Engine tests — exhaustive size_class + sale + routing per pricing_model. Layer 2 flipped the 'custom' pin to assert open-custom-price-dialog. Session #113 added 9 `selectPricingTierForVehicle` cases (incl. the $110-not-$75 prereq bug).
src/app/pos/context/__tests__/prerequisite-size-aware-pricing.test.ts # Session #113 — 6 integration cases: ticket+quote reducers land the suv_3row_van prereq price ($110), the old [0] would land $75, every size→own price, no-match→null drives the block. Regression lock for POS_PREREQUISITE_PRICING_AUDIT.md.
src/lib/services/__tests__/use-service-picker.test.tsx # Hook contract tests with vi-mocked CatalogBrowser/ServicePricingPicker/CustomPriceDialog (Item 15f Layer 1+2)
src/lib/services/__tests__/custom-price-dialog.test.tsx # 11 tests — dialog rendering, validation, confirm/cancel emit, buildCustomPricing helper (Item 15f Layer 2)
src/lib/services/__tests__/service-resolver.test.ts  # 27 tests — pin all 4 Layer-3d bug fixes (exotic/classic fall-through, per_unit $0, specialty first-tier, custom $0); covers flat / vehicle_size / scope / per_unit / specialty / custom dispatch + size-class edge cases.
src/lib/services/__tests__/combo-resolver.test.ts    # 29 tests — pure function + admin wrapper + isComboInSeason. Covers combo HIT/MISS, auto_suggest gate, seasonal window in/out of season, multi-anchor tiebreak (lowest_price default + first_match), lowestWins gate (sale-vs-combo), input non-mutation, defensive null/zero combo_price handling.
src/lib/services/__tests__/voice-post-call.test.ts   # 3 tests — pin the combo-resolver integration contract used by voice-post-call's autoGenerateQuote loop (greenfield: voice-post-call.ts had no existing tests; full processVoiceCallEnd integration intentionally deferred per file header).
```

Backward-compat shim for the canonical engine (Item 15f Layer 1):
```
src/app/pos/utils/pricing.ts                         # @deprecated re-exports from @/lib/services/picker-engine — kept for unmigrated call sites; Layer 3b will retire it
```

### Supabase
```
src/lib/supabase/admin.ts
src/lib/supabase/anon.ts
src/lib/supabase/client.ts
src/lib/supabase/database.types.ts
src/lib/supabase/middleware.ts
src/lib/supabase/server.ts
src/lib/supabase/types.ts
```

### Types
```
src/lib/types/roles.ts
```

### Utils
```
src/lib/utils/admin-fetch.ts
src/lib/utils/ai-page-context.ts
src/lib/utils/analytics-helpers.ts
src/lib/utils/assign-detailer.ts
src/lib/utils/attribution.ts
src/lib/utils/audience.ts
src/lib/utils/cms-theme-presets.ts
src/lib/utils/cms-zones.ts
src/lib/utils/cn.ts
src/lib/utils/constants.ts
src/lib/utils/coupon-helpers.ts
src/lib/utils/default-theme.ts
src/lib/utils/email-consent.ts
src/lib/utils/email.ts
src/lib/utils/feature-flags.ts
src/lib/utils/form.ts
src/lib/utils/compose-line-items.ts                     # Phase Mobile-1.7: display-only line-item composer; appends synthetic mobile-fee row for quote/appointment renderers
src/lib/utils/format-address.ts
src/lib/utils/format-channel.ts
src/lib/utils/format.ts
src/lib/utils/supabase-error.ts     # Session #111 (Catalog S3): describeSupabaseError(err, fallback) — maps named constraints + SQLSTATE (23502/23505/23514/23503) to operator-friendly text, else raw message, else fallback. Used by catalog mutation catch blocks to surface real Postgres errors (started services/new; sweep continues in #111b). Tests: __tests__/supabase-error.test.ts.
src/lib/utils/google-place-id.ts                                # Normalizer + validator for Google Place ID (handles double-encoded JSONB reads, URL paste, quote-stripping)
src/lib/utils/idempotency.ts
src/lib/utils/issue-types.ts
src/lib/utils/job-zones.ts
src/lib/utils/light-mode-vars.ts
src/lib/utils/link-tracking.ts
src/lib/utils/mailgun-signature.ts
src/lib/utils/mobile-address-action.ts
src/lib/utils/mobile-service-edit.ts                            # Pure helpers: delta math + JSONB sync + paid-cents (Phase Mobile-1.9)
src/lib/utils/classify-vehicle-client.ts                        # Session #142 (Vehicle Classifier Restoration, 2026-06-02) — thin browser-side wrapper `classifyVehicleClient(make, model?, year?)` that fetches `/api/classify-vehicle` instead of calling `resolveVehicleClassification` directly with a browser-side Supabase client. The architectural fix for C1: pre-#142 anonymous public-booking customers hit `vehicle_makes` RLS denial and the spinner stuck; post-#142 all browser classifier traffic flows through this wrapper → server endpoint → admin client (RLS bypassed). Exports `CLASSIFIER_TIMEOUT_MS = 10_000` AbortController defense so a hung fetch can't trap the spinner forever — T9 contract requirement (`classifier-spinner-lifecycle.test.tsx` scenario 5 explicitly tests this case). On `classifier_reason === 'query_failed'` emits `console.warn` with caller context (S1 telemetry, Q-2 LOCKED — not audit_log). Signature parity with `resolveVehicleClassification` minus the `supabase` parameter. Does NOT throw on non-confident classifier results (those return as normal `VehicleClassification` with `category_confident: false`); DOES throw on network/HTTP errors + timeout so the caller's existing try/catch handles them uniformly.
src/lib/utils/vehicle-save-action.ts                            # Session #141 (Path B Session 2 / Concern 2, 2026-06-02) — pure synth helper `resolveVehicleSaveAction({customerId, vehicleId, vehicleCreated})` returning `VehicleSaveAction | null` for the `/api/book` response's `vehicle_save_action` field. Mirrors the SHAPE of `mobile-address-action.ts` (`silently_saved: boolean` + `{customer_id, vehicle_id}` payload) so the booking-confirmation client can fold both silent-save events into a single combined toast. Non-null ONLY when `findOrCreateVehicle` returned `created: true` (fresh insert, customer didn't have this vehicle) AND there's a customer_id to link it to — matched-existing vehicle returns null (no announcement). Sync (no DB calls) — unlike `resolveMobileAddressAction` which queries customers + may run an UPDATE, the vehicle work is already done by `findOrCreateVehicle` upstream; this helper just synthesizes the response shape that the client reads. **Q-PB-S2 LOCKED Option 1 (transparency-only):** the audit's Concern 2 was misperceived as a persistence gap; pre-flight in #141 confirmed vehicles ARE persisted via findOrCreateVehicle today — the gap was customer transparency. No opt-out toggle because `vehicles.customer_id` is `NOT NULL` and the dedup `idx_vehicles_customer_make_model` UNIQUE index is scoped by customer_id; a "vehicle without account linkage" data path doesn't exist without a schema migration (out of scope). Customer agency is preserved via the "View →" link in the toast that deep-links to /account/vehicles where they can delete the saved vehicle.
src/lib/utils/resolve-mobile-fields.ts                          # Shared mobile-fields validation/resolver (Phase Mobile-1.9, consumed by quote-service + mobile-service PATCH endpoints)
src/lib/utils/order-emails.ts
src/lib/utils/order-number.ts                                  # Phase 3 Theme A (2026-06-07) — thin wrapper around `supabase.rpc('next_identifier', {p_entity_type: 'work_order'})`. Refactored from the pre-Theme-A γ generator that read MAX(order_number) and incremented in JS. Signature preserved; assignment timing unchanged (still deferred to Stripe payment-success via webhook).
src/lib/utils/phone-validation.ts
src/lib/utils/quote-number.ts                                  # Phase 3 Theme A (2026-06-07) — thin wrapper around `supabase.rpc('next_identifier', {p_entity_type: 'quote'})`. Refactored from the pre-Theme-A γ generator; the row-level lock inside `next_identifier()` closes the items-error cleanup REUSE window at quote-service.ts:218-228 (counter advances regardless of caller rollback).
src/lib/utils/receipt-number.ts                                # Phase 3 Theme A (2026-06-07, NEW) — `generateReceiptNumber()` helper wrapping `next_identifier('receipt')`. Replaces the pre-Theme-A `tr_transaction_receipt_number` BEFORE INSERT trigger pattern. 5 transaction-INSERT callsites supply receipt_number explicitly: pos/transactions, pos/sync-offline-transaction, book (deposit), webhooks/stripe (pay-link), migration/transactions (Square import).
src/lib/utils/po-number.ts                                     # Phase 3 Theme A (2026-06-07, NEW) — `generatePoNumber()` helper wrapping `next_identifier('purchase_order')`. Replaces the pre-Theme-A `tr_po_number` BEFORE INSERT trigger pattern. Single consumer: admin/purchase-orders/route.ts.
src/lib/utils/appointment-number.ts                            # Phase 3 Theme A (2026-06-07, NEW) — `generateAppointmentNumber()` helper wrapping `next_identifier('appointment')`. New greenfield column `appointments.appointment_number` (UNIQUE NOT NULL) — every appointment-creating callsite (book/route.ts online, pos/jobs/route.ts walk-in, voice-agent/appointments/route.ts, convert-service.ts convertQuote) supplies it explicitly. Backfill of 35 existing rows in migration 20260607061603 assigned A-10001..A-10035 ordered by created_at ASC.
src/lib/utils/render-annotations.ts
src/lib/utils/revalidate.ts
src/lib/utils/role-defaults.ts
src/lib/utils/pst-date.ts
src/lib/utils/sale-history.ts
src/lib/utils/sale-pricing.ts
src/lib/utils/shipping-types.ts
src/lib/utils/short-link.ts
src/lib/utils/conversation-helpers.ts
src/lib/utils/voice-perf.ts
src/lib/utils/sms-consent.ts
src/lib/utils/sms.ts                              # Twilio send helpers + splitSmsMessage chunker (relocated from twilio/inbound/route.ts in Layer 4 so legacy auto-reply and v2 background dispatch share one chunker). Behavior byte-identical pre/post relocation.
src/lib/utils/template.ts
src/lib/utils/ticker-sections.ts
src/lib/utils/validation.ts
src/lib/utils/service-extraction.ts
src/lib/utils/refund-math.ts        # Phase Money-Unify-1: deprecated re-export shim — `export * from './money'`. Removed at Unify-Final.
src/lib/utils/money.ts              # Phase Money-Unify-1: canonical money module (renamed from refund-math.ts). Exports toCents/fromCents, STRIPE_MIN_AMOUNT_CENTS=50, STRIPE_MIN_DOLLARS, refund-math helpers, invariants
src/lib/utils/stock-adjustments.ts
src/lib/utils/stripe-card-details.ts        # Phase 1A.5: extractCardDetailsFromCharge — Stripe brand/last4 helper for online card payment paths
src/lib/utils/system-actors.ts
src/lib/utils/vehicle-categories.ts
src/lib/utils/vehicle-helpers.ts
src/lib/utils/__tests__/compose-line-items.test.ts      # Phase Mobile-1.7: 17 cases — synthetic mobile-fee row, field normalization, Q-0051 regression
src/lib/utils/__tests__/constants.test.ts
src/lib/utils/__tests__/format-address.test.ts
src/lib/utils/__tests__/refund-math.test.ts
src/lib/utils/__tests__/money.test.ts                   # Phase Money-Unify-1: 11 tests — STRIPE_MIN_AMOUNT_CENTS/STRIPE_MIN_DOLLARS, LOYALTY.REDEEM_RATE_CENTS, refund-math re-export shim
src/lib/utils/__tests__/format-money.test.ts            # Phase Money-Unify-1: 25 tests — formatMoney/formatMoneyForInput edges, 1M-iter byte-identical equivalence vs formatCurrency
src/lib/utils/__tests__/stock-adjustments.test.ts
src/lib/utils/__tests__/mobile-service-edit.test.ts
src/lib/utils/__tests__/resolve-mobile-fields.test.ts
src/lib/utils/__tests__/validation-mobile-address.test.ts
src/lib/utils/__tests__/vehicle-save-action.test.ts     # Session #141 (Path B Session 2 / Concern 2, 2026-06-02) — 8 unit tests for `resolveVehicleSaveAction`. Null cases × 5 (vehicleCreated=false / null customerId / null vehicleId / both ids null / vehicleCreated=false anti-regression even with both ids populated). Silently_saved case × 3 (standard hit; id pass-through verifies the helper is a pure synthesizer with no transformation; discriminator-always-true contract — non-null result always carries `silently_saved: true`, mirroring MobileAddressAction's contract where the flag represents the first-time-save event). Sync helper — no Supabase mock needed.
src/lib/utils/__tests__/identifier-generators.test.ts   # Phase 3 Theme A (2026-06-07) — 7 unit tests pinning the wrapper shape of all five generator helpers (quote/order/receipt/po/appointment): rpc called with correct entity_type, returns data verbatim, throws on rpc-error / null-data. Mocks `createAdminClient`; no live DB.
src/lib/utils/__tests__/identifier-sequences.test.ts    # Phase 3 Theme A (2026-06-07) — 10 LIVE-DB integration tests for `next_identifier(entity_type)`: per-entity format (Q/A/SD/WO/PO each return correct prefix + 5-digit pad), strict monotonicity, concurrency (10 parallel calls return 10 distinct values via row-level lock), unknown-entity exception, all 5 entity_types seeded. Skip when SUPABASE env vars absent (default npm test); run via `set -a && source .env.local && set +a && npx vitest run src/lib/utils/__tests__/identifier-*.test.ts`.
src/lib/utils/__tests__/identifier-migration-integrity.test.ts  # Phase 3 Theme A (2026-06-07) — 8 LIVE-DB integration tests: identifier_sequences seeded with all 5 rows + pad_width=5; every appointment has non-null appointment_number in A-NNNNN format; SD receipts all reformatted to length-8 (SD- + 5 digits); receipt count preserved ≥ 6,309 baseline; no duplicate receipt_numbers; receipt counter ≥ MAX numeric; dormant generate_quote_number probe returns function-missing error.
src/lib/utils/__tests__/sd-backfill-format.test.ts      # Phase 3 Theme A (2026-06-07) — 4 LIVE-DB integration tests for the SD receipt reformat: no row carries the pre-backfill 6-digit shape (>8 chars); every row matches SD-NNNNN; top SD preserves the pre-backfill MAX of 6365 + sample 5 form a strictly-decreasing sequence (numeric values preserved); 6,309 baseline count preserved.
src/lib/utils/__tests__/identifier-race-closure.test.ts # Phase 3 Theme A (2026-06-07) — 2 LIVE-DB integration tests for the AC-10 race-window closure (the pre-Theme-A Quote γ items-error cleanup REUSE risk from quote-service.ts:218-228, audit Target A.4). Asserts next_identifier never returns the same value twice across sequential calls, and the counter advance survives a quotes-table DELETE (the historical reuse vector). The row-level lock + counter-independent-of-row design closes the audit's number-REUSE vector.
src/lib/utils/__tests__/identifier-legacy-triggers-dropped.test.ts  # Phase 3 Theme A.1 (2026-06-07) — 4 LIVE-DB integration tests pinning the post-Theme-A.1 invariants: (a) `generate_receipt_number()` returns PGRST202 via PostgREST (function gone), (b) `generate_po_number()` returns PGRST202 (function gone), (c) `next_identifier('receipt')` continues to issue SD-NNNNN, (d) `next_identifier('purchase_order')` continues to issue PO-NNNNN. DROP TRIGGER cascades down from DROP FUNCTION in PostgreSQL, so verifying the function absence proves the trigger absence too. Skip when SUPABASE env vars absent (same pattern as identifier-sequences.test.ts).
src/lib/utils/__tests__/validation-refund-shopuse.test.ts
src/lib/utils/__tests__/vehicle-categories.test.ts
src/lib/utils/__tests__/sms-normalization.test.ts         # Phase Normalization-1: 8 cases — sendSms/sendMarketingSms rejection on invalid, normalization of (XXX) XXX-XXXX and 11-digit shapes, E.164 pass-through
src/lib/utils/__tests__/sms-self-send.test.ts             # Session #139 (2026-06-02) — Concern 4 self-send chokepoint: sendSms refuses when normalize(to) == normalize(TWILIO_PHONE_NUMBER); skipped when env unset; backward-compatible failure shape. 10 tests.
src/lib/utils/__tests__/conversation-helpers-normalization.test.ts # Phase Normalization-1: 4 cases — findOrCreateConversation rejection on invalid + normalized lookup/insert
# src/lib/utils/webhook.ts — DELETED in Phase 3 Theme G (Smart Details has no n8n receiver; per webhook receivers identity audit f5e714a8)
```

### Other
```
src/lib/animations.ts
```

---

## Components (`src/components/`)

### UI Primitives (`src/components/ui/`)
```
src/components/ui/badge.tsx
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/checkbox.tsx
src/components/ui/confirm-dialog.tsx
src/components/ui/data-table.tsx
src/components/ui/dialog.tsx
src/components/ui/dropdown-menu.tsx
src/components/ui/empty-state.tsx
src/components/ui/form-field.tsx
src/components/ui/input.tsx
src/components/ui/label.tsx
src/components/ui/page-header.tsx
src/components/ui/pagination.tsx
src/components/ui/search-input.tsx
src/components/ui/section-error-badge.tsx
src/components/ui/select.tsx
src/components/ui/send-method-dialog.tsx
src/components/ui/skeleton.tsx
src/components/ui/slide-over.tsx
src/components/ui/spinner.tsx
src/components/ui/switch.tsx
src/components/ui/table.tsx
src/components/ui/tabs.tsx
src/components/ui/textarea.tsx
src/components/ui/toggle-pill.tsx
src/components/ui/vehicle-make-combobox.tsx
src/components/ui/__tests__/confirm-dialog.test.tsx
src/components/ui/__tests__/dialog.test.tsx
src/components/ui/__tests__/search-input.test.tsx
```

### Admin Components
```
src/components/admin/content/content-block-editor.tsx
src/components/admin/content/credentials-editor.tsx
src/components/admin/content/faq-editor.tsx
src/components/admin/content/gallery-editor.tsx
src/components/admin/content/terms-sections-editor.tsx
src/components/admin/content/page-html-editor.tsx
src/components/admin/content/team-grid-editor.tsx
src/components/admin/drag-drop-reorder.tsx
src/components/admin/html-editor-toolbar.tsx
src/components/admin/html-image-manager.tsx
src/components/admin/icon-picker.tsx
src/components/admin/image-upload-field.tsx
src/components/admin/receipt-dialog.tsx
src/components/admin/table-toolbar.tsx
src/components/admin/toolbar-items/accordion-dialog.tsx
src/components/admin/toolbar-items/button-dialog.tsx
src/components/admin/toolbar-items/callout-dialog.tsx
src/components/admin/toolbar-items/columns-dialog.tsx
src/components/admin/toolbar-items/divider-dialog.tsx
src/components/admin/toolbar-items/embed-dialog.tsx
src/components/admin/toolbar-items/link-dialog.tsx
src/components/admin/toolbar-items/list-dialog.tsx
src/components/admin/toolbar-items/map-embed-dialog.tsx
src/components/admin/toolbar-items/social-links-dialog.tsx
src/components/admin/toolbar-items/table-dialog.tsx
src/components/admin/toolbar-items/video-embed-dialog.tsx
```

### Public Site Components
```
src/components/public/animated-section.tsx
src/components/public/before-after-slider.tsx
src/components/public/breadcrumbs.tsx
src/components/public/cms/ad-zone.tsx
src/components/public/cms/announcement-ticker.tsx
src/components/public/cms/hero-carousel.tsx
src/components/public/cms/particle-canvas.tsx
src/components/public/cms/section-ticker-slot.tsx
src/components/public/cms/theme-preview-banner.tsx
src/components/public/cms/theme-provider.tsx
src/components/public/content-block-renderer.tsx
src/components/public/gallery-lightbox.tsx
src/components/public/cta-section.tsx
src/components/public/footer-client.tsx
src/components/public/header-client.tsx
src/components/public/header-shell.tsx
src/components/public/hero-client.tsx
src/components/public/hero-section.tsx
src/components/public/home-animations.tsx
src/components/public/json-ld.tsx
src/components/public/mobile-menu.tsx
src/components/public/nav-dropdown.tsx
src/components/public/product-card.tsx
src/components/public/product-category-card.tsx
src/components/public/product-search.tsx
src/components/public/scroll-reveal.tsx
src/components/public/service-card.tsx
src/components/public/service-category-card.tsx
src/components/public/service-pricing-display.tsx
src/components/public/conditional-footer.tsx
src/components/public/site-footer.tsx
src/components/public/site-header.tsx
src/components/public/theme-toggle-initializer.tsx
src/components/public/theme-toggle.tsx
src/components/public/team-grid-layout.tsx
src/components/public/trust-bar-client.tsx
src/components/public/trust-bar.tsx
```

### Cart Components
```
src/components/public/cart/add-to-cart-button.tsx
src/components/public/cart/cart-drawer.tsx
src/components/public/cart/cart-icon-button.tsx
src/components/public/cart/cart-provider-wrapper.tsx
src/components/public/cart/product-add-to-cart.tsx
src/components/public/cart/quantity-selector.tsx
```

### Account Components
```
src/components/account/account-shell.tsx
src/components/account/profile-completion-banner.tsx
src/components/account/appointment-card.tsx
src/components/account/coupon-card.tsx
src/components/account/transaction-card.tsx
src/components/account/transaction-detail.tsx
src/components/account/vehicle-card.tsx
src/components/account/vehicle-form-dialog.tsx
```

### Booking Components
```
src/components/booking/booking-confirmation.tsx
src/components/booking/booking-wizard.tsx
src/components/booking/inline-auth.tsx              (inline collapsible sign-in/sign-up for Step 3)
src/components/booking/step-confirm-book.tsx        (merged confirm & book page — Step 3)
src/components/booking/step-indicator.tsx
src/components/booking/step-payment.tsx
src/components/booking/step-schedule.tsx
src/components/booking/step-service-select.tsx      (merged service select + configure — Step 2; Item 15f Layer 3c migrated price math to canonical engine 2026-05-16, exports `computePrice` + `getServicePriceDisplay` for test consumption)
src/components/booking/step-vehicle.tsx              (vehicle selection — Step 1)
src/components/booking/specialty-vehicle-block.tsx   (exotic/classic booking block page — Session 27; refactored Session #137 to a thin wrapper over `<QuoteRequestForm>` — external API preserved byte-stable, only `booking-wizard.tsx` calls it; Step-1-specific bits remain owned by this wrapper: vehicle-word headline, "Edit my vehicle" footer, specialty-block-view telemetry on mount)
src/components/booking/quote-request-form.tsx       # Session #137 (U-B.3 W3, 2026-06-01) — shared base for "talk to staff" CTAs. Owns: form state (name/phone/email/preferred_time), phone-input formatting + validation, submit handler (POST `/api/public/specialty-callback` — generalized in #137 to accept `request_type='specialty_vehicle' | 'staff_assessed_service'`), success-state rendering, Call CTA (tel: link), "or" divider, four input fields. Takes a caller-composed `payloadBase` (any shape with the discriminator) merged with the four form-collected fields on submit. Two current consumers: `<SpecialtyVehicleBlock>` (Step 1 specialty-vehicle callback) and `<RequestQuoteCard>` (Step 2 staff_assessed quote-request). F2 (RV/Boat/Aircraft non-priced) is the next planned consumer and will pass a third discriminator value. Extracted per Memory #2/#29 reuse principle when CC initially built RequestQuoteCard as a duplicate of SpecialtyVehicleBlock — operator interjected mid-session.
src/components/booking/request-quote-card.tsx       # Session #137 (U-B.3 W3, 2026-06-01) — generic "talk to staff for a quote" inline card. Thin wrapper over `<QuoteRequestForm>` composing service-specific payload + headline/body copy. Mounted by `step-service-select.tsx` in place of the configure panel when `selectedService.staff_assessed === true`. Generic name (NOT `StaffAssessedQuoteCard`) so F2's eventual "non-priced vehicle category" use case can reuse without renaming. Sends `request_type: 'staff_assessed_service'` to the endpoint with `service_name`, `service_id`, and optional Step 1 vehicle context (year/make/model/size_class).
src/components/booking/__tests__/step-service-select.test.tsx  # Item 15f Layer 3c — pins all 6 pricing_model values through canonical-engine path
src/components/booking/__tests__/step-service-select-render.test.tsx  # Session #133 (U-B.1, 2026-05-30) — 6 render tests for StepServiceSelect. N1 (Step 2 Back button): renders when `onBack` provided, hidden when omitted (edit-from-Step-4 mode), invokes handler on click. W6 (`services.special_requirements`): renders as italic "Note: …" line below service description when set, hidden when null, hidden when empty string (falsy guard). Session #137 (U-B.3 W3, 2026-06-01) added 4 W3 tests: ServiceCard shows "Custom Quote" badge in place of price label when `staff_assessed=true` + the badge is absent + the normal price is shown when `staff_assessed=false`; selected staff_assessed service renders the RequestQuoteCard markers (service-specific headline, "Request a quote" intro label, "Request Quote" submit-button label) AND suppresses the Continue button; selected non-staff_assessed service renders Continue AND NOT the quote form. Companion to the unit-test file `step-service-select.test.tsx`; keeps render-layer tests separable from pure helper-function tests.
src/components/booking/__tests__/classifier-spinner-lifecycle.test.tsx  # Session #142 (Vehicle Classifier Restoration, 2026-06-02) — T9 regression-locking contract test. 6 tests across 5 classifier failure-mode scenarios: (1) confident success, (2) no_match (Layer-1 returns 0 rows), (3) query_failed (Supabase error field non-null — the RLS-denial-equivalent + S1 telemetry verification that `console.warn` fires with "query_failed" + the make), (4) HTTP error × 2 sub-tests (non-2xx response + fetch rejection), (5) never-resolve via `CLASSIFIER_TIMEOUT_MS` AbortController (THE production stuck-spinner bug class — pre-#142 the spinner could hang forever; post-#142 the 10s timeout fires + caller's catch + finally runs + spinner clears). For each scenario asserts `aria-busy=false` on the height-reserved spinner container within a bounded time. Mirrors #136 T8's structural-guard pattern from `vehicle-forms-reset-contract.test.tsx`. Anti-regression: if any future refactor removes the timeout from `classify-vehicle-client.ts` or breaks the try/catch/finally lifecycle in step-vehicle.tsx's `classify()`, scenario 5 (or one of the other four) fails. Single source of truth for the spinner-lifecycle contract. Uses fake timers + fetch spy + mocked VehicleMakeCombobox (rendered as a plain input for deterministic fireEvent).
src/components/booking/__tests__/booking-confirmation-toast.test.tsx  # Session #141 (Path B Session 2 / Concern 2, 2026-06-02) — 8 render tests for the BookingConfirmation silent-save transparency toast. Locks the mount-effect's three-branch dispatch on `[vehicleSaveAction.silently_saved, mobileAddressAction.silently_saved]`: (1) BOTH true → ONE combined toast "We've saved your vehicle and address to your account." (NOT two stacked — anti-regression assertion that `toast.success` called exactly once); (2) vehicle-only → "We've saved your vehicle to your account." (3) address-only → Mobile-1.1's locked wording "We've saved your address to your profile." byte-stable (literal-string match, no second-arg). "View →" action button assertion split: present on isPortal=true paths (combined + vehicle-only), absent on isPortal=false paths (anonymous booking — link would route through /signin). Anti-regression coverage: vehicle-only fires correctly even when mobileAddressAction is non-null with diff=true + silently_saved=false (diff drives banner, not toast); neither-save no-op × 2 (both null, both populated with silently_saved=false). Mocks: sonner (toast.success spy via `vi.fn` wrapper) + canvas-confetti (BookingConfirmation triggers 10-second confetti animation on mount that would pin the test event loop otherwise).
```

### Quote Components
```
src/components/quotes/notify-customer-dialog.tsx
src/components/quotes/quote-book-dialog.tsx
```

### Job Components
```
src/components/jobs/send-payment-link-dialog.tsx   — POS Send Payment Link channel-pick modal (Pay-Link Session 3b)
src/components/jobs/payment-link-amount-modal.tsx  — POS Pre-send amount selector (25/50/75/Full + Custom) (Pay-Link Session 5)
src/components/jobs/edit-mobile-modal.tsx          — Shared full mobile picker edit modal (POS + admin, mode prop) (Phase Mobile-1.9)
src/components/jobs/payment-mismatch-banner.tsx    — Non-blocking warning after mobile edit when total ≠ paid (Phase Mobile-1.9)
src/components/jobs/__tests__/edit-mobile-modal.test.tsx
```

### Other
```
src/components/before-after-slider.tsx
src/components/photo-gallery.tsx
src/components/qbo-sync-badge.tsx
src/components/service-pricing-form.tsx
```

---

## POS Lib (`src/app/pos/lib/`)

```
pos-fetch.ts          — POS API fetch wrapper with 401 redirect
receipt-template.ts   — Receipt line generation, plain text, HTML, ESC/POS renderers
stripe-terminal.ts    — Stripe Terminal SDK integration
```

---

## POS Hooks (`src/app/pos/hooks/`)

```
use-catalog.ts              — Shared catalog data hook (products, services)
use-prerequisite-check.ts   — Service prerequisite check before adding to ticket/quote (surface-agnostic; POSTs context to /api/pos/services/check-prerequisites)
use-validated-service-add.tsx — Track A (#121). Canonical add-time validation hook (CLAUDE.md Rule 22). Surface-agnostic: add-on-only gate (addon_only + no primary/both anchor → warn + manager-PIN override) → prerequisite check (wraps use-prerequisite-check) → commit via caller `onAdd`. Owns BOTH warning dialogs + the prerequisite auto-add orchestration (previously duplicated in catalog-browser + quote-builder). Used by Sale catalog-browser, Quotes quote-builder (search/picker + browse), and register-tab favorites. `.tsx` because it renders the dialogs.
use-edit-mode-drain.ts      — Item 15f Phase 1 Layer 8b. POS deep-link drain (`/pos?source=...&id=...&returnTo=...`). Validates UUID + safe-internal-path, fetches load endpoint, dispatches ENTER_EDIT_MODE + modifier follow-ups. Mounted in pos-workspace.tsx. Exports pure helpers (`isUuid`, `isSafeInternalPath`, `buildTicketStateFromLoad`, `runEditModeDrain`) for unit-testing.
```

- `src/app/pos/hooks/__tests__/use-edit-mode-drain.test.ts` — 24 cases: validators (UUID + 5 open-redirect attack classes), build-state pure helper, drain endpoint selection + dispatch sequence + coupon re-validation, error paths (403/404/network/malformed), Layer 8c `MARK_EDIT_INITIAL_STATE` as final dispatch (ordering vs coupon revalidate).
- `src/app/pos/hooks/__tests__/use-validated-service-add.test.tsx` — Track A (#121), 8 cases: prereq commit/fire/context-POST/override + add-on-solo fire/anchor-bypass/both-anchor/override. Engine-level lock for all three surfaces.

- `src/app/pos/components/edit-mode-banner.tsx` — Item 15f Phase 1 Layer 8c + Layer 8d label revamp. Subtle amber banner at top of Sale workspace when `ticket.editMode` is true. Surfaces "Editing Appointment: {customer} — {date}" via `buildEditLabel` helper (exported for tests), with fallback hierarchy: customer+date → customer-only → date-only → UUID-prefix safety net. "Unsaved changes" badge compares `serializeTicketEditSlice(ticket)` against `ticket.editInitialSnapshot`. Returns null outside edit mode.
- `src/app/pos/components/__tests__/edit-mode-banner.test.tsx` — 14 cases: render gating, Layer 8d customer+date label (appointment + job variants), 4-tier fallback hierarchy, dirty/clean states, pre-MARK snapshot=null suppression, `buildEditLabel` pure-function unit tests.
- `src/app/pos/components/__tests__/ticket-actions-edit-mode.test.tsx` — 12 cases for the editMode branch of `<TicketActions>`: button swap (Save Changes + Cancel), Save POST payload shape (services + 6 modifier fields, percent→dollar resolution), success/error paths, clean vs dirty Cancel UX.
- `src/app/pos/components/__tests__/pos-workspace-products-gating.test.tsx` — Item 15f Phase 1 Layer 8d. 3 cases: Products tab interactive when editMode=false (no regression), disabled when editMode=true (aria + cursor-not-allowed), clicking disabled tab surfaces toast + does not switch active tab.
- `src/app/pos/components/__tests__/register-tab-favorites-gating.test.tsx` — Item 15f Phase 1 Layer 8d-bis. 4 cases: Register tab favorite/quick-add buttons gated for product favorites in edit mode (4th product-add surface). Non-edit-mode adds normally, edit-mode rejects + surfaces toast.info, edit-mode renders aria-disabled + opacity-40 + cursor-not-allowed, service favorites unaffected (services ARE editable).
- `src/app/pos/jobs/components/__tests__/edit-services-deep-link.test.ts` — Item 15f Phase 1 Layer 8d-bis (Option G4). 4 cases: pure URL-builder contract pinning `source=job`, `id=JOB_UUID` (NOT appointment UUID — Layer 8d shipped the appointment UUID and 404'd; drain now resolves appointment_id from response), `returnTo=/pos/jobs?jobId=<job>` URL-encoded, three-param outer query string.

---

## POS Components (`src/app/pos/components/`)

```
addon-suggestions.tsx       customer-type-badge.tsx      pos-workspace.tsx
bottom-nav.tsx              customer-type-prompt.tsx     product-detail.tsx
                                                        shop-use-dialog.tsx
catalog-browser.tsx         customer-vehicle-summary.tsx promotions-tab.tsx
catalog-card.tsx            eod/                        receipt-options.tsx
catalog-grid.tsx            held-tickets-panel.tsx      refund/
catalog-panel.tsx           keypad-tab.tsx              register-tab.tsx
category-tabs.tsx           loyalty-panel.tsx           search-bar.tsx
category-tile.tsx           offline-indicator.tsx       service-detail-dialog.tsx
checkout/                   offline-queue-badge.tsx     service-pricing-picker.tsx
coupon-input.tsx            manager-pin-dialog.tsx      prerequisite-removal-dialog.tsx
                            pin-screen.tsx              prerequisite-warning-dialog.tsx
                                                        swipeable-cart-item.tsx
customer-complete-profile-dialog.tsx
customer-create-dialog.tsx  pin-pad.tsx                 ticket-actions.tsx
customer-lookup.tsx         pos-service-worker.tsx      ticket-item-row.tsx
                                                        ticket-panel.tsx
                                                        ticket-totals.tsx
                                                        transactions/
                                                        vehicle-create-dialog.tsx
                                                        vehicle-selector.tsx
                                                        __tests__/customer-create-dialog.test.tsx
                                                        __tests__/customer-lookup.test.tsx
                                                        __tests__/service-detail-dialog.test.tsx
                                                        __tests__/service-pricing-picker.test.tsx
                                                        __tests__/ticket-actions.test.tsx
                                                        __tests__/catalog-browser-custom-routing.test.tsx  # Item 15f Layer 3e — pins `<CatalogBrowser>` opens `<CustomPriceDialog>` for pricing_model=custom
                                                        utils/__tests__/pricing.test.ts
                                                        quotes/
```

Item 15f Layer 3e additions:
- `src/app/pos/components/catalog-browser.tsx` — adds `customPriceService` state + custom branch in 3 tap handlers + `<CustomPriceDialog>` mount. Routes `pricing_model === 'custom'` directly to staff-assessment dialog, bypassing the disabled-button bug in `<ServiceDetailDialog>`.

Phase Mobile-1.1 additions:
- `src/app/pos/components/checkout/save-address-dialog.tsx`
- `src/app/pos/components/checkout/__tests__/save-address-dialog.test.tsx`
- `src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx`

Phase 3 Theme E.3 additions (AC-15 operator UI — closes the AC-15 commitment alongside E.1 schema/repo + E.2 application logic):
- `src/app/pos/components/checkout/apply-credit-dialog.tsx` # Reusable `<ApplyCreditDialog>` mounted on payment-complete. Fetches balance via GET /api/admin/customers/[id]/credits, captures amount, calls E.2's POST /api/pos/transactions/[id]/apply-credit. Supports optional `maxApplyCents` cap (e.g., amount due) so caller can prevent over-application; surfaces a toast error before fetch if amount exceeds balance/cap.
- `src/app/pos/components/checkout/__tests__/apply-credit-dialog.test.tsx` # 6 tests — balance fetch on open, zero-balance disables Apply button + input, successful apply POSTs cents + customer_id to E.2 endpoint, client-side over-balance guard blocks fetch, maxApplyCents cap enforced, balance fetch failure sets state to 0 + toast.
- `src/app/pos/jobs/components/customer-credit-badge.tsx` # Passive `<CustomerCreditBadge>` on POS job-detail customer card. Fetches balance via GET /api/admin/customers/[id]/credits. Renders nothing on zero balance (operators see badge only when actionable). Read-only; click-through deep-link out of scope this theme.

Track B — Quotes-panel parity (#120, G2/G3/G4) additions:
- `src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx` # STRUCTURAL GUARD — source-contract test asserting every prop the Sale panel (ticket-panel.tsx) wires on a SHARED component is also wired in the Quotes panel (quote-ticket-panel.tsx), minus a documented Sale-only allowlist (`disabled`). Also pins CustomerTypePrompt mounted in both (G4) + repriceFailed surfaced in both (G3). Catches the NEXT omitted-prop gap at CI. 10 tests.
- `src/app/pos/components/quotes/__tests__/quote-item-row-reprice-badge.test.tsx` # G3 — locks the amber "No <size> pricing" badge into the forked quote-item-row (parity with ticket-item-row) so a no-tier vehicle change can't silently keep a stale price on a customer-facing quote. 4 tests.

Phase 3 Theme F additions (Phase 0.2 audit `dcf511df` F.2 / F.3 / F.5 / F.6 / F.7 cleanup):
- `src/app/pos/components/quotes/__tests__/handle-create-job-modifier-forwarding.test.ts` # F.3 source-string regression — pins the A.3 path POST body field list (5 pre-F.3 fields + 7 F.3 modifier fields with exact `quote.<field> ?? null` shape). 12 tests.
- `src/app/pos/components/quotes/__tests__/converted-view-appointment-link.test.ts` # F.6 source-string regression — pins the "View Appointment" link rendering on both POS quote-detail and admin quote-slide-over surfaces + the deep-link useEffect contract on admin appointments page. 3 tests.
- ~~`src/app/api/quotes/[id]/convert/route.ts`~~ — DELETED in Theme F (F.5 dormant admin convert endpoint; no callers in source tree pre-deletion grep). The active POS-side convert sibling at `src/app/api/pos/quotes/[id]/convert/route.ts` remains.

Roadmap Item 12 (POS Appointments) additions:
- ~~`src/app/pos/components/appointments/appointments-view.tsx`~~ — DELETED in Session 1.6 (POS > Appointments tab retired per AC-4; surface absorbed into POS > Jobs Schedule scope)
- `src/app/pos/components/appointments/reschedule-appointment-dialog.tsx` — kept; reused by `pos/jobs/components/change-time-button.tsx`
- `src/app/pos/components/appointments/types.ts` — kept; reused by `pos/jobs/components/{change-time-button,job-queue}.tsx`

Roadmap Item 15b (Cancel from POS Appointments + This Month filter) additions:
- `src/app/pos/components/appointments/cancel-appointment-dialog.tsx` — kept; reused by `pos/jobs/components/job-queue.tsx`
- ~~`src/app/pos/components/appointments/__tests__/appointments-view.test.tsx`~~ — DELETED in Session 1.6 (test for deleted view)

Session 1.6 (Retire POS > Appointments tab) additions:
- `src/__tests__/middleware.test.ts` — 4 tests: pins the `/pos/appointments` → `/pos/jobs?scope=schedule` 308 redirect + adjacent-route safety
- `src/app/pos/components/__tests__/bottom-nav.test.tsx` — 3 tests: regression-locks the absence of the Appointments tab label + `/pos/appointments` href in the rendered POS bottom nav

Roadmap Item 15c ("Change Time" affordance on Jobs Card) additions:
- `src/app/pos/jobs/components/change-time-button.tsx`
- `src/app/pos/jobs/components/__tests__/change-time-button.test.tsx`
- `src/app/pos/jobs/components/__tests__/job-queue-schedule-scope.test.tsx` — Item 15e Phase 1B + Session 2.5. 10 tests: 7 regression-locked invariants (Session 2.5 — no scope triggers populate; the endpoint is retired but `populateCalls()` stays as a permanent probe for stray callers; Today-scope mount probe is now `jobsCalls()` not the deleted populate; the "Refresh in Today scope re-fetches jobs and never calls populate" test is the new Session 2.5 regression-lock) + 3 scope-toggle UI tests.

Roadmap Item 15e Phase 2A (shared lift for dual-context AppointmentDetailDialog) additions:
- `src/lib/appointments/status-transitions.ts` — `STATUS_TRANSITIONS` (valid next-states per appointment status). Lifted from admin `appointments/types.ts`; re-exported there for backward compat. Enforced server-side by both the admin and POS PATCH routes.
- `src/lib/appointments/types.ts` — `AppointmentService` + `AppointmentWithRelations` (shared joined shape). Lifted from admin `appointments/types.ts`; re-exported there (5 admin importers unchanged). Structurally equivalent to POS `PosAppointment`; convergence deferred.

Roadmap Item 15e Phase 2C-α (un-materialize server foundation) additions:
- `src/lib/appointments/lifecycle-sync.ts` — canonical appointment↔job lifecycle-sync seam. Phase 2C implements `delete_job` (un-materialize); **Session 2.1 (AC-3)** adds `materializeJobFromAppointment` (forward-direction materialization). Exports `jobStatusForAppointmentStatus` (forward mapping), `isEarlierState` (forward-axis rank for the 2C-β admin Save intercept), `executeUnMaterialize` (reverse executor: guards transaction_linked/terminal/confirm_required, reverts appointment→pending FIRST then deletes the job for the re-materialization invariant, best-effort Storage cleanup of job_photos, audit; NO webhooks), and `materializeJobFromAppointment` (forward executor: gates not_found/future_date/invalid_status; INSERT job @ status='intake' + work_started_at=NOW FIRST, then UPDATE appointment→in_progress; idempotent via fast-path SELECT + upsert(ignoreDuplicates) + race-recovery SELECT; powers `POST /api/pos/jobs/start-intake`).
- `src/lib/appointments/__tests__/lifecycle-sync.test.ts` — 20 cases: forward-mapping (incl. walk-in pairing), isEarlierState, executor guards/ordering/storage/audit + the CRITICAL re-materialization-invariant ordering test.
- `src/app/api/pos/appointments/[id]/unmaterialize/route.ts` — POST POS un-materialize (HMAC + checkPosPermission('appointments.cancel')); thin wrapper over executeUnMaterialize. + `__tests__/unmaterialize.test.ts` (6).
- `src/app/api/appointments/[id]/unmaterialize/route.ts` — POST admin un-materialize (getEmployeeFromSession + requirePermission('appointments.cancel')); same executor, cookie-auth surface. + `__tests__/unmaterialize.test.ts` (5).

Roadmap Item 15a (Edit Services on Admin Appointment Dialog with cascade to job) additions:
- `src/lib/appointments/edit-services.ts` — Pure helpers (Zod body schema, `buildJobServicesJsonb()`, `computeTotalsForServiceEdit()`).
- `src/lib/appointments/__tests__/edit-services.test.ts`
- `src/lib/appointments/service-edit.ts` — Item 15f Phase 1 Layer 8a: shared cascade helper `editAppointmentServices(supabase, { appointmentId, body, actor, source, ipAddress })`. Auth-agnostic; called by both admin and POS routes. Owns Zod parse + snapshot + totals recompute + rollback + audit. Exports `ServiceEditError` (typed code + httpStatus for HTTP mapping).
- `src/lib/appointments/__tests__/service-edit.test.ts` — Item 15f Phase 1 Layer 8a: 15 cases covering structured error contract (each code/status pair), source discriminator threading to audit row, return shape with/without linked job, modifier preservation invariant.
- `src/app/api/admin/appointments/[id]/services/route.ts` — PUT cascade endpoint (`appointment_services` + `jobs.services` JSONB sync with manual rollback). Item 15f Phase 1 Layer 8a: refactored to a thin auth + actor-build + helper-call + error-mapping wrapper (442 → 84 lines). Response shape preserved; existing tests pass unmodified.
- `src/app/api/admin/appointments/[id]/services/__tests__/route.test.ts`
- `src/app/api/pos/appointments/[id]/services/route.ts` — Item 15f Phase 1 Layer 8a: POS-authed sibling. Same cascade helper, different auth surface (authenticatePosRequest + pos.jobs.manage). Audit row tagged `source: 'pos'`. Server-side only this layer; frontend wiring lands in Layer 8b/8d.
- `src/app/api/pos/appointments/[id]/services/__tests__/route.test.ts` — Item 15f Phase 1 Layer 8a: 18 cases covering POS auth (401/403), validation parity with admin, cascade parity, audit source tagging, notification suppression, modifier preservation, idempotency.
- `src/app/api/admin/services/active/route.ts` — Session-authed GET active services for admin pickers. Item 15f Layer 3e widened SELECT to include `description` + `custom_starting_price` so the modal could pass them to `<CustomPriceDialog>` (modal deleted in Phase 1 Layer 8e; SELECT widening retained — harmless).
- _(deleted Layer 8e)_ `src/components/appointments/edit-services-modal.tsx` — Item 15a's bespoke modal; unreachable since Layer 8d routed Admin "Edit in POS" button to POS edit mode.
- _(deleted Layer 8e)_ `src/components/appointments/__tests__/edit-services-modal-custom.test.tsx` — orphan after the modal was deleted.
- _(deleted Layer 8e)_ `src/lib/services/edit-services-dialog.tsx` — Layer 3a-i's POS Jobs-card dialog; unreachable since Layer 8d routed the Jobs card pencil to POS edit mode.
- _(deleted Layer 8e)_ `src/lib/services/__tests__/edit-services-dialog.test.tsx` — orphan after the dialog was deleted.
- `src/app/admin/appointments/components/__tests__/time-input-truncation.test.tsx` — Item 15f Phase 1 Layer 8e — 3 cases pinning the Admin Appointment dialog's HH:MM truncation of legacy seconds-precise `scheduled_*_time` values. Defense-in-depth for the walk-in path's pre-Layer-8e seconds writes.
- `supabase/migrations/20260518000000_truncate_appointment_scheduled_times_to_minute.sql` — Item 15f Phase 1 Layer 8e — idempotent one-time backfill: UPDATE appointments SET scheduled_*_time = date_trunc('minute', ...) WHERE seconds <> 0. Closes the walk-in legacy data drift.
- `src/lib/appointments/__tests__/edit-flow.integration.test.ts` — Item 15f Phase 1 Layer 8f — 14 cases: end-to-end edit-via-POS joins (load → drain → save). Pins source=appointment + source=job (Option G4) happy paths, modifier-only / combined / all-services-removed edits, bogus UUID 404, status guard lockstep (`completed`/`cancelled`/`no_show`), drain↔cascade pricing parity.
- `docs/dev/PHASE_1_TEST_COVERAGE.md` — Item 15f Phase 1 Layer 8f — Phase 1 test coverage matrix. Per-surface × test-type table, intentional gaps with rationale, file-to-test mapping for future maintenance. Updated whenever a Phase 1 contract changes.
- `supabase/migrations/20260518193527_normalize_google_place_id.sql` — Idempotent one-time UPDATE that unwraps the double-encoded `business_settings.google_place_id` JSONB value. Scope: only the `google_place_id` key; WHERE clause matches the exact `"\"...\""` drift pattern.
- `src/lib/utils/__tests__/google-place-id.test.ts` — 26 unit tests for the Place ID normalizer (double-encoded unwrap, URL extraction, quote-strip, trim, validation).
- `src/app/api/admin/cms/homepage-settings/__tests__/place-id-guard.test.ts` — 7 integration tests for the PUT route's google_place_id 400 guard + normalization.

SMS AI v2 Layer 1+2 additions (foundation; no runner + no webhook integration yet):
- `supabase/migrations/20260518215003_add_sms_ai_v2_settings.sql` — Idempotent seed for 3 business_settings keys (kill_switch, enabled_phones, globally_enabled). Safe default state: v2 disabled.
- `src/lib/services/customer-context.ts` — getCustomerContext unified single-call snapshot. Reuses voice-agent/context shape so both call sites converge.
- `src/lib/services/conversation-history.ts` — getConversationHistory small helper used by getCustomerContext + SMS AI v2 runner.
- `src/lib/services/staff-notification.ts` — notifyStaff canonical dispatcher (extracted from voice-agent endpoint body). 7 reason codes including new `human_handoff`.
- `src/app/api/voice-agent/notify-staff/route.ts` — REFACTORED to thin HTTP wrapper around notifyStaff helper. Behavior-preserving.
- `src/app/api/voice-agent/notify-staff/__tests__/route.test.ts` — 8 tests pinning HTTP contract post-refactor (401 / { success: false } on bad input / { success: true } on success, all 6 original reasons + new human_handoff forward-compat).
- `src/app/api/voice-agent/send-quote-sms/__tests__/route.test.ts` — 8 tests pinning Bug A fix (size_class flows from vehicle, not hardcoded). 5 size-class tiers + missing-make fallback + findOrCreateVehicle-null fallback + named regression case `regression: Q-0076 — Tahoe quote uses suv_3row_van tier ($320), not sedan ($210)`.
- `src/app/api/voice-agent/customers/__tests__/route.test.ts` — 23 tests for the `upsert_customer` POST endpoint (Workstream J Session 3): auth gating, missing/placeholder/invalid-phone validation with `instructions_for_agent` payloads, CREATE defaults (sms_consent=true + customer_type='enthusiast' + address_1→address_line_1 + zip_code→zip column mapping), Policy B UPDATE preservation (real names + emails + addresses NOT overwritten; placeholder names + null fields ARE filled; customer_type overwrites each call), sms_consent re-opt-in via `updateSmsConsent` + never-auto-revoke, retroactive conversation linkage with `.is('customer_id', null)` guard, and response-shape invariants.
- `src/lib/sms-ai/feature-flag.ts` — shouldUseSmsAiV2 pure router + loadSmsAiV2Flags reader.
- `src/lib/sms-ai/tools.ts` — 10 declarative Anthropic tool definitions.
- `src/lib/sms-ai/system-prompt.ts` — buildV2SystemPrompt with {CUSTOMER_CONTEXT} placeholder.

SMS AI v2 Layer 3a additions (agent runner core + Anthropic SDK thin client; tool dispatcher body is a stub — replaced by Layer 3b):
- `src/lib/anthropic/client.ts` — MODELS const + lazy-init getAnthropicClient() singleton (Anthropic SDK thin wrapper).
- `src/lib/anthropic/__tests__/client.test.ts` — 3 tests; uses `// @vitest-environment node` because SDK refuses jsdom default.
- `src/lib/sms-ai/agent-runner.ts` — runSmsAiV2Agent() core: caches system prompt, substitutes {CUSTOMER_CONTEXT}, 6-iter tool-use loop, forced tools-omitted final on cap, APIError handling.
- `src/lib/sms-ai/tool-dispatcher.ts` — STUB returning isError:true for every call. Layer 3b replaces this body; public signature is the contract.
- `src/lib/sms-ai/__tests__/agent-runner.test.ts` — 9 tests establishing the first Anthropic-SDK mock pattern in the codebase.
- `src/lib/sms-ai/__tests__/tool-dispatcher.test.ts` — 1 test pinning the stub contract.
- `package.json` — adds `@anthropic-ai/sdk` ^0.97.1 to `dependencies`.

SMS AI v2 Layer 3b additions (tool dispatcher real routing + parallel agent dispatch — Layer 3 COMPLETE):
- `src/lib/sms-ai/tool-dispatcher.ts` — full body replacement. 9 HTTP-wrapped tools via shared voiceAgentFetch + per-tool timeouts (5s read/classify | 10s SLOW); notify_staff in-process. NEW export `__resetForAgentRun()` for per-inbound Bearer-key cache reset.
- `src/lib/sms-ai/agent-runner.ts` — serial dispatch loop replaced with Promise.all parallel dispatch; original-order tool_result reassembly; calls __resetForAgentRun() at start of every inbound.
- `src/lib/sms-ai/__tests__/tool-dispatcher.test.ts` — expanded 1 → 28 cases (per-tool routing, timeouts, HTTP/in-process failures, key-load failures, cache lifecycle).
- `src/lib/sms-ai/__tests__/agent-runner.test.ts` — 4 new cases (parallel concurrency, mixed success+failure, notify_staff forwarding, dispatcher reset).

Item 15g Layer 15g-iii (UI surfacing + checkout hydration for modifiers) additions:
- `src/components/appointments/modifier-summary.tsx` — Shared `<ModifierSummary variant="admin|pos">` + `hasAppliedModifiers()` helper. Read-only summary of coupon / loyalty / manual discount on appointment-derived surfaces. Mounted on Admin Appointment dialog + Jobs card Services tile.
- `src/components/appointments/__tests__/modifier-summary.test.tsx` — 12 cases covering both the helper truth table + the component's conditional rendering per modifier type + POS dark-mode variant.
- `src/components/appointments/un-materialize-confirmation-dialog.tsx` — Item 15e Phase 2C-β-1: shared `<UnMaterializeConfirmationDialog>` reused by BOTH admin + POS surfaces. `context: 'admin'|'pos'` selects endpoint URL + auth wrapper (adminFetch vs posFetch). Dry-run preview on open → deletion enumeration (photos/addons/timer/intake) or block (payment/terminal); exact "DELETE" type-to-confirm for in_progress/pending_approval; execute re-POSTs to the un-materialize endpoint; no webhook; dark-aware. Mounted by the admin Save intercept + POS "Revert to Pending" button in Phase 2C-β-2.
- `src/components/appointments/__tests__/un-materialize-confirmation-dialog.test.tsx` — 7 cases: dry-run-on-open per context (endpoint + wrapper), enumeration accuracy, free-zone Revert executes with confirmString=DELETE, confirm-required gating (wrong-case stays disabled), payment-block hides Revert.
- `src/app/admin/appointments/components/__tests__/appointment-detail-dialog-unmaterialize.test.tsx` — Item 15e Phase 2C-β-2: 5 cases for the admin Save un-materialize intercept (revert+active-job→modal opens & onSave NOT called; revert+no-active-job→normal save; later-state→normal save; unchanged→normal save; cancelled→cancel short-circuit). Heavy children (modal, EditMobileModal, ModifierSummary, PaymentMismatchBanner) mocked; isolates the 3-condition intercept decision.
- `src/app/admin/appointments/components/__tests__/appointment-detail-dialog-can-update-status.test.tsx` — Session 1.3: 6 cases for the `canUpdateStatus` prop (default-true editable, explicit-true editable, false→read-only block, false→Save Changes still visible, false+readOnly compose orthogonally, true+readOnly→readOnly dominates). Closes parity audit b346d34b Target B.12.
- `src/app/__tests__/admin-pos-dialog-parity.test.tsx` — Session 1.3: 7-case structural parity guard on the `<AppointmentDetailDialog>` mount in admin/appointments/page.tsx (canonical full-perms mount) vs pos/jobs/components/job-queue.tsx. Source-parsing test mirroring `src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx`; string-literal-aware extractor; documented host-divergence allowlist (`hostContext`, `returnToPath`); regression nets for `canUpdateStatus`, no-readOnly canonical, no-op handler shape. Closes parity audit b346d34b Concern 1.

---

## Migrations (`supabase/migrations/`)

```
20260201000001_create_enums.sql
20260201000002_create_employees.sql
20260201000003_create_customers.sql
20260201000004_create_vehicles.sql
20260201000005_create_vendors.sql
20260201000006_create_product_categories.sql
20260201000007_create_products.sql
20260201000008_create_service_categories.sql
20260201000009_create_services.sql
20260201000010_create_service_pricing.sql
20260201000011_create_service_addon_suggestions.sql
20260201000012_create_service_prerequisites.sql
20260201000013_create_mobile_zones.sql
20260201000014_create_packages.sql
20260201000015_create_appointments.sql
20260201000016_create_transactions.sql
20260201000017_create_transaction_items.sql
20260201000018_create_payments.sql
20260201000019_create_refunds.sql
20260201000020_create_coupons.sql
20260201000021_create_loyalty_ledger.sql
20260201000022_create_campaigns.sql
20260201000023_create_lifecycle_rules.sql
20260201000024_create_marketing_consent_log.sql
20260201000025_create_sms_conversations.sql
20260201000026_create_quotes.sql
20260201000027_create_photos.sql
20260201000028_create_time_records.sql
20260201000029_create_purchase_orders.sql
20260201000030_create_po_items.sql
20260201000031_create_feature_flags.sql
20260201000032_create_permissions.sql
20260201000033_create_audit_log.sql
20260201000034_create_business_settings.sql
20260201000035_rls_policies.sql
20260201000036_create_indexes.sql
20260201000037_create_functions_triggers.sql
20260201000038_public_seo_setup.sql
20260201000039_seed_services.sql
20260201000040_booking_setup.sql
20260201000041_customer_portal_rls.sql
20260201000042_create_cash_drawers.sql
20260201000043_create_customer_payment_methods.sql
20260201000044_add_check_payment_method.sql
20260203000001_create_waitlist_entries.sql
20260203000002_create_employee_schedules.sql
20260203000003_create_blocked_dates.sql
20260203000004_add_quotes_access_token.sql
20260203000005_add_voice_agent_api_key.sql
20260203000006_expand_webhook_events.sql
20260203000007_enhance_coupons.sql
20260203000008_coupon_draft_status.sql
20260203000009_multi_product_conditions.sql
20260203000010_coupon_max_visits.sql
20260203000011_create_campaign_recipients.sql
20260204000001_customer_type_and_promotions.sql
20260204000002_rename_detailer_to_professional.sql
20260205125428_pending_schema_updates.sql
20260205214638_booking_payment_options.sql
20260205222803_coupon_rewards_rls.sql
20260206000001_create_quote_communications.sql
20260206000002_quote_access_token_to_text.sql
20260206000003_quotes_customer_nullable.sql
20260207000001_unique_pin_code.sql
20260207000002_quotes_soft_delete.sql
20260208000001_transaction_stats_rpc.sql
20260209000001_find_duplicate_customers.sql
20260209000002_merge_customers.sql
20260209000003_merge_customers_security_definer.sql
20260209000004_fix_merge_entry_type.sql
20260209000005_merge_customers_preserve_data.sql
20260209000006_fix_merge_loyalty_columns.sql
20260209000007_fix_merge_delete_safety.sql
20260209000008_short_links.sql
20260209000009_service_image_url.sql
20260209000010_fix_payment_method_percentage.sql
20260209000011_create_messaging_tables.sql
20260209000012_conversation_lifecycle_cron.sql
20260209000013_ai_audience_settings.sql
20260209000014_add_message_to_quote_communications.sql
20260209000015_lifecycle_executions_and_review_settings.sql
20260209000016_seed_google_review_rules.sql
20260210000001_fix_review_seed_templates.sql
20260210000002_add_coupon_id_to_lifecycle_rules.sql
20260210000003_sms_consent_log.sql
20260210000004_add_customer_portal_consent_source.sql
20260210000005_sms_delivery_tracking.sql
20260210000006_link_clicks.sql
20260210000007_email_delivery_log.sql
20260210000008_campaign_variants_and_attribution.sql
20260210000009_campaigns_ab_fields.sql
20260210000010_add_variant_id_to_tracking.sql
20260210000011_qbo_integration_schema.sql
20260210000012_remove_qbo_feature_flag.sql
20260210000013_qbo_restore_feature_flag_remove_credentials.sql
20260211000001_update_marketing_flag_descriptions.sql
20260211000002_feature_flag_categories_cleanup.sql
20260211000003_update_two_way_sms_description.sql
20260211000004_inventory_phase6_session1.sql
20260211000005_purchase_orders_stock_adjustments.sql
20260211000006_notification_recipients.sql
20260211000007_roles_permissions_foundation.sql
20260211000008_route_access.sql
20260211000009_permissions_rls.sql
20260211000010_product_images.sql
20260212000001_qbo_sync_source.sql
20260212000002_qbo_realtime_sync.sql
20260212000003_phase8_jobs_schema.sql
20260212000004_job_photos_storage.sql
20260212000005_add_gallery_token.sql
20260212000006_jobs_cancellation_columns.sql
20260212000007_consolidate_job_permissions.sql
20260212000008_jobs_unique_appointment_id.sql
20260212000009_jobs_add_quote_id.sql
20260212000010_add_coupon_code_to_quotes.sql
20260212000011_addon_issue_type.sql
20260213000001_fix_settings_rls.sql
20260214000001_cms_hero_carousel.sql
20260214000002_cms_tickers.sql
20260214000003_cms_ads.sql
20260214000004_cms_themes.sql
20260214000005_cms_catalog_controls.sql
20260214000006_cms_feature_flags.sql
20260214000007_cms_storage.sql
20260214000008_cms_permissions.sql
20260214000009_seo_engine.sql
20260214000010_page_content_blocks.sql
20260216000001_page_navigation_management.sql
20260216000002_fix_pages_permission.sql
20260216000003_site_theme_settings.sql
20260217000001_orders.sql
20260217000002_shipping_settings.sql
20260217000003_product_shipping_dimensions.sql
20260217000004_orders_shipping_columns.sql
20260217000005_order_events.sql
20260217000006_order_permissions_fix.sql
20260217000007_fix_order_number_prefix.sql
20260217000008_order_checkout_fixes.sql
20260219000001_ticker_scroll_speed_value.sql
20260219000002_footer_sections.sql
20260219000003_footer_business_info_type.sql
20260219000004_footer_brand_column.sql
20260219000005_hero_slide_colors.sql
20260219000006_footer_unique_constraints.sql
20260219000007_idempotency_keys.sql
20260219000008_ticker_section_position_text.sql
20260219000009_sale_pricing.sql
20260220000001_transactions_offline_id.sql
20260222000001_coupon_summary.sql
20260222000002_create_audit_log.sql
20260222000003_fix_audit_log_schema.sql
20260222000004_customer_phone_email_unique.sql
20260223000001_create_vehicle_makes.sql
20260224000001_vehicle_category_expansion.sql
20260224000002_create_vehicle_categories.sql
20260224000003_merge_express_signature_categories.sql
20260225000001_cleanup_category_merge.sql
20260225000002_seed_addon_suggestions.sql
20260226000001_expand_block_type_constraint.sql
20260227000001_create_team_members.sql
20260227000002_cleanup_migrated_settings.sql
20260227000003_team_member_excerpt.sql
20260227000004_create_credentials.sql
20260228000001_page_preview_tokens.sql
20260228000002_create_page_revisions.sql
20260228000003_homepage_settings.sql
20260228000004_global_blocks.sql
20260228000005_seo_business_settings.sql
20260228000006_homepage_settings_expansion.sql
20260228000007_og_image_setting.sql
20260301000001_ticker_message_gap.sql
20260301000002_drop_orphaned_photos_table.sql
20260301000003_add_job_photos_tags.sql
20260303000001_email_template_system.sql
20260303000002_seed_email_templates.sql
20260304000001_email_template_rls_policies.sql
20260311000001_add_transaction_access_token.sql
20260312000001_add_transaction_items_pricing_fields.sql
20260312000002_add_products_barcode_index.sql
20260314000001_rename_override_pricing_to_discount_override.sql
20260314000002_update_manual_discounts_description.sql
20260314000003_add_transaction_items_is_addon.sql
20260314000004_add_pos_override_prerequisites_permission.sql
20260314000005_add_transaction_items_prerequisite_note.sql
20260316000001_feature_flags_anon_select_policy.sql
20260317000001_add_services_sale_price.sql
20260317000002_sale_history.sql
20260322000001_add_missing_permission_definitions.sql
20260323000001_create_print_jobs.sql
20260324000001_move_photo_gallery_to_operations.sql
20260324000002_conversation_summaries.sql
20260324000003_cross_channel_bridge.sql
20260325000001_voice_call_log.sql
20260327000001_sms_template_system.sql
20260329000001_sms_template_variable_audit.sql
20260329000002_jobs_appointment_id_unique_constraint.sql
20260330000001_system_sms_logging.sql
20260330000002_quote_items_sale_columns.sql
20260330000003_vehicles_unique_constraint.sql
20260331000001_email_prompt_dismissed.sql
20260331000002_email_verification_system.sql
20260401000001_clean_unknown_vehicle_fields.sql
20260402000001_fix_cancellation_email_template_vars.sql
20260403000001_product_specs_and_variant_grouping.sql
20260404000001_product_enrichment_system.sql
20260404000002_enrichment_drafts_rls_and_cleanup.sql
20260404000003_enrichment_batches_table.sql
20260404000004_backfill_og_images.sql
20260410000001_staff_notification_sms_template.sql
20260417000001_vehicle_exotic_classic_flags.sql
20260417000002_service_exotic_classic_floor_prices.sql
20260418000001_drop_service_floor_price_columns.sql
20260418000002_extend_vehicle_size_class_enum.sql
20260418000003_backfill_and_drop_specialty_flags.sql
20260420000001_extend_stock_adjustments.sql
20260421000001_add_vendor_reorder_fields.sql
20260421000002_create_stock_counts.sql
20260422000001_drop_idx_customers_search.sql
20260424000001_revert_stock_count.sql
20260424000002_revert_stock_count_structured_errors.sql
20260424000003_void_transaction_rpc.sql
20260424000004_extend_stock_adjustments_for_orders.sql
20260425000003_universal_palette_contracts.sql
20260425000004_align_detailer_variables.sql
20260425000005_drop_detailer_first_name_from_variables.sql
20260427000001_appointment_confirmed_service_total_optional.sql
20260427000002_appointment_confirmed_body_split_lines.sql
20260427000003_cheap_add_wave_optional_chips.sql
20260427000004_drop_sms_templates_variables_column.sql
20260427000005_demote_business_chips_to_optional.sql
20260427000006_seed_specialty_sub_slugs.sql
20260428000001_seed_3a_chip_driven_slugs.sql
20260428000002_seed_3b_chip_driven_slugs.sql
20260428000003_seed_3c_chip_driven_slugs.sql
20260428000004_voice_call_log_retry_state.sql
20260428000005_lifecycle_executions_job_id_and_review_cleanup.sql
20260429000001_seed_3d_receipt_sms_chip_driven.sql
20260430000001_rfb2_drop_birthday_and_expand_lifecycle.sql
20260502194628_add_appointment_payment_link.sql
20260502203149_add_payment_link_sent_templates.sql
20260502224451_add_cash_tendered_to_payments.sql
20260503024921_add_refunds_notes.sql
20260503160000_add_payment_link_amount_cents.sql
20260503181924_add_pos_walkin_consent_source.sql
20260510000001_add_digital_payment_enum_value.sql     # Phase 1A.5: extend payment_method enum with 'digital'
20260510000002_add_digital_platform_column.sql        # Phase 1A.5: payments.digital_platform column + biconditional CHECK + partial index
20260511000001_add_mobile_fee_item_type.sql           # Mobile fix D2: extend transaction_item_type enum with 'mobile_fee'
20260511000002_add_mobile_zone_snapshot_and_quote_mobile.sql # Mobile fix D2: appointments.mobile_zone_name_snapshot + quotes mobile_* columns + consistency CHECKs
20260512152847_quote_communications_delivery_tracking.sql    # Phase Messaging-1+2: twilio_sid column + 3-status enum (sent/failed/blocked) on quote_communications
20260513022648_phone_normalization_phase_1.sql               # Phase Normalization-1: backfill 3 employees + 1 business_settings + 38 sms_delivery_log + ALTER employees ADD CONSTRAINT valid_phone
20260513050241_phone_schema_hardening.sql                    # Phase Schema-Hardening-1: 4 new E.164 CHECK constraints (conversations.phone_number, sms_delivery_log.to_phone, sms_conversations.phone_number, sms_consent_log.phone) + retroactive idempotent capture of quote_communications.valid_sent_to (channel-aware Option B)
20260514051953_unify_2_inventory_family_to_cents.sql         # Phase Money-Unify-2: ADD COLUMN unit_cost_cents on purchase_order_items + stock_adjustments; ADD COLUMN min_order_amount_cents on vendors; DROP NOT NULL on purchase_order_items.unit_cost; backfill ROUND × 100; CHECK >= 0; CREATE OR REPLACE FUNCTION void_transaction() writes unit_cost_cents (with TODO Unify-D)
20260517021350_lifecycle_persistence.sql                     # Item 15g Layer 15g-ii: lifecycle persistence schema — ADD COLUMN appointments.{loyalty_points_redeemed,loyalty_discount,manual_discount_value,manual_discount_label} + quotes.{coupon_discount,loyalty_points_to_redeem,loyalty_discount,manual_discount_type,manual_discount_value,manual_discount_label} + 3 CHECK constraints (appointments_manual_discount_coherent, quotes_manual_discount_coherent, quotes_loyalty_coherent). All additive + non-breaking.
20260526182120_appointment_services_add_quantity.sql         # D48 (CLOSES Issue 42): ADD COLUMN appointment_services.quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0) + COMMENT. Mirrors quote_items.quantity + transaction_items.quantity. Operator-locked backfill = DEFAULT 1 only (no retroactive UPDATE). Closes the schema gap that flattened multi-quantity quotes to qty=1 at the 4 D46 appointment-derived surfaces.
```

## Scripts

```
scripts/capture-receipt-baselines.ts        # Phase 0b.1: regenerates 12-scenario HTML+thermal fixtures
scripts/diff-receipt-renders.ts             # Phase 0b.2: byte-diff harness for production transactions; user runs locally
scripts/import-square-data.mjs
scripts/regen-db-schema.ts
scripts/regen-sms-contracts.ts              # Codegen: SMS palette + per-slug typed contracts (Session 2A.5)
scripts/seed-admin.ts
scripts/seed-data.ts
scripts/seed-receipt-test-transactions.sql  # Phase 0b.1: receipt-test seed scaffolding (NOT executed; for Phase 0b.2 byte-diff harness)
scripts/fix-zelle-misclassification.sql     # Phase 1A.5: one-off SQL fix template for the Zelle-mismarked-as-Cash transaction (NOT executed)
scripts/fix-mobile-backfill.sql             # Mobile fix D2: backfill template for SD-006253 + SD-006278 (NOT executed; operator runs manually post-deploy)
scripts/deploy/deploy-smartdetails.sh       # Session #113: canonical version-controlled VPS deploy script (was unversioned at /usr/local/bin/deploy-smartdetails). Hardened 2026-05-28 — diagnosable npm ci (tee + ${PIPESTATUS[0]}, no --silent), retry-once on transient failure, honest probability-ordered fail message, rm -rf .next before build, timestamped phase log. Preserves GUARD 1-4 + 9 steps + exit codes 0-5. Executable (100755). /usr/local/bin/deploy-smartdetails becomes a symlink to this.
scripts/deploy/README.md                    # Session #113: deploy script docs — what it does, exit codes, guards, H1-H5 hardening, one-time VPS symlink-from-repo migration steps, how to update later.
```

## Config

```
vitest.config.ts
eslint.config.mjs
```

---

## ESLint — Custom Rules (`eslint-rules/`)

```
eslint-rules/phone-no-raw-display.js                       # Phase Lint-Hardening-1: flags raw {customer.phone} in JSX without formatPhone() wrapper
eslint-rules/__tests__/phone-no-raw-display.test.js        # 23 RuleTester cases (10 valid, 13 invalid) — vitest picks up via include
eslint-rules/money-no-unsuffixed-money-prop.js             # Phase Money-Unify-1: flags cents-typed values bound to identifiers lacking Cents/_cents suffix
eslint-rules/__tests__/money-no-unsuffixed-money-prop.test.js  # 21 RuleTester cases (14 valid, 7 invalid)
eslint-rules/services-no-bespoke-pricing.js                # Item 15f Layer 4: enforces CLAUDE.md Rule 22 — 3 signals (function-name pattern, switch-over-pricing_model w/o engine call, direct vehicle_size_*_price reads). Ships at 'error'.
eslint-rules/__tests__/services-no-bespoke-pricing.test.js # 19 RuleTester cases (10 valid, 9 invalid)
```

Item 15f Layer 4 additions / changes (4 bespoke-pricer migrations + helper extraction):
- New: `src/app/api/book/_pricing.ts` — `computeExpectedPrice` extracted from `route.ts` (Next.js route files only permit GET/POST/etc. exports; underscore prefix excludes from route resolution).
- New: `src/app/api/book/__tests__/compute-expected-price.test.ts` — 12 cases pinning canonical-engine routing.
- Modified: `src/app/api/book/route.ts` — imports `computeExpectedPrice` from `./_pricing`.
- Modified: `src/components/booking/booking-wizard.tsx` — `reconstructConfig` migrated to canonical engine.
- Modified: `src/components/public/service-card.tsx` — `getStartingPrice` migrated to canonical engine.
- Modified: `src/app/api/voice-agent/services/route.ts` — pricing array builder migrated; SELECT widened to fetch full ServicePricing.
- Modified: `src/components/appointments/edit-services-modal.tsx` — single sanctioned `// eslint-disable-next-line services/no-bespoke-pricing` comment above the dead-code `resolveServicePrice`. **Deleted in Phase 1 Layer 8e (2026-05-17)** — eslint-disable comment went with it. Codebase-wide `eslint-disable.*services/no-bespoke-pricing` count is now 0.
- Modified: `src/app/admin/appointments/components/appointment-detail-dialog.tsx` — Admin "Edit Services" button disabled (deletion-window safety).
- New: `src/app/admin/appointments/components/__tests__/edit-services-disabled.test.tsx` — 2 cases pinning the disabled button + no-modal-mount.
- Modified: `CLAUDE.md` Rule 22 — updated to reflect rule is now `'error'`-enforced.
- Modified: `eslint.config.mjs` — registered `services/no-bespoke-pricing` under the `services` plugin namespace.

---

## Docs (`docs/`)

```
docs/CHANGELOG.md
docs/adr/                                              # Architecture Decision Records (Phase ADR-1)
docs/adr/README.md                                     # Index + when-to-write criteria + how-to
docs/adr/_template.md                                  # Canonical ADR template (≤800 words, 6 sections)
docs/adr/0001-canonical-form-pattern.md                # Meta-pattern: storage canonical + wire canonical + display formatted + input formatted
docs/adr/0002-phone-format-integrity.md                # 5-layer defense for phones — application of ADR-0001
docs/adr/0003-money-math-via-integer-cents.md          # Integer-cents arithmetic + 4 invariants — application of ADR-0001
docs/adr/0004-receipt-four-surface-synchronization.md  # Thermal + HTML print + public page + email update together
docs/adr/0005-timezone-policy-pacific.md               # America/Los_Angeles everywhere; never UTC at the app layer
docs/dev/ARCHITECTURE.md
docs/dev/DB_SCHEMA.md          # Full database schema reference (70+ tables)
docs/dev/CONVENTIONS.md
docs/dev/DASHBOARD_RULES.md
docs/dev/DATA_MIGRATION_RULES.md
docs/dev/DESIGN_SYSTEM.md
docs/dev/FILE_TREE.md          ← this file
docs/dev/PHONE_LINT.md       # Phase Lint-Hardening-1: phone/no-raw-display rule rationale, scope, opt-out, severity-upgrade plan
docs/dev/MONEY.md            # Phase Money-Unify-1: canonical money model, helper API, naming convention, money/no-unsuffixed-money-prop rule, cross-system sync points (Stripe min DB CHECK + REDEEM_RATE float/int duality)
docs/dev/POS_SECURITY.md
docs/dev/TROUBLESHOOTING.md
docs/dev/QBO_INTEGRATION.md
docs/dev/SERVICE_CATALOG.md
docs/dev/PUBLIC_BOOKING_NAV_AND_OPTION_WIRING_AUDIT.md  # Audit (read-only, 2026-05-30, Unit B): three concerns on the public booking flow on the same branch. (A) Navigation per step — operator's "no way back from Step 2" CONFIRMED: explicit Back button missing on Step 2 only (Step 3/4 have one + edit-from-summary pencils); step-indicator dot is the lone back affordance and is easy to miss. URL state + state preservation work. (B) Admin-option wiring matrix across 13+ service columns: ✅ `online_bookable`/`is_active`/`vehicle_compatibility`/`pricing_model`/sale window/`display_order`/duration/image/category honored end-to-end; ⚠️ `mobile_eligible` client-only (no server defense); ❌ `staff_assessed` DEAD (zero references in booking flow); ❌ `is_taxable` DEAD on booking deposits (hardcoded false at api/book/route.ts:492/511/537); ❌ `classification` rule "only primary on Step 2" UNENFORCED — wizard.tsx:684 filters only by vehicle_compatibility; ❌ `service_prerequisites` and `special_requirements` not surfaced publicly. (C) `pricing_model` immutability rationale retrieval: CATALOG_CRUD_WIRING_AUDIT.md gives NO rationale — flags it Informational + punts to operator (Q4); behavior verified at [id]/page.tsx:504-520 (omitted from update payload); not surfaced in UI. Severity: 1 Significant nav (N1) + 1 Significant rule-unenforced (W1) + 1 Significant dead-flag (W3) + 4 Moderate (W2/W4/W5/W6) + 1 Minor (W7) + 5 sibling findings (E1-E9 incl. browser back uses replaceState not pushState). Recommended fix arc: 3-5 small Memory#8-safe sessions + 4 operator decisions.
docs/dev/PREREQ_SERVICE_DROPDOWN_AUDIT.md            # Audit + in-session fix (2026-05-29, Session #123): Admin Services Edit prereq-service dropdown greyed out in edit mode. Classification (a) half-built convention — `disabled={!!editingPrereq}` at `page.tsx:1807` (paired with `(editingPrereq ? allServices : prereqEligibleServices)` at `:1810`) traces to the initial bulk Phase 1 commit `846ece126` with no comment. Schema permits the UPDATE (PK `id`, UNIQUE `(service_id, prerequisite_service_id)`, CHECK self-ref; zero FKs reference `service_prerequisites.id`; runtime queries only by parent `service_id`); `savePrereq()` already includes `prerequisite_service_id` in the UPDATE payload (`:912/921`). Fix landed: removed disable, new `prereq-helpers.ts::getEditPrereqOptions`, wired `describeSupabaseError`; 5 unit tests; +5 → 2625. Surfaced (intentionally NOT in scope): sibling gap at add-on edit dropdown `:1708` (identical pattern, same bulk commit — recommend sibling session); pre-existing latent parent-self filter gap. Add+delete confirmed working today.
docs/dev/SALE_VS_QUOTES_PARITY_SWEEP.md              # Sweep (read-only, 2026-05-28, Session #118): enumerates ALL Sale-vs-Quotes shared-component parity gaps in one pass (fifth artifact today; prior four each found one). 7 components mounted in both panels (ticket-panel.tsx / quotes/quote-ticket-panel.tsx); CustomerVehicleSummary alone has 3 prop deltas. Gaps: G1 pill onCustomerTypeChanged (Critical, IN-FLIGHT), G2 vehicle-edit unreachable — onEditVehicle + editVehicle omitted (Significant), G3 reprice-failure fully silent — no panel toast + no quote-item-row badge though quote-reducer sets the flag :393-423 (Significant), G4 CustomerTypePrompt never shown in Quotes (Significant), G5 quote-browse prereq wrong-context (Significant, prior audit #3), G6 no swipe-undo (Minor). Target 3: none of the 7 panel-mounted shared components read useTicket() (context-clean) — only catalog-browser (mounted by quote-builder) is wrong-context. Target 5: reducers at functional parity; SET_CUSTOMER/SET_VEHICLE identical both sides → G1-G4 need NO reducer change. Fix-arc: Track A = useValidatedServiceAdd helper (G5 + add-on gating + register-tab); Track B = one Quotes-panel-parity session (G1 in-flight, +G2/G3/G4, opt G6) in quote-ticket-panel + customer-vehicle-summary wiring + quote-item-row + vehicle-create-dialog. Add structural guard test asserting both panels pass the same prop set per shared component.
docs/dev/POS_CUSTOMER_TYPE_PILL_PARITY_AUDIT.md      # Audit (read-only, 2026-05-28, Session #117): customer-type pill Sale-vs-Quotes parity + persistence. Pill cycles in Sale, shows "Customer type cleared" in Quotes. Root cause = MISSING PROP (classification (c) half-built): shared CustomerTypeBadge (via CustomerVehicleSummary) PATCHes the record then calls onTypeChanged so the host syncs local state; Sale wires onCustomerTypeChanged (ticket-panel.tsx:413→:357-360 SET_CUSTOMER), Quotes omits it (quote-ticket-panel.tsx:830-840) → stale local state → tap repeats one transition. Persistence: YES both surfaces (PATCH /api/pos/customers/[id]/type → customers.customer_type + audit; GLOBAL permanent change, not quote-scoped). Fix: ~3 lines mirroring Sale (quote-reducer.ts:361 already handles SET_CUSTOMER). Bundle with Quotes-parity fix as independent commit (not the shared add-with-validation helper).
docs/dev/POS_SALE_VS_QUOTES_PARITY_AUDIT.md          # Audit (read-only, 2026-05-28, Session #116): Sale-vs-Quotes prereq + add-on gating parity. Corrects #115's overgeneralization — Quotes DO check prereqs in all add paths (quote-builder.tsx, since 2026-03-14). Real defect is context not absence: quote BROWSE view delegates to <CatalogBrowser> whose check is hardwired to the SALE-ticket context (catalog-browser.tsx:76-80 useTicket()), not the quote; quote search/picker use correct quote context (quote-builder.tsx:221-225). Surface matrix: Sale/catalog-browser ✓, Sale/register-tab favorites ✗ (no check), Quotes search/picker ✓, Quotes browse ⚠ wrong-context. Rec: one shared add-with-validation helper (addon-gate → prereq-check → dispatch) for Sale + Quotes + register-tab (Rule 11/22). Hook is surface-agnostic (use-prerequisite-check.ts:28-32). Fix is a separate session.
docs/dev/POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md  # Audit (read-only, 2026-05-28, Session #115): root-causes 3 post-#114 issues. Verdict: #114 (POS prereq size-aware pricing) caused NONE of them — all pre-existing gaps surfaced by creating/testing the new addon_only "Paint Correction Prep". (1) create-flow only writes 3 vehicle_size tiers — no exotic/classic (new/page.tsx:231-237); (2) add-on-only gating NEVER built (no classification check in any POS add path); (3) prereq enforcement: register-tab.tsx has ZERO prereq handling in any path (favorites + picker dispatch ADD_SERVICE directly), unchanged by #114; catalog-browser/ServiceDetailDialog DO check; client fails open (use-prerequisite-check.ts:77-78,109-110). Recommendation: FIX-FORWARD (revert reintroduces the wanted $75→$110 fix and fixes nothing).
docs/dev/CATALOG_CRUD_WIRING_AUDIT.md           # Audit (read-only, 2026-05-27): root-causes the operator's "Failed to create service" — the Add-New-Service form inserts via the browser Supabase client but omits NOT-NULL `services.slug` (no slug in `serviceCreateSchema`, no slug input/auto-gen) → every insert hits a 23502 NOT-NULL violation, masked by a generic toast; products create works because it generates+inserts slug. RLS (services_write=is_employee()) + permissions (services.edit granted to admin/super_admin) ruled out via live DB. Full CRUD wiring matrices (services/products/tiers/add-ons/categories), severity table (1 Critical / 3 Significant / 5 Minor), remediation sequence. Integrity sweep clean.
docs/dev/LIFECYCLE_AUDIT_2026-05-15.md          # Lifecycle audit — Quote → Appointment → Job → Transaction surface map (data model, state transitions, POS×Admin matrix, permissions, gap inventory)
docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md  # Audit: viability of generalizing quote → POS edit pattern to appointment/job service edits (Item 15f Layer 3a-i follow-up; recommendation to revert Layer 3a-i and route service edits through POS Sale tab)
docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md  # Audit: discount/coupon/loyalty persistence across Quote → Appointment → Job → Transaction; identifies schema gaps (quotes/jobs missing columns) + logic gaps (convertQuote drops coupon_code despite column existing; checkout-items doesn't read appointment.coupon_code); recommendation for future Item 15g (~5 sessions full fix, ~0.5 session MVP)
docs/dev/LOYALTY_REVERSIBILITY_AUDIT_2026-05-17.md  # Audit (read-only): trace of all 8 customers.loyalty_points_balance writers + refund-path restoration. Finding: pre-transaction loyalty edits do NOT need balance mutation (snapshot-only design per Lifecycle §9.5). Recommends Option A1 — ship loyalty/coupon/manual_discount editability in Phase 1 Layer 8c at ~0.25 session backend extension; no refund-helper extraction needed.
docs/dev/APPOINTMENT_JOB_STATUS_FLOW_AUDIT_2026-05-17.md  # Audit (read-only): full inventory of appointments.status + jobs.status writers (8 + 7 paths), state machines, cross-table divergence. Finding: columns are orthogonal by design; UAT-observed appt=in_progress+job=scheduled is normal walk-in pattern from pos/jobs/route.ts:387. F1 whitelist refinement for Phase 1 Layer 8d-bis: refuse {completed, cancelled, no_show}. The user's "in_progress blocked" report is unverified — current load endpoint allows in_progress; recommends UAT reproduction before code change.
docs/dev/QUOTE_TOTAL_AND_RECEIPT_AUDIT_2026-05-16.md  # Audit: quotes.total_amount is persisted as pre-discount (subtotal + tax) but every UI/SMS/email/PDF/admin consumer treats it as final amount; convert-service is the only correctly-defensive reader. Plus: 4 quote-receipt surfaces (SMS body, public landing, email HTML, PDF) all render Subtotal/Tax/Total with no modifier line items. Recommends Layer 15g-v: writer fix + receipt modifier rendering. ~1-1.5 sessions, no schema migration. Lands before Phase 1.
docs/dev/ITEM_15E_PHASE_2_REUSE_VERIFICATION.md  # Audit (read-only): feasibility of reusing the admin AppointmentDetailDialog in POS Jobs Schedule scope (Item 15e Phase 2). Verdict reuse-with-moderate-adjustments. Findings: admin PATCH /api/appointments/[id] uses cookie Supabase auth → POS (HMAC) 401s, not reusable; POS lacks a status-change + notes endpoint (recommend one combined PATCH /api/pos/appointments/[id]); no role-defaults migration needed; Phase 1B Schedule scope already overrides the viewMode toggle; only 1 of 20 dialog imports admin-coupled; dark-mode + 3 hardcoded-assumption parameterizations are the mechanical cost; change-time-button.tsx is the mount template. Est ~3–4.5h. 3 open operator decisions.
docs/dev/ITEM_15E_PHASE_2_STATUS_SYNC_AUDIT.md  # Audit (read-only): why appointment.status edits don't propagate to jobs.status (surfaced in Phase 2B testing) + un-materialize scope. Live-DB scan: divergence is systemic (6/7 non-terminal jobs diverge, incl. cancelled→scheduled + completed→scheduled). Only existing sync edge = POS job-cancel → appointment-cancel (cancel/route.ts:145-154). Enums not 1:1 (lossy/directional). Option B (hard-delete jobs) feasible: job_photos/job_addons CASCADE but Storage objects orphan + transaction_id (SET NULL out) survives unlinked → block when transaction set. Re-materialization invariant: un-materialize must revert appointment.status='pending' atomically (populate dedups on UNIQUE appointment_id). Runtime appointments.cancel granted to ALL roles (≠ seed). 3 paths (A narrow / B full sync / C phased); recommends Path C (Phase 2C un-materialize + Item 15h sync). 10 open operator decisions.
docs/dev/SMS_AI_V2_PROMPT_OBSERVATIONS.md  # SMS AI v2 prompt observations — source of truth for behavioral observations from the 2026-05-20+ allowlist phase. Six-section structure: locked design decisions (vehicle rendering format, Mexican Spanish, channel='sms' invariant, no-negotiation, sparing-emoji); confirmed prompt-tuning issues with verbatim evidence + severity + proposed fix direction; non-prompt critical bugs (e.g. Bug A wrong-tier pricing); pre-emptive flags not yet tested; resolved (placeholder); process notes. Feeds the future batched prompt-tuning session as its input.
docs/sessions/receipt-unification-phase-0b-2.md   # Phase 0b.2: byte-diff harness operator runbook + 10-scenario SQL queries
docs/sessions/receipt-unification-phase-1a.md     # Phase 1A: visual UX changes (Total Paid, Paid in Full ✓, deposit chrome retired, payment timestamps)
docs/sessions/receipt-unification-phase-1a-5.md   # Phase 1A.5: digital payment types (Zelle/Venmo/AppleCash/Other) + Stripe webhook brand/last4 capture
docs/sessions/receipt-unification-phase-1a-followup.md  # Phase 1A-followup: admin filter stale-closure fix, legacy Paid-in-Full fallback, thermal middle-dot CP437 0xFA
docs/sessions/receipt-unification-phase-1a-followup-2.md  # Phase 1A-followup-2: thermal ✓ via CP437 0xFB + admin search bypasses all filters + PAID_IN_FULL consolidated
docs/sessions/mobile-fee-1-1-address-handling.md  # Phase Mobile-1.1: address pre-fill + X clear + mandatory validation + save-to-customer (Option X+)
docs/sessions/mobile-fee-1-2-uat-fixes.md         # Phase Mobile-1.2: UAT bug fixes — error wording, customer-swap clear, zone vs Custom-path error distinction
docs/sessions/mobile-fee-1-3-prefill-state-recovery.md  # Phase Mobile-1.3: addressWasAutoPrefilled flag recovery on mount (loaded-quote scenario)
docs/sessions/mobile-fee-1-4-parser-improvements.md  # Phase Mobile-1.4: parseAddressString handles 4 common US address formats (anchored-from-end strategy)
docs/sessions/mobile-fee-1-5-zip-only-format.md      # Phase Mobile-1.5: parser Format E (Street, City ZIP) + "CA" state default (two-pass regex)
docs/sessions/mobile-fee-1-6-address-display-edit.md # Phase Mobile-1.6: mobile_address display + edit on POS jobs detail + admin appointment dialog
docs/sessions/mobile-fee-1-7-display-composer.md     # Phase Mobile-1.7: shared composeLineItems utility — adds mobile fee as synthetic line on quote/appointment display surfaces
docs/sessions/mobile-fee-1-8-composer-idempotency.md # Phase Mobile-1.8: composer idempotency (skip synthetic append when jobs.services JSONB already carries mobile entry) + POS quote detail wiring
docs/sessions/messaging-1-2-send-flow-and-delivery.md # Phase Messaging-1+2: send pipeline overhaul (HTTP 422 on total failure, 3-status enum, twilio_sid JOIN for delivery tracking)
docs/sessions/mobile-fee-1-9-full-picker-edit.md     # Phase Mobile-1.9: full mobile picker edit on POS jobs detail + admin appointment dialog — toggle/zone/custom/address with live zone reads, save-time snapshot, payment-mismatch banner
docs/sessions/mobile-fee-1-9-1-zone-dropdown-fix.md  # Phase Mobile-1.9.1: zone-dropdown shows correct selection in edit mode (JOB_SELECT +mobile_zone_id, zonesLoaded resync, deleted-zone recovery)
docs/sessions/normalization-1-phone-format-integrity.md  # Phase Normalization-1: chokepoint phone normalization in sendSms/findOrCreateConversation, 5 unprotected endpoints, form-side hygiene, backfill + CHECK on employees.phone, 4 shadow conversations deferred
docs/sessions/phone-ux-1-display-and-input.md            # Phase Phone-UX-1: canonical phone display + input formatting — null-safe formatPhone, palette-driven SMS chip auto-format, 22 HIGH + 5 MEDIUM display sites, 7 input forms, 3 duplicate impls consolidated
docs/sessions/schema-hardening-1-phone-checks.md         # Phase Schema-Hardening-1: 5 phone CHECK constraints (4 new + 1 retroactive channel-aware on quote_communications.sent_to), inline DB-contract doc in send-service.ts, defense-in-depth complete
docs/sessions/lint-hardening-1.2-and-1.3-leak-fixes-and-rule-tightening.md  # Phase Lint-Hardening-1.2+1.3: 4 phone display leaks fixed (formatPhone wraps) + 11 tel: hrefs wrapped with phoneToE164 + 5 phone/no-raw-display rule adjustments (skip &&/?: test, recognize formatPhone(x)||x fallback, skip key/input value attrs, drop cell/mobile bare generics). Warning count 90→19. +15 rule tests.
docs/sessions/adr-1-establish-decision-records-practice.md  # Phase ADR-1: established docs/adr/ as ongoing practice. 5 initial ADRs (canonical form pattern, phone integrity, money cents, receipt 4-surface, timezone). 15 candidate ADRs identified for follow-up. CLAUDE.md Rule 5 updated to include ADR step at session end.
docs/manual/README.md
docs/manual/01-getting-started.md
docs/manual/02-dashboard.md
docs/manual/03-job-management.md
docs/manual/05-customers.md
docs/manual/MARKETING_DECISION_GUIDE.md   # Operator decision tree for the 4 messaging systems (Session 6c)
docs/manual/website/README.md
docs/hardware/print-server/package.json
docs/hardware/print-server/README.md
docs/hardware/print-server/server.js
docs/planning/CMS_OVERHAUL_PROJECT_PLAN.md
docs/planning/COUPONS.md
docs/planning/iPAD.md
docs/planning/MEMORY.md
docs/planning/NEW_SITE.md
docs/planning/PHASE8_JOB_MANAGEMENT.md
docs/planning/POST_LAUNCH_ROADMAP.md
docs/planning/PROJECT.md
docs/audits/ (18 audit files)
```
