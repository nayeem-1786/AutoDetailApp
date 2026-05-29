# POS Prerequisite Enforcement + Add-On Gating Audit (2026-05-28)

> ✅ **Issue 2 (add-on-only gating) + Issue 3 (register-tab no add-time validation) RESOLVED in
> Session #121 (Track A)** — `fix/track-a-useValidatedServiceAdd-shared-helper`. The recommended
> shared checked-add helper shipped as `useValidatedServiceAdd` (`src/app/pos/hooks/use-validated-service-add.tsx`):
> it gates **add-on-only** services added solo (no `primary`/`both` anchor on the order → warn +
> manager-PIN override, `pos.override_prerequisites`) and runs the prerequisite check, and **register-tab
> favorites + its picker now route through it** (closing the zero-validation gap). Sale `catalog-browser`
> was refactored behind the same helper byte-behavior-identically; Quotes (`quote-builder`) gained correct
> per-surface context. Add-on-only rule = warn-and-allow with manager override (operator decision, Open
> question 3). +17 regression tests including per-surface prereq-fire + add-on-solo + override coverage.
> The read-only diagnostic below is preserved as the original finding.

> Read-only diagnostic. No source/migration/test changes. Live read-only SELECTs only.
> Branch: `audit/pos-prereq-enforcement-regression-and-addon-gating`
> Performed in an isolated `git worktree` off `origin/main` (`81c28ee4`, the #114 merge)
> to avoid disturbing the shared checkout.

## Context

Three issues surfaced the morning of 2026-05-28, the same day #114 (POS prerequisite
size-aware pricing, merge `81c28ee4` / fix `5f6c9c07`) deployed:

1. **Tier persistence:** "Paint Correction Prep" created via Admin → Services → Add New may not have persisted its exotic/classic tier prices.
2. **Add-on gating:** "Paint Correction Prep" is classified `addon_only`, yet it can be added as a solo/primary item in POS.
3. **Prerequisite-enforcement regression:** prereq warnings have stopped firing — including (per operator) on a service that warned correctly before today.

This audit root-causes each with file:line + live-DB evidence and decides whether #114 is **fix-forward or revert**. **It is not.** — read on.

## TL;DR

**#114 did not cause any of the three issues.** Its diff is a behavior-preserving refactor of *tier selection* (extracting `selectPricingTierForVehicle()` and routing five duplicated size-tier blocks through it). It did **not** touch prerequisite detection, the add-on gating (which doesn't exist), or the create-service flow. All three issues are **pre-existing gaps** that the operator happened to exercise today by creating and testing a brand-new `addon_only` service ("Paint Correction Prep") that carries `required_same_ticket` prerequisites. The shared deploy timing is coincidental, not causal.

- **Issue 1 (tiers):** *Real create-flow gap.* The Add-New-Service form's `vehicle_size` branch hard-codes exactly **three** tier inserts — sedan / truck_suv_2row / suv_3row_van (`new/page.tsx:231-237`). It has no exotic/classic inputs or inserts for the `vehicle_size` model. The live DB shows Paint Correction Prep with exactly those three tiers and no exotic/classic — i.e. the data persisted exactly what the form is capable of writing. Exotic/classic for a `vehicle_size` service can only be added afterward via the **Edit** page (which does support them). Create/Edit are inconsistent. **Not data corruption, not #114.**
- **Issue 2 (add-on gating):** *Never built (option c).* There is **zero** `classification`/`addon_only` handling anywhere in the POS add paths (`grep` finds it only in test fixtures). No code blocks an `addon_only` service from being added as a solo/primary item — on any screen. **Not a regression; a missing feature.** #114 is unrelated.
- **Issue 3 (prereq enforcement):** *Not a #114 regression.* Every **catalog-browser** add path still funnels through `addServiceChecked → checkPrerequisites` (unchanged by #114), and `ServiceDetailDialog` calls the check too. But **`register-tab.tsx` has zero prerequisite handling in any path** (favorites quick-add *and* its own picker `dispatch ADD_SERVICE` directly) — and that was true **before and after** #114 (the #114 diff added/removed no prereq logic there). Additionally the client **fails open**: `use-prerequisite-check.ts:77-78` and `:109-110` return `{ canAdd: true }` on any non-OK response or exception. **Leading hypothesis:** the operator added/tested Paint Correction Prep via a **register-tab favorite tile** (which checks neither prerequisites nor classification), which simultaneously explains Issues 2 and 3 on a single tap. Needs operator confirmation of the exact repro screen.

**Recommendation: FIX-FORWARD.** #114's pricing fix (Suburban $75→$110) is correct and wanted; a revert reintroduces that bug and fixes none of the three issues (because #114 didn't cause them). The real fixes are independent and surgical (see Target 5).

---

## Target 1 — Issue 3: the prerequisite-enforcement "regression"

### The enforcement architecture

`checkPrerequisites` (`src/app/pos/hooks/use-prerequisite-check.ts:56-114`) POSTs `service_id` + ticket/customer/vehicle context to `POST /api/pos/services/check-prerequisites` and shows the warning dialog when `has_prerequisites && !satisfied`. The detection is entirely **server-side** (`src/app/api/pos/services/check-prerequisites/route.ts`), self-contained, and **does not import `picker-engine`** (the file #114 changed).

In **`catalog-browser.tsx`**, every add path funnels through `addServiceChecked` (line 196, "All add paths funnel through here"), which calls `checkPrerequisites` unless `skipPrereqCheck` (line 211-212):
- `handleTapServiceDirect` quick-add → `quickAdd` (line 394) → `addServiceChecked` ✓
- `handleTapServiceDirectUnchecked` quick-add → its own `quickAdd` (line 497) → `addServiceChecked` ✓
- picker confirm `handlePricingSelect` (line 452) → `addServiceChecked` ✓
- custom-price confirm `handleCustomPriceSelect` (line 480) → `addServiceChecked` ✓
- `ServiceDetailDialog` "Add to Ticket" → `onPrerequisiteCheck` (passed at line 591; called at `service-detail-dialog.tsx:199-200`) ✓

### What #114 actually changed (pre `15c0a78f` → post `5f6c9c07`)

#114 replaced the inline size-tier-selection blocks with a call to the new canonical `selectPricingTierForVehicle()` (`picker-engine.ts:189+`). That function returns a tier for **exactly the same cases** the old inline logic did:
- old: `pricing.length>1 && every tier_name ∈ VEHICLE_SIZE_CLASSES` → `find(tier_name === vsc)`; or single `is_vehicle_size_aware` row.
- new: identical, just centralized (`picker-engine.ts:189-216`).

In both `catalog-browser.tsx` (lines 433-438, 516-521) and `register-tab.tsx` (lines ~142-155) the change is *which expression computes the tier*, then the **same downstream call** (`quickAdd`/`dispatch`). **No add path was re-routed; no prereq check was added or removed.** `git show 5f6c9c07 -- register-tab.tsx | grep prerequisite` → nothing.

### The decisive finding

- **catalog-browser + ServiceDetailDialog: prereq check fires, unchanged by #114.** Tapping Paint Correction Prep here (it has `required_same_ticket` prereqs and no prereq on the ticket) **would** raise the warning.
- **`register-tab.tsx`: ZERO prerequisite handling, in any path.** `grep -niE "prerequisite|checkPrereq|addServiceChecked" register-tab.tsx` → nothing. Favorites quick-add (`handleTapFavorite`, dispatches at lines 115/140/153) and the register-tab picker `onSelect` (line 199) call `dispatch({ type: 'ADD_SERVICE' })` **directly**, bypassing any prereq check. This was true **before and after** #114.
- **Client fails open** (`use-prerequisite-check.ts:77-78`, `:109-110`): any endpoint error/exception → `{ canAdd: true }`, silently allowing the add with no warning.

**Conclusion:** the prerequisite check is *not* bypassed by #114. The enforcement gap is one (or both) of: (a) the operator added Paint Correction Prep via a **register-tab favorite tile**, which never enforced prereqs (pre-existing); (b) the detection endpoint is erroring in production and the client fails open (also independent of #114). If #114 were reverted, this behavior would be identical. **#114 is exonerated as the cause of Issue 3.**

*Open item:* confirm the exact repro screen with the operator (catalog search-tap vs register favorite tile vs service-detail dialog). If a service that previously warned via **catalog-browser** now doesn't, that indicates endpoint fail-open and warrants a live endpoint check — not a #114 revert.

## Target 2 — Issue 2: add-on-only gating

**Finding: (c) never built.** `grep -rnE "addon_only|classification" src/app/pos` returns matches **only in test fixtures** (`*.test.ts(x)`), never in runtime add-path code. None of `catalog-browser.tsx`, `register-tab.tsx`, `service-detail-dialog.tsx`, `use-prerequisite-check.ts`, or the reducers read `classification` to block adding an `addon_only` service as a solo/primary item. The classification (`services.classification` enum: `primary | addon_only | both`, DB-confirmed) is a **label with no POS enforcement**. #114 did not touch this. This is a missing feature, not a regression — and it explains why Paint Correction Prep (`addon_only`, DB-confirmed) can be added solo on any screen.

## Target 3 — Issue 1: create-service tier persistence

**Live DB (`zwvahzymzardmxixyfim`), Paint Correction Prep (`e5b8a39d-…`):** `pricing_model = vehicle_size`, `classification = addon_only`, and exactly **three** `service_pricing` rows:

| tier_name | price | is_vehicle_size_aware | display_order |
|---|---|---|---|
| sedan | 160.00 | false | 0 |
| truck_suv_2row | 190.00 | false | 1 |
| suv_3row_van | 220.00 | false | 2 |

**No exotic, no classic row.** `service_prerequisites` confirms two `required_same_ticket` prereqs: Express Exterior Wash **or** Signature Complete Detail.

**Create-flow trace** (`src/app/admin/catalog/services/new/page.tsx:231-237`): the `pricing_model === 'vehicle_size'` branch inserts a **hard-coded three-element array** — sedan, truck_suv_2row, suv_3row_van — and nothing else. Exotic/classic columns are only written by the **`scope`** model branch (lines 251-255, via `is_vehicle_size_aware` rows). So a `vehicle_size` service created through Add New **cannot** persist exotic/classic tiers; the form doesn't collect them.

**Verdict:** not data loss and not #114 — the create form is **incapable** of writing exotic/classic for the `vehicle_size` model. The data reflects exactly what the form wrote. Exotic/classic must currently be added post-create via the **Edit** page (`[id]/page.tsx`, which does support add/remove of exotic/classic for `vehicle_size`, per the prior Catalog CRUD audit). This is a real **create/edit inconsistency** worth closing, independent of #114.

## Target 4 — Are Issues 2 and 3 the same root cause?

**Partly.** Issues 2 and 3 share a **proximate** cause *if* the repro was a register-tab favorite tile: `register-tab`'s direct-`dispatch` add path performs **no add-time validation at all** — neither a prerequisite check nor a classification gate. One tap on a favorite tile would therefore exhibit **both** failures simultaneously, which is the most economical explanation for the operator seeing them together.

They diverge in scope, though:
- **Issue 2** is broader: add-on gating is missing on **every** screen (catalog-browser also lets you add `addon_only` solo), so it manifests regardless of path.
- **Issue 3** is path-dependent: catalog-browser/ServiceDetailDialog **do** enforce; only register-tab (and fail-open) don't.

**Issue 1 is independent** (admin create-flow, unrelated to either).

A single well-placed fix — routing register-tab's adds through the same checked add-helper that catalog-browser uses, extended with a classification gate — would close the register-tab manifestation of **both** Issues 2 and 3 at once.

## Target 5 — Fix-forward vs revert

**FIX-FORWARD (strong).** Rationale:
- #114 did **not** cause any of the three issues (Targets 1-3); reverting fixes none of them.
- Reverting **reintroduces** the size-aware prerequisite mispricing #114 fixed (Suburban prerequisite charged $75 instead of $110) — a live revenue bug.
- #114 is a clean, well-tested, behavior-preserving refactor; nothing in it is entangled with the prereq-detection or gating code.

Surgical, independent fixes (operator + Claude to scope/sequence):
1. **register-tab enforcement (Issue 3):** route `handleTapFavorite` + register-tab picker adds through a prereq-checking helper. Cleanest: extract `addServiceChecked` (+ the `usePrerequisiteCheck` wiring) into a **shared hook** used by both `catalog-browser` and `register-tab`, so there is a single audited add path. Decide product intent for favorites (warn inline vs block).
2. **Add-on-only gating (Issue 2):** add a classification check at add-time (in the shared helper from #1, so it covers all screens): block/redirect when `classification === 'addon_only'` and the item is being added without its parent/prerequisite context. Define the exact rule with the operator (hard block vs warn-and-allow with manager override, mirroring the prereq override).
3. **Create-flow exotic/classic (Issue 1):** extend the `vehicle_size` branch of the Add-New form to collect + insert exotic/classic tiers (match the Edit page), or document that exotic/classic are Edit-only.
4. **Fail-open hardening (defense in depth):** reconsider `use-prerequisite-check.ts`'s silent `{ canAdd: true }` on endpoint error — at minimum surface a non-blocking "couldn't verify prerequisites" toast so a server error is visible rather than silently disabling enforcement.

## Target 6 — Why #114's tests didn't catch this

#114 added 15 tests across `prerequisite-size-aware-pricing.test.ts` (154 lines) and `picker-engine.test.ts` (+85). These assert **prerequisite PRICING** — that `selectPricingTierForVehicle()` returns the size-matched tier and that the prerequisite auto-add uses the correct price (Suburban $110, not $75). They do **not** assert prerequisite **DETECTION** (does the warning fire when a solo add-on with unmet prereqs is tapped), do not cover **register-tab**'s add path at all, and do not cover **add-on-only gating**. So:
- The tests couldn't catch Issue 3 because **there is no regression in the code #114 changed** — and there was never a test asserting "the warning fires" per add-path to begin with.
- The genuine coverage gap to add alongside the fixes: a detection test per add path (catalog-browser ✓, register-tab favorites, ServiceDetailDialog) asserting the warning fires for an unmet `required_same_ticket` prereq, plus an add-on-only gating test, plus a create-flow test asserting exotic/classic persist (or are intentionally absent) for `vehicle_size`.

## Open questions for the operator

1. **Exact repro screen for Issues 2/3:** when Paint Correction Prep was added without a warning, was it tapped from the **register-tab favorites grid**, the **catalog search results**, or the **service detail dialog**? (Determines whether Issue 3 is the register-tab gap or endpoint fail-open.)
2. **"Worked before #114":** was the previously-working prerequisite tested via the **same** screen? If it warned via catalog-browser before and doesn't now, that points to the detection **endpoint failing open** in production (worth a live endpoint check) rather than any code path.
3. **Add-on-only intent:** should `addon_only` be a hard block when added solo, or warn-and-allow with manager override (like the prereq override)?
4. **Exotic/classic at create:** should the Add-New `vehicle_size` form collect exotic/classic prices, or remain Edit-only by design?

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ No DB writes — live `SELECT`s only (services, service_pricing, service_prerequisites).
- ✅ file:line citations throughout; #114 diff lines shown for the add paths (`5f6c9c07`).
- ✅ Explicit pre-#114 (`15c0a78f`) vs post (`5f6c9c07`) comparison of the add path.
- ✅ Worktree isolation off `origin/main`.
