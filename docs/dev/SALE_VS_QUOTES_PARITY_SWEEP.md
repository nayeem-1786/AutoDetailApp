# POS Sale vs Quotes — Shared-Component Parity Sweep (2026-05-28)

> Read-only diagnostic SWEEP. No source/migration/test changes.
> Branch: `audit/sale-vs-quotes-shared-component-parity-sweep`. Isolated `git worktree` off `origin/main` (`22209285`, the customer-type pill audit merge).
> Fifth Sale-vs-Quotes artifact today. The prior four each found ONE gap by stumbling onto a symptom; this sweep deliberately enumerates ALL of them in one pass so the upcoming fix arc is the last one.

## Context — the recurring pattern across four audits

Quotes was built as a **partial copy of Sale** and never reached full parity. Every prior audit found the same shape from a different angle:

1. `POS_PREREQUISITE_PRICING_AUDIT.md` (#112/#113) — prereq auto-add hard-picked `prereqPricing[0]` (gap shape **d**, wrong-args). **Fixed** via `selectPricingTierForVehicle`.
2. `POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md` — `register-tab` favorites dispatch `ADD_SERVICE` with zero prereq check; add-on-only gating never built anywhere (gap shape **c**, absent path).
3. `POS_SALE_VS_QUOTES_PARITY_AUDIT.md` — quote **browse** view delegates to `<CatalogBrowser>`, whose prereq check is hardwired to `useTicket()` = the Sale ticket, not the quote (gap shape **a**, wrong-context).
4. `POS_CUSTOMER_TYPE_PILL_PARITY_AUDIT.md` — quote mount of `CustomerVehicleSummary` omits `onCustomerTypeChanged` (gap shape **b**, missing prop). **In-flight** (parallel fix session).

The four gap shapes used throughout this sweep:
- **(a) wrong context** — a shared component reads `useTicket()` while mounted in a Quotes surface.
- **(b) missing prop** — `quote-ticket-panel` omits a callback/prop that `ticket-panel` wires on the same shared component.
- **(c) absent path** — an entire handler / component / surfacing that Sale has and Quotes lacks.
- **(d) wrong args** — the call exists but is fed the wrong value (the now-fixed `prereqPricing[0]`).

## TL;DR

**7 components are mounted in BOTH panels.** Their callback props are NOT byte-for-byte: `CustomerVehicleSummary` alone has **3 prop deltas** in Quotes. Beyond shared-component props, Quotes is missing **4 distinct handler/surfacing paths** Sale has, and one **forked-twin** component (`quote-item-row`) has drifted from its Sale equivalent.

**Total: 1 Critical (in-flight) + 4 Significant + 1 Minor + several Informational (by-design) gaps.**

> **RESOLUTION STATUS (updated 2026-05-28):** G1 RESOLVED in #119 (pill fix). **G2/G3/G4 RESOLVED in #120 (Track B)** — `fix/track-b-quotes-panel-parity-wiring`. G5 remains OPEN (Track A — the `useValidatedServiceAdd` helper). G6 DEFERRED (Minor; needs a `RESTORE_ITEM` quote action + swipe restructure — out of Track B scope). A new CI **structural guard** (`src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx`) now blocks the whole prop-omission class.

| # | Gap | Shape | Severity | Status |
|---|-----|-------|----------|--------|
| **G1** | Customer-type **pill** — `onCustomerTypeChanged` omitted on quote `CustomerVehicleSummary` | b | **Critical** (silent demote/persist) | ✅ **RESOLVED #119** |
| **G2** | **Vehicle edit unreachable** in Quotes — `onEditVehicle` omitted + `editVehicle` never passed to `VehicleCreateDialog` + no `editingVehicle` state | b + c | **Significant** | ✅ **RESOLVED #120** |
| **G3** | **Reprice-failure fully silent** in Quotes — no panel toast watcher AND `quote-item-row` renders no `repriceFailed` badge (reducer sets the flag, nothing surfaces it) | c | **Significant** | ✅ **RESOLVED #120** |
| **G4** | **`CustomerTypePrompt` never shown** in Quotes — selecting/creating an unknown-type customer never prompts for classification | c | **Significant** | ✅ **RESOLVED #120** |
| **G5** | Quote **browse** prereq check runs against Sale-ticket context (`<CatalogBrowser>` `useTicket()`) | a | **Significant** | ⏳ OPEN — Track A (prior audit #3) |
| **G6** | **No swipe-to-delete + undo** in Quotes — `RESTORE_ITEM` unused; accidental remove auto-saves with no undo | c | **Minor** | ⏸ DEFERRED (#120 — Track B scope guard) |
| — | `disabled`, guest-checkout, edit-mode, `pos-vehicle-needed` gate, mobile/validity/draft | — | **Informational** (by-design) | n/a |

**Fix-arc shape:** TWO tracks. **Track A** = the `useValidatedServiceAdd` shared helper from prior audit #3 (covers G5 + add-on gating + register-tab no-check; code area = `catalog-browser` / `quote-builder` / `register-tab` + new hook). **Track B** = a single **Quotes-panel-parity** session that wires the props/handlers Sale already has (G1 in-flight, then G2/G3/G4, optionally G6; code area = `quote-ticket-panel.tsx` + `customer-vehicle-summary` wiring + `quote-item-row` + `vehicle-create-dialog`). The in-flight pill fix is the first commit of Track B; **this sweep's payload is the G2/G3/G4/G6 siblings the pill fix does NOT touch.** Add one structural guard test asserting both panels pass the same prop set to each shared component.

---

## TARGET 1 — Shared-component inventory

Components imported and mounted by **both** `src/app/pos/components/ticket-panel.tsx` (Sale) and `src/app/pos/components/quotes/quote-ticket-panel.tsx` (Quotes). (Note: the session prompt's path `src/app/pos/components/quote-ticket-panel.tsx` is one dir off — actual location is `…/components/quotes/quote-ticket-panel.tsx`.)

| Shared component | Import (Sale / Quote) | Mounted in Sale | Mounted in Quote | Props byte-identical? |
|---|---|---|---|---|
| `CustomerVehicleSummary` | `./customer-vehicle-summary` / `../customer-vehicle-summary` | `ticket-panel.tsx:401-421` | `quote-ticket-panel.tsx:830-842` | **NO — 3 deltas** |
| `CustomerLookup` | `./customer-lookup` / `../customer-lookup` | `:653-661` | `:1099-1107` | Props match; `onGuest` behavior differs (by design) |
| `CustomerCreateDialog` | `./customer-create-dialog` / `../customer-create-dialog` | `:666-675` | `:1112-1121` | Props match; `onCreated` handler differs (G4) |
| `VehicleSelector` | `./vehicle-selector` / `../vehicle-selector` | `:691-699` | `:1137-1145` | ✅ Identical |
| `VehicleCreateDialog` | `./vehicle-create-dialog` / `../vehicle-create-dialog` | `:706-722` | `:1152-1157` | **NO — `editVehicle` omitted (G2)** |
| `PrerequisiteRemovalDialog` | `./prerequisite-removal-dialog` / `../prerequisite-removal-dialog` | `:782-791` | `:1174-1183` | ✅ Identical |
| `ManagerPinDialog` | `./manager-pin-dialog` / `../manager-pin-dialog` | `:796-804` | `:1188-1196` | ✅ Identical (`permissionKey="pos.discount_override"`) |

**Sale-only mounts** (no quote counterpart): `CustomerTypePrompt` (`:739` — **G4**), `ServiceDetailDialog` (`:727`), `SwipeableCartItem`/`List`/`Wrapper` (`:443-477` — **G6**), and the **forked twins** below.

**Quote-only mounts:** `MobileFeePicker` (`:1012`), `QuoteSendDialog` (`:1162`), `SaveAddressDialog` (`:1229`).

**Forked twins** (NOT shared — separate files, same role, drift risk): `TicketItemRow`↔`QuoteItemRow`, `TicketTotals`↔`QuoteTotals`, `CouponInput`↔`QuoteCouponInput`, `LoyaltyPanel`↔`QuoteLoyaltyPanel`. These are a *second* parity-risk surface distinct from shared-component prop gaps — **G3's missing `repriceFailed` badge is exactly a forked-twin drift** (`ticket-item-row` has it, `quote-item-row` doesn't).

---

## TARGET 2 — Prop parity matrix (core deliverable)

`CustomerVehicleSummaryProps` interface: `customer-vehicle-summary.tsx:11-21` (`customer`, `vehicle`, `onChangeCustomer`, `onChangeVehicle`, `onClear`, `onCustomerTypeChanged?`, `onEditVehicle?`, `disabled?`).

| Component | Prop | Sale (ticket-panel) | Quotes (quote-ticket-panel) | Verdict |
|-----------|------|---------------------|------------------------------|---------|
| **CustomerVehicleSummary** | `customer` | `ticket.customer` (`:402`) | `quote.customer` (`:831`) | ✅ context-correct |
| | `vehicle` | `ticket.vehicle` (`:403`) | `quote.vehicle` (`:832`) | ✅ context-correct |
| | `onChangeCustomer` | wired (`:404`) | wired (`:833`) | ✅ |
| | `onChangeVehicle` | wired (`:405-411`) | wired (`:834-840`) | ✅ |
| | `onClear` | `handleClearCustomer` (`:412`) | `handleClearCustomer` (`:841`) | ✅ |
| | `onCustomerTypeChanged` | `handleCustomerTypeChanged` (`:413`) | **OMITTED** | ⚠ **G1** missing-prop — Critical — **in-flight** |
| | `onEditVehicle` | wired (`:414-419`) | **OMITTED** | ⚠ **G2** missing-prop → edit pencil never renders (`customer-vehicle-summary.tsx:116` gates on `onEditVehicle`) |
| | `disabled` | `checkoutOpen \|\| checkoutProcessing` (`:420`) | **OMITTED** (defaults `false`) | ℹ Informational — quotes have no checkout/payment; `false` is correct |
| **CustomerLookup** | `onSelect` | `handleSelectCustomer` (`:654`) | `handleSelectCustomer` (`:1100`) | ✅ prop present (handlers differ → G4) |
| | `onGuest` | `handleGuestCheckout` (`:655`) | `() => setCustomerLookupOpen(false)` (`:1101`) | ℹ different-handler — quotes need a customer; no true guest (by design) |
| | `onCreateNew` | wired (`:656-660`) | wired (`:1102-1106`) | ✅ |
| **CustomerCreateDialog** | `open`/`onClose`/`onBack`/`initialQuery` | wired (`:666-674`) | wired (`:1112-1120`) | ✅ |
| | `onCreated` | `handleCustomerCreated` (`:669`) | `handleCustomerCreated` (`:1115`) | ⚠ prop present but Sale's handler prompts type (G4); Quote's does not |
| **VehicleSelector** | `customerId`/`selectedVehicleId`/`onSelect`/`onAddNew` | `:692-698` | `:1138-1144` | ✅ Identical |
| **VehicleCreateDialog** | `open`/`onClose`/`customerId`/`onCreated` | `:707-720` | `:1153-1156` | ✅ |
| | `editVehicle` | `editingVehicle` (`:721`) | **OMITTED** | ⚠ **G2** — `isEdit=!!editVehicle` (`vehicle-create-dialog.tsx:52`) always `false` in Quotes → edit mode unreachable |
| **PrerequisiteRemovalDialog** | all 4 | `:783-790` | `:1175-1182` | ✅ Identical |
| **ManagerPinDialog** | all 3 | `:797-803` | `:1189-1195` | ✅ Identical |

---

## TARGET 3 — Context-reading sweep

**None of the 7 panel-mounted shared components read `useTicket()`** — all take customer/vehicle/items via props. `grep -rln useTicket src/app/pos/components/` lists `catalog-browser`, `register-tab`, `ticket-*`, checkout, etc., but **not** `customer-vehicle-summary`, `customer-lookup`, `customer-create-dialog`, `vehicle-selector`, `vehicle-create-dialog`, `prerequisite-removal-dialog`, or `manager-pin-dialog`.

**Conclusion:** the wrong-context (shape **a**) defect does **not** exist among the panel-level shared components. The only wrong-context shared component is **`catalog-browser`** (`:76-80` reads `useTicket()`), which is mounted by **`quote-builder`** (the service-add surface, `quote-builder.tsx:494`), **not** by `quote-ticket-panel`. That is **G5**, already documented in prior audit #3 and assigned to **Track A**. Override surface today: `catalog-browser` accepts `vehicleSizeOverride`/`vehicleSpecialtyTierOverride` (pricing only) but **no** `customerId`/`vehicleId`/`serviceIds` override, so its prereq check cannot see the quote's context — insufficient for Quotes' needs (confirms prior audit).

---

## TARGET 4 — Handler parity

Handlers/wiring present in `ticket-panel.tsx` with **no equivalent** in `quote-ticket-panel.tsx`:

| Sale handler / wiring | Sale file:line | Quote equivalent | Gap |
|---|---|---|---|
| `handleCustomerTypeChanged` (dispatch SET_CUSTOMER w/ new type) | `ticket-panel.tsx:357-361` | **none** | **G1** (in-flight) |
| `CustomerTypePrompt` mount + `showTypePrompt` state + prompt-on-select/create | mount `:738-750`; select `:279-281`; create `:295-297`; state `:77` | **none** — quote `handleSelectCustomer:480-484` / `handleCustomerCreated:486-490` only open the vehicle selector | **G4** |
| Reprice-failed toast watcher (`useEffect` on `ticket.items`, fires `toast.warning`) | `ticket-panel.tsx:123-143` | **none** | **G3** (panel half) |
| `editingVehicle` state + `onEditVehicle` wiring + edit-branch in `VehicleCreateDialog.onCreated` | state `:67`; wiring `:414-419`; branch `:710-720`; `editVehicle` `:721` | **none** | **G2** |
| Swipe-to-delete + undo (`handleSwipeRemove`/`handleSwipeUndo`, `RESTORE_ITEM` dispatch, undo toast) | `:188-273` | quote `handleRemoveItem:454-478` removes (with the prereq guard) but **no undo** | **G6** |
| `pos-vehicle-needed` listener + `pendingService` re-add | `:107-121`, `:311-318` | **none** — but **by design** (see below) | ℹ |
| `handleGuestCheckout` | `:285-289` | quote `onGuest` just closes (`:1101`) | ℹ by design |

**`pos-vehicle-needed` is intentional divergence, NOT a defect.** `catalog-browser.tsx:358-369` gates the customer+vehicle requirement behind `if (!onAddService)`. Quote mode passes `onAddService={handleAddService}` (`quote-builder.tsx:499`), so the gate is **deliberately skipped** — quotes are vehicle-optional (you quote before the exact vehicle is known; multi-tier pricing falls through to the picker). The absence of a `pos-vehicle-needed` listener in the quote panel is the correct consequence of that design, not a missing wire. Classified Informational.

**Note — prereq-removal guard reached parity.** Both panels replicate the dependent-check + `PrerequisiteRemovalDialog` (`ticket-panel.tsx:161-185` / `quote-ticket-panel.tsx:454-478`). This is the one cross-panel handler that was fully ported. (Sale additionally guards the *swipe* path `:198-212`; Quotes has no swipe — G6.)

---

## TARGET 5 — Reducer parity

Action-type unions (`ticket-reducer.ts` vs `quote-reducer.ts`):

| Ticket-only | Quote-only | Shared (20 common concerns) |
|---|---|---|
| `CLEAR_TICKET` | `CLEAR_QUOTE` | `ADD_SERVICE`, `ADD_PRODUCT`, `ADD_CUSTOM_ITEM`, `REMOVE_ITEM`, `UPDATE_ITEM_QUANTITY`, `UPDATE_ITEM_NOTE`, `UPDATE_PER_UNIT_QTY`, `SET_CUSTOMER`, `SET_VEHICLE`, `SET_COUPON`, `SET_LOYALTY_REDEEM`, `SET_NOTES`, `APPLY_MANUAL_DISCOUNT`, `REMOVE_MANUAL_DISCOUNT` |
| `ENTER_EDIT_MODE`, `EXIT_EDIT_MODE`, `MARK_EDIT_INITIAL_STATE` | `LOAD_QUOTE`, `SET_QUOTE_META` | |
| `RESTORE_ITEM`, `RESTORE_TICKET` | `SET_MOBILE`, `CLEAR_MOBILE`, `SET_VALID_UNTIL` | |

**No "Quotes-can't-even-respond" gap.** Every shared concern (add/remove/customer/vehicle/coupon/loyalty/discount/notes) exists in both. The asymmetries are explained:
- `CLEAR_TICKET` ≈ `CLEAR_QUOTE` — renamed equivalents, not a gap.
- `ENTER/EXIT_EDIT_MODE` + `MARK_EDIT_INITIAL_STATE` — Sale's job-edit model; Quotes use `LOAD_QUOTE` + auto-save/`SET_QUOTE_META` instead. Different architecture, not a missing capability.
- `RESTORE_ITEM`/`RESTORE_TICKET` — Sale undo (swipe-undo + held-ticket restore). Their absence in the quote reducer is the **reducer-level correlate of G6**: Quotes cannot undo a removal because the action does not exist.
- `SET_MOBILE`/`CLEAR_MOBILE`/`SET_VALID_UNTIL`/`LOAD_QUOTE`/`SET_QUOTE_META` — quote-only features (mobile fee, validity, draft persistence). Sale doesn't need them.

**Critically: both reducers handle `SET_CUSTOMER` and `SET_VEHICLE` identically.** So **none of G1–G4 require a reducer change** — the pill fix (G1), the customer-type prompt (G4), and vehicle-edit (G2) all dispatch existing `SET_CUSTOMER`/`SET_VEHICLE`. G3 needs no reducer change either (the `repriceFailed` flag is already set — `quote-reducer.ts:393-423`, mirroring `ticket-reducer.ts:523-553` — it just isn't surfaced). G6 alone would need a `RESTORE_ITEM` quote action.

---

## TARGET 6 — Severity-ranked gap list

### Critical (silent data corruption) — 1, in-flight
- **G1 — Customer-type pill** (`b`). `onCustomerTypeChanged` omitted on the quote `CustomerVehicleSummary` (`quote-ticket-panel.tsx:830-842` vs Sale `:413`). Pill PATCHes `customers.customer_type` globally but the quote's local state never updates → stale UI; an operator can silently persist `customer_type=null` (demote) on a `professional` customer and never reach `enthusiast`. Full analysis in `POS_CUSTOMER_TYPE_PILL_PARITY_AUDIT.md`. **Being fixed in the parallel session — do not re-investigate.**

### Significant (Quotes-broken feature that works in Sale) — 4
- **G2 — Vehicle edit unreachable** (`b`+`c`). `onEditVehicle` omitted on the quote summary → the edit pencil never renders (`customer-vehicle-summary.tsx:116` gates on the prop). `editVehicle` never passed to the quote `VehicleCreateDialog` (`:1152-1157`) → `isEdit` always `false` (`vehicle-create-dialog.tsx:52`). No `editingVehicle` state. **Effect:** an operator cannot correct a quote vehicle's `size_class` inline; the only path is re-selecting a different vehicle or editing in Admin — so a mis-sized vehicle silently mis-prices the quote with no in-quote fix.
- **G3 — Reprice failure fully silent** (`c`). On `SET_VEHICLE` to a size with no configured pricing, `quote-reducer.ts:393-423` sets `repriceFailed` and keeps the stale price — identical to `ticket-reducer.ts`. But Quotes surface it **nowhere**: no panel toast (Sale: `ticket-panel.tsx:123-143`) **and** `quote-item-row.tsx` renders no badge (Sale: `ticket-item-row.tsx:138-140`). **Effect:** changing a quote's vehicle to an unpriceable size silently keeps old prices on a customer-facing quote with zero operator signal. Two surfacing sites missing.
- **G4 — `CustomerTypePrompt` never shown** (`c`). Component is Sale-only (`ticket-panel.tsx:739`). Quote `handleSelectCustomer` (`:480-484`) and `handleCustomerCreated` (`:486-490`) skip the `if (!customer.customer_type)` prompt Sale does (`:279-281`, `:295-297`). **Effect:** selecting/creating an unknown-type customer in a quote never captures their classification — a data-capture parity gap with Sale (relevant to the same `customer_type` field G1 corrupts).
- **G5 — Quote browse prereq wrong-context** (`a`). `<CatalogBrowser>` in the quote browse view (`quote-builder.tsx:494`) runs its prereq check against `useTicket()` = the Sale ticket (`catalog-browser.tsx:76-80`), not the quote. Can under-fire (open Sale ticket already has the prereq → reads satisfied) or over-fire (empty Sale ticket). **Already documented** in `POS_SALE_VS_QUOTES_PARITY_AUDIT.md`; **Track A**.

### Minor — 1
- **G6 — No swipe-to-delete + undo in Quotes** (`c`). Quotes use `quote-item-row` (no swipe) + plain `handleRemoveItem`; `RESTORE_ITEM` doesn't exist in the quote reducer. Because quotes auto-save (`quote-ticket-panel.tsx:381-432`), an accidental removal is persisted on the next debounce with no undo safety net. Partly an intentional UX divergence (different item row), but the undo affordance is genuinely absent.

### Informational (Sale-only or Quote-only by design) — not gaps to close
- `disabled` prop on `CustomerVehicleSummary` (quotes have no checkout) · `onGuest`/guest-checkout (quotes need a customer) · `ENTER/EXIT_EDIT_MODE` (Sale job-edit vs quote load+autosave) · `pos-vehicle-needed` gate skipped in quotes (vehicle-optional by design, `catalog-browser.tsx:359`) · mobile/validity/draft actions (quote-only features).

### Cross-cutting (affect all surfaces, surfaced by prior audits — fold into Track A)
- **Add-on-only gating** never built on any surface (prior audit #2). · **`register-tab` favorites** have zero prereq check (prior audit #2/#3).

---

## TARGET 7 — Fix-arc recommendation

**Does the planned `useValidatedServiceAdd` helper (prior audit #3) cover most gaps? No — it covers only the service-add gaps.** It addresses **G5** + add-on gating + `register-tab` no-check (all in the `catalog-browser`/`quote-builder`/`register-tab` code area). It does **not** touch G1/G2/G3/G4/G6, which live in the customer-summary / panel / item-row / vehicle-dialog code area.

So the arc is **two cohesive tracks**, by code area:

### Track A — Service-add validation (the prior-audit helper)
- New `useValidatedServiceAdd({ customerId, vehicleId, serviceIds, dispatchOrCallback })` running add-on gate → `checkPrerequisites` (caller's context) → dispatch.
- Route Sale `catalog-browser` (behavior-identical, the reference), Quotes `quote-builder` (both views — **fixes G5**), and `register-tab` (gains the check) through it.
- Closes: **G5**, add-on gating, register-tab no-check. Blast radius: ~3 component files + 1 hook; reducers untouched. Sequence: extract from Sale first (prove green) → adopt in Quotes → adopt in register-tab.

### Track B — Quotes-panel parity ("Quotes was a partial copy")
One session wiring the props/handlers Sale already has, all in `quote-ticket-panel.tsx` + 3 sibling files. **No reducer changes** (Target 5):
1. **G1** (pill) — `handleCustomerTypeChanged` + pass `onCustomerTypeChanged`. **In-flight; first commit of this track.**
2. **G2** (vehicle edit) — add `editingVehicle` state, pass `onEditVehicle`, pass `editVehicle` to `VehicleCreateDialog`, branch its `onCreated` (mirror `ticket-panel.tsx:710-721`).
3. **G3** (reprice surfacing) — port the toast watcher (`ticket-panel.tsx:123-143`) into `quote-ticket-panel`, and the badge (`ticket-item-row.tsx:138-140`) into `quote-item-row`.
4. **G4** (customer-type prompt) — mount `CustomerTypePrompt`, add `showTypePrompt` state, call it from `handleSelectCustomer`/`handleCustomerCreated` (mirror Sale).
5. **G6** (undo) — optional; needs a `RESTORE_ITEM` quote action + swipe wiring or an undo-toast on plain remove. Lowest priority; defer unless operator wants it.

### Structural guard (do once, prevents the whole class)
Add a test asserting **both panels pass the same callback-prop set** to each shared component (`CustomerVehicleSummary` first — it's the repeat offender). This catches the next omitted-prop gap at CI time instead of in production.

**Sequencing:** Track B is small, self-contained, and review-friendly — land it as one PR (pill already in flight). Track A is the larger refactor and the prior port plan already scopes it. They touch disjoint code areas, so they can proceed in parallel.

---

## Open questions for the operator

1. **G6 (undo) priority:** worth adding swipe-to-delete + undo to Quotes, or accept that quote item-removal is immediate (no undo) by design? (Lowest-severity gap.)
2. **G4 (customer-type prompt) in Quotes:** should selecting an unknown-type customer in a quote prompt for classification (mirror Sale), or is type-capture intentionally a Sale-only moment?
3. **G2 (vehicle edit):** confirm operators expect to edit a vehicle's attributes (incl. `size_class`) from within a quote, not just swap to a different saved vehicle.
4. **Track ordering:** ship Track B (panel parity) before or alongside Track A (service-add helper)? They're independent.

## Verification of sweep hard rules

- ✅ No `src/` / migration / test changes — pure read-only sweep.
- ✅ file:line citation for every gap claim; Sale (reference) vs Quote mounts compared explicitly.
- ✅ Cross-referenced the four prior audits — G1/G5 cited as in-flight / prior-documented, not re-derived.
- ✅ The pill (G1) noted as in-flight, not re-investigated.
- ✅ Completeness over brevity — every shared component, every prop, both reducers enumerated.
- ✅ Worktree isolation off `origin/main` (`22209285`).
