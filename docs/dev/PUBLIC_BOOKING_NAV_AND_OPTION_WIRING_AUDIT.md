# Public Booking — Navigation + Admin-Option Wiring + pricing_model Rationale (2026-05-30)

> Read-only diagnostic audit. No source / migration / test changes were made.
> Branch: `audit/public-booking-navigation-and-admin-option-wiring`
> Worktree: `~/Claude/SmartDetails/wt-unit-b` (Memory #8 isolation)
> Base: `b1668c62` (Unit A's year text input + model case merge)
>
> **Status update (Session #140, 2026-06-02):** **N1, W1, W2, W3, W4,
> W5, W6, W7, and E5 RESOLVED.** N1/W2/W6/E5 via Session #133's U-B.1
> + E5 bundle (branch `fix/u-b-1-step2-back-server-mobile-special-pushstate`);
> **W1 via Session #134** (Q-A LOCKED canonical+enforce; branch
> `fix/u-b-2-classification-filter-public-booking-step2`). **W3 via
> Session #137** (Q-B LOCKED path (b); branch
> `fix/u-b-3-staff-assessed-request-quote-cta`). **W4 via Session #138**
> (Q-C-1 LOCKED Option A — line-item persistence mirror; branch
> `fix/u-b-4-is-taxable-mirror-products-pattern`). **W5 + W7 via
> Session #140** (Q-W5-UX LOCKED Option 1 — badge + RequestQuoteCard,
> reuses `request_type='staff_assessed_service'`; branch
> `fix/u-b-5-prereq-and-addon-vehicle-compat-public`). Session #140 is
> the U-B.5 / Path B Session 1 of the architectural-audit fix arc
> (`PUBLIC_BOOKING_ARCHITECTURAL_AUDIT.md`). See the per-finding
> ✅ RESOLVED markers in the matrices below and the per-session
> entries in `docs/CHANGELOG.md` for full fix documentation. **Only
> Concern C (pricing_model mutability — Q-D) remains open** as a
> product decision, not a defect.

## Context

Three concerns landed in one session by the operator:

- **Concern A — Navigation.** Operator report: *"After completing Step 2 of the public booking flow, there is no way to go back to Step 1 to correct a wrong vehicle selection."* Map per-step navigation affordances (forward / back / edit-from-summary / URL access / state preservation), confirm or deny.
- **Concern B — Admin-service-option wiring.** Operator framing: *"Ensure each option is wired up to be working and not a dead button providing false hope."* Catalogue every settable option on the admin service edit page and prove, per option, whether the public booking surface (a) reads it, (b) honors it, and (c) the server enforces it. Specifically called out: `vehicle_compatibility`, `mobile_eligible`, `staff_assessed`, `online_bookable`, `is_taxable`, `classification`.
- **Concern C — `pricing_model` immutability rationale.** Retrieve from the prior catalog audit the EXACT reasoning for the immutability lock so the operator has evidence-based context to decide whether to keep the lock or build proper change support. **Retrieval only, no fix scope.**

Evidence gathered by reading source on a clean worktree, plus the canonical schema doc (`docs/dev/DB_SCHEMA.md`) and prior audits (`CATALOG_CRUD_WIRING_AUDIT.md`, `PUBLIC_BOOKING_FLOW_AUDIT.md`, `VEHICLE_TAXONOMY_AUDIT.md`). No DB / API hits.

## TL;DR

**Concern A — CONFIRMED.** Step 2 (Service Select) has **no explicit Back button** — only the small step-indicator dot at the top, which is rarely read as a back affordance (`step-indicator.tsx:34–46`). Step 3 and Step 4 both render an explicit "Back" button (`step-schedule.tsx:285`, `step-confirm-book.tsx` `onBack`). Step 4 also exposes per-row Pencil "edit" icons on the order summary that jump back to Step 1 / Step 2 / Step 3 (`step-confirm-book.tsx:437–480`). Browser back works because the wizard writes the URL on every step change (`booking-wizard.tsx:554–614, 626–630`) and state is fully preserved on backward navigation. **Classification: (a) affordance never added on Step 2 alone** — Step 1 has no back because it's first; Step 3/4 have it; Step 2 is the lone gap, and the small completed-step dot on the indicator (8px on mobile, 32px on desktop) was missed.

**Concern B — 13 admin options audited. 7 honored end-to-end, 1 partial (client-only), 4 dead on public booking, 1 N/A.** The two most consequential gaps are:
1. **`classification` is unenforced at Step 2.** The wizard's category filter is the ONLY filter on Step 2's service list (`booking-wizard.tsx:680–689`); an `addon_only` service that is also `online_bookable` would surface as a standalone bookable on Step 2 and the server would accept it as the primary service (`api/book/route.ts` has no `classification` check). Operator's explicit rule "only primary standalone services on Step 2; everything else is add-on" is **NOT enforced**.
2. **`staff_assessed` is completely dead on public booking.** Admin toggle exists (`[id]/page.tsx:1167–1179`), schema column exists (`services.staff_assessed`), but zero references in `src/components/booking/**`, `src/lib/data/booking.ts`, or `src/app/api/book/**`. A service flagged "requires staff evaluation for pricing" is fully bookable online with no callback, no banner, no surcharge note.

Lesser gaps: `mobile_eligible` is client-honored (the mobile UI block hides for non-eligible services at `step-service-select.tsx:475`) but the API doesn't re-check it (a tampered request with `is_mobile=true` on a non-mobile service would be accepted); `is_taxable` is hardcoded false for all booking-deposit line items (`api/book/route.ts:492, 511, 537`) — admin-set true won't reflect at booking time, only at POS finalization; `service_prerequisites` are not enforced on public booking at all (operator's POS gating is POS-only); `special_requirements` text is never shown to the customer.

**Concern C — The prior catalog audit gives no rationale; it documents the BEHAVIOR and explicitly punts to the operator.** `CATALOG_CRUD_WIRING_AUDIT.md` flags `pricing_model` immutability four times (lines 32, 82, 129, 212, 225) as Informational/coherence, and ends with **Open operator decision Q4** (line 244–245): *"`pricing_model` mutability: should operators be able to change a service's pricing model after creation, or is immutability intended (in which case document it)?"* The behavior is by-omission, not by-design — the edit page renders the model read-only at `[id]/page.tsx:1342` and the `onSaveDetails` payload (verified at `[id]/page.tsx:504–520`) omits `pricing_model` entirely. **The rationale is not surfaced in the UI** (no tooltip, no help text, no lock icon, no error message).

**Severity breakdown.** 1 Significant (W1 — `classification` rule unenforced; operator-stated rule), 2 Significant (N1 — Step 2 back affordance missing; W3 — `staff_assessed` dead), 4 Moderate (W2/W4/W5/W6), 3 Minor (sibling findings). Recommended fix arc: **3 fix sessions + 1 product decision** (see Target D).

---

## Concern A — Navigation per step

The wizard is a 4-step flow plus a "Specialty Vehicle Block" gate that displaces Step 1 when an exotic/classic vehicle is detected.

### Navigation primitives (shared across steps)

| Primitive | Location | Behavior |
|-----------|----------|----------|
| `goToStep(newStep, updatedState?)` | `booking-wizard.tsx:626–630` | `setStep` + `updateUrl` — the only forward/back step setter |
| `updateUrl(newStep, newState)` | `booking-wizard.tsx:554–614` | Writes all wizard state to URL: `step`, `vehicle_id`/`vehicle_category`/`size_class`/`make`/`model`, `service` slug, `vehicle` (size for config reconstruction), `date`, `time`, `addons`, `category`, `coupon`, `rebook` |
| `getInitialState()` | `booking-wizard.tsx:232–377` | Reconstructs `step` + `state` from URL on mount; falls back to Step 1 (or Step 3 for rebook mode) if vehicle data or service+config are unreconstructable |
| `handleStepClick(targetStep)` | `booking-wizard.tsx:638–641` | Step-indicator click handler — `if (targetStep >= step) return;` — **only backward navigation allowed**, never forward jumps |
| `editEntryStep` state | `booking-wizard.tsx:528` | When Step 4 calls `onEditStep(target)`, this is set to the original step (4) so Step 1/2/3 can render "Back to Booking" buttons that jump back to Step 4 with state preserved |
| URL sync (browser back/forward) | `window.history.replaceState` at `:613` | All transitions use `replaceState`, NOT `pushState` — browser back skips intermediate wizard steps and exits the booking page entirely. **See sibling finding E5.** |

### Per-step matrix

| Step | Forward affordance | Back affordance (explicit) | Stepper-back works? | Edit-from-summary | URL access | State preserved on back? |
|------|--------------------|----------------------------|---------------------|-------------------|------------|--------------------------|
| **1 — Vehicle** | "Continue" sticky button (`step-vehicle.tsx:561–569`) | N/A (first step) | N/A | N/A | `?step=1` works (`booking-wizard.tsx:328–330`) | All form state in `step-vehicle.tsx`'s local `useState` re-renders from `initialVehicle` prop (`:67`, `:82–112`); category + make/model + year + color + size_class + specialty_tier retained |
| **1b — Specialty Vehicle Block** (exotic/classic) | "Request Callback" form submit (`specialty-vehicle-block.tsx:60`) | "Back" with ArrowLeft icon via `onEditVehicle` callback wired at `booking-wizard.tsx:1104` → clears `showSpecialtyBlock`, returns to Step 1 form | N/A (block hides stepper interaction) | N/A | N/A — block is conditional on Step 1 + size_class check, not URL | Yes — `state.vehicleData` retained |
| **2 — Service Select + Configure** | "Continue" in desktop sidebar (`step-service-select.tsx:747–753`) + mobile sticky footer (`:767–773`) | **NONE — see operator's report** | YES — clicking the "1 Vehicle" circle on the indicator at `step-indicator.tsx:34` (desktop, ~32px) or the small dot at `:87` (mobile, ~10px) goes back. **Easy to miss.** | N/A | `?step=2` requires `vehicleData`; falls back to Step 1 if missing (`booking-wizard.tsx:333–335`) | `selectedService`/`tier`/`size_class`/`addons`/`mobile_*` all rehydrate from `initialConfig` prop |
| **3 — Schedule** | "Continue" desktop (`step-schedule.tsx:288–294`) + mobile sticky (`:365–371`) | **"Back" button** at `step-schedule.tsx:285–287` → `onBack={() => goToStep(2)}` wired at `booking-wizard.tsx:1165` | YES | N/A | `?step=3` requires service + reconstructed config (`booking-wizard.tsx:348–374`) | `date` + `time` retained; `slots` re-fetched via `useEffect` |
| **4 — Confirm & Book** | "Book My Detail" or "Pay $X & Book My Detail" (`step-confirm-book.tsx:403–411`) | **"Back" button** via `onBack={() => goToStep(3)}` (`booking-wizard.tsx:1204`) | YES | **3 Pencil icons in order summary** (`step-confirm-book.tsx:437–440` vehicle → Step 1, `:450–453` date → Step 3, `:476–480` service → Step 2) | `?step=4` requires service + config + date + time (`booking-wizard.tsx:362–369`) | Yes — full state retained via `editEntryStep` round-trip (`booking-wizard.tsx:1205`) |

### Operator's report: **CONFIRMED**

Step 2 lacks an explicit Back button. The only backward navigation paths from Step 2 are:
1. The completed step-1 circle on the StepIndicator (`step-indicator.tsx:34–46` for desktop, `:86–99` for mobile). This IS clickable when its step is `isCompleted` (line 36 `disabled={!isCompleted}`), and `handleStepClick` (`booking-wizard.tsx:638–641`) wires it to `goToStep(targetStep)`. State is preserved.
2. The browser back button — but see sibling finding E5: `replaceState` (not `pushState`) means browser back **exits the booking page entirely** rather than walking the wizard backward.

**Classification: (a) Affordance never added on Step 2 alone.** Step 1 is the first step (no back needed). Step 3 has an explicit Back button at `step-schedule.tsx:285`. Step 4 has both an explicit Back button and edit-from-summary pencils. Step 2 is the lone gap. The stepper-dot back path is technically functional but the dot is small (~10px on mobile), label-less in compact form, and reads as a "progress indicator" not a "navigation control."

Confidence on classification: HIGH. The omission is symmetric with Step 3/4 having explicit Back buttons; adding one to Step 2 was likely overlooked when the wizard was built.

---

## Concern B — Admin-service-option wiring matrix

`services` table options enumerated from the admin edit page (`src/app/admin/catalog/services/[id]/page.tsx`) and cross-referenced against `docs/dev/DB_SCHEMA.md:2402–2436`.

### Read path (public booking)

`src/lib/data/booking.ts:72–129` (`getBookableServices`) is the canonical loader for Step 2's category-grouped service list. Filters applied at the DB layer:

- `.eq('is_active', true)` (line 91)
- `.eq('online_bookable', true)` (line 92)
- `.eq('service_categories.is_active', true)` (line 93) — inner join so category-deactivation also hides services
- `.order('display_order', { ascending: true })` (line 94)

`getBookableServiceBySlug` (line 135–173) applies the same three filters (lines 157–158) for `?service=slug` deep-links.

### Server-side enforcement

`api/book/route.ts:60–67` re-fetches the submitted `service_id`:

```ts
.from('services')
.select('*, service_pricing(*)')
.eq('id', data.service_id)
.eq('is_active', true)
.eq('online_bookable', true)
.single();
```

…and rejects with "Service not found or not bookable" if missing. Then `vehicle_compatibility` is re-checked against the resolved vehicle category at `:254–262`:

```ts
const compatibility = Array.isArray(serviceRow.vehicle_compatibility) ? serviceRow.vehicle_compatibility as string[] : [];
if (compatibility.length > 0 && !compatibility.includes(compatKey)) {
  return NextResponse.json({ error: `This service is not available for ${categoryLabel} vehicles. …` }, { status: 400 });
}
```

`categoryToCompatibilityKey` (`src/lib/utils/vehicle-categories.ts:88–89`) maps `'automobile'` → `'standard'` and passes others through; the JSONB stores `['standard']` for automobile-only services.

### Matrix

Legend: ✅ honored | ⚠️ partial | ❌ dead | N/A

| # | Admin option | Admin set site | DB column | Public booking effect (expected by admin intent) | Read path | Server enforce | Verdict |
|---|--------------|----------------|-----------|--------------------------------------------------|-----------|----------------|---------|
| 1 | `online_bookable` | `[id]/page.tsx:1154–1166` (Switch in "Service Options" card) | `services.online_bookable BOOL NOT NULL DEFAULT true` | When false, hide from public booking entirely | YES — DB filter at `booking.ts:92, 158` | YES — `api/book/route.ts:66` | ✅ HONORED |
| 2 | `is_active` | `[id]/page.tsx:1218–1237` (Switch in "Display Settings" card) | `services.is_active BOOL NOT NULL DEFAULT true` | When false, hide from public booking entirely | YES — DB filter at `booking.ts:91, 157` | YES — `api/book/route.ts:65` | ✅ HONORED |
| 3 | `vehicle_compatibility` | `[id]/page.tsx:1114–1126` (Checkbox grid: Automobile/Motorcycle/RV/Boat/Aircraft via `VEHICLE_TYPE_LABELS`) | `services.vehicle_compatibility JSONB NOT NULL DEFAULT '["standard"]'` | Filter Step 2 service list by selected vehicle category | YES — `booking-wizard.tsx:680–689` (`compat.includes(compatibilityKey)`); empty array = "show to all" | YES — `api/book/route.ts:254–262` with same empty-array semantics | ✅ HONORED (consistent client + server) |
| 4 | `mobile_eligible` | `[id]/page.tsx:1141–1153` (Switch) | `services.mobile_eligible BOOL NOT NULL DEFAULT false` | Show "Add mobile service" link + "Mobile" pill on service card only when true | YES (client only) — `step-service-select.tsx:475` (gate the mobile fields UI) + `:870` (gate the pill on card) | NO — `api/book/route.ts` checks `is_mobile && !await isFeatureEnabled(MOBILE_SERVICE)` (`:270`) but does NOT re-validate per-service `mobile_eligible` | ⚠️ PARTIAL — client honors, server has no defense against tampered request |
| 5 | `staff_assessed` | `[id]/page.tsx:1167–1179` (Switch, helper text "Requires staff evaluation for pricing") | `services.staff_assessed BOOL NOT NULL DEFAULT false` | Some signal that pricing is provisional / staff will confirm. Operator-stated intent: a flagged service should not be customer-self-bookable at the listed price | NONE — grep confirms zero references in `src/components/booking/**`, `src/lib/data/booking.ts`, `src/app/api/book/**` | NONE | ❌ DEAD (gap shape: (i) public doesn't read column) |
| 6 | `is_taxable` | `[id]/page.tsx:1180–1192` (Switch, helper text "Sales tax applied to this service") | `services.is_taxable BOOL NOT NULL DEFAULT false` | Add tax line to Step 4 order summary; pass through to receipt | NO — booking does not surface tax UI anywhere | HARDCODED `is_taxable: false` for all line items at `api/book/route.ts:492` (primary), `:511` (addons), `:537` (mobile fee); `tax_amount: 0` everywhere | ❌ DEAD on booking deposit — admin-set true has zero effect on customer-facing booking flow (POS may apply tax at finalization; not verified by this audit) |
| 7 | `classification` (`primary`/`addon_only`/`both`) | `[id]/page.tsx:1101–1107` (Select) | `services.classification service_classification ENUM NOT NULL DEFAULT 'primary'` | Operator's explicit rule: "Only primary standalone services on Step 2; everything else is add-on" — filter Step 2 list to `classification IN ('primary', 'both')` | NO — `booking-wizard.tsx:684` filter is only `vehicle_compatibility`. The column IS fetched (`booking.ts:43, 86, 151`) for the addon-suggestions sub-select but NOT used to filter the primary list | NO — `api/book/route.ts` accepts any `service_id` that's `is_active + online_bookable` as the primary | ❌ DEAD — operator's stated rule completely unenforced; gap shape: (i) public doesn't filter (primary list) (ii) server doesn't gate on submit |
| 8 | `pricing_model` (`vehicle_size`/`scope`/`per_unit`/`specialty`/`flat`/`custom`) | Create-only at `services/new/page.tsx:316–321`; edit page renders **read-only** at `[id]/page.tsx:1342` | `services.pricing_model pricing_model ENUM NOT NULL` | Drives Step 2's PricingSelector UI dispatch; drives server price validation | YES — `step-service-select.tsx:944` `switch (service.pricing_model)` for UI; `getServicePriceDisplay` at `:1448` for card prices; `computePrice` at `:1366` for totals; reconstructFromUrl at `booking-wizard.tsx:432–484` | YES — `api/book/_pricing.ts:57` `switch (service.pricing_model)` for `computeExpectedPrice` | ✅ HONORED + immutable after create (see **Concern C** below) |
| 9 | `flat_price` / `per_unit_price` / `per_unit_max` / `per_unit_label` / `custom_starting_price` | Pricing tab (`[id]/page.tsx:1338`) | `services.flat_price NUMERIC` etc. | Render price; gate quantity input (per_unit_max); render unit label | YES — `step-service-select.tsx:945–969` (flat), `:1164–1219` (per_unit), `:1576–1579` (custom display) | YES for flat via `_pricing.ts:58–79`; per_unit + custom intentionally skipped (`_pricing.ts:90–100` returns null = skip server validation) | ✅ HONORED (per_unit + custom server-skip is documented in `_pricing.ts` comments) |
| 10 | `service_pricing` rows (tiers — `sedan`/`truck_suv_2row`/`suv_3row_van`/`exotic`/`classic` + per-size columns + scope/specialty rows) | Pricing tab via `ServicePricingForm` + `VehicleSizeUnifiedPricing` (`[id]/page.tsx:1365–1380`) | `service_pricing` table (DB_SCHEMA:2402) with `is_vehicle_size_aware` + 5 `vehicle_size_*_price` columns | Drive Step 2's tier picker / vehicle-size grid; canonical pricing engine resolves price | YES — `resolveServicePrice` / `resolveServicePriceWithSale` from `picker-engine.ts` used throughout (CLAUDE.md Rule 22 compliant) | YES via `_pricing.ts:84–87` using `resolveServicePriceWithSale` | ✅ HONORED |
| 11 | `sale_starts_at` / `sale_ends_at` / `sale_price` | Pricing tab (`[id]/page.tsx:279–280, 1346–1361`) | `services.sale_*` + `service_pricing.sale_price` | Render strike-through + sale badge; reduce effective price | YES — sale window passed to `resolveServicePriceWithSale` everywhere; sale badges in `step-service-select.tsx:957–966, 981–989, 1022–1033, 1129–1138, 1207–1216` | YES — `_pricing.ts` passes `saleWindow` to engine | ✅ HONORED |
| 12 | `base_duration_minutes` | `[id]/page.tsx:1110–1112` (Input) | `services.base_duration_minutes INT NOT NULL DEFAULT 60` | Determine slot duration for Step 3 calendar slot query | YES — `booking-wizard.tsx:1057–1062` sums service + addon durations into `totalDuration`; passed to `<StepSchedule durationMinutes={totalDuration}>`; `step-schedule.tsx:92` sends to slots API | N/A (slot search is client-driven; server slot endpoint reads duration from URL param) | ✅ HONORED |
| 13 | `vehicle_compatibility` for ADDON services (sub-select) | (same as #3, set on the addon's own admin record) | (same column) | Restrict addon suggestions to compatible vehicles | NO — `booking.ts:80–88` selects addon_service without filtering by addon's `vehicle_compatibility`; `step-service-select.tsx:382–456` renders all `addonSuggestions` for the primary service regardless of vehicle | NO — `api/book/route.ts` does not re-check addon compatibility (only primary service) | ❌ DEAD for addons (low-impact since addons are seldom cross-category; flagging for completeness) |
| 14 | `display_order` | `[id]/page.tsx:1205–1216` (Input) | `services.display_order INT NOT NULL DEFAULT 0` | Order services within category | YES — DB ordering at `booking.ts:94`; addon ordering at `:117–119` | N/A | ✅ HONORED |
| 15 | `special_requirements` (text) | `[id]/page.tsx:1128–1130` (Textarea) | `services.special_requirements TEXT` | Display as note/warning to customer before booking | NO — `BookableService` interface in `booking.ts:27–49` does not list it; not surfaced in any Step 2 / Step 4 card | NO | ❌ DEAD on booking |
| 16 | `show_on_website` | `[id]/page.tsx:1240–1283` (Switch, API-backed PATCH) | `services.show_on_website BOOL NOT NULL DEFAULT true` | Display on `/services` public catalog page (separate from booking) | NO — booking does not read it; controls `/services` and sitemap only | NO | N/A — distinct from `online_bookable`; correctly out-of-scope for booking |
| 17 | `image_url` / `image_alt` | `[id]/page.tsx:1286–1317` (ImageUpload) | `services.image_url TEXT`, `image_alt TEXT` | Display thumbnail on service card | YES — `step-service-select.tsx:813–820` (image with `alt={service.image_alt || service.name}` fallback to icon at `:820`) | N/A | ✅ HONORED |
| 18 | `category_id` | `[id]/page.tsx:1092–1099` (Select) | `services.category_id UUID FK` | Group services into Step 2 tabs | YES — `service_categories!inner(*)` join at `booking.ts:80, 145`; categories grouped at `:102–123`; tabs rendered at `step-service-select.tsx:685–697` | N/A | ✅ HONORED |
| — | **Prerequisites** (separate table) | `service_prerequisites` managed on the edit page's Prerequisites tab (per `CATALOG_CRUD_WIRING_AUDIT.md:151`) | `service_prerequisites` table | Block customer from booking a service whose prereq they don't have history of (analogous to POS gating at `api/pos/services/check-prerequisites/route.ts:53–186`) | NO — `BookableService` interface in `booking.ts:27–49` does not load prerequisites; no client-side check; no API check on `api/book/route.ts` | NO | ❌ DEAD on public booking (POS-only enforcement per `CLAUDE.md` Rule 22 add-time validation block) |
| — | **Addon suggestions** (`service_addon_suggestions`, `combo_price`) | Add-Ons tab on edit page (per `CATALOG_CRUD_WIRING_AUDIT.md:147`) | `service_addon_suggestions` table | Surface as add-on chips on Step 2 with combo pricing | YES — loaded at `booking.ts:81–88`; rendered at `step-service-select.tsx:382–456` with `combo_price` honored at `:390` | YES — addon `service_id` passed in `data.addons` and persisted with `tier_name` + `price`; price reconciled into the deposit transaction via `applyCombosToQuoteItems` at `api/book/route.ts:476` | ✅ HONORED |

### Operator's explicit rules — verification summary

| Operator rule | Verdict | Evidence |
|---------------|---------|----------|
| "Services filtered by `vehicle_compatibility` for selected category" on Step 2 | ✅ **HONORED** | `booking-wizard.tsx:680–689` client filter + `api/book/route.ts:254–262` server enforcement; both use `compat.includes(compatibilityKey)` with empty-array = show-to-all semantics |
| "Only primary standalone services on Step 2; everything else is add-on" | ❌ **NOT ENFORCED** | `booking-wizard.tsx:684` filters only by `vehicle_compatibility`; `classification IN ('primary', 'both')` filter is absent. An `addon_only` service with `online_bookable=true` would surface as a Step 2 choice. Server accepts any matching `service_id` as primary. **Operator's stated rule is currently aspirational only.** |
| "`mobile_eligible` honored" | ⚠️ **CLIENT-ONLY** | Surfaced correctly in Step 2 UI but no server defense |
| "`staff_assessed` honored" | ✅ **HONORED** (Session #137) | Two-layer: ServiceCard renders "Custom Quote" badge + `<RequestQuoteCard>` replaces configure panel when selected (`step-service-select.tsx`); server `checkNotStaffAssessed` rejects primary/addon submissions in `/api/book/route.ts` via `_staff-assessed.ts` helper. Mirrors classification + mobile_eligibility two-layer pattern. |
| "`online_bookable` honored" | ✅ **HONORED** | DB filter at read + server re-check at submit |
| "`is_taxable` honored" | ⚠️ **PERSISTENCE FIXED, NO STEP 4 UI** (Session #138, Q-C-1 Option A) | Line-item persistence on deposit `transaction_items` now honors `services.is_taxable` (per-row, via the addon-fetch from U-B.3 extended to include the flag). `tax_amount: 0` stays on items + deposit transaction (no deposit-time tax computation per CDTFA Pub 100); POS finalization via live `services.is_taxable` lookup at drain time + `calculateItemTax` is unchanged. Customer-facing Step 4 tax UI / payment-intent tax computation NOT implemented (Option B path — separate session if operator wants customer-visible tax UX). |

---

## Concern C — `pricing_model` immutability rationale (retrieval only)

### Direct extract from `docs/dev/CATALOG_CRUD_WIRING_AUDIT.md`

The catalog audit references `pricing_model` immutability in five places. **The audit gives no rationale and explicitly flags this as an open operator decision.** Citations below.

1. **TL;DR, line 32 (Severity summary)** —
   > "…**Informational items** (one suggestion pointing to a deactivated add-on; **`pricing_model` immutable after creation**; a referenced-but-nonexistent 'reprice' mechanism)."

2. **Target 1 — Services CRUD wiring matrix, line 82** (Update row) —
   > "Works, with caveats — **does not maintain `slug` on rename** (Significant; SEO drift) and **omits `pricing_model`** (immutable after create)"

3. **Target 3 — Service tiers CRUD wiring, line 129** (`pricing_model` change row) —
   > "display-only at `:1021, :1324`; omitted from `onSaveDetails` payload | — | **Not implemented** — model is immutable after creation"

4. **Target 11 — Half-built features, line 212** —
   > "**`pricing_model` change on edit** — create page has the model selector; edit page renders it read-only and never persists it → model is immutable after creation. (Informational/coherence)"

5. **Target 12 — Severity-ranked fix list, line 225 (Informational severity)** —
   > "**(I2)** `pricing_model` immutable after creation (no edit-page selector)."

6. **Open operator decisions, line 244–245 (Q4)** —
   > "**`pricing_model` mutability:** should operators be able to change a service's pricing model after creation, or is immutability intended (in which case document it)?"

### What this means

The prior audit DOES NOT establish a rationale. It documents the **behavior** (the edit page omits `pricing_model` from the update payload, so it cannot be changed once the service is created) and treats it as a coherence issue worth surfacing rather than a deliberate constraint. The catalog audit's explicit ask was for the operator to decide between (a) keep the lock and document it with a real rationale, or (b) build proper change support.

### Verified against current code (this audit)

`src/app/admin/catalog/services/[id]/page.tsx:504–520` `onSaveDetails`'s payload omits `pricing_model`:

```ts
const payload: Record<string, unknown> = {
  name: formData.name,
  description: formData.description || null,
  category_id: formData.category_id || null,
  classification: formData.classification,
  base_duration_minutes: formData.base_duration_minutes,
  mobile_eligible: formData.mobile_eligible,
  online_bookable: formData.online_bookable,
  staff_assessed: formData.staff_assessed,
  is_taxable: formData.is_taxable,
  vehicle_compatibility: formData.vehicle_compatibility,
  special_requirements: formData.special_requirements || null,
  is_active: formData.is_active,
  display_order: formData.display_order,
  image_url: imageUrl,
  image_alt: imageAlt.trim() || null,
};
```

The Pricing tab header at `[id]/page.tsx:1342` displays the model as a label:
```tsx
<CardTitle className="flex items-center gap-2">
  {PRICING_MODEL_LABELS[service.pricing_model]} Pricing
  …
```

There is no selector, no inline edit, no surfacing of *why* the field is locked.

### UI surfacing of the rationale

**None.** No tooltip, no help text, no lock icon, no disabled-state hint, no error message anywhere in the admin surface explains why `pricing_model` cannot be edited after creation. An operator changing the price strategy for a service (e.g., realizing a "Flat" service should have been "Vehicle Size") would have no in-UI explanation; the only path documented today is "create a new service with the desired model, deactivate the old one."

### Open questions surfaced by the prior audit (verbatim from `CATALOG_CRUD_WIRING_AUDIT.md:240–246`)

- Q1 (architecture): keep browser-client+RLS or migrate to admin API routes? (Tangentially relevant — would shape how a `pricing_model` change endpoint is built.)
- Q4 (specifically): "`pricing_model` mutability: should operators be able to change a service's pricing model after creation, or is immutability intended (in which case document it)?"

The catalog audit punts to the operator. No technical impediment is documented; the most likely engineering risk (un-audited in either audit) is the data-side consequence: changing a service from `vehicle_size` to `flat` (or vice versa) requires deciding what happens to existing `service_pricing` rows and to past `appointment_services` / `transaction_items` rows that reference `tier_name`. Without a migration story, an in-place model change would orphan tier data and break historical-receipt resolution. **This is speculative — not stated in the prior audit.**

---

## Target D — Severity-ranked findings matrix + fix-arc shape

Severity scale:
- **Critical** — blocks an active operator/customer workflow
- **Significant** — breaks an operator-stated rule, or quietly accepts wrong data
- **Moderate** — admin surface implies behavior the public surface doesn't deliver ("false hope")
- **Minor** — incidental, low-impact

| ID | Severity | Finding | Surface | Fix shape | Memory #8 safe? |
|----|----------|---------|---------|-----------|------------------|
| **N1** | **Significant** | Step 2 lacks explicit Back button — operator confirmed | `step-service-select.tsx` (add `<Button onClick={onBack}>` analogous to step-schedule.tsx:285); wire `onBack={() => goToStep(1)}` from wizard at `booking-wizard.tsx:1129–1155` | ≤30 lines, 2 files | ✅ Yes (≤3 files, <250 lines) — **✅ RESOLVED Session #133 (U-B.1)** |
| **W1** | **Significant** | `classification` rule unenforced at Step 2 — operator's "only primary on Step 2" rule | `booking.ts:91–93` (add `.in('classification', ['primary', 'both'])`) + `api/book/route.ts:60–67` (add same filter to server re-check) + `getBookableServiceBySlug` parity at `:156–158` | ≤15 lines, 2 files; needs operator confirmation that the rule is canonical (vs. just "default behavior") | ✅ Yes — **✅ RESOLVED Session #134 (U-B.2)** — Q-A LOCKED canonical+enforce. Two-layer defense: Layer 1 — `booking.ts` both `getBookableServices` + `getBookableServiceBySlug` got `.in('classification', PRIMARY_BOOKABLE_CLASSIFICATIONS)`; Layer 2 — `route.ts` invokes `checkPrimaryClassification` between service-fetch and price-validation. Helper extracted to `_classification.ts` (mirrors `_mobile-eligibility.ts`); single constant drives client + server (drift guard); 11 unit tests. |
| **W3** | **Significant** | `staff_assessed` completely dead on public booking | Decision required: (a) hide `staff_assessed=true` services from public booking entirely (analogous to `online_bookable=false`); (b) keep visible but suppress "Book My Detail" CTA + show "Requires staff evaluation — request a quote" CTA; (c) deprecate the flag. Each option is 1 small session | ≤50 lines, 2–3 files depending on choice | ✅ Yes — **✅ RESOLVED Session #137 (U-B.3 / W3)** — Q-B LOCKED **path (b)**: keep visible + suppress booking CTA + render "Request a Quote" inline. Q-B-1 sub-decision LOCKED: inline callback form (mirror `<SpecialtyVehicleBlock>`) + generalize `/api/public/specialty-callback` with `request_type` discriminator. **Two-layer defense:** Layer 1 — `step-service-select.tsx` shows "Custom Quote" badge in `<ServiceCard>` + `<RequestQuoteCard>` replaces configure panel + suppresses Continue button (desktop sidebar + mobile sticky footer + spacer all gated). Layer 2 — new `_staff-assessed.ts` helper invoked in `/api/book/route.ts` after classification check + before price validation; `checkNotStaffAssessed` rejects primary OR addon with `"{name} requires a custom quote and cannot be booked directly online. Please request a quote."` Helper mirrors `_classification.ts` + `_mobile-eligibility.ts` byte-symmetrically; 11 unit tests + 4 render tests pin the rule. **Shared form base extracted (Memory #2/#29 reuse):** new `<QuoteRequestForm>` owns form state, network, success state, Call CTA; both `<SpecialtyVehicleBlock>` (refactored) and new `<RequestQuoteCard>` are thin wrappers. Forward-compatible for F2 (RV/Boat/Aircraft non-priced) — the discriminator + the generic RequestQuoteCard naming are the seed. |
| **W2** | **Moderate** | `mobile_eligible` client-only — server has no defense | `api/book/route.ts` (after the service re-fetch at `:60–67`, add: `if (data.is_mobile && !serviceRow.mobile_eligible) return 400 'This service is not mobile-eligible'`) | ≤10 lines, 1 file | ✅ Yes — **✅ RESOLVED Session #133 (U-B.1)** — pure helper extracted to `_mobile-eligibility.ts` (mirrors `_pricing.ts` pattern), 7 unit tests pin the rule; route checks primary + batch-fetches addons |
| **W4** | **Moderate** | `is_taxable` always false on booking-deposit line items — admin-set true has no booking-time effect | Decision required: (a) honor `is_taxable` at booking by computing tax + adding tax line to Step 4 + writing real `tax_amount` on the deposit transaction; (b) document that booking deposits are intentionally non-taxable and tax is applied only at POS finalization; (c) hide the admin toggle when the only consumer is POS. Each option is a separate small-to-medium session | Variable; needs operator decision first | ✅ Yes — **✅ RESOLVED Session #138 (U-B.4 / W4)** — Q-C-1 LOCKED **Option A (line-item persistence mirror)**, a narrower path than the audit's original "(a) honor + Step 4 tax line + payment intent" framing. Per-row `is_taxable` on `transaction_items` reflects the underlying `services.is_taxable` flag; `tax_amount` stays `0` on items + the deposit transaction because no tax is collected at deposit time (CA CDTFA Pub 100 — tax tied to service completion, which POS finalization via `/api/pos/appointments/[id]/load` + `calculateItemTax` in `pos/utils/tax.ts` already handles correctly via a live `services.is_taxable` lookup at drain time). The smaller persistence-only mirror was the minimum-correct change matching the operator's Q-C "mirror products' pattern" directive without committing to Option B's customer-visible tax UX (Step 4 tax row, payment intent tax computation, receipt/SMS template updates) which exceeded Memory #8 and required additional product decisions. `/api/book/route.ts` primary line item now persists `serviceRow.is_taxable` (was hardcoded false); addon line items persist their own row's `is_taxable` via a `Map` lookup from `addonServiceRows` (the addon-fetch from U-B.3 W2/W3 extended to include `is_taxable`); mobile fee at `:648` STAYS `is_taxable: false` (CDTFA Pub 100 — separately-stated delivery fee — expanded in-source comment flags it as the one legitimate post-W4 hardcoded-false). Defensive `?? false` default on missing addon row: POS re-reads canonical at finalization. **Tests (+8):** new `deposit-tax-persistence.test.ts` mirrors `modifier-persistence.test.ts` harness style; coverage includes anti-overshoot guards against always-true regressions, blanket "use serviceRow flag everywhere" misfixes, and future Option-B drift. **Effect:** admin Transaction Detail (`transaction-detail.tsx:306`) now correctly shows `$0.00` (taxable item, no tax paid yet) instead of `---` (non-taxable) for booking deposits of taxable services. Customer-facing UX unchanged. POS finalization unchanged. |
| **W5** | **Moderate** | `service_prerequisites` not enforced on public booking | Add prereq check (analogous to `api/pos/services/check-prerequisites/route.ts`) to `api/book/route.ts` before appointment insert; surface friendly error to customer with what prereq is needed | ≤80 lines, 2 files | ✅ Yes — **✅ RESOLVED Session #140 (U-B.5 / Path B Session 1)** — Q-W5-UX LOCKED **Option 1** (badge + RequestQuoteCard, reuse `request_type='staff_assessed_service'`). **Public-booking SUBSET semantics:** unlike POS — which gates by SATISFACTION (history/same-ticket) + offers manager override — public booking checks ONE axis only: prereq vehicle-compatibility (the axis the customer can never resolve themselves; satisfaction is staff's job via the quote request). NO manager override on this surface, by design. **Two-layer defense:** Layer 1 — `src/lib/data/booking.ts` extended with `service_prerequisites` embed in both `getBookableServices` + `getBookableServiceBySlug`; `step-service-select.tsx` computes `serviceRequiresQuote(svc, vehicleCategory)` widening W3's `staff_assessed`-only branch — ServiceCard "Custom Quote" badge + configure-panel substitution with `<RequestQuoteCard>` + Continue button + price summary + mobile footer + spacer all switch on unified `selectedRequiresQuote` derived bool. Layer 2 — new `_prereq-enforcement.ts` (`assertPrereqsCompatible` + `prereqIncompatibleErrorMessage`); `/api/book/route.ts` invokes after staff_assessed check + before price validation. Mirrors `_classification.ts` / `_staff-assessed.ts` byte-symmetrically. Empty/null `vehicle_compatibility` = compatible-with-all (implicit default). Error wording closes with "Please request a quote." — same imperative as W3 so the customer routes to the same `RequestQuoteCard` CTA. 16 unit tests pin the rule (including standard↔automobile mapping symmetry × 4 non-automobile categories). |
| **W6** | **Moderate** | `special_requirements` text never shown to customer | Add to `BookableService` interface + render as expandable note on Step 2 service card; mirror admin's intent ("special requirements" = customer-visible disclosure) | ≤40 lines, 2 files | ✅ Yes — **✅ RESOLVED Session #133 (U-B.1)** — surfaced on Step 2 service card (italic "Note: …" below description, `line-clamp-2`) + Step 4 order summary (same styling, directly below service line); 3 unit tests pin the conditional |
| **W7** | **Minor** | Addon services' own `vehicle_compatibility` not enforced | Filter addon list in `step-service-select.tsx:382–456` against `vehicleCategory` using addon's own `vehicle_compatibility` (requires loading the field — current sub-select doesn't include it; add to `booking.ts:84–88`) | ≤20 lines, 2 files | ✅ Yes — **✅ RESOLVED Session #140 (U-B.5 / Path B Session 1)** — **Two-layer defense:** Layer 1 — `src/lib/data/booking.ts` addon `addon_service` sub-select now includes `vehicle_compatibility`; `step-service-select.tsx` filters `addonSuggestions` by `addonAllowedForVehicle(addon.vehicle_compatibility, activeVehicleCategory)` BEFORE rendering (filter-out pattern, NOT keep-visible-suppress — addons are optional so there's no value in showing a "you can't add this" affordance for one). Layer 2 — new `_addon-vehicle-compat.ts` (`checkAddonsVehicleCompatible` + `addonVehicleIncompatibleErrorMessage`); `/api/book/route.ts` invokes against the shared `addonServiceRows` (extended in this session to include `vehicle_compatibility` — now serves 4 consumers: W2 + W3 + W4 + W7 in one query). Mirrors `_mobile-eligibility.ts` first-fail-by-array-order behavior. Empty/null `vehicle_compatibility` = compatible-with-all. Error wording closes with "Please remove it and try again." — DIFFERENT closer from W5 because addons are resolvable client-side (no staff escalation needed). 14 unit tests pin the rule. |
| **C-Open** | (Product decision — not a fix) | `pricing_model` immutability has no documented rationale and no UI surfacing | Q4 from catalog audit — operator decides: (a) keep + document; (b) build edit support with data-migration story; (c) accept indefinitely | Out of fix-arc scope per operator's directive | N/A |

### Recommended fix arc

**Session U-B.1 (HIGHEST URGENCY, can ship immediately):** N1 + W2 + W6 — three small surface-area fixes with zero gated decisions. ~80 lines across 4 files. Adds Step 2 Back button + server `mobile_eligible` check + surfaces `special_requirements` on Step 2 cards. **Memory #8 safe.**

**Session U-B.2 (after Q-A operator decision):** W1 alone — `classification` filter at Step 2 list + server. Gated on operator confirming "only primary on Step 2" is canonical (vs. coincidental).

**Session U-B.3 (after Q-B operator decision):** W3 alone — `staff_assessed` resolution per chosen path (a/b/c).

**Session U-B.4 (after Q-C operator decision):** W4 alone — `is_taxable` honoring path. Likely the largest session if (a) chosen.

**Session U-B.5 (standalone):** W5 + W7 — prereq enforcement on public booking + addon vehicle_compat. Reuses POS prereq check; W7 is a 2-line list filter. Estimated medium effort. **Memory #8 safe at ~150 lines.**

**Parallelization opportunity:** U-B.1 can ship alongside any of U-B.2/3/4 if operator answers Q-A/B/C concurrently. U-B.5 is independent of all others.

### Open operator questions

- **Q-A (gates W1):** Is "only primary classification on Step 2" a canonical rule, or did the wizard simply default to showing everything because the filter was overlooked? If canonical, W1 ships as-is; if not, change W1 to a documentation note instead.
- **Q-B (gates W3):** What should `staff_assessed=true` do on the public booking surface — (a) hide entirely, (b) surface a "request quote" CTA instead of "book", or (c) deprecate the flag?
- **Q-C (gates W4):** Should `is_taxable` apply at booking-deposit time (and be reflected on the customer's confirmation/receipt), or is tax intentionally deferred to POS finalization?
- **Q-D (Concern C):** `pricing_model` mutability — keep immutable and document the rationale, or build edit support with a data-migration story for orphaned tier rows?
- **Q-E (sibling E5):** Should backward navigation also use `pushState` so browser back walks the wizard rather than exiting the page? (Currently `replaceState` only.)

---

## Target E — Sibling findings (incidental)

Spotted while auditing; not part of the three concerns. Surface so the operator can decide scope.

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| **E1** | Minor | Step 2 empty state ("No services are available for this vehicle type…") exists and is informative — no improvement needed | `step-service-select.tsx:679–683` |
| **E2** | Minor | Step 2 loading state — none. The Step 2 list renders directly from server-fetched categories prop; no skeleton. Not a bug given the page is server-rendered with the data, but worth noting if a future redesign moves to client-fetch | `step-service-select.tsx` (no Suspense / loading fallback) |
| **E3** | Minor | Step 3 loading + empty states are present and informative | `step-schedule.tsx:222–231` |
| **E4** | Minor | Mobile step indicator (`step-indicator.tsx:76–104`) shows only colored dots — neither labels nor explicit aria-current for the dot variant. Combined with N1, mobile users have an even weaker back signal than desktop | `step-indicator.tsx:76–104` |
| **E5** | Moderate | Wizard uses `window.history.replaceState` (`booking-wizard.tsx:613`) on every step change, NOT `pushState`. Browser back exits the booking page entirely rather than walking the wizard backward. Inconsistent with user expectation of "back = previous step." May reinforce the operator's "no way back" perception | `booking-wizard.tsx:613` — **✅ RESOLVED Session #133 (U-B.1)** — `updateUrl` accepts `isInitial` flag: mount + confirmation-clear retain `replaceState`; step transitions now `pushState`. New `popstate` listener rehydrates step + state from fresh `window.location.search` via refactored `getInitialState(paramsArg?)`. |
| **E6** | Minor | Customer-facing self-service size dropdown is restricted to 3 size_classes (`CUSTOMER_SELF_SERVICE_SIZE_CLASSES`); exotic/classic are routed to the SpecialtyVehicleBlock callback flow. This is intentional and correct per CLAUDE.md Rule 19; flagging only because admin operators may not realize the public dropdown shows only 3 options vs. admin's full 5 | `step-vehicle.tsx:498–525`, `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` constant |
| **E7** | Minor | Specialty Vehicle Block fires telemetry on view (`specialty-vehicle-block.tsx:30–43`) AND has its own back path (ArrowLeft → `onEditVehicle`). The back path is clearer than Step 2's because the button is large and labeled — consider mirroring this pattern when fixing N1 | `specialty-vehicle-block.tsx:30–43` |
| **E8** | Minor | Per `PUBLIC_BOOKING_FLOW_AUDIT.md:31, 651–653`, F2/F3 (RV/Boat/Aircraft custom-quote gating) remain open pending operator Q1/Q2 from that audit. Cross-reference for future booking-flow work | `docs/dev/PUBLIC_BOOKING_FLOW_AUDIT.md:651–653` |
| **E9** | Minor | The deposit transaction's line items carry `is_taxable: false` HARDCODED, with comment-justified non-taxability ONLY for the mobile fee (CDTFA Pub 100, `api/book/route.ts:523`). The service + addon `is_taxable: false` at `:492, :511` has NO comment explaining why. If W4 path (a) is chosen, this becomes the natural fix site | `api/book/route.ts:492, 511, 537` |

---

## Hard-rules verification

- ✅ **Worktree isolation** — audit performed in `~/Claude/SmartDetails/wt-unit-b` on branch `audit/public-booking-navigation-and-admin-option-wiring`, base `b1668c62` (Unit A's merge commit)
- ✅ **No source / migration / test changes** — read-only throughout
- ✅ **No DB writes** — no live DB queries either; all evidence from source + schema doc
- ✅ **File:line citations** for every claim
- ✅ **Verified against actual code** (Memory #11) — every "honored" claim is backed by the code path that honors it; every "dead" claim is backed by the absence (grep-confirmed)
- ✅ **Concern C is retrieval, not interpretation** — exact extracts cited verbatim from `CATALOG_CRUD_WIRING_AUDIT.md` lines 32, 82, 129, 212, 225, 244–245; the audit's "no rationale" finding is the AUDIT's own conclusion, not new analysis

---

## Cross-references

- `docs/dev/PUBLIC_BOOKING_FLOW_AUDIT.md` (d5ea9e65) — prior public-booking audit; F1 resolved via #131, F2/F3 still open
- `docs/dev/CATALOG_CRUD_WIRING_AUDIT.md` — source of Concern C
- `docs/dev/VEHICLE_TAXONOMY_AUDIT.md` — `vehicle_compatibility` JSONB schema
- `docs/dev/POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md` — comparison for W5 (POS prereq gating model)
- `docs/dev/DB_SCHEMA.md:2402–2436` — services table column reference
- `CLAUDE.md` Rules 11, 14, 19, 22 — component reuse, service category management, vehicle taxonomy, canonical pricing engine
