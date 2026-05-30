# Vehicle-Form Pattern Unification Feasibility Audit (2026-05-30)

> Read-only diagnostic audit. No source / migration / test changes.
> Branch: `audit/vehicle-form-pattern-unification-feasibility`
> Performed in an isolated `git worktree` off `origin/main` (`d5ea9e65`,
> the public booking flow audit merge) so the shared checkout stays
> undisturbed.

## Context

The prior audit (`docs/dev/PUBLIC_BOOKING_FLOW_AUDIT.md`) raised F5 —
"two independent vehicle-form patterns" — as the architectural backdrop
to the F1 form-reset bug. The public booking form auto-classifies via
`resolveVehicleClassification`; POS, customer portal, admin, and
quote-builder use plain manual `useState` (POS) or react-hook-form
(portal, admin) for category with no auto-classifier. The F1 bug is a
direct consequence of one pattern's auto-correction effect overriding
explicit user input — a consequence the other patterns don't have
because they don't auto-classify.

This audit determines whether F5 is a real DRY problem with a
unification opportunity, OR whether the surfaces have legitimately
different needs and "two patterns" is the right structural answer.

## TL;DR

**Verdict: NO-UNIFICATION** (Target 7), with three targeted small
improvements available.

**Evidence:** the prior audit's "two patterns" framing was an
under-count. There are **four distinct vehicle-form components**
(`step-vehicle.tsx`, `vehicle-create-dialog.tsx`,
`account/vehicle-form-dialog.tsx`, and an **inline** form in
`admin/customers/[id]/page.tsx`) mounted across five surfaces. The
deltas between them — validation schema (3 different Zod schemas),
state manager (raw `useState` vs react-hook-form), submission target
(4 different writers), size_class set (3 vs 5), classifier (booking
only), `size_class_manual_override` write (admin only), and saved-
vehicles selector (booking only) — are each tied to a **legitimate
context-driven need**, not accidental drift.

**Critically, the classifier is structurally necessary for public
booking** and not just a "nice-to-have." Customers cannot pick
`exotic` or `classic` from the manual size_class dropdown (Session 29
anti-gaming — the customer-facing dropdown is restricted to 3 values),
yet the system must DETECT exotic/classic vehicles to route them to
`<SpecialtyVehicleBlock>` (the callback flow). The classifier's
Layers 4 + 5 (exotic detection / classic detection at
`vehicle-categories.ts:752-770`) are the only path that produces an
exotic/classic verdict for a customer-entered vehicle. Removing the
classifier from public booking would silently mis-route Ferrari/
Lamborghini/etc. customers into the sedan price path.

Shape Alpha (manual everywhere — kill the classifier) is therefore
**rejected**. Shape Beta (classifier everywhere) introduces F1's
bug pattern to POS/admin where operators already know the vehicle —
**rejected**. Shape Gamma (shared component with surface-specific
config) requires ≥4 axes of configuration (schema, state manager,
submit target, override-flag behavior) to absorb the legitimate
deltas — **rejected as abstraction over-engineering** (Memory #13).

**Three small targeted improvements are available and worth doing
independently of the F1 hotfix:**

1. **C1 (Significant, hotfix-class):** F1's fix stays a contained
   single-file patch in `step-vehicle.tsx` (the prior audit's Y-1
   shape, ~5 lines). The classifier stays; the override gate becomes
   conservative.
2. **C2 (Minor, ride-along opportunity):** the POS dialog
   (`vehicle-create-dialog.tsx`) uses raw `useState` + a hand-rolled
   `validate()`; the other 3 surfaces use react-hook-form + Zod. The
   simplest cross-surface alignment is to port POS to RHF + a shared
   schema (reuse `vehicleSchema` since POS allows all 5 sizes). ~80
   lines moved, no behavior change. **Optional; not a blocker.**
3. **C3 (Minor, customer-portal upgrade opportunity):** the customer
   portal does NOT use the classifier today — a customer with a
   Ferrari can self-identify as a sedan and stay there. The portal
   restricts size_class to 3 values (sedan/truck/van), so exotic
   customers have no manual route to flag themselves. Adding the
   classifier to the portal would let it auto-detect exotic vehicles
   and surface a "we'd like to talk" prompt (the
   `<SpecialtyVehicleBlock>` analogue). **Operator decision** — not
   shipped today and not necessarily wanted, but worth surfacing.

F5 should be **REFRAMED** in the next CHANGELOG roll from "Minor DRY
cleanup — two patterns" to "Informational — four context-driven
patterns, intentional, classifier mandatory for public booking. Two
small optional cleanups available (C2, C3); no blanket unification
recommended." Future audits should stop flagging F5 as a defect.

---

## TARGET 1 — Feature inventory matrix

**Four components mounted across five surfaces.** The audit prompt's
"5 surfaces" enumeration is correct as a mount-site count, but POS
Sale and POS Quote mount the SAME `vehicle-create-dialog.tsx` (per
the #120 G2 fix; verified `quote-ticket-panel.tsx:27, 1215` mirrors
`ticket-panel.tsx:28, 706`). The 4 actual components are:

| # | Component | File | Mounted by |
|---|-----------|------|-----------|
| **W** | Public booking wizard step | `src/components/booking/step-vehicle.tsx` (514 lines) | `booking-wizard.tsx:1110` |
| **P** | POS shared dialog | `src/app/pos/components/vehicle-create-dialog.tsx` (361 lines) | `ticket-panel.tsx:706` (Sale), `quote-ticket-panel.tsx:1215` (Quote) |
| **C** | Customer portal dialog | `src/components/account/vehicle-form-dialog.tsx` (327 lines) | `src/app/(account)/account/vehicles/page.tsx:225` |
| **A** | Admin Customers inline form | `src/app/admin/customers/[id]/page.tsx:275-309, 443-535, 1401-1514` | inline; mounted in customer-detail page |

All four import the same `<VehicleMakeCombobox>` (`src/components/ui/vehicle-make-combobox.tsx`, 307 lines).

### T1.1 — Inputs collected

| Field | W (booking) | P (POS) | C (portal) | A (admin) | Notes |
|-------|:-----------:|:-------:|:----------:|:---------:|-------|
| category (5 values) | ✅ button-grid w/ icons (`:355-379`) | ✅ `<Select>` dropdown (`:205-214`) | ✅ `<Select>` dropdown (`:194-206`) | ✅ `<Select>` dropdown (`:1413-1425`) | Same 5 values from `VEHICLE_CATEGORIES`; UX differs (mobile-first for W) |
| year | ✅ `<Select>` + Other-mode (`:407-419`) | ✅ `<Select>` + Other-mode (`:217-265`) | ✅ `<Select>` + Other-mode w/ RHF (`:208-249`) | ✅ `<Select>` + Other-mode w/ RHF (`:1428-1466`) | All four share the Other-mode pattern. Year options from `getVehicleYearOptions()` (combobox export) |
| make | ✅ `<VehicleMakeCombobox>` (`:382-393`) | ✅ same (`:270-275`) | ✅ same (`:251-259`) | ✅ same (`:1468-1475`) | Shared component; same per-category fetch + cache |
| model | ✅ `<Input>` w/ title-case (`:396-404`) | ✅ `<Input>` w/ title-case (`:282-291`) | ✅ `<Input>` w/ title-case-on-save (`:261-268`) | ✅ `<Input>` w/ title-case-on-save (`:1477-1479`) | All four use the same `titleCaseField()` helper |
| color | ✅ (`:420-428`) | ✅ (`:300-309`) | ✅ (`:272-279`) | ✅ (`:1483-1485`) | Identical pattern |
| size_class | ⚠ button-grid, all 5 keys via `VEHICLE_SIZE_LABELS` (`:440-466`); classifier-detected `exotic`/`classic` HARD-WINS over manual at `:166-168` | ✅ `<Select>`, all 5 via `VEHICLE_SIZE_CLASS_KEYS` (`:335-344`) | ✅ `<Select>`, **restricted to 3** via `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` (`:33, 300-311`) | ✅ `<Select>`, all 5 via `VEHICLE_SIZE_CLASS_KEYS` (`:295, 1496-1500`) | **Significant divergence — see T2** |
| specialty_tier | ✅ button-grid via `SPECIALTY_TIERS[category]` (`:468-492`) | ✅ `<Select>` via `SPECIALTY_TIERS[category]` (`:316-333`) | ✅ `<Select>` via `SPECIALTY_TIERS[category]` (`:286-298`) | ✅ `<Select>` via `SPECIALTY_TIERS[category]` (`:1488-1494`) | Same source-of-truth (`vehicle-categories.ts:38-58`); UX differs (button-grid vs dropdown) |
| vin | ❌ | ❌ | ❌ | ❌ (form has none, schema allows at `validation.ts:80`) | Schema field exists; no surface captures it |
| license_plate | ❌ | ❌ | ❌ | ❌ (schema `:81`) | Same |
| notes | ❌ | ❌ | ❌ | ❌ (schema `:82`) | Same |
| customer_id | ➖ (set at submit by wizard) | ✅ prop (`:39`) | ➖ (server-derived from session) | ✅ from URL (`:278`) | Plumbing detail |
| saved-vehicle picker | ✅ card-grid for returning customers (`:268-343`) | ➖ (separate `<VehicleSelector>` component at mount) | ➖ (page-level listing at `vehicles/page.tsx`) | ➖ (page-level listing) | Booking is the only flow that bundles selection + entry |

**Key observations on inputs:**
- The four forms collect THE SAME SIX FIELDS (category, year, make,
  model, color, size_class/specialty_tier). VIN, license_plate, and
  notes exist in the admin schema but are not actually rendered
  anywhere — schema-vs-form drift, not surface-divergence.
- Public booking and customer portal restrict size_class to 3 values
  by design (CLAUDE.md Rule 19 / Session 29 anti-gaming /
  `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`).
- POS and admin allow all 5 values because operators are trusted to
  set exotic/classic explicitly.
- Booking uses a button-grid UX for category and size_class (mobile-
  first); the dialogs use dropdowns (desktop-first).

### T1.2 — Auto-behaviors

| Behavior | W | P | C | A |
|----------|:-:|:-:|:-:|:-:|
| Auto-classify category from make (Layer 1) | ✅ (`step-vehicle.tsx:118-120` — the F1 bug) | ❌ | ❌ | ❌ |
| Auto-pick size_class from model (Layer 2) | ✅ (via `effectiveSizeClass`, `:166-168`) | ❌ | ❌ | ❌ |
| Default specialty_tier per category (Layer 3) | ✅ (via `classification?.specialty_tier`, `:171`) | ❌ — operator picks from dropdown | ❌ — customer picks | ❌ — admin picks |
| Auto-detect exotic (Layer 4) | ✅ (`classifierSpecialty` at `:164`, hard-wins over manual) | ❌ — operator picks `'exotic'` from `size_class` dropdown | ❌ — **structurally impossible** (3-value subset excludes exotic) | ❌ — admin picks `'exotic'` from dropdown |
| Auto-detect classic (Layer 5) | ✅ (same path) | ❌ | ❌ (same impossibility) | ❌ |
| Auto-pre-fill from logged-in customer's vehicles | ✅ — saved-vehicle cards (`:269-343`) | ➖ (selector outside the dialog) | ➖ (page-level) | ➖ |
| Reset dependent fields on category change | ✅ (`handleCategoryChange:141-149` — clears make, model, classification, manualSizeClass, manualSpecialtyTier, errors) | ✅ (`:91-97` — clears make, sizeClass, specialtyTier, errors) | ✅ (`:130-138` — clears make, size_class, specialty_tier via RHF setValue) | ✅ (`:297-305` — clears make, size_class, specialty_tier) |
| Reset model on make change | ✅ (`:388` — `if (val !== make) setModel('')`) | ❌ | ❌ | ❌ |
| Combobox auto-fetches per category | ✅ (`vehicle-make-combobox.tsx:67-86` — shared) | ✅ | ✅ | ✅ |
| Combobox clears value on category prop change | ✅ (`:43-51` — shared) | ✅ | ✅ | ✅ |
| Sets `size_class_manual_override = true` on save | ❌ | ❌ | ❌ | ✅ (`:496` — admin-only logic; flag protects manual pick from future classifier runs) |
| Sets `is_incomplete = !make \|\| !model` on save | ❌ | ❌ | ❌ | ✅ (`:509`) |

**Asymmetry summary:**
- **Classifier is unique to W.** Layers 1-5 are all consumed by
  step-vehicle but none of the other three surfaces.
- **`size_class_manual_override` write is unique to A.** This flag
  (`vehicles.size_class_manual_override`, BOOLEAN NOT NULL DEFAULT
  false, per `DB_SCHEMA.md:3055`) protects admin-set values from
  subsequent classifier reruns. Only the admin form writes it.
- **`is_incomplete` flag write is unique to A.** Other surfaces don't
  set it; the column's default is `false` so absence is benign.
- **Reset-model-on-make-change is unique to W** — and is the trigger
  for the F1 dual-category empty-model classifier path.

### T1.3 — Validation

| Aspect | W | P | C | A |
|--------|---|---|---|---|
| Schema | `bookingVehicleSchema` (`validation.ts:336-351`) | none (hand-rolled `validate()` at `:99-118`) | `customerVehicleSchema` (`:428-442`) | `vehicleSchema` (`:64-83`) |
| size_class restriction | 3-value (`CUSTOMER_SELF_SERVICE_SIZE_CLASSES`) | none at schema; UX dropdown shows 5 | 3-value (`CUSTOMER_SELF_SERVICE_SIZE_CLASSES`) | 5-value (`VEHICLE_SIZE_CLASS_KEYS`) |
| Required fields | make, model, year, color (all required per `step-vehicle.tsx:243-254`) | make, model, year, color, specialty-tier-if-specialty (`:99-117`) | year (via RHF), make/model required at server (schema allows undefined client-side; required `min(1)` strings) | same as C |
| Where validation runs | Step 1 `handleContinue` (`:241-266`) + final booking submit validates against schema | client `validate()` → server route validates against admin Zod schemas | RHF resolver + server route validates against same schema | RHF resolver + Supabase column constraints |
| Schema imports `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` | ✅ | ➖ (no schema) | ✅ | ❌ (uses `VEHICLE_SIZE_CLASS_KEYS`) |

**Three Zod schemas + one hand-rolled.** All four validate "make,
model, year, color, category" as the core requirement; size_class
breadth differs by surface contract.

### T1.4 — Submission target

| Surface | Path | Payload shape | Auth |
|---------|------|---------------|------|
| **W** | NOT immediate — booking step just sets wizard state; the FINAL booking submits via `POST /api/book` (`api/book/route.ts`) which inserts the vehicle row at `:240-249` | bookingSubmitSchema | session cookie or anonymous |
| **P** | `POST/PATCH /api/pos/customers/[id]/vehicles` (`vehicle-create-dialog.tsx:141, 147`) | manual object (`:128-137`) | POS HMAC via `posFetch` |
| **C** | `POST/PATCH /api/customer/vehicles` or `/api/customer/vehicles/[id]` (`vehicle-form-dialog.tsx:148-153`) | RHF data + manual overrides (`:155-164`) | customer session |
| **A** | Direct Supabase `INSERT`/`UPDATE` on `vehicles` table (`admin/customers/[id]/page.tsx:512-523`) | manual payload (`:498-510`) | admin user session (page-level) |

**Four different writers.** No two surfaces share a submission path.

### T1.5 — Conditional UX

| Condition | W | P | C | A |
|-----------|---|---|---|---|
| size_class shown when `category === 'automobile'` | ✅ (`:440`) | ✅ (`:334-345`) | ✅ (`:299-311`) | ✅ (`:1496-1500`) |
| specialty_tier shown when `isSpecialtyCategory(category)` | ✅ (`:469`) | ✅ (`:315-333`) | ✅ (`:286-298`) | ✅ (`:1488-1494`) |
| Tier label adapts ("Size Class" / "Type" / "Length" / "Class") | ❌ (always "Vehicle Size" or "Size / Type") | ✅ (`TIER_DROPDOWN_LABELS`) | ✅ same | ✅ same |
| Model placeholder adapts per category | ⚠ hardcoded "Camry / Sportster" check at `:401` | ✅ (`MODEL_PLACEHOLDERS`) | ✅ same | ✅ same |
| Classifier spinner shown | ✅ (`classifying`, `:432-437`) | ➖ | ➖ | ➖ |
| Saved-vehicle card-grid for returning customers | ✅ (`:269-343`) | ➖ | ➖ | ➖ |
| "Add a New Vehicle" button toggling mode | ✅ (`:325-338`) | ➖ | ➖ | ➖ |

### T1.6 — Cascading effects on change

| Change | W | P | C | A |
|--------|---|---|---|---|
| Make change → clear model | ✅ (`:388`) | ❌ | ❌ | ❌ |
| Make change → debounced classify | ✅ (400 ms, `:129-138`) | ❌ | ❌ | ❌ |
| Classifier result → setCategory if disagree (F1 BUG) | ✅ (`:118-120`) | ➖ | ➖ | ➖ |
| Classifier exotic/classic → hard-win over manual size_class | ✅ (`:164-168`) | ➖ | ➖ | ➖ |
| Combobox onChange('') on category change | ✅ (shared combobox `:43-51`) | ✅ | ✅ | ✅ |
| Combobox refetches makes on category change | ✅ (shared `:67-86`) | ✅ | ✅ | ✅ |

---

## TARGET 2 — Same vs different vs accidental

For each delta from Target 1, classify:

| Delta | Classification | Evidence |
|-------|----------------|----------|
| **Validation schema (3 Zod variants + 1 hand-rolled)** | **Different by valid design** (size_class breadth) + **Different by accident** (POS hand-rolled vs RHF on others) | size_class breadth tied to operator-vs-customer trust (CLAUDE.md Rule 19); RHF-vs-useState is historical. POS predates RHF adoption in the surface. |
| **State manager (RHF vs raw useState)** | **Different by accident** | All four collect the same fields; RHF + Zod is the codebase's prevailing pattern for forms (admin Services, admin Customers info tab, customer portal). POS dialog uses raw useState alone among the four. C2 opportunity. |
| **Submission target (4 writers)** | **Different by valid design** | POS uses HMAC auth; portal uses customer session RLS; admin uses service-role direct write; booking deferred to final submit. Different auth/permission models = different writers. Unification would require unifying auth layers — way out of scope. |
| **size_class set (3 vs 5)** | **Different by valid design** | Customer-facing flows (W, C) restricted to 3 per anti-gaming; operator-facing flows (P, A) allow 5. This is the documented Rule 19 + Session 29 constraint. |
| **Classifier (W only)** | **Different by valid design** | The classifier's Layer 4/5 (exotic/classic) is the ONLY way customer-entered vehicles can be detected as exotic/classic. Without it, public booking silently mis-routes exotic customers. POS/admin operators can pick exotic from the manual dropdown; no need for the classifier. |
| **`size_class_manual_override` write (A only)** | **Different by valid design** | Flag exists to protect operator-set values from future classifier reruns. Other surfaces don't need to write it (W: classifier IS the authority on customer flows; P, C: no classifier ever runs against their writes). Subtle but correct. |
| **`is_incomplete` write (A only)** | **Different by accident OR valid (admin needs to flag incomplete records for follow-up)** | Other surfaces also write incomplete data (booking allows empty model? no — it requires it). Worth flagging for operator confirmation; not blocking. |
| **Reset-model-on-make-change (W only)** | **Different by valid design BUT contributes to F1** | The reset is a sensible UX (model is make-specific) but combined with the 400 ms classifier debounce creates the dual-category empty-model F1 path. The reset is fine; the override gate is what needs fixing. |
| **Tier label adapts (P, C, A) — not in W** | **Different by accident** | W uses "Vehicle Size" / "Size / Type" generic labels; others use category-adaptive `TIER_DROPDOWN_LABELS`. Minor inconsistency; cheap to fix. |
| **Model placeholder hardcoded (W)** | **Different by accident** | W has `category === 'automobile' ? 'e.g., Camry' : 'e.g., Sportster'` at `:401`; others use `MODEL_PLACEHOLDERS[category]` map. Minor inconsistency. |
| **Saved-vehicle card-grid (W only)** | **Different by valid design** | Booking is the only customer-facing flow that bundles "select an existing vehicle" with "enter a new one." Dialogs are invoked from a separate selector layer in P/C/A. |
| **Category UX (button-grid in W; dropdown in P, C, A)** | **Different by valid design** | W is mobile-first customer-facing; P/C/A are dialog-form-factor desktop / iPad. Both UX choices are legitimate for their contexts. |

**Summary:**
- 7 deltas are **different by valid design** (out of 12 catalogued).
- 4 deltas are **different by accident** (state manager, tier label
  adaptive helper, model placeholder helper, `is_incomplete` write —
  the last is operator-decision).
- 1 delta is **valid but contributes to F1** (the reset-model-on-make
  change — fix the override gate, not the reset).

The accidental deltas are small and not unification-justifying on
their own. The valid-design deltas are load-bearing.

---

## TARGET 3 — Classifier value analysis

Honest assessment: **is `resolveVehicleClassification` worth keeping?**

### T3.1 — What does the classifier do?

`src/lib/utils/vehicle-categories.ts:684-773` runs FIVE layers:

1. **Layer 1 — category disambiguation** (`:691-715`). Queries
   `vehicle_makes` table by make name; for single-row returns picks
   that category, for multi-row uses model keywords to disambiguate,
   for 0-row defaults to `'automobile'`. This is the layer that
   triggers F1.
2. **Layer 2 — size_class hint from model** (`:723-731`). Uses
   `MODEL_SIZE_HINTS` (87 sedans + 131 truck/SUV/van + 37 SUV-3row/van
   = ~255 model strings, 32 LOC of definition at `vehicle-categories.ts:118-193`)
   to auto-pick size_class for automobiles.
3. **Layer 3 — specialty_tier default** (`:746`). For non-automobile,
   picks the smallest tier (`'rv_up_to_24'`, `'boat_up_to_20'`, etc.)
   from `DEFAULT_SPECIALTY_TIERS` (`:617-623`).
4. **Layer 4 — exotic detection** (`:752-759`). Uses `EXOTIC_MAKES`
   (29 makes, `:354-361`) + `EXOTIC_MAKE_MODELS` (16 makes' specific
   models, `:370-464`) to override size_class to `'exotic'`. Hard-wins
   over manual UX selection per `step-vehicle.tsx:164-168`.
5. **Layer 5 — classic detection** (`:762-770`). Uses
   `CLASSIC_ELIGIBLE_MAKES` (~50 makes' models, `:499-573`) +
   `CLASSIC_YEAR_THRESHOLD` (year ≤ current - 25) to override
   size_class to `'classic'`. Hard-wins; exotic takes precedence in
   the dual-flag case.

### T3.2 — Real value of each layer

| Layer | Value to public booking | Customer-side replacement cost if removed |
|-------|-------------------------|-------------------------------------------|
| **L1 — category disambiguation** | Catches "Honda motorcycle vs car" when the user picked Automobile but the model is a motorcycle. ~160 motorcycle keywords (`vehicle-categories.ts:202-248`) + similar for boat / RV / aircraft. Real customer benefit IF customers pick the wrong category by default. Negative cost: it's the F1 bug source. | **Medium** — without it, customers must pick the right category up-front. Realistic for an explicit 5-button picker like `step-vehicle.tsx:357-379`; arguably the picker is unambiguous enough that the user picks correctly the first time. |
| **L2 — size_class hint from model** | Pre-selects sedan/truck/SUV from model. Skips the manual button-grid step on the happy path. ~255 model substring matches. | **Low** — customers can manually pick from 3 buttons; one extra tap. |
| **L3 — specialty_tier default** | Pre-selects rv_up_to_24 etc. — operator can still correct. | **Very low** — defaults to smallest is wrong as often as right for RVs; manual pick is fine. |
| **L4 — exotic detection** | **STRUCTURALLY MANDATORY.** The manual size_class dropdown for customers (`step-vehicle.tsx:440-466`) shows `VEHICLE_SIZE_LABELS` keys but the customer-facing-subset constraint (`CUSTOMER_SELF_SERVICE_SIZE_CLASSES`) in the validation schema would reject exotic/classic at submit anyway. So a Ferrari customer has **no manual path** to flag themselves as exotic. The classifier is the only way. | **HIGH** — without L4, Ferrari customers silently route through the sedan price path and never reach `<SpecialtyVehicleBlock>`. This is a real customer-facing UX defect and a missed staff-handoff opportunity. |
| **L5 — classic detection** | Same as L4. The `CLASSIC_ELIGIBLE_MAKES` table + 25-year-old threshold means a 1972 Camaro auto-flags as classic. | **HIGH** — same reasoning. Classic vehicles deserve the callback gating per business policy. |

**Verdict on the classifier:** **Layers 4 + 5 are mandatory** for public
booking's exotic/classic detection. They cannot be replaced by a
manual dropdown because customers don't have access to those options
by design. Layers 1-3 are **convenience features** that could be
removed without breaking the booking flow — but L1's reach (Honda
motorcycle / BMW motorcycle / Yamaha boat / etc.) is non-trivial
domain data, and L2/L3 reduce required clicks.

### T3.3 — The dual-category empty-model frequency

The F1 audit theorized that the dual-category empty-model path
(`disambiguateCategory` defaulting to `'automobile'` at
`vehicle-categories.ts:302-305`) is the primary trigger. Evidence
that this is a real frequency-not-edge-case path:

- `vehicle_makes` table — confirmed dual-category candidates include
  Honda (auto + motorcycle), BMW (auto + motorcycle), Yamaha (motor +
  boat — boat makes referenced at `BOAT_MODEL_KEYWORDS:250-255` for
  `'waverunner'` / `'jet ski'` / `'fx'` / `'vx'`), Suzuki (likely
  motor + boat — `'gsx'`, `'hayabusa'` motorcycle keywords + boats),
  Kawasaki (motor + watercraft — `'ninja'` motorcycle keywords +
  `'jet ski'`).
- The combobox filters by category at `api/vehicle-makes/route.ts:14`,
  so a customer who picks RV → sees only category=rv makes. For RV,
  dual-category collision is mostly Yamaha (rare) and a few
  cross-listed RV brands. Most RV makes are RV-only (Winnebago,
  Airstream, Thor, Tiffin).
- For boat / motorcycle, dual-category collision is far more common
  (BMW, Yamaha, Honda, Suzuki, Kawasaki — major makes appear in
  both their automotive and motorcycle/marine inventories).
- The F1 audit identified path #1 (make-not-in-table) as a separate
  trigger. Combobox + classifier both query the same `vehicle_makes`
  table, so the 0-row path only fires when the user types via "Other
  mode" (`vehicle-make-combobox.tsx:198-225`) — free-text input
  bypassing the per-category dropdown. Less common than path #2 but
  also reachable.

**Probable F1 frequency:** for non-automobile categories, the
dual-category empty-model path fires for ANY make that has cross-
category data in `vehicle_makes`. This is plausibly common for the
motorcycle/boat/RV motorsports manufacturers. Matches the operator's
"reproduces across all 4 non-automobile categories" symptom.

### T3.4 — Is the classifier worth keeping?

**Yes**, contingent on:
1. F1 fix lands (Y-1 hotfix in `step-vehicle.tsx`).
2. F4 (silent default) is addressed at some point (resolver dev-warn
   when 0-row default fires for a make that came from the combobox).

**Layers 4 + 5 are the load-bearing justification.** Layers 1-3 are
nice-to-haves but the cost of removing them is low and the benefit
of keeping them is also low — they could be removed at a future
audit without functional regression. For the F1 fix, the right move
is to FIX the override gate, not to remove the classifier wholesale.

---

## TARGET 4 — Three unification shapes

### Shape Alpha — Manual everywhere (kill the classifier)

| Aspect | Detail |
|--------|--------|
| **What it does** | Remove `resolveVehicleClassification`. Public booking accepts manual category + make + model + size_class (3-value) the same way customer portal does. |
| **What unifies** | State management, schema, conditional UX. All four surfaces collapse toward the portal/admin pattern. |
| **What's lost** | **Exotic/classic auto-detection (L4 + L5).** Ferrari customers silently route through the sedan price path. No structural alternative because customers can't pick exotic/classic from a manual dropdown (Session 29 anti-gaming). |
| **Implementation cost** | Remove `step-vehicle.tsx:117-120` + `:160-168` (~10 lines) + the entire `classify`/`classification`/`classifying` state machinery (~40 lines) + the dependent `effectiveSizeClass` derivation. Either reduce booking step to ~250 lines or migrate to the portal dialog. |
| **Test surface area** | Existing classifier tests (presumably exist) become dead code. New customer flow tests needed for the manual-only path. |
| **Migration risk** | **HIGH — customer-facing behavior regression** for exotic/classic vehicles. Real revenue impact (these customers are routed to call-back today; without that they'd be allowed to book under-priced services and the gap surfaces at job time). |
| **Verdict** | **REJECTED** — kills load-bearing customer-routing feature. |

### Shape Beta — Classifier everywhere

| Aspect | Detail |
|--------|--------|
| **What it does** | POS, customer portal, admin all gain auto-classification. Mount `resolveVehicleClassification` on make-change in each form. |
| **What unifies** | All four surfaces share the auto-classifier feature; the deltas in classifier-presence disappear. |
| **What's lost** | **POS operator-time UX.** Operators in POS already know the vehicle category (they're looking at the customer's car) — auto-correction would override their explicit choice the same way it overrides booking customers'. Introduces F1's bug pattern to POS, portal, and admin. |
| **Implementation cost** | Add the classifier callback + override gate to 3 forms (~150 lines each). Requires fixing F4 (silent default) FIRST, before extending. |
| **Test surface area** | New per-surface override-behavior tests. F1's regression-locking test pattern needed in 3 more places. |
| **Migration risk** | **MEDIUM-HIGH** — propagates a defect class to surfaces that currently don't have it. Even with F4 fixed, the override path's correctness is fragile in any surface where operators have explicit intent. |
| **Verdict** | **REJECTED** — actively worsens surfaces that work today. |

### Shape Gamma — Hybrid shared component, configurable

| Aspect | Detail |
|--------|--------|
| **What it does** | Build `<VehicleForm>` shared component. Props: `mode: 'public' \| 'pos' \| 'portal' \| 'admin'` or finer-grained flags (`useClassifier`, `sizeClassSet: 'customer' \| 'operator'`, `onSubmit`, `validationSchema`, `setManualOverride`, etc.). Each surface mounts with its own config. |
| **What unifies** | The form fields' rendering, conditional UX, year picker, make combobox wiring, model/color inputs. |
| **What's lost** | Surface-specific UX (button-grid for booking, dropdown for dialogs) becomes configurable via render-prop or layout-flag. |
| **Implementation cost** | ~400 lines for the shared component; ~80 lines of adapter per surface = 320 lines total saved (~35% reduction across the 4 surfaces' ~940 combined lines today). Plus 4-6 configuration axes to absorb the legitimate deltas. |
| **Test surface area** | One core component test suite + per-surface integration tests. Net not necessarily smaller because configuration permutations explode. |
| **Migration risk** | **MEDIUM** — a one-shot 4-surface migration. Plausible to do in one session if scoped carefully but easy to leak surface-specific behavior changes during the port. |
| **Configuration axes required** | (1) validation schema, (2) state manager (RHF or raw), (3) submit target, (4) size_class set (3 vs 5), (5) classifier on/off, (6) `size_class_manual_override` write, (7) `is_incomplete` write, (8) layout (button-grid vs dropdown for category + size), (9) saved-vehicle picker on/off. **NINE axes.** |
| **Verdict** | **REJECTED as over-engineering.** Nine configuration axes for a 35% line-reduction is the classic over-abstraction trap (Memory #13). Future changes to one axis risk every other surface. The shared component would have to absorb each surface's idiosyncrasies, so the "single source of truth" claim erodes within ~3 maintenance cycles. |

### Shape Delta — Shared primitives, surface-specific composition (the hidden fourth option)

A subtler approach not in the audit prompt: extract small, focused
primitives without trying to unify the orchestration.

| Aspect | Detail |
|--------|--------|
| **What it does** | Extract `<VehicleYearPicker>` (~70 lines incl. Other-mode), `<VehicleSizeOrSpecialtyPicker category={cat} value={...} onChange={...} sizeSet={3\|5} variant={'buttons'\|'dropdown'}>` (~80 lines), and a `useVehicleCategoryReset()` hook (~30 lines). Each surface composes its own form layout but uses these primitives. |
| **What unifies** | Year picker logic, size/specialty conditional rendering, category reset cascade. |
| **What's lost** | Nothing — surfaces keep their own state management, classifier opt-in, submit targets. |
| **Implementation cost** | ~180 lines for the primitives; ~50 lines saved per surface in form rendering = 200 lines saved total (~20% reduction). Three configuration axes (size set, variant, controlled values). |
| **Migration risk** | **LOW** — each surface migrates independently, no cross-surface dependencies. |
| **Verdict** | **VIABLE but not recommended now** — the absolute size of the reduction (~200 lines) is small. The primitives are reasonable but the marginal benefit per unit of effort is below the threshold for prioritization. Track as a long-term cleanup; F2 from the prior booking arc is a bigger lift. |

---

## TARGET 5 — F1 fix shape under each verdict

| Verdict | F1 fix shape | Cost |
|---------|--------------|------|
| **Alpha (kill classifier)** | F1 disappears via deletion. Side effect: exotic/classic detection breaks. | Unacceptable cost (customer regression). |
| **Beta (classifier everywhere)** | F1 must be fixed in step-vehicle FIRST (Y-1 hotfix), then F4 fixed in resolver, then classifier extended to 3 more surfaces. Sequential. | Multi-session arc; high risk. |
| **Gamma (shared `<VehicleForm>`)** | F1 fix lands as part of the shared component refactor — bake the correct override gate into the shared classifier opt-in. | Couples F1 hotfix to a 4-surface migration. Unacceptable schedule risk for a live-bug fix. |
| **Delta (primitives)** | F1 fix stays a single-file patch in `step-vehicle.tsx`. Primitives extraction is independent. | Same as no-unification. |
| **NO-UNIFICATION** | F1 fix stays a single-file patch in `step-vehicle.tsx` (the prior audit's Y-1, ~5 lines). | Hotfix-class, low risk. |

**No-unification matches the F1 hotfix scope. Gamma, Beta, and Alpha
all conflict with a fast, low-risk F1 fix.**

---

## TARGET 6 — Recommendation

**No-unification.** Reasons, evidence-based:

1. **The classifier is mandatory for public booking** (T3.4 — Layers
   4 + 5 are the only path to exotic/classic detection of customer-
   entered vehicles). Cannot be removed.
2. **POS / customer portal / admin do NOT need the classifier** —
   operators know the vehicle; customers in the portal are entering
   their own vehicles where the auto-restrict to 3 size values is
   the trust boundary (and exotic detection is structurally absent
   from the dropdown). Forcing the classifier onto these surfaces
   introduces a defect class.
3. **The validation-schema, state-manager, and submit-target deltas
   are tied to legitimate auth / trust-boundary contexts** that
   would have to be unified upstream of the form layer to unify the
   forms. Out of scope.
4. **The accidental deltas are small** (4 of 12) and address-able
   independently (C2 = RHF port for POS; tier-label / placeholder
   helpers — 5-10 lines each). They don't justify a structural
   unification.
5. **Gamma's nine configuration axes** are abstraction
   over-engineering (Memory #13). The shared-component DRY savings
   (~35%, ~340 lines) don't offset the future maintenance cost of
   nine config axes.

**F1 fix shape under no-unification:** stays the prior audit's Y-1
hotfix in `step-vehicle.tsx`. Single file, ~5 lines. Ships as
hotfix-class urgency, parallel-safe with all prior-arc sessions.

**Three optional small improvements (separate sessions):**

- **C1 (Significant, hotfix-class):** F1 fix (~5 lines, 1 file).
  Per-prior-audit shape. Ships ASAP.
- **C2 (Minor, optional):** port POS dialog from raw useState +
  manual `validate()` → react-hook-form + reuse `vehicleSchema`
  (~80 lines net diff in one file). Aligns POS with the prevailing
  RHF + Zod pattern. Pure refactor; no behavior change. Could be
  ride-along on a future POS session.
- **C3 (Minor, operator decision):** extend the classifier to the
  customer portal so customers with Ferraris get the same exotic-
  routing as customers in the booking wizard. ~50 lines in
  `account/vehicle-form-dialog.tsx`. **Open Q3 in the prior audit
  asked about portal-side classifier — this is the same question.**

**Reframe F5.** In the next CHANGELOG roll, change F5's wording from
"Minor cleanup — two patterns" to: "Informational — four
context-driven patterns; classifier is structurally required for
public booking (exotic/classic detection has no manual customer
path), and POS / portal / admin legitimately don't need it. Two
small optional alignments (C2 RHF port; C3 portal classifier opt-in)
available but neither is blocking. No blanket unification recommended
— Gamma's 9 configuration axes are over-engineering."

This freeze prevents the next 3 audits from re-flagging F5 as a
defect to fix.

---

## TARGET 7 — Documenting "no unification is the right answer"

The four patterns reflect four different contexts:

| Surface | Trust model | Auth | size_class breadth | Auto-classifier need |
|---------|-------------|------|---------------------|----------------------|
| **W (public booking)** | Customer entering own vehicle; system must detect exotic/classic for routing | session cookie or anonymous | 3 (CUSTOMER_SELF_SERVICE_SIZE_CLASSES) | YES — exotic/classic detection is structurally required |
| **P (POS)** | Operator entering customer's vehicle on a ticket | HMAC | 5 (VEHICLE_SIZE_CLASS_KEYS) | NO — operator knows |
| **C (customer portal)** | Customer managing own vehicles | customer session + RLS | 3 (CUSTOMER_SELF_SERVICE_SIZE_CLASSES) | NO today; YES under Q3 (could opt-in for exotic auto-routing) |
| **A (admin Customers)** | Admin staff editing any customer's vehicles | admin service-role | 5 (VEHICLE_SIZE_CLASS_KEYS) | NO — admin knows |

These are not arbitrary architectural choices. The combination of
trust model + size breadth + auto-classifier need is
context-determined. Two surfaces (W, C) have the customer-trust
boundary; two (P, A) have the operator-trust boundary. The
auto-classifier exists where the customer needs to declare a vehicle
and the system needs to detect properties the customer can't be
trusted to set (exotic/classic, anti-gaming) — that's only W today,
potentially C tomorrow.

Future audits should refer back to this section instead of re-deriving
the question.

---

## TARGET 8 — Sibling findings surfaced during inventory

| # | Finding | Surface | Severity |
|---|---------|---------|----------|
| **S1** | `vehicleSchema` declares `vin`, `license_plate`, `notes` (`validation.ts:80-82`) but **no surface captures these fields**. Schema-vs-form drift. | All 4 forms | Minor (dead schema fields) |
| **S2** | `is_incomplete` field is written only by admin (`admin/customers/[id]/page.tsx:509`). Other surfaces never write it, leaving it default-false on records they create. Whether incomplete-records-from-booking should also flag `is_incomplete` is an operator question. | W, P, C don't write; A does | Minor (operator decision) |
| **S3** | Admin form's category/size pickers use 3-column compact grids and a single dropdown for size; POS dialog uses identical grids. The two could trivially share their JSX. Net saving ~50-80 lines across the two surfaces. | P, A | Minor (DRY opportunity within the internal-surfaces group) |
| **S4** | Customer portal does not allow customer to set their vehicle as exotic/classic by design, but ALSO does not run the classifier — so a customer with a Ferrari has NO path to flag themselves correctly via the portal. They could ONLY be auto-flagged via a booking flow. **Operator decision** — same as C3 in T6 + Q3 in the prior audit. | C | Minor / Operator-decision |
| **S5** | All four forms call `titleCaseField()` on model + color at save time. Centralization is fine; this is reuse working. ✅ Not a finding, an observation. | All 4 | n/a |
| **S6** | `VehicleMakeCombobox` is genuinely shared (1 file, 4 consumers). ✅ Not a finding, an observation that the shared-primitive pattern is workable for narrow widgets even with surface-specific orchestration. | shared | n/a (counter-evidence to Gamma) |
| **S7** | Public booking step's hardcoded `category === 'automobile' ? 'e.g., Camry' : 'e.g., Sportster'` (`step-vehicle.tsx:401`) doesn't use the canonical `MODEL_PLACEHOLDERS` map. ~1-line fix. | W | Minor |
| **S8** | Public booking step uses "Vehicle Size" / "Size / Type" generic labels instead of category-adaptive `TIER_DROPDOWN_LABELS`. ~5-line fix. | W | Minor |
| **S9** | The `dual-category make with no model` console.warn (`vehicle-categories.ts:303`) is the trigger telemetry for F1. A dev could grep production logs for "Dual-category make with no model" and see how often this fires. **Useful diagnostic for the F1 hotfix's effectiveness post-ship.** | n/a | Informational |
| **S10** | POS dialog and admin form both write `vehicle_type` derived from category (`isSpecialty ? category : 'standard'`) — same line in both. Booking + portal also write the same derivation. This is a SCHEMA-design concern (`vehicle_type` is redundant with `vehicle_category`; both schemas write the same value, derived the same way). T1.1 of the vehicle taxonomy audit already flagged this — see Q9 of that audit. | All 4 | Informational (carry-over) |

---

## Open operator questions

| # | Question | Topic |
|---|----------|-------|
| **Q1** | Approve the **NO-UNIFICATION verdict**, reframing F5 as "informational, intentional" (T6 + T7)? | Architectural verdict |
| **Q2** | Approve **C1** (F1 hotfix, ~5 lines) as a standalone ship-soon session, parallel-safe with the prior arc? | Hotfix scope |
| **Q3** | Approve **C2** (POS dialog port from raw useState → react-hook-form + `vehicleSchema`, ~80-line refactor, no behavior change) as a low-priority ride-along? | Optional cleanup |
| **Q4** | Approve **C3** (extend classifier to customer portal so Ferrari customers auto-route to exotic/callback flow), OR leave the portal classifier-free? | Optional feature opportunity |
| **Q5** | Disposition for **S1** (unused vin/license_plate/notes schema fields) — drop from schema OR add to one or more forms? | Schema/form alignment |
| **Q6** | Disposition for **S2** (`is_incomplete` not written by W/P/C) — backfill consistency or leave admin-only? | Field semantics |
| **Q7** | Should the F4 dev-warn (resolver silent-default) ship now as part of the F1 hotfix session, or wait? Touches `vehicle-categories.ts` so it could ride along cheaply. | Diagnostic shipping |

---

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ File:line citations throughout.
- ✅ Memory #11 — every claim about the 4 surfaces' behavior is
  grounded in the actual code (each component read end-to-end; no
  inference of behavior from comments or prior audits).
- ✅ Memory #19 — Gamma rejected as over-engineering, not romanticized.
- ✅ Memory #13 — the recommendation is the evidence-based path, not
  the lazy "leave it alone." Three discrete actionable improvements
  (C1, C2, C3) are surfaced. F5 is reframed, not just dismissed.
- ✅ Audit MAPS feasibility + recommends; no fix code drafted.
- ✅ Worktree isolation off `origin/main` (`d5ea9e65`).
