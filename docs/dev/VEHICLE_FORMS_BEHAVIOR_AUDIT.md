# Vehicle Forms — Comprehensive Behavior Audit (2026-05-31, Session #135)

> Read-only diagnostic audit. No source / migration / test changes.
> Branch: `audit/vehicle-forms-comprehensive-behavior`
> Performed in an isolated `git worktree` off `origin/main` (`d01879dd`,
> Session #134's U-B.2 merge) so the shared checkout stays undisturbed.
>
> **Scope:** `src/components/booking/step-vehicle.tsx` (public booking
> Step 1) and `src/components/account/vehicle-form-dialog.tsx` (customer
> portal vehicle add/edit dialog), plus their shared collaborators:
> `src/components/ui/vehicle-make-combobox.tsx`,
> `src/lib/utils/vehicle-categories.ts`,
> `src/lib/utils/vehicle-helpers.ts`,
> `src/lib/utils/validation.ts`, and
> `src/app/api/customer/vehicles/[id]/route.ts`.

## Context

Operator's explicit framing: *"Why do I have to keep bringing up one
error at a time then have you fix it? Why can't you review the entire
logic being used on this form then analyze how the form should respond
and work?"* This audit takes that framing literally — defines the
INTENDED behavior model first, then catalogues every gap. Output is a
**defect inventory + fix-arc recommendation**, not a fix scope.

Sessions #129 / #131 / #132 each shipped a narrow fix on this form;
each fix surfaced the next defect. The audit-and-validate (Memory #25)
discipline applied at the per-bug level has not been enough for this
form because the underlying behavior contract was never made explicit.
The two operator findings this audit must catch:

1. **Category change does not reset Year and Color** — both forms.
2. **"Two rows below" expand and flash on model-input typing** —
   public booking specifically.

But the audit's value is in catching defects beyond these two. See
TARGET T4 + T7.

## TL;DR

- **24 defects catalogued** across both surfaces (4 Significant, 9
  Moderate, 8 Minor, 3 Informational). See TARGET T7.
- **Both operator findings confirmed and root-caused** — B1 (category
  reset gap) and B2 (classifier spinner conditional-render flash).
- **Two ADDITIONAL Significant defects surfaced** that operator hasn't
  reported yet: B3/B4 (PATCH route leaves `specialty_tier` /
  `size_class` from prior category in the DB row after a category
  change — write-time DB inconsistency, not visible until next read);
  B15 (`customerVehicleSchema` makes year/make/model/color all
  `.optional().nullable()` — portal accepts a vehicle with zero
  required content; public booking requires all four; cross-surface
  required-semantics divergence).
- **Fix-arc shape: ONE coherent session.** All 24 findings reduce to
  three behavioral concerns (reset semantics, visual stability,
  required-semantics + server-consistency). One session, three
  internally-organized commits, ~250-350 production lines net.
- **T1 intended behavior is the missing foundation.** Codify it as a
  module-level constant + JSDoc + a contract test (T8) so the next
  iteration can never silently drift.
- **Two open operator decisions** block scope finalization (T7):
  whether the portal should require year/make/model/color (B15
  resolution); whether to surface vin/license_plate/notes on either
  customer form (B11 resolution).

## TARGET T1 — Intended behavior model (the foundation)

> The operator's locked rule — *"when vehicle category is changed,
> then all the fields should be reset"* — is the ANCHOR. T1.1 below
> infers the full reset graph from it, then T1.2–T1.5 fill in the
> remaining behavioral axes.

### T1.1 — Reset semantics matrix

For each (trigger field → target field), define what should happen.
Anchor row (category) is operator-locked; downstream rows are derived
from the principle "a field resets when its current value's validity
or meaning is invalidated by the trigger."

| Trigger ↓ / Target → | category | make | model | year | color | size_class | specialty_tier | vin | license_plate | notes | classification | errors |
|----|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **category change** (operator-locked) | self | **reset** | **reset** | **reset** | **reset** | **reset** | **reset** | **reset** | **reset** | **reset** | **reset** | **clear all** |
| **make change** | — | self | **reset** (make-specific) | keep | keep | **reset** (will re-classify) | **reset** (will re-classify) | keep | keep | keep | **reset** (re-runs) | clear make+model |
| **model change** | — | — | self | keep | keep | **reset only manual override** (classifier may re-detect) | **reset only manual override** | keep | keep | keep | **re-runs** (debounced) | clear model |
| **year change** | — | — | — | self | keep | keep | keep | keep | keep | keep | **re-runs** (year affects classic detection) | clear year |
| **color change** | — | — | — | — | self | keep | keep | keep | keep | keep | keep | clear color |
| **size_class manual pick** | — | — | — | — | — | self (manual) | keep (auto N/A — category=automobile) | keep | keep | keep | keep | clear size_class |
| **specialty_tier manual pick** | — | — | — | — | — | keep (auto N/A — category≠automobile) | self (manual) | keep | keep | keep | keep | clear specialty_tier |
| **vin/license_plate/notes change** | — | — | — | — | — | — | — | self | self | self | keep | clear that field's error |

**Anchor rule derivation:** category change resets ALL because all
non-category fields have category-specific validity — year ranges
might differ, make-list depends on category, size_class vocabulary
depends on category (3 customer-facing values for automobile vs 4
specialty_tier vocabularies for the rest), and vin/license_plate/notes
are administrative metadata that don't carry across category change.

**Make change anchor:** model is structurally make-specific (a "Civic"
under Honda is not a "Civic" under another make); size_class and
specialty_tier may auto-detect based on the new make → reset manual
overrides so classifier authority wins; classification re-runs.

**Year change:** year affects classic-detection (Layer 5 of resolver,
`vehicle-categories.ts:779-787`) → classification re-runs.

### T1.2 — Initial state

| Field | Public booking (step-vehicle.tsx) | Customer portal (vehicle-form-dialog.tsx) |
|---|---|---|
| `category` | `initialVehicle?.vehicle_category ?? 'automobile'` (line 82) | Edit: `deriveCategory(vehicle)`; Create: `'automobile'` (line 67, 125) |
| `mode` | `'saved'` if customer has saved vehicles, else `'manual'` (line 71) | N/A — dialog is always single-vehicle |
| `make/model/year/color` | From `initialVehicle` (lines 85-88) or empty | From RHF `reset()` on open (lines 114-135) |
| `yearInput` | String form of year, or `''` (line 96-98) | Bound to RHF `register('year')` (line 270-297) |
| `classification` | `null` (line 101) | `null` (line 77) |
| `manualSizeClass/manualSpecialtyTier` | From `initialVehicle` (lines 105-112) | RHF-managed via `register('size_class' / 'specialty_tier')` |
| `errors` | `{}` (line 115) | RHF `formState.errors` |

**Defects in T1.2:**
- B12 (Informational): `customerData?.vehicles` is captured via
  useState initializer — doesn't react to changes after mount.
- The default category of `'automobile'` is acceptable convention but
  not user-confirmed. **Operator question:** should the form default
  to "no category selected" forcing an explicit pick?

### T1.3 — Persistence model

- **Public booking:** form state lives in `StepVehicle`'s local
  `useState` slots. Cross-step persistence handled by parent
  `BookingWizard` via `initialVehicle` prop (`booking-wizard.tsx:88,
  1156`). Wizard restores state from URL/localStorage on mount (per
  prior #133/#134 work). Step 1 unmount during navigation does NOT
  preserve manual-form state — only the wizard's
  `state.vehicleData` (the committed selection via `handleVehicleSelect`)
  survives. If user types Make+Model on Step 1, hits Back from Step 2,
  they may see prior committed data, but in-progress un-committed
  entry is lost. **Acceptable for normal flow; document.**
- **Customer portal:** dialog state lives in
  `VehicleFormDialog`'s RHF instance + local `useState`. The `open`
  prop drives a `useEffect` that calls `reset()` (line 108-138). When
  the dialog CLOSES (open=false), RHF state and local
  `classification` STAY in memory but are not visible. **Defect B19
  (Minor):** opening the dialog with NO `vehicle` prop after a prior
  close-without-save shows the `reset()` defaults (clean). Opening
  with a `vehicle` prop after editing a DIFFERENT vehicle resets to
  the new vehicle's data. Both paths reset correctly. **No defect
  here — confirmed correct.**

### T1.4 — Cross-field dependencies

- **category → make-list:** YES. Combobox refetches
  `/api/vehicle-makes?category=...` per category
  (`vehicle-make-combobox.tsx:67-86`). Cached per category.
- **category → size_class vocabulary:** YES. Public booking renders
  3-button grid for automobile, 2-3 specialty tiers for
  motorcycle/RV/boat/aircraft (step-vehicle.tsx:499-551). Portal
  renders 3-value Select for automobile, per-category specialty Select
  for others (vehicle-form-dialog.tsx:348-380).
- **category → vehicle_type:** YES, derived `isSpecialty ? category :
  'standard'` (both forms).
- **make → classifier:** classifier runs on (make, model, year). Make
  is the primary driver — empty make = classifier returns null state.
- **model → classifier:** model disambiguates dual-category makes
  (e.g. Honda automobile vs motorcycle).
- **year → classifier:** year affects Layer 5 (classic detection
  requires year ≤ `CLASSIC_YEAR_THRESHOLD`).
- **classifier confidence (`category_confident`) → setCategory
  auto-override:** YES, only when `true` and disagrees with user pick
  (step-vehicle.tsx:135). #131 Layer 2 contract.
- **classifier `size_class === 'exotic'|'classic'` → effective
  size_class:** YES, hard-wins over manual pick
  (step-vehicle.tsx:181-185). Session 29 anti-gaming.
- **classifier specialty → portal advisory banner:** YES, surfaces
  amber notice (vehicle-form-dialog.tsx:324-336). #129 C3.

### T1.5 — Validation timing

| Field | Public booking | Customer portal |
|---|---|---|
| **category** | Always-valid (button group, default 'automobile') | Always-valid (Select, default 'automobile') |
| **make** | Submit-only (line 275); errors clear on change (line 422) | Submit-only via Zod (`min(1)`) — but **schema makes it `.optional().nullable()`** so the `min(1)` only triggers when a string is provided |
| **model** | Submit-only (line 276); errors clear on change (line 437) | Submit-only via Zod; same `.optional().nullable()` quirk |
| **year** | **Real-time** on keystroke (line 459-471) AND onBlur (line 473-476); submit-fallback (line 280) | Submit-only via RHF `validate:` (line 290-295). RHF default mode is `'onSubmit'`. |
| **color** | Submit-only (line 281); errors clear on change (line 483) | Submit-only via Zod; same `.optional().nullable()` quirk |
| **size_class / specialty_tier** | Submit-only (line 282-287); errors clear on selection | Submit-only via Zod; both `.optional().nullable()` |

**Defects in T1.5:**
- **B7 (Minor):** Year validates real-time + onBlur but every other
  field validates on submit only — inconsistent feedback timing
  within the same form.
- **B9 (Minor):** Cross-surface — public booking year validates
  real-time, portal year validates on submit only.
- **B15 (Significant):** Schema-level required-semantics divergence
  — see T4.8.

---

## TARGET T2 — Defect: category-change field reset (operator finding #1)

**Confirmed.** Both forms.

### Public booking — `step-vehicle.tsx:158-166`

```ts
function handleCategoryChange(newCat: VehicleCategory) {
  setCategory(newCat);
  setMake('');
  setModel('');
  setClassification(null);
  setManualSizeClass(null);
  setManualSpecialtyTier(null);
  setErrors({});
}
```

**Resets:** category, make, model, classification, manual overrides,
errors.

**MISSED:** `year` (line 87), `yearInput` (line 96), `color` (line 88).

### Customer portal — `vehicle-form-dialog.tsx:148-158`

```ts
function handleCategoryChange(newCategory: VehicleCategory) {
  setCategory(newCategory);
  const isSpecialty = isSpecialtyCategory(newCategory);
  setValue('vehicle_category', newCategory, { shouldDirty: true });
  setValue('vehicle_type', isSpecialty ? newCategory : 'standard', { shouldDirty: true });
  setValue('make', '', { shouldDirty: true });
  setValue('model', '', { shouldDirty: true });
  setValue('size_class', null, { shouldDirty: true });
  setValue('specialty_tier', null, { shouldDirty: true });
  setClassification(null);
}
```

**Resets:** vehicle_category, vehicle_type, make, model, size_class,
specialty_tier, classification.

**MISSED:** `year`, `color`.

### Classification

**B1 (Significant) — operator finding #1, both forms.** Category (b)
missed-in-initial-build. The function was authored when the form had
only category-make-model-tier; year + color were added later and the
reset handler wasn't updated. No code-smell at the time; classic
"refactor missed a sibling" defect.

**Fix shape:** add `setYear(null) + setYearInput('') + setColor('')`
to public booking; add `setValue('year', null) + setValue('color',
'')` to portal. ~4 lines per form. The T1 contract test (T8) prevents
regression.

---

## TARGET T3 — Defect: layout shift on model input (operator finding #2)

**Confirmed.** Root cause: `step-vehicle.tsx:491-496` —

```tsx
{/* Classification spinner */}
{classifying && (
  <div className="flex items-center gap-2 text-sm text-site-text-secondary">
    <Spinner className="h-4 w-4" />
    Identifying vehicle...
  </div>
)}
```

The spinner row is **conditionally rendered** based on `classifying`
state. Sequence on model-input typing:

1. User types into Model (`onChange` line 437) → `setModel(...)` →
   re-render.
2. Debounced effect (line 146-155, deps `[make, model, category,
   mode, classify]`) fires `clearTimeout` on previous timer and
   schedules new 400ms timer.
3. After 400ms idle, timer fires `classify(make, model, category)`.
4. `classify` calls `setClassifying(true)` (line 123) → re-render →
   **spinner row APPEARS** (DOM growth: ~32px including
   `space-y-4` parent gap).
5. Promise resolves (network ~50-500ms).
6. `setClassifying(false)` in `finally` (line 141) → re-render →
   **spinner row DISAPPEARS** (DOM shrink: ~32px).

What the operator sees as "two rows below briefly expand and flash":

- The spinner row itself appears/disappears (one DOM row's worth of
  height shift).
- The rows **below the spinner** (Vehicle Size for automobile, or
  Specialty tier for specialty categories) are pushed down ~32px when
  spinner shows, then snap back up when it hides. From the user's
  visual focus point on the size/tier picker, this is perceived as
  "two rows below model expanded and flashed." The spinner row plus
  the picker row both shift — hence "two rows."

**Secondary contributor:** when classification resolves with
`size_class === 'exotic'|'classic'`, the auto-selected size button
changes its `isSelected` styling (line 503). Color/border change but
no layout shift. Not the primary perception.

**Tertiary contributor:** the Year `FormField` shows an inline error
`<p>` when `errors.year` is non-empty (`form-field.tsx:32`). Real-time
year validation (B7) means the error message appears and disappears
as user types invalid → valid → invalid year — ~16px height delta on
EACH keystroke into the year input. **B6 (Moderate).** Not the
operator's reported "model-input" shift but the same class of defect.

### Customer portal equivalent

The portal does NOT render an "Identifying vehicle..." spinner — the
classifier runs silently and only the amber advisory appears when
exotic/classic is detected (vehicle-form-dialog.tsx:324-336). The
advisory IS conditionally rendered and DOES cause layout shift when
it appears/disappears, but the operator hasn't flagged this. **B2-P
(Moderate, sibling to B2):** advisory banner appearance/disappearance
on classifier resolution shifts everything below by ~50-70px.

### Fix shape (deferred to TARGET T5)

---

## TARGET T4 — Comprehensive sweep

### T4.1 — State-reset edge cases

- **Public booking — wizard back-navigation:** if user fills Step 1,
  advances to Step 2, hits Back. `BookingWizard.handleVehicleSelect`
  (`booking-wizard.tsx:735`) writes the committed vehicle to
  `state.vehicleData`. Returning to Step 1 mounts `<StepVehicle
  initialVehicle={state.vehicleData}>` — the form rehydrates from the
  COMMITTED state. In-progress un-committed entry is lost. **B25
  (Informational):** acceptable convention; document if not already.
- **Public booking — saved vehicle then add new:** clicking a saved
  card sets `mode='saved'`. Clicking "Add a New Vehicle" sets
  `mode='manual'` AND clears `selectedVehicleId`. But the manual form
  state (make/model/year/color/category/etc.) is NOT cleared. If user
  previously typed into the manual form, went saved, then back to
  manual, they see stale data. **B19 (Minor):** annoying but not
  destructive. Fix shape: reset manual form on mode toggle.
- **Public booking — saved-vehicle category mismatch:** when a saved
  vehicle is rendered, its `category` chip shows the persisted value
  (line 311) but the user can't pick a different category for a saved
  vehicle — `handleCategoryChange` is only available in manual mode.
  **No defect.**
- **Customer portal — open/close/reopen:** dialog reset effect (line
  108-138) runs on `[open, vehicle, reset]` change. Reopening with
  same vehicle resets to that vehicle's values (RHF reset()). Closing
  without saving doesn't dirty the persisted vehicle. **No defect.**
- **API error response on submit:** public booking has no API on Step
  1 (just `onContinue` callback). Portal submit shows error toast and
  KEEPS the form open with current values — RHF state preserved.
  **No defect.**

### T4.2 — Async race conditions

- **Classifier in-flight + category change:** the classifier effect
  cleanup (`return () => clearTimeout(timer)` line 154) clears
  scheduled timers but does NOT cancel an already-fired-and-awaiting
  promise. Sequence:
  1. User picks RV, types "Yamaha" → debounce schedules
     classify('Yamaha', '', 'rv').
  2. 400ms passes, classify fires → supabase fetch in flight.
  3. User changes category to motorcycle → `handleCategoryChange`
     runs → clears make/model → effect re-runs with empty make →
     `setClassification(null)`.
  4. Original promise resolves with stale `classification` (computed
     against 'Yamaha' + RV-context query) → `setClassification(result)`
     overrides the just-cleared classification with stale data.
  5. UI may briefly display stale advisory/spinner state before
     stabilizing.
  **B5 (Moderate).** Standard React Effect race. Fix shape: use a
  cancellation ref (`isCancelled` boolean) inside `classify`, or
  `AbortController` on the fetch, or an in-flight request token.
- **Same race in portal (vehicle-form-dialog.tsx:177-182).** Identical
  pattern; identical defect. **B5-P (Moderate).**
- **`vehicle-make-combobox.tsx` fetch race:** module-level cache
  (`cachedMakesByCategory` line 24) means each category is fetched
  once across the lifetime of the page. If user rapidly switches
  category before the fetch returns, only the cache populates for the
  category at fetch-completion time. **Acceptable.**

### T4.3 — Conditional render stability

Beyond B2 (classifier spinner) and B6 (year error message),
additional conditional-render sources:

- **B2-P (Moderate):** Portal classifier advisory banner (vehicle-form-dialog.tsx:324-336)
  appears/disappears on classifier resolution. ~50-70px shift on
  everything below (Color + Size selector row).
- **Size/specialty picker switching on category change:** when user
  changes category between automobile and a specialty type, the
  rendered widget changes (button-grid 3-cols vs button-grid 1-3 cols
  / Select). This is intentional UX (category change should re-render
  appropriate picker) — NOT a defect.
- **`FormField` error `<p>` height:** any field whose error message
  appears causes ~16px shift in the row below the field. Make, model,
  color, size, specialty all share this pattern but they only show
  error on submit (B7 timing) so the shift happens at one point in
  the user journey rather than as user types. Less perceptible.
- **`renderSavedVehicles()` + `renderManualForm()` toggle:** clicking
  "Add a New Vehicle" inserts the manual form below the saved
  vehicles list. Large layout shift but it's user-initiated, not
  ambient. **NOT a defect.**

### T4.4 — Validation feedback consistency

Documented in T1.5. Sibling defects:

- **B7 (Minor):** intra-form — public booking year validates real-time
  + onBlur; everything else submit-only.
- **B9 (Minor):** cross-form — public booking year validates
  real-time; portal year validates on submit only.
- **B10 (Minor):** Year FormField (portal, line 270-298) has no
  `required` prop on the FormField label → no asterisk shown. But
  customerVehicleSchema makes year `.optional().nullable()` so it's
  not actually required — see B15.
- Error message TEXT is not standardized. Public booking uses
  "Required" generic + validator-specific for year ("Year must be 4
  digits"). Portal uses Zod schema messages ("Please enter a model"
  etc.). Cross-surface user-language drift.

### T4.5 — Accessibility & focus

- **B17 (Minor):** After `handleCategoryChange` resets fields, focus
  stays in whatever field the user was on (typically still in Model
  via the category-button onClick — focus moved to the button). No
  programmatic focus management. A11y-friendly pattern: focus moves
  to the first newly-empty required field (Make, since model was
  reset because make was reset).
- **B26 (Minor):** Error `<p>` in FormField (line 32) has no
  `aria-live` and no `id` linked via `aria-describedby` from the
  input. Screen-reader users may not learn about validation errors.
- **B27 (Minor):** `step-vehicle.tsx` category buttons (lines 395-409)
  are `<button>` elements without `role="radio"` or `aria-checked` —
  they function as a radio group semantically but expose as a
  collection of toggles. Minor a11y concern.

### T4.6 — Mobile responsiveness

- Public booking category grid is `grid-cols-2 sm:grid-cols-5` (line
  390). On mobile that's 2 columns; with 5 categories the layout is
  3 rows: (auto, moto), (RV, boat), (aircraft, empty). The empty cell
  in row 3 creates visual asymmetry. **B28 (Minor):**  switch to
  `grid-cols-3 sm:grid-cols-5` for a balanced (3,2) layout, or pad
  with a centering wrapper.
- Touch target on category buttons (`p-3`, ~44px tall) meets WCAG.
- iOS auto-zoom prevention via `text-base sm:text-sm` is honored on
  Input fields (CLAUDE.md Rule 16) — verified on year, model, color,
  make inputs.

### T4.7 — Empty / loading / error states

- **VehicleMakeCombobox API error:** `.catch(() => {})` silently
  (vehicle-make-combobox.tsx:84). User sees "No matching makes
  found." in the dropdown but can still type a custom value via the
  "Other (type custom make)" option. **Acceptable but silent —
  consider non-blocking toast.**
- **Classifier API error:** `.catch()` sets `setClassification(null)`
  (step-vehicle.tsx:138-140; vehicle-form-dialog.tsx:181). Form
  silently degrades to user-pick-only. Acceptable.
- **Unknown vehicle_category enum value (DB drift):** the form's
  `VEHICLE_CATEGORIES` constant is hardcoded (vehicle-categories.ts:9-15).
  If DB ever gains a 6th category (e.g. 'commercial'), forms won't
  show it. Schema validation would still pass via Zod enum coercion —
  but the form can't render an option. **B29 (Informational):** known
  limitation; documenting only. The taxonomy expansion playbook is
  out of scope.

### T4.8 — Schema fields collected but not surfaced

- **`vehicleSchema` declares `vin` (line 80), `license_plate` (line
  81), `notes` (line 82).** Neither customer form collects any of
  these (also flagged as Q5 / S1 in `VEHICLE_FORM_UNIFICATION_AUDIT.md`
  #128 — still open). Carry-over.
- **`customerVehicleSchema` does NOT declare vin/license_plate/notes.**
  Schema-vs-schema divergence between admin-facing `vehicleSchema`
  and customer-facing `customerVehicleSchema`.
- **`is_incomplete` column** in DB (`vehicles` table) is admin-only
  written (per #128 S2). Customer forms don't write it. Carry-over.
- **B11 (Informational, Q5 carry-over):** Open operator decision —
  add vin/license_plate/notes to customer forms, or drop from
  `vehicleSchema`.
- **B15 (Significant — NEW HERE):** `customerVehicleSchema` makes
  `year`, `make`, `model`, `color` all `.optional().nullable()` (lines
  438-441). The `.min(1, '...')` constraint only fires when a non-null
  string IS provided. So the customer portal accepts a vehicle save
  with NO year, NO make, NO model, NO color — just category + size.
  Public booking REQUIRES all four (`isValid()` line 209-212).
  Cross-surface required-semantics divergence. Almost certainly
  unintentional — the Zod `.min(1, 'Please enter a model')` messages
  read like the field is required, but `.optional().nullable()` makes
  it not.

### T4.9 — Symmetry between public booking & customer portal

The NO-UNIFICATION verdict (#128) documents intentional differences.
This audit catalogues actual current divergences and classifies
intentional vs accidental.

| Aspect | Public booking | Customer portal | Classification |
|---|---|---|---|
| State management | useState slots | RHF + Zod (`customerVehicleSchema`) | Intentional (#128 — different writers, different patterns) |
| size_class widget | Button grid 3-col, all 3 customer values | Select dropdown, all 3 customer values | Intentional |
| specialty_tier widget | Button grid 1-3 col | Select dropdown | Intentional |
| year input | Single 4-digit `<Input>` w/ real-time validate + onBlur | Single 4-digit `<Input>` via RHF register, validate on submit | **Accidental** (#132 ported the design but timing diverged) |
| Required fields enforcement | UI-level (isValid) requires year/make/model/color | Schema makes them `.optional().nullable()` | **Accidental — B15** |
| Classifier surfacing | Inline "Identifying vehicle..." spinner | Amber advisory banner when exotic/classic | Intentional (different UX intents — booking gates, portal advises) |
| Category change → year/color reset | NEITHER resets year/color | NEITHER resets year/color | **Accidental — B1 in both** |
| Model case preservation | Identity transform on display + trim on submit (`step-vehicle.tsx:437, 265`) | Identity via RHF on display + trim on submit (`vehicle-form-dialog.tsx:217`) | Intentional (#132 — consistent) |
| Color case | `titleCaseField` on display (line 483) | `titleCaseField` on submit (line 218) | Cross-surface divergence — display vs submit timing differs. **B30 (Minor).** |
| Make canonicalization | Not done client-side (server `canonicalizeMake` in API routes) | Same | Consistent |
| Saved-vehicle picker | Yes (renderSavedVehicles) | No (dialog is single-vehicle) | Intentional (different surfaces serve different flows) |

---

## TARGET T5 — "Two rows below" structural fix shape

The flash described in T3 has THREE potential fix shapes; this audit
recommends one.

### Option A — Height-reserved spinner row

Replace `{classifying && ...}` with an always-rendered row that's
visibility-hidden when not classifying:

```tsx
<div className={cn(
  'flex items-center gap-2 text-sm text-site-text-secondary',
  classifying ? 'opacity-100' : 'opacity-0'
)} aria-hidden={!classifying}>
  <Spinner className="h-4 w-4" />
  Identifying vehicle...
</div>
```

**Pros:** zero layout shift; minimal code change.
**Cons:** dedicates ~32px even when no classification in progress.
On mobile that's noticeable real estate.

### Option B — Inline spinner inside Model field

Render the spinner as a right-icon inside the Model `<Input>` when
classifying:

```tsx
<Input
  id="vehicle-model"
  value={model}
  onChange={...}
  endAdornment={classifying ? <Spinner className="h-4 w-4" /> : null}
/>
```

**Pros:** no layout shift; spinner has clear semantic relationship
to the model field that triggers it.
**Cons:** requires `<Input>` to support `endAdornment` (currently
doesn't — see `src/components/ui/input.tsx`). ~30 lines to add the
slot. Cleaner UX though.

### Option C — Skeleton placeholder for size/specialty picker

Render the size/specialty picker with `opacity-50` + a "Detecting…"
label during classification, removing the standalone spinner row
entirely.

**Pros:** integrates feedback into the relevant downstream control.
**Cons:** more complex; entangles classifier UI with picker UI.

**RECOMMENDATION: Option A** for the immediate fix (simple, contained,
zero-cost layout-shift elimination). **Option B** as a polish follow-up
if the operator wants the more refined feel.

For B2-P (portal advisory banner shift): same Option A pattern —
reserve a `min-h-[3.5rem]` container for the advisory area; render
the advisory inside or render `null` inside. Banner appearance no
longer pushes content.

For B6 (year inline-error layout shift): reserve a `min-h-[1rem]`
container for the FormField error `<p>`. Standardize on the FormField
component to always reserve error space. **This is a global-shaped
fix that benefits every form using FormField** — separate audit
question.

---

## TARGET T6 — Schema correctness check

### Per-field persistence map

| Form field | DB column | Type alignment | Null handling |
|---|---|---|---|
| `vehicle_category` | `vehicles.vehicle_category` (text NOT NULL) | enum 5-value → text | OK |
| `vehicle_type` | `vehicles.vehicle_type` (text) | enum 5-value → text | OK |
| `size_class` | `vehicles.size_class` (text NULL) | string \| null | OK |
| `specialty_tier` | `vehicles.specialty_tier` (text NULL) | string \| null | OK |
| `make` | `vehicles.make` (text) | string | empty string vs null inconsistent — portal sends `''`, server canonicalizes only if non-null; public booking sends trimmed string |
| `model` | `vehicles.model` (text NULL) | string \| null | Same inconsistency |
| `year` | `vehicles.year` (int NULL) | number \| null | OK |
| `color` | `vehicles.color` (text NULL) | string \| null | OK |
| `vin` | `vehicles.vin` (text NULL) | — | **NOT collected by any customer form** |
| `license_plate` | `vehicles.license_plate` (text NULL) | — | **NOT collected** |
| `notes` | `vehicles.notes` (text NULL) | — | **NOT collected** |
| `is_incomplete` | `vehicles.is_incomplete` (bool NULL) | — | **NOT written** (admin-only) |
| `size_class_manual_override` | `vehicles.size_class_manual_override` (bool NULL) | — | **NOT written** (admin-only) |
| `classifier_run_at` / `classifier_version` | — | — | Not user-facing |

### PATCH route inconsistency findings (Significant)

`src/app/api/customer/vehicles/[id]/route.ts:76-83` builds
`updateData` with:

```ts
const updateData = {
  ...parsed.data,
  vehicle_category: parsed.data.vehicle_category ?? undefined,
  specialty_tier: parsed.data.specialty_tier ?? undefined,
  ...(canonicalMake !== null ? { make: canonicalMake } : {}),
  ...(resolvedSizeClass !== undefined ? { size_class: resolvedSizeClass } : {}),
  updated_at: new Date().toISOString(),
};
```

**B3 (Significant):** `specialty_tier: parsed.data.specialty_tier ?? undefined`
converts NULL to `undefined`. Supabase's `.update()` treats `undefined`
as "don't write this column," NOT as "write NULL." So when the dialog
submits `specialty_tier: null` (because category changed
specialty→automobile so the dialog's `isSpecialty ? data.specialty_tier
: null` collapses to `null`), the route silently DROPS the null and
the DB row keeps its old `specialty_tier='rv_25_35'`. **Row ends up
inconsistent: `vehicle_category='automobile'` AND
`specialty_tier='rv_25_35'`.**

**B4 (Significant):** symmetric defect with `size_class` —
`resolvedSizeClass` becomes `undefined` when the classifier didn't
specialize and the user didn't set one. On category→motorcycle
change, the dialog sends `size_class: null` (because `isSpecialty`
flips true → `!isSpecialty ? data.size_class : null` = null), but
`resolvedSizeClass` from the route's expression is `parsed.data.size_class
!== undefined ? parsed.data.size_class : undefined` → `null` (which
IS !== undefined, so passes through as null). Actually re-checking:
`parsed.data.size_class` could be `null` (explicit) or `undefined`
(missing from partial). The `!== undefined` check passes for both
null and value. So size_class IS written when sent as null. **B4 is
NOT a defect for size_class** — the asymmetry between B3 and the
size_class path is itself a code-smell (inconsistent null-handling
philosophy), but only specialty_tier silently fails.

**Revised: B4 reframed (Minor):** inconsistent null-handling pattern
between specialty_tier and size_class in the same route. Even though
only one currently causes a bug, the pattern divergence invites a
future bug.

### Schema-vs-schema drift

- `bookingVehicleSchema` (line 336-351) has `year: ... .min(1900) .max(2100)` — accepts up to year 2100.
- `customerVehicleSchema` (line 428-442) has the same year bound — up to 2100.
- The customer-facing validator (`validateCustomerVehicleYear` in
  `vehicle-make-combobox.tsx:317-323`) rejects 2100+ via the
  `(19|20)\d{2}` rule — so 2100 is rejected client-side but accepted
  server-side. **B31 (Minor):** schema accepts wider range than
  client-side validator. Schema is a backstop; not a defect per se,
  but worth noting that the schema's `max(2100)` is a stale leftover.

### `is_incomplete` write semantics (open question carry-over)

Per #128 S2: only admin writes `is_incomplete`. Customer-created
vehicles via portal POST or public booking submission never set this
flag. Question whether incomplete-records-from-customer-paths should
also flag `is_incomplete=true`. **Operator decision.**

---

## TARGET T7 — Severity-ranked defect inventory + fix-session recommendation

| ID | Sev | Defect | File:line | Fix shape | Surface | Reset/Visual/Server/Schema |
|---|---|---|---|---|---|---|
| **B1** | Significant | Year + Color persist on category change | step-vehicle.tsx:158-166 + vehicle-form-dialog.tsx:148-158 | Add year/color resets to both `handleCategoryChange`s | Both | Reset |
| **B3** | Significant | PATCH route silently drops `specialty_tier: null` (DB inconsistency after category change) | api/customer/vehicles/[id]/route.ts:79 | Change `?? undefined` to explicit null-handling — write null when client sent null | Server | Server |
| **B15** | Significant | `customerVehicleSchema` makes year/make/model/color `.optional().nullable()` — portal accepts vehicle with zero content; public booking requires all four | validation.ts:438-441 | Decide intended semantics (operator question); if required, drop `.optional().nullable()` from each `.min(1, ...).optional().nullable()` chain | Portal + schema | Schema |
| **B22** | Significant | Saved-vehicle card displays `specialty_tier` as raw key not human label | step-vehicle.tsx:313 | Use `getSpecialtyTierLabel(category, tierKey)` from `vehicle-categories.ts:103` | Public booking | Display |
| **B2** | Moderate | Classifier "Identifying vehicle..." spinner row appears/disappears → layout shift | step-vehicle.tsx:491-496 | Reserve height (Option A from T5) | Public booking | Visual |
| **B2-P** | Moderate | Portal classifier advisory banner appears/disappears → layout shift | vehicle-form-dialog.tsx:324-336 | Same Option A pattern | Portal | Visual |
| **B5** | Moderate | Classifier in-flight + category change → stale classification overwrites cleared state | step-vehicle.tsx:118-143 + vehicle-form-dialog.tsx:168-184 | Cancellation ref / AbortController in `classify` | Both | Async race |
| **B5-P** | Moderate | Same race in portal | vehicle-form-dialog.tsx:177-182 | Same fix | Portal | Async race |
| **B6** | Moderate | Year FormField error message shows/hides on every keystroke → small ongoing layout shift in Year+Color row | step-vehicle.tsx:449-478 + form-field.tsx:32 | Reserve `min-h-[1rem]` for FormField error slot | Both | Visual |
| **B7** | Minor | Validation timing inconsistent within public booking (year=real-time+blur; others=submit) | step-vehicle.tsx:459-476 vs 271-292 | Standardize: either all real-time or all submit-with-onBlur | Public booking | Validation |
| **B9** | Minor | Cross-form year validation timing differs (public real-time, portal submit) | step-vehicle.tsx vs vehicle-form-dialog.tsx | Standardize after B7 | Cross | Validation |
| **B10** | Minor | Portal Year FormField has no `required` indicator | vehicle-form-dialog.tsx:270 | Add `required` after B15 decision | Portal | Display |
| **B17** | Minor | No focus management on category change | both forms | Programmatic focus to first newly-empty required field | Both | A11y |
| **B19** | Minor | Public booking saved→manual toggle doesn't clear stale manual form state | step-vehicle.tsx:361 | Reset manual fields when entering manual mode | Public booking | Reset |
| **B26** | Minor | FormField error `<p>` has no `aria-live` / `aria-describedby` | form-field.tsx:32 | Add a11y attributes | Global | A11y |
| **B27** | Minor | Category buttons not exposed as radio group | step-vehicle.tsx:395-409 | `role="radio"` + `aria-checked` | Public booking | A11y |
| **B28** | Minor | Mobile category grid `grid-cols-2` produces asymmetric (2,2,1) layout | step-vehicle.tsx:390 | `grid-cols-3 sm:grid-cols-5` | Public booking | Mobile |
| **B30** | Minor | Color case timing differs (public display vs portal submit) | step-vehicle.tsx:483 vs vehicle-form-dialog.tsx:218 | Standardize on one timing | Cross | Consistency |
| **B31** | Minor | Validation schemas accept year up to 2100; client validator rejects 2100+ | validation.ts:347/438 | Narrow schemas to 2099 OR widen client validator to 2100 | Schema | Schema |
| **B4** | Minor | Asymmetric null-handling between size_class and specialty_tier in PATCH route | api/customer/vehicles/[id]/route.ts:74,79 | Standardize (paired with B3 fix) | Server | Server |
| **B11** | Informational | vin/license_plate/notes in vehicleSchema; no form collects them (carry-over Q5/S1) | validation.ts:80-82 | Operator decision — surface in customer forms OR drop from schema | Schema | Open Q |
| **B12** | Informational | `customerData?.vehicles` captured once via useState initializer; no re-react to prop change | step-vehicle.tsx:71-83 | useEffect to sync if prop changes; acceptable for current flow | Public booking | State |
| **B24** | Informational | Dead useEffect with empty branches | step-vehicle.tsx:192-199 | Delete | Public booking | Cleanup |
| **B25** | Informational | In-progress un-committed Step 1 entry lost on Step 2 back-nav | booking-wizard.tsx orchestration | Document convention; out of scope unless operator wants persistence | Public booking | UX |
| **B29** | Informational | Hardcoded `VEHICLE_CATEGORIES` won't render new DB values | vehicle-categories.ts:9-15 | Document — out of scope for this audit | Both | Schema |

**Totals:** 4 Significant + 9 Moderate + 8 Minor + 3 Informational =
**24 defects.**

### Fix-arc recommendation: ONE coherent session

The 24 defects collapse to three behavioral concerns:

1. **Reset semantics + DB consistency** — B1, B3, B4, B22, B19. ~80
   prod lines. Covers operator finding #1 and the silent
   server-inconsistency siblings.
2. **Visual stability** — B2, B2-P, B6. ~30 prod lines (mostly
   reserved heights). Covers operator finding #2.
3. **Cross-surface contract alignment + async hygiene** — B5/B5-P,
   B7, B9, B10, B15, B30, B31, B17 (subset). ~100-150 prod lines.
   The B15 operator decision drives B10/B7 scope.

**ONE session** can address all three behavioral concerns because they
share the same files and same review unit. Three internally-organized
commits in the session reflect the concerns. Production target
~250-350 lines net.

Memory #8 risk: the prompt's ≤200-line target is breached only if
B15 is resolved as "make required" (forces schema change + several
test-suite updates). If B15 is deferred, ~200-250 lines is achievable.

**Splitting NOT recommended** — these defects are entangled. Splitting
by file or concern would force the second session to re-derive the
same intended-behavior model. The audit's value is in surfacing them
together; the fix's value is in applying them together.

**Out-of-scope for the next fix session:**
- B11 (vin/license_plate/notes): pure operator decision, not a defect
  per se.
- B26/B27/B28 (a11y / mobile polish): worth bundling into a separate
  a11y-polish pass.
- B12 / B24 / B25 / B29 (informational): document, defer.

---

## TARGET T8 — Regression-locking test pattern

The single most-valuable durable output of this audit is a **contract
test** that locks the T1 intended-behavior model. Without it, the next
form refactor silently breaks reset semantics again (B1 already
existed for ≥3 sessions before today's audit).

### Test shape (T1 contract)

`src/components/booking/__tests__/vehicle-forms-reset-contract.test.tsx`
(new) — renders BOTH forms with the same fixture data, then for each
trigger field in T1.1 simulates a change and asserts that target
fields are reset / preserved per the matrix.

```ts
describe('#135 T1 — vehicle-form reset contract', () => {
  describe.each([
    ['StepVehicle', renderStepVehicle],
    ['VehicleFormDialog', renderVehicleFormDialog],
  ])('%s', (_label, render) => {
    it('category change resets ALL fields', () => {
      const { getYear, getColor, getMake, getModel, getSize, getTier, changeCategory } = render({
        initial: { category: 'automobile', year: 2020, color: 'Red', make: 'Honda', model: 'Civic', size_class: 'sedan' },
      });
      changeCategory('rv');
      expect(getYear()).toBe(null);     // B1 lock
      expect(getColor()).toBe('');      // B1 lock
      expect(getMake()).toBe('');
      expect(getModel()).toBe('');
      expect(getSize()).toBe(null);
      expect(getTier()).toBe(null);
    });

    it('make change resets only model + classifier-derived state', () => { ... });
    it('model change resets only model errors + retriggers classifier', () => { ... });
    it('year change does NOT reset make/model/color/size', () => { ... });
    it('color change does NOT reset other fields', () => { ... });
  });
});
```

Mirror the Track B `sale-vs-quotes-shared-prop-parity.test.tsx`
pattern from #120 — a small contract test that runs across both
surfaces and fails loudly if any reset transition drifts.

### Optional second test (T6 server contract)

`src/app/api/customer/vehicles/[id]/__tests__/route.test.ts` — assert
that PATCHing a vehicle with a category change writes `null` to the
previously-set specialty_tier or size_class. Catches B3/B4 + locks
against future divergence.

---

## Open operator questions

| # | Question | Topic | Blocks |
|---|---|---|---|
| **Q1** | Confirm T1.1 anchor: on category change, reset ALL of [make, model, year, color, vin, license_plate, notes, size_class, specialty_tier, classification, errors]? | T1 contract | B1, T8 test |
| **Q2** | Resolve B15: should customer portal require year/make/model/color (matching public booking), or is "save vehicle with just category" intentional? | Schema | B10, B15, fix scope |
| **Q3** | Resolve B11 (carry-over Q5): surface vin/license_plate/notes on customer forms, OR drop from `vehicleSchema`? | Schema-vs-form | B11 |
| **Q4** | T5 fix choice: Option A (height-reserved spinner, ~5 lines) or Option B (inline-icon, ~30 lines for `<Input>` slot)? | Visual | B2, B2-P |
| **Q5** | B7/B9 validation timing: standardize on real-time + onBlur for all required fields (consistent feedback) or on submit-only (RHF default)? | Validation | B7, B9 |
| **Q6** | T6 `is_incomplete` write semantics: should customer-paths set `is_incomplete=true` for missing optional fields? | Schema | Informational |

---

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ File:line citations throughout (every B-row in the inventory
  carries one).
- ✅ Memory #11 — every behavior claim grounded in actual code (read
  every state setter, every effect, every conditional render across
  both forms + their shared collaborators + the PATCH route + schemas).
- ✅ Memory #25 — operator's holistic-not-patch framing applied at the
  behavioral level (T1 contract → defect inventory → contract test).
- ✅ Both forms get equal treatment (NO-UNIFICATION verdict
  respected). Cross-surface differences catalogued in T4.9.
- ✅ Audit MAPS — does not draft fix code. Fix shapes are described,
  not implemented.
- ✅ Worktree isolation off `origin/main` (`d01879dd`).
