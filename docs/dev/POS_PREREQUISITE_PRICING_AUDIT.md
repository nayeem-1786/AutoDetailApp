# POS Prerequisite Auto-Add Pricing Audit (2026-05-28)

> Read-only diagnostic audit. No source/migration/test changes were made.
> Branch: `audit/pos-prerequisite-autoadd-size-aware-pricing`

## Context

Operator bug report: In POS (walk-in / add-to-ticket), selecting an add-on
that has a prerequisite auto-adds the prerequisite service — but the
prerequisite is priced at a base/smallest amount, NOT the size-aware tier
price for the ticket's vehicle.

Reported repro: Vehicle = Suburban (a `suv_3row_van` top-size vehicle).
Add-on "Paint Correction Prep" (prerequisite: an Express wash OR Signature
Complete). Selecting it auto-added the prerequisite at **$75** (a
smaller-vehicle price) instead of **$110** (the Suburban-correct size-aware
price).

**Live-data note (see Live Data Sanity Check):** the operator's recollection
of the prerequisite's name was slightly off — the actual prerequisite on
"Paint Correction Prep" is **"Express Exterior Wash"** (not "Express
Interior"). But the reported numbers are exact: Express Exterior Wash is
`sedan = $75` (the first tier) and `suv_3row_van = $110` (the correct
Suburban tier). The bug reproduces precisely as described.

## TL;DR

**Root cause:** The prerequisite auto-add path hard-picks the **first**
pricing tier — `const tier = prereqPricing[0]` (`catalog-browser.tsx:279`,
and the identical `quote-builder.tsx:383`) — instead of selecting the tier
whose `tier_name` matches the ticket vehicle's `size_class`. For row-based
`vehicle_size` services, tier `[0]` (ordered by `display_order`) is always
the **sedan** tier, and each tier row has `is_vehicle_size_aware = false`, so
the canonical resolver returns that row's flat `.price` verbatim — the
sedan price — no matter what `size_class` is passed.

**Fix shape:** Replace the `prereqPricing[0]` pick with the same
matching-tier selection the normal-add path already uses
(`pricing.find((t) => t.tier_name === vehicleSizeClass)` — `catalog-browser.tsx:425`).
The vehicle `size_class` is already in scope at both injection points, so
this is a localized change. Ideally extract a canonical
`selectPricingTierForVehicle()` helper into `picker-engine.ts` and route all
four selection sites through it.

**Blast radius:** 2 lines across 2 files (POS ticket builder + POS quote
builder). The booking wizard has no prerequisite logic and is unaffected.
The data is correct (the $110 tier row exists) — this is 100% a code bug in
the injection path.

---

## The two pricing models (necessary background)

`service_pricing` supports two distinct size-pricing shapes, both resolved by
the canonical engine (`src/lib/services/picker-engine.ts`, per CLAUDE.md
Rule 22):

1. **Row-based** (`pricing_model = 'vehicle_size'`, the one in this bug):
   **multiple** `service_pricing` rows, one per size class, each with
   `tier_name ∈ {sedan, truck_suv_2row, suv_3row_van, exotic, classic}`, its
   price in the flat `price` column, and `is_vehicle_size_aware = false`. The
   **caller must select the correct row**; the resolver cannot, because it
   only receives one row.

2. **Column-based** (`is_vehicle_size_aware = true`): a **single**
   `service_pricing` row holding all size prices in
   `vehicle_size_*_price` columns. The caller passes that one row + the
   `size_class`, and `resolveServicePrice` reads the right column
   (`picker-engine.ts:45-58`).

`resolveServicePrice` (`picker-engine.ts:37-59`):

```ts
export function resolveServicePrice(pricing, vehicleSizeClass): number {
  if (!pricing.is_vehicle_size_aware || !vehicleSizeClass) {
    return pricing.price;            // ← row-based tiers ALWAYS hit this branch
  }
  switch (vehicleSizeClass) { /* reads vehicle_size_*_price columns */ }
}
```

For a row-based tier, `is_vehicle_size_aware` is `false`, so the resolver
short-circuits to `pricing.price`. **Whatever single row the caller hands
in, that row's `.price` is what you get.** Hence row selection is entirely
the caller's responsibility — and that is exactly what the prerequisite path
gets wrong.

---

## Path A — Correct pricing (normal service add)

When an operator taps a row-based `vehicle_size` service for a known
vehicle, the matching tier is selected **before** dispatch:

**POS ticket — `src/app/pos/components/catalog-browser.tsx:420-436`**
```ts
if (vehicleSizeClass) {
  const isVehicleSizeTiers = pricing.length > 1
    && pricing.every((t) => VEHICLE_SIZE_CLASSES.has(t.tier_name));
  if (isVehicleSizeTiers) {
    const matchingTier = pricing.find((t) => t.tier_name === vehicleSizeClass); // ← selects correct row
    if (matchingTier) {
      quickAdd(service, matchingTier, vehicleSizeClass, ...);  // dispatches matchingTier
      return;
    }
  }
  if (pricing.length === 1 && pricing[0].is_vehicle_size_aware) { /* column-based */ }
}
```

The dispatched `ADD_SERVICE` reaches the reducer, which resolves price at
`src/app/pos/context/ticket-reducer.ts:270`:
```ts
const resolved = resolveServicePriceWithSale(pricing, vehicleSizeClass, saleWindow);
```
Because `pricing` is now the `suv_3row_van` row (`price = $110`), the line
lands `$110` into the ticket item's `unitPrice` / `totalPrice`
(`ticket-reducer.ts:290-301`) and `tierName` = "SUV (3-Row) / Van"
(`:304`).

The same correct selection exists in:
- **POS favorites/register** — `src/app/pos/components/register-tab.tsx:152-159`
  (`matchingTier = pricing.find((t) => t.tier_name === vehicleSizeClass)`).
- **Canonical engine** — `routeServiceTap` at
  `src/lib/services/picker-engine.ts:212-225`
  (`matchingTier = pricing.find((t) => t.tier_name === vehicleSizeClass)`).
- **Booking wizard** — `src/components/booking/step-service-select.tsx:219,283`
  (`tiers.find((t) => t.tier_name === vehicleSizeClass)`).
- **POS quote builder (manual add)** — non-trivial multi-tier services fall
  through to the picker dialog (`quote-builder.tsx:346`, `handlePricingSelect`
  at `:349`), where the operator selects the correct tier.

## Path B — Buggy pricing (prerequisite auto-add)

When an add-on's prerequisite is auto-added, the path does **not** select by
`size_class`. It grabs the first tier:

**POS ticket — `src/app/pos/components/catalog-browser.tsx:262-307`**
(`handleAddPrerequisite`):
```ts
const prereqService = services.find((s) => s.name === prereqServiceName); // full service, incl .pricing
...
const prereqPricing = prereqService.pricing ?? [];
const prereqExtra = { prerequisiteForServiceId: originalService.id };
if (prereqPricing.length > 0) {
  const tier = prereqPricing[0];                                  // ← BUG: always tier [0] = sedan
  if (onAddService) {
    onAddService(prereqService, tier, vehicleSizeClass);          // ← buggy tier (quote-embed path)
  } else if (dispatch) {
    dispatch({ type: 'ADD_SERVICE', service: prereqService, pricing: tier, vehicleSizeClass, ...prereqExtra }); // ← buggy tier
  }
  ...
}
```

The dispatched `ADD_SERVICE` hits the **same** reducer line
(`ticket-reducer.ts:270`), but now `pricing` = the sedan row
(`price = $75`, `is_vehicle_size_aware = false`). `resolveServicePrice`
returns `$75` regardless of `vehicleSizeClass = 'suv_3row_van'`. The ticket
item lands at **$75** with `tierName` = "Sedan".

**POS quote builder — `src/app/pos/components/quotes/quote-builder.tsx:368-399`**
(`handleAddPrerequisite`) has the identical defect:
```ts
const prereqPricing = prereqService.pricing ?? [];
if (prereqPricing.length > 0) {
  dispatch({ type: 'ADD_SERVICE', service: prereqService, pricing: prereqPricing[0], vehicleSizeClass, ...prereqExtra }); // ← BUG: tier [0]
  ...
}
```
Same outcome via `quote-reducer.ts:174`.

## Root cause

The exact wrong-price source lines:
- `src/app/pos/components/catalog-browser.tsx:279` — `const tier = prereqPricing[0];`
  (consumed at `:281` and `:283`)
- `src/app/pos/components/quotes/quote-builder.tsx:383` — `pricing: prereqPricing[0]`

`prereqPricing` is `prereqService.pricing` ordered by `display_order`, so
`[0]` is always the lowest `display_order` tier = **sedan**. For row-based
`vehicle_size` services every tier has `is_vehicle_size_aware = false`, so the
canonical resolver returns that row's flat `.price` and the `size_class` that
*is* correctly passed alongside is **ignored** — there is no column to read
and the wrong row was already chosen.

Note on column-based services: if a prerequisite happened to use the
column-based model (single `is_vehicle_size_aware = true` row), `prereqPricing[0]`
would be that one row and the price would resolve **correctly**. The bug is
therefore specific to **row-based `vehicle_size` prerequisites** — which is
the common case for the detailing menu (Express Exterior Wash, Signature
Complete Detail, Express Interior Clean are all row-based, confirmed below).

## Vehicle context at injection

**The `size_class` is already available at both injection points — the fix is
the easy "use the size_class that's already there" variety, not the harder
"thread the vehicle through" variety.**

- The prerequisite warning carries it: `PrerequisiteWarning.vehicleSizeClass`
  (`src/app/pos/hooks/use-prerequisite-check.ts:20-26`), set when the warning
  is raised (`:101-107`).
- `handleAddPrerequisite` also has the component-scope `vehicleSizeClass` in
  closure (it is the dispatched value and a `useCallback` dependency —
  `catalog-browser.tsx:283,307`).
- The full prerequisite service (with **all** its `.pricing` tiers) is
  already in hand via `services.find((s) => s.name === prereqServiceName)`
  (`catalog-browser.tsx:269`). The matching tier is right there; the code
  just picks index `0` instead of the matching one.

## Booking wizard — same bug or not?

**Not affected — and not shared code.** Prerequisites are a POS-only concept:

- No prerequisite logic exists anywhere under `src/components/booking/`
  (grep for `prerequisite`/`prereq` returns nothing).
- The booking wizard resolves size pricing correctly via
  `tiers.find((t) => t.tier_name === vehicleSizeClass)`
  (`src/components/booking/step-service-select.tsx:219,232,283,974`).

The bug is confined to the two POS surfaces.

## Blast radius

Other "system adds a service/price on the customer's behalf" flows were
checked for the same resolver-bypass / wrong-row pattern:

| Flow | File:line | Status |
|------|-----------|--------|
| **POS ticket prerequisite auto-add** | `catalog-browser.tsx:279,281,283` | **BUGGY** — `prereqPricing[0]` |
| **POS quote prerequisite auto-add** | `quote-builder.tsx:383` | **BUGGY** — `prereqPricing[0]` |
| POS favorites/register quick-add | `register-tab.tsx:152-159` | OK — selects matching tier |
| POS catalog normal quick-add | `catalog-browser.tsx:420-436` | OK — selects matching tier |
| Canonical `routeServiceTap` | `picker-engine.ts:212-225` | OK — selects matching tier |
| Combo pricing | `ticket-reducer.ts:278-286`, `quote-reducer.ts:182-189` | OK — `comboPrice` is compared **against** the resolved standard price, not a substitute for tier selection; the base price still comes from the (correctly-selected, in normal add) tier. **However:** a combo applied on a *prerequisite* would inherit the wrong base, since the prereq row is wrong upstream — fixing the tier selection fixes this transitively. |
| Sale auto-application | `picker-engine.ts:72-91` (`resolveServicePriceWithSale`) | OK — sale is orthogonal; applied to whatever tier is resolved. Same transitive caveat as combo. |
| Prereq **override** (add original without prereq) | `catalog-browser.tsx:252-260`, `quote-builder.tsx:359-366` | OK — re-adds the **original** service with its already-correctly-resolved `pricing` from the warning; does not re-pick `[0]`. |
| Per-unit / flat / custom prereq fallback | `catalog-browser.tsx:286-301`, `quote-builder.tsx:385-396` | OK — synthetic flat row is genuinely size-agnostic (`flat_price`); no size tier to mis-select. |

Net: the only flows that mis-select are the two prerequisite auto-adds. The
fix does not need to generalize beyond them, but extracting a shared helper
(below) would also harden the three currently-correct duplicate selection
sites against future drift.

## Recommended fix

**Surgical, 2 sites:**

1. In `handleAddPrerequisite` (`catalog-browser.tsx:262-307`), replace
   `const tier = prereqPricing[0]` with the matching-tier selection used by
   the normal-add path — handling both pricing models exactly as
   `routeServiceTap` / `handleTapServiceDirect` do:
   - if `prereqPricing.length > 1` and every tier's `tier_name` is a size
     class → `prereqPricing.find((t) => t.tier_name === vehicleSizeClass)`
     (fall back to `[0]` only if no match, to stay safe for malformed data);
   - else if a single `is_vehicle_size_aware` row → pass it as-is (resolver
     reads the column);
   - else (single non-size-aware tier) → `[0]` is correct.
2. Apply the identical change at `quote-builder.tsx:383`.

**Preferred (DRY) shape — reuse over duplication (CLAUDE.md Rule 11 & 22):**
the row-selection logic now lives **duplicated** in four places
(`catalog-browser.tsx:420-436`, `register-tab.tsx:152-168`,
`picker-engine.ts:212-225`, and would be a fifth here). Extract a canonical:

```ts
// src/lib/services/picker-engine.ts
export function selectPricingTierForVehicle(
  pricing: ServicePricing[],
  vehicleSizeClass: VehicleSizeClass | null,
): ServicePricing | null
```

…that returns the size-matched row (or the single column-based row, or the
single tier, or `null`), and route all selection sites — including the two
prerequisite paths — through it. This both fixes the bug and removes the
drift risk across the four copies. Per Rule 22, this helper belongs in the
engine, not inline in the POS components.

**Vehicle context:** already in scope (see above) — no threading needed.

**Estimated blast radius of the fix:** 2 files for the minimal fix; +1
(`picker-engine.ts`) and 3 touched call sites for the DRY version.

**Test to add (locks the regression):**
- Unit test on the new `selectPricingTierForVehicle` helper: row-based tiers
  + `suv_3row_van` → returns the `suv_3row_van` row (not `[0]`); column-based
  single row → returns that row; single non-size-aware → returns it; no
  match → `[0]`/null per chosen contract.
- Reducer/integration test: dispatch a prerequisite `ADD_SERVICE` for a
  row-based `vehicle_size` prereq with `vehicleSizeClass = 'suv_3row_van'`
  and assert the resulting item `unitPrice` is the `suv_3row_van` price, not
  the sedan price. (Mirror the existing `ticket-reducer` tests.)

## Live data sanity check

Run read-only against the live DB (Supabase project `zwvahzymzardmxixyfim`)
on 2026-05-28. **All data is correct — the larger-vehicle tier rows exist —
confirming the bug is in code, not data.**

**"Paint Correction Prep"** (`pricing_model = vehicle_size`) prerequisites
(`service_prerequisites`, both `required_same_ticket`):
- **Express Exterior Wash** ← the service the operator called "Express Interior"
- **Signature Complete Detail**

**"Express Exterior Wash"** (`pricing_model = vehicle_size`, row-based)
`service_pricing` ORDER BY `display_order`:

| display_order | tier_name | price | is_vehicle_size_aware |
|---|---|---|---|
| 0 | sedan | **$75** ← `prereqPricing[0]` (wrong) | false |
| 1 | truck_suv_2row | $90 | false |
| 2 | suv_3row_van | **$110** ← correct for Suburban | false |
| 3 | exotic | $150 | false |
| 4 | classic | $175 | false |

This is the operator's exact repro: **$75 (sedan, tier [0]) vs $110
(suv_3row_van, correct).** The $110 row exists. Bug = code.

**"Signature Complete Detail"** (the other prereq, row-based): sedan $210 →
suv_3row_van $320 → … (same defect would yield $210 instead of $320).

**"Express Interior Clean"** (`pricing_model = vehicle_size`, the
similarly-named service — present in catalog, row-based): sedan $85,
truck_suv_2row $100, suv_3row_van $120, exotic $160, classic $180. (Listed
for completeness; not actually a prerequisite of Paint Correction Prep.)

## Open questions for operator

1. **Fix scope:** Minimal 2-line fix, or the DRY refactor that also
   de-duplicates the four tier-selection copies behind a canonical
   `selectPricingTierForVehicle()` engine helper? (Recommend the DRY version
   — it's the Rule-11/Rule-22 path and prevents the next copy from drifting.)
2. **No-match fallback:** When a vehicle's `size_class` has no matching tier
   row (data gap, e.g. an `exotic` vehicle but the prereq has no `exotic`
   tier), should the prereq auto-add fall back to `[0]`, fall back to the
   highest tier, or **block** with a warning (consistent with how the normal
   add falls through to the manual picker)? The normal path opens the picker;
   an auto-add can't, so a defined fallback is needed.
3. **Existing tickets/quotes:** Any open quotes/tickets already built with the
   mis-priced prerequisite line should be re-priced manually — the fix is
   forward-only (it changes selection at add time; it does not retro-correct
   persisted line items).
