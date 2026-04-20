# Vehicle-Change Reprice — Audit (Option B: silent reprice)

> Read-only audit. No refactor code produced.
>
> Task context: staff swap vehicles on a POS ticket. Services currently remain at the price resolved at add-time — silent mispricing when the vehicle's size_class differs from the add-time vehicle. Owner wants silent reprice on vehicle change (no dialog).

---

## Executive summary — critical finding first

**The reprice infrastructure already exists.** `RECALCULATE_VEHICLE_PRICES` is a fully-implemented reducer action at `src/app/pos/context/ticket-reducer.ts:424-480` (mirrored at `quote-reducer.ts:358`). It iterates `state.items`, re-resolves pricing against the new vehicle's `size_class` via `resolveServicePriceWithSale`, preserves combo decisions correctly (lowest-wins), and updates `unitPrice`, `totalPrice`, `standardPrice`, `pricingType`, `saleEffectivePrice`, `vehicleSizeClass` on each service item.

**What's broken is the wiring, not the logic.** `SET_VEHICLE` and `RECALCULATE_VEHICLE_PRICES` are two separate actions that callers must dispatch in pair. One dispatch site (`ticket-panel.tsx:681` — the edit-existing-vehicle path) dispatches only `SET_VEHICLE` without the paired `RECALCULATE_VEHICLE_PRICES`. That's the concrete silent-mispricing bug.

This reframes the task:
- We do **not** need to design reprice logic from scratch.
- We **do** need to either (a) wire the missing path or (b) collapse the two actions into one so forgetting the second dispatch becomes structurally impossible.

The audit recommends collapsing them — same effort as (a), but eliminates the bug class permanently.

---

## Phase 1 — Vehicle-change code paths

### 1A. Dispatch inventory

| # | File:line | Trigger | Flavor | Currently dispatches RECALCULATE? | Gap? |
|---|---|---|---|---|---|
| 1 | `ticket-panel.tsx:259` | `handleGuestCheckout` — staff clicks "Skip customer lookup" | clear (vehicle → null) | No | No (fresh ticket) |
| 2 | `ticket-panel.tsx:274` | `applyVehicleSelection` — staff picks a vehicle from selector | swap (new vehicle_id) | **Yes** (L280) | No |
| 3 | `ticket-panel.tsx:320` | `handleConfirmVehicleChange` — staff confirms category change | category swap — **services removed** first (L317) | No | No (items cleared; reprice moot) |
| 4 | `ticket-panel.tsx:333` | `handleClearCustomer` — staff clears customer | clear (vehicle → null) | No | Minor (see 1C) |
| 5 | **`ticket-panel.tsx:681`** | **Edit existing vehicle** — staff opens VehicleCreateDialog in edit mode, changes size_class, saves | **attribute change (same vehicle_id, new size_class)** | **No** | **YES — this is the observed silent-mispricing path** |
| 6 | `quote-ticket-panel.tsx:108` | `applyVehicleSelection` — quote builder | swap | **Yes** (L113) | No |
| 7 | `quote-ticket-panel.tsx:142` | `handleConfirmVehicleChange` — category swap in quote | services cleared first | No | No |
| 8 | `quote-ticket-panel.tsx:155` | `handleClearCustomer` — quote | clear | No | Minor |

**Quote builder observation:** `quote-ticket-panel.tsx` has no edit-existing-vehicle path (only `handleVehicleCreated` → `handleSelectVehicle` → `applyVehicleSelection`, which correctly pairs). So the gap is ticket-panel-only today. If a quote-side edit path is added later, the same gap would reappear — which is the structural concern behind the recommendation below.

### 1B. No direct mutation of `ticket.vehicle`

Grep confirms `ticket.vehicle` is only mutated through the reducer. No direct assignments.

### 1C. Customer-change flows

- `handleGuestCheckout` (ticket-panel.tsx:258–261): `SET_CUSTOMER null` + `SET_VEHICLE null`. Usually invoked when the ticket is empty (fresh "guest" transaction); no items to reprice.
- `handleClearCustomer` (ticket-panel.tsx:331–334): same. Clears both. If services exist, they retain their snapshot prices — which is arguably wrong but also unusual (why clear customer mid-ticket?). Low-priority edge case; not in the owner's scope.

### 1D. Admin vehicle-edit path (outside POS session)

If staff edits a vehicle's `size_class` in `/admin/customers/[id]/page.tsx` while a POS ticket is open elsewhere on the same vehicle, the POS ticket's cached `ticket.vehicle` is a stale snapshot. The reducer has no cross-session awareness — out of scope for silent reprice. Worth flagging as a documented limitation (closes on next POS-side vehicle re-fetch).

### 1E. API endpoints writing to `ticket_items`

Grep for writes to `ticket_items` during active ticket state: none found in the live-session path. `ticket_items` writes happen at checkout (after `CLEAR_TICKET` fires) — not concurrent with vehicle change. No risk of a sibling write de-syncing item prices mid-ticket.

---

## Phase 2 — TicketItem shape: hybrid snapshot+reference

### 2A. Shape (verified at `src/app/pos/types.ts:14-43`)

```ts
interface TicketItem {
  id: string;
  itemType: 'product' | 'service' | 'custom';
  productId: string | null;
  serviceId: string | null;           // REFERENCE
  itemName: string;                   // SNAPSHOT
  quantity: number;
  unitPrice: number;                  // SNAPSHOT (effective price per qty)
  totalPrice: number;                 // SNAPSHOT (unitPrice * quantity)
  taxAmount: number;                  // SNAPSHOT
  isTaxable: boolean;                 // SNAPSHOT
  tierName: string | null;            // REFERENCE (tier_label ?? tier_name)
  vehicleSizeClass: VehicleSizeClass | null;  // SNAPSHOT of the size_class used at add-time
  notes: string | null;
  // Per-unit fields (snapshotted)
  perUnitQty, perUnitLabel, perUnitPrice, perUnitMax: nullable
  parentItemId: string | null;
  // Pricing provenance (all SNAPSHOT)
  standardPrice: number;              // catalog price at add-time
  pricingType: 'standard' | 'sale' | 'combo';
  comboSourcePrimaryId: string | null;
  saleEffectivePrice: number | null;
  // Prerequisite tracking
  prerequisiteNote, prerequisiteForServiceId: nullable
}
```

Hybrid model: `serviceId` + `tierName` are references; all price/tax/type/label fields are snapshots. **Reprice requires actively mutating snapshot fields** — dynamic resolution at render time is not an option without refactoring the data model and every downstream consumer (receipts, payments, persistence).

### 2B. ADD_SERVICE dispatch sites

`ticket-reducer.ts:114` and `quote-reducer.ts:115`. Both read the same action payload; both snapshot prices at add-time using `resolveServicePriceWithSale`.

---

## Phase 3 — Sale pricing pattern

### 3A. Pattern used

`getSaleStatus(window)` in `src/lib/utils/sale-pricing.ts:17` dynamically evaluates `isOnSale` against `Date.now()` every call. `getTierSaleInfo(std, sale, isOnSale)` is a pure display-info function.

Sale pricing is snapshotted on the TicketItem (`saleEffectivePrice`, `pricingType: 'sale'`) at ADD_SERVICE time. Downstream consumers (receipt, payment summary) read the snapshot — they do not re-query `isOnSale`.

### 3B. How reprice currently interacts with sale

`RECALCULATE_VEHICLE_PRICES` at `ticket-reducer.ts:443` calls `resolveServicePriceWithSale(pricingTier, sizeClass, saleWindow)` — which internally calls `getSaleStatus`. If the sale window has expired between add-time and reprice-time, the `isOnSale` flag flips to false and the item is re-snapshotted to standard pricing. Sale savings are lost.

**Design implication**: vehicle-change reprice is a *repricing event* that also picks up current sale state. Two things change simultaneously. The owner should be aware of this coupling. Recommend: accept as v1 behavior (staff will intuit "price refreshed"), document in CHANGELOG.

### 3C. Pattern to follow for vehicle reprice

The sale-pricing pattern tells us: snapshot is the source of truth once written; recomputation only happens on an explicit action (currently `RECALCULATE_VEHICLE_PRICES`). Vehicle reprice should follow the same model — actively mutate the snapshot on an action, don't attempt dynamic render-time resolution.

---

## Phase 4 — Pricing resolver

### 4A. Signature

`src/app/pos/utils/pricing.ts:13`:

```ts
function resolveServicePrice(
  pricing: ServicePricing,
  vehicleSizeClass: VehicleSizeClass | null
): number
```

Returns a single `number`. Switch statement over 5 canonical size_class values with per-size column lookups; each case falls back to `pricing.price` if the per-size column is null.

`resolveServicePriceWithSale` (L48) wraps this and adds `{ standardPrice, effectivePrice, isOnSale, saleSavings }`.

### 4B. No-match behavior

Graceful: if `pricing.is_vehicle_size_aware` is false OR `vehicleSizeClass` is null, returns `pricing.price`. Per-size column missing for a size-aware tier (e.g., service has sedan/truck/van set but no exotic column) → returns `pricing.price`. Never throws. Default case in switch also returns `pricing.price`.

### 4C. Per-unit and scope-tier behavior

The resolver itself does NOT know about per-unit or scope-with-qty. Those multipliers live in the reducer. `RECALCULATE_VEHICLE_PRICES` at `ticket-reducer.ts:433` explicitly skips items where `perUnitQty != null && perUnitPrice != null`:

```ts
if (item.perUnitQty != null && item.perUnitPrice != null) return item;
```

**This skip covers both cases:**
- Per-unit pricing_model services (e.g., "per headlight restoration $25") — size-invariant, correct to skip.
- Scope-tier services with `max_qty > 1` (e.g., "touchup paint, up to 3 panels") — these CAN be vehicle-size-aware. **Skipping them on reprice is a gap.**

The gap has been latent since `RECALCULATE_VEHICLE_PRICES` was written. The owner has not flagged a bug report yet, suggesting it's low-volume. But it's a real correctness issue worth addressing in v1 or flagging for v2.

### 4D. Resolver hardcoded switch (taxonomy coupling)

The `resolveServicePrice` switch (L21–34) hardcodes 5 `case` branches for the 5 size_class values. **This is outside Session 30's consolidation scope** (Session 30 handled array literals, not switch cases). If taxonomy grows to 6 values, this switch also needs a new case. Different shape of duplication, different fix — note for future.

---

## Phase 5 — Combo pricing and prerequisites

### 5A. Combo storage

`comboSourcePrimaryId: string | null` on TicketItem. When present, the item was added at a combo discount triggered by its parent (`parentItemId`). The combo price is stored in `unitPrice` directly — there's no separate `comboPrice` column. The combo amount is implicit (the difference between `standardPrice` and `unitPrice`).

### 5B. Reprice's combo handling (`ticket-reducer.ts:452-462`)

```ts
if (item.comboSourcePrimaryId && item.parentItemId) {
  const currentComboPrice = item.unitPrice;
  if (currentComboPrice <= effectivePrice) {
    effectivePrice = currentComboPrice;
    pricingType = 'combo';
  } else {
    comboSourceId = null;
  }
}
```

Behavior:
- Combo price is a **fixed dollar amount** from the parent's add-time suggestion. It doesn't vary with vehicle size.
- On reprice: if the new size-adjusted effective price is > current combo price, keep combo. Otherwise the new (lower) price wins and comboSourcePrimaryId is cleared.

Handled correctly. No changes needed.

### 5C. Prerequisite handling

Prerequisites are evaluated at ADD time via `usePrerequisiteCheck` (`src/app/pos/hooks/use-prerequisite-check.ts`). The result is snapshotted to `prerequisiteNote` and `prerequisiteForServiceId` on the TicketItem.

`RECALCULATE_VEHICLE_PRICES` does NOT touch prerequisite fields — it preserves them. Correct: changing the vehicle doesn't change whether the primary service was on the ticket when the prereq'd addon was added.

**Edge case**: if new vehicle size makes the primary service ineligible (e.g., "ceramic coating only for sedan/truck/SUV, not classic"), the already-added prereq'd addon stays with its "prereq met" note. This is a catalog-config concern, not a reprice concern. Flag as out-of-scope for v1.

---

## Phase 6 — Edge cases

Verdict column: **v1** = must handle in first ship; **v2** = known limitation, document; **OOS** = out of scope for this refactor.

| # | Case | Current behavior | Desired on reprice | Verdict |
|---|---|---|---|---|
| a | New vehicle has no matching size_class tier for a service | Resolver falls back to `pricing.price` silently | Same — accept fallback | v1 (works as-is, but toast "N prices refreshed" after reprice is a UX nice-to-have) |
| b | Tier deleted from DB between add-time and reprice | Item unchanged (tier lookup returns undefined, reducer short-circuits) | Same — preserve stale snapshot | v1 (rare; acceptable) |
| c | Payment in flight (card authorize pending) | No protection — reprice would fire during checkout | Block vehicle change or skip reprice for ticket in payment state | v1 (must check payment-state flag before reprice) |
| d | Receipt already printed | Post-checkout; `CLEAR_TICKET` fires. No live state to reprice. | No-op | v1 (no change needed; already safe) |
| e | Combo child reprices when primary reprices | Handled correctly (lowest-wins comparison) | Same | v1 (already works) |
| f | Sale window expired between add and reprice | Sale snapshot is cleared; item flips to standard pricing | Same — document the coupling | v1 (accept behavior, note in CHANGELOG) |
| g | Service deactivated mid-ticket | Cached `service` from services catalog may be stale; if tier still present, reprice works; if service removed from catalog, item unchanged | Same | v1 (acceptable) |
| h | Item has per-unit qty > 1 | Skipped (L433) — per-unit is size-invariant | Same | v1 (correct) |
| i | Scope-tier with `max_qty > 1` that IS vehicle-size-aware | **Currently skipped — gap** | Should reprice: multiply resolved size price by qty | **v1 (real gap to fix; small delta to `RECALCULATE_VEHICLE_PRICES`)** |
| j | Custom price override (from specialty gate modal) | No flag distinguishes custom-priced items; reprice would OVERWRITE the custom price | Honor override (owner's lean) | **v1 (add an `isCustomPrice: boolean` flag to TicketItem, skip in reprice)** |

### 6A. Critical v1 items

- **(c)** Payment-in-flight protection. Simplest fix: disable the Edit-Vehicle button while any checkout dialog is open, OR skip reprice inside the reducer when an `isPaymentInFlight` flag is set on TicketState. Either works; the former is more conservative.
- **(i)** Scope-tier-with-qty-and-size-aware reprice. Loosen the L433 skip: `if (item.perUnitQty != null && item.perUnitPrice != null && !pricingTier.is_vehicle_size_aware) return item;`. Plus update multiplier logic to apply qty to the resolved size-specific price.
- **(j)** Custom-price preservation. Add `isCustomPrice: boolean` (or a nullable `customPriceBase: number`) to TicketItem. Set true in ADD_SERVICE's customPrice branch (L169). Skip in reprice.

---

## Phase 7 — Implementation shapes

### Shape A — Collapse SET_VEHICLE + RECALCULATE_VEHICLE_PRICES into one atomic action

**Change:**
- Modify `SET_VEHICLE` action signature: `{ vehicle: Vehicle | null; services: Service[] }` (second param becomes required).
- Reducer's `SET_VEHICLE` case runs existing reprice logic inline (merge L424–480 into L420–422).
- Remove `RECALCULATE_VEHICLE_PRICES` action.
- Update 8 dispatch sites across `ticket-panel.tsx` and `quote-ticket-panel.tsx` to pass `services` (already in scope at every site via `useCatalog()`).

**Handles edge cases cleanly:**
- (i) by extending the inline reprice to scope-tier-with-qty-aware items.
- (j) by skipping when `item.isCustomPrice === true` (requires TicketItem flag addition).
- (c) by adding a payment-in-flight check inside the reducer.

**Effort:** 3–4 hours. Biggest work is updating 8 dispatch sites + reducer changes + test updates.

**Risk:** Low. The reducer change is additive (fold reprice into SET_VEHICLE). Risk is missing a dispatch site — but grep-verifiable: `grep -rn "SET_VEHICLE" src/` should return exactly N sites, each passing `services`.

**Why this is better than the prompt's Shape A:** the prompt's Shape A ("add REPRICE_TICKET, trigger from SET_VEHICLE") assumes no existing infrastructure. We already have `RECALCULATE_VEHICLE_PRICES` — rewriting it as `REPRICE_TICKET` is wasted work. Collapsing is the minimal change that removes the footgun.

### Shape B — Helper wrapper, preserve current reducer API

**Change:**
- Add `setVehicleAndReprice(dispatch, vehicle, services)` helper in a new util.
- Helper dispatches SET_VEHICLE then RECALCULATE_VEHICLE_PRICES.
- Update 8 call sites to use helper instead of raw dispatch.
- Keep both actions in the reducer.

**Pro:** Preserves reducer API, backward-compatible.

**Con:** The footgun remains — a new dispatch site written by a future developer could still call `dispatch({ type: 'SET_VEHICLE', ... })` directly and forget the reprice. The structural bug class isn't eliminated.

**Effort:** 2–3 hours.

**Risk:** Same as Shape A, plus the preserved footgun.

**Handles edge cases:** same as Shape A if the helper is the canonical entrypoint. Edge cases (c), (i), (j) still require the same reducer/data-model changes.

### Shape C — Fully dynamic resolution at render time

**Change:** Remove snapshotted prices from TicketItem. Resolve in render layer every time (`ticket-item-row.tsx`, `ticket-totals.tsx`, receipts, payment totals).

**Cost:** TicketItem model change; every consumer of snapshot fields must be updated. Receipts, transaction_items table writes at checkout, held-ticket persistence — all would need to re-resolve from canonical source at read time.

**Effort:** 15–25 hours. Touches data serialization (held tickets stored in localStorage/DB persist snapshots; dropping snapshot means re-resolving on restore, which is impossible if catalog has changed).

**Risk:** High. The hybrid snapshot+reference model exists for reasons (catalog-change immunity, held-ticket integrity, receipt reproducibility).

**Verdict:** Not justified for this problem. Reject.

---

## Phase 8 — Recommendation

### Ranked

| # | Shape | Effort | Risk | Eliminates bug class | Recommended |
|---|---|---|---|---|---|
| 1 | **A — Collapse into one action** | 3–4h | Low | **Yes** — impossible to dispatch SET_VEHICLE without reprice | ✅ |
| 2 | B — Helper wrapper | 2–3h | Low | No — footgun remains | Fallback if A's API change is undesirable |
| 3 | C — Fully dynamic | 15–25h | High | Different architecture | Reject |

### Recommended: Shape A

**Evidence:**
- 8 SET_VEHICLE dispatch sites total; 2 already pair with RECALCULATE correctly, 1 is the active gap (ticket-panel.tsx:681), 3 are vehicle-clear paths (vehicle = null, reprice meaningless but harmless), 2 are category-change paths where services are pre-removed (reprice moot).
- `RECALCULATE_VEHICLE_PRICES` is already a fully-working reducer case with combo/sale/per-unit/prereq awareness. Reuse, don't rewrite.
- Collapsing the two actions into one removes the possibility of future dispatch sites forgetting the reprice — the entire class of bugs the user is reporting disappears structurally.
- Current `services` catalog is already in scope at every dispatch site (both panels use `useCatalog()` hook). Passing `services` as a param is trivial.
- Mechanical grep-verifiable fix; risk is only "did we miss a dispatch site" which is one `grep -rn "SET_VEHICLE"` away from certainty.

### In-scope for v1 (3 required)

1. Collapse SET_VEHICLE + RECALCULATE_VEHICLE_PRICES (Shape A).
2. Fix Phase 6 edge case (c) — block vehicle change / skip reprice during payment-in-flight.
3. Fix Phase 6 edge case (j) — add `isCustomPrice` flag to TicketItem; skip custom-priced items in reprice.

### Deferrable to v2 (documented limitations)

- Edge case (i) — scope-tier-with-qty that's vehicle-size-aware. Extend reprice to handle. Medium complexity; ship v1 without it and monitor whether real tickets hit this.
- `resolveServicePrice` switch-statement taxonomy coupling (Phase 4D). Out of scope for this refactor; different consolidation target.
- Cross-session vehicle edit sync (Phase 1D) — admin edit vs open POS. Out of scope.

### Test strategy

Existing tier tests in `src/app/pos/components/__tests__/` and `src/app/pos/utils/__tests__/pricing.test.ts` don't directly test `RECALCULATE_VEHICLE_PRICES`. A focused test file `src/app/pos/context/__tests__/ticket-reducer-vehicle-change.test.ts` should cover:
- sedan→exotic swap repricing (5-value taxonomy must work; uses `VEHICLE_SIZE_CLASS_KEYS`)
- sedan→classic swap
- swap with no-matching-tier fallback (uses `pricing.price`)
- swap preserving combo
- swap with expired sale
- swap skipping per-unit items
- swap skipping custom-priced items
- swap with scope-tier-qty-and-size-aware (v1 or v2 fixture)

Estimated 8–10 new tests. All should reference `VEHICLE_SIZE_CLASS_KEYS` from `src/lib/utils/constants.ts` — no hardcoded arrays per the prompt's constraint and Session 30 consolidation.

### Final sentence

**Ship Shape A. Reuse `RECALCULATE_VEHICLE_PRICES` logic inline under a unified `SET_VEHICLE`. Add `isCustomPrice` to TicketItem. Gate during payment-in-flight. Expected ship: 3–4 hours including the test suite.**

---

## Appendix — verified source references

All line numbers are current as of HEAD `2a5a8619` (post-Session-30).

- Reducer actions: `src/app/pos/context/ticket-reducer.ts:420` (SET_VEHICLE), `:424-480` (RECALCULATE_VEHICLE_PRICES)
- Quote mirror: `src/app/pos/context/quote-reducer.ts:354, :358`
- TicketItem type: `src/app/pos/types.ts:14-43`
- ADD_SERVICE: `ticket-reducer.ts:114`, custom-price branch at `:169-199`
- Resolver: `src/app/pos/utils/pricing.ts:13` (`resolveServicePrice`), `:48` (`resolveServicePriceWithSale`)
- Sale utilities: `src/lib/utils/sale-pricing.ts`
- Prerequisites: `src/app/pos/hooks/use-prerequisite-check.ts`
- Dispatch sites: `ticket-panel.tsx:{259, 274, 280, 320, 333, 681}`, `quote-ticket-panel.tsx:{108, 113, 142, 155}`
- Canonical size_class: `src/lib/utils/constants.ts:VEHICLE_SIZE_CLASS_KEYS` (Session 30)
