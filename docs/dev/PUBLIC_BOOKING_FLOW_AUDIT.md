# Public Booking Flow Audit (2026-05-30) — form-reset bug + end-to-end flow verification

> Read-only diagnostic. No source / migration / test changes.
> Branch: `audit/public-booking-form-reset-and-flow-verification`
> Performed in an isolated `git worktree` off `origin/main` (`1dd4cac7`,
> the vehicle taxonomy audit merge) so the shared checkout stays
> undisturbed.

> **Resolution status (2026-05-30, Session #129):**
> - **F1 — RESOLVED.** `step-vehicle.tsx`'s `classify()` now refuses the
>   category auto-override when `!mdl.trim()` (Y-1 shape per A3). Classifier
>   still runs; the override only fires when the user has typed at least one
>   model character. Operator-confirmed repro blocked.
> - **F4 — RESOLVED.** All three silent-fall-through paths in
>   `resolveVehicleClassification` now emit a dev-only `console.warn`
>   (NODE_ENV-gated): 0-row `vehicle_makes` lookup, dual-category empty-
>   model disambiguation, and DB error catch. Data drift between the
>   combobox source and the resolver source is now visible in dev logs.
> - **F2 / F3 — OPEN.** Awaiting operator Q1/Q2 on the RV/Boat/Aircraft
>   custom-quote gating UX choice (B4-1.A vs .B vs .C).
> - **F5 — REFRAMED.** Per the follow-up vehicle-form unification audit
>   (`VEHICLE_FORM_UNIFICATION_AUDIT.md`, #128), F5 is intentional/
>   informational (four context-driven patterns; classifier is structurally
>   required for public booking and optionally extensible to other surfaces).
>   Session #129 implemented C3 — extending the classifier as an opt-in
>   advisory to the customer portal (`account/vehicle-form-dialog.tsx`).
> - **F6 — PARTIAL.** Session #129 adds `step-vehicle.test.tsx` with a
>   predicate-mirror test covering the C1 override gate across all four
>   non-automobile categories. Full RTL render test deferred (predicate
>   mirror + resolver tests already pin both contract ends).

## Context

Two intertwined concerns:

**CONCERN A — form-reset bug.** Operator-confirmed repro on the live
public site: customer selects a non-automobile category (RV / motorcycle
/ boat / aircraft), the make dropdown populates with category-appropriate
options, customer picks a make, and the entire form silently resets to
Automobile. Reproduces across all 4 non-automobile categories.
Effectively means non-automobile booking is impossible from the public
site today.

**CONCERN B — end-to-end booking path verification across all 5
categories.** Even if A is fixed in isolation, downstream steps (service
selection, scheduling, customer info, submission, confirmation) must
work for non-automobile categories, especially given the recent
operator rulings: Q1 (RV/Boat/Motorcycle/Aircraft services SHOULD be
customer-bookable on the public site) and Q2 (RV/Boat/Aircraft pricing
model = `custom`; motorcycle priced like automobile).

Plus folded-in **CONCERN C** — cross-surface check: is the form-reset
bug also present on POS / admin / customer-portal vehicle forms, or is
it contained to public booking?

## TL;DR

1. **Form-reset root cause = classification (a)** (`useEffect` /
   auto-effect overriding user input). Single line:
   `src/components/booking/step-vehicle.tsx:117-120`. The debounced
   `classify()` call passes through `resolveVehicleClassification()`
   (`src/lib/utils/vehicle-categories.ts:684-773`). When that resolver
   cannot uniquely match the typed make (0 rows OR a dual-category make
   with no model yet), it defaults to `'automobile'` (lines 691, 302-305,
   712-714). Back in step-vehicle the check `if (result.vehicle_category !== cat) setCategory(result.vehicle_category)`
   then **overwrites the user's explicit RV/Boat/Motorcycle/Aircraft
   selection** with `automobile`. The `<VehicleMakeCombobox>`'s
   own category-change effect (`vehicle-make-combobox.tsx:43-51`)
   clears the typed make + re-fetches the automobile makes list as a
   secondary effect. End-user sees: "the form reset."
2. **Trigger reaches every non-automobile category** because the
   default-to-`'automobile'` fallback is the resolver's universal
   "couldn't determine" answer. Not unique to one category. Matches the
   operator's "same behavior for motorcycle, RV, boat, and aircraft"
   report exactly.
3. **Fix shape (A3) is small and contained.** Two options:
   - **Option X (preferred):** restrict the auto-correction to
     **high-confidence** classifier results only. Skip the
     `setCategory` call when the resolver hit either of the two
     ambiguous paths (0-rows fallback OR dual-category empty-model
     disambiguation). ~5-line patch in `step-vehicle.tsx` plus a
     minor signal added to `VehicleClassification` (e.g. a
     `category_confidence: 'matched' | 'defaulted'` discriminator) —
     ~15 lines total across 2 files.
   - **Option Y (minimal):** trust the user's category until the
     classifier finds a **single-row matching record different from**
     the user's selection. In step-vehicle, gate the override on
     "resolver found ≥ 1 matching row AND none of those rows match the
     user's category." Single-file ~5 lines; no resolver-shape change.
   Option Y is the cheapest defensive fix; Option X is the cleanest
   semantically. The audit prefers Y for the immediate ship and X as a
   structural follow-up.
4. **End-to-end flow verification (B):** the **state graph downstream
   of Step 1 is taxonomy-complete** — `bookingVehicleSchema`
   (`validation.ts:336-351`) accepts all 5 categories +
   `specialty_tier`, `api/book/route.ts:253-262` enforces vehicle/
   service compatibility at the server, the booking-wizard service
   filter (`booking-wizard.tsx:680-689`) already filters by
   `vehicle_compatibility`, `step-service-select.tsx` auto-selects
   specialty_tier when known (line 230-238) and prices `custom`-model
   services via `service.custom_starting_price` (line 1576-1579).
   **Two downstream gaps:**
   - **B4-1 (Significant per Q2):** RV/Boat/Aircraft custom-quote
     services with no `custom_starting_price` configured produce
     `price === 0` → `canContinue = false`
     (`step-service-select.tsx:263`) → customer dead-ends with no
     callback option. The exotic/classic `SpecialtyVehicleBlock`
     callback flow (`booking-wizard.tsx:705-708`,
     `specialty-vehicle-block.tsx`) handles this case for automobile
     specialty but does NOT trigger for RV/Boat/Aircraft. Per Q2's
     "custom-quote" intent, these categories likely want the same
     callback gating. **Operator decision** — surfaced as Q1.
   - **B4-2 (Minor):** if a `custom_starting_price` IS set, the flow
     proceeds as a standard booking — which contradicts Q2's
     "custom-quote = staff reaches out" semantics. The "From $X"
     display becomes a customer commitment, not a quote starting point.
5. **Cross-surface (C):** the bug is **contained to public booking**.
   `pos/vehicle-create-dialog.tsx` and `account/vehicle-form-dialog.tsx`
   (`grep -nE "resolveVehicleClassification|classification\.vehicle_category"`
   returns no matches in either) **do not call the auto-classifier
   at all** — they accept category + make + model + size/tier as
   independent operator inputs and never auto-override. This is a
   **silver lining of Memory #19's "two independent vehicle-form
   patterns" concern** in the prior taxonomy audit (T7 note) — the
   public-booking auto-classifier is the only path that has this
   defect.
6. **Fix-arc shape:** 1 small session (~30 minutes) ships the
   form-reset fix as a hotfix. 1 medium session (when Q1 lands) handles
   the RV/Boat/Aircraft custom-quote gating. The hotfix is independent
   of the V1 prereq fix (Session A in the prior arc) and the public
   exotic/classic suppression (Session B). All three can ship in
   parallel.

---

## CONCERN A — Form-reset bug

### A1 — Booking form location

| Surface | File:line |
|--------|-----------|
| Route entry point | `src/app/(public)/book/page.tsx` (207 lines) — server component that fetches categories/zones/etc and mounts `<BookingWizard>` |
| Wizard controller | `src/components/booking/booking-wizard.tsx:87-104` — `BookingState` interface; `useState` driver; `step` integer 1-4; no Zustand, no Context |
| Step 1 component | `src/components/booking/step-vehicle.tsx` (514 lines) — the surface where the bug originates |
| Category dropdown | `step-vehicle.tsx:355-379` — 5 buttons over `VEHICLE_CATEGORIES`, calls `handleCategoryChange(cat)` on click |
| Make dropdown | `step-vehicle.tsx:382-393` — `<VehicleMakeCombobox>` controlled by `make` state |
| Form state | All `useState` in `step-vehicle.tsx:71-104`: `mode`, `selectedVehicleId`, `category`, `make`, `model`, `year`, `color`, `classification`, `classifying`, `manualSizeClass`, `manualSpecialtyTier`, `errors` — 12 independent useState slots |

State management is **plain `useState` per slot**, not react-hook-form
or Zustand. The "form reset" the operator sees is therefore not a
form-library reset — it is an **explicit programmatic `setCategory`
call** followed by cascading effects.

### A2 — Trace + root cause

#### A2.1 — The triggering effect chain

The reset originates in two cooperating effects:

**Effect #1 — debounced classification** (`step-vehicle.tsx:129-138`):

```ts
useEffect(() => {
  if (mode !== 'manual' || !make.trim()) {
    setClassification(null);
    return;
  }
  const timer = setTimeout(() => {
    classify(make, model, category);
  }, 400);
  return () => clearTimeout(timer);
}, [make, model, category, mode, classify]);
```

Fires whenever `make`, `model`, `category`, `mode`, or `classify`
change. With a 400 ms debounce. When the user picks an RV make, this
fires `classify('<makeName>', '', 'rv')` 400 ms later.

**`classify`** (`step-vehicle.tsx:107-126`):

```ts
const classify = useCallback(async (mk: string, mdl: string, cat: VehicleCategory) => {
  if (!mk.trim()) { setClassification(null); return; }
  setClassifying(true);
  try {
    const supabase = createClient();
    const result = await resolveVehicleClassification(supabase, mk.trim(), mdl.trim() || undefined);
    setClassification(result);
    // Auto-update category if classification disagrees (e.g., Honda motorcycle)
    if (result.vehicle_category !== cat) {
      setCategory(result.vehicle_category);                          // ← the override
    }
  } catch {
    setClassification(null);
  } finally {
    setClassifying(false);
  }
}, []);
```

**Lines 117-120 are the bug.** The comment captures the original
intent ("Honda motorcycle" — user picks automobile, classifier knows
better, correct it) but the override fires **whenever the resolver's
returned category differs from the user's picked one** — including
when the resolver defaulted to `'automobile'` because it couldn't
determine the category.

#### A2.2 — Why the resolver defaults to `'automobile'`

`src/lib/utils/vehicle-categories.ts:684-773` (`resolveVehicleClassification`):

```ts
let category: VehicleCategory = 'automobile';       // line 691 — INITIAL DEFAULT
if (make) {
  try {
    const { data: makeRows } = await (supabase as any)
      .from('vehicle_makes')
      .select('category')
      .ilike('name', make.trim())                   // case-insensitive exact
      .eq('is_active', true);

    const validRows = (makeRows || []).filter(
      (r: { category: string }) => VEHICLE_CATEGORIES.includes(r.category as VehicleCategory)
    );

    if (validRows.length === 1) {
      category = validRows[0].category as VehicleCategory;
    } else if (validRows.length > 1) {
      const categories = validRows.map((r: { category: string }) => r.category);
      category = disambiguateCategory(categories, model);
    }
    // ELSE: validRows.length === 0 → category stays 'automobile'
  } catch {
    // DB unavailable → category stays 'automobile'
  }
}
```

And `disambiguateCategory` at `:298-347`:

```ts
function disambiguateCategory(categories: string[], model: string | null | undefined): VehicleCategory {
  if (!model) {
    console.warn('[VehicleClassify] Dual-category make with no model — defaulting to automobile');
    return 'automobile';
  }
  ...
}
```

**Three default-to-automobile paths** — all firing without warning to
the user:

1. **`validRows.length === 0`** — make not found in `vehicle_makes`.
2. **Dual-category make with empty `model`** (`:302-305`) — the
   400 ms debounce fires BEFORE the user has typed a model, so `model`
   is empty (the `onChange` at `step-vehicle.tsx:388` explicitly clears
   model on make change: `if (val !== make) setModel('')`).
3. **DB error / network failure** — silent catch at `:712-714`.

For an RV-category user picking an RV-only make like Winnebago, path 1
would happen ONLY if Winnebago is missing from `vehicle_makes` (data
gap). For a dual-category make like Yamaha (motorcycle + boat),
path 2 fires every time because model isn't typed yet.

**Hot path that hits everyone:** the model field is cleared on every
make change at `step-vehicle.tsx:388`. The 400 ms classifier fires
before the user can type a model. So path 2 is the **primary trigger
for any dual-category make**, and path 1 is the trigger for any make
not in the table (and any case where the table's `name` doesn't
exactly match the combobox's display value — e.g. trailing
whitespace, accents, etc).

#### A2.3 — The visible cascade

Once `setCategory('automobile')` fires:

1. `step-vehicle.tsx`'s `category` state → `'automobile'`.
2. The `<VehicleMakeCombobox>` receives the new `category` prop.
3. Its category-change effect at `vehicle-make-combobox.tsx:43-51`
   detects `prevCategoryRef.current !== category` → calls
   `onChange('')` → step-vehicle's `setMake('')`.
4. Same effect calls `setSearch('')` and `setIsOtherMode(false)`.
5. The fetch effect at `:67-86` runs against the new category, replaces
   the makes list with `automobile` makes.
6. The user sees: category buttons reset to "Automobile" highlighted,
   make field cleared, dropdown showing automobile makes.

**This matches the operator's report verbatim.**

#### A2.4 — Classification of the root cause

| Option | Match | Notes |
|--------|-------|-------|
| (a) `useEffect` on category change that fires when make changes (dep array) | **YES** | Effect at `step-vehicle.tsx:129-138` depends on `[make, model, category, mode, classify]`; make change triggers it; `classify` then calls `setCategory`, which re-runs the effect (no infinite loop because once the override applies, classifier returns same value). |
| (b) Controlled-component value-fallback defaulting to `'automobile'` | partial | The initial default IS `'automobile'` (resolver `:691`), but the runtime trigger is (a). |
| (c) Form key that remounts on selection | no | No `key` prop on the form or wizard tied to make/category. |
| (d) Make-selection API failure → reset to defaults | partial | If `/api/vehicle-makes` or `vehicle_makes` query errors, the resolver's catch (`:712-714`) returns `automobile` — same downstream cascade. Symptom-equivalent but not the primary trigger. |
| (e) State keyed by category | no | No effect resets state on key change. |

**Classification: (a)**. The override line `step-vehicle.tsx:119` is
the proximate cause; the default-to-`automobile` resolver behavior at
`vehicle-categories.ts:691, 302-305, 712-714` is the upstream
contributor.

### A3 — Fix recommendation

Two viable shapes; preferred sequence is **Y first (hotfix), X next**.

#### A3.Y — Minimal hotfix (~5 lines, 1 file)

Modify `step-vehicle.tsx:117-120` to only override when the classifier
has positive evidence the user is wrong. Two reasonable triggers:

```ts
// Trust the user's category unless the classifier found a positive
// single-row match in a different category. Multi-row disambiguation
// without a model + empty-row + DB errors all silently default to
// 'automobile' — those are "couldn't determine," not "user is wrong."
const classifierConfident = /* signal from resolver — see below */;
if (classifierConfident && result.vehicle_category !== cat) {
  setCategory(result.vehicle_category);
}
```

Two ways to surface the signal without breaking the resolver's
interface (Option Y stays single-file by reading existing data — the
resolver already returns `vehicle_category` and the call site doesn't
know whether it was a default or a match):

- **Y-1:** swallow the override for the empty-model case at the call
  site: `if (!model.trim()) { return; }` — refuse to auto-correct
  until the user has typed at least one model character. This kills
  the dual-category empty-model path (the most-impactful trigger),
  leaves the single-row-match case intact (rarely fires before a
  model is typed in practice), and accepts the unfixable "make not in
  table" path as out-of-scope-for-hotfix.
- **Y-2:** treat any `vehicle_category === 'automobile'` returned by
  the classifier as **non-overriding** when the user's `cat !==
  'automobile'`. Crude but effective — privileges the user's explicit
  non-default choice. Side effect: a customer who picks RV for a
  Honda Civic won't be auto-corrected. Acceptable because the
  classifier was wrong about classifying a Civic as RV in the first
  place — the operator can correct at admin/POS later.

Both Y options are ~3-5 lines and ship as a focused hotfix.
**Recommend Y-1** because it preserves the resolver's "Honda
motorcycle vs car" auto-correction value for cases where the user has
typed at least a model character.

#### A3.X — Structural fix (~15 lines, 2 files)

Add an explicit confidence signal to `VehicleClassification`:

```ts
// vehicle-categories.ts:625-644
export interface VehicleClassification {
  vehicle_category: VehicleCategory;
  category_source: 'single-row-match' | 'disambiguated' | 'defaulted'; // new
  ...
}
```

Populate `category_source` at the 3 branch points in
`resolveVehicleClassification`. In step-vehicle, gate the override:

```ts
if (result.category_source === 'single-row-match' &&
    result.vehicle_category !== cat) {
  setCategory(result.vehicle_category);
}
```

(Optionally also accept `'disambiguated'` if a model is present, since
that signals real evidence.) Semantically cleaner; ships after the
hotfix. Touches the resolver and its tests.

### A3 — Empty-table-row hardening (separate, follow-up)

Independent of the override, the resolver's silent default behavior
masks data-quality bugs. Make `vehicle_makes` lookups warn (a
non-blocking dev-console line is fine in prod) when a known make from
the combobox falls into the 0-row path — that means the combobox and
resolver disagree on the same name and the schema-level UNIQUE
constraint isn't catching the drift. Out of scope for the hotfix;
worth a follow-up.

---

## CONCERN B — End-to-end flow verification per category

Walked the booking wizard stage-by-stage. Matrix below per category.
Legend: ✅ works · ⚠ works with caveat · 🛑 broken · ➖ N/A.

| Stage | Surface | Automobile | Motorcycle | RV | Boat | Aircraft |
|-------|---------|:---:|:---:|:---:|:---:|:---:|
| **B1 Category selection** | `step-vehicle.tsx:355-379` (5 buttons over `VEHICLE_CATEGORIES`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B2 Make dropdown population** | `vehicle-make-combobox.tsx:75` → `/api/vehicle-makes?category=<cat>` → `vehicle_makes WHERE category = ...` (`api/vehicle-makes/route.ts:14`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B2 Make selection** | `step-vehicle.tsx:386-390` + the bug at `:117-120` | ✅ | 🛑 (CONCERN A) | 🛑 | 🛑 | 🛑 |
| **B3 Size / specialty_tier picker** | `step-vehicle.tsx:440-466` (automobile, 5 sizes incl. exotic/classic) + `:468-492` (specialty, per-category tiers from `SPECIALTY_TIERS`) | ✅ | ⚠ (motorcycle has 2 tiers `standard_cruiser` / `touring_bagger`; both render) | ✅ | ✅ | ✅ |
| **B3 — exotic/classic auto-gate to specialty-block** | `booking-wizard.tsx:705-708` checks `size_class === 'exotic' \|\| 'classic'` → `<SpecialtyVehicleBlock>` callback form | ⚠ (only fires for automobile sub-types) | ➖ | ➖ | ➖ | ➖ |
| **B4 Service list filter by vehicle_compatibility** | `booking-wizard.tsx:680-689` (`categoryToCompatibilityKey` + `compat.includes(key)`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B4 Service pricing display — vehicle_size model** | `step-service-select.tsx:1448+` switch | ✅ | ➖ | ➖ | ➖ | ➖ |
| **B4 Service pricing display — specialty model** | switch case `specialty` + auto-select via `vehicleSpecialtyTier` (`:230-238`) | ➖ | ⚠ (uses `specialty` model with motorcycle tiers) | ⚠ | ⚠ | ⚠ |
| **B4 Service pricing display — `custom` model** | `step-service-select.tsx:1576-1579` returns `From $custom_starting_price`; `computePrice` returns `custom_starting_price ?? 0` (`:1383`) | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ |
| **B4-1 RV/Boat/Aircraft custom-quote gate** (per Q2) | **MISSING** — no equivalent of `<SpecialtyVehicleBlock>` for these categories | ➖ | ➖ | 🛑 | 🛑 | 🛑 |
| **B4-2 RV/Boat/Aircraft auto-bookable when `custom_starting_price` set** (per Q2 contradiction) | `canContinue` (`:263`) becomes true if price > 0 → standard booking path | ➖ | ➖ | ⚠ | ⚠ | ⚠ |
| **B5 Scheduling** | `step-schedule.tsx` (377 lines, no category-specific branches) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B6 Customer info / submission** | `step-confirm-book.tsx`; POSTs to `/api/book` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B6 Server validation** | `bookingVehicleSchema` (`validation.ts:336-351`) accepts all 5 categories + `specialty_tier: optionalString` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B6 Server compat enforcement** | `api/book/route.ts:253-262` rejects with 400 if service.vehicle_compatibility excludes the vehicle category | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B6 Vehicle row persistence** | `api/book/route.ts:240-249` inserts `vehicle_category`, `vehicle_type`, `size_class`, `specialty_tier` correctly | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B7 Confirmation messaging** | `BookingConfirmation` (312 lines) — vehicle category not referenced in confirmation copy | ✅ | ✅ | ⚠ (no "staff will reach out" messaging — if Q2 wants quote-only, this UX gap is present) | ⚠ | ⚠ |

### B1 — Category selection

`step-vehicle.tsx:355-379` renders all 5 categories from
`VEHICLE_CATEGORIES` (`vehicle-categories.ts:9-15`) as buttons.
`handleCategoryChange()` (`:141-149`) clears make, model, classification,
manualSizeClass, manualSpecialtyTier, and errors. Conditional fields
appear via `isSpecialtyCategory(category)` at `:347`.

**Works for all 5 categories** — but **the bug at A undoes user input
afterward**.

### B2 — Make selection

Combobox fetches per category (`vehicle-make-combobox.tsx:75`); makes
display per category from `vehicle_makes` table (`api/vehicle-makes/route.ts:14`).
`vehicle_makes.category` is a text column with the 5-value
vocabulary.

The dropdown WORKS — the bug is in what happens after a selection
(A2.3 cascade).

### B3 — Size / specialty_tier picker

Conditional rendering at `:440-492`:
- `category === 'automobile'` → size buttons over
  `VEHICLE_SIZE_LABELS` (renders all 5 including exotic + classic —
  see #125 audit for the customer-facing-subset constraint; the
  classifier-detected exotic/classic precedence at `:160-168` is the
  customer-visible counterweight).
- `isSpecialtyCategory(category)` → specialty tier buttons over
  `SPECIALTY_TIERS[category]` (2-3 tiers per category from
  `vehicle-categories.ts:38-58`).

Motorcycle has `standard_cruiser` + `touring_bagger`. RV/Boat/Aircraft
each have 3 size/length/class tiers. **All render correctly per
category.**

#### B3 — exotic/classic gate (cross-reference)

`booking-wizard.tsx:705-708`:

```ts
if (vehicle.size_class === 'exotic' || vehicle.size_class === 'classic') {
  setShowSpecialtyBlock(true);
  return;
}
```

This gate is **scoped to automobile sub-types** (`size_class` is null
for non-automobile vehicles per the schema model). RV/Boat/Aircraft
proceed to Step 2 normally. Consistent with the schema; not a bug.

### B4 — Service selection

`booking-wizard.tsx:680-689` filters categories' services by
`vehicle_compatibility`:

```ts
const compatibilityKey = categoryToCompatibilityKey(state.selectedCategory as VehicleCategory);
const filteredCategories = categories
  .map((cat) => ({
    ...cat,
    services: cat.services.filter((svc) => {
      const compat = svc.vehicle_compatibility as string[];
      return compat && compat.length > 0 ? compat.includes(compatibilityKey) : true;
    }),
  }))
  .filter((cat) => cat.services.length > 0);
```

`categoryToCompatibilityKey()` maps `automobile → 'standard'`, else
identity (`vehicle-categories.ts:88-90`). Services without
`vehicle_compatibility` (or with empty list) pass through to all
categories — matches the legacy default ("all-vehicles" services).

**Filter is taxonomy-complete.** Customer with an RV ticket only sees
RV-compatible services.

#### B4 — Pricing display per `pricing_model`

`step-service-select.tsx:1448+` dispatches per `pricing_model`:
- `vehicle_size` → table over the 3 customer-facing size_classes
  (`CUSTOMER_SELF_SERVICE_SIZE_CLASSES` per #125).
- `scope` → tier picker; per-tier sale display.
- `specialty` → tier picker; auto-selects matching tier from
  `vehicleSpecialtyTier` (`:230-238`).
- `per_unit` → unit price × qty.
- `flat` → service-level `flat_price`.
- `custom` → `From $custom_starting_price` (`:1576-1579`).

For RV/Boat/Aircraft, the operator's Q2 ruling places these in the
`custom` pricing model. The current `custom` display surfaces
`custom_starting_price` as "From $X" — which **invites the customer to
treat it as a price they can book at**, contradicting the
"custom-quote = staff reaches out" semantics.

#### B4-1 — Missing RV/Boat/Aircraft callback gate (Significant)

The `<SpecialtyVehicleBlock>` callback flow
(`specialty-vehicle-block.tsx`) is the established UX for "we need to
talk to you about this vehicle" — phone CTA + callback form + a
`/api/public/specialty-block-view` audit event. But it triggers ONLY
for automobile exotic/classic (`booking-wizard.tsx:705`).

Per Q2 ("RV/Boat/Aircraft = custom-quote pricing model"), the same
posture likely applies to these categories: the customer should land
on a callback page after Step 1, not enter Step 2 to book a price.

**This is the operator's call.** Three options:
- **B4-1.A** Extend the gate at `:705` to also trip when
  `vehicle.vehicle_category in {rv, boat, aircraft}` — bypass Step 2
  entirely. Simple. Aligns with Q2 strictly.
- **B4-1.B** Filter Step 2's service list to ONLY `custom`-model
  services for these categories, and replace the "Continue" button
  with a callback CTA when `custom_starting_price` is null. More work,
  preserves the customer's ability to browse the service catalog
  before requesting a callback.
- **B4-1.C** Status quo — the customer sees the catalog, picks a
  custom-priced service, sees "From $X", and the operator follows up
  to finalize. Acceptable if the operator's pricing intent is "the
  starting price IS the floor — staff just adjusts up." But that
  contradicts "quote" semantics.

Surfaced as Q1 / Q2 in T10.

#### B4-2 — Auto-bookable custom services (Minor)

If `service.custom_starting_price > 0`, `computePrice` (`:1383`)
returns that value, `price > 0`, `canContinue` (`:263`) is true, and
the customer can proceed to scheduling and submission. **Whether
this is desired depends on the Q2 interpretation.**

### B5 — Scheduling

`step-schedule.tsx` (377 lines) consumes `service.base_duration_minutes`
+ `mobile_zones`, calls `/api/book/availability`. No category
branches. Vehicle category is invisible at this stage.

**Works for all 5 categories.**

### B6 — Customer info / submission

`step-confirm-book.tsx` (1090 lines) collects name/email/phone/
address/payment, POSTs to `/api/book`. Vehicle category flows in via
`state.vehicleData.vehicle_category`.

`bookingVehicleSchema` (`validation.ts:336-351`) accepts all 5
categories, `specialty_tier: optionalString`, and restricts
`size_class` to the 3 customer-self-service values (#125 finding —
correct).

`api/book/route.ts:240-249` inserts the vehicle row with
`vehicle_category`, `vehicle_type`, `size_class`, `specialty_tier`
correctly. `:253-262` enforces compatibility server-side.

**Works for all 5 categories.**

### B7 — Confirmation messaging

`BookingConfirmation` (312 lines) renders generic confirmation copy
("Booked!" + appointment details). Vehicle category not surfaced.

If Q1 chooses B4-1.A or B4-1.B (RV/Boat/Aircraft → callback flow),
the confirmation messaging for those categories should change to
"We'll reach out to finalize your quote" — but with B4-1.A or B4-1.B
the customer never reaches the booking confirmation in the first
place, so this is moot.

If status quo (B4-1.C), confirmation messaging needs no change.

---

## CONCERN C — Cross-surface check

Memory #11 parity check: is the form-reset bug present in other
vehicle-creation surfaces, or contained to public booking?

**Result: contained.**

```
$ grep -rnE "resolveVehicleClassification|classification\.vehicle_category" \
    src/components/booking src/app/pos src/components/account src/app/admin
src/components/booking/step-vehicle.tsx:16:  resolveVehicleClassification,
src/components/booking/step-vehicle.tsx:18:  type VehicleClassification,
src/components/booking/step-vehicle.tsx:115:    const result = await resolveVehicleClassification(supabase, mk.trim(), mdl.trim() || undefined);
src/components/booking/step-vehicle.tsx:118:    if (result.vehicle_category !== cat) {
src/components/booking/step-vehicle.tsx:228:    const effectiveCat = classification?.vehicle_category ?? category;
```

No call sites outside `src/components/booking/step-vehicle.tsx`.

Verified by inspection (all four expose `category` as a manual
operator-controlled `useState` without any auto-correction effect):

| Surface | File | Category state | Auto-classifier? |
|---------|------|----------------|------------------|
| POS Sale + Quotes vehicle create/edit | `src/app/pos/components/vehicle-create-dialog.tsx:53, 67-92, 172` | `const [category, setCategory] = useState<VehicleCategory>('automobile')` | **No** |
| Customer portal vehicle form | `src/components/account/vehicle-form-dialog.tsx:60, 95-131` | `const [category, setCategory] = useState<VehicleCategory>('automobile')` | **No** |
| Admin Customers vehicle edit | uses `src/components/account/vehicle-form-dialog.tsx` via dialog mount (search the file) | — | **No** (delegates to the dialog above) |
| Quote builder vehicle flow | also uses `pos/vehicle-create-dialog.tsx` (`quote-ticket-panel.tsx:1215`) | — | **No** |

**The auto-classification + auto-correction code is unique to the
public booking step-vehicle.tsx.** The bug is contained to one file
and one effect.

#### Reuse note (Memory #19)

The prior taxonomy audit (T7 note) flagged a DRY concern: the
public-booking form and the POS/account form are two independent
vehicle-form patterns. The current audit shows the gap concretely —
the public form does auto-classification (a feature) AND has the
override bug (a defect); the POS/account form is auto-classification-
free (no auto-correction, no defect). A future consolidation would
need to decide whether auto-classification is worth carrying into
POS/account or whether the booking-side feature should be quarantined
behind a more conservative implementation. **Not a fix scope for this
session.**

---

## TARGET D — Severity-ranked findings + fix-arc

| ID | Severity | Finding | Surface | Fix shape | Suggested session |
|----|----------|---------|---------|-----------|-------------------|
| **F1** | **Critical** | Form-reset bug — non-automobile booking impossible | `step-vehicle.tsx:117-120` + `vehicle-categories.ts:691/302-305/712-714` | Y-1 hotfix: refuse override when `!model.trim()` (~3-5 lines, 1 file). Optional X follow-up: confidence signal on `VehicleClassification`. | **Session F1** (1 small, ~30 min) — hotfix-class urgency |
| **F2** | Significant (operator decision) | RV/Boat/Aircraft custom-quote gating missing — no callback flow analogous to exotic/classic | `booking-wizard.tsx:705-708` (extend) OR `step-service-select.tsx` (catalog filter + CTA swap) | Three options (B4-1 A/B/C) — extend `SpecialtyVehicleBlock` trigger OR replace Step 2 Continue with callback CTA OR status quo | **Session F2** (1 medium, ~2 hr) — sequenced AFTER Q1/Q2 operator confirmation |
| **F3** | Minor | RV/Boat/Aircraft `custom`-model services with `custom_starting_price` set become standard-bookable, contradicting "quote-only" intent | `step-service-select.tsx:1383, 1576-1579, 263` | Resolution falls out of F2's choice — if F2.A/B chosen, F3 is moot; if F2.C chosen, F3 is by-design | Bundle with **F2** |
| **F4** | Minor (data quality) | Resolver silently defaults to `'automobile'` when make not in `vehicle_makes` — masks data drift between combobox source and resolver source | `vehicle-categories.ts:691, 712-714` | Dev-warn (`console.warn`) when 0-row default fires for a make that came from the combobox; non-blocking | **Session F4 (optional)** (~30 min, can ship anytime) |
| **F5** | Minor (DRY / parity) | Public-booking form has auto-classification; POS/account/admin/quote-builder forms don't — two independent vehicle-form patterns | `step-vehicle.tsx` vs `pos/vehicle-create-dialog.tsx` + `account/vehicle-form-dialog.tsx` | Future consolidation — either backfill auto-classification into the POS/account pattern OR fence auto-classification behind a shared hook (`useVehicleAutoClassify`) usable by all 4 forms | **No session** — track as a structural TODO; tied to a broader vehicle-form-consolidation effort |
| **F6** | Minor (regression guard) | No test asserts "selecting non-automobile category + make does NOT reset the form" | `src/components/booking/__tests__/` (does not exist for step-vehicle) | Add a render test + user event simulating the operator's repro; assert `category === 'rv'` after make-selection settles. ~30-50 lines. | Bundle with **F1** (ships the fix + the test that locks it) |

### Fix-arc sequencing

```
Session F1 (F1+F6) ───► form-reset hotfix + locking test  [URGENT — ships ASAP, independent]
                            │
                            └─ parallel-safe with the prior arc's Sessions A (V1 prereq compat), B (public exotic/classic), C (admin Create exotic/classic). No file overlap.

Session F2 (F2+F3) ───► RV/Boat/Aircraft custom-quote gate  [sequenced after operator confirms Q1/Q2 intent]
                            │
                            └─ depends on Q1/Q2 answers, not on F1.

Session F4 (optional) ──► resolver dev-warn  [any time, ~30 min, low priority]

F5 ── no session (track only)
```

**Recommendation:** F1 ships immediately as a hotfix branch
(`fix/public-booking-form-reset` or similar). F2 waits for the
operator's call on Q1/Q2. F4 + F5 are slow-track.

F1's fix shape preserves all 5 categories' make-selection UX
identically; the only behavior change is "the form no longer
silently resets to Automobile when the classifier can't determine the
category."

---

## TARGET E — Regression-locking test

Pattern: a render test in `src/components/booking/__tests__/step-vehicle.test.tsx`
(new file). Outline:

```ts
it('non-automobile category + make selection does not reset category', async () => {
  // Mock /api/vehicle-makes to return [{ id, name: 'TestMake' }] for category=rv
  // Mock resolveVehicleClassification to return either:
  //   - { vehicle_category: 'automobile', category_source: 'defaulted' }  (Y-1 / X scenarios)
  //   - { vehicle_category: 'automobile' } (current behavior — test would FAIL pre-fix)
  // Render <StepVehicle ... initialVehicle={null} customerData={null} />
  // Click the 'RV' category button
  // Type or select 'TestMake' in the make combobox
  // await the 400ms debounce + classifier resolution
  // Assert: category button 'RV' still has the selected-state class
  // Assert: make input still shows 'TestMake'
});
```

This test fails today (would catch the regression for any future
contributor re-introducing the override). Pairs with F1's fix.
Estimated ~30-50 lines including mocks.

The Track B structural-guard test pattern (`src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx`)
is the reference for the **shape** of a defensive lock-test — small,
single-concern, mock-light, narrating one concrete repro.

---

## TARGET F — Open operator questions

| # | Question | Topic | Origin |
|---|----------|-------|--------|
| **Q1** | (Re-affirmation of the audit-prompt's stated ruling) RV/Boat/Aircraft services are customer-bookable on public site — but should the booking FLOW gate them into a callback (B4-1.A / .B) or let them book a starting price directly (B4-1.C)? | T4 (B4-1) | New |
| **Q2** | (Re-affirmation) RV/Boat/Aircraft = `custom` pricing model; motorcycle = priced like automobile. If `custom_starting_price` IS configured on these services, does the operator want it surfaced as "From $X" (current) or hidden behind the callback flow (per quote-only intent)? | T4 (B4-2) | New |
| **Q3** | Hotfix posture for F1 — ship Y-1 (refuse override when model is empty) as a focused hotfix, or hold for X (full confidence signal in resolver)? | A3 | New — recommend Y-1 + X follow-up |
| **Q4** | Should resolver dev-warn (F4) ship soon to surface `vehicle_makes` data drift, or wait? | F4 | New |
| **Q5** | Vehicle-form consolidation (F5) — is unifying public-booking with POS/account a near-term priority, or carry as long-term TODO? | F5 | New |

---

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ No DB writes; live SELECTs not needed (DB_SCHEMA.md + grep
  sufficient).
- ✅ Root cause traced to exact lines with the full effect chain
  (Memory #11 — no guessing). One classification (a); not multiple
  possibilities.
- ✅ file:line citations throughout.
- ✅ Reuse-over-duplication preference observed — F1 hotfix is
  single-file (~5 lines); F5 cross-surface DRY concern flagged but
  not fixed. The audit recommends Y-1 over X for the immediate ship
  because Y-1 is smaller AND already-reuses the existing resolver
  contract; X is the cleaner structural refactor flagged for follow-up.
- ✅ Audit MAPS — does not draft the fix code.
- ✅ Worktree isolation off `origin/main` (`1dd4cac7`).
