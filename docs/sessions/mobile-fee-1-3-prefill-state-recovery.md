# Phase Mobile-1.3 — Pre-fill state recovery

> Bug fix on top of Phase Mobile-1.2 (`0633be08`). No schema changes,
> no API contract changes, no new endpoints. Single-line behavioral
> fix to the picker's pre-fill effect plus a debug-log cleanup.

## The wedged-flag bug

Phase Mobile-1.2 introduced the `addressWasAutoPrefilled` state flag
to distinguish auto-prefilled values from user-typed values across
customer swaps. The flag transitions in 1.2:

- TRUE: effect writes `customerProfileAddress` (Case 2), or toggle
  handler's `seedFromProfile` branch fires
- FALSE: cashier types, pastes, clears, or toggles mobile off

Dev UAT after 1.2 surfaced a Path-2 regression (cashier clicks the
phone in the customer summary, picks a new customer without first
clicking the X to clear). Static analysis ruled out the obvious
suspects:

| Suspected cause | Verdict |
|---|---|
| Different dispatch action on Path 2 | False — both paths use `SET_CUSTOMER`. |
| Reducer mutates in place | False — `quote-reducer.ts:361-363` produces a new state via spread. |
| `quote.customer` reference identity unchanged | False — different object on every dispatch. |
| `customerProfileAddress` recomputation skipped | False — inline const, recomputed every render. |

The root cause is in the picker's mount-time state initialization:

```ts
const [addressWasAutoPrefilled, setAddressWasAutoPrefilled] = useState(false);
```

When the picker mounts with `value.isMobile=true` AND a non-empty
`value.address` that already equals `customerProfileAddress` (a
realistic state for loaded quotes or any flow that re-mounts the
picker with a prior pre-fill saved in `quote.mobile.address`), the
flag starts at `false`. The Phase 1.2 effect's Case 2 only set the
flag to true when `fieldIsEmpty || addressWasAutoPrefilled` — neither
true at mount in this case — so the flag stayed `false`. A
subsequent customer swap to a no-profile-address customer then hit
Case 1 with `addressWasAutoPrefilled=false`, skipping the clear.

Path 1 worked around this incidentally: clicking the X dispatches
`SET_CUSTOMER null` + `SET_VEHICLE null`, so by the time the
subsequent customer pick fires, the picker had observed
`customerProfileAddress=null` → re-rendered with the cleared value
(or, if the field had been auto-prefilled, the clear branch had
already fired). The next pick then hit `fieldIsEmpty=true` and set
the flag correctly. Path 2 skipped the intermediate null state.

## Fix

Extend Case 2's conditional in the pre-fill effect to also treat
"value already matches profile" as auto-prefill state:

```ts
// before (Phase 1.2)
if (fieldIsEmpty || addressWasAutoPrefilled) {

// after (Phase 1.3)
if (
  fieldIsEmpty ||
  addressWasAutoPrefilled ||
  value.address === customerProfileAddress
) {
```

When the field's value already mirrors the customer's profile,
mark the flag as auto-prefilled. The next swap will then clear or
overwrite as expected.

This is **safe under user-typed input**: if the cashier typed an
address that happens to be identical to the customer's profile,
treating it as auto-prefill (overwritten/cleared on swap) loses no
unique information — the field was already showing the customer's
canonical address.

Applied identically to:

- `src/app/pos/components/quotes/mobile-fee-picker.tsx` (POS picker
  effect)
- `src/components/booking/step-service-select.tsx` (online booking
  effect)

The booking flow's `useState` lazy initializer was simplified to
`useState(false)` — the effect's matching-at-mount recovery now
handles all initialization correctly, so the conditional initializer
was redundant and harder to reason about than necessary.

## Bug 2 truth table — extended

| New customer's profile | Current field | Prior value was auto-prefill | Field equals profile | Action |
|---|---|---|---|---|
| has address | empty | n/a | n/a | pre-fill new address |
| has address | non-empty | true | n/a | overwrite with new address |
| has address | non-empty | false | **true** | **mark as auto-prefill, overwrite** (Phase 1.3 row) |
| has address | non-empty | false | false | preserve typed value |
| no address | empty | n/a | n/a | nothing to do |
| no address | non-empty | true | n/a | clear the field |
| no address | non-empty | false | **true** | **mark as auto-prefill, clear** (Phase 1.3 row) |
| no address | non-empty | false | false | preserve typed value |

Practically: the "field equals profile" cases are unreachable
without the Phase-1.3 fix; pre-1.3 they fell into the "preserve
typed value" rows and produced the wedged-state bug.

## Test coverage

Added 2 new tests in
`src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx`:

- *Phase 1.3: when picker mounts with value.address already matching
  profile, swap to no-profile clears (loaded-quote scenario)* —
  reproduces the exact production-failure shape that motivated this
  phase.
- *Phase 1.3: matching-at-mount also recovers the overwrite path on
  swap to a different profile* — verifies symmetric correctness on
  the overwrite branch, not just the clear branch.

722 vitest tests pass (up from 720 in Phase 1.2).

## Debug log cleanup

The interim `[MOBILE_DEBUG]` instrumentation (one log per render and
one per effect-fire in `mobile-fee-picker.tsx`, plus a parent-render
log and a handleSelectCustomer log in `quote-ticket-panel.tsx`) is
removed. `grep -rn MOBILE_DEBUG src/` returns zero matches.

## Files changed

```
src/app/pos/components/quotes/mobile-fee-picker.tsx           (+~6, -~25 — fix + 5 debug logs)
src/app/pos/components/quotes/quote-ticket-panel.tsx          (-~22 — 2 debug logs)
src/components/booking/step-service-select.tsx                (+~6, -~12 — fix + initializer simplified)
src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx (+~50 — 2 new tests)
docs/sessions/mobile-fee-1-3-prefill-state-recovery.md        (this file)
docs/dev/FILE_TREE.md                                         (session doc entry)
docs/CHANGELOG.md                                             (entry)
```

## Out of scope

- Schema / API contract / endpoint changes (none).
- Permission-gate audit for customer edit endpoints (still deferred
  from Phase 1.2 — see that doc).
- Voice agent + admin-new mobile paths (still deferred from Phase 1).
- Receipt rendering changes.

## Reference

- Phase Mobile-1 — `7056becd` — original mobile_fee materialization.
- Phase Mobile-1.1 — `35cb2127` — pre-fill + save-to-customer + mandatory validation.
- Phase Mobile-1.2 — `0633be08` — UAT bug fixes (this phase's parent).
- Phase Mobile-1.3 — this commit — pre-fill state recovery.
