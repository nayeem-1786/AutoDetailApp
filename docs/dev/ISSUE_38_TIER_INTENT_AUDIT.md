# Issue 38 — Tier Intent Communication Gap Audit (2026-05-25)

> Read-only diagnostic audit. Verifies the architectural shape of the
> tier-intent communication gap between the SMS-AI v2 agent and quote
> creation, and recommends a fix path.
>
> Same architectural class as Issue 36 (size_class dimension, closed via
> D40+D41). Issue 38 is the **tier** dimension within a service whose
> tier identity the agent cannot convey to the quote-creation tool.
>
> No source code modified. Evidence cited inline with `file:line` refs.

---

## TL;DR

**Recommendation: B1 (tier_name strings + quantity ints).** B2 (UUID
`service_pricing_id`s) is rejected on three independent grounds: (1) the
existing canonical tier identity in `quote_items.tier_name` (TEXT, no
UUID FK) and the existing `bookingSubmitSchema.tier_name` parameter
(string, optional, nullable) are both string-based — B1 mirrors the
proven precedent, B2 introduces a new pattern with no in-codebase
precedent; (2) the LLM's working context already contains `tier_name`
strings (the `get_services` response emits them at
`src/app/api/voice-agent/services/route.ts:278-282`) but does NOT emit
`service_pricing.id` UUIDs — B2 requires extending the catalog response
surface; (3) string round-tripping survives prompt-cache resets and is
human-debuggable in logs, where UUIDs are not.

**Root cause:** `send_quote_sms` accepts only a comma-separated service
name string. `resolveServiceByName` returns the parent service; the
downstream `resolvePrice` at `src/lib/services/service-resolver.ts:295`
hard-codes a tier-selection precedence (`sizeAwareTier` wins → then
`matchingTier` by sizeClass → then `tiers[0]`) that ignores the agent's
verbalized intent. For Hot Shampoo Extraction (the empirical case),
`complete` is the only size-aware tier, so the size-aware branch always
wins regardless of which tier the agent quoted to the customer. The
same bug class affects `Complete Motorcycle Detail` (always quotes the
first tier — `standard_cruiser` — when the agent verbalized
`touring_bagger`), and the gap also includes `quote_items.quantity`
which is hardcoded to `1` at three call sites despite
`service_pricing.max_qty=3` being configured on the `per_row` tier
explicitly to support multi-row quoting.

**Blast radius:** today, 1 confirmed customer-facing fidelity gap on
Hot Shampoo Extraction (scope, 4 tiers, 1 size-aware) + 1 latent gap
on Complete Motorcycle Detail (specialty, 2 tiers, both non-size-aware
— always quotes `standard_cruiser`). Three call sites:
`src/app/api/voice-agent/send-quote-sms/route.ts:201`,
`src/app/api/webhooks/twilio/inbound/route.ts:807`,
`src/lib/services/voice-post-call.ts:519` — all use the same
`resolvePrice(service, sizeClass)` shape with no tier-intent argument.

**Implementation scope (recommended fix):** ~1 focused session
(estimate: 90-120 minutes). Files to change: `src/lib/sms-ai/tools.ts`
(schema), `src/lib/sms-ai/system-prompt.ts` (prompt guidance for new
params), `src/app/api/voice-agent/send-quote-sms/route.ts` (parse
parallel `tiers` + `quantities` CSVs, build per-item args), one new
function-level overload or option arg on
`src/lib/services/service-resolver.ts:resolvePrice` to accept
`options.tierName` and honor it for scope/specialty branches. The
twilio inbound + voice-post-call paths inherit the new option only
when their callers can supply a tier — until then, they keep current
"first/auto" behavior under the unchanged default. Tests: +12 to +18
across the three affected modules.

**Existing wrong-priced quote (Q-0084, $450 instead of $250):** keep,
do not void or refund. The audit confirms this matches Issue 36's
disposition (per the Q3 from the prior quote-source-tracking session)
— the quote is real, the customer has the link, and a unilateral void
inserts more confusion than the price gap itself. Operator should
follow up directly with the customer if they push back.

---

## Root cause statement

`send_quote_sms` cannot convey two pieces of agent-verbalized intent
(which tier inside a multi-tier service, and how many units of that
tier) to the quote creation path; `resolvePrice` reacts by deterministically picking the size-aware-first tier with quantity=1, even when the agent told the customer otherwise.

---

## Target 1 — Tier identity contract end-to-end

### 1.1 Database shape

`service_pricing` (per `docs/dev/DB_SCHEMA.md:2363-2395`):

- PK: `id UUID`.
- Composite UNIQUE: `(service_id, tier_name)` — see
  `service_pricing_service_id_tier_name_key`.
- Columns relevant to tier identity:
  - `tier_name TEXT NOT NULL` — canonical machine identifier
    (e.g., `floor_mats`, `per_row`, `carpet_mats`, `complete`,
    `sedan`, `truck_suv_2row`, `standard_cruiser`, `touring_bagger`).
  - `tier_label TEXT NULL` — human display label
    (e.g., `Per Seat Row`, `Complete Interior`, `Standard/Cruiser`).
  - `is_vehicle_size_aware BOOLEAN NOT NULL DEFAULT false`.
  - `vehicle_size_{sedan,truck_suv,suv_van,exotic,classic}_price` —
    per-size dispatch when size-aware.
  - `max_qty INTEGER` + `qty_label TEXT` — designed for multi-quantity
    tiers (e.g., `per_row` has `max_qty=3, qty_label='row'`).

Two equally-valid tier identifiers: the `id` UUID, and the `(service_id, tier_name)` composite. **The composite is the existing canonical contract** because that is what `quote_items.tier_name` stores (no UUID FK).

### 1.2 `get_services` response shape — what the LLM sees per tier

At `src/app/api/voice-agent/services/route.ts:267-283` (the scope /
vehicle_size / specialty branch) the per-tier emission is:

```ts
pricing = tiers.map((p) => {
  const r = resolveServicePriceWithSale(p, sizeClass, saleWindow);
  return {
    tier_name: p.tier_name,
    price: r.standardPrice,
    ...(r.isOnSale ? { sale_price: r.effectivePrice } : {}),
  };
});
```

**Fields exposed to the LLM:** `tier_name`, `price`, optional `sale_price`, optional `note` (only on `per_unit`/`custom`).

**Fields NOT exposed:** `tier_label`, `id` (UUID), `max_qty`, `qty_label`,
`is_vehicle_size_aware`. The LLM has access to the machine `tier_name`
string but does not see the human label or the multi-quantity affordance.

For Hot Shampoo Extraction at `size_class=suv_3row_van`, the LLM receives:

```jsonc
[
  { "tier_name": "floor_mats",  "price": 75  },
  { "tier_name": "per_row",     "price": 125 },
  { "tier_name": "carpet_mats", "price": 175 },
  { "tier_name": "complete",    "price": 450 }   // size-resolved (D41)
]
```

### 1.3 Agent's mental model of tier identity

When the agent verbalized "Per Row × 2 = $250" (Issue 38 evidence,
2026-05-25 00:14 PT), it had `{ tier_name: "per_row", price: 125 }` in
its working context. **The agent has a stable identifier (`tier_name`)
that it could pass back to `send_quote_sms` today — but the tool schema
has no parameter to receive it.**

`send_quote_sms` accepts only `services: string` (comma-separated names):
`src/lib/sms-ai/tools.ts:233-244`.

---

## Target 2 — `resolvePrice` tier selection logic

`src/lib/services/service-resolver.ts:251-382`. Decision table by
`pricing_model`:

| pricing_model    | Tier selection precedence                                                                                              | Issue-38 vulnerability                                                                                                                                          |
|------------------|------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `flat`           | Synthesizes a row; no tier selection.                                                                                  | None.                                                                                                                                                           |
| `vehicle_size`   | `sizeAwareTier` (first tier with `is_vehicle_size_aware=true` AND `vehicle_size_sedan_price != null`) → `matchingTier` (`tier_name === sizeClass`) → `tiers[0]`. | None observed in inventory — all 8 active vehicle_size services use the ROW-BASED pattern (one tier per size_class, all `is_vehicle_size_aware=false`); `matchingTier` always wins. |
| `scope`          | Same precedence as `vehicle_size`. **Line 295-299.**                                                                   | **YES** — Hot Shampoo Extraction has `complete` as a size-aware tier alongside 3 non-size-aware tiers. `sizeAwareTier` wins unconditionally; agent intent for `per_row` is silently discarded.       |
| `per_unit`       | Synthesizes a row from `service.per_unit_price`; no tier selection.                                                    | None for tier selection — but quantity is hardcoded at the callers (see Target 5).                                                                              |
| `specialty`      | `tiers.find(t => t.tier_name === options.specialtyTier) ?? tiers[0]` (line 336-338).                                  | **YES** — all three callers omit `options.specialtyTier`, so `tiers[0]` always wins. Affects Complete Motorcycle Detail (`standard_cruiser` vs `touring_bagger`).                  |
| `custom`         | Returns `service.custom_starting_price`; no tier selection.                                                            | None.                                                                                                                                                           |
| default (unknown)| `tiers[0]` if any, else `service.flat_price`.                                                                          | Latent — unknown future pricing_model would silently take first tier.                                                                                           |

**Specifically for `scope` (the Issue 38 case):**

```ts
// src/lib/services/service-resolver.ts:295-299
const sizeAwareTier = tiers.find(
  (t) => t.is_vehicle_size_aware && t.vehicle_size_sedan_price != null
);
const matchingTier = tiers.find((t) => t.tier_name === sizeClass);
const tier = sizeAwareTier || matchingTier || tiers[0];
```

For Hot Shampoo Extraction the `complete` tier satisfies the
`sizeAwareTier` predicate; the agent's intent for `per_row` cannot
override it because the function signature has no input for tier intent
on the `scope` branch.

**Agent intent flow today:** only `sizeClass` reaches `resolvePrice`.
Quantity is not even an argument. `tierName` is returned but not
accepted.

**What changes for the fix:** add an optional `options.tierName` arg
(parallel to existing `options.specialtyTier`); honor it in the
`scope`/`vehicle_size`/`specialty` branches when present; fall through
to current precedence when absent. Backward compatible — existing
callers see byte-identical behavior.

---

## Target 3 — Scope-tiered services inventory

SQL (executed against linked Supabase project `zwvahzymzardmxixyfim` via
service-role key, 2026-05-25):

```sql
SELECT s.name, s.pricing_model, COUNT(sp.id) as tier_count, ...
FROM services s
JOIN service_pricing sp ON sp.service_id = s.id
WHERE s.is_active = true
GROUP BY s.id, s.name, s.pricing_model
HAVING COUNT(sp.id) > 1
ORDER BY s.pricing_model, s.name;
```

Result: **16 multi-tier active services.**

| pricing_model  | count | services                                                                                                                                                            |
|----------------|-------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `vehicle_size` | 8     | 1-Year Ceramic Shield, 3-Stage Paint Correction, 3-Year Ceramic Shield, 5-Year Ceramic Shield Plus, Express Exterior Wash, Express Interior Clean, Signature Complete Detail, Single-Stage Polish |
| `specialty`    | 7     | Aircraft Exterior Wash, Aircraft Interior Clean, Boat Exterior Wash, Boat Interior Clean, Complete Motorcycle Detail, RV Exterior Wash, RV Interior Clean           |
| `scope`        | 1     | **Hot Shampoo Extraction**                                                                                                                                          |

### 3.1 Active Issue-38 bug surface today

A service is Issue-38-vulnerable IFF:
- it has >1 tier AND
- (the bespoke `resolvePrice` branch cannot disambiguate without
  per-call agent intent).

Per Target 2 the vulnerable shapes are:
- `scope` with mixed size-aware + non-size-aware tiers — **Hot Shampoo Extraction** (4 tiers: `floor_mats`, `per_row`, `carpet_mats`, `complete`*; * = size-aware).
- `specialty` with multi-tier and no SMS-agent specialty-tier injection — **Complete Motorcycle Detail** (`standard_cruiser`, `touring_bagger`); the other 6 specialty services (aircraft/boat/RV) are out of scope for direct SMS quoting per Critical Rule 4 (escalate via `notify_staff` reason=`custom_quote`).

`vehicle_size` services are NOT Issue-38-vulnerable: their tier
selection is fully determined by `size_class` (via the
`matchingTier` branch — `tier_name === sizeClass`), and `size_class` is
runtime-injected by the dispatcher (D40, 2026-05-24).

### 3.2 Latent surface

Operator can add new multi-tier `scope` services via admin UI at any
time. The mixed-tier shape that triggers the bug is structural, not
configuration-specific. If a new scope-tiered service is added without
a size-aware tier mixed in, it would NOT trigger Issue 38 today (the
fallthrough goes to `matchingTier` → `tiers[0]`, which is the first
tier and matches the no-intent path). Adding a size-aware tier alongside
non-size-aware tiers — even unintentionally — reopens the bug.

---

## Target 4 — Existing tier-aware contracts in the codebase

**TL;DR: the codebase already uses `tier_name` (string) as the canonical
tier identifier in three places. There is NO existing
`service_pricing_id` (UUID) contract anywhere. B1 mirrors precedent; B2
introduces a new pattern.**

### 4.1 `quote_items` schema (the destination table)

`docs/dev/DB_SCHEMA.md:2048-2070`:

```
tier_name TEXT — (nullable)
```

No `service_pricing_id` column. No FK to `service_pricing`. Tier
identity in quote_items is **text-only**, by `tier_name`.

Writers (sample, all use `tier_name`):
- `src/lib/quotes/quote-service.ts:211` (the canonical `createQuote` for SMS/voice/booking)
- `src/lib/quotes/quote-service.ts:451` (the update path)

### 4.2 POS quote builder

`src/app/pos/context/quote-reducer.ts:124-216` (`ADD_SERVICE`):

The operator clicks a service → `routeServiceTap`
(`src/lib/services/picker-engine.ts:164-229`) → for multi-tier services
that don't satisfy the quick-add predicates the picker dialog opens →
operator selects a tier → `ADD_SERVICE` fires with the **fully-resolved
`pricing: ServicePricing`** row chosen by the operator. The reducer then
stamps `tierName: pricing.tier_label || pricing.tier_name` on the
ticket item (lines 143, 204).

Persisted to `quote_items.tier_name` when the POS ticket is saved as a
quote.

POS does NOT pass a UUID through `ADD_SERVICE`. It passes the full row
object and reads `tier_name`/`tier_label` off it.

### 4.3 Public online booking

`src/lib/utils/validation.ts:359-379` (`bookingSubmitSchema`):

```ts
service_id: z.string().uuid(),
tier_name: z.string().optional().nullable(),
price: positiveNumber,
```

`src/app/api/book/route.ts:77`:

```ts
const expectedPrice = computeExpectedPrice(serviceRow, data.tier_name, data.vehicle?.size_class);
```

`src/app/api/book/_pricing.ts:84-87`:

```ts
case 'vehicle_size':
case 'scope':
case 'specialty': {
  if (!tierName) return null;
  const tier = service.service_pricing.find((t) => t.tier_name === tierName);
  ...
```

The public booking API accepts a `tier_name` string and looks up the
tier by name. No UUIDs. This is the strongest in-codebase precedent for
B1.

### 4.4 Twilio inbound auto-quote + voice post-call

Both call `resolveServiceByName(admin, name) → resolvePrice(service, sizeClass)`:
- `src/app/api/webhooks/twilio/inbound/route.ts:802-807`
- `src/lib/services/voice-post-call.ts:514-519`

Identical shape to the SMS-AI send_quote_sms path. Same Issue-38 vulnerability.

---

## Target 5 — Quantity handling today

| Path                                                        | Quantity source                                                              |
|-------------------------------------------------------------|------------------------------------------------------------------------------|
| **POS** (`src/app/pos/context/quote-reducer.ts:199`)        | Hardcoded `quantity: 1` for non-`per_unit` services; `per_unit` uses `perUnitQty` from picker UI. |
| **Voice/SMS send-quote-sms** (`route.ts:205`)               | **Hardcoded `quantity: 1`** for every item.                                  |
| **Twilio inbound auto-quote** (`inbound/route.ts:813` area) | Hardcoded `quantity: 1`.                                                     |
| **Voice post-call finalize** (`voice-post-call.ts:523`)     | Hardcoded `quantity: 1`.                                                     |
| **Online booking** (`book/route.ts:380-384`)                | Hardcoded `quantity: 1` for the primary service item; per_unit handled separately. |

The Issue 38 evidence: agent verbalized "Per Row × 2 = $250", implying
quantity=2 against tier `per_row` (`unit_price=$125`). The
`service_pricing.per_row` row HAS `max_qty=3, qty_label='row'` — the
schema EXPRESSLY supports multi-quantity for this tier — but no current
caller passes anything other than 1. Fix scope: add `quantities` to the
tool schema and route, validate against `max_qty`, propagate to
`quote_items.quantity`.

---

## Target 6 — B1 vs B2 tradeoff

### B1: `tiers` + `quantities` string/int CSV parameters

**Tool schema change (`src/lib/sms-ai/tools.ts:229-244`):** add two
optional parameters parallel to `services`:

```jsonc
{
  "services":   { "type": "string", "description": "Comma-separated service names." },
  "tiers":      { "type": "string", "description": "Optional comma-separated tier_names parallel to services (empty token = auto)." },
  "quantities": { "type": "string", "description": "Optional comma-separated integer quantities parallel to services (default 1, bounded by service_pricing.max_qty)." }
}
```

**Endpoint validation needs** (`src/app/api/voice-agent/send-quote-sms/route.ts`):
- Parse `tiers` to string array; pad with empty strings to `serviceNames.length`.
- Parse `quantities` to int array; default to 1 per item; reject negative or non-integer.
- Per item: pass `{ options: { tierName: tierForIndex || undefined } }` into a new `resolvePrice` overload.
- After resolution: if `quantity > 1`, look up the chosen tier's `max_qty` and reject (or clamp + warn) if exceeded.

**LLM-friendliness:** **strong.** `tier_name` strings are already in
the LLM's working context from `get_services`. The agent verbalizes
prose like "Per Row" but has the canonical `per_row` string available
to pass back. Round-tripping is human-debuggable in PM2 logs.

**Error mode:**
- Misspelled tier (e.g., `peer_row`) — `_pricing.ts`-style behavior:
  return null/skip with a warn log AND surface to agent via
  `instructions_for_agent`. **Fail-loud, not silent-wrong.**
- Tier doesn't belong to service — same as misspelled (no `.find()` match).
- Quantity exceeds `max_qty` — reject with `instructions_for_agent` saying "max N rows".

**Backward compat:** both new params are optional. Existing tool
invocations that omit them get the EXACT current behavior (auto-tier,
quantity=1). Twilio inbound + voice-post-call inherit the new
`resolvePrice` overload only if their internal callers populate the
option — they don't today, so they keep current behavior.

### B2: `service_pricing_ids` (UUIDs)

**Tool schema change:** add `service_pricing_ids: array<string>` and a
parallel `quantities: array<int>`.

**Endpoint validation needs:**
- Look up `service_pricing` by UUID; reject if not found.
- Verify each UUID belongs to its corresponding `service_id` (or
  abandon the `services: string` param entirely).
- Resolve price from the tier row directly (bypass `resolveServiceByName`).

**LLM-friendliness:** **weak.** UUIDs are not currently exposed in
`get_services`. Adding them requires extending the response shape (a
new field per pricing entry — see Target 1.2). The LLM must then keep
the UUID associated with the tier across turns. UUIDs are opaque,
fragile to copy-paste errors, and unreadable in logs.

**Error mode:**
- UUID not found — endpoint rejects with 400.
- UUID belongs to wrong service — endpoint rejects (added validation).
- Stale UUID (operator deleted/recreated tier) — silent
  customer-facing failure.

**Backward compat:** worse than B1. The `services` param is now
redundant (UUID alone identifies the parent service via FK). Two paths
to choose from creates ambiguity (which wins? what if they disagree?).
Adding UUID without removing `services` invites drift; removing
`services` breaks existing callers.

**Whether `service_pricing.id` is reliably exposed to the agent in `get_services` today:**

NO. Verified at `src/app/api/voice-agent/services/route.ts:267-283`
and the `default:` branch at line 336-343. The per-tier emission drops
`p.id`. **B2 requires extending the catalog response surface.**

### B1 vs B2 scorecard

| Dimension                                | B1 (tier_name strings)                       | B2 (UUIDs)                                 |
|------------------------------------------|----------------------------------------------|--------------------------------------------|
| Mirrors `quote_items.tier_name` schema   | ✅ direct                                    | ❌ new field needed on quote_items, or translation layer at write |
| Mirrors `bookingSubmitSchema.tier_name`  | ✅ same shape                                | ❌ new pattern                             |
| LLM has identifier in context already    | ✅ from `get_services`                       | ❌ needs catalog endpoint change           |
| Debuggability in PM2 logs                | ✅ readable                                  | ❌ opaque                                  |
| Backward compatibility                   | ✅ optional, additive                        | ⚠ ambiguous with existing `services` param|
| Surface area of code change              | Small (3 files)                              | Larger (5 files incl. catalog endpoint + schema response)|
| Failure mode                             | Fail-loud + agent-recoverable via `instructions_for_agent` | Fail-loud on bad UUID, no agent recovery path|

**B1 wins on all 7 axes.** No tradeoff in B2's favor that the audit
could identify.

---

## Target 7 — Other tools with the same gap

Pattern check across the SMS-AI v2 tool surface:

| Tool                  | Tier-intent gap?                                                                                                            |
|-----------------------|------------------------------------------------------------------------------------------------------------------------------|
| `send_quote_sms`      | YES — the documented Issue 38 case.                                                                                          |
| `create_appointment`  | YES — both branches: (A) direct booking with `service_id` cannot convey tier; (B) quote conversion inherits the quote's already-resolved tier (no NEW gap). |
| `notify_staff`        | NO — free-form `details` string; no tier required.                                                                           |
| `check_availability`  | NO — uses `service_id` to look up `base_duration_minutes`; pricing not consulted. Duration could in principle vary by tier, but the catalog stores duration per-service, not per-tier today. |
| `get_services`        | NO — read-only; emits per-tier prices for the LLM to read.                                                                   |
| `send_info_sms`       | NO — sends info links, not quotes.                                                                                           |
| `lookup_customer` / `upsert_customer` / `classify_vehicle` / `get_products` / `get_product_details` / `approve_addon` / `decline_addon` | NO — no service-pricing context.|

**`create_appointment` (direct-booking branch) is the silent companion bug.** The agent might book directly with `service_id` (against Critical Rule 17, but possible if rule is violated), and the booking endpoint computes price via `computeExpectedPrice(serviceRow, data.tier_name, ...)` — but the tool schema at
`src/lib/sms-ai/tools.ts:138-154` does not expose `tier_name` to the
LLM. Prompt Critical Rule 17 mitigates by routing all bookings through
`send_quote_sms` first, but the structural gap in `create_appointment`'s
schema mirrors `send_quote_sms`. **Out of scope for Issue 38's fix;
file as a follow-up.**

---

## Target 8 — Multi-quantity representation (Pattern X vs Y)

Two possible representations of "Per Row × 2 = $250":

- **Pattern X:** one `quote_items` row with `service_id=...,
  tier_name='per_row', quantity=2, unit_price=125, total_price=250`.
- **Pattern Y:** two `quote_items` rows each with `quantity=1,
  unit_price=125`.

**Schema affordance:** `quote_items.quantity INTEGER NOT NULL DEFAULT 1`
— `>1` is fully supported (`total_price` is computed as `quantity *
unit_price` in `src/lib/quotes/quote-service.ts:210`).

**Existing data points:**
- POS reducer (`quote-reducer.ts:199`) hardcodes `quantity: 1` for non-per_unit. To represent multi-row in POS today, the operator likely clicks Per Row twice → Pattern Y.
- Per-unit pricing model uses Pattern X via `perUnitQty`.
- The `per_row` tier itself is configured with `max_qty=3, qty_label='row'` — strong signal that **Pattern X was the intended representation** for this tier (it's not `per_unit` because pricing math is "tier price × qty", not "per-unit catalog × qty").

**Recommendation:** Pattern X. One quote_item per (service, tier) with `quantity` reflecting the count. Reasons:
- Honors the `max_qty`/`qty_label` schema affordance.
- Matches `per_unit` pricing conceptually.
- Cleaner display ("Hot Shampoo Extraction — Per Row × 2 — $250" reads as one line item, not two identical lines).
- Total_price arithmetic is already correct in `quote-service.ts:210`.

Pattern Y is also valid (and is what POS produces today), but it
duplicates rows for no semantic gain. The fix should use Pattern X for
new SMS/voice quote paths. POS reducer is out of scope for Issue 38;
its existing Y-behavior is harmless.

---

## Target 9 — Backward compatibility

### 9.1 Old conversations in-flight

The SMS-AI v2 agent's prompt + tool schema are loaded fresh per inbound
turn. There's no per-conversation tool-schema caching on the LLM side.
The Anthropic API prompt cache TTL is 5 minutes; even if a cached
prompt block reflects the old schema, on the next turn the agent
re-receives the new schema. Since both new params (`tiers`,
`quantities`) are **optional**, any in-flight conversation invoking the
old schema continues to work — the route handler treats missing params
as the legacy auto-tier + quantity-1 path.

**Verdict: no in-flight conversations break.**

### 9.2 Other LLM-driven callers of `send-quote-sms`

Grep finds only the SMS-AI v2 dispatcher
(`src/lib/sms-ai/tool-dispatcher.ts:492-510`) and the route handler
itself reference the endpoint. The ElevenLabs voice agent calls
`voice-post-call.ts` (not `send-quote-sms`) after the call ends.

**Verdict: only one LLM-driven caller. No second contract to update.**

### 9.3 Deployment strategy

Standard single-step deploy:
1. Land tool schema + system prompt + route handler + resolver option in one PR.
2. Deploy.
3. The LLM observes the new schema on the next turn; system-prompt guidance steers it to use the new params for tiered services.

No staged rollout needed. The old code path (no `tiers`/`quantities`)
remains valid forever.

### 9.4 Twilio inbound + voice-post-call

These paths have NO `tiers`/`quantities` input source — they parse
service names from inbound SMS / call transcripts respectively. They
keep the existing `resolvePrice(service, sizeClass)` shape (no
`options`) and continue to auto-pick by precedence. **The new
`options.tierName` is purely additive on the resolver side.**

That said: voice-post-call.ts is the same path as Hot Shampoo
Extraction would flow through if discussed on a phone call. **Long-term
follow-up**: extend the ElevenLabs `services_discussed` capture to
include tier intent (tier name + quantity from the transcript). Out of
scope for Issue 38 (which is SMS-AI-focused), but worth filing.

---

## Target 10 — Recommended fix scope

### 10.1 Recommendation: B1 (tier names + quantities, both CSV strings)

Rationale: see Target 6 (B1 wins on all 7 axes); Target 4 (mirrors three
existing in-codebase precedents); Target 1.2 (LLM already has the
identifier in context).

### 10.2 Files to change

| File                                                            | Change                                                                                          |
|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `src/lib/sms-ai/tools.ts:229-244`                               | Add optional `tiers` + `quantities` string properties to `send_quote_sms` schema. Update description to explain parallel-CSV contract. |
| `src/lib/sms-ai/system-prompt.ts`                               | Add a subsection under "Add-ons and bundle quoting" or near Critical Rule 6 explaining when to pass `tiers` (multi-tier services where the tier isn't fully determined by `size_class`) and `quantities` (per_row × N, etc.). Empirical example: Hot Shampoo Extraction with `per_row` × 2. |
| `src/lib/services/service-resolver.ts:160-171` (interface), `:251-382` (function body) | Add `tierName?: string \| null` to `ResolvePriceOptions`. In `scope` + `vehicle_size` + `specialty` branches, if `options.tierName` is supplied: find tier by `tier_name === options.tierName` first; if found, use it; if not found, return null (or fall through with warn). Existing branches unchanged when `options.tierName` is undefined. |
| `src/app/api/voice-agent/send-quote-sms/route.ts:30-47` (parse), `:194-211` (loop) | Read `tiers` + `quantities` strings; parse to parallel arrays of same length as `serviceNames` (pad with `''` / `1`); per-item, call `resolvePrice(service, sizeClass, { tierName, specialtyTier: <vehicle.specialty_tier if known> })`; build quote_item with `quantity: parsedQty`; validate `quantity <= service_pricing.max_qty` for the chosen tier; reject misspelled/missing tier with an `instructions_for_agent`-bearing 400 (so agent can recover). |
| **Tests:**                                                       |                                                                                                 |
| `src/app/api/voice-agent/send-quote-sms/__tests__/...`           | +6: tier+quantity happy path (Hot Shampoo per_row×2 → $250), tier-only (Touring Bagger motorcycle), quantity-without-tier (rejected or auto-tier'd), unknown tier (reject + instructions_for_agent), oversize quantity (reject), legacy no-tiers-no-quantities (byte-identical to today). |
| `src/lib/services/__tests__/service-resolver.test.ts`            | +4: `options.tierName` honored for scope, specialty, vehicle_size; ignored for flat/per_unit/custom; precedence (tierName > sizeAwareTier > matchingTier). |
| `src/lib/sms-ai/__tests__/tools.test.ts` (or similar)            | +2: schema includes new params; legacy invocations still valid. |

**Total LOC estimate:** ~120 lines added across 4 source files; ~280 lines test code (typical ratio).

### 10.3 Estimated implementation session time

90-120 minutes (one focused session). Risk-adjusted: 2-3 hours including verification.

### 10.4 Risk assessment

| Risk                                                    | Likelihood | Impact | Mitigation                                                                                              |
|---------------------------------------------------------|------------|--------|---------------------------------------------------------------------------------------------------------|
| Agent doesn't reliably use new params (Issue-36 D38 precedent) | Medium | High | Strong prompt imperative + empirical example + tool schema description with consequences. Defense-in-depth: catch tier-mismatch errors at the route and surface `instructions_for_agent` so agent recovers conversationally. |
| Agent passes wrong tier_name (typo, hallucination)      | Low        | Low    | Route validates via `.find(t => t.tier_name === passed)`; null match returns `instructions_for_agent` "tier not found — falling back to auto"; same path as D42 resolveServiceByName fallback. |
| Tier label collision between `tier_name` + `tier_label` | Very low   | Low    | Tier_name is unique within service (composite unique constraint). Match by tier_name only. tier_label not in B1 schema. |
| Existing wrong-priced Q-0084 quote (the empirical case) | (already happened) | Sunk | Leave it. See "Operator questions" below.                                                              |
| Twilio inbound + voice-post-call paths un-fixed         | Low        | Low    | Out of Issue 38 scope. Their behavior is unchanged. Follow-up filed under "What this fix does NOT solve". |

### 10.5 What this fix does NOT solve (out of scope)

- **`create_appointment` direct-booking branch** has a parallel tier-intent gap (Target 7). Mitigated by Critical Rule 17 routing all bookings through `send_quote_sms` first, but the schema gap is structural. File as follow-up.
- **Twilio inbound auto-quote** (`webhooks/twilio/inbound/route.ts:807`) inherits the resolver fix opaquely (no `tierName` in its callers' grasp); same auto-pick behavior as today. Future work: extract tier intent from inbound text via a lightweight parser, or remove the auto-quote path entirely in favor of agent-driven SMS.
- **Voice post-call finalize** (`voice-post-call.ts:519`) same as above — `services_discussed` is a name-only list extracted from the transcript. Future work: extend the transcript-extraction step to also capture tier + quantity.
- **POS reducer Pattern Y representation** for multi-row Hot Shampoo Extraction — operator clicks Per Row twice → two quote_items, each quantity=1. Harmless; out of scope.

---

## Operator questions

1. **Q-0084 disposition:** Leave the existing $450 quote as-is (the customer received the link; deleting/refunding it now creates more confusion than the $200 gap), or void + reissue at $250? **Audit recommendation: leave.** Consistent with the precedent from the quote-source-tracking session's Q3.
2. **`quantities` validation policy:** when agent passes `quantities=3,2` and the chosen tier has `max_qty=3`, that's fine — but if it passes `max_qty=4`, reject hard (400 + `instructions_for_agent`) or silently clamp to max + warn? **Audit recommendation: reject hard.** Customer-facing fidelity is the whole point; clamp = silent-wrong.
3. **`tiers` validation policy:** if agent passes a tier name not present on the service (typo, hallucination), reject with `instructions_for_agent` OR fall back to auto-pick with a logged warning? **Audit recommendation: reject with `instructions_for_agent`.** Matches the "fail loud at the LLM boundary" pattern. Resolves to silent fall-through is the D38 lesson revisited.
4. **System-prompt guidance scope:** add a dedicated Critical Rule N for tier intent, or embed in existing Add-ons-and-Bundle-Quoting subsection? **Audit recommendation: Critical Rule (parallel to Rule 6 for size_class).** Issue 36's pattern showed dedicated rules outperform embedded guidance for invocation discipline.
5. **Multi-quantity surfacing in SMS body:** the `quote_sms_midcall` template's `services` chip is a comma-joined string of `item_name`. Today `Hot Shampoo Extraction × 1` would render as just `Hot Shampoo Extraction`. Do we want the template to render `Hot Shampoo Extraction — Per Row × 2` when quantity > 1? **Audit recommendation: not in scope for Issue 38.** The customer taps the link and sees the itemized quote regardless. Body composition is a Session 3C decision that lives in `sms/composites.ts`; defer to a separate prompt-tuning pass if needed.

---

## Risk matrix

| Dimension        | Severity | Probability | Notes                                                                                          |
|------------------|----------|-------------|------------------------------------------------------------------------------------------------|
| Customer-facing  | P1       | High        | Active fidelity gap ($150-$200 per affected quote). One observed (Q-0084). Each new Hot Shampoo Per-Row quote on a non-sedan vehicle reproduces it. |
| Implementation   | Low      | Low         | Additive change, no schema migration, no destructive refactor. Backward compatible.            |
| Verification     | Low      | Low         | Empirical reproduction is straightforward: SMS conversation through to Per Row × 2 confirm.    |
| Rollout          | Very low | Low         | Single deploy. No staged rollout, no feature flag, no migration ordering.                      |
| Operational      | Low      | Low         | No new infrastructure. PM2 log readability improves (tier intent surfaces in logs).            |

---

## Verification of audit hard rules

- ✅ NO source code changes in `src/`.
- ✅ NO migrations actually written or run.
- ✅ Only new file: this audit document.
- ✅ All findings cite `file:line`.
- ✅ Full `get_services` route read end-to-end (`services/route.ts`, all 379 lines).
- ✅ Quote_items schema verified against `DB_SCHEMA.md` (auto-generated from live DB).
- ✅ No reliance on prior session summaries — every claim traced to current code.
- ✅ B1 vs B2 decision argued from evidence, not preference (Target 6 scorecard).

---

## Appendix — Empirical reproduction case

Conversation timestamp: 2026-05-25 00:14 PT.

| Step | Actor    | Content                                                                                                                            |
|------|----------|------------------------------------------------------------------------------------------------------------------------------------|
| 1    | Customer | "2018 Suburban, seat cleaning"                                                                                                     |
| 2    | Agent    | (after classify_vehicle → `size_class=suv_3row_van` + get_services with size_class) Verbalized all 4 Hot Shampoo Extraction tiers: floor_mats $75, per_row $125, carpet_mats $175, Complete $450. |
| 3    | Customer | "2 rows"                                                                                                                            |
| 4    | Agent    | "Per Row × 2 = $250"                                                                                                                |
| 5    | Customer | "Sure send it"                                                                                                                      |
| 6    | Agent    | `send_quote_sms({ services: "Hot Shampoo Extraction", … })`                                                                         |
| 7    | Route    | `resolveServiceByName("Hot Shampoo Extraction")` → matches service. `resolvePrice(service, "suv_3row_van")` → `sizeAwareTier='complete'` wins → returns `{price: 450, tierName: 'complete'}`. quantity=1 hardcoded. |
| 8    | Quote    | Q-0084 written: `tier_name='complete', quantity=1, unit_price=450, total_price=450`.                                                |
| 9    | Customer | Received SMS link → quote shows $450 (customer was told $250).                                                                      |

**Customer-facing fidelity gap: $200.** Architecturally same class as Issue 36 (D40/D41); same fix pattern (close the agent-to-resolver communication channel for the new dimension). Issue 36 closed by injection at the dispatcher (size_class is universally derivable from vehicle); Issue 38 cannot be injection-closed because tier intent comes from the customer's natural-language choice, not vehicle data. The fix must extend the tool-schema contract.
