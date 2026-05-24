# Issue 33 — Combo/Bundle Pricing Diagnostic (2026-05-24)

> Read-only audit of every quote-creation path in the codebase. Output: a
> root-cause fix specification that addresses the customer-facing fidelity
> gap surfaced by Test 4 / Q-0084 (agent quoted $435 with a $25 bundle
> discount; quote rendered $460 with no combo applied).
>
> Workstream J Session 4 shipped a prompt-rule workaround telling the
> agent to verify combos via `get_services` before mentioning them. That
> workaround violates the operator's "never take the lazy path"
> principle (CLAUDE.md). This diagnostic exists to eliminate it.

## TL;DR

**What was found:** Combo pricing is a real data-model concept — it lives
in the `service_addon_suggestions` table with `combo_price`,
`primary_service_id`, `addon_service_id`. The data is well-defined and
operator-editable from the admin UI. But the application of that data is
inconsistent across quote-creation paths.

**Eight quote-creation code paths audited. Two correctly apply combos
(POS quote builder + POS sale flow, via the client-side reducer pattern
that requires the operator to explicitly mark an addon as "added under
this anchor" at add-time). Four DO NOT apply combos at all (SMS-AI v2
`send_quote_sms`, voice-agent `quotes`, Twilio webhook auto-quote,
`voice-post-call` finalize). One has a partial/incoherent path (public
online booking form — combo price flows through from the client, but
`pricing_type` is hard-coded to `'standard'`, breaking the audit trail).
One is N/A (voice-agent `appointments` direct booking writes
`price_at_booking: 0`).**

**Why combos aren't applied today:** `resolvePrice(service, sizeClass)`
in `src/lib/services/service-resolver.ts:168` is per-service. It cannot
detect combo eligibility because eligibility depends on the SET of
services in the quote (anchor + addon co-occurrence). The agent paths
all loop over service names and call `resolvePrice` once per service —
they never look at the cross-product.

**Recommended approach: C — extract a server-side `applyCombosToQuoteItems`
helper.** Keep `resolvePrice` per-service (the right abstraction).
Add a second pass that detects combo eligibility from
`service_addon_suggestions` given the full set of `service_id`s being
quoted, then rewrites the addon line item's `unit_price` /
`standard_price` / `pricing_type`. Each agent path adopts via a single
line addition. POS paths stay as-is (their reducer already does the
equivalent client-side). Public booking form migrates to the same helper
in a follow-up sub-session for data-model consistency.

**Estimated implementation effort:** **1 focused session** for the
helper + 4 agent path adoptions + tests. **1 optional follow-up session**
for the booking form migration. Total **1-2 sessions**.

**Open questions requiring operator input** (see "Open questions" below):
- Q1 — When an addon bundles with multiple potential anchors that are
  both in the quote, which combo wins? Lowest price? Highest savings?
  First match?
- Q2 — Should `get_services` derive `standard_price` for size-aware
  addons? Today it returns `null` for them, so the agent can't surface
  savings figures.
- Q3 — Combo vs sale interaction: the POS reducer uses "lowest wins"
  (combo OR sale, whichever is lower). Confirm same policy applies to
  agent paths.
- Q4 — Persist `combo_source_primary_id` as a new `quote_items` column?
  POS reducer tracks it in memory but doesn't persist. Currently
  `pricing_type='combo'` + `standard_price` is sufficient audit; adding
  the column is optional.
- Q5 — Public booking form scope: migrate to the new helper in the same
  session (recommended for consistency), or defer to a separate session?

---

## Audit findings by target

### Target 1: Pricing data model

**Table: `service_addon_suggestions`** (`docs/dev/DB_SCHEMA.md` ~line
2283).

Columns:
- `id` UUID PK
- `primary_service_id` UUID NOT NULL FK → `services(id)` — the anchor
  service that triggers the combo
- `addon_service_id` UUID NOT NULL FK → `services(id)` — the add-on
  service that gets the discounted price when the anchor is also in the
  ticket
- `combo_price` NUMERIC(10,2) — the bundled price (replaces the addon's
  standalone price)
- `display_order` INTEGER NOT NULL DEFAULT 0
- `auto_suggest` BOOLEAN NOT NULL DEFAULT true
- `is_seasonal` BOOLEAN NOT NULL DEFAULT false
- `seasonal_start` / `seasonal_end` DATE — seasonal window
- `created_at` TIMESTAMPTZ

Composite UNIQUE: `(primary_service_id, addon_service_id)` — one combo
per (anchor, addon) pair. The same addon can have combo rows for
multiple different anchors.

CHECK: `primary_service_id <> addon_service_id` (no self-combo).

**Sample for the Test 4 case** (operator-confirmed by DB query):
```
service_addon_suggestions row:
  primary_service_id = (Express Interior Clean's UUID)
  addon_service_id   = (Pet Hair & Dander Removal's UUID)
  combo_price        = 100.00
  auto_suggest       = true
  is_seasonal        = false
```

Pet Hair's standalone price is `$125` (its `flat_price` since the
service's `pricing_model = 'flat'` per the get_services standard_price
derivation logic at `src/app/api/voice-agent/services/route.ts:130-138`).
Combo price `$100` → savings `$25` when Express Interior is in the
quote.

**No combo data is size-class-dependent.** `combo_price` is a single
flat number per (anchor, addon) pair. There is no per-size-class column
on `service_addon_suggestions`. This is a design choice; if combos
needed to vary by vehicle size in the future, the schema would need a
size-aware extension. Out of scope here.

**No combo data is tier-dependent.** The combo applies regardless of
which `service_pricing` tier the anchor is at.

**No `combo_savings_amount` column.** Savings is computed as
`addon_standalone_price - combo_price` at read time (see voice-agent/
services/route.ts:141-143).

**Schema is sufficient. NO migrations needed for the root-cause fix.**

### Target 2: get_services tool behavior

**Endpoint:** `src/app/api/voice-agent/services/route.ts` (full file
read).

The endpoint runs three queries:
1. Services + `service_pricing` tiers (line 29-59)
2. `service_addon_suggestions` filtered by `auto_suggest=true` (line
   75-91)
3. `service_prerequisites` (line 95-104)

Per-service response shape includes `addon_suggestions: [...]` where
each entry is:
```typescript
{
  addon_name: string,
  addon_id: string,
  standard_price: number | null,
  combo_price: number | null,
  savings: number | null,
}
```

**Sample agent-visible response for Express Interior Clean** (the
Test 4 anchor):
```json
{
  "id": "<express-interior-uuid>",
  "name": "Express Interior Clean",
  "pricing": [{ "tier_name": "sedan", "price": 85.00 }, ...],
  "addon_suggestions": [
    {
      "addon_name": "Pet Hair & Dander Removal",
      "addon_id": "<pet-hair-uuid>",
      "standard_price": 125.00,
      "combo_price": 100.00,
      "savings": 25.00
    },
    ...
  ]
}
```

The agent's view of combo eligibility is correct. The agent knows
"Pet Hair bundles to $100 if Express Interior is in the quote."

**Known limitation in `standard_price` derivation** (route.ts:130-138):

```typescript
let standardPrice: number | null = null;
if (addon.pricing_model === 'flat' && addon.flat_price != null) {
  standardPrice = Number(addon.flat_price);
} else if (addon.pricing_model === 'per_unit' && addon.per_unit_price != null) {
  standardPrice = Number(addon.per_unit_price);
} else if (addon.pricing_model === 'custom' && addon.custom_starting_price != null) {
  standardPrice = Number(addon.custom_starting_price);
}
```

Size-aware addons (`pricing_model = 'vehicle_size'` or `'scope'`) get
`standard_price: null` in the tool response — because the standalone
price depends on the customer's vehicle and this endpoint has no
vehicle context. `savings` is therefore also null for those addons.

**Implication:** if an operator configures a combo where the ADDON is
size-aware (e.g., addon's standalone price varies by sedan vs SUV), the
agent sees `combo_price=100, standard_price=null, savings=null` and
cannot phrase savings to the customer. Worth flagging to the operator
(Q2 below) but not blocking the root-cause fix.

### Target 3: resolvePrice function behavior

**Function:** `resolvePrice(service, sizeClass, options?)` at
`src/lib/services/service-resolver.ts:168`.

Signature:
```typescript
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string | null | undefined,
  options: ResolvePriceOptions = {}
): ResolvedPrice;
```

Returns: `{ price, salePrice, tierName, isOnSale }`. No combo field.

Handles the 6 `pricing_model` branches via a switch:
- `flat` — synthesizes a `ServicePricing` row from `service.flat_price`
  + `sale_price`, delegates to `resolveServicePriceWithSale`.
- `vehicle_size` / `scope` — picks the size-aware tier or the matching
  `tier_name` row, delegates to the engine which selects the right
  per-size column.
- `per_unit` — synthesizes from `per_unit_price`.
- `specialty` — picks the `tier_name` matching `options.specialtyTier`,
  delegates.
- `custom` — returns `custom_starting_price` directly (operator-
  assessed).

**Structural reason combo logic can't live in resolvePrice:** the
function takes ONE service. Combo eligibility is a property of the SET
of services in the quote (anchor + addon co-occurrence). A per-service
resolver cannot know about the other items in the quote without a
signature change that would force every caller to pass a quote-context
parameter.

Approach A (refactor `resolvePrice` to take quote context) is
structurally rejected for this reason — see "Recommended approach"
below.

### Target 4: Every quote-creation code path

**8 paths audited. Combo handling status per path:**

| Path | File:lines | Trigger | Currently applies combos? | Required change |
|------|-----------|---------|---------------------------|-----------------|
| **POS quote builder** | `src/app/pos/context/quote-reducer.ts:124-218` | Operator clicks "Add as addon" in POS UI; `POST /api/pos/quotes/route.ts:35` persists via `createQuote` | ✅ YES — reducer applies `comboPrice` when `comboPrice < resolved.standardPrice && comboPrice <= effectivePrice`. Sets `pricingType: 'combo'`, `comboSourcePrimaryId`. Combos persist into `quote_items.unit_price` + `standard_price` + `pricing_type='combo'` | None (reference implementation) |
| **POS sale flow** | `src/app/pos/context/ticket-reducer.ts:180-284` | Operator clicks "Add as addon" during POS sale; `POST /api/pos/transactions` persists | ✅ YES — same reducer pattern, persisted to `transaction_items` | None (reference implementation) |
| **SMS-AI v2 `send_quote_sms`** | `src/app/api/voice-agent/send-quote-sms/route.ts:182-218` | SMS agent calls `send_quote_sms` tool; route resolves services + creates quote via `createQuote` | ❌ NO — calls `resolvePrice` per service in a loop (line 200); writes `pricing_type: isOnSale ? 'sale' : 'standard'` (line 208). No combo awareness. **THIS IS THE TEST 4 / Q-0084 FAILING PATH.** | Add `applyCombosToQuoteItems` call after the loop, before `createQuote` |
| **ElevenLabs voice agent direct quotes** | `src/app/api/voice-agent/quotes/route.ts:158-197` | ElevenLabs agent calls `/api/voice-agent/quotes` with service IDs + tier names | ❌ NO — does its OWN pricing (doesn't call `resolvePrice`). Loops over `serviceInputs`, picks `service_pricing` tier by name or first tier or `flat_price` (lines 167-187). No `pricing_type` written at all (line 189-196 — no `standard_price` either). Persisted via direct insert into `quote_items` at line 273 (not via `createQuote` helper). | Add `applyCombosToQuoteItems` call after the loop. Also: align with `createQuote` helper for `standard_price` / `pricing_type` columns going forward. |
| **Twilio inbound auto-quote (legacy)** | `src/app/api/webhooks/twilio/inbound/route.ts:801-816` | Legacy Twilio webhook auto-quote path | ❌ NO — same pattern as `send_quote_sms`. Loops, calls `resolvePrice`, writes `pricing_type: 'standard'` or `'sale'`. | Add `applyCombosToQuoteItems` call after the loop |
| **voice-post-call finalize** | `src/lib/services/voice-post-call.ts:516-528` (loop) → `createQuote` at line 615 | ElevenLabs post-call finalization cron + finalize-call endpoint | ❌ NO — same pattern. Loops, calls `resolvePrice`, writes `pricing_type`. | Add `applyCombosToQuoteItems` call after the loop |
| **Public online booking form** | `src/app/api/book/route.ts:444-484` (line items); `_pricing.ts:36-101` (server validation) | Customer submits booking form | ⚠️ HYBRID — primary service price is server-validated via `computeExpectedPrice`. Addon `unit_price` is accepted from the client AS-IS at line 473. The client-side booking form (`components/booking/step-service-select.tsx:248`) DOES surface `combo_price` to the user as "Add for $X" — so when the user clicks the addon, the client likely submits `combo_price` as `addon.price`. The server writes `pricing_type: 'standard'` (line 481) and `standard_price: addon.price` (line 480) — meaning the audit trail incorrectly says "standalone" and `standard_price` equals `unit_price` even when a combo was applied. Combo price flows through to `total_price` but data-model coherence is broken. | Migrate addon-write path to the same `applyCombosToQuoteItems` helper for server-side enforcement + correct `pricing_type` + `standard_price` columns. (Q5 — optional same-session or follow-up.) |
| **ElevenLabs voice agent appointments (direct booking)** | `src/app/api/voice-agent/appointments/route.ts:542-552` | ElevenLabs agent calls `/api/voice-agent/appointments` Branch B (no quote_id) | N/A — writes `price_at_booking: 0` by design (line 549). Quote conversion path (Branch A) inherits the quote's stored prices, so combo correctness flows from whatever path created the quote. | None directly — fixing the quote-creation paths above closes this transitively. |

**Critical finding:** No agent-callable quote-creation path correctly
applies combos today. The POS reducer pattern is the reference, but it
relies on an operator UI action to bind a combo at add-time. Agent
paths receive a flat service list with no per-item add-time binding —
they need server-side detection from `service_addon_suggestions`.

### Target 5: Existing test coverage

Tests for combo pricing:
- `src/app/pos/context/__tests__/ticket-reducer-edit-mode.test.ts` —
  references `comboSourcePrimaryId` (line 43). POS reducer combo
  invariants on edit.
- `src/app/pos/context/__tests__/ticket-reducer-vehicle-change.test.ts`
  — full combo+vehicle-swap coverage (lines 103-242). Verifies "swap
  preserves combo when combo price is still lowest", "swap drops combo
  when new resolved price is lower than combo".

Tests that DON'T exist but SHOULD:
- `src/lib/services/__tests__/service-resolver.test.ts` — verified via
  `grep -n "combo\b\|service_addon"` returns zero hits. No combo
  coverage at the service-resolver layer.
- `src/app/api/voice-agent/send-quote-sms/__tests__/route.test.ts` —
  no test asserts combo application when multiple bundleable services
  are quoted together. The new test file would seed
  `service_addon_suggestions` and verify the resulting quote items
  carry the combo `unit_price` + `standard_price` + `pricing_type='combo'`.
- `src/app/api/voice-agent/quotes/__tests__/route.test.ts` — does not
  exist; no test file for this path at all (would need to be created).
- `src/app/api/webhooks/twilio/inbound/__tests__/auto-quote-combo.test.ts`
  — does not exist for the auto-quote legacy path.
- `src/app/api/book/__tests__/booking-combo.test.ts` — `compute-expected-price.test.ts`
  + `modifier-persistence.test.ts` exist but neither covers combo
  pricing.
- A future `src/lib/services/__tests__/combo-resolver.test.ts` would
  pin the new helper's behavior.

**Gap ordered by importance:**

1. **`combo-resolver.test.ts`** (helper unit tests) — covers all
   combo-matching edge cases independently of route plumbing.
2. **`send-quote-sms/route.test.ts` combo describe block** — pins the
   path that surfaced Issue 33.
3. **`voice-post-call.test.ts` combo coverage** — same pattern as
   send_quote_sms.
4. **`webhooks/twilio/inbound` auto-quote combo coverage** — same.
5. **`voice-agent/quotes/route.test.ts`** — currently no tests at all.
6. **Booking form combo coverage** — depends on Q5 (in scope or
   deferred).

### Target 6: POS / admin UI combo behavior

**POS UI:** Combo pricing IS correctly applied at the UI/reducer layer
when an operator explicitly adds an addon via the suggestions surface.
Confirmed by reading `src/app/pos/context/quote-reducer.ts:182-188`
and `src/app/pos/context/ticket-reducer.ts:278-284`. The reducer takes
an explicit `comboPrice` + `comboPrimaryServiceId` from the dispatching
component, sets `pricingType: 'combo'` on the line item, and persists
through the standard `createQuote` / transactions write paths.

**Admin manual quote creation:** there is NO admin-only quote-creation
route — `src/app/api/admin/quotes/route.ts` is GET-only (lists quotes).
Admin operators create quotes by deep-linking to the POS quote builder
(per CLAUDE.md "Quotes are READ-ONLY in admin"). So admin manual quote
creation is structurally covered by the POS quote builder above.

**Admin catalog/services UI** (`src/app/admin/catalog/services/[id]/page.tsx`)
— this is the EDITOR for `service_addon_suggestions` rows. Allows
operator to set `combo_price`, `auto_suggest`, `is_seasonal`. Pure CRUD
on the suggestions table. No pricing application logic.

**Operator question Q5 (formal):** the public online booking form
(`src/app/api/book/route.ts:444-484`) is a customer-facing path that
already shows combo pricing in the UI. Its server-side data-model
coherence is broken (combo price flows through but `pricing_type` is
hardcoded `'standard'`). Should this be migrated to the new server-side
combo helper in the same root-cause-fix session, or deferred to a
follow-up? Recommendation: same session, since the helper is one
function and the public booking form is one of the most visible
customer-facing surfaces in the system.

---

## Recommended implementation approach

**Approach C — Extract a server-side `applyCombosToQuoteItems` helper.
Call it from every server-side quote-creation path. Keep `resolvePrice`
per-service as-is.**

### Why C over A/B/D

- **Not A (refactor `resolvePrice` to take quote context):** combos are
  a quote-LEVEL concept, not a service-LEVEL one. Forcing `resolvePrice`
  to know about other services in the quote pollutes its abstraction
  and breaks the per-service contract that 4+ callers depend on. The
  POS reducer's combo pass is structurally a second pass after
  per-service resolution — Approach C mirrors that proven structure.
- **Not B (two-pass logic duplicated in each path):** four agent paths
  would each grow ~40 lines of combo detection logic. Drift risk
  (combo policy diverges across paths over time). Same data-flow
  shape is centralized once in C.
- **Not D (a SQL function `compute_quote_total`):** the codebase does
  totals math in TypeScript (`computeQuoteTotals` in
  `src/lib/quotes/quote-service.ts:886`). Pushing pricing logic to SQL
  would split the canonical-engine invariant (CLAUDE.md Rule 22) and
  duplicate the model. Stay in TypeScript.

### Helper specification

**File:** `src/lib/services/combo-resolver.ts` (new).

**Signature:**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedQuoteItem {
  service_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  tier_name: string | null;
  standard_price: number | null;
  pricing_type: 'standard' | 'sale' | 'combo' | null;
}

export interface ComboResolverOptions {
  /**
   * "lowest wins" — the combo applies only when combo_price < the
   * item's current effective price (which may itself be a sale price).
   * Mirrors POS reducer policy at quote-reducer.ts:182-188.
   * Default: true. Set false to force combo regardless of sale.
   */
  lowestWins?: boolean;
  /**
   * When an addon has multiple potential anchors all present in the
   * quote (e.g. addon X bundles with both A and B), pick the lowest
   * combo_price for the addon. Mirrors operator answer to Q1.
   * Default: 'lowest_price'.
   */
  multipleAnchorTiebreak?: 'lowest_price' | 'first_match';
}

/**
 * Apply combo pricing across a fully-resolved quote-item list.
 *
 * Reads `service_addon_suggestions` for all service_id pairs in the
 * item list. For each row where both `primary_service_id` and
 * `addon_service_id` are in `items`, applies `combo_price` to the
 * addon item (mutating its `unit_price` to `combo_price`,
 * `standard_price` to the prior `unit_price`, `pricing_type` to
 * 'combo'). Honors `auto_suggest=true` and the seasonal window.
 *
 * Returns a new array (does NOT mutate input). Items with no matching
 * combo are returned unchanged.
 */
export async function applyCombosToQuoteItems(
  admin: SupabaseClient,
  items: ResolvedQuoteItem[],
  options?: ComboResolverOptions,
): Promise<ResolvedQuoteItem[]>;
```

**Algorithm:**

1. Extract `serviceIds = items.map(i => i.service_id).filter(distinct)`.
   If empty, return `items` unchanged.
2. Query `service_addon_suggestions` where
   `primary_service_id IN serviceIds AND addon_service_id IN serviceIds
   AND auto_suggest = true` AND seasonal-window check (today >=
   seasonal_start OR seasonal_start is null) AND (today <=
   seasonal_end OR seasonal_end is null).
3. Build a map `addonId → [matchingComboRows]`.
4. For each item where `addonId in map`:
   - Compute candidate combo rows where the row's `primary_service_id`
     is ALSO in the item list (anchor present).
   - Pick the winning combo per `multipleAnchorTiebreak` option.
   - Apply: `unit_price = combo_price`, `standard_price = original
     unit_price`, `pricing_type = 'combo'` IFF
     `lowestWins ? combo_price <= unit_price : true`.
5. Return the mutated copy.

**Call sites to update:**

| Path | Line | Insertion point |
|------|------|-----------------|
| `src/app/api/voice-agent/send-quote-sms/route.ts` | After line 211 (`perf.mark('resolve:services_batch', t)`) and BEFORE the line ~220 `if (quoteItems.length === 0)` check | `quoteItems = await applyCombosToQuoteItems(admin, quoteItems);` (or `let quoteItems = ...` rebind) |
| `src/app/api/voice-agent/quotes/route.ts` | After line 197 (end of `for (const input of serviceInputs)` loop) and BEFORE line 199 `const subtotal = ...` | Same; reuses the helper |
| `src/app/api/webhooks/twilio/inbound/route.ts` | After line 817 (end of the auto-quote `for` loop) and BEFORE line 819 `if (quoteItems.length > 0)` | Same |
| `src/lib/services/voice-post-call.ts` | After line 528 (end of the pricing `for` loop) and BEFORE the `createQuote` call at line 615 | Same |
| `src/app/api/book/route.ts` (Q5 in scope) | After line 484 (end of `data.addons.map(...)` line items array build) and BEFORE the transaction insert | Helper called only on the addons subset; primary service's price stays server-validated |

Each call site adds approximately ONE LINE. The helper is the entirety
of the new logic.

### Why this respects the operator's reuse principle

- **Reuses** `service_addon_suggestions` (existing table). No new
  columns. No new migrations.
- **Reuses** the existing `pricing_type='combo'` + `standard_price`
  fields on `quote_items` + `transaction_items` (already validated by
  `quoteItemSchema` at `src/lib/utils/validation.ts`).
- **Reuses** the operator-edited combo data from the admin catalog UI
  (single source of truth).
- **Reuses** the same `lowest wins` + `pricingType: 'combo'` semantics
  the POS reducer has used since the reducer was built — combo behavior
  is now consistent across POS UI + every agent path.
- **NO parallel pricing system.** The new helper is a thin pass over
  `resolvePrice`-resolved items, not a replacement.

---

## Implementation specification (next session)

### Files to add

- `src/lib/services/combo-resolver.ts` — new helper (~100 lines:
  signature, options interface, algorithm, exports).
- `src/lib/services/__tests__/combo-resolver.test.ts` — unit tests
  for the helper (~15-20 tests covering all match scenarios).

### Files to modify

- `src/app/api/voice-agent/send-quote-sms/route.ts` — one-line addition
  after the per-service loop. Test coverage in existing
  `send-quote-sms/__tests__/route.test.ts` (new describe block).
- `src/app/api/voice-agent/quotes/route.ts` — one-line addition. New
  test file `voice-agent/quotes/__tests__/route.test.ts` (currently no
  tests for this route).
- `src/app/api/webhooks/twilio/inbound/route.ts` — one-line addition in
  the legacy auto-quote path. Test coverage in a new
  `webhooks/twilio/inbound/__tests__/auto-quote-combo.test.ts`.
- `src/lib/services/voice-post-call.ts` — one-line addition. Test
  coverage in (existing or new) `voice-post-call.test.ts` combo
  describe.
- `src/app/api/book/route.ts` (Q5 scope-dependent) — addon write path
  migration to the helper. Booking client UI no change.

### Files to UPDATE (rollback Session 4 prompt rule)

- `src/lib/sms-ai/system-prompt.ts` — DELETE the
  `## Combo and bundle pricing — confirm before stating` subsection
  added in Workstream J Session 4 (lines ~164-194 in current state).
  The rule was a temporary workaround; the root-cause fix obsoletes it.
  The agent can return to confidently quoting `get_services` combos
  because the endpoint will now produce them.
- `src/lib/sms-ai/__tests__/system-prompt.test.ts` — DELETE the
  `describe('Workstream J Session 4 (Issue 33 combo-pricing mitigation)')`
  block.

### Test plan

For each agent path, add at minimum:

1. **Combo HIT** — quote includes both anchor + addon → addon's
   `unit_price = combo_price`, `standard_price = original`,
   `pricing_type = 'combo'`.
2. **Combo MISS no anchor** — quote has addon but NOT anchor → addon
   priced at standalone.
3. **Combo MISS no addon** — quote has anchor but NOT bundleable addon
   → anchor priced normally; no addon to discount.
4. **Multiple anchors for one addon** — addon bundles with both A and
   B; quote has all three → lowest combo_price wins (per Q1 default).
5. **Combo + sale interaction** — addon also has a sale price; verify
   "lowest wins" policy applies (per Q3).
6. **Seasonal combo out of season** — `seasonal_end < today` → combo
   NOT applied; addon priced at standalone.
7. **`auto_suggest = false`** — combo row exists but flagged off →
   not applied.

Total estimated test count delta: **+30 to +40** (15-20 helper unit
tests + ~5 per agent path × 4-5 paths).

### Manual verification scenario (operator post-deploy)

Reproduce Test 4 / Q-0084:
1. SMS the test phone: "Hi need express interior on my Honda Accord
   with pet hair removal and stain treatment please".
2. Agent says: "Express Interior is $85, Pet Hair bundles in for $100
   (saves $25), Stain Treatment is $175 — total $360." (Approximate
   prices.)
3. Customer: "Yes send it".
4. Verify: SMS receipt arrives, quote total matches what the agent
   said.
5. Operator DB check: `SELECT item_name, unit_price, standard_price,
   pricing_type FROM quote_items WHERE quote_id = <new quote id>;`
   Expect Pet Hair row: `unit_price=100, standard_price=125,
   pricing_type='combo'`.

---

## Open questions for operator

**Q1 — Multiple-anchor tie-break.** Pet Hair & Dander Removal could
bundle with both Express Interior ($100) AND Signature Complete (say,
$90). If the customer's quote has all three (Express + Signature + Pet
Hair), which combo wins for Pet Hair?

Recommended: **lowest combo_price wins** (Pet Hair → $90, attributed
to Signature anchor). Maximizes customer savings, predictable rule.

Alternative: highest savings — would require deriving standalone first
then computing savings. More expensive at runtime. Lowest-price is
equivalent for the same addon since standalone is fixed.

**Q2 — Size-aware addon standard_price in `get_services` response.**
Currently the endpoint returns `standard_price: null` for addons whose
`pricing_model` is `'vehicle_size'`/`'scope'`/`'specialty'` because the
catalog endpoint has no vehicle context. So combos involving size-aware
addons can't expose savings figures to the agent.

Recommended: leave as-is for now (no agent surface for size-aware
combos). Document the limitation. If operators commonly configure
size-aware-addon combos, the fix is a separate session that adds
vehicle-context awareness to `get_services` (or has the agent classify
vehicle first then re-query).

**Q3 — Combo vs sale interaction policy.** POS reducer uses
"lowest wins" (combo_price applies only if `combo_price <=
effectivePrice`, where `effectivePrice` is sale-aware). Confirm same
policy applies server-side.

Recommended: **YES, same policy**. The customer should always see the
lowest of (standard, sale, combo) per line item. POS reducer is the
reference.

**Q4 — Persist `combo_source_primary_id` as a `quote_items` column?**
The POS reducer tracks `comboSourcePrimaryId` in memory but doesn't
persist it. Currently `pricing_type='combo'` + `standard_price` gives
"this line was discounted from $X to $Y via a combo" but doesn't
record which anchor triggered the combo.

Recommended: **defer to a future session if needed**. For the
immediate fix, the existing pricing_type + standard_price columns
provide sufficient audit trail. If operator wants per-row "bundled
with [anchor name]" display, a follow-up session adds the column +
migrates POS reducer to persist it.

**Q5 — Public booking form scope.** The booking form
(`src/app/api/book/route.ts`) has a partial/incoherent combo flow
today: combo prices flow through from the client UI, but server-side
writes `pricing_type='standard'` and `standard_price=addon.price`
(losing combo audit trail). Fix in the same session as the agent
paths, or defer?

Recommended: **same session**. The helper is one function; adding it
to the booking-form addon write path is one line. Customer-facing
fidelity is the bar — the booking form is a high-visibility customer
surface. Letting it stay incoherent while fixing the SMS path is
inconsistent.

---

## Risk matrix

| Change | Files touched | Blast radius | Risk level |
|---|---|---|---|
| New `combo-resolver.ts` + tests | 2 new files | New surface, no existing callers | LOW — additive |
| `send-quote-sms/route.ts` insertion | 1 file (~3 lines added: import + call + assign) | SMS-AI v2 agent quote path + any caller of this endpoint | LOW-MEDIUM — happy path unchanged when no combos eligible; tests pin invariants |
| `voice-agent/quotes/route.ts` insertion | 1 file (~3 lines) | ElevenLabs agent direct quotes | LOW-MEDIUM — same |
| `webhooks/twilio/inbound/route.ts` insertion | 1 file (~3 lines) | Legacy Twilio auto-quote (largely deprecated path) | LOW — same |
| `voice-post-call.ts` insertion | 1 file (~3 lines) | Voice post-call finalize + cron | LOW-MEDIUM — same |
| `book/route.ts` migration (Q5 in scope) | 1 file (~10 lines, refactoring the addon line-items build) | Public online booking form (high traffic) | MEDIUM — covered by tests; the booking client UI is unchanged so customer-facing UX is identical; only the persisted `pricing_type` + `standard_price` columns become accurate |
| `system-prompt.ts` rollback of Session 4 combo rule | 1 file (~30 lines deleted) | SMS-AI v2 prompt | LOW — rule was a workaround; endpoint now produces correct combos so the rule is obsolete; revert is a clean delete |
| `system-prompt.test.ts` rollback | 1 file (~3 tests deleted) | Test coverage | LOW — tests pinned obsolete behavior |

**No schema migrations. No new tables. No new columns. No new tools.
No tool schema changes. No prompt additions (only the Session 4
workaround removal).**

---

## What this diagnostic deliberately does NOT cover

- **Per-vehicle-size combo pricing.** The current schema has one
  `combo_price` per (anchor, addon) pair. If operators want different
  combo prices for sedan vs SUV, that's a schema change (separate
  workstream).
- **Combo cascading / N-way bundles.** A row in `service_addon_suggestions`
  is a 1-to-1 (anchor, addon) pair. There is no "3-service bundle" or
  "buy 2 get 1 free" structure. If operators want those, it's a new
  data-model layer.
- **Time-of-day or day-of-week combos.** Seasonal window only.
- **Per-customer-tier or loyalty-aware combos.** Out of scope.
- **Refactoring `resolvePrice` signature.** Approach A rejected per
  Target 3 reasoning.
- **The 7-path customer find-or-create duplication** (separate concern,
  flagged in the Name-First Customer Creation diagnostic).
