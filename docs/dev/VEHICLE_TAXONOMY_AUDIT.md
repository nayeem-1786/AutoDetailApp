# Vehicle Taxonomy Audit (2026-05-29) — schema, POS, admin, public, pricing/prereq

> Read-only diagnostic. No source / migration / test changes.
> Branch: `audit/vehicle-taxonomy-comprehensive`
> Performed in an isolated `git worktree` off `origin/main` (`464d544c`,
> the #125 merge) so the shared checkout stays undisturbed.

## Context

Two parallel concerns + folded-in prior scope:

- **Operator-reported bug (2026-05-29).** Ozone Odor Treatment (a `flat`-
  priced service) has RV Interior Clean + Boat Interior Clean as
  `required_same_ticket` prerequisites. When tapped against a Standard
  (automobile) ticket vehicle, the auto-add of the RV/Boat prereq fails
  with **"Cannot auto-add … no price configured for this vehicle size.
  Add it manually."** The operator also suspected POS may not allow
  classifying a vehicle as RV/Boat/Motorcycle/Aircraft.
- **Sibling Quotes-parity report.** An "Add New Vehicle" button is
  alleged to exist in Sale's vehicle-edit modal but not Quotes'.
- **Folded-in prior scope.** The exotic/classic admin Create-form gap
  (#125 audit confirmed) and the public-site exotic/classic leak sweep
  (#125 audit confirmed, fix arc not yet shipped). This audit references
  rather than re-derives them.

## TL;DR

1. **Schema (T1) — the foundation.** Vehicles carry **two orthogonal
   axes**: a 5-value category enum (`vehicle_category` + redundant
   `vehicle_type`) AND a size axis (`size_class` for automobiles,
   `specialty_tier` for the other 4 categories). Services declare which
   categories they support via `services.vehicle_compatibility` JSONB.
   The size axis is **shape-shared** in `service_pricing` via a single
   `tier_name TEXT` column — same column carries `'sedan'` for an
   automobile service and `'rv_up_to_24'` for an RV service. No DB
   constraint enforces which tier_name shape applies to which service.
2. **Root cause of the operator bug (T4).** `selectPricingTierForVehicle`
   (`src/lib/services/picker-engine.ts:187`) only understands automobile
   `size_class` tier_names. For a service whose `service_pricing` rows
   use `specialty_tier` values (RV/Boat/etc), the row-pattern detection
   at line 205 fails (`every(t => VEHICLE_SIZE_CLASSES_SET.has(...))`),
   the function returns `null`, and the prereq auto-add path
   (`use-validated-service-add.tsx:232`) treats `null` as
   "no-size-match" and emits the misleading toast at `:237`. There is
   **no vehicle_compatibility gate upstream** in the prereq path —
   compatibility is checked elsewhere in POS (direct catalog taps,
   `catalog-browser.tsx:284, 317`) and at the booking API
   (`api/book/route.ts:253-262`) but the prereq auto-add path **skips
   both gates**. Same gap on the server: `check-prerequisites/route.ts`
   does not filter prereqs by vehicle compatibility either.
3. **The "POS can't classify RV/Boat" hypothesis is wrong.**
   `vehicle-create-dialog.tsx` fully supports all 5 categories +
   specialty tiers (lines 209-214 + 315-345). Same dialog is mounted
   by both Sale (`ticket-panel.tsx:706`) and Quotes
   (`quote-ticket-panel.tsx:1215`). The operator's intuition that
   vehicle classification is missing in POS does not match the code.
4. **Service-availability filtering exists, with two gaps.** POS catalog
   browser checks `isServiceCompatible()` for tap-add paths but only
   shows a warning-with-override (`:476-498`) — services are never
   hidden. **Two paths skip the check entirely:** prereq auto-add (the
   reported bug, root cause above) and the server-side
   check-prerequisites endpoint. Public service detail pages render any
   service regardless of vehicle type — likely intended (customers with
   boats need to find boat services) but worth confirming.
5. **Quotes "Add New Vehicle" sibling — looks closed.** Both
   `ticket-panel.tsx:691-699` and `quote-ticket-panel.tsx:1200-1208`
   mount `<VehicleSelector>` identically and pass an `onAddNew` handler
   that opens `<VehicleCreateDialog>` in create mode. Edit-mode wiring
   (G2) was resolved in Session #120
   (`SALE_VS_QUOTES_PARITY_SWEEP.md:33`). The button label is
   `"Add Vehicle"` at `vehicle-selector.tsx:101` in both flows. **The
   audit could not reproduce a missing "Add New Vehicle" button.**
   Likely a stale observation or a different surface the operator should
   re-screenshot.
6. **Fix-arc shape.** ONE foundational session unblocks Concern A,
   ~3 sessions for the public-site adoption arc (already shaped by
   #125), and a sub-session for the structural test guard. Schema is
   **already correct** for the operator's use case — no migration
   needed. Total ~5 sessions.

---

## TARGET 1 — Schema reality (foundation)

### T1.1 — Vehicle-classifying columns

`vehicles` table (`docs/dev/DB_SCHEMA.md:3035-3068`):

| Column | Type | Constraint | What it classifies | Cardinality |
|--------|------|------------|---------------------|-------------|
| `vehicle_category` | TEXT NOT NULL DEFAULT `'automobile'` | CHECK: 5 values (`automobile`, `motorcycle`, `rv`, `boat`, `aircraft`) | Category axis | 1 row, 1 value |
| `vehicle_type` | `vehicle_type` enum NOT NULL DEFAULT `'standard'` | enum: `standard`, `motorcycle`, `rv`, `boat`, `aircraft` | Category axis — **redundant** with `vehicle_category` for non-automobile rows | 1 row, 1 value |
| `size_class` | `vehicle_size_class` enum (nullable) | enum: `sedan`, `truck_suv_2row`, `suv_3row_van`, `exotic`, `classic` | **Automobile size axis only** | nullable; null for non-automobile vehicles |
| `specialty_tier` | TEXT (nullable) | CHECK: 11 values (`standard_cruiser`, `touring_bagger`, `rv_up_to_24`, `rv_25_35`, `rv_36_plus`, `boat_up_to_20`, `boat_21_26`, `boat_27_32`, `aircraft_2_4`, `aircraft_6_8`, `aircraft_turboprop`) | **Specialty (non-automobile) size axis** | nullable; null for automobiles |
| `size_class_manual_override` | BOOLEAN NOT NULL DEFAULT false | — | Staff-override flag protecting `size_class` from auto-reclassifier (Memory #19 / CLAUDE.md Rule 19) | 1 row, 1 value |

**Redundancy flag.** `vehicle_category` (TEXT + CHECK, 5 values) and
`vehicle_type` (enum, 5 values) overlap heavily. `vehicle_type` carries
`standard` where category carries `automobile` — `categoryToCompatibilityKey()`
(`src/lib/utils/vehicle-categories.ts:88-90`) is the bridge function
(`automobile → 'standard'`, else identity). Two columns saying nearly the
same thing in two slightly different vocabularies. Not blocking; worth
filing a future consolidation TODO. The DB has both; the app reads both.

### T1.2 — How vehicle TYPES are stored on services

`services.vehicle_compatibility` JSONB NOT NULL DEFAULT `'["standard"]'::jsonb`
(`DB_SCHEMA.md:2422`). String-array of compatibility keys using the
"standard for automobile" vocabulary (matches `vehicle_type` enum, not
`vehicle_category`).

- Default `["standard"]` → automobile-compatible only.
- Operator-edited via the admin Vehicle Compatibility checkbox group
  (`src/app/admin/catalog/services/[id]/page.tsx:1114-1126` + identical
  block in `new/page.tsx:393-400`) — 5 checkboxes from
  `ALL_VEHICLE_TYPES: VehicleType[] = ['standard', 'motorcycle', 'rv', 'boat', 'aircraft']`.
- **No DB constraint** on JSONB shape — any string array passes. The
  app enforces vocabulary at the UI layer.
- **DRY gap:** `ALL_VEHICLE_TYPES` is duplicated literal in
  `new/page.tsx:43` and `[id]/page.tsx:87`; `VEHICLE_CATEGORIES` in
  `vehicle-categories.ts:9-15` is the canonical list (5 values, same
  set). Not blocking; flag for the next constants pass.

### T1.3 — `size_class` vs vehicle TYPE — relationship

Hypothesis (c) is correct, with shape-sharing in `service_pricing`:

- **vehicles row** carries BOTH a category (`vehicle_category` +
  `vehicle_type`) AND a size axis (`size_class` for automobiles,
  `specialty_tier` for the other 4 categories). The two axes are
  hierarchical: `vehicle_category = 'automobile'` ⇒ use `size_class` (5
  values); else use `specialty_tier` (the matching 2-3 sub-values from
  `SPECIALTY_TIERS[category]` at `vehicle-categories.ts:38-58`).
- **`service_pricing` rows** carry a **single `tier_name TEXT`
  column** that can hold EITHER a `size_class` value (e.g. `'sedan'`)
  OR a `specialty_tier` value (e.g. `'rv_up_to_24'`) OR a free-form
  scope/specialty tier name (e.g. `'floor_mats'`). No CHECK constraint.
  Same column, two domains.

**This shape-sharing is the load-bearing decision** — and it is the
proximate cause of T4's bug. The row-pattern detection in
`selectPricingTierForVehicle` (lines 203-208) decides "is this a
vehicle-size-tier service?" by checking `every(t => VEHICLE_SIZE_CLASSES_SET.has(tier_name))`.
For a `vehicle_size`-model service with `tier_name ∈ {sedan, truck_suv_2row, …}`
the predicate is true and the function matches by tier_name. For a
`specialty`-model service with `tier_name ∈ {rv_up_to_24, …}` the
predicate is false and the function falls through to `return null` —
that null is correct (it really has no automobile-size tier to match),
but the caller's interpretation of the null is wrong (T4).

The 5-category × 2-size-axis model **is internally consistent at the
DB layer**. Every gap below is an application-layer omission — not a
schema bug. No migration is needed for any fix in this audit.

---

## TARGET 2 — POS vehicle classification UX

### T2.1 — Vehicle-creation UX (POS)

`src/app/pos/components/vehicle-create-dialog.tsx` supports the full
taxonomy:

- **Category selector** (`:205-214`) renders all 5 values from
  `VEHICLE_CATEGORIES`.
- **Size/tier selector** (`:311-345`) renders:
  - For `automobile`: all 5 `VEHICLE_SIZE_CLASS_KEYS` (including
    exotic + classic — see Rule 19).
  - For non-automobile: the category's matching `SPECIALTY_TIERS`
    options (e.g. RV → 3 length tiers).
- **Tier label adapts** via `TIER_DROPDOWN_LABELS`
  (`vehicle-categories.ts:64-70`): "Size Class" / "Type" / "Length" /
  "Class".
- **Edit mode** reads `editVehicle.vehicle_category` (with fallback
  inference from `vehicle_type === 'standard'`) at `:67`.

**Mounted identically by Sale and Quotes** — see T5.

**Verdict:** the operator's hypothesis "POS may not allow selecting
RV/Boat/etc" does not hold. The UI is in place. The bug is downstream
(T4).

### T2.2 — Catalog browse with a Standard ticket vehicle

POS catalog browser (`src/app/pos/components/catalog-browser.tsx`):

- `isServiceCompatible(service)` at `:185-193` reads
  `service.vehicle_compatibility` + ticket vehicle's `vehicle_category`,
  bridges via `categoryToCompatibilityKey()`, returns false when
  service doesn't include the ticket vehicle's category key.
- Direct add (`handleTapServiceDirect:317`) and detail-tap
  (`handleTapService:284`) **show a warning dialog** (`:476-498`):
  "{Service} is designed for {compatible categories}. The vehicle on
  this ticket is {category}. Continue anyway?" with **Cancel** and an
  override that re-enters `handleTapServiceDirectUnchecked`.
- **Services are NEVER hidden** from the catalog. They render, can be
  tapped, and the warning is the only gate.

So: with a Standard ticket vehicle, RV Interior Clean appears in the
catalog. Tapping it shows the compatibility-warning dialog. Confirming
the override proceeds to the standard add path — which then routes
through `routeServiceTap → selectPricingTierForVehicle(rvIcleanPricing, 'sedan')`,
which returns null (specialty tier_names don't match), which falls
through to `open-picker-dialog` (`picker-engine.ts:291`). The manual
picker renders the RV's specialty tiers. The operator can pick one. So
the **direct-tap** path is degraded-but-functional.

**The prereq auto-add path is what breaks.** It does not call the
manual picker on null — it emits the misleading error and aborts.

### T2.3 — Booking wizard (customer-facing)

`src/components/booking/step-vehicle.tsx`:

- Full 5-category support (`VEHICLE_CATEGORIES` imported at `:12`,
  category selector renders all five at `:82`).
- For `automobile`, manual `size_class` dropdown is restricted to the
  3 customer-self-service values (per `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`
  from #125 audit); exotic/classic only via classifier auto-detection
  (lines 160-168).
- For specialty categories, full per-category specialty-tier dropdown
  (`SPECIALTY_TIERS[category]`).

`src/app/api/book/route.ts:253-262` enforces vehicle/service
compatibility server-side:
```ts
const compatKey = categoryToCompatibilityKey(vehicleResult.vehicle_category as ...);
const compatibility = Array.isArray(serviceRow.vehicle_compatibility) ? ... : [];
if (compatibility.length > 0 && !compatibility.includes(compatKey)) {
  return NextResponse.json(
    { error: `This service is not available for ${categoryLabel} vehicles. ...` },
    { status: 400 }
  );
}
```

Customer-facing flow is end-to-end correct.

---

## TARGET 3 — Service availability filtering

### T3.1 — POS catalog filter today

Current behavior: **option (c) for catalog, none for prereq.**

| Path | What it does today |
|------|--------------------|
| Catalog direct-tap (`handleTapServiceDirect`) | Warns with override (`catalog-browser.tsx:317`) |
| Catalog detail-tap (`handleTapService`) | Warns with override (`catalog-browser.tsx:284`) |
| `ServiceDetailDialog` "Add to Ticket" | Routes through `onPrerequisiteCheck` → `useValidatedServiceAdd` → `addServiceChecked` (but no compat re-check at this layer) |
| **Prereq auto-add** (`use-validated-service-add.tsx:208-255`) | **Zero compat check.** Goes straight to `selectPricingTierForVehicle`; null → misleading error |
| **`check-prerequisites` API route** (`src/app/api/pos/services/check-prerequisites/route.ts`) | Does NOT filter prereqs by compatibility; returns all configured prereqs regardless of vehicle |

Three layered gaps:
1. **Server returns incompatible prereqs.** A Standard vehicle ticket
   asking "what prereqs does Ozone need?" gets back RV Interior Clean +
   Boat Interior Clean — incompatible with this vehicle.
2. **Client offers them in the dialog.** `PrerequisiteWarningDialog`
   renders "Add a prerequisite" buttons for both. Operator picks one.
3. **Auto-add tries to price it.** Hits T4's null → misleading error.

If the SERVER filtered the prereq list by compat, the dialog would
have nothing to offer for an incompatible config — clearer state
("you can't add Ozone to this vehicle; configure it with at least one
auto-compatible prereq, or change the vehicle").

### T3.2 — Public website service availability

`src/lib/data/services.ts:117, 159` projects services with no vehicle-
compatibility filter — both `getServicesByCategory()` and
`getServiceBySlug()` return any service regardless of category.

Public surfaces (`/services/[categorySlug]/[serviceSlug]/page.tsx` +
`/services/[categorySlug]/page.tsx`) render whatever the data layer
returns. There is no read of `vehicle_compatibility` on the public
side.

**Likely intentional** — a customer with a boat needs to find Boat
Interior Clean. But this is an operator decision, surfaced below
(T10/Q1).

The specialty-tier price columns are surfaced via `ScopePricing` /
`SpecialtyPricing` in `service-pricing-display.tsx:258-322` (#125
audit). For a `specialty` pricing model the tier labels (e.g. "Up to
24'", "25-35'") are customer-friendly enough.

---

## TARGET 4 — Pricing / prereq logic interaction with vehicle type

### T4.1 — `selectPricingTierForVehicle` is size_class-only

`src/lib/services/picker-engine.ts:187-217`. Signature:

```ts
export function selectPricingTierForVehicle(
  pricing: ServicePricing[],
  vehicleSizeClass: VehicleSizeClass | null,
): ServicePricing | null
```

It takes a `VehicleSizeClass` (5 automobile values) only. It has no
access to `vehicle_category`, `vehicle_type`, or `specialty_tier`.

Row-pattern detection at `:203-208`:
```ts
const isVehicleSizeTiers =
  pricing.length > 1 &&
  pricing.every((t) => VEHICLE_SIZE_CLASSES_SET.has(t.tier_name));
if (isVehicleSizeTiers) {
  return pricing.find((t) => t.tier_name === vehicleSizeClass) ?? null;
}
```

For a `specialty` service with `tier_name ∈ {rv_up_to_24, rv_25_35, rv_36_plus}`:
- `every(...)` is false (none of those are in `VEHICLE_SIZE_CLASSES_SET`).
- Falls through to the column-pattern check (`length === 1 && is_vehicle_size_aware`) — also false for `specialty`.
- Returns `null` at `:216` ("unrecognized multi-tier shape (scope/specialty)").

This is **correct by spec** — the comment at `:215` even says scope/specialty
shapes return null and the caller decides. Picker-engine tests
(`picker-engine.test.ts:376, 543`) lock this behavior.

### T4.2 — The prereq auto-add bug — root cause

`src/app/pos/hooks/use-validated-service-add.tsx:208-255` (`handleAddPrerequisite`):

```ts
const prereqPricing = prereqService.pricing ?? [];
if (prereqPricing.length > 0) {
  const tier = selectPricingTierForVehicle(prereqPricing, vehicleSizeClass);
  if (!tier) {
    toast.error(`Cannot auto-add "${prereqService.name}": no price configured for this vehicle size. Add it manually.`);
    return;
  }
  await onAdd(prereqService, tier, vehicleSizeClass, undefined, prereqOpts);
  ...
} else if (prereqService.flat_price != null) {
  await onAdd(prereqService, buildFlatPricing(prereqService), vehicleSizeClass, undefined, prereqOpts);
  ...
} else {
  toast.error(`Cannot auto-add ${prereqService.name} — no pricing available`);
  return;
}
```

For an RV-specialty prereq added against a Standard ticket vehicle:
- `prereqPricing.length > 0` (RV Interior Clean has 3 specialty tier rows).
- `selectPricingTierForVehicle(rvRows, 'sedan')` returns null
  (T4.1 — specialty rows don't match the size_class predicate).
- Toast fires: "Cannot auto-add … no price configured for this vehicle size."

**Three issues in one line:**

1. **Wrong gate.** The helper should ask "is this service compatible
   with my ticket vehicle?" BEFORE asking "what's the price tier?" —
   compatibility is the prior condition, not "no price for this size."
2. **Misleading message.** Even if compatibility were checked first,
   the current message would still be wrong for the size-mismatch case
   (e.g. an automobile-tiered service with no tier for the ticket's
   `size_class`). The message says "no price configured" but the
   actual condition is "tier shape doesn't match this vehicle." Two
   distinct error states — "incompatible vehicle category" vs
   "compatible but no priced tier."
3. **Helper lacks context.** Signature only takes `vehicleSizeClass`
   (no `vehicleCategory`, no `vehicle` object). The helper cannot
   check compatibility today — it would need either the full vehicle
   row or at least `vehicle_category` + `specialty_tier` passed
   through `UseValidatedServiceAddOptions`.

### T4.3 — Right-behavior options (operator decision)

| Option | What | Pro | Con |
|--------|------|-----|-----|
| **A** | Compat-check before auto-add; emit "RV Interior Clean is only available for RV vehicles" (clearer message). Block at auto-add only. | Minimal scope. Server unchanged. UX clearer. | Doesn't prevent the operator from CONFIGURING incompatible prereqs in admin. Doesn't filter the prereq DIALOG list. |
| **B** | Compat-filter at server (`check-prerequisites/route.ts` filters by ticket vehicle's compat). | Most thorough. Dialog never even offers incompatible prereqs. | Existing prereq config may now silently "satisfy" prereqs (none returned for a Standard vehicle against Ozone). Operator may see "Ozone has no prereqs needed" when the actual config is "all prereqs are incompatible with this vehicle." Needs a UI signal. |
| **C** | Forbid incompatible prereqs at admin save time. (Ozone + RV prereq → 400 error in admin.) | Catches the misconfiguration early. | Schema-level — Ozone might legitimately be configurable for cars OR boats, so "incompatible" depends on the matrix. Hard to validate at admin time without complex matrix logic. |
| **D** | Vehicle-type-aware `selectPricingTierForVehicle` — accept `specialty_tier` as the matcher when `vehicle_category !== 'automobile'`. | Pricing path becomes universal. | Doesn't address the configuration question (a Standard ticket with an RV prereq still has no valid specialty_tier to match). Still need a compat gate upstream. |

The audit takes **no stance** but notes:
- **A + B together** is the most defensible posture: server filters the
  list (B), client emits a clear message when no prereqs are available
  for this ticket (A). C is heavy-handed; D solves a problem nobody
  reported.
- A standalone (without B) does NOT make the dialog state coherent — it
  just makes the failure message clearer. The dialog would still list
  the RV/Boat prereqs as "Add" buttons.

---

## TARGET 5 — Quotes "Add New Vehicle" gap

### T5.1 — Sale reference

`src/app/pos/components/ticket-panel.tsx`:
- VehicleSelector mounted at `:691-699` with `onAddNew` opening
  `VehicleCreateDialog` in create mode (`:697`).
- VehicleCreateDialog mounted at `:706-722` with `editVehicle={editingVehicle}`
  for edit-mode dispatch.
- "Add Vehicle" button rendered inside `<VehicleSelector>` at
  `vehicle-selector.tsx:99-102`.

### T5.2 — Quotes reference

`src/app/pos/components/quotes/quote-ticket-panel.tsx`:
- VehicleSelector mounted at `:1200-1208` — **identical prop set**
  (`customerId`, `selectedVehicleId`, `onSelect`, `onAddNew`).
- VehicleCreateDialog mounted at `:1215-1231` — passes `editVehicle`
  (G2 fixed in Session #120).

`grep -rnE "Add New Vehicle"` returns no matches anywhere in the
codebase. The only label is `"Add Vehicle"` at `vehicle-selector.tsx:101`,
shared by both panels.

### T5.3 — Verdict

**Cannot reproduce a missing button.** Possibilities:
- The operator's screenshot was taken before Session #120's G2 fix landed.
- A different surface (e.g. an admin customer-detail page that does not
  use `<VehicleSelector>`) shows the gap and was mistakenly described
  as a Quotes panel issue.
- The operator means an "Add New Vehicle" entry point that should
  exist INSIDE `<VehicleCreateDialog>` while it is open in edit mode
  (a "discard edit and create new" shortcut). That entry point does
  not exist in Sale either — there is no gap, just an unbuilt feature.

**Recommendation:** before scoping a fix, ask the operator to send a
fresh screenshot of the Quotes panel with the missing button outlined,
and a corresponding Sale screenshot showing where the button exists.
The audit should not chase a phantom delta. Flagged as **needs operator
confirmation** in T10.

---

## TARGET 6 — Exotic/classic public-site suppression (folded in from #125)

See `docs/dev/EXOTIC_CLASSIC_HANDLING_AUDIT.md` (merged 2026-05-29,
`464d544c`). The single source of truth (`CUSTOMER_SELF_SERVICE_SIZE_CLASSES`)
is already in place (`src/lib/utils/constants.ts:65-79`). Three public
surfaces leak (HIGH/HIGH/LOW) + one latent booking-wizard path. Fix
shape: per-surface adoption of the existing constant; ~30 lines across
3-4 files. No new findings in this audit.

### T6 sub-note — does the exotic/classic posture extend to vehicle TYPES?

**Open operator question (T10/Q2).** Should the public website hide
Boat / RV / Motorcycle / Aircraft services from non-target customers,
analogous to how exotic/classic prices are hidden? The audit's read:
**probably not** — vehicle types are discoverability features
(customers with boats need to find Boat Interior Clean). The exotic/
classic suppression is about not advertising "exotic" prices to anyone
because exotic-ness is judgement-based and operator-gated. Vehicle type
is owned by the customer (they know they have a boat).

If the operator confirms "vehicle types are public, but exotic/classic
within `automobile` is not," the existing `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`
posture already implements this exactly. No new constant needed.

---

## TARGET 7 — Admin create-form gap (folded in from #125)

See `docs/dev/EXOTIC_CLASSIC_HANDLING_AUDIT.md` Concern A. Confirmed
still present at `src/app/admin/catalog/services/new/page.tsx:231-237`
(hardcoded 3-tier array). Edit reference at `[id]/page.tsx:608-655`.
Fix shape: ~15 lines, 1 file. No new findings in this audit.

### T7 sub-note — does the same gap exist for vehicle TYPES?

**No.** Both Create (`new/page.tsx:393-400`) and Edit
(`[id]/page.tsx:1114-1126`) render a Vehicle Compatibility checkbox
group over `ALL_VEHICLE_TYPES` (5 values). The operator can set
`vehicle_compatibility` at create time. The schema and the form match.

The duplicated `ALL_VEHICLE_TYPES` constant (vs `VEHICLE_CATEGORIES` in
`vehicle-categories.ts:9-15`) is a DRY nit, not a functional gap.

---

## TARGET 8 — Severity-ranked catalogue

| ID | Severity | Gap | Surface(s) | Fix shape | Suggested session |
|----|----------|-----|------------|-----------|-------------------|
| **V1** | **Critical** | ✅ **RESOLVED (Session #130, 2026-05-30)** — Prereq auto-add fails with misleading "no price configured for this vehicle size" when prereq is vehicle-type-incompatible | `use-validated-service-add.tsx:232-237`; `check-prerequisites/route.ts` (server doesn't filter either) | **Option A landed** — server flags each prereq with `is_compatible_with_vehicle`; `handleAddPrerequisite` blocks with a category-specific toast before invoking the selector. Override path unaffected. | **Session A** ✅ (#130, 4 prod files / +12 tests) |
| **V2** | Significant | ✅ **RESOLVED (Session #130, 2026-05-30)** — Server-side `check-prerequisites` route returns incompatible prereqs to the client (gap-class sibling of V1) | `src/app/api/pos/services/check-prerequisites/route.ts` | **Option A landed** — response now carries `is_compatible_with_vehicle` per prereq + `compatible_categories` + top-level `ticket_vehicle_category`. Incompatible prereqs NOT filtered out (transparency over filtering, per lock). | Bundled with **Session A** ✅ (#130) |
| **V3** | Significant (SEO) | Public service detail JSON-LD `AggregateOffer.highPrice` / `offerCount` leaks exotic/classic | `src/lib/seo/json-ld.ts:160-178` | Filter `pricingRows` to `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` for `vehicle_size` model. Synthesize per-customer-size offers for column-pattern. | **Session B** (1 small, ~15 lines) — from #125 |
| **V4** | Significant (visual) | Public `<VehicleSizePricing>` table renders exotic/classic columns | `src/components/public/service-pricing-display.tsx:54-113` | Filter `tiers` to `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` before sort/map | Bundle with **Session B** (~3 lines) |
| **V5** | Significant | Admin Create form silently drops operator-typed exotic/classic prices for `vehicle_size` model | `src/app/admin/catalog/services/new/page.tsx:231-237` | Mirror Edit's standard+specialty insert pattern (~15 lines, 1 file, no schema change) | **Session C** (1 small, ~15-25 lines) — from #125 |
| **V6** | Minor | Booking wizard `vehicle_size` top-level picker iterates all tier rows (latent leak — Zod rejects upstream) | `src/components/booking/step-service-select.tsx:995-1021` | Filter tiers before `.map` | Bundle with **Session B** (~3 lines) |
| **V7** | Minor | OG image `Math.min` floor iterates all `price` rows including exotic/classic | `src/app/(public)/services/[categorySlug]/[serviceSlug]/opengraph-image.tsx:32` | Filter for `vehicle_size` model | Bundle with **Session B** (~5 lines) |
| **V8** | Minor (defense in depth) | Admin allows configuring incompatible prereqs (e.g. RV prereq under Standard-only parent) | `src/app/admin/catalog/services/[id]/page.tsx` + `prereq-helpers.ts:getEditPrereqOptions` | Add a compat warning at save (not a hard block — the matrix is operator-judged); pure UX safety net | **Session D (optional)** (1 small, ~30 lines) — only if V1+V2 don't fully satisfy operator |
| **V9** | Minor (DRY) | `ALL_VEHICLE_TYPES` duplicated in `new/page.tsx:43` + `[id]/page.tsx:87`; conceptually `VEHICLE_CATEGORIES` is the source of truth | Both admin service pages | Replace literal with import of canonical constant; minor type bridge for the "standard vs automobile" vocabulary if needed | Bundle with **Session C** (small ride-along, ~6 lines) |
| **V10** | Minor (regression guard) | No per-surface integration test asserts public service detail page contains no "Exotic" / "Classic" / exotic-priced numbers for a fixture with all 5 size rows | `src/components/public/__tests__/`, `src/lib/seo/__tests__/`, `src/components/booking/__tests__/` | 3 snapshot/contract tests (~80-120 lines) | Bundle with **Session B** OR run as **Session E** standalone |
| **V11** | Operator clarification needed | Quotes "Add New Vehicle" button reported missing — audit cannot reproduce | — | None until operator confirms surface + screenshot | **No session** until reconfirmed |
| **V12** | Schema cleanup (informational) | `vehicles.vehicle_category` (TEXT+CHECK, 5 values) and `vehicles.vehicle_type` (enum, 5 values) overlap — same axis, two vocabularies (`automobile` vs `standard`) bridged by `categoryToCompatibilityKey()` | `vehicles` table | Pick one canonical column, deprecate the other across reads/writes; migration to drop the duplicate | **No session** — track as TODO; not affecting any current operation |

### Fix-arc sequencing

```
Session A (V1+V2) ────────────────────────► prereq compat ✅ #130 (2026-05-30)
                                            (independent, can run anytime)

Session B (V3+V4+V6+V7) ──────────────────► public-site exotic/classic
                                            (independent, but high-stakes SEO — schedule first)

Session C (V5+V9) ──────────────────────► admin create-form exotic/classic
                                          (independent)

Session D (V8, OPTIONAL) ───────────────► admin compat-warning at prereq save
                                          (sequenced AFTER A — depends on operator
                                          stance on T4.3 A vs B)

Session E (V10, OPTIONAL) ──────────────► regression tests
                                          (sequenced AFTER B — tests the fix)
```

All 5 sessions are Memory #8 safe (≤3 production files each; ≤300
lines). **A, B, and C can run in parallel** — no file overlap. D and E
are optional and sequenced.

**Recommended order:** B first (highest SEO stakes, hardest to un-index
once leaked). A second (operator's reported bug, blocks daily work).
C third (operator UX paper-cut, not a daily blocker). D + E if needed.

---

## TARGET 9 — Structural recommendations

### S1 — Single source of truth for vehicle categories

`VEHICLE_CATEGORIES` (`vehicle-categories.ts:9-15`) IS the source of
truth for category vocabulary. Both admin service pages should import
it instead of redeclaring `ALL_VEHICLE_TYPES`. The "standard ↔
automobile" vocabulary bridge already exists
(`categoryToCompatibilityKey()` at `:88-90`). Reuse, don't duplicate.

### S2 — `selectPricingTierForVehicle` signature

The function is currently named accurately — it selects by **size
class** only. Renaming would be cosmetic. The real question is whether
the caller's signature should pass the full vehicle so callers can
short-circuit on category mismatch before delegating to size selection.

**Recommendation:** keep `selectPricingTierForVehicle` size-class-only
(it does one thing well). Add a sibling **`assertServiceCompatibleWithVehicle()`**
helper used by all add paths (catalog direct, prereq auto-add, server
prereq filter). Returns true/false + a clear reason. Centralizes the
gate that's currently scattered across `catalog-browser.tsx:185`,
`api/book/route.ts:253`, and missing from prereq auto-add and server
check.

### S3 — Test coverage gap

The picker-engine specialty-shape behavior IS tested
(`picker-engine.test.ts:543`). But there is **no end-to-end test**
asserting "configuring an incompatible prereq → operator sees a clear
error in POS." Add as part of Session A:

- POS prereq auto-add against incompatible ticket vehicle → clear
  message, not "no price configured for this vehicle size."
- Server `check-prerequisites` for an automobile ticket against a
  service with RV-only prereqs → returns those prereqs filtered out
  (or with a `compatibility_blocked: true` flag, depending on T4.3
  posture).

This pairs with V10 (public exotic/classic snapshot guard) as the
"structural test" pattern.

---

## TARGET 10 — Open operator questions (consolidated)

| # | Question | Topic | Origin |
|---|----------|-------|--------|
| Q1 | Public website visibility for vehicle-type-gated services (RV/Boat/etc) — visible to all so customers with those vehicles can find them, OR operator-internal? | T3.2 | New (this audit) |
| Q2 | If Q1 = "public," does the exotic/classic suppression posture extend to vehicle TYPES too, or only `automobile` sub-classification? | T6 sub-note | New (this audit) |
| Q3 | Prereq auto-add behavior when prereq is incompatible with ticket vehicle — clearer error (A), server-filter (B), admin-block (C), or universal pricer (D)? | T4.3 | New (this audit) |
| Q4 | Should `addon_only` prereqs be filtered server-side at `check-prerequisites/route.ts` or only at the client dialog level? (Sibling of Q3.) | T3.1 | New (this audit) |
| Q5 | "Add New Vehicle" Quotes report — please confirm surface + send screenshot | T5 | Operator report unverified |
| Q6 | Personalized link rendering of "Exotic" / "Classic" for customers whose vehicle IS that class — always-mask, or show-on-personalized-only? | #125 B6 (folded) | Carry-over |
| Q7 | Admin Create exotic/classic empty-price semantics — confirm Edit's `priceValue > 0` predicate (matches Edit) | #125 A4 (folded) | Carry-over |
| Q8 | JSON-LD `offerCount` post-fix — 3 not 5; confirm intent | #125 B5 (folded) | Carry-over |
| Q9 | `vehicle_category` vs `vehicle_type` schema cleanup — worth a deprecation cycle? | T1.1 | New (this audit) — informational only |

---

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ No DB writes; live SELECTs were not needed (DB_SCHEMA.md is
  auto-generated from the live DB and was reviewed).
- ✅ Schema reality (Target 1) established first; all downstream
  conclusions derive from it.
- ✅ file:line citations throughout.
- ✅ Memory #11 respected — single unverifiable claim (Quotes "Add New
  Vehicle") explicitly flagged as **needs operator confirmation** (Q5)
  rather than asserted.
- ✅ Memory #19 (reuse over duplication) respected — V2 bundles with V1,
  V4/V6/V7/V10 bundle with V3 (same surface family), V9 is a DRY
  ride-along on V5.
- ✅ Audit MAPS — does not fix; does not draft code.
- ✅ Worktree isolation off `origin/main` (`464d544c`).
