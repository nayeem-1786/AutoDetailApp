# Step 1 size_class auto-selection + Mustang classic-detection — Targeted Audit (2026-06-02)

> Read-only Targeted audit (Memory #29 type 1). NO source / migration / test changes.
> Branch: `audit/step1-size-class-and-mustang-classic-targeted`
> Worktree: `~/Claude/SmartDetails/wt-targeted` (Memory #8 isolation)
> Base: `7b116a70` (#142 Vehicle Classifier Restoration merge)

## Context

Two operator findings after deploying #142:

1. **Step 1 size_class auto-selects the FIRST option** (Sedan / Up to 24' / etc.) when the classifier returns a result. Operator's LOCKED rule: *"classifier output should NEVER write to size_class UI. Either fires the SpecialtyVehicleBlock short-circuit OR leaves customer to pick."*
2. **Ford Mustang 1965 → Sedan got pre-selected.** Expected: classic detection → SpecialtyVehicleBlock short-circuit.

## TL;DR

- **Finding 1 root cause:** `step-vehicle.tsx:234` — `effectiveSizeClass` formula falls back to `classification?.size_class` when no manual override. This auto-highlights the matching size button via `isSelected = effectiveSizeClass === key` at `:594`. Secondary mechanism at `:219–224` (useEffect that wipes `manualSizeClass` on every classification change) is part of the same auto-fill UX. **Both are LATENT** — they predate #142 by a long way. Pre-#142 they were invisible because RLS-denied classifier never returned useful results for anonymous customers; #142 fixed that, so the latent UI behavior is now visible.
- **Finding 2 root cause:** `step-vehicle.tsx:153` — the call `classifyVehicleClient(mk.trim(), mdl.trim() || undefined)` passes only 2 args. **Year is silently dropped.** Layer 5 (classic) needs year (`vehicle-categories.ts:603–617`); without it, `isClassicVehicle()` returns false. **Also LATENT** — pre-#142 the predecessor call `resolveVehicleClassification(supabase, mk.trim(), mdl.trim() || undefined)` had the same 2-arg shape. Not a #142 regression; #142 just made the rest of the classifier work, surfacing this gap.
- **The two findings are independent but co-surfaced by #142.** Different fix sites (`:234` + `:219–224` vs. `:153`), single coherent fix-session scope.
- **A.4 critical sub-question DOES surface a real architectural tension** — see Target A.4 below. Operator decision needed before fix scope finalizes.
- **Broader regression scan: CLEAN.** No 3rd+ regressions found in #142's diff. Targeted scope holds; no Component Behavior escalation.

---

## Target A — Finding 1 (auto-selection)

### A.1 — `setManualSizeClass` call sites (enumerated)

| Site | File:line | When | Effect |
|------|-----------|------|--------|
| 1 | `step-vehicle.tsx:112–114` | useState init | `null` (or `initialVehicle?.size_class` on edit-from-Step-4 round-trip) |
| 2 | `step-vehicle.tsx:212` | Inside `handleCategoryChange` | `null` — clear on category change |
| 3 | `step-vehicle.tsx:221` | Inside useEffect on `classification` change | `null` — wipe manual when classifier returns (auto-fill UX mechanism #2) |
| 4 | `step-vehicle.tsx:599` | Size button `onClick` | User-picked value |

**No call site directly writes a classifier-derived size_class to `manualSizeClass`.** The state is purely user-input or null.

### A.2 — Where the auto-fill actually happens

The `manualSizeClass` state is clean. The auto-fill is in the **derived value `effectiveSizeClass`** at `:230–234`:

```ts
const classifierSpecialty =
  classification?.size_class === 'exotic' || classification?.size_class === 'classic';
const effectiveSizeClass = classifierSpecialty
  ? classification!.size_class
  : (manualSizeClass ?? classification?.size_class ?? null);  // ← THE BUG
```

The trailing `?? classification?.size_class ?? null` makes the formula fall back to the classifier value for the mundane sizes (sedan / truck_suv_2row / suv_3row_van) when the user hasn't picked manually. That value then drives the `isSelected = effectiveSizeClass === key` button highlight at `:594`. **Result: the matching size button appears pre-selected as soon as the classifier returns.**

**Secondary mechanism**: `:219–224`:

```ts
useEffect(() => {
  if (classification) {
    setManualSizeClass(null);
    setManualSpecialtyTier(null);
  }
}, [classification]);
```

This clears the user's manual pick every time the classifier returns. Combined with `:234`'s fallback, the effect is "classifier overrides user." Both need to change together under the locked rule.

### A.3 — Why this is `#142`-attributed

`vehicle-categories.ts`'s output shape pre-#142 was identical (the field name `size_class` is byte-stable). The `effectiveSizeClass` formula pre-#142 was identical. **The mechanism is years old.**

What `#142` changed: the classifier ACTUALLY RUNS now for anonymous public-booking customers. Pre-#142, anonymous customers hit RLS-denial on `vehicle_makes` (audit `5e3d3388` Finding C1), so `classification` was either never-set (in the hang case) or set to `{ size_class: 'sedan', category_confident: false }` from the silent-default path (in the empty-result case). In the silent-default case the auto-fill DID fire (Sedan got auto-highlighted), but the rest of the form looked enough like "you should pick a size" that operators didn't flag it.

Now that classifier output is real + correct, the auto-fill is visible across all 5 categories and operators noticed.

### A.4 — **CRITICAL SUB-QUESTION: SpecialtyVehicleBlock trigger data path**

The wizard's exotic/classic gate at `booking-wizard.tsx:763`:

```ts
if (vehicle.size_class === 'exotic' || vehicle.size_class === 'classic') {
  setShowSpecialtyBlock(true);
  return;
}
```

`vehicle` is the `VehicleSelection` object passed by `step-vehicle.tsx`'s `buildSelection()` at `:306`, which sets `size_class: effectiveSizeClass`. The `effectiveSizeClass` formula at `:232` returns `classification!.size_class` on the `classifierSpecialty` branch (when classifier returns exotic/classic). **So the data path for the SpecialtyVehicleBlock trigger today is: classifier → `effectiveSizeClass` → `vehicle.size_class` → wizard gate.**

The classifier-derived value is used INTERNALLY to fire the SpecialtyVehicleBlock, but it ALSO surfaces as the auto-selected UI button (under the current shared formula). The locked rule says these two consumers should be split.

**Two architectural options for the fix** (operator must pick):

- **Option (i) — Split data path.** Add an internal-only state `classifierSpecialtyDetected: boolean` derived from `classification?.size_class === 'exotic' || 'classic'`. UI button `isSelected` highlight drops the classifier fallback (becomes `effectiveSizeClass = manualSizeClass`). The wizard's gate at `:763` reads from a separate field on `VehicleSelection` (e.g., `vehicle.classifier_detected_specialty: 'exotic' | 'classic' | null`) that step-vehicle.tsx writes from classifier output regardless of user pick. Customer NEVER sees an auto-highlighted button; SpecialtyVehicleBlock still fires correctly on Continue when classifier detected exotic/classic.

- **Option (ii) — Auto-advance to SpecialtyVehicleBlock without waiting for Continue.** When classifier returns exotic/classic, step-vehicle.tsx fires the SpecialtyVehicleBlock route immediately (via a new prop callback, e.g., `onSpecialtyDetected(size_class)`). The wizard handles this by setting `showSpecialtyBlock = true` immediately. The customer never sees the Step 1 size buttons for an exotic/classic detection — they get bounced to the specialty flow on classifier completion. UI button list for the remaining (mundane) sizes drops the classifier fallback like Option (i).

- **Option (iii) — Refine the locked rule.** Allow the classifier to pre-select size_class buttons but ONLY for exotic/classic (still surfaced via SpecialtyVehicleBlock), never for sedan/truck/SUV. This is the smallest code change but contradicts the "NEVER" wording in the operator's rule statement.

Without an operator decision, the audit can't finalize fix scope for A. Recommended: ask the operator to pick (i) or (ii) before scoping the fix.

### A.5 — Minor observation (out of scope, noted for tracking)

`step-vehicle.tsx:228`'s comment says `"the manual dropdown is limited to 3 values (sedan / truck_suv_2row / suv_3row_van)"`. But at `:593` the buttons iterate over `Object.entries(VEHICLE_SIZE_LABELS)` which includes ALL 5 entries (sedan, truck_suv_2row, suv_3row_van, exotic, classic — `constants.ts:42–48`). The actual UI renders 5 buttons; the comment is wrong (or the implementation drifted). CLAUDE.md Rule 19 also describes a `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` filter that's not actually applied at the UI render site here. Minor — not part of this audit's fix arc, but worth fixing the comment when the operator's locked rule decision lands.

---

## Target B — Finding 2 (Ford Mustang 1965 classic detection)

### B.1 — Ford in CLASSIC_ELIGIBLE_MAKES?

**YES.** `vehicle-categories.ts:521–523`:

```ts
ford: ['mustang', 'bronco', 'f-100', 'f100', 'thunderbird', 'fairlane', 'galaxie',
  'torino', 'falcon', 'gt40', 'shelby', 'cobra', 'ranchero', 'boss', 'mach 1',
  'model t', 'model a', 'pinto'],
```

`'mustang'` is in the list. `isClassicVehicle('Ford', 'Mustang', year)` at `:603–617` returns `true` when year ≤ `CLASSIC_YEAR_THRESHOLD = 2001` (current year 2026 − 25). **1965 ≤ 2001 → passes.**

### B.2 — Layer 5 logic fires correctly when year is supplied

`resolveVehicleClassification` at `:915–919`:

```ts
if (category === 'automobile' && baseResult.size_class !== 'exotic') {
  if (isClassicVehicle(make, model, year)) {
    baseResult.size_class = 'classic';
    baseResult.seat_rows = getSeatRows('classic', 'automobile');
  } else if (!year && mightBeClassicVehicle(make, model)) {
    baseResult.needs_year_confirmation = true;
  }
}
```

With `make='Ford'`, `model='Mustang'`, `year=1965` → returns `size_class='classic'`. **Layer 5 is correct in isolation.**

### B.3 — Year is NOT being passed from step-vehicle.tsx to the wrapper

`step-vehicle.tsx:153`:

```ts
const result = await classifyVehicleClient(mk.trim(), mdl.trim() || undefined);
```

Only 2 args. `classifyVehicleClient(make, model?, year?)` accepts a third (`year`) but the caller never passes it. Same call signature in the `classify()` useCallback at `:145`: `(mk: string, mdl: string, cat: VehicleCategory)` — no year parameter.

The useEffect at `:182–191` that schedules `classify(make, model, category)` also doesn't pass `year`. **Year is dropped at the `classify` signature boundary, never propagates to the wrapper, never reaches Layer 5.**

So for Ford Mustang + 1965 → classifier sees `(Ford, Mustang, undefined)` → Layer 5 takes the `mightBeClassicVehicle` branch (model matches curated list, year unknown) → sets `needs_year_confirmation: true` BUT keeps `size_class: 'sedan'` (Layer 2 default for unmatched MODEL_SIZE_HINTS — Mustang isn't in `MODEL_SIZE_HINTS.sedan` either, so it falls to the `'sedan'` line-785 default). **The Step 1 UI then auto-highlights Sedan (Finding 1 mechanism), and the customer never sees the SpecialtyVehicleBlock.**

### B.4 — Is this a `#142` regression?

**No. Latent — predates #142 by a long way.** Pre-#142 the same caller called `resolveVehicleClassification(supabase, mk.trim(), mdl.trim() || undefined)` with the same 2-arg shape (no year). Year was never being passed to the classifier from step-vehicle.tsx — the classic detection has never worked on Step 1 for vehicles needing year.

Confirmed by reading the sibling caller: `vehicle-form-dialog.tsx:227` (the customer portal vehicle form) DOES pass year via `classifyVehicleClient(mk, mdl, watchedYear ?? undefined)`. The portal classic detection works; Step 1's never has. **Pre-existing inconsistency between the two browser-side classifier surfaces.**

### B.5 — Fix shape

Three small mechanical changes:

1. Extend `classify` useCallback signature at `:145` to accept `yr: number | null` (or `yr?: number`).
2. Forward year in the `classifyVehicleClient` call at `:153`: `classifyVehicleClient(mk.trim(), mdl.trim() || undefined, yr ?? undefined)`.
3. Update the useEffect at `:188` to pass year: `classify(make, model, category, year)`.

The useEffect deps at `:191` already include nothing that would break re-firing on year change — `year` would need to be added to the deps array. **Approx 4 lines changed.**

This is independent of Finding 1's fix scope and can ship in the same session.

---

## Target C — Relationship between Finding 1 and Finding 2

**Both findings are LATENT bugs surfaced by #142's correct fix to anonymous classifier execution.** Neither was introduced by #142.

- Finding 1's auto-fill mechanism was invisible because the classifier never returned useful results for anonymous customers; now it does.
- Finding 2's missing-year was invisible because the classifier silently defaulted for the same reason; now Layer 5 actually runs but receives `undefined` year.

**Root causes are different** (formula at `:234` + useEffect at `:219` vs. missing parameter at `:153`), so the fix sites are different. Both fit in a single fix session.

**Cross-interaction:** under the operator's locked rule, fixing Finding 1 alone (auto-highlight gone) still leaves Finding 2 — Ford Mustang 1965 would no longer get auto-highlighted Sedan, but the SpecialtyVehicleBlock would still NOT fire because the classifier didn't detect classic (year not passed). The customer would have to MANUALLY pick a size, then Continue, and the wizard wouldn't gate them. **Finding 2 must ship with Finding 1**, or operators will see "classic vehicles still aren't bouncing to specialty" after Finding 1 lands.

---

## Target D — Broader regression scan (#142 diff sweep)

Spot-checked for other regressions introduced by #142's wrapper rewiring. Findings:

| Concern | Spot-checked | Verdict |
|---------|--------------|---------|
| Wrapper drops other params (make, model)? | `classify-vehicle-client.ts:97–119` constructs URLSearchParams with `make` (required), `model` (optional), `year` (optional) | Wrapper signature is correct. Caller bug at `:153` is the issue, NOT the wrapper. |
| Endpoint receives year? | `app/api/classify-vehicle/route.ts:80–88` parses `make`, `model`, `year` from query string | Correct. Endpoint is fine. |
| Other state writes in step-vehicle.tsx on classifier return? | Grep for `set` calls inside `classify()` and the classification useEffect | Only `setClassification`, `setCategory` (gated on `category_confident` — correct), and the manual-clear useEffect. No other surprise writes. |
| `vehicle-form-dialog.tsx` (the portal classifier caller) parallel issues? | `:227` passes year correctly. No size_class auto-fill in the dialog (no UI button — the dialog uses a different form structure). | Clean. |
| `classifier_reason` field (S1) — surprise consumer? | Grep confirms it's only emitted server-side in `vehicle-categories.ts` and read client-side in `classify-vehicle-client.ts:127–132` (`console.warn`). No other reads. | Clean. |
| `CLASSIFIER_TIMEOUT_MS` (T9) — interferes with normal flow? | Used only as the AbortController timeout in the wrapper. Real classifier responses are sub-second; no interference. | Clean. |

**No 3rd+ regression class found. Targeted scope holds.** Do NOT escalate to Component Behavior audit.

---

## Recommended fix scope

**Single session, ~30–60 prod lines, ≤3 files. Memory #8 safe.**

The exact prod-line count depends on the operator's A.4 architectural pick:

- **If Option (i) — split data path:** ~50–60 lines. Modify `effectiveSizeClass` formula, remove the classification-clears-manual useEffect, add a new `classifier_detected_specialty` field to `VehicleSelection` interface + populate from classifier output, update wizard's exotic/classic gate at `:763` to read the new field. Adjust the size_class fallback for Step 2's pricing (read `state.vehicleData.size_class` at `:1198` — null is acceptable if user picked nothing, but `isValid()` at `:259` already requires the pick before Continue, so no Step 2 regression).
- **If Option (ii) — auto-advance to SpecialtyVehicleBlock:** ~30–40 lines. Add `onSpecialtyDetected` callback prop to `StepVehicle`, wire it from `booking-wizard.tsx` to set `showSpecialtyBlock = true` immediately, fire from a new useEffect in step-vehicle.tsx watching `classification?.size_class === 'exotic' || 'classic'`. Drop classifier fallback from `effectiveSizeClass` and remove the classification-clears-manual useEffect, same as Option (i).
- **If Option (iii) — refine locked rule:** ~5–10 lines. Just drop the classifier fallback for non-specialty sizes (`effectiveSizeClass = classifierSpecialty ? classification!.size_class : (manualSizeClass ?? null)`). The classification-clears-manual useEffect stays. Smallest change but contradicts "NEVER" wording.

**Finding 2's fix** (year propagation) is ~4 lines regardless of A.4 choice — ships in the same session.

**T9 contract test addition** to lock the new behavior:
- New scenario in `classifier-spinner-lifecycle.test.tsx` (or a new sibling test file) asserting that classifier returning a sedan-tier result does NOT auto-highlight any size button. ~10–15 lines. Anti-regression locker for Finding 1 specifically.
- Existing classifier unit tests in `vehicle-categories.test.ts` should add a Ford-Mustang-1965 case asserting `size_class === 'classic'` when year is passed. ~5 lines. Anti-regression for Finding 2.

**Tests delta:** +3–5 tests. Total: ~2857–2859 (was 2854 after #142).

---

## Operator decisions needed

- **Q-A.4 (gates fix shape):** Option (i) split data path, (ii) auto-advance, or (iii) refine the rule? Each shapes the prod-line count + UX. Without this answer the audit can't recommend a single fix scope.
- **Q-A.5 (minor, can be deferred):** The 5-buttons-rendered vs. CLAUDE.md Rule 19's 3-button claim is a doc/code drift. Worth correcting the comment at `:228` and possibly applying a `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` filter at `:593` when Q-A.4 lands. Not urgent.

---

## Hard-rules verification

- ✅ Read-only — no source/migration/test changes
- ✅ File:line citations for every claim
- ✅ Memory #11 — verified against actual code (every claim sourced from a specific `:line`)
- ✅ Memory #29 Targeted scope respected — no expansion to Component Behavior. Broader-regression scan in T-D explicitly clean.
- ✅ Locked operator rule on auto-selection NOT pre-resolved — A.4 surfaced as architectural sub-question requiring operator decision

## Cross-references

- `docs/dev/VEHICLE_CLASSIFIER_BEHAVIOR_AUDIT.md` (5e3d3388) — yesterday's full classifier audit; T3 health sweep mentioned "Layers 4+5 work" but didn't explicitly test Ford Mustang
- `docs/CHANGELOG.md` Session #142 — the deploy that surfaced these latent bugs
- `docs/dev/SPECIALTY_VEHICLE_BLOCK_TRIGGER_DIAG.md` (88288db0) — prior diagnostic on the SpecialtyVehicleBlock trigger condition
- `CLAUDE.md` Rule 19 (vehicle taxonomy) + Rule 22 (classifier server-side rule from #142)
