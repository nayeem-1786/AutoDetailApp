# POS Customer-Type Pill — Sale vs Quotes Parity + Persistence Audit (2026-05-28)

> Read-only diagnostic. No source/migration/test changes. Live read-only SELECT only.
> Branch: `audit/pos-customer-type-pill-sale-vs-quotes-parity`. Isolated `git worktree` off `origin/main` (`6b40fa14`).
> Fourth Sale-vs-Quotes parity gap surfaced today (after prereq browse-path context, register-tab no-check, add-on gating). Sibling to `POS_SALE_VS_QUOTES_PARITY_AUDIT.md`.

## Context

The customer-type pill (Unknown / Enthusiast / Professional) cycles correctly in the Sale POS but, in Quotes, tapping it shows a "Customer type cleared" toast instead of cycling. Secondary question: does the pill persist to `customers.customer_type`, or is it UI-only?

## TL;DR

**Root cause = a missing prop, classification (c) "half-built wiring"** (same Quotes-immaturity *family* as the prior parity gaps, but a different mechanism — not the prereq "wrong-context read"). The pill (`CustomerTypeBadge`) is a **shared** component mounted via `CustomerVehicleSummary` in both surfaces. On tap it PATCHes the customer record and then calls `onTypeChanged(newType)` so the host can update its **local** customer state. The **Sale** mount wires `onCustomerTypeChanged={handleCustomerTypeChanged}` (`ticket-panel.tsx:413`), which dispatches `SET_CUSTOMER` with the new `customer_type` (`:357-360`) — so the badge re-renders with the fresh value and the cycle advances. The **Quotes** mount **omits `onCustomerTypeChanged` entirely** (`quote-ticket-panel.tsx:830-840`), so `onTypeChanged` is `undefined` (a no-op, `customer-type-badge.tsx:70`). The PATCH still persists, but the quote's local `customer.customer_type` is never updated → the badge keeps rendering the **stale initial value** → every tap recomputes `nextType` from the same value, repeating one transition instead of cycling. The operator saw "cleared" because their test customer was already `professional` (`nextType(professional) = null`, `customer-type-badge.tsx:28-32` → toast at `:75`).

**Persistence: YES in both surfaces** — the shared badge PATCHes `/api/pos/customers/[id]/type`, which updates `customers.customer_type` directly and writes an audit row (`route.ts:38-69`). So the pill is a **global, permanent change to the customer record** (reflected in Admin → Customers), not quote/ticket-scoped. **Data-integrity hazard in Quotes:** because the UI shows stale state, an operator tapping a `professional` customer's pill in a quote silently persists `customer_type = null` (demotes them) on the first tap while the pill still reads "Professional" — and repeated taps just re-persist the same value; the operator can never reach `enthusiast` via the quote.

**Fix:** mirror Sale — add a `handleCustomerTypeChanged` to `quote-ticket-panel.tsx` that dispatches `SET_CUSTOMER` with `{ ...quote.customer, customer_type: newType }`, and pass it as `onCustomerTypeChanged`. The quote-reducer already supports `SET_CUSTOMER` (`quote-reducer.ts:361`), so **no reducer change** is needed. Blast radius: **1 file, ~3 lines.** **Bundle recommendation: ride along in the same Quotes-parity fix session as an independent small commit** — it's thematically identical (Quotes parity) but does NOT use the prereq/gating shared add-with-validation helper (different code area), so it's a separate change, not part of that helper.

## Target 1 — Sale pill mechanism (the reference)

- Pill component: `CustomerTypeBadge` (`customer-type-badge.tsx:45-117`). Cycle order `null → enthusiast → professional → null` (`nextType`, `:27-32`).
- On tap, `handleToggle` (`:54-82`): computes `newType`, PATCHes `/api/pos/customers/${customerId}/type` (`:61-65`), and on success calls `onTypeChanged?.(json.data?.customer_type ?? newType)` (`:70`) + a toast (`:72-76`).
- Mounted via `CustomerVehicleSummary` (`customer-vehicle-summary.tsx:79-83`), which forwards `onTypeChanged={onCustomerTypeChanged}`.
- Sale host wires it: `ticket-panel.tsx:413` `onCustomerTypeChanged={handleCustomerTypeChanged}`; the handler (`:357-360`) `dispatch({ type: 'SET_CUSTOMER', customer: { ...ticket.customer, customer_type: newType } })`. So Sale updates ticket-local customer state → the badge re-renders with the new value → next tap advances the cycle. **Persists (PATCH) AND syncs local UI.** ✓

## Target 2 — Quotes pill behavior + the toast source

- Same shared `CustomerVehicleSummary` → `CustomerTypeBadge`, mounted at `quote-ticket-panel.tsx:830`.
- The toast is `toast.info('Customer type cleared')` at `customer-type-badge.tsx:75` — fired whenever `newType === null`, i.e. cycling from `professional`.
- **The defect (file:line):** the Quotes `CustomerVehicleSummary` (`quote-ticket-panel.tsx:830-840`) passes `customer`, `vehicle`, `onChangeCustomer`, `onChangeVehicle`, `onClear` — but **not `onCustomerTypeChanged`**. Contrast Sale (`ticket-panel.tsx:413`). With `onTypeChanged` undefined, the badge's `onTypeChanged?.(...)` (`:70`) is a no-op, so the quote's local `customer.customer_type` never updates. The PATCH succeeds (persists), but the badge re-renders from the stale prop and every tap repeats the same single transition (and toast). The "cleared" the operator sees = their customer was already `professional`.

## Target 3 — Root cause classification

**(c) half-built wiring.** The shared pill is mounted in Quotes but its state-sync callback (`onCustomerTypeChanged`) was never wired, even though the quote-reducer supports the needed `SET_CUSTOMER` action. It is **not** (a) the prereq browse-path "wrong-context read" (the badge reads the correct quote customer; it just can't write back to local state), and **not** (b) a quote-specific handler with genuinely different logic (there is no quote handler at all). Same *family* as the prior Quotes parity gaps (a less-mature surface missing wiring Sale has), different *mechanism* (omitted prop vs wrong context vs absent check).

## Target 4 — Persistence (both surfaces)

- **Endpoint:** `PATCH /api/pos/customers/[id]/type` (`route.ts`) validates `customer_type` against `CUSTOMER_TYPES` (`:19`), updates `customers.customer_type` directly (`:38-42`), and writes an audit-log row (`:65-69`). Returns the updated row.
- **Sale:** persists ✓ and updates local UI ✓.
- **Quotes:** persists ✓ (the PATCH fires from the shared badge) but local UI does **not** update ✗ → stale display + repeated toast.
- **Live DB (observation only):** `customer_type` is actively populated — 732 `enthusiast`, 285 `professional`, 370 `null` (Unknown). The pill is a real write to the permanent record.
- **Hazard:** the pill mutates the customer's **global** classification (not quote/ticket-scoped) + an audit row on every tap. In Quotes, the stale UI means an operator can unknowingly demote a `professional` customer to `null` (first tap persists `null` while the pill still shows "Professional"), and can never reach `enthusiast` via the quote. This is a data-integrity concern independent of the cosmetic cycling bug.

## Target 5 — Fix plan + bundle-or-separate

**Fix (mirror the Sale reference):** in `quote-ticket-panel.tsx`, add
```ts
function handleCustomerTypeChanged(newType: CustomerType | null) {
  if (quote.customer) dispatch({ type: 'SET_CUSTOMER', customer: { ...quote.customer, customer_type: newType } });
}
```
and pass `onCustomerTypeChanged={handleCustomerTypeChanged}` to `CustomerVehicleSummary` (`:830`). **No reducer change** — `quote-reducer.ts:361` already handles `SET_CUSTOMER`. Blast radius: **1 file, ~3 lines.** Preserves the Sale path (untouched).

**Bundle vs separate:** **bundle into the same Quotes-parity fix session, as an independent small commit.** It is thematically identical (Quotes surface missing wiring Sale has) but does **not** share the prereq/gating add-with-validation helper (different code area — customer summary, not service-add), so it is not part of that refactor — just a sibling fix shipped alongside. (This revises the earlier "separate session" lean: the change is too small to warrant its own session, and grouping the Quotes-parity fixes is cleaner for review/testing.)

**Optional hardening (operator decision):** given the pill is a global, audited, permanent record change, consider a confirm step or a clearer affordance so a stray tap doesn't silently promote/demote a customer — relevant to both surfaces, not just Quotes.

## Target 6 — Regression-locking test

- A per-mount cycling test: render the badge in a Sale mount and a Quotes mount, tap three times, assert the displayed value advances `Unknown → Enthusiast → Professional → Unknown` (i.e. `onCustomerTypeChanged` is wired and local state updates) — this fails today for Quotes.
- A persistence assertion: tapping fires the PATCH to `/api/pos/customers/[id]/type` with the expected `customer_type`.
- A structural guard worth adding (catches the whole sibling class): assert both `ticket-panel` and `quote-ticket-panel` pass the same callback prop set to `CustomerVehicleSummary` (parity of shared-component props across surfaces).

## Open questions for the operator

1. **Intended scope of the pill:** is tapping it meant to change the customer's **permanent** classification globally (current behavior — writes `customers.customer_type` + audit), or should it be ticket/quote-scoped? This affects whether a confirm step is warranted.
2. **Bundle confirmation:** ship this ~3-line fix in the same Quotes-parity PR as the prereq/gating work (recommended), or as its own tiny PR?
3. **Demotion exposure:** any customers possibly mis-set via the Quotes stale-state bug that should be reviewed? (The audit log on `customers` would show `action:'update'` rows from POS.)

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ No DB writes — one observational `SELECT` (customer_type distribution).
- ✅ file:line for every claim; Sale (reference) vs Quotes mounts compared explicitly.
- ✅ Reuse-over-duplication: fix is wiring the existing shared component/reducer, not forking.
- ✅ Worktree isolation off `origin/main`.
