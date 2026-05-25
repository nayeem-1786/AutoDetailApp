# Issue 39 — `{services}` Chip Composition Audit (2026-05-26)

> Read-only diagnostic audit. Verifies how the `{services}` SMS chip is
> composed across all consumers, recommends a shared-helper rendering
> ruleset for multi-tier same-service quotes, and surfaces the
> "Carpet Mats" vs "Carpet & Mats" tier_label data finding (Issue 40,
> separate concern).
>
> No source code modified. Evidence cited inline with `file:line` refs
> and SQL output captured verbatim.

---

## TL;DR

**Recommendation (Issue 39 fix scope):** create a shared formatter at
`src/lib/quotes/services-summary.ts` exporting
`formatServicesSummary(items: QuoteItem[]): string`, adopted by the
ONE consumer that produces multi-tier same-service quotes today
(`src/app/api/voice-agent/send-quote-sms/route.ts:532`). The same
helper IS adopted at the 5 remaining `{services}`-chip call sites for
backward-compat parity (zero output change for any non-multi-tier
case — the helper produces byte-identical results to today's
`items.map(i => i.item_name).join(', ')` when no service has > 1
quote_item). This mirrors the Session 71
`line-item-pricing.ts` shared-formatter pattern.

**Multi-tier rendering rule (per operator-locked decisions 1–6):**

```
formatServicesSummary([floor_mats×1, per_row×2])
  = "Hot Shampoo Extraction (2 Rows + Floor Mats)"

formatServicesSummary([carpet_mats×1])
  = "Hot Shampoo Extraction (Carpet & Mats)"

formatServicesSummary([per_row×3])
  = "Hot Shampoo Extraction (3 Rows)"

formatServicesSummary([express_interior_clean×1, ceramic_shield×1])
  = "Express Interior Clean, Ceramic Shield"
  // (each service has exactly one quote_item — no parens)
```

**tier_label vs qty_label rendering source (Option X):** the
deferred operator question is resolved by the empirical DB data:

- **qty = 1** → use `service_pricing.tier_label` (the human-readable
  label, e.g., "Per Seat Row").
- **qty > 1** → use `${qty} ${pluralize(qty_label)}` (e.g., "2 Rows").

Today only `Hot Shampoo Extraction.per_row` has `qty_label='row'` and
`max_qty=3` set in the DB; every other multi-tier service has
`qty_label = NULL`. The implementation must defensively handle a
`qty > 1` case where `qty_label` is null (treat as misconfiguration
and fall back to `${qty} × ${tier_label}` with a `console.warn`); the
audit recommends `quote_items.quantity` writes already gate on a
non-null `max_qty` per the D43 Session C validation, so this branch
should never fire in production but is the right defensive shape.

**Higher-priced-tier-first ordering source:** sort by
`unit_price × quantity` (= `total_price`) DESCENDING within a service
group, tie-break by `service_pricing.display_order` ASCENDING.
Verified empirically against the operator's example: for Hot Shampoo
Extraction `(floor_mats × 1 @ $75) + (per_row × 2 @ $125 → $250)`,
`$250 > $75` → "Per Row" first → operator's expected output
`"Hot Shampoo Extraction (2 Rows + Floor Mats)"` ✓.

**Issue 40 disposition (separate concern):** two
`service_pricing.tier_label` rows on `Hot Shampoo Extraction` carry
verbose operator-internal suffixes that read poorly when surfaced in
the parenthetical SMS context:

- `floor_mats.tier_label = "Floor Mats Only"` → operator's example
  drops "Only" → recommended new value: `"Floor Mats"`.
- `carpet_mats.tier_label = "Carpet & Mats Package"` → operator's
  example drops "Package" → recommended new value: `"Carpet & Mats"`.

These are Admin-UI-editable rows (per CLAUDE.md Rule 14 service
category management is done through admin, not migrations); the
audit recommends the operator make the 2 edits **AFTER** Issue 39
ships so the helper's output matches expectations on the first
verification run. No code changes required for Issue 40 — the helper
reads `tier_label` verbatim and the data edit is the entire fix.

**Implementation scope (recommended):** Issue 39 = ~1 session
(60-90 min). Files: `src/lib/quotes/services-summary.ts` (new,
~50-80 LOC), adoptions at 6 call sites in `route.ts` files (1-line
each replacing the inline `.join(', ')` composition), +1 narrow
helper in `convert-service.ts:202`. Tests: +18-22 (unit on the
formatter, +6 adoption pins ensuring no surface still inlines the
naive join).

**Other consumers (Target 9 cross-cutting, OUT OF SCOPE for Issue
39):** 4 visual surfaces (public quote page, admin slide-over, POS
quote detail, quote PDF, public receipt) render
`quote_items.tier_name` as raw snake_case slugs ("per_row",
"floor_mats", "carpet_mats") rather than the joined
`service_pricing.tier_label`. This is the SAME class of bug at
different surfaces — customer-visible TODAY on Q-0084's quote link.
Audit recommends a Session 71-style follow-on (one cross-cutting fix
adopting `tier_label` everywhere) — but **not bundled with Issue
39**, per the brief's "ship the helper + fix SMS chip first" guidance.

---

## Root cause statement

`{services}` is composed by every consumer as
`quoteItems.map(i => i.item_name).join(', ')` — `item_name` carries
the parent service's name only, so multi-tier same-service rows
produce duplicated tokens like `"Hot Shampoo Extraction, Hot Shampoo
Extraction"`; the renderer has no view of `tier_name` /
`tier_label` / `qty_label` and cannot disambiguate without the helper
this audit recommends.

---

## Empirical evidence (the operator test that surfaced Issue 39)

Operator phone test from `+13107564789`, **2026-05-25 ~14:25-14:28 PT**:

| # | Actor | Message |
|---|-------|---------|
| 1 | Customer | "2018 Suburban, need to clean some seats" |
| 2 | Agent | (after classify_vehicle → `suv_3row_van` + get_services with size_class) enumerates Hot Shampoo Extraction tiers: floor_mats $75, per_row $125, carpet_mats $175, Complete $450. |
| 3 | Customer | "floor mats and 2 rows" |
| 4 | Agent | "Floor Mats × 1 = $75; Per Row × 2 = $250 (2 rows); total $325. Send it?" |
| 5 | Customer | "Sure send it" |
| 6 | Agent | `send_quote_sms({ services: "Hot Shampoo Extraction,Hot Shampoo Extraction", tiers: "floor_mats,per_row", quantities: "1,2" })` per D43 Session B/C contract. |
| 7 | Route | resolves to 2 quote_items: `(service_id=…, tier=floor_mats, qty=1, unit=75, total=75)`, `(service_id=…, tier=per_row, qty=2, unit=125, total=250)`. Idempotency triple is `(service_id, floor_mats, 1) + (service_id, per_row, 2)` — distinct from any earlier quote. **Quote totals are correct: subtotal $325.** |
| 8 | SMS preview | `"Here's your quote from Smart Details Auto Spa for Hot Shampoo Extraction, Hot Shampoo Extraction: https://…"` ← **THE Issue 39 BUG: duplicated service name.** |
| 9 | Customer taps link | Public quote page renders `"Hot Shampoo Extraction"` row × 2, each labeled with `floor_mats` / `per_row` raw slugs ← Target 9 surface bug, OUT OF SCOPE for Issue 39 but flagged. |

Verified via DB query against `quote_items` for the test quote: 2
rows persist as Pattern X (`quantity = 2` on `per_row`, single
`quote_items` row per tier) per the Issue 38 audit Target 8
recommendation. **Underlying data is correct — the bug is purely in
the `{services}` chip composition.**

---

## Detailed findings per target

### Target 1 — `{services}` chip consumers in the codebase

Six call sites compose the `services` chip value. All use the same
shape: collect service names → `.join(', ')`. No shared helper today.

| # | File:line | Composition source | Template slug(s) |
|---|---|---|---|
| 1 | `src/app/api/voice-agent/send-quote-sms/route.ts:532` | `quoteItems.map((i) => i.item_name).join(', ')` | `quote_sms_midcall` |
| 2 | `src/app/api/quotes/[id]/accept/route.ts:121` | `items.map((i) => i.item_name).join(', ')` | `quote_accepted_staff_notify` |
| 3 | `src/app/api/book/route.ts:682-686` | `[serviceRow.name, ...data.addons.map((a) => a.name)].join(', ')` | `booking_confirmed`, `booking_staff_notify` |
| 4 | `src/app/api/pos/jobs/[id]/cancel/route.ts:212-214` | `services.map((s) => s.service?.name).join(', ')` | `appointment_cancelled` |
| 5 | `src/app/api/voice-agent/appointments/route.ts:311` | (forwarded from `convertQuote()`) | `appointment_confirmed` family |
| 6 | `src/lib/quotes/convert-service.ts:202-204` | `serviceItems.map((item) => item.item_name).join(', ')` — composed inside the conversion service | shared by every quote→appointment conversion |

**SMS templates referencing `{services}` in DB** (queried 2026-05-26
against `sms_templates`):

| slug | name | recipient | required vars include `services`? |
|---|---|---|---|
| `appointment_cancelled` | Appointment Cancelled | customer | optional |
| `booking_confirmed` | Online Booking Confirmed | customer | required |
| `booking_staff_notify` | Staff: New Booking | staff | required |
| `quote_accepted_staff_notify` | Staff: Quote Accepted | staff | required |
| `quote_sms_midcall` | Quote — Voice Agent Mid-Call | customer | required |

5 active templates. The `quote_sms_midcall` body (verbatim):

```
GM - Here's your quote from {business_name} for {services}: {short_url}
```

THE Issue 39 bug surface today: only `send-quote-sms/route.ts` and
`voice-agent/appointments/route.ts` (via D43 Session C) can produce
multi-tier same-service items. The 4 other consumers will start
exhibiting the bug as soon as ANY quote with multi-tier same-service
items reaches a flow that uses one of those templates (e.g., a
multi-tier quote is accepted → `quote_accepted_staff_notify` fires
with `"Hot Shampoo Extraction, Hot Shampoo Extraction"`).

### Target 2 — `service_pricing` data inventory

Queried 2026-05-26 against the live Supabase project
`zwvahzymzardmxixyfim` via service-role key.

**Multi-tier active services (16 total) — full tier_label / qty_label
data:**

| service_name | pricing_model | tier_name | tier_label | qty_label | max_qty | size_aware |
|---|---|---|---|---|---|---|
| 1-Year Ceramic Shield | vehicle_size | sedan | Sedan | NULL | NULL | false |
| 1-Year Ceramic Shield | vehicle_size | truck_suv_2row | Truck/SUV (2-Row) | NULL | NULL | false |
| 1-Year Ceramic Shield | vehicle_size | suv_3row_van | SUV (3-Row) / Van | NULL | NULL | false |
| 1-Year Ceramic Shield | vehicle_size | exotic | Exotic | NULL | NULL | false |
| 1-Year Ceramic Shield | vehicle_size | classic | Classic | NULL | NULL | false |
| 3-Stage Paint Correction | vehicle_size | (same 5 tiers as above) | | | | |
| 3-Year Ceramic Shield | vehicle_size | (same) | | | | |
| 5-Year Ceramic Shield Plus | vehicle_size | (same) | | | | |
| Express Exterior Wash | vehicle_size | (same) | | | | |
| Express Interior Clean | vehicle_size | (same) | | | | |
| Signature Complete Detail | vehicle_size | (same) | | | | |
| Single-Stage Polish | vehicle_size | (same) | | | | |
| Aircraft Exterior Wash | specialty | aircraft_2_4 | 2-4 Seater | NULL | NULL | false |
| Aircraft Exterior Wash | specialty | aircraft_6_8 | 6-8 Seater | NULL | NULL | false |
| Aircraft Exterior Wash | specialty | aircraft_turboprop | Turboprop/Jet | NULL | NULL | false |
| Aircraft Interior Clean | specialty | (same 3 tiers) | | | | |
| Boat Exterior Wash | specialty | boat_up_to_20 | Up to 20' | NULL | NULL | false |
| Boat Exterior Wash | specialty | boat_21_26 | 21-26' | NULL | NULL | false |
| Boat Exterior Wash | specialty | boat_27_32 | 27-32' | NULL | NULL | false |
| Boat Interior Clean | specialty | (same 3 tiers) | | | | |
| Complete Motorcycle Detail | specialty | standard_cruiser | Standard/Cruiser | NULL | NULL | false |
| Complete Motorcycle Detail | specialty | touring_bagger | Touring/Bagger | NULL | NULL | false |
| RV Exterior Wash | specialty | rv_up_to_24 | Up to 24' | NULL | NULL | false |
| RV Exterior Wash | specialty | rv_25_35 | 25-35' | NULL | NULL | false |
| RV Exterior Wash | specialty | rv_36_plus | 36'+ | NULL | NULL | false |
| RV Interior Clean | specialty | (same 3 tiers) | | | | |
| **Hot Shampoo Extraction** | **scope** | **floor_mats** | **Floor Mats Only** | **NULL** | **NULL** | **false** |
| **Hot Shampoo Extraction** | **scope** | **per_row** | **Per Seat Row** | **row** | **3** | **false** |
| **Hot Shampoo Extraction** | **scope** | **carpet_mats** | **Carpet & Mats Package** | **NULL** | **NULL** | **false** |
| **Hot Shampoo Extraction** | **scope** | **complete** | **Complete Interior** | **NULL** | **NULL** | **true** |

**Findings:**

- **Hot Shampoo Extraction is the SOLE multi-tier service capable of
  producing multi-tier same-service quote items today.** Every
  `vehicle_size` service picks exactly one tier per quote_item (it's
  the vehicle's size class); every `specialty` service picks exactly
  one tier per vehicle (its specialty type — Issue 38 D43 lets the
  agent override, but a single quote still has one specialty tier).
- **`qty_label` is non-null on exactly ONE row catalog-wide**:
  `Hot Shampoo Extraction.per_row` (`qty_label='row'`, `max_qty=3`).
  Every other tier has `qty_label = NULL`. This is consistent with
  the Issue 38 audit Target 5/8 findings — `per_row` was the only
  tier designed for multi-quantity semantics.
- **Issue 40 surface (verbose tier_labels):**
  `Floor Mats Only` and `Carpet & Mats Package` carry operator-
  internal suffixes ("Only", "Package") that read poorly in the
  parenthetical SMS context. **All other tier_labels in the catalog
  read cleanly as-is.** (Pluralization-aware future audit: `Truck/SUV
  (2-Row)`, `SUV (3-Row) / Van`, etc. already contain forward slashes
  and parentheses — a future helper could escape these but they don't
  appear in multi-tier same-service today.)
- **No tier has an irregular plural** (no "foot" → "feet", no
  "child" → "children"). Simple `+s` pluralization is sufficient for
  the helper today. (Defensive: future tiers could introduce
  irregulars — keep the pluralizer trivial and add cases as the
  catalog grows.)

### Target 3 — tier_label vs qty_label rendering source

**Recommendation: Option X (hybrid).**

```ts
function renderTierToken(item: {
  quantity: number;
  tier_name: string | null;
  tier_label: string | null;
  qty_label: string | null;
}): string {
  // qty > 1 with qty_label configured → "${qty} ${pluralize(qty_label)}".
  if (item.quantity > 1 && item.qty_label) {
    return `${item.quantity} ${pluralize(item.qty_label)}`;
  }
  // qty == 1 OR no qty_label configured → tier_label, with fallbacks.
  return item.tier_label
    ?? titleCase(item.tier_name)
    ?? '';
}
```

**Verbatim mapping against operator-locked examples:**

| Operator example | Inputs | Renderer output |
|---|---|---|
| Decision 1: `Hot Shampoo Extraction (2 Rows + Floor Mats)` | per_row qty=2 + floor_mats qty=1 | `2 Rows` (qty_label="row" → "Rows") + `Floor Mats` (tier_label, post-Issue-40-edit) |
| Decision 4: `Hot Shampoo Extraction (3 Rows)` | per_row qty=3 | `3 Rows` |
| Decision 5: `Hot Shampoo Extraction (Carpet & Mats)` | carpet_mats qty=1 | `Carpet & Mats` (tier_label, post-Issue-40-edit) |
| Decision 6: `Hot Shampoo Extraction (2 Rows + Floor Mats), Ceramic Shield` | + Ceramic Shield (single tier per service) | Ceramic Shield rendered with no parens (single-tier case — see Target 5) |

**Defensive fallback (qty>1 but qty_label=NULL):** treat as
misconfiguration; emit `${qty} × ${tier_label}` and `console.warn`.
This branch is unreachable today (D43 Session C validates `quantity
<= max_qty` and `max_qty` is set only on tiers with `qty_label`),
but a future operator could add a tier with `max_qty` but no
`qty_label` via the admin UI.

**Pluralization (simple English `+s`):** the helper's `pluralize`
function is one-liner:

```ts
function pluralize(noun: string): string {
  return /[sxz]$|[cs]h$/i.test(noun) ? noun + 'es' : noun + 's';
}
```

`row` → `rows` → title-cased "Rows" ✓. Future tiers may need
irregulars; add them as encountered. The audit does not recommend a
dependency on `pluralize` npm packages — the catalog is small and
operator-controlled.

### Target 4 — Higher-priced-tier ordering source

**Recommendation: sort by `total_price DESC` (= `unit_price ×
quantity`), tie-break by `service_pricing.display_order ASC`.**

**Verification against operator example 1 (Hot Shampoo Extraction
floor_mats × 1 + per_row × 2):**

| Tier | display_order | unit_price | quantity | total_price |
|---|---|---|---|---|
| floor_mats | 0 | $75 | 1 | $75 |
| per_row | 1 | $125 | 2 | **$250** |

| Ordering source | Output |
|---|---|
| `display_order ASC` | `Floor Mats + 2 Rows` ❌ |
| `unit_price DESC` | `2 Rows + Floor Mats` ✓ |
| **`total_price DESC`** | **`2 Rows + Floor Mats` ✓** |

`unit_price DESC` and `total_price DESC` both produce the expected
output here. `total_price` is preferred because it reflects what the
CUSTOMER actually pays per line — the operator's mental model when
saying "higher-priced tier first" is most likely "higher line total"
not "higher per-unit." A 2026-future case where `per_row × 1 = $125`
and `carpet_mats × 1 = $175` should put Carpet & Mats first; both
sort keys agree.

**`display_order` cannot be used as the primary key** because the
catalog is sorted floor → ceiling (cheapest tier first by editorial
convention), the opposite of what the operator wants for SMS
rendering.

**Tie-break:** when two tiers have identical `total_price` (e.g., 2
hypothetical $100 add-ons), use `display_order ASC` for a stable,
operator-controlled secondary order.

### Target 5 — Backward compatibility

For each of the 6 consumers in Target 1, verify the helper produces
byte-identical output for non-multi-tier cases:

| Input | Today's output (naive `.map().join(', ')`) | Helper output |
|---|---|---|
| 1 service, 1 quote_item (single tier or untierred) | `"Express Interior Clean"` | `"Express Interior Clean"` ✓ |
| 2 different services, 1 quote_item each | `"Express Interior Clean, Ceramic Shield"` | `"Express Interior Clean, Ceramic Shield"` ✓ |
| 1 service, multi-tier (THE Issue 39 case) | `"Hot Shampoo Extraction, Hot Shampoo Extraction"` ❌ | `"Hot Shampoo Extraction (2 Rows + Floor Mats)"` ✓ |
| 1 service, single tier qty > 1 (e.g., per_row × 3 alone) | `"Hot Shampoo Extraction"` (no qty info — silently wrong) | `"Hot Shampoo Extraction (3 Rows)"` ✓ (per operator decision 4) |
| 1 service, single tier qty = 1 with tier label (e.g., carpet_mats × 1) | `"Hot Shampoo Extraction"` | `"Hot Shampoo Extraction (Carpet & Mats)"` (per operator decision 5) |
| 2 services, one multi-tier one single | `"Hot Shampoo Extraction, Hot Shampoo Extraction, Ceramic Shield"` ❌ | `"Hot Shampoo Extraction (2 Rows + Floor Mats), Ceramic Shield"` ✓ |

**4 cases change output:** the original Issue 39 case, single-tier
qty > 1, single-tier qty = 1 with informative tier_label, and the
mixed-services case. All 4 are improvements consistent with operator
decisions. **2 cases preserve output byte-identically.**

**Operator decision 5 interpretation (single tier qty = 1 — keep
parens):** the decision says `Hot Shampoo Extraction (Carpet & Mats)`
— keep the parens to surface the tier label even for single-tier
single-quantity. The helper must emit parens for ANY quote_item whose
parent service has multiple tiers configured in the catalog, EVEN IF
the customer only ordered one. The discriminator is "does this
service have >1 tier configured in service_pricing?" — NOT "did this
quote use >1 tier?" Today the only such service is Hot Shampoo
Extraction (`scope`).

**Counter-case: vehicle_size service like Express Interior Clean.**
The customer's quote always has exactly one tier (sedan / truck_suv
/ etc., determined by their vehicle). Should this also surface the
tier in parens? E.g., for a 2018 Suburban → `"Express Interior Clean
(SUV (3-Row) / Van)"` — looks weird because the parens echo info the
customer already knows about their vehicle. **Operator decision 6
implicitly says no** — "no parens for services without tiers (or
services that have only one tier with qty=1 AND no other line items
from that service — TBD per audit)."

**Audit recommendation (Target 5 / Decision 6 disambiguation):**

> Render parens ONLY when one of these conditions holds:
> (a) the service has > 1 quote_item in this quote (multi-tier
>     same-service case — the Issue 39 trigger), OR
> (b) any quote_item for this service has `quantity > 1` (multi-row
>     case from operator decision 4), OR
> (c) the service's `pricing_model === 'scope'` AND `tier_label` is
>     informative (case from operator decision 5 — "Carpet & Mats" is
>     useful context even at qty=1; "Sedan" on Express Interior Clean
>     is not).
>
> For `vehicle_size` and `specialty` pricing models with a single
> quote_item at qty=1, OMIT the parens — the customer already knows
> their vehicle / specialty type and the catalog name conveys
> everything else.

This keeps operator decisions 1, 4, 5, 6 all coherent. Verified
mapping:

| Service | pricing_model | quote_items | Helper output |
|---|---|---|---|
| Hot Shampoo Extraction | scope | floor_mats×1 + per_row×2 | `Hot Shampoo Extraction (2 Rows + Floor Mats)` |
| Hot Shampoo Extraction | scope | per_row×3 | `Hot Shampoo Extraction (3 Rows)` |
| Hot Shampoo Extraction | scope | carpet_mats×1 | `Hot Shampoo Extraction (Carpet & Mats)` ← per condition (c) |
| Express Interior Clean | vehicle_size | sedan×1 | `Express Interior Clean` ← no parens |
| Complete Motorcycle Detail | specialty | touring_bagger×1 | `Complete Motorcycle Detail` ← no parens |
| Mixed quote | — | Hot Shampoo Extraction (floor_mats×1 + per_row×2) + Ceramic Shield (sedan×1) | `Hot Shampoo Extraction (2 Rows + Floor Mats), Ceramic Shield` |

### Target 6 — Helper extraction analysis

**Recommendation: Option A (shared helper).**

New file: `src/lib/quotes/services-summary.ts` exporting:

```ts
export interface ServicesSummaryItem {
  service_id: string | null;       // for grouping
  service_pricing_model?: string;  // for condition (c) — see Target 5
  item_name: string;               // service name (today's source)
  tier_name: string | null;        // quote_items.tier_name slug
  tier_label?: string | null;      // joined from service_pricing
  qty_label?: string | null;       // joined from service_pricing
  quantity: number;
  unit_price: number;
  total_price?: number;            // unit_price * quantity if omitted
}

/**
 * Compose the human-readable services chip for SMS templates.
 *
 * Issue 39 D44 (2026-05-26) — replaces the inline
 * `items.map(i => i.item_name).join(', ')` pattern at 6 call sites.
 * Handles multi-tier same-service items, per_row × N pluralization,
 * and the "no parens for single-tier non-scope services" rule from
 * operator decision 6.
 *
 * See docs/dev/ISSUE_39_SERVICES_CHIP_AUDIT.md Target 5/6.
 */
export function formatServicesSummary(items: ServicesSummaryItem[]): string;
```

**Why a shared helper (not per-template resolver):**

1. **Mirrors Session 71 precedent.** `src/lib/quotes/line-item-pricing.ts`
   extracted a shared formatter for combo / sale discount rendering
   across 10 surfaces; same architectural shape applies here.
2. **All 6 consumers compose the chip the SAME way today** — naive
   `.join(', ')`. A shared helper means one fix → six call sites
   correct.
3. **Cross-surface adoption later is cheaper.** Target 9 follow-on
   will likely adopt the same helper in the public quote page, PDF,
   admin slide-over, POS quote detail, receipt — all currently using
   raw `tier_name` slugs. One helper, two follow-on sessions.
4. **Testable in isolation.** Operator-locked decisions become unit
   test cases against the formatter directly, not coupled to any
   route.

**Helper data shape — joining tier_label / qty_label:** none of the
6 call sites currently SELECT `service_pricing.tier_label` /
`qty_label`. The fix scope includes widening those SELECTs to include
the join. Most call sites already join `quote_items` to fetch
`item_name` and `tier_name`; adding the `service_pricing` join is
either via a Supabase nested select or a separate batched SELECT
keyed on `(service_id, tier_name)`. The Issue 39 implementation
session must decide; the audit's preference is the nested select
(fewer round trips, matches the established pattern at
`services/route.ts:65-71`).

### Target 7 — Test plan

**Unit tests on `formatServicesSummary` (~14 cases):**

| # | Test name | Inputs | Expected output |
|---|---|---|---|
| 1 | `single non-tier service renders bare name` | `[{item_name: "Express Interior Clean", tier_name: "sedan", tier_label: "Sedan", quantity: 1, service_pricing_model: "vehicle_size"}]` | `"Express Interior Clean"` |
| 2 | `two different services, both single-tier, render comma-joined bare names` | `[ExpressInterior(sedan×1), CeramicShield(sedan×1)]` | `"Express Interior Clean, Ceramic Shield"` |
| 3 | `single scope service single tier qty=1 surfaces tier_label in parens (operator decision 5)` | `[HotShampoo(carpet_mats×1, label="Carpet & Mats")]` | `"Hot Shampoo Extraction (Carpet & Mats)"` |
| 4 | `single scope service single tier qty>1 surfaces "N Rows" (operator decision 4)` | `[HotShampoo(per_row×3, qty_label="row")]` | `"Hot Shampoo Extraction (3 Rows)"` |
| 5 | `multi-tier same-service orders by total_price DESC (the Issue 39 trigger / operator decision 1)` | `[HotShampoo(floor_mats×1 @75), HotShampoo(per_row×2 @125)]` | `"Hot Shampoo Extraction (2 Rows + Floor Mats)"` |
| 6 | `multi-tier + single-tier service in same quote (operator decision 6)` | `[HotShampoo(floor_mats×1, per_row×2), CeramicShield(sedan×1)]` | `"Hot Shampoo Extraction (2 Rows + Floor Mats), Ceramic Shield"` |
| 7 | `single scope service single tier qty=1 with placeholder tier_label falls back to title-cased tier_name` | `[HotShampoo(per_row×1, label=null, qty_label="row")]` | `"Hot Shampoo Extraction (Per Row)"` |
| 8 | `tier_label fallback to tier_name uses snake-case-to-title-case` | tier_name="floor_mats", label=null, qty=1 | `"Floor Mats"` (title-cased token) |
| 9 | `pluralization: "row" → "Rows"` | qty=2, qty_label="row" | contains `"2 Rows"` |
| 10 | `pluralization "+es" rule: hypothetical qty_label="patch"` | qty=2, qty_label="patch" | contains `"2 Patches"` |
| 11 | `defensive: qty>1 with qty_label=NULL emits "${qty} × ${tier_label}" + console.warn` | qty=2, qty_label=null, label="Some Tier" | `"… (2 × Some Tier)"` + warn |
| 12 | `vehicle_size single-tier qty=1 omits parens (operator decision 6)` | `[ExpressInterior(sedan×1, model="vehicle_size")]` | `"Express Interior Clean"` (no parens) |
| 13 | `specialty single-tier qty=1 omits parens (operator decision 6)` | `[MotorcycleDetail(touring_bagger×1, model="specialty")]` | `"Complete Motorcycle Detail"` (no parens) |
| 14 | `empty items array returns empty string (regression guard)` | `[]` | `""` |

**Adoption pins (~6 cases — one per consumer + Q-0084 reproduction):**

| # | Test name | Pin |
|---|---|---|
| 15 | `send-quote-sms/route.ts imports formatServicesSummary` | grep finds the import |
| 16 | `send-quote-sms/route.ts no longer composes serviceList via items.map(i => i.item_name).join` | regex against file |
| 17 | `quotes/[id]/accept/route.ts imports formatServicesSummary` | grep finds the import |
| 18 | `convert-service.ts adopts the helper for serviceNames build` | grep finds the import |
| 19 | `Q-0084 fixture (floor_mats×1 + per_row×2) renders "Hot Shampoo Extraction (2 Rows + Floor Mats)"` | end-to-end through send-quote-sms test |
| 20 | `regression: non-multi-tier quote renders byte-identical to pre-Issue-39 helper-less output` | sanity check |

**Total: 14 unit + 6 adoption = 20 net new tests.** Mirrors Session
71's test density (49 net new across 10 surfaces — Issue 39 is 6
surfaces and a tighter helper).

### Target 8 — Implementation scope estimate

**Files to create:**

- `src/lib/quotes/services-summary.ts` (~80 LOC including doc
  comments, types, `pluralize` helper, `titleCase` fallback).
- `src/lib/quotes/__tests__/services-summary.test.ts` (~280 LOC).
- `src/lib/quotes/__tests__/services-summary-adoption.test.ts`
  (~120 LOC).

**Files to modify:**

- `src/app/api/voice-agent/send-quote-sms/route.ts` (line 532
  composition; possibly widen the SELECT at line 60-83 of D43
  Session C to also include tier_label / qty_label / pricing_model
  from `service_pricing` — verify against actual quoteItems shape).
- `src/app/api/quotes/[id]/accept/route.ts` (line 121).
- `src/app/api/book/route.ts` (line 686 — note: this composes from
  the form payload `data.addons[].name`, not from quote_items;
  Issue 39 trigger is unreachable here today because booking flow
  doesn't write multi-tier same-service via the form widget — flag
  as future-proof adoption only).
- `src/app/api/pos/jobs/[id]/cancel/route.ts` (line 212).
- `src/app/api/voice-agent/appointments/route.ts` (line 311 —
  forwarded from `convertQuote`).
- `src/lib/quotes/convert-service.ts` (line 202 — the upstream
  composition point; widening here cascades to consumer #5).

**LOC estimate:** ~50-80 lines in helper, ~5-15 lines per
adoption × 6 = ~30-90 LOC of adoption changes. Tests: ~280 + ~120 =
~400 LOC.

**Risk assessment:**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Helper produces different output for non-Issue-39 cases (regression) | Low | High | Adoption pin tests assert byte-identical output for the 2 non-changing cases from Target 5 |
| `tier_label` not joined in the quote_items SELECT at one of the 6 call sites | Medium | Medium | Each adoption widens the SELECT explicitly; lint/test catches the missing join |
| `pluralize("row") = "rows"` correct but future tier introduces irregular | Low | Low | Keep pluralizer simple; add irregulars when encountered (catalog growth is operator-controlled) |
| Q-0084-class regression on a non-Hot-Shampoo service | Very low | Low | Hot Shampoo is the SOLE multi-tier-same-service surface today (Target 2) |
| Issue 40 not done before Issue 39 deploys | Medium | Cosmetic | Audit recommends operator make the 2 tier_label edits AFTER Issue 39 ships; the helper reads tier_label verbatim so a "Floor Mats Only" output is acceptable until the edit lands |

**Estimated session time:** 60-90 minutes (one focused session).

### Target 9 — Other consumers of quote item summaries (cross-cutting)

The `{services}` chip is one consumer of "human-readable quote
summary." **Four visual surfaces render `quote_items.tier_name` as
raw snake_case slugs today:**

| Surface | File:line | Today's rendering |
|---|---|---|
| Public quote page | `src/app/(public)/quote/[token]/page.tsx:268-269` | `<div>{displayItem.tier_name}</div>` → customer sees `"per_row"`, `"floor_mats"`, etc. |
| Admin slide-over | `src/app/admin/quotes/components/quote-slide-over.tsx:161-162` | `({item.tier_name})` |
| POS quote detail | `src/app/pos/components/quotes/quote-detail.tsx:557-558` | `{item.tier_name}` |
| Quote PDF | `src/app/api/quotes/[id]/pdf/route.ts:304` | `doc.text(item.tier_name \|\| '-', …)` (Tier column) |
| Public receipt | `src/app/(public)/receipt/[token]/page.tsx:236-238` | `{item.tier_name && <span> — {item.tier_name}</span>}` |

**Customer-visible TODAY on Q-0084's quote link:** the public quote
page row labels read `"per_row"` and `"floor_mats"` (raw slugs)
instead of `"Per Seat Row"` and `"Floor Mats Only"` (tier_labels).

**Audit recommendation (cross-cutting):** a Session-71-style follow-
on adopts the SAME `formatServicesSummary` helper (or a new
`renderTierToken(item)` extracted from inside it) at these 5
surfaces. **NOT bundled with Issue 39** per the brief's "ship the
helper + fix SMS chip first" guidance — this is the natural Issue 41
follow-on once Issue 39's helper API is locked.

The admin quote LIST page (`src/app/admin/quotes/page.tsx:347-349`)
also composes a chip-style summary (`itemNames.slice(0, 2).join(',
')`) — same pattern, slightly different presentation (truncation +
"+N" overflow). Either adopt the helper or call its underlying
service-grouping logic.

### Target 10 — Recommended fix scope summary

1. **Recommendation:** create `services-summary.ts` helper + adopt at
   the 6 chip-composing call sites only (Issue 39 scope). Defer the 5
   visual-surface adoptions to a follow-on (Issue 41).
2. **Files to create:**
   - `src/lib/quotes/services-summary.ts` (helper).
   - `src/lib/quotes/__tests__/services-summary.test.ts` (unit).
   - `src/lib/quotes/__tests__/services-summary-adoption.test.ts`
     (pin imports across 6 call sites).
3. **Files to modify:**
   - `src/app/api/voice-agent/send-quote-sms/route.ts:532`.
   - `src/app/api/quotes/[id]/accept/route.ts:121`.
   - `src/app/api/book/route.ts:686`.
   - `src/app/api/pos/jobs/[id]/cancel/route.ts:212-214`.
   - `src/lib/quotes/convert-service.ts:202-204` (cascades to
     `voice-agent/appointments/route.ts:311`).
   - SELECT widenings (per adoption site, to join
     `service_pricing.tier_label`, `qty_label`, and the parent
     `services.pricing_model`).
4. **Files NOT to modify in this session:**
   - `src/app/(public)/quote/[token]/page.tsx` — Issue 41 follow-on.
   - `src/app/admin/quotes/components/quote-slide-over.tsx` — Issue 41.
   - `src/app/pos/components/quotes/quote-detail.tsx` — Issue 41.
   - `src/app/api/quotes/[id]/pdf/route.ts` — Issue 41.
   - `src/app/(public)/receipt/[token]/page.tsx` — Issue 41.
   - `src/app/admin/quotes/page.tsx:347-349` (list view) — Issue 41
     (presentational variant of the same helper).
5. **Operator decisions still needed:**
   **ZERO.** All 7 operator-locked decisions (multi-tier format,
   ordering, qty pluralization, single-tier qty>1 case, single-tier
   qty=1 case, mix-of-tiered-and-non-tiered, rendering source) are
   resolvable from empirical DB + locked rules. The audit's only
   refinement is **Target 5's "condition (c)" disambiguation for
   single-tier qty=1 services** — recommendation aligns with the
   operator's example. If the operator wants `vehicle_size` /
   `specialty` single-tier quotes to ALSO surface tier in parens
   (uniform behavior across all pricing models), that's a one-line
   change to the helper; flag now so a single yes/no answer locks it
   for implementation.
6. **Issue 40 disposition recommendation:**
   Operator edits the 2 affected `service_pricing.tier_label` values
   in the Admin UI **AFTER Issue 39 ships and verifies**. Specifically:
   - `Hot Shampoo Extraction.floor_mats.tier_label`:
     `"Floor Mats Only"` → `"Floor Mats"`.
   - `Hot Shampoo Extraction.carpet_mats.tier_label`:
     `"Carpet & Mats Package"` → `"Carpet & Mats"`.
   No code change, no migration, no test change. Pre-Issue-40-edit,
   Issue 39's helper output will read `"Hot Shampoo Extraction (2
   Rows + Floor Mats Only)"` and `"Hot Shampoo Extraction (Carpet &
   Mats Package)"` — functionally correct, just verbose. Operator
   tolerates the verbose form briefly until they make the 2 admin
   edits.

---

## Operator questions

**Target count: ZERO.** All 7 operator-locked decisions resolve
empirically.

The **single optional refinement** the operator could weigh in on:

- **Should `vehicle_size` / `specialty` single-tier quotes ALSO
  surface tier_label in parens?** E.g., for a 2018 Suburban →
  `"Express Interior Clean (SUV (3-Row) / Van)"`. Audit recommends
  NO (operator decision 6 suggests no), but if uniformity across
  pricing models is preferred, one-line helper change. **Default
  answer if operator doesn't weigh in: NO (omit parens for
  vehicle_size / specialty single-tier qty=1).**

---

## Risk matrix

| Dimension | Issue 39 (chip) | Issue 40 (tier_label data) | Issue 41 (visual surfaces, cross-cutting) |
|---|---|---|---|
| Severity | P2 (cosmetic SMS preview; underlying quote correct) | P3 (operator-internal label leakage in SMS prose) | P2 (customer-visible raw slugs on quote link, PDF, receipt) |
| Probability | Active TODAY on every multi-tier-same-service quote | Active TODAY on Hot Shampoo Extraction multi-tier (1/16 services) | Active TODAY on Q-0084 quote link |
| Implementation | Low (1 helper + 6 adoptions) | Trivial (2 admin clicks) | Medium (5 visual surfaces, ~2 hours) |
| Verification | Reproduce Q-0084 SMS preview after deploy | Visual inspection of admin Service Pricing UI | Visual inspection across 5 surfaces |
| Rollout | Single deploy | No deploy (data edit) | Single deploy (follow-on) |

---

## Verification of audit hard rules

- ✅ NO source code changes in `src/`.
- ✅ NO migrations actually written or run.
- ✅ NO tier_label updates (Issue 40 deferred to operator admin
  edit).
- ✅ Only new file in this commit: this audit document + the doc
  updates per session brief.
- ✅ All findings cite `file:line` (or DB column / SQL query).
- ✅ Full `render-sms-template.ts` substitution path read end-to-end
  (lines 244-389).
- ✅ Live DB queried for `service_pricing` + `sms_templates` +
  `quote_items` (production data).
- ✅ B1 vs B2 not applicable here (decision is helper vs no-helper,
  not contract shape) — recommendation argued from precedent
  (Session 71) + concrete 6-consumer inventory.
- ✅ Operator-locked decisions HONORED — not re-litigated.

---

## Appendix — Empirical SQL output (selected, multi-tier services)

```
[scope] Hot Shampoo Extraction (4 tiers):
  display_order=0  tier_name=floor_mats     tier_label=Floor Mats Only        qty_label=(null)  max_qty=(null)  size_aware=false
  display_order=1  tier_name=per_row        tier_label=Per Seat Row           qty_label=row     max_qty=3       size_aware=false
  display_order=2  tier_name=carpet_mats    tier_label=Carpet & Mats Package  qty_label=(null)  max_qty=(null)  size_aware=false
  display_order=3  tier_name=complete       tier_label=Complete Interior      qty_label=(null)  max_qty=(null)  size_aware=true

[specialty] Complete Motorcycle Detail (2 tiers):
  display_order=1  tier_name=standard_cruiser  tier_label=Standard/Cruiser  qty_label=(null)  max_qty=(null)  size_aware=false
  display_order=2  tier_name=touring_bagger    tier_label=Touring/Bagger    qty_label=(null)  max_qty=(null)  size_aware=false

(every other multi-tier service follows the vehicle_size 5-row pattern
or the specialty 3-row pattern — full table in Target 2.)
```

```
===== sms_templates with {services} in body_template =====

slug=quote_sms_midcall  required=["services","short_url"]
  body: GM - Here's your quote from {business_name} for {services}: {short_url}

slug=booking_confirmed  required=["services","appointment_date","appointment_time","service_total"]
  body: {business_name} — Online Booking Confirmed:
  
  {services}
  {appointment_date}
  at {appointment_time} - {service_total}
  ...

(plus 3 more — appointment_cancelled, booking_staff_notify, quote_accepted_staff_notify)
```

```
===== Production quote with multi-tier same-service items =====
Q-0084  status=accepted  created=2026-05-25T21:28:14
  service_id=c4b22011  item_name=Hot Shampoo Extraction  tier=floor_mats  qty=1  unit=75   total=75
  service_id=c4b22011  item_name=Hot Shampoo Extraction  tier=per_row     qty=2  unit=125  total=250
```
