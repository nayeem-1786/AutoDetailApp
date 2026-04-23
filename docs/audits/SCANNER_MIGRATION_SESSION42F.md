# Scanner Hook Deprecation Cleanup — Session 42F-migration Audit

**Date:** 2026-04-23
**Scope:** Inventory every remaining reference to the three deprecated/transitional compat shims left by Session 42F-rewrite (commit `adedc326`):
1. `requireTargetAttribute?: boolean` option (no-op under observe-don't-capture)
2. `maxKeystrokeGap?: number` option (alias for `scanBurstMs`)
3. `data-barcode-scan-target="input"` legacy consumer-opt-in attribute (aliased with `data-scan-consumer`)
**Kind:** READ-ONLY. No code changes. Output drives Session 42F-migration-rewrite.

---

## Executive summary

The 42F-rewrite shipped with three compat shims to keep the five known consumers + one additional opt-in site (Quick Edit drawer) compiling without changes. This audit inventories every call site and test that touches the shims, confirms no surprise consumers exist outside the known five, and sequences the cleanup.

**Headline findings:**

- **Only 2 of 5 consumers still pass `requireTargetAttribute`**: `admin/catalog/products/page.tsx` and `admin/inventory/counts/[id]/page.tsx`. Both pass `false`, which under the new model is already the default behavior.
- **Zero consumers pass `maxKeystrokeGap`.** This shim has no live callers — it could be deleted today with only the hook + type-definition edits needed.
- **Only 1 site uses the legacy attribute `data-barcode-scan-target="input"` in app code**: `src/app/admin/catalog/products/components/quick-edit-drawer.tsx:338` (Quick Edit Barcode field — the rescan consumer). Two test files also reference it.
- **Surprise finding — vestigial `data-barcode-target` attribute**: 2 sites (`pos/components/search-bar.tsx:83`, `pos/components/transactions/transaction-list.tsx:249`) still render this attribute. It is NOT one of the three tracked shims — it's a DIFFERENT attribute from the pre-42F focus-gate era that the current hook explicitly does not consult (see hook JSDoc line 93: "retired"). These renders are dead code and should be cleaned up in the same migration.
- **No surprise consumers**: grep confirms the 5-consumer list in audit §2 of `SCANNER_HOOK_REWRITE_SESSION42F.md` is still accurate. The only non-consumer site with a relevant attribute is Quick Edit drawer (expected).

**Migration cost:** 7 files modified (2 hook deprecation removals, 2 consumer options, 1 attribute rename on Quick Edit, 2 vestigial attribute removals) + 3 test file edits. No ordering hazards if consumers migrate before hook deprecations are removed.

---

## Phase 1 — Hook file inventory

**File:** `src/lib/hooks/use-barcode-scanner.ts`

### 1a. `requireTargetAttribute` references

| Line | Role | Quote |
|---|---|---|
| 36-40 | Option type + JSDoc | `/** @deprecated No-op under observe-don't-capture. Kept for source-compat during Session 42F-migration. Consumers can safely omit. */`<br>`requireTargetAttribute?: boolean;` |
| 91-92 | JSDoc "Behavior changes" bullet | `* - `requireTargetAttribute: false` consumers: slow-typed Enter no longer * dispatches onScan. Scan detection is strictly timing-gated.` |

`requireTargetAttribute` is NOT read anywhere in the hook body — it's declared in the interface but not destructured at lines 100-106 and not referenced in the `useEffect`. Pure type-compat. Safe to delete on cleanup.

### 1b. `maxKeystrokeGap` references

| Line | Role | Quote |
|---|---|---|
| 42-46 | Option type + JSDoc | `/** @deprecated Alias for `scanBurstMs` during 42F-migration. If both are provided, `scanBurstMs` wins. Remove once all consumers updated. */`<br>`maxKeystrokeGap?: number;` |
| 108-110 | Alias resolution | `// Deprecated alias resolution — read from raw options so "explicit 50" is`<br>`// distinguishable from "default 50" (no scanBurstMs: 50 ambiguity).`<br>`const scanBurstMs = options.scanBurstMs ?? options.maxKeystrokeGap ?? 50;` |

Post-cleanup line 110 simplifies to: `const { scanBurstMs = 50 } = options;` (can move back into the main destructure at lines 100-106).

### 1c. `isScanConsumer()` function — current form (lines 152-162)

```ts
function isScanConsumer(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  // Preferred opt-in attribute (post-42F-migration).
  if (el.hasAttribute('data-scan-consumer')) return true;
  // Legacy alias from Session 42D-interlude. Recognised during the
  // 42F-rewrite → 42F-migration transition so the Quick Edit drawer's
  // rescan flow keeps working. Remove once 42F-migration swaps the
  // attribute on quick-edit-drawer.tsx.
  if (el.getAttribute('data-barcode-scan-target') === 'input') return true;
  return false;
}
```

Post-cleanup: lines 158-161 (the legacy branch) removed. Function becomes 5 lines.

### 1d. Other deprecated/transitional notes in the hook

| Line | Content |
|---|---|
| 73-74 | JSDoc: `Scan-consumer opt-in: if the focused element carries `data-scan-consumer` (or, transitionally, `data-barcode-scan-target="input"`), ...` — remove the parenthetical. |
| 90-94 | JSDoc "Behavior changes from pre-42F capture-first model" block — includes `requireTargetAttribute: false` and `data-barcode-target` retirement notes. These are historical; remove the `requireTargetAttribute` bullet. `data-barcode-target` bullet can stay as-is (documents the retirement) or be removed once the vestigial attribute renders are cleaned up (see Phase 3). |

---

## Phase 2 — Consumer site inventory

All five consumers from `SCANNER_HOOK_REWRITE_SESSION42F.md` §2 still exist and still call `useBarcodeScanner`. None have been renamed or moved.

### 2.1 `src/app/pos/components/pos-workspace.tsx:142-145`

```ts
useBarcodeScanner({
  onScan: handleBarcodeScan,
  enabled: !locked,
});
```

| Shim | Passed? |
|---|---|
| `requireTargetAttribute` | ❌ no |
| `maxKeystrokeGap` | ❌ no |
| `data-barcode-scan-target` in rendered inputs | ❌ no |
| `data-barcode-target` in rendered inputs | ❌ no |

**No migration needed at this call site.**

### 2.2 `src/app/pos/components/quotes/quote-builder.tsx:189`

```ts
useBarcodeScanner({ onScan: handleBarcodeScan });
```

| Shim | Passed? |
|---|---|
| All four | ❌ no |

**No migration needed at this call site.**

### 2.3 `src/app/pos/components/transactions/transaction-list.tsx:131`

```ts
useBarcodeScanner({ onScan: handleReceiptScan });
```

| Shim | Passed? |
|---|---|
| `requireTargetAttribute` | ❌ no |
| `maxKeystrokeGap` | ❌ no |
| `data-barcode-scan-target` | ❌ no |
| `data-barcode-target` | ✅ **YES** — line 249, on the receipt-search `<Input>`: `data-barcode-target` |

Lines 247-251:

```tsx
<Input
  ref={searchInputRef}
  data-barcode-target
  value={query}
  onChange={(e) => setQuery(e.target.value)}
```

**This attribute is VESTIGIAL** — the current hook never reads `data-barcode-target` (see Phase 3 + hook line 93). Dead marker; remove during migration for hygiene.

### 2.4 `src/app/admin/catalog/products/page.tsx:83-104` (excerpt 83-94)

```ts
useBarcodeScanner({
  requireTargetAttribute: false,
  onScan: async (barcode) => {
    try {
      const res = await adminFetch('/api/admin/products/barcode-lookup', {
        method: 'POST',
        ...
```

| Shim | Passed? |
|---|---|
| `requireTargetAttribute` | ✅ **YES** — `false` at line 84 |
| `maxKeystrokeGap` | ❌ no |
| `data-barcode-scan-target` | ❌ no (verified page-level grep) |
| `data-barcode-target` | ❌ no |

**Migration: delete line 84.** `false` is the new default; dropping the prop is a no-op semantically.

### 2.5 `src/app/admin/inventory/counts/[id]/page.tsx:165-168` (excerpt)

```ts
useBarcodeScanner({
  requireTargetAttribute: false,
  enabled: count?.status === 'active' && !loading && !acting,
  onScan: async (barcode) => {
    ...
```

| Shim | Passed? |
|---|---|
| `requireTargetAttribute` | ✅ **YES** — `false` at line 166 |
| `maxKeystrokeGap` | ❌ no |
| `data-barcode-scan-target` | ❌ no |
| `data-barcode-target` | ❌ no |

**Migration: delete line 166.**

### 2.6 Consumer-site summary matrix

| Consumer | `requireTargetAttribute` | `maxKeystrokeGap` | Vestigial attr to remove |
|---|---|---|---|
| `pos-workspace.tsx` | — | — | — |
| `quote-builder.tsx` | — | — | — |
| `transaction-list.tsx` | — | — | `data-barcode-target` @ line 249 |
| `admin/catalog/products/page.tsx` | delete line 84 | — | — |
| `admin/inventory/counts/[id]/page.tsx` | delete line 166 | — | — |

---

## Phase 3 — Attribute usage inventory (entire `src/` tree)

### 3a. `data-barcode-scan-target`

| File:line | Role | Notes |
|---|---|---|
| `src/lib/hooks/use-barcode-scanner.ts:74` | JSDoc comment | `(or, transitionally, data-barcode-scan-target="input")` |
| `src/lib/hooks/use-barcode-scanner.ts:160` | Hook recognition branch | `if (el.getAttribute('data-barcode-scan-target') === 'input') return true;` |
| `src/lib/hooks/__tests__/use-barcode-scanner.test.ts:215-217` | Test 8b (legacy alias test) | `installInput({ 'data-barcode-scan-target': 'input' })` |
| `src/app/admin/catalog/products/components/quick-edit-drawer.tsx:338` | **ACTIVE RENDER — the only real usage** | `data-barcode-scan-target="input"` on the Quick Edit Barcode `<Input>`. Migrate to `data-scan-consumer`. |
| `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:424-433` | Regression test — negative assertion | Asserts the inventory-count search input does NOT carry this attribute. See Phase 4.3 for handling. |
| `src/components/ui/__tests__/search-input.test.tsx:69,73` | SearchInput prop-pass-through test | Uses the attribute as a sample data-* prop. Test semantics (prop forwarding) don't depend on scanner meaning. See Phase 4.4. |

### 3b. `data-barcode-target` (different attribute, retired in 42F)

| File:line | Role | Notes |
|---|---|---|
| `src/lib/hooks/use-barcode-scanner.ts:93` | JSDoc comment | `- data-barcode-target focus gate is retired. onScan is no longer gated by focus attribute on Enter — only by timing.` |
| `src/app/pos/components/transactions/transaction-list.tsx:249` | **Vestigial render** | `data-barcode-target` on the search `<Input>`. Hook does not read this. Dead marker. |
| `src/app/pos/components/search-bar.tsx:83` | **Vestigial render** | `data-barcode-target` on the search `<input>`. `search-bar.tsx` does NOT import `useBarcodeScanner` — file was not one of the 5 consumers, attribute is purely residual. Dead marker. |

**Action during migration:** remove both render sites. Zero behavioral change — the attribute has been inert since 42F-rewrite shipped.

### 3c. `data-scan-consumer` (new, post-42F-migration)

| File:line | Role |
|---|---|
| `src/lib/hooks/use-barcode-scanner.ts:73,155` | Hook JSDoc + recognition branch |
| `src/lib/hooks/__tests__/use-barcode-scanner.test.ts:197-198` | Test 8 (the canonical data-scan-consumer test) |

**Zero app-code usages today.** Quick Edit drawer will become the first real consumer during migration.

### 3d. Surprise check — any unknown scanner consumers?

`grep useBarcodeScanner src/` confirms exactly the 5 known consumers plus the hook's own tests and one component-test harness (`pos/components/__tests__/customer-lookup.test.tsx` — a harness that mounts the hook alongside the lookup for scanner-coexistence testing, not a functional consumer). No stealth new consumers. Audit §2 of `SCANNER_HOOK_REWRITE_SESSION42F.md` is still accurate.

---

## Phase 4 — Test file inventory

### 4.1 `src/lib/hooks/__tests__/use-barcode-scanner.test.ts`

12 tests total (numbered 1-12 with an 8b variant).

| Test | Scope | Post-migration action |
|---|---|---|
| 1 Passive typing | New model | Keep |
| 2 Fast-burst scan | New model | Keep |
| 3 Slow typing + Enter | New model | Keep |
| 4 Mixed slow→fast | New model | Keep |
| 5 minLength | New model | Keep |
| 6 enabled=false | New model | Keep |
| 7 enabled flip | New model | Keep |
| 8 `data-scan-consumer` | New model | Keep |
| **8b** `data-barcode-scan-target="input"` alias | **Legacy transitional** | **DELETE** — lines 215-230 |
| 9 focus change mid-burst | New model | Keep |
| 10 body focus | New model | Keep |
| 11 ring buffer | New model | Keep |
| 12 cleanup on unmount | New model | Keep |

**No tests exercise `requireTargetAttribute` or `maxKeystrokeGap` directly** — both options are either no-op or an alias, so the new-model tests implicitly validate their replacements.

### 4.2 `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:36` — mock type signature

Lines 32-41:

```ts
vi.mock('@/lib/hooks/use-barcode-scanner', () => ({
  useBarcodeScanner: (opts: {
    onScan: (barcode: string) => void | Promise<void>;
    enabled?: boolean;
    requireTargetAttribute?: boolean;   // ← line 36 — mirror of deprecated prop
  }) => { ... },
}));
```

Once `UseBarcodeScannerOptions` no longer declares `requireTargetAttribute`, this mock type still compiles (TS structural typing doesn't require mock to be a subtype of the real interface). But the field is dead weight and visually misleading. **Update: remove line 36.**

### 4.3 `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:424-434` — negative assertion

Lines 424-434:

```ts
// Regression: removing data-barcode-scan-target from the search input means
// the rendered DOM no longer carries the opt-out attribute. The real hook
// test covers the routing behavior; this test verifies the attribute is gone
// at the page level so the hook sees a "normal" focused input.
it('search input does NOT carry data-barcode-scan-target', async () => {
  stubGet({ status: 'active', items: [] });
  await renderAndWait();
  const searchInput = screen.getByPlaceholderText(/search by product name/i) as HTMLInputElement;
  expect(searchInput.getAttribute('data-barcode-scan-target')).toBeNull();
});
```

The test still functions post-migration (the attribute genuinely is not rendered). Three options:

- **(a)** Keep as-is. Reads as a historical regression note; still valid.
- **(b)** Rename the assertion to test absence of `data-scan-consumer` instead — the "opt-out" semantic is the same under the new attribute name.
- **(c)** Delete. The hook's real test suite and the page's functional tests already cover the intent; this is a thin DOM-level check.

**Recommendation: (b)** — keep the regression coverage but migrate the attribute name it checks for. One-line change.

### 4.4 `src/components/ui/__tests__/search-input.test.tsx:62-75` — prop-pass-through

```tsx
it('forwards arbitrary props (autoFocus, data-*) to the underlying input', () => {
  render(
    <SearchInput
      value=""
      onChange={() => {}}
      placeholder="p"
      autoFocus
      data-barcode-scan-target="input"
    />
  );
  const input = screen.getByPlaceholderText('p') as HTMLInputElement;
  expect(input.getAttribute('data-barcode-scan-target')).toBe('input');
  expect(document.activeElement).toBe(input);
});
```

The test's subject is "SearchInput forwards arbitrary data-* props" — it uses this specific attribute name as an example. Post-migration the attribute string is semantically meaningless (no longer recognized by the hook), but the test still passes. Functionally no issue.

**Recommendation:** swap the example to `data-testid="search"` or `data-scan-consumer=""` for clarity. Non-blocking cosmetic fix. If no one cares, leave as-is — the test doesn't test scanner semantics.

---

## Phase 5 — Migration sequencing plan

### Strict ordering: consumers → hook → tests

Removing hook deprecations before consumers migrate **breaks the build** because:
- `src/app/admin/catalog/products/page.tsx:84` and `src/app/admin/inventory/counts/[id]/page.tsx:166` pass `requireTargetAttribute: false` — if the interface loses the field, TypeScript's `strict` setting surfaces "Object literal may only specify known properties" errors.
- `maxKeystrokeGap` has no consumers so removing it is safe in either order, but bundling it with `requireTargetAttribute` removal is cleaner.

**Safe ordering (no intermediate broken states):**

#### Step 1 — Migrate consumer sites

Files to edit in step 1 (order within step doesn't matter):

| # | File | Change |
|---|---|---|
| 1a | `src/app/admin/catalog/products/page.tsx` | Delete line 84: `requireTargetAttribute: false,` |
| 1b | `src/app/admin/inventory/counts/[id]/page.tsx` | Delete line 166: `requireTargetAttribute: false,` |
| 1c | `src/app/admin/catalog/products/components/quick-edit-drawer.tsx:338` | Change `data-barcode-scan-target="input"` → `data-scan-consumer=""` (or omit value entirely — hook uses `hasAttribute`) |
| 1d | `src/app/pos/components/transactions/transaction-list.tsx:249` | Delete `data-barcode-target` attribute (dead marker) |
| 1e | `src/app/pos/components/search-bar.tsx:83` | Delete `data-barcode-target` attribute (dead marker) |
| 1f | `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:36` | Delete `requireTargetAttribute?: boolean;` from mock type |
| 1g | `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:424-434` | Flip the regression assertion to check for absence of `data-scan-consumer` instead of `data-barcode-scan-target` (rename-only — keep the test) |
| 1h | *(Optional)* `src/components/ui/__tests__/search-input.test.tsx:69,73` | Swap example attribute name to `data-testid` or `data-scan-consumer`. Non-blocking. |

After step 1, the codebase still uses the legacy recognition branch in the hook but no consumer relies on it. Build is green. Test suite passes (Test 8b still exercises the legacy recognition branch; all other tests unaffected).

#### Step 2 — Remove hook deprecations

One file, multiple edits:

| Edit | Location |
|---|---|
| Delete `requireTargetAttribute?: boolean;` + JSDoc | `src/lib/hooks/use-barcode-scanner.ts:36-40` |
| Delete `maxKeystrokeGap?: number;` + JSDoc | `src/lib/hooks/use-barcode-scanner.ts:42-46` |
| Simplify `scanBurstMs` resolution | Line 110 → move `scanBurstMs = 50` into the main destructure at lines 100-106; delete the standalone line |
| Remove legacy branch in `isScanConsumer()` | Delete lines 158-161 (inclusive of the 4-line comment + the `if`) |
| JSDoc cleanup | Line 74: remove `(or, transitionally, data-barcode-scan-target="input")` parenthetical. Lines 91-92: remove the `requireTargetAttribute` bullet. Line 93 about `data-barcode-target`: keep or remove per taste. |

#### Step 3 — Update hook tests

| Edit | Location |
|---|---|
| Delete Test 8b | `src/lib/hooks/__tests__/use-barcode-scanner.test.ts:215-230` (inclusive of the preceding `// Test 8b` comment line) |

#### Step 4 — Verify

```bash
npx tsc --noEmit
npx vitest run
```

Both must pass. Expected test count decreases by 1 (deletion of Test 8b). No other test count changes anticipated.

### Recommended commit structure

Option α — **single commit** covering steps 1-3. Pro: atomic. Con: large diff across ~8 files.

Option β — **two commits**:
1. `refactor(scanner): migrate consumers to data-scan-consumer + drop requireTargetAttribute usage` (step 1)
2. `refactor(scanner): remove deprecated requireTargetAttribute, maxKeystrokeGap, and legacy attribute recognition` (steps 2 + 3)

**Recommendation: option β.** Each commit is independently revertible. The first commit is behaviorally inert (shim still works, consumers just don't use it); the second commit actually removes code. If the second commit surfaces a problem, revert it without losing the consumer migration.

### Ordering hazard summary

- **Step 1 → Step 2**: strict. Reversal breaks TypeScript.
- **Step 1 internal order**: any order works. 1a-1h are independent edits.
- **Step 2 → Step 3**: not strict. Deleting Test 8b before step 2 would fail (hook still recognizes legacy attribute, test still passes) but is semantically weird — keep these together.
- **Step 4**: runs once after all code changes land.

---

## Phase 6 — Deliverable

This document, at `docs/audits/SCANNER_MIGRATION_SESSION42F.md`. Single commit, no code changes, pushed to main.

---

## Open questions for the rewrite session

1. **Quick Edit attribute form**: `data-scan-consumer=""` (empty value) vs `data-scan-consumer` (no value)? Hook uses `hasAttribute`, so both work. React renders them identically in the DOM. Cosmetic.
2. **Should the `data-barcode-target` JSDoc retirement note at hook line 93 stay?** It currently documents that the pre-42F focus gate is retired. Once the 2 vestigial renders are removed, the note has no live referent. Keeping it preserves historical context; removing it tightens the JSDoc. Preference-level.
3. **SearchInput test attribute swap (Phase 4.4 item h)** — include in step 1 or skip? Functionally inert either way. My vote: skip unless someone objects to the misleading example attribute.
4. **Atomic commit vs two commits** — confirm β.

No blockers. The migration is mechanical; the ordering avoids any broken-build window.
