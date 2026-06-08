# Phase 3 Class (b) C.1 — Mid-Extraction Session Handoff

> Resume point for the structural extraction of POS reducer duplication.
> Branch `fix/quote-per-row-tier-parity` is in known-good state at commit
> `e55ed058`. 6 of 14 shared actions extracted; pattern is settled and
> 7 more byte-identical extractions + 1 heavy-lift (SET_VEHICLE) remain
> for C.1, plus C.2-C.5 for the full Class (b) arc.

---

## Section 1 — Session arc summary

### Bug 1 origin

Operator-observed bug in POS Quote-builder: scope-tier service with `max_qty > 1` (canonical case: Hot Shampoo Service @ \$20/row) mispriced when added to a quote. Adding 3 rows produced totalPrice \$20 instead of \$60. No qty stepper rendered. Vehicle change dropped the qty math entirely. POS Sale path handled the same service correctly.

### Phase A audit's key finding

Phase A.1 reducer-divergence audit found that **13 of 14 shared reducer actions** between `ticket-reducer.ts` and `quote-reducer.ts` were byte-identical duplicates. The 14th (SET_VEHICLE) was effectively identical with the same latent scope-tier-with-qty bug class as ADD_SERVICE. Bug 1 was one visible instance of a class-wide structural defect with 13 latent siblings.

### Architectural pivot

Initially planned as 4 surface-specific patches (Patch A reducer fix, Patch B component fix, Patch C serializer fix, Patch D SET_VEHICLE fix). Operator halted this approach after Patch A landed, citing the architectural defect: every patch perpetuated the duplication rather than eliminating the class.

**Pivot to structural extraction following Session #121 pattern** (`docs/dev/POS_SALE_VS_QUOTES_PARITY_AUDIT.md`, the `useValidatedServiceAdd` shared-helper precedent for component-layer add-validation).

Patch A (commit `54ba39f4`) stays in history. Its semantic content — the fix for Bug 1 — is now consolidated in the shared `applyAddService` helper alongside all other ADD_SERVICE logic.

---

## Section 2 — Current state

| Item | Value |
|---|---|
| Branch | `fix/quote-per-row-tier-parity` |
| Last commit | `e55ed058` (C.1 step 6 + combo-promotion regression test) |
| Working tree | Clean |
| POS tests | **387/387 pass** (383 baseline + 4 new combo-promotion tests) |
| TypeScript | **5 pre-existing errors only** — unchanged baseline. All in `sla-cron.test.ts` and `customer-accept-service.test.ts`; unrelated to Class (b). |

### Commit history (Class b arc)

```
e55ed058 refactor(POS): extract applyRemoveItem + combo-promotion regression test (C.1 step 6)
c73e248e refactor(POS): extract applyUpdatePerUnitQty (C.1 step 5)
bdb57106 refactor(POS): extract applyUpdateItemQuantity (C.1 step 4)
2a38dbf9 refactor(POS): extract applyAddCustomItem (C.1 step 3)
ac8413b9 refactor(POS): extract applyAddProduct + generateId utility (C.1 step 2)
a538e55b refactor(POS): extract applyAddService (C.1 step 1)
54ba39f4 fix(quote-reducer): port ADD_SERVICE scope-tier-with-qty handling (Patch A — preserved)
```

### Shared helpers landed (6 + 1 utility)

```
src/app/pos/utils/apply-add-service.ts          (~322 lines, customPriceChildBehavior knob)
src/app/pos/utils/apply-add-product.ts          (~113 lines)
src/app/pos/utils/apply-add-custom-item.ts      (~91 lines)
src/app/pos/utils/apply-update-item-quantity.ts (~75 lines)
src/app/pos/utils/apply-update-per-unit-qty.ts  (~83 lines)
src/app/pos/utils/apply-remove-item.ts          (~92 lines)
src/app/pos/utils/generate-id.ts                (~25 lines — shared UUID v4 generator)
```

### Regression test landed

```
src/app/pos/context/__tests__/remove-item-combo-promotion.test.ts (4 test cases, both reducers)
```

### Remaining work — C.1

**7 byte-identical actions (steps 7-13):**
- SET_CUSTOMER
- SET_COUPON
- SET_LOYALTY_REDEEM
- APPLY_MANUAL_DISCOUNT
- REMOVE_MANUAL_DISCOUNT
- SET_NOTES
- UPDATE_ITEM_NOTE

**1 heavy-lift action (step 14):**
- SET_VEHICLE — ~130 lines each side. Phase A.1 labeled "effectively identical with latent scope-tier-with-qty bug." Needs honest divergence audit before extraction (read both pre-extraction handlers, document any divergence, surface fix shape for operator approval before writing helper).

---

## Section 3 — Locked design decisions

### Helper file shape

- Location: `src/app/pos/utils/apply-<action-kebab>.ts`
- Export: `applyXxx<S extends { items: TicketItem[] }>(state: S, action: XxxAction, [options]): S`
- Generic constraint `<S extends { items: TicketItem[] }>` preserves surface-specific state fields via spread; helper only touches `state.items`.

### Action interface pattern

- Each helper exports its own `XxxAction` structural interface matching the inline definitions in `types.ts` (`TicketAction` line 142+ / `QuoteAction` line 263+).
- No modifications to `types.ts` needed — structural typing allows narrowed actions from either reducer-specific union to assign to the helper's interface.

### `customPriceChildBehavior` knob (`applyAddService` only)

Operator-locked option (α) from Phase B Mitigation #3:
- **Sale** passes `'append'` — preserves Sale's pre-extraction byte-behavior for custom-priced child items (lands at end of items[] even with parentItemId).
- **Quote** passes `'after-parent'` — preserves Quote's pre-extraction byte-behavior (inserts immediately after parent's last child).
- Default branch (non-custom-price) **always** inserts after-parent regardless of knob.
- Honest caveat documented in `ApplyAddServiceOptions` docblock: Sale's custom-price-no-parent-insert may be a latent oversight (inconsistent with Sale's own default branch). Knob preserves byte-behavior; removing it is a one-line refactor if later confirmed an oversight.

### `next === state` reference-equal optimization

Only used in helpers that have a true no-op return path:
- **`applyAddService`** — uses it (duplicate non-per-unit-like returns `state` ref-equal)
- **All other helpers** — DON'T use it (items[] always changes via filter/map/append). Delegator unconditionally wraps in `recalculateTotals`.

Reasoning documented in each delegator's inline comment (e.g., "ADD_PRODUCT always changes items[] — this is structural, not optimization-related").

### `generateId` consolidation

Lives in `src/app/pos/utils/generate-id.ts`. 4 current consumers import from it (both reducers + 2 helpers). Future extractions that need it (ADD_PRODUCT, ADD_CUSTOM_ITEM, etc.) all import from this canonical utility. NO local duplicates.

### `recalculateTotals` stays surface-specific

Each reducer's `recalculateTotals` lives in its own file because the totals composition diverges intentionally:
- **Sale (`ticket-reducer.ts`)** composes `depositCredit + priorPaymentsTotal` into totals
- **Quote (`quote-reducer.ts`)** composes `mobileSurcharge` into totals

Delegator pattern: `case 'XXX': { return recalculateTotals(applyXxx(state, action)); }` — surface-specific `recalculateTotals` wraps the helper's return. Helpers return state without recalculating.

### Delegator commit-comment pattern

Every delegator includes a brief explanatory comment anchoring to:
1. The step number (C.1 step N)
2. The shared helper's behavior (one-line summary)
3. Why or why-not `next === state` ref-equal check applies

---

## Section 4 — C.2–C.5 plan

### C.2 — Component-layer hook extension

**Goal:** extend `src/app/pos/hooks/use-validated-service-add.tsx` (Session #121 reference) to own dedup-and-dispatch in addition to its current responsibility (prereq check + add-on-only gate + dialogs).

**Three surfaces route through it:**
- Sale `catalog-browser.tsx` — already does, but `commitAdd`'s internal dup-check moves into the hook
- Quote `quote-builder.tsx` — `handleAddService`'s dup-check moves into the hook (closes Bug 1's component-layer symptom)
- Sale `register-tab.tsx` — already routes through hook; `commitAdd` is bare dispatch; gains dup-check by way of hook extension

**Prerequisite reads (C.2 starts with):**
- `src/app/pos/hooks/use-validated-service-add.tsx` (current state)
- `src/app/pos/components/catalog-browser.tsx` (Sale reference; specifically `commitAdd` lines 212-249)
- `src/app/pos/components/quotes/quote-builder.tsx` (`handleAddService` lines 254-282 — the Bug 1 component-layer symptom)
- `src/app/pos/components/quotes/quote-builder.tsx` (`handleTapServiceSearch` + `handlePricingSelect` — pre-C.2 mini-audit per Phase B Mitigation #2)

**Design (pre-locked):**
- Hook signature gains `items: TicketItem[]` so it can read current items snapshot for dup detection
- Hook gains `onIncrement: (item, newQty) => void` callback for surface-specific increment dispatch
- After validation passes, hook checks for existing item:
  - Exists + per-unit-like → calls `onIncrement` (dispatches `UPDATE_PER_UNIT_QTY`)
  - Exists + not per-unit-like → toast warning "Already on ticket", no-op
  - Otherwise → calls `onAdd` (the surface's dispatch primitive)
- All 3 surfaces drop their commitAdd/handleAddService dup logic; they become bare dispatch primitives

### C.3 — Save-serializer extraction

**Goal:** shared `serializeTicketItemForPersistence(item, options)` helper. The `hasPerUnitQty` flatten + 4 currently-missing-on-Quote fields (`standard_price`, `pricing_type`, `is_addon`, `prerequisite_note`) live in one place.

**Seven consumer call sites:**
- Sale: `payment-method-screen.tsx`, `card-payment.tsx`, `cash-payment.tsx` (2x), `split-payment.tsx`, `digital-payment.tsx`, `check-payment.tsx` — all six tender screens
- Quote: `quote-ticket-panel.tsx` `buildItemsPayload` + `handleCreateJob` items map

### C.4 — Architectural parity test

**Goal:** generalize the `dispatchOnBoth` + `expect(quoteResult.items).toEqual(ticketResult.items)` pattern from step 6's regression test across all 14 shared actions.

**Test file:** `src/app/pos/context/__tests__/reducer-parity.test.ts`

For each of the 14 shared actions:
- Dispatch identical action on both `ticketReducer(initialTicketState, ...)` and `quoteReducer(initialQuoteState, ...)`
- Assert `result.items` (and other shared state slices) are byte-identical
- Cover the intentional A.4 divergences via exclusion list documented in the test header

### C.5 — Documentation

- `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md` — new section on POS reducer extraction pattern; references `applyAddService` et al.; references Session #121 (`useValidatedServiceAdd`) as the architectural precedent
- `docs/CHANGELOG.md` — comprehensive entry for the structural fix
- This handoff doc archived/deleted once Class (b) closes

---

## Section 5 — Discipline rules for resumption

These are LOCKED for the resumption session. Do not relax.

1. **Diff-before-commit at every step.** Each action extraction is a separate commit. Full diff visible in chat BEFORE operator approval. No batched approvals.

2. **Sale-side byte-behavior preserved.** Run `npx vitest run src/app/pos/` after EVERY edit. Test count must match the baseline at each step (387 currently; will rise as more parity tests land). If a test fails, halt and re-examine.

3. **Memory #8 override remains authorized** for the multi-session structural extraction scope. Reference in commit messages.

4. **Paste-error checks.** Before declaring "5 TS errors" (the baseline), run `npx tsc --noEmit 2>&1 | wc -l` and compare to baseline. If the count changes, investigate before continuing. This is the small-but-real check that caught the TS2783 in step 6's regression test.

5. **Each extraction follows the pattern:**
   - Locate both reducers' case via `grep -n "case 'XXX_NAME'" src/app/pos/context/*-reducer.ts`
   - Read each case fresh (don't trust memory — files have moved during prior extractions)
   - Document divergence in the surface report (typically "byte-identical modulo one comment" or "truly byte-identical")
   - Draft helper: `src/app/pos/utils/apply-<kebab-case>.ts`
   - Edit both reducers (add import + replace case body with delegator)
   - Run tsc + vitest scoped to `src/app/pos/`
   - Surface full helper + 2 reducer diffs in chat
   - Wait for operator approval
   - Commit

6. **SET_VEHICLE step requires extra discipline:**
   - Phase A.1 labeled "effectively identical with same latent bug class"
   - Read BOTH pre-extraction handlers in full before drafting helper
   - Document every divergence (comments, whitespace, variable names)
   - Identify whether divergences are bugs vs. intentional
   - Surface divergence audit BEFORE writing the helper
   - Operator approves divergence treatment shape
   - Then write helper following the pattern
   - The scope-tier-with-qty handling in SET_VEHICLE may benefit from extracting shared helpers (like `repriceServiceItem`) — surface design before committing

7. **C.2 component-layer extraction requires pre-extraction mini-audit:**
   - Phase B Mitigation #2 — read `quote-builder.tsx` search/picker/custom-price handlers (`handleTapServiceSearch`, `handlePricingSelect`, `handleCustomPriceSelect` if exists) fresh
   - Surface any additional dup logic these contain
   - Surface Sale-side equivalents in `catalog-browser.tsx` (the picker, custom-price, etc. handlers)
   - Operator approves shape before extraction lands

---

## Section 6 — Next-session prompt template

Paste this verbatim to resume:

```
Resume Phase 3 Class (b) C.1 from step 7 (SET_CUSTOMER).

Required reading first:
1. docs/dev/CLASS_B_C1_HANDOFF.md (this document, in full)
2. docs/dev/POS_SALE_VS_QUOTES_PARITY_AUDIT.md (Session #121 reference for C.2)
3. The 6 existing helper files in src/app/pos/utils/apply-*.ts (read at
   least apply-add-service.ts + apply-remove-item.ts to study the pattern)
4. Recent commit range: 54ba39f4 (Patch A) through e55ed058 (step 6) on
   branch fix/quote-per-row-tier-parity

Verify on entry (run these commands and confirm):
- git status: clean, on branch fix/quote-per-row-tier-parity
- git log -1 --oneline: HEAD at e55ed058
- npx vitest run src/app/pos/: 387/387 pass
- npx tsc --noEmit 2>&1 | wc -l: 5 lines (pre-existing baseline)

Then proceed with C.1 step 7 (SET_CUSTOMER) following the locked pattern
in CLASS_B_C1_HANDOFF.md Section 5. Diff-before-commit. No batched approvals.
```

---

## Final state at session boundary

| Item | Value |
|---|---|
| Branch | `fix/quote-per-row-tier-parity` |
| HEAD | `e55ed058` (this commit will be `e55ed058`'s child once handoff doc commits) |
| Bug 1 status | **Root structurally fixed** — `applyAddService` helper consolidates the scope-tier-with-qty logic. Component-layer symptom (Bug 1's full UX surface) closes when C.2 lands. |
| Working tree | Clean post-handoff-doc commit |
| Tests | 387/387 (383 baseline + 4 combo-promotion) |
| TypeScript | 5 pre-existing errors only (baseline) |
| Memory #8 | Override authorized; cite in resumption commits |
