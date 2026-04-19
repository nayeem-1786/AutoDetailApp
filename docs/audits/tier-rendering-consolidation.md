# Tier Rendering Consolidation — Audit

> Read-only audit. No code changes produced. Intelligence only.
>
> Context: Session 29 follow-up #2 exposed that `size_class` tier logic is duplicated across multiple POS and admin files. Owner wants a consolidation refactor before the next feature (vehicle-change reprice).

---

## Pre-work: existing infrastructure in `src/lib/utils/constants.ts`

The constants file already contains two relevant size-class exports — **any consolidation must align with or extend these, not create a third parallel constant**.

| Export | Line | Shape | Values |
|---|---|---|---|
| `VEHICLE_SIZE_LABELS` | 33–39 | `Record<string, string>` — size_class key → human label | sedan, truck_suv_2row, suv_3row_van, exotic, classic |
| `VEHICLE_TYPE_SIZE_CLASSES` | 141–148 | `Record<string, string[]>` — vehicle_type → valid size_class array | `standard: ['sedan', 'truck_suv_2row', 'suv_3row_van', 'exotic', 'classic']`; other types `[]` |

Observations:

- The 5-value array exists **only inside** `VEHICLE_TYPE_SIZE_CLASSES.standard`. There is **no standalone named export** of the 5-value array.
- `VEHICLE_SIZE_LABELS` keys are the authoritative label source. `service-detail-dialog.tsx:11`, `service-pricing-picker.tsx:18`, and `vehicle-create-dialog.tsx:19` already import from this file — the import pattern is established.
- The canonical type alias lives at `src/lib/supabase/types.ts:6`: `export type VehicleSizeClass = 'sedan' | 'truck_suv_2row' | 'suv_3row_van' | 'exotic' | 'classic'`.

**Consolidation must either** (a) add a new named array export (e.g., `VEHICLE_SIZE_CLASS_KEYS`) whose contents are derived from `Object.keys(VEHICLE_SIZE_LABELS)` or `VEHICLE_TYPE_SIZE_CLASSES.standard`, or (b) export the 5-value array as a new top-level constant and rewrite `VEHICLE_TYPE_SIZE_CLASSES.standard` to reference it. Any new constant should not duplicate the set again.

---

## Section 1 — Exact scope of duplication

Grep results confirmed the prompt's 7 files and revealed **4 additional files** with hardcoded 5-value arrays not enumerated in the prompt. The full inventory follows.

### 1A. Files listed in the prompt

| # | File | Hardcoded constants | Scope | Render tier buttons? |
|---|---|---|---|---|
| 1 | `src/app/pos/components/service-detail-dialog.tsx` | **Two**: `VEHICLE_SIZE_CLASSES` (line 70, Set, inside component body); inline `['sedan', ..., 'classic'] as VehicleSizeClass[]` (line 566, `.map()`) | POS | **Yes** (lines 420–484, 65 lines) |
| 2 | `src/app/pos/components/service-pricing-picker.tsx` | **Two**: `VEHICLE_SIZES` (line 47, array, component scope); `SIZE_CLASS_TIER_NAMES` (line 202, array, inside `.map()` callback — re-created per tier per render) | POS | **Yes** (lines 213–258, 46 lines; also 149–175 for per-size-option fallback) |
| 3 | `src/app/pos/components/register-tab.tsx` | `VEHICLE_SIZE_CLASSES` (line 20, Set, module scope) | POS | **No** — used only for detection `pricing.every((t) => VEHICLE_SIZE_CLASSES.has(t.tier_name))` (line 138). Opens `ServicePricingPicker` for multi-tier cases. |
| 4 | `src/app/pos/components/catalog-browser.tsx` | `VEHICLE_SIZE_CLASSES` (line 23, Set, module scope) | POS | **No** — detection only (line 400 + duplicate use at line 471 in `handleTapServiceDirectUnchecked`). Opens picker or detail dialog. |
| 5 | `src/app/pos/components/pos-workspace.tsx` | `VEHICLE_SIZE_CLASSES_SET` (line 48, Set, **inside component body** — re-created every render) | POS | **No** — detection for pending-service vehicle event (line 81). Opens picker. |
| 6 | `src/app/pos/components/vehicle-create-dialog.tsx` | `AUTOMOBILE_SIZE_CLASSES` (line 33, array, module scope) | POS (vehicle form) | **No tier buttons** — iterates to render `<Select>` `<option>` list for size_class input (line 338). |
| 7 | `src/app/admin/catalog/services/[id]/page.tsx` | **Two**: inline object literal `{ sedan: '', truck_suv_2row: '', suv_3row_van: '', exotic: '', classic: '' }` (line 287); `VEHICLE_SIZE_TIER_KEYS` array of `{key, label}` (line 1984, module scope) | Admin | **No tier buttons** — iterates to render standard+sale pricing table rows (lines 2034, 2092). Used in form submission loop (line 370). |

### 1B. Additional files found (not in prompt scope)

Grep `['sedan', 'truck_suv_2row'` across `src/` surfaced these uses of the **5-value** size_class set:

| File | Line | Variable / form | Purpose |
|---|---|---|---|
| `src/components/service-pricing-form.tsx` | 116 | `const sizeKeys: (keyof VehicleSizePricing)[] = ['sedan', ..., 'classic']` | Shared admin pricing form used by service/addon pages. Iterates for input rows. |
| `src/app/admin/customers/[id]/page.tsx` | 324 | `const AUTOMOBILE_SIZE_CLASSES = ['sedan', ..., 'classic'] as const` | Admin customer vehicle edit dropdown — duplicate of `vehicle-create-dialog.tsx:33`. |
| `src/lib/utils/validation.ts` | 70 | `size_class: z.enum(['sedan', ..., 'classic'], ...)` | Zod schema (5-value, POS/admin side) |
| `src/lib/utils/validation.ts` | 482 | `vehicle_size_class: z.enum(['sedan', ..., 'classic']).optional().nullable()` | Zod schema on a second entity (transaction-item-level) |

### 1C. Deliberately-separate 3-value sites (customer context)

Documented in Section 3.

### 1D. Legacy / auto-generated — out of refactor scope

| File | Line | Reason to exclude |
|---|---|---|
| `src/lib/supabase/database.types.ts` | 2326, 2536 | Auto-generated by Supabase CLI. Regenerated from DB enum — touching it is pointless. |
| `src/lib/migration/phone-utils.ts` | 78 | One-shot migration utility (3-value). Legacy. |
| `src/lib/migration/types.ts` | 216 | Migration types (3-value). Legacy. |
| `src/app/api/migration/vehicles/route.ts` | 7 | Migration API (3-value). Legacy. |
| `src/app/api/webhooks/twilio/inbound/route.ts` | 120 | AI-chat vehicle mapping: output type `'sedan' \| 'truck_suv_2row' \| 'suv_3row_van'`. Customer-side 3-value is **intentional** — AI can't infer exotic/classic. |

### 1E. Tier-logic responsibility matrix

Legend: ✅ present · ➖ absent · ⚫ uses downstream component

| File | Hardcoded const | Detection (.every/.has) | Tier-disable logic | Tier-highlight logic | Sale-price resolution | Specialty-tier match |
|---|---|---|---|---|---|---|
| service-detail-dialog | ✅ (×2) | ✅ L71–72 | ✅ L418 (autoMatchIdx-based) | ✅ L415–416 (selected + vehicle-aware) | ✅ L414, 119–120 (`getTierSaleInfo`/`resolveServicePriceWithSale`) | ✅ L79–81 |
| service-pricing-picker | ✅ (×2) | ➖ | ✅ L202–210 (SIZE_CLASS_TIER_NAMES gate) | ✅ L196–197 (vehicle-aware OR specialty match) | ✅ L147, 184 (`getTierSaleInfo`) | ✅ L191–194 |
| register-tab | ✅ | ✅ L138 | ➖ | ➖ | ⚫ via `resolveServicePriceWithSale` in toast helper (L23–27) | ➖ (passes through) |
| catalog-browser | ✅ | ✅ L400, 471 | ➖ | ➖ | ⚫ same helper (L26–30) | ➖ (passes through) |
| pos-workspace | ✅ | ✅ L81 | ➖ | ➖ | ➖ | ➖ |
| vehicle-create-dialog | ✅ | ➖ | ➖ | ➖ | ➖ | ⚫ uses `SPECIALTY_TIERS` from `vehicle-categories.ts` for non-automobile categories |
| admin services [id]/page | ✅ (×2) | ➖ | ➖ | ➖ | ✅ (admin sale-price editing — orthogonal to POS render) | ➖ |
| service-pricing-form | ✅ | ➖ | ➖ | ➖ | ⚫ (admin-side pricing input) | ➖ |
| admin customers [id]/page | ✅ | ➖ | ➖ | ➖ | ➖ | ⚫ uses `SPECIALTY_TIERS` |
| validation.ts L70, 482 | ✅ (Zod) | ➖ | ➖ | ➖ | ➖ | ➖ |

**Summary of duplication scope:**

- Hardcoded 5-value size_class arrays: **11 distinct sites** across **9 files** (prompt listed 7 files / ~9 sites; audit found 2 additional files and missed the second instances inside `service-pricing-picker` and `admin services [id]/page` at initial scan).
- Detection-only duplication (`.every((t) => SET.has(...))`): 4 POS files (register-tab, catalog-browser, pos-workspace, service-detail-dialog).
- Tier-disable logic: **2 files** only (`service-detail-dialog`, `service-pricing-picker`).
- Tier-highlight logic: **2 files** only (same two).
- Specialty-tier matching: **2 files** only (same two).

---

## Section 2 — Inner tier-button rendering comparison

Compared the single-tier `<button>` JSX block in both dialog components.

### 2A. Location and size

| File | JSX block | Lines | Body length |
|---|---|---|---|
| `service-detail-dialog.tsx` | `tiers.map((tier, idx) => { ... return <button>...</button> })` | 420–484 | 63 lines (button `<button>` through `</button>`) |
| `service-pricing-picker.tsx` | `.map((tier) => { ... return <button>...</button> })` — main vehicle-set branch | 213–258 | 46 lines |
| `service-pricing-picker.tsx` | "needs size selection" sub-branch (no vehicle, `.is_vehicle_size_aware`) | 149–175 | 27 lines |

### 2B. className chain comparison

**Container baseline (identical):**
```
'flex items-center justify-between rounded-lg border p-4 text-left transition-all'
```
Both files open with this literal — **100% character-identical**.

**Picker-only additions** (not in dialog):
- `'min-h-[56px]'` (iPad touch-target minimum)
- `!isDisabled && 'active:scale-[0.99] active:bg-gray-50 dark:active:bg-gray-800'` (press feedback)

**Disabled state className:**
- Dialog L428: `cursor-not-allowed border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 opacity-50`
- Picker L223: `border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/10 opacity-50 cursor-not-allowed`
- **Materially different bg tokens** (dialog: `bg-gray-50 dark:bg-gray-800`; picker: `bg-gray-50/30 dark:bg-gray-900/10`). Visual result is similar but not pixel-identical.

**Selected vs. highlighted state className:**
- Dialog L430 (isSelected — radio-select semantics): `border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500 dark:ring-blue-400`
- Picker L225 (isHighlighted — "this is the matching tier" hint semantics): `border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700`
- **Fundamentally different intent + tokens.** Dialog uses `border-blue-500` + ring for "chosen"; picker uses softer `border-blue-200` + hover shift for "suggested match."

**Default state className (identical):**
```
'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm dark:hover:shadow-gray-950/30'
```
Both files use this literal verbatim.

### 2C. Inner contents

| Element | Dialog | Picker | Overlap |
|---|---|---|---|
| Radio-circle indicator (h-5 w-5 rounded-full border-2 + inner dot on selected) | ✅ lines 435–446 (12 lines) | ➖ | Dialog-only |
| Label: tier name | `{tier.tier_label \|\| VEHICLE_SIZE_LABELS[tier.tier_name] \|\| tier.tier_name}` (3-way fallback) | `{tier.tier_label \|\| tier.tier_name}` (2-way) | Structurally similar, different fallback behavior |
| Size label sub-text | `{VEHICLE_SIZE_LABELS[vehicleSizeClass]}` only when `isVehicleAware && !isDisabled` (blue text) | `{sizeLabel}` — same value, slightly different condition (`vehicleSizeClass && tier.is_vehicle_size_aware`) | Similar |
| "Matched to vehicle" specialty indicator | ➖ (footnote outside button L487–493) | ✅ inline L238–242 | Picker-only |
| Inline "Sale" pill | ✅ L459–463 (red badge near label) | ➖ | Dialog-only |
| Sale-info price display (strikethrough + red currentPrice) | ✅ L466–474 (9 lines) | ✅ L244–252 (9 lines) | **Near-identical** — same JSX structure, identical class tokens, only variable refs differ |
| Non-sale price display | ✅ L476–482 (conditional text-color for disabled) | ✅ L253–257 (simple span) | Similar, dialog has extra disabled-state conditional styling |

### 2D. Click handler structure

| | Dialog L423 | Picker L215 |
|---|---|---|
| Pattern | `onClick={() => { if (!isDisabled) setSelectedTierIdx(idx); }}` | `onClick={isDisabled ? undefined : () => handleSelect(tier)}` |
| Semantics | **Radio-select** — sets internal state; commit happens later via Add button | **Click-commit** — immediately calls `handleSelect` which calls parent `onSelect` and closes dialog |
| Side effects | State update only | State update + parent callback + (optional) qty picker transition + dialog close |

These are **structurally different state machines**, not interchangeable with a prop flip.

### 2E. Quantitative overlap estimate

Classifying the 63 lines of the dialog button JSX block (421–483) against the 46 lines of the picker button JSX block (213–258):

| Category | Lines | % of dialog block | Notes |
|---|---|---|---|
| Character-identical or near-identical (only variable refs differ) | ~15 | **~24%** | Container baseline className, default-state className, sale-info price block JSX structure |
| Structurally similar but materially different | ~25 | **~40%** | Disabled/highlighted/selected className bodies use different tokens; label resolution is a 3-way vs 2-way fallback; size-label condition differs |
| Totally distinct (present in one file, absent in other) | ~23 | **~36%** | Radio-circle indicator (dialog-only, 12 lines); inline "Sale" pill (dialog-only, 5 lines); inline "Matched to vehicle" text (picker-only, 5 lines); disabled-state onClick branches |

**Overlap verdict: ~24% character-identical, ~40% similar-but-different, ~36% distinct. Shallow structural overlap.**

The two buttons share the same **rectangular-border-with-price-on-right** visual skeleton and an identical sale-price subcomponent, but everything between those bookends differs: radio semantics, state-machine, inner indicators, disabled tokens.

---

## Section 3 — Customer-facing 3-value lists (intentional restriction)

| Site | Classification | Justification |
|---|---|---|
| `src/components/account/vehicle-form-dialog.tsx:33` (`AUTOMOBILE_SIZE_CLASSES`) | **(a) UI restriction** | Customer portal vehicle-add/edit form. Iterates to render `<Select>` options so customers can only self-identify as sedan / truck_suv_2row / suv_3row_van. Staff must reclassify as exotic/classic via POS/admin. |
| `src/components/booking/step-service-select.tsx:975` (inline `.map`) | **(a) UI restriction** | Booking flow size-picker tile UI. Same intent — customer UX doesn't expose exotic/classic because those require quote handoff. |
| `src/app/api/book/route.ts:402` (`validSizeClasses`) | **(b) Server-side validation** | Runs after booking payment completion. Filters incoming `data.vehicle.size_class` before writing to `transaction_items`. Defensive — ensures a tampered payload can't inject 'exotic' through the public booking API. |
| `src/lib/utils/validation.ts:322` (`bookingVehicleSchema`) | **(c) Zod schema for booking entrypoint** | Schema applied at `/api/book/route.ts` entry. Rejects payloads where size_class ∉ 3-value set. Effectively the server-side counterpart to the customer UI restriction. |
| `src/lib/utils/validation.ts:400` (`customerVehicleSchema`) | **(c) Zod schema for customer portal vehicle save** | Schema for customer vehicle management endpoints. Same rationale as line 322 — customer-context type cannot include exotic/classic. |

Also worth flagging (Section 1D): `src/app/api/webhooks/twilio/inbound/route.ts:120` — AI-chat vehicle size mapping output type. Return type `'sedan' | 'truck_suv_2row' | 'suv_3row_van'` is intentional because AI cannot infer exotic/classic from a text conversation; those must be manually reclassified by staff.

**Consolidation implication:** The customer-context 3-value set is a **deliberate UX/trust boundary**, not accidental duplication. These 5 sites should import a **separate** constant (e.g., `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`) — or the full 5-value set intersected with a static filter. They must **not** collapse into the POS-side 5-value set.

---

## Section 4 — Consolidation strategy options

**Test coverage prerequisite:** Both POS tier dialogs already have dedicated vitest suites that specifically cover tier-disable logic. Total existing coverage:

- `src/app/pos/components/__tests__/service-detail-dialog.test.tsx` — 163 lines, 5 tests covering tier-disable for sedan/exotic/classic/no-vehicle/scope-custom-names.
- `src/app/pos/components/__tests__/service-pricing-picker.test.tsx` — 163 lines, 6 tests covering the same plus a 3-tier legacy-row case.
- `src/app/pos/utils/__tests__/pricing.test.ts` (resolver logic).
- `src/lib/utils/__tests__/vehicle-categories.test.ts`.

These tests protect the consolidation from silent behavioral regressions.

### Strategy A — Shared constant only

**What changes:**

1. Add a new named export to `src/lib/utils/constants.ts`:
   ```ts
   export const VEHICLE_SIZE_CLASS_KEYS: readonly VehicleSizeClass[] =
     ['sedan', 'truck_suv_2row', 'suv_3row_van', 'exotic', 'classic'] as const;
   ```
   Optionally refactor `VEHICLE_TYPE_SIZE_CLASSES.standard` to reference this array.
2. Replace the hardcoded arrays in **11 sites across 9 files** (POS + admin + validation) with an import.
3. Customer-facing 3-value sites: add a parallel `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` export (or derive `VEHICLE_SIZE_CLASS_KEYS.filter(k => k !== 'exotic' && k !== 'classic')`) and use across the 5 customer-context sites.
4. Leave disable/highlight/render logic unchanged in service-detail-dialog and service-pricing-picker.

**What stays:** All rendering logic. All state-machine logic. All the actual bug we experienced tonight — which was a size_class enumeration mismatch — is the bug class Strategy A prevents.

**Effort:** 1–2 hours. Mechanical find-and-replace + import additions + run existing tests.

**Risk:** Low. Each replacement is a 1-to-1 token swap. Zod schemas change from literal string-union to named-array-backed enum (requires a small `z.enum(...VEHICLE_SIZE_CLASS_KEYS)` spread — trivial). Existing tests continue to protect behavior.

**Test coverage gap:** None required. Existing tests cover the downstream behavior; if the constant is wrong, all 11 existing tier tests would fail.

**Honest benefit assessment:** Strategy A **directly addresses** tonight's bug class. Session 28 and Session 29 follow-ups #1 and #2 were all caused by *one* file's hardcoded array drifting out of sync with the 5-value taxonomy when exotic/classic were added. A single source of truth eliminates that entire class of bug permanently. This is **not** cosmetic — it's the single highest-leverage fix available. Labeling it "minimum risk, minimum benefit" would understate its value.

### Strategy B — Shared hook

**What changes:** Strategy A + extract `useTierButtonState(tier, vehicleSizeClass, vehicleSpecialtyTier, isOnSale, autoMatchIdx?, idx?)` returning:
```ts
{
  isSizeClassTier: boolean;    // tier.tier_name ∈ VEHICLE_SIZE_CLASS_KEYS
  isMatchingVehicleSize: boolean;
  isSpecialtyMatch: boolean;
  isDisabled: boolean;
  isHighlighted: boolean;
  saleInfo: TierSaleInfo | null;
}
```
Both `service-detail-dialog` and `service-pricing-picker` call the hook in their `.map` callbacks and consume the derived booleans.

`register-tab` / `catalog-browser` / `pos-workspace` — **verified: none render tier buttons.** They only use the 5-value set for set-membership detection (`.every((t) => SET.has(t.tier_name))`). Strategy B doesn't affect them; they benefit only from Strategy A's shared constant.

**What stays:** Button JSX (className chains, inner contents) remains duplicated between the two dialogs. Click handlers stay distinct (radio-select vs click-commit).

**Effort:** 3–5 hours. Hook design + implementation + refactor of two dialogs + re-run tests + likely 2–3 new hook-level tests.

**Risk:** Medium. Dialog's `isDisabled = autoMatchIdx >= 0 && idx !== autoMatchIdx` is subtly different from picker's `isDisabled = vehicleSizeClass != null && isSizeClassTier && !isMatchingVehicleSize && !isSpecialtyMatch`. The hook must express both, which means passing enough context that the hook ends up having conditional branches based on caller — an anti-signal. Existing tests catch regressions if the hook is wired correctly.

**Test coverage gap:** 2–3 new tests at the hook level (pure-function state derivation). Existing integration tests continue to assert end-to-end behavior.

**Honest benefit assessment:** Strategy B deduplicates the **logic** for computing tier row state but leaves the **JSX** duplicated. Given Section 2's finding that the JSX is only ~24% character-identical and the two components use fundamentally different state machines (radio-select vs click-commit), pulling state logic into a shared hook makes sense only if the state-derivation rules are themselves drifting. They currently aren't — the two disable expressions are equivalent under the invariant `autoMatchIdx = tiers.findIndex(t => t.tier_name === vehicleSizeClass)`. So Strategy B optimizes a non-problem.

### Strategy C — Shared component

**What changes:** Strategy A + B + extract a `<TierButton />` component that encapsulates the button JSX. Props would need:

```ts
interface TierButtonProps {
  tier: ServicePricing;
  vehicleSizeClass: VehicleSizeClass | null;
  effectivePrice: number;
  saleInfo: TierSaleInfo | null;
  isDisabled: boolean;
  // Variant selectors to preserve the two callers' distinct visuals:
  variant: 'radio-select' | 'click-commit';
  isSelected?: boolean;        // radio-select only
  isHighlighted?: boolean;     // click-commit only
  showRadioIndicator?: boolean;
  showInlineSalePill?: boolean;
  showSpecialtyMatchText?: boolean;
  useDialogDisabledTokens?: boolean;
  labelFallback?: 'dialog' | 'picker';
  onSelect: (() => void);
}
```

**What stays:** Dialog chrome (title, description, quantity picker, combo-price footnote, "Auto-selected based on vehicle size" footnote) remains per-parent.

**Effort:** 6–10 hours. Component design + implementation + refactor of both callers + new `<TierButton />` unit tests + re-run integration tests + visual verification in POS on device. The interface-design phase alone is non-trivial because the component is absorbing ~7 conditional variations.

**Risk:** Medium-high. The variant props list above already exceeds 7 optional flags — a code smell indicating the abstraction is paying for differences that exceed what it unifies. Wrong abstraction → future features have to add more flags, resulting in a "god-component." Existing tests catch behavioral regressions but not architectural erosion.

**Test coverage gap:** 4–6 new `<TierButton />` unit tests (one per variant × disabled/enabled state). Existing dialog tests stay but may need to mock the child component.

**Honest benefit assessment:** Strategy C is justified only when JSX overlap is deep (~70%+) and the variance between callers is narrow. Section 2 shows the opposite: overlap ~24% character-identical, ~36% distinct, and the two callers use **different state machines**. The variant-prop count required to preserve both callers' visuals is a strong signal that unification is premature.

### Strategy D — No-op / defer

**What changes:** Nothing. Leave all duplication as-is.

**What stays:** Everything, including the bug class we just experienced.

**Effort:** 0 hours.

**Risk:** Low short-term; high long-term. Each future taxonomy change (e.g., adding a 6th size_class like "motorcycle_large") requires updating 11 hardcoded sites. Session 29 follow-up #2 is exactly this failure mode.

**Test coverage gap:** None.

**Honest benefit assessment:** Strategy D is the correct answer only if consolidation cost exceeds future maintenance savings. Given the 11-site duplication count and the fact we've already experienced **two consecutive session follow-ups** patching hardcoded arrays (Session 28 gap → commit `a79886ac`, Session 29 gap → commits `6aa6d289` and `79c7f301`), maintenance cost is not hypothetical — it's observed. Strategy D rejects the observed evidence.

---

## Section 5 — Recommendation

### Ranking

| Rank | Strategy | Rationale |
|---|---|---|
| 1 | **A** — shared constant | Directly prevents the observed bug class (11 hardcoded sites → 1 source of truth); 1–2h; low risk; no new tests required; aligns with established `VEHICLE_SIZE_LABELS` import pattern already used in 3 of the POS files. |
| 2 | **A then evaluate B** (see Strategy E below) | Ship A first, then only add a hook if a real-world need appears (e.g., a third dialog renders tier buttons, or the disable logic genuinely diverges). |
| 3 | **B** — shared hook | Medium cost, addresses a bug class we haven't actually seen. Reasonable if a third tier-button dialog is imminent. Weak justification today. |
| 4 | **C** — shared component | Strongly unjustified given Section 2's ~24% character-identical overlap. The required variant-prop surface is a code smell. Would likely be regretted. |
| 5 | **D** — no-op | Rejected by observed bug history (Sessions 28 and 29). |

### Evidence supporting the ranking

- **Bug class mapping:** Tonight's bugs (Session 29 follow-up #2 — `79c7f301`, `6aa6d289`) + Session 28 (`a79886ac`) were all "a hardcoded size_class array was missed when exotic/classic were added to the taxonomy." Strategy A **eliminates the possibility** of this bug. Strategies B and C do not eliminate it any further once A is shipped.
- **Overlap percentage:** Section 2 measured ~24% character-identical lines between the two dialog tier buttons. The 70%+ threshold that would justify Strategy C is not met.
- **State-machine divergence:** Radio-select (dialog) vs click-commit (picker) are different UI patterns. Strategy C would force prop-flag-driven behavior variation in a single component — a well-known anti-pattern.
- **Consumer count for hooks:** Only 2 files (`service-detail-dialog`, `service-pricing-picker`) have tier-disable/highlight logic. A shared hook with 2 consumers has barely broken even on the shared-abstraction math; usually 3+ consumers justify a hook.

### Strategy E — Recommended intermediate path

Ship **Strategy A immediately** (1–2 hours; eliminates observed bug class; unblocks vehicle-change reprice work). Then re-evaluate Strategy B/C after shipping 1–2 more features that touch tier rendering. Concrete reassessment triggers:

1. A third tier-button rendering site is introduced (e.g., quote builder tier preview, or a mobile-tier picker variant).
2. The disable-logic expressions in service-detail-dialog and service-pricing-picker diverge behaviorally (not just cosmetically).
3. The `TierSaleInfo` sale-display block, currently near-identical in both files, also appears in a third place.

Any one of those justifies revisiting. Until then, A is sufficient.

### Final answer

**Ship Strategy A. Defer B/C. The data does not justify B or C today.**

---

## Appendix — source references

Line numbers are current as of HEAD `79c7f301` (2026-04-19).

- Taxonomy type: `src/lib/supabase/types.ts:6`
- Existing constants: `src/lib/utils/constants.ts:33` (`VEHICLE_SIZE_LABELS`), `:141` (`VEHICLE_TYPE_SIZE_CLASSES`)
- Prompt-listed POS files: `service-detail-dialog.tsx:70, :566`, `service-pricing-picker.tsx:47, :202`, `register-tab.tsx:20`, `catalog-browser.tsx:23`, `pos-workspace.tsx:48`, `vehicle-create-dialog.tsx:33`, `admin/catalog/services/[id]/page.tsx:287, :1984`
- Audit-discovered additional POS/admin files: `service-pricing-form.tsx:116`, `admin/customers/[id]/page.tsx:324`, `validation.ts:70, :482`
- Customer-facing 3-value sites: `vehicle-form-dialog.tsx:33`, `step-service-select.tsx:975`, `api/book/route.ts:402`, `validation.ts:322, :400`
- Out-of-scope legacy / auto-generated: `database.types.ts:2326,2536`, `migration/phone-utils.ts:78`, `migration/types.ts:216`, `api/migration/vehicles/route.ts:7`, `webhooks/twilio/inbound/route.ts:120`
- Tier-related test suites: `src/app/pos/components/__tests__/service-detail-dialog.test.tsx` (5 tests), `service-pricing-picker.test.tsx` (6 tests), `src/app/pos/utils/__tests__/pricing.test.ts`, `src/lib/utils/__tests__/vehicle-categories.test.ts`
