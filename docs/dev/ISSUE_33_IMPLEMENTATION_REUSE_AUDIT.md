# Issue 33 — Implementation Reuse Audit (2026-05-24)

> Pre-flight audit of the implementation plan from
> `docs/dev/ISSUE_33_COMBO_PRICING_DIAGNOSTIC.md` (commit `5d3c3576`).
> Validates every "new" thing proposed in the diagnostic against
> existing code, helpers, schema, and naming conventions per CLAUDE.md
> "Never take the lazy path. Always reuse existing code, components,
> and architecture."
>
> Read-only audit. NO code changes. NO new files except this
> deliverable.

## TL;DR

**The proposed `size_class` parameter is the correct canonical name.**
`size_class` is the codebase-wide canonical taxonomy for vehicle size
(CLAUDE.md rule 19): the column on `vehicles.size_class`, the
TypeScript type `VehicleSizeClass` with 5 values
(`sedan | truck_suv_2row | suv_3row_van | exotic | classic`), the
constant `VEHICLE_SIZE_CLASS_KEYS`, the parameter name `sizeClass` on
`resolvePrice`, and the field name `size_class` returned by the
`classify_vehicle` tool response. Adding `size_class` as a get_services
parameter is naming-consistent — NOT a new construct. **No reuse
opportunity missed here.**

**The combo helper should be a new file** (`src/lib/services/combo-resolver.ts`),
not extracted from the POS reducer. The POS reducer's combo logic
(`quote-reducer.ts:182-188` and `ticket-reducer.ts:278-284`) operates
per-line-item with a caller-pre-bound `comboPrice` from an explicit UI
selection. The agent-side problem is the inverse direction: detect
combo eligibility from the SET of services. The detection logic is
genuinely new; only the per-item "lowest wins" comparison mirrors the
reducer's semantics. The new helper should follow the existing
`picker-engine.ts` pattern of exporting BOTH a pure function
(`applyCombosFromSuggestions(items, suggestions, options)` —
testable without DB mocks) AND an admin-injected wrapper
(`applyCombosToQuoteItems(admin, items, options)` — caller-friendly).
The pure function is the right unit-test target.

**Sessions can run in PARALLEL.** Layer 1 (combo helper + 5 quote-creation
path adoptions) and Layer 2 (get_services size_class + prompt rule +
Session 4 rollback) have ZERO file overlap. Layer 1 touches the new
helper + 5 route files + their tests. Layer 2 touches the services
endpoint + tools.ts schema + system-prompt.ts + their tests. Recommend
two parallel branches: `feat/issue-33-combo-resolver-helper` (Layer 1)
and `feat/issue-33-get-services-size-class` (Layer 2 + Session 4
rollback bundled together since they share `system-prompt.ts`).

**Structural findings beyond the diagnostic** (3 minor adjustments):

1. **Diagnostic undercounted net-new test files.** It listed 3; this
   audit identifies 4-5 (the diagnostic missed that `voice-post-call.ts`
   and `voice-agent/services/route.ts` have NO existing test files —
   not gaps to extend, but greenfield).
2. **`is_seasonal` filter logic is duplicated** in 2 sites today
   (voice-agent/services/route.ts:111-118 and
   pos/hooks/use-addon-suggestions.ts:53-56). The new helper will
   become the 3rd site. Recommend exposing `isComboInSeason(suggestion,
   today)` as a sub-helper from the new file, then a future cleanup
   session can adopt it from the other 2 sites. Not blocking; flagged
   for tech-debt visibility.
3. **`CUSTOMER_SELF_SERVICE_SIZE_CLASSES`** (3-value subset:
   sedan/truck_suv_2row/suv_3row_van — `src/lib/utils/constants.ts:75`)
   is the customer-facing booking form's allowed size_class set.
   The new helper accepts the FULL 5-value taxonomy (including exotic/
   classic) because internal agent paths and POS deal with all sizes.
   The booking form's Q5 migration must continue to use the
   3-value subset for customer-facing flows. Pin this in tests so a
   future regression doesn't widen the booking-form's customer-facing
   surface accidentally.

---

## Audit findings by target

### Target 1: Existing vehicle classification concepts

**Three vehicle-classification concepts in the schema** — verified via
grep over `docs/dev/DB_SCHEMA.md`:

| Concept | DB location | Values | Purpose |
|---|---|---|---|
| `vehicle_type` enum | `vehicles.vehicle_type` (line 3036), enum at line 3243 | `standard, motorcycle, rv, boat, aircraft` | Top-level vehicle CATEGORY. Used by classifier + admin UI. |
| `vehicle_category` TEXT | `vehicles.vehicle_category` (line 3048, CHECK at 3054) | `automobile, motorcycle, rv, boat, aircraft` | Effectively a duplicate of `vehicle_type` in TEXT form; CHECK enforces the same 5 values modulo `standard ↔ automobile` rename. Used by indexes (idx_vehicles_vehicle_category) and route logic. |
| `size_class` (`vehicle_size_class` enum) | `vehicles.size_class` (line 3037), enum at line 3242. Also `transaction_items.vehicle_size_class` (line 2911). | `sedan, truck_suv_2row, suv_3row_van, exotic, classic` | **The canonical SIZE taxonomy for pricing.** |

**`size_class` is operator-locked as THE canonical size taxonomy**
(CLAUDE.md rule 19: "All vehicle attributes that influence size-based
pricing, booking gating, or agent handoff MUST be expressed as
`size_class` values. Do NOT introduce parallel boolean flags").

**TypeScript surface (verified via grep):**
- Type: `VehicleSizeClass` in `src/lib/supabase/types.ts:103` and
  `src/lib/supabase/types.ts:434`.
- Constant: `VEHICLE_SIZE_CLASS_KEYS` in
  `src/lib/utils/constants.ts:57-63` (the canonical source of truth).
- Subset: `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` in
  `src/lib/utils/constants.ts:75-79` (3 values: sedan,
  truck_suv_2row, suv_3row_van — customer-facing flows only).
- Parameter convention: `resolvePrice(service, sizeClass, options?)` in
  `src/lib/services/service-resolver.ts:168` — camelCase `sizeClass`
  for TS parameter; snake_case `size_class` for DB column / JSON.

**`classify_vehicle` tool already returns `size_class` to the agent:**
- Tool schema description names it explicitly:
  "Returns size_class (sedan, truck_suv_2row, suv_3row_van, exotic,
  classic), …"
  (`src/lib/sms-ai/tools.ts` line ~90).
- Endpoint response shape: `size_class: classification.size_class` at
  `src/app/api/voice-agent/vehicle-classify/route.ts:82`.

**Recommendation — confirmed:** the proposed `get_services` parameter
**MUST be named `size_class`**. snake_case in the tool JSON schema (to
match `classify_vehicle`'s response shape so the agent can pass it
through unchanged). The endpoint's TS handler reads
`searchParams.get('size_class')` and types it as `VehicleSizeClass |
null`.

`tier_name` exists on `service_pricing.tier_name` (line 2369) but is a
DIFFERENT concept — it's the pricing-tier label that can equal the
size_class (row-pattern B) OR be a service-specific specialty tier
name (row-pattern A). It is NOT a synonym for size_class; verified
by `service-resolver.ts:215` where the resolver falls back to a tier
whose `tier_name === sizeClass` — they're matched by value but the
column means "the pricing-row's name", not "the vehicle's size".

### Target 2: Existing combo logic in code

**Combo logic exists in 2 places today** (verified via `grep -rn
"comboPrice\|pricing_type.*combo\|'combo'"` excluding tests):

1. **POS quote-reducer** at
   `src/app/pos/context/quote-reducer.ts:124-218` (and again at
   line ~437 for an `UPDATE_*` action variant).
   ```typescript
   const resolved = resolveServicePriceWithSale(pricing, vehicleSizeClass, saleWindow);
   let effectivePrice = resolved.effectivePrice;
   let pricingType: 'standard' | 'sale' | 'combo' = resolved.isOnSale ? 'sale' : 'standard';

   if (!isPerUnit && comboPrice != null && comboPrice < resolved.standardPrice) {
     if (comboPrice <= effectivePrice) {
       effectivePrice = comboPrice;
       pricingType = 'combo';
       comboSourceId = comboPrimaryServiceId ?? null;
     }
   }
   ```

2. **POS ticket-reducer** at
   `src/app/pos/context/ticket-reducer.ts:180-284` — same logic shape
   but adapted for the ticket (sale flow) action. Also line ~568 for
   an `UPDATE_*` variant.

**No shared helper.** The two reducers carry a near-duplicate inline
implementation. No `applyCombo`, `comboResolver`, or similar function
exists anywhere in `src/` (verified by `grep -rn "applyCombo\|combo_
resolver\|combo-resolver\|resolveCombos"` — zero hits).

**Why the POS reducer's logic CAN'T be directly extracted for agent
use:**

- The POS reducer takes `comboPrice` and `comboPrimaryServiceId` as
  EXPLICIT action inputs. The caller (POS UI) supplies them by reading
  `useAddonSuggestions` and binding "this addon was added under THIS
  anchor" at click-time.
- The agent paths don't have an add-time UI step. They receive a
  comma-separated service-name list. They have to DETECT combo
  eligibility from the cross-product of services in the quote.

**What CAN be reused (in spirit, not direct code):**

- The "lowest wins" comparison: `if (comboPrice <= effectivePrice) {
  effectivePrice = comboPrice; pricingType = 'combo' }`. The new helper
  should mirror this exact comparison for behavioral consistency
  with POS.
- The `pricingType: 'standard' | 'sale' | 'combo'` union literal
  (defined in `src/app/pos/types.ts:37`). The new helper should use
  the same union — already validated server-side by `quoteItemSchema`
  in `src/lib/utils/validation.ts:~538` (`pricing_type: z.enum(['standard',
  'sale', 'combo'])`).

**Recommendation:** **write a fresh helper.** Extracting from the POS
reducer is not viable because the detection step (anchor-in-set
discovery) is the load-bearing new logic. The helper should:

- Mirror the POS reducer's "lowest wins" comparison verbatim (for
  behavioral parity).
- Live at `src/lib/services/combo-resolver.ts`, paralleling the
  existing `service-resolver.ts` / `picker-engine.ts` split.
- Export BOTH a pure function (`applyCombosFromSuggestions(items,
  suggestions, options)`) and an admin-injected wrapper
  (`applyCombosToQuoteItems(admin, items, options)`). The pure
  function is the unit-test target. The wrapper is the caller-friendly
  API. This matches the `resolveServicePriceWithSale` (pure, in
  picker-engine.ts) vs `resolvePrice` (admin-aware wrapper, in
  service-resolver.ts) split.

A future cleanup session could refactor the POS reducer to call a
shared `pickEffectivePrice(standardPrice, effectivePrice, comboPrice)`
helper extracted from the combo-resolver. Out of scope for Issue 33;
flagged for tech-debt visibility.

### Target 3: get_services current parameters

**Endpoint:** `src/app/api/voice-agent/services/route.ts` (~320 lines).
GET-only. Reads zero query parameters today — the input_schema in
`tools.ts` has empty `properties: {}` (line ~84 of tools.ts).

The endpoint already:
- Runs 3 queries: services + pricing, service_addon_suggestions,
  service_prerequisites.
- Per-service formats `pricing` array based on `pricing_model` switch
  via `resolveServicePriceWithSale` directly.
- Derives `addon_suggestions[].standard_price` for flat / per_unit /
  custom pricing_models (lines 130-138). Returns `null` for
  `vehicle_size` / `scope` / `specialty` addons because the endpoint
  has NO vehicle context.

**Extension path (matches operator's Q2 scope):**

Add an optional `size_class` query parameter to the endpoint. When
provided AND a non-null `VehicleSizeClass`:

- For each `addon_suggestions` entry whose addon service has
  `pricing_model in ('vehicle_size', 'scope')`: call
  `resolvePrice(addonService, sizeClass)` to get the standalone price,
  populate `standard_price`, compute `savings = standardPrice -
  combo_price`.
- Other pricing_models keep existing behavior.

`vehicle_id` as an alternative parameter — REJECTED for these reasons:

- The agent often does NOT have a `vehicle_id` (new customer or new
  vehicle that hasn't been persisted yet — exactly the SMS-AI v2
  use case).
- `classify_vehicle` returns `size_class` directly without writing a
  vehicle row. Passing `size_class` to `get_services` reuses the same
  value the agent just received from classify_vehicle.
- `vehicle_id` would require the endpoint to JOIN against `vehicles`
  for every call — extra DB round-trip with no benefit.

**Recommendation: pass `size_class` directly as an optional query
parameter.** Tool schema:

```typescript
{
  name: 'get_services',
  input_schema: {
    type: 'object',
    properties: {
      size_class: {
        type: 'string',
        enum: ['sedan', 'truck_suv_2row', 'suv_3row_van', 'exotic', 'classic'],
        description: 'Optional vehicle size_class — pass after classify_vehicle to receive size-aware addon standalone prices and combo savings figures. Without it, size-aware addons return standard_price=null and savings=null.',
      },
    },
  },
}
```

Prompt rule (to be added in Layer 2):
> After `classify_vehicle` returns the vehicle's `size_class`, pass it
> to subsequent `get_services` calls so size-aware addon savings figures
> populate (`addon_suggestions[].standard_price` + `.savings`).

### Target 4: resolvePrice size-aware behavior

`resolvePrice(service, sizeClass, options?)` at
`src/lib/services/service-resolver.ts:168`. Branches:

| pricing_model | Behavior with non-null sizeClass | Edge cases |
|---|---|---|
| `vehicle_size` / `scope` | Picks size-aware tier (column-pattern A) OR `tier_name === sizeClass` row (pattern B) OR first tier; delegates to `resolveServicePriceWithSale(tier, sized, saleWindow)`. ✅ Correct per-size price. | `tiers.length === 0` → falls back to `service.flat_price ?? 0` (line 199-208). Misconfigured but doesn't throw. |
| `flat` | Synthesizes ServicePricing row from `flat_price`; ignores `sizeClass`. Correct standalone. | None. |
| `per_unit` | Synthesizes from `per_unit_price`; ignores `sizeClass`. Returns per-unit cost; caller multiplies by qty. | The agent rarely uses per_unit addons in combos; if so, combo applies as a flat replacement on the qty=1 entry. Edge worth flagging in tests. |
| `specialty` | Uses `options.specialtyTier`, NOT `sizeClass`. | If an addon is `specialty`, the combo logic falls back to standalone (no per-size). Specialty + combo is unsupported by this design — fine, no operator has surfaced a use case. |
| `custom` | Returns `custom_starting_price`; ignores `sizeClass`. | Operator-assessed pricing; combos shouldn't apply automatically. |

**Confirmation:** `resolvePrice` cleanly returns the standalone price
for size-aware addons when given a valid sizeClass. No new function
needed — Layer 2 just calls `resolvePrice(addonService, sizeClass)`
inside the get_services endpoint for each size-aware addon.

**Edge case to test (Layer 2):** when sizeClass is provided but the
addon's service has `pricing_model='specialty'` (rare but possible),
the endpoint should leave `standard_price=null` rather than calling
resolvePrice with no `specialtyTier` (which would return the first
tier, potentially incorrect). Recommendation: only call `resolvePrice`
for `pricing_model in ('vehicle_size', 'scope')`; keep the existing
flat/per_unit/custom branches; leave `specialty` returning null.

### Target 5: Test file reuse opportunities

**Existing test files for affected paths:**

| Path | Test file exists? | Notes |
|---|---|---|
| `voice-agent/send-quote-sms/route.ts` | ✅ `__tests__/route.test.ts` (existing) | Extend with new `describe('combo pricing')` block. Already extended for Session 4's idempotency tests — same pattern. |
| `voice-agent/quotes/route.ts` | ❌ NO test file | **NEW FILE required.** This route has zero tests today (pre-existing gap). Diagnostic correctly flagged. |
| `voice-agent/services/route.ts` | ❌ NO test file | **NEW FILE required for Layer 2.** Diagnostic missed this — needs `__tests__/route.test.ts` for the size_class param extension. |
| `webhooks/twilio/inbound/route.ts` | ✅ Two specialized test files: `start-words-gate.test.ts`, `sms-ai-v2-routing.test.ts`. No `route.test.ts`. | **NEW FILE `__tests__/auto-quote-combo.test.ts`** matches the existing per-concern pattern. |
| `lib/services/voice-post-call.ts` | ❌ NO test file | **NEW FILE required for Layer 1.** Diagnostic missed this. Helper has no tests today. |
| `book/route.ts` | ✅ Two specialized test files: `compute-expected-price.test.ts`, `modifier-persistence.test.ts`. | EXTEND `compute-expected-price.test.ts` with a combo describe block (matches existing pricing-test grouping) rather than new file. |
| `lib/services/combo-resolver.ts` (new file) | n/a — new helper | **NEW FILE `__tests__/combo-resolver.test.ts`** for the helper's unit tests. |
| `lib/sms-ai/tools.ts` (size_class schema) | ✅ `__tests__/tools.test.ts` (existing) | Extend with size_class assertion on get_services schema. |
| `lib/sms-ai/system-prompt.ts` (rule + Session 4 rollback) | ✅ `__tests__/system-prompt.test.ts` (existing) | Extend with new size_class hint test; DELETE Session 4 combo-mitigation tests. |

**Summary:**
- **5 NEW test files:** combo-resolver, voice-agent/quotes, voice-agent/services, voice-post-call, auto-quote-combo (vs the diagnostic's count of 3 — the diagnostic missed voice-post-call and voice-agent/services).
- **3 EXISTING test files extended:** send-quote-sms route, book compute-expected-price, tools.ts.
- **1 EXISTING test file extended-with-deletions:** system-prompt.ts (delete Session 4 combo block, add Layer 2 prompt rule tests).

### Target 6: Helper signature — pure vs admin-injected

**Existing pattern in the codebase** (`src/lib/services/picker-engine.ts`
vs `src/lib/services/service-resolver.ts`):

- `picker-engine.ts` exports `resolveServicePriceWithSale(pricing,
  vehicleSizeClass, saleWindow)` — **pure function**, takes data as
  args, no DB.
- `service-resolver.ts` exports `resolvePrice(service, sizeClass,
  options?)` — **admin-aware** (synthesizes pricing rows for
  `flat`/`per_unit`/`custom`, then delegates to the pure engine).
- `resolveServiceByName(admin, name)` — **admin-injected DB query**.

**Recommendation:** mirror this exact pattern for the new combo-resolver:

```typescript
// src/lib/services/combo-resolver.ts

// Pure function — unit-testable without any DB mock.
export function applyCombosFromSuggestions(
  items: ResolvedQuoteItem[],
  suggestions: ComboSuggestionRow[],
  options?: ComboResolverOptions,
): ResolvedQuoteItem[];

// Admin-injected wrapper — caller-friendly one-line API.
// Internally: fetches suggestions, calls applyCombosFromSuggestions.
export async function applyCombosToQuoteItems(
  admin: SupabaseClient,
  items: ResolvedQuoteItem[],
  options?: ComboResolverOptions,
): Promise<ResolvedQuoteItem[]>;

// Sub-helper for seasonal-window filtering — exposed for reuse by
// voice-agent/services/route.ts:111-118 and pos/hooks/use-addon-suggestions.ts:53-56
// (future tech-debt cleanup; not required for Issue 33).
export function isComboInSeason(
  suggestion: ComboSuggestionRow,
  today: Date,
): boolean;
```

**Tradeoff:** unit tests target `applyCombosFromSuggestions` (no DB
mock needed → fast, simple). Integration tests at the route level
target `applyCombosToQuoteItems` indirectly. This minimizes test setup
complexity while preserving caller ergonomics (route files use
`applyCombosToQuoteItems(admin, items)` — one line).

### Target 7: Single vs parallel session feasibility

**Layer 1 (combo helper + 5 path adoptions) file list:**

| File | Action |
|---|---|
| `src/lib/services/combo-resolver.ts` | NEW |
| `src/lib/services/__tests__/combo-resolver.test.ts` | NEW |
| `src/app/api/voice-agent/send-quote-sms/route.ts` | MODIFY (1-line adoption + import) |
| `src/app/api/voice-agent/send-quote-sms/__tests__/route.test.ts` | MODIFY (extend) |
| `src/app/api/voice-agent/quotes/route.ts` | MODIFY (1-line adoption + import) |
| `src/app/api/voice-agent/quotes/__tests__/route.test.ts` | NEW |
| `src/app/api/webhooks/twilio/inbound/route.ts` | MODIFY (1-line adoption + import) |
| `src/app/api/webhooks/twilio/inbound/__tests__/auto-quote-combo.test.ts` | NEW |
| `src/lib/services/voice-post-call.ts` | MODIFY (1-line adoption + import) |
| `src/lib/services/__tests__/voice-post-call.test.ts` | NEW |
| `src/app/api/book/route.ts` | MODIFY (addon-write path migration per Q5) |
| `src/app/api/book/__tests__/compute-expected-price.test.ts` | MODIFY (extend with combo describe) |

**Layer 2 (get_services size_class + prompt rule + Session 4 rollback) file list:**

| File | Action |
|---|---|
| `src/app/api/voice-agent/services/route.ts` | MODIFY (extend handler to accept size_class query param + derive standalone for size-aware addons) |
| `src/app/api/voice-agent/services/__tests__/route.test.ts` | NEW |
| `src/lib/sms-ai/tools.ts` | MODIFY (extend get_services input_schema with size_class) |
| `src/lib/sms-ai/__tests__/tools.test.ts` | MODIFY (extend) |
| `src/lib/sms-ai/system-prompt.ts` | MODIFY (add prompt rule for size_class on get_services; DELETE the Session 4 `## Combo and bundle pricing — confirm before stating` subsection) |
| `src/lib/sms-ai/__tests__/system-prompt.test.ts` | MODIFY (add new rule test + DELETE Session 4 combo describe block) |

**File overlap analysis:** ZERO overlap between Layer 1 and Layer 2.
Different routes, different helpers, different tests. The two layers
can be developed on parallel branches by two CC sessions and merged
independently.

**Session 4 rollback** belongs to Layer 2 because it touches the
same `system-prompt.ts` file. Bundling them avoids two merges into
that file.

**Recommendation: TWO parallel sessions.**

| Session | Branch | Scope | Critical path? |
|---|---|---|---|
| **A — Layer 1** | `feat/issue-33-combo-resolver-helper` | Combo helper + 5 quote-creation path adoptions + tests | ✅ YES — without this, combos still don't apply to quote totals. |
| **B — Layer 2 + S4 rollback** | `feat/issue-33-get-services-size-class` | get_services size_class extension + prompt rule + Session 4 combo-mitigation rollback + tests | Important but not the critical path for fidelity. Without it, the agent still can't say "saves $X" for size-aware combos. |

Both branches can be developed simultaneously. Either order of merging
works. After both merge, the operator runs end-to-end verification
(reproduce Test 4 / Q-0084 scenario).

### Target 8: Other findings

**8a — `is_seasonal` filter logic duplication.** Today two sites
implement the seasonal-window check independently:

- `src/app/api/voice-agent/services/route.ts:111-118` (server-side, uses `new Date()`):
  ```typescript
  if (row.is_seasonal) {
    const start = row.seasonal_start ? new Date(row.seasonal_start) : null;
    const end = row.seasonal_end ? new Date(row.seasonal_end) : null;
    if (start && now < start) continue;
    if (end && now > end) continue;
  }
  ```
- `src/app/pos/hooks/use-addon-suggestions.ts:53-56` (client-side, uses ISO date string):
  ```typescript
  if (row.is_seasonal) {
    if (row.seasonal_start && today < row.seasonal_start) continue;
    if (row.seasonal_end && today > row.seasonal_end) continue;
  }
  ```

The new combo-resolver will become the 3rd implementation site. To
avoid drift, **expose `isComboInSeason(suggestion, today)` as a public
export from the new combo-resolver.ts**. Future cleanup session can
migrate the other 2 sites to call this helper. Not blocking; not
required to make Issue 33 work; just sound engineering hygiene.

**8b — `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` boundary.** The 3-value
subset at `src/lib/utils/constants.ts:75-79` (sedan, truck_suv_2row,
suv_3row_van) is the customer-facing booking form's allowed size set.
The combo helper accepts the full 5-value `VehicleSizeClass`. The Q5
booking-form migration must continue to use the 3-value subset for
the customer-facing path — if the booking client somehow received
`exotic` or `classic`, the upstream gates would have already deflected
to staff-handoff. Pin this invariant in `book-combo.test.ts`: assert
that booking-form combo paths never see `exotic`/`classic` size_class
values (they should be filtered out before reaching the combo helper).

**8c — `pricing_type: 'combo'` validation already exists.** The
`quoteItemSchema` zod validator at `src/lib/utils/validation.ts` already
accepts `pricing_type: z.enum(['standard', 'sale', 'combo'])`. No
schema change needed. (Confirmed by re-reading
`grep -A 30 "quoteItemSchema" src/lib/utils/validation.ts` output —
the enum is already in place from Session 3 or earlier.)

**8d — The booking client's `addon.price` already carries combo
price.** Verified by reading
`src/components/booking/step-service-select.tsx:248` and
`src/components/booking/booking-wizard.tsx:492`. The customer-facing
UI displays "Add for $X" using `suggestion.combo_price`. When the user
clicks the addon, the wizard's state machine binds the combo price.
By the time the booking form submits to `/api/book`, the `addon.price`
field already equals `combo_price`. The Q5 migration is therefore
narrow: the server endpoint must STOP hardcoding `pricing_type:
'standard'` (line 481) and `standard_price: addon.price` (line 480),
and instead detect combo via the new helper to set
`pricing_type: 'combo'` + `standard_price: <original addon standalone>`.
This is a one-line conceptual change per the helper signature; the
combo *price* is already correct.

**8e — `is_addon` column on `transaction_items` (and absence on
`quote_items`).** Verified via DB schema: `transaction_items.is_addon
BOOLEAN DEFAULT false` (line ~2912 of DB_SCHEMA.md). `quote_items`
does NOT have an `is_addon` column. The combo helper should not assume
either column exists — it operates on `service_id` matching from the
suggestions table. If a future session wants to mark addons explicitly,
that's a separate column addition.

---

## Updated implementation specification

### Layer 1 — Combo helper + 5 quote-creation path adoptions

**Branch:** `feat/issue-33-combo-resolver-helper`.

**New helper file:** `src/lib/services/combo-resolver.ts`.

Exports:
- `applyCombosFromSuggestions(items: ResolvedQuoteItem[], suggestions: ComboSuggestionRow[], options?: ComboResolverOptions): ResolvedQuoteItem[]` — pure function.
- `applyCombosToQuoteItems(admin: SupabaseClient, items: ResolvedQuoteItem[], options?: ComboResolverOptions): Promise<ResolvedQuoteItem[]>` — admin-injected wrapper.
- `isComboInSeason(suggestion: ComboSuggestionRow, today: Date): boolean` — sub-helper, exported for future reuse.
- Types: `ResolvedQuoteItem`, `ComboSuggestionRow`, `ComboResolverOptions`.

**Algorithm (pure function):**

1. Extract `serviceIds = items.map(i => i.service_id).filter(distinct)`. If empty, return items unchanged.
2. Build `serviceIdSet = new Set(serviceIds)`.
3. For each suggestion row:
   - If `auto_suggest !== true`, skip.
   - If `!isComboInSeason(row, today)`, skip.
   - If `!serviceIdSet.has(row.primary_service_id)` OR `!serviceIdSet.has(row.addon_service_id)`, skip.
   - The row is eligible — track it in a map keyed by `addon_service_id`.
4. For each item where `item.service_id` appears as an addon in the eligibility map:
   - Pick the best combo per `multipleAnchorTiebreak` option (default: lowest `combo_price`).
   - Apply (mirror POS reducer's "lowest wins" comparison): if `comboPrice <= item.unit_price`, set `item.unit_price = comboPrice`, `item.standard_price = original unit_price`, `item.pricing_type = 'combo'`.
5. Return the new array (do not mutate input).

**Call sites to update (5 paths):**

| File | Insertion point |
|---|---|
| `src/app/api/voice-agent/send-quote-sms/route.ts` | After line 211 (`perf.mark('resolve:services_batch')`) — pass `quoteItems` through `applyCombosToQuoteItems(admin, quoteItems)`. |
| `src/app/api/voice-agent/quotes/route.ts` | After line 197 (end of `for (const input of serviceInputs)` loop) — same call. |
| `src/app/api/webhooks/twilio/inbound/route.ts` | After line 817 (end of auto-quote `for` loop) — same call. |
| `src/lib/services/voice-post-call.ts` | After line 528 (end of pricing `for` loop) — same call. |
| `src/app/api/book/route.ts` | Insert combo pass on the `data.addons.map(...)` line items at line 465-484, then write the resulting `pricing_type`/`standard_price` (drop the hardcoded `pricing_type: 'standard'` at line 481). |

**Test files:**

- NEW: `src/lib/services/__tests__/combo-resolver.test.ts` (~15-20 tests covering all combo-matching edge cases on the pure function).
- NEW: `src/app/api/voice-agent/quotes/__tests__/route.test.ts` (zero existing — full route coverage + combo integration).
- NEW: `src/app/api/webhooks/twilio/inbound/__tests__/auto-quote-combo.test.ts` (combo path coverage).
- NEW: `src/lib/services/__tests__/voice-post-call.test.ts` (zero existing — full helper coverage + combo integration).
- EXTEND: `src/app/api/voice-agent/send-quote-sms/__tests__/route.test.ts` — new `describe('combo pricing — Layer 1 adoption')` block.
- EXTEND: `src/app/api/book/__tests__/compute-expected-price.test.ts` — new combo describe block + pin Target 8b invariant (customer-facing 3-value subset).

Estimated tests: **+25 to +35** across Layer 1.

### Layer 2 — get_services size_class + prompt rule + Session 4 rollback

**Branch:** `feat/issue-33-get-services-size-class`.

**Endpoint change** in `src/app/api/voice-agent/services/route.ts`:

- Accept `size_class` query parameter (validated against `VEHICLE_SIZE_CLASS_KEYS`).
- Pass it into the addon-formatting loop.
- For addons where `pricing_model in ('vehicle_size', 'scope')` AND `size_class` is provided AND non-null: call `resolvePrice(addonService, size_class)` and use the result as `standard_price`. Compute `savings = standardPrice - combo_price`.
- Other pricing_models unchanged.

**Tool schema change** in `src/lib/sms-ai/tools.ts`:

```typescript
{
  name: 'get_services',
  input_schema: {
    type: 'object',
    properties: {
      size_class: {
        type: 'string',
        enum: ['sedan', 'truck_suv_2row', 'suv_3row_van', 'exotic', 'classic'],
        description: 'Optional. Pass after classify_vehicle so size-aware addon standalone prices and combo savings figures populate. Without it, size-aware addons return standard_price=null and savings=null in addon_suggestions.',
      },
    },
  },
}
```

**Prompt rule additions** in `src/lib/sms-ai/system-prompt.ts`:

- **DELETE** the entire `## Combo and bundle pricing — confirm before stating` subsection added by Workstream J Session 4 (~30 lines).
- **ADD** a one-paragraph rule under the Tool usage guide:
  > After `classify_vehicle` returns the vehicle's `size_class`, pass it to subsequent `get_services` calls. This populates standalone prices and bundle savings for size-aware addons (paint correction, ceramic, etc.). Without `size_class`, those addons' `standard_price` and `savings` return `null` and you cannot quote bundle savings for them.
- The agent is once again free to confidently quote combos from `addon_suggestions.combo_price` because the endpoint will now produce correct combo line items at quote-creation time.

**Test files:**

- NEW: `src/app/api/voice-agent/services/__tests__/route.test.ts` (no existing tests — covers the size_class extension + back-compat when omitted).
- EXTEND: `src/lib/sms-ai/__tests__/tools.test.ts` — assert `size_class` is in get_services input_schema with the correct enum.
- EXTEND: `src/lib/sms-ai/__tests__/system-prompt.test.ts` — DELETE the existing Session 4 combo-mitigation describe block. ADD a new test asserting the size_class hint is in the prompt.

Estimated tests: **+10 to +15** across Layer 2.

### Combined total

**5 new test files. 4 existing test files extended. 1 existing test file extended-with-deletions.**

**~35-50 new tests total** across both layers (lower bound: helper + endpoint coverage only; upper bound: full integration coverage on every quote-creation path).

---

## Risk-reduction notes

- **The `pricing_type='combo'` enum is already validated** by zod
  (`quoteItemSchema`). Layer 1 implementation does not need to add
  any schema validator changes.
- **The combo data shape is already exposed in `database.types.ts`**
  (auto-generated; verified by `grep -n "service_addon_suggestions"`
  returning line 4753). No type plumbing needed beyond importing the
  existing types.
- **The `picker-engine.ts` + `service-resolver.ts` split** is a proven
  pattern that the new combo-resolver mirrors. Tests can copy the
  shape of `service-resolver.test.ts` (existing) for the wrapper +
  any pure-function test setup from `picker-engine.test.ts` (existing).
- **The POS reducer's combo logic is the operator-validated reference
  semantic** (in use since the reducer was built). The new helper's
  "lowest wins" comparison is a verbatim copy of that logic, only
  applied at quote-CREATION rather than per-line ADD action.
- **The `classify_vehicle` → `get_services({size_class})` hand-off
  is a natural one-step chain** the agent already does for sale-aware
  pricing (it always calls classify_vehicle before get_services per
  Critical rule 4 in the prompt). Layer 2 doesn't introduce a new
  flow shape; it just enriches the existing call.
- **Layer 1 and Layer 2 are independent.** Operator can ship either
  first without breaking the other. Layer 1 alone fixes quote totals
  (the customer-facing fidelity bar). Layer 2 alone improves the
  agent's quoting precision for size-aware addons. Together: both
  the agent's words AND the quote document are correct.
- **Session 4's prompt-rule workaround removal is a clean delete** —
  no behavioral re-engineering needed. The endpoint produces correct
  combos; the rule that told the agent to "verify before stating"
  is no longer load-bearing.
