# Phase Money-Unify-3 — Reconciliation + Pre-flight (Family D Catalog)

> Generated 2026-05-14 from `supabase db query --linked` against the
> AutoDetailApp project. This document accumulates checkpoint #1
> (pre-flight), #2 (post-migration), #3 (post-deploy) as the phase
> progresses. Saved per v3 LOCKED-5.

## Checkpoint #1 — Pre-flight (Task 0)

### Verification 1 — Column shape (all 15 targets)

All 15 target columns are `NUMERIC(10,2)`. None of the corresponding
`_cents` columns exist yet.

| Table | Column | NOT NULL? | Default | Notes |
|---|---|---|---|---|
| services | flat_price | NO | — | NULLable in source |
| services | sale_price | NO | NULL | |
| services | custom_starting_price | NO | — | |
| services | per_unit_price | NO | — | |
| service_pricing | price | **YES** | — | **NOT NULL — DROP required** |
| service_pricing | sale_price | NO | NULL | |
| service_pricing | vehicle_size_sedan_price | NO | — | |
| service_pricing | vehicle_size_truck_suv_price | NO | — | |
| service_pricing | vehicle_size_suv_van_price | NO | — | |
| service_pricing | vehicle_size_exotic_price | NO | — | |
| service_pricing | vehicle_size_classic_price | NO | — | |
| products | cost_price | **YES** | 0 | **NOT NULL — DROP required** |
| products | retail_price | **YES** | 0 | **NOT NULL — DROP required** |
| products | sale_price | NO | NULL | |
| packages | price | **YES** | — | **NOT NULL — DROP required** |

**4 NOT NULL constraints** to drop on legacy columns (Unify-2 Decision A1 pattern).

### Verification 2 — Whole-dollar pre-violators (HALT-AND-DECIDE)

**🚨 4 violators surfaced.**

`services` — 1 row:

| id | name | flat_price | sale_price | custom_starting | per_unit |
|---|---|---|---|---|---|
| 853b9812-7ec7-4c59-8827-279973960cbc | Headlight Restoration | 125.00 | **1.25** | null | null |

`sale_price = $1.25` while `flat_price = $125`. This looks like dirty data
(price-of-pennies fat-finger or test entry) rather than a genuine
$1.25 sale price.

`service_pricing` — 3 rows (all for "1-Year Ceramic Shield" service
`82c626d7-6aa8-4405-9ed1-8ab6191f0e71`):

| tier_name | price | sale_price |
|---|---|---|
| sedan | 425.00 | **212.50** (exactly half) |
| truck_suv_2row | 525.00 | **262.50** (exactly half) |
| suv_3row_van | 625.00 | **312.50** (exactly half) |

All three are intentional 50%-off sale prices that land at half-dollar
amounts. These look like real business data, not dirt.

`packages` — 0 violators (table is empty).

### Verification 3 — Sale-price-within-1-cent

**0 rows** in any of services / service_pricing / products. Safe.

### Verification 4 — Data audit

| Column | Total | Non-null | Min | Max | Sum | Negative |
|---|---|---|---|---|---|---|
| services.flat_price | 30 | 12 | 75.00 | 175.00 | 1550.00 | 0 |
| services.sale_price | 30 | 1 | 1.25 | 1.25 | 1.25 | 0 |
| services.custom_starting_price | 30 | 1 | 475.00 | 475.00 | 475.00 | 0 |
| services.per_unit_price | 30 | 1 | 150.00 | 150.00 | 150.00 | 0 |
| service_pricing.price | 54 | 54 | 75.00 | 2000.00 | 29235.00 | 0 |
| service_pricing.sale_price | 54 | 3 | 212.50 | 312.50 | 787.50 | 0 |
| service_pricing.vsedan | 54 | 1 | 300.00 | 300.00 | 300.00 | 0 |
| service_pricing.vtruck | 54 | 1 | 350.00 | 350.00 | 350.00 | 0 |
| service_pricing.vsuv_van | 54 | 1 | 450.00 | 450.00 | 450.00 | 0 |
| service_pricing.vexotic | 54 | 0 | null | null | null | 0 |
| service_pricing.vclassic | 54 | 0 | null | null | null | 0 |
| products.cost_price | 432 | 432 | 0.00 | 375.00 | 8687.71 | 0 |
| products.retail_price | 432 | 432 | 0.40 | 699.00 | 17868.24 | 0 |
| products.sale_price | 432 | 0 | null | null | null | 0 |
| packages.price | 0 | 0 | null | null | null | 0 |

No negative values. No NULL anomalies on NOT NULL columns (per
Verification 1 the affected NOT NULL columns are 100% populated).

`packages` table is empty — there's nothing to backfill, but the
schema migration still needs to add `price_cents` + CHECKs.

`products.cost_price` includes rows at $0 (cost not tracked) — that's
the seed default; non-negative CHECK is satisfied.

### Verification 5 — Caller surface

**135 distinct source files** (vs. v3 projection 150-210, slightly
under). Breakdown:

| Category | File count |
|---|---|
| Tests (`__tests__/`, `.test.`, `.spec.`) | 5 |
| API routes (`src/app/api/`) | 55 |
| Admin pages (`src/app/admin/`) | 26 |
| POS pages (`src/app/pos/`) | 21 |
| Public + account pages | 4 |
| Lib / components / types | 27 |
| **Total** (deduplicated) | **135** |

Type-def files (need regeneration): `src/lib/supabase/database.types.ts`,
`src/lib/supabase/types.ts`.

### Verification 6 — Square import boundary

**Important deviation from v3 playbook assumption.** The Square import
is a **CSV reader script** (`scripts/import-square-data.mjs`), NOT the
Square Catalog API "cents on the wire" pattern that v3 Part 1 lists
in the boundary table.

The script uses `parseDollar()` (parses `$X.YY` strings into floats) and
writes `cost_price` / `retail_price` as float dollars. After Unify-3,
this script will need to write `cost_price_cents` / `retail_price_cents`
using `toCents()` at the parse boundary.

This script is run for Phase 16 (Launch Prep) data reimport per
CLAUDE.md — keeping it forward-compatible matters even though it's not
running in regular dev.

### Verification 7 — Voice agent routes

10 routes under `src/app/api/voice-agent/` reference catalog tables.
Key ones for D:
- `src/app/api/voice-agent/services/route.ts`
- `src/app/api/voice-agent/products/route.ts`
- `src/app/api/voice-agent/products/details/route.ts`
- `src/app/api/voice-agent/context/route.ts`
- `src/app/api/voice-agent/initiation/route.ts`

These return prices to the ElevenLabs model — typically as
human-readable strings via `formatCurrency`. Post-migration, they
read `_cents` and emit via `formatMoney`.

### Verification 8 — AI content writer

`src/lib/services/ai-content-writer.ts:645-654` — sole site.

Reads `flat_price` and `custom_starting_price` (no `sale_price` in
this code path). Renders as `` `$${svc.flat_price}` `` — inline
formatting that will need to switch to `formatMoney(svc.flat_price_cents)`
post-migration.

No tests on this file currently.

### Verification 9 — TODO Unify-D shim sites

**9 sites total** — exactly as expected from Unify-2 + the playbook:

1. `src/app/admin/inventory/purchase-orders/new/page.tsx:114`
2. `src/app/api/admin/purchase-orders/[id]/receive/route.ts:116`
3. `src/app/api/admin/orders/[id]/refund/route.ts:120`
4. `src/app/api/pos/shop-use/route.ts:78`
5. `src/app/api/pos/transactions/route.ts:439`
6. `src/app/api/pos/sync-offline-transaction/route.ts:218`
7. `src/app/api/pos/refunds/route.ts:558`
8. `src/app/api/webhooks/stripe/route.ts:303`
9. `supabase/migrations/20260514051953_unify_2_inventory_family_to_cents.sql:173` (inside `void_transaction()`)

After Unify-3: src/ sites = 0. The Unify-2 migration SQL stays as
historical record (the function body itself is rewritten by the
Unify-3 migration).

### Verification 10 — Existing CHECK constraints

**⚠️ Mismatch with prompt's LOCKED-3 Step 4.** Only 3 CHECK constraints
exist on these 4 tables:

| Table | Constraint name | Definition |
|---|---|---|
| products | chk_product_sale_price | `sale_price IS NULL OR sale_price < retail_price` |
| **service_pricing** | chk_service_sale_price | `sale_price IS NULL OR sale_price < price` |
| services | services_sale_price_non_negative | `sale_price IS NULL OR sale_price >= 0` |

**Both v3 playbook and the session prompt's LOCKED-3 Step 4 assert
that `chk_service_sale_price` is on `services` (i.e. enforces
`services.sale_price < services.flat_price`). It is not.** It is on
**`service_pricing`** and compares `service_pricing.sale_price <
service_pricing.price` (the per-tier price column).

There is **no existing CHECK** enforcing `services.sale_price <
services.flat_price`. Whether to add one is a policy question. (The
single existing services row with sale_price = $1.25 vs flat_price =
$125 would pass — sale < flat — but it's the dirty-data row from
Verification 2.)

Migration script needs to reflect this:
- `DROP CONSTRAINT chk_service_sale_price` from `service_pricing`
  (NOT services) and recreate against `service_pricing.sale_price_cents
  < service_pricing.price_cents`
- `DROP CONSTRAINT chk_product_sale_price` from products, recreate
  against `products.sale_price_cents < products.retail_price_cents`
- `services_sale_price_non_negative` is satisfied by the new
  non-negative CHECK we're already adding — can DROP and rely on the
  generic one, or recreate against `sale_price_cents`. Pick at user
  decision time.
- **Decision required:** add a new `chk_services_sale_price` enforcing
  `services.sale_price_cents < services.flat_price_cents`? Or
  preserve current laxity?

### Verification 11 — Triggers / functions / views

- 3 `BEFORE UPDATE` triggers (one per table: `tr_services_updated_at`,
  `tr_products_updated_at`, `tr_packages_updated_at`) — they call
  `update_updated_at()` and don't touch money columns. Safe.
- 0 functions touch catalog money columns **other than** `void_transaction()`
  (already known from Unify-2).
- 0 views reference catalog money columns.

No surprises.

### Verification 12 — Test fixtures

8 test files use fixture values for catalog money columns:

| File | Notes |
|---|---|
| `src/app/admin/catalog/products/components/__tests__/quick-edit-drawer.test.tsx` | cost_price/retail_price as floats; expectation `retail_price: 12.5` |
| `src/app/pos/context/__tests__/ticket-reducer-vehicle-change.test.ts` | Many fixtures with vehicle_size_*_price, flat_price, per_unit_price |
| `src/app/pos/context/__tests__/quote-reducer-vehicle-change.test.ts` | Similar shape |
| `src/app/pos/utils/__tests__/pricing.test.ts` | Pricing model tests |
| `src/app/pos/components/__tests__/service-pricing-picker.test.tsx` | UI snapshot |
| `src/app/pos/components/__tests__/service-detail-dialog.test.tsx` | UI snapshot |
| `src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts` | cost_price reference |
| `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts` | cost_price reference |

All 8 need fixture updates to cents during Task 5.

### Verification 13 — ESLint money rule baseline

**29 warnings** from `money/no-unsuffixed-money-prop` — exact match to
Unify-1 baseline. Migration will reduce this; Gate 4 documents new count.

### Verification 14 — po_items typo

Confirmed at `src/app/admin/catalog/products/[id]/page.tsx:174`:

```ts
const { data: poItems } = await supabase
  .from('po_items')
  .select('unit_cost_cents, quantity_received, purchase_order_id,
           purchase_orders(id, po_number, received_at)')
  .eq('product_id', productId)
  .gt('quantity_received', 0)
  ...
```

`from('po_items')` → must change to `from('purchase_order_items')`.
The rest of the query (column list + filter) matches the actual table
schema, so the only fix is the table name. Opportunistic fix
pre-approved.

### Verification 15 — Data samples (10 most recent)

services: typical prices $75 / $125 / $175 (all whole dollar except
the "Headlight Restoration" sale_price = $1.25 row).

products: typical retail_price has cents (`$19.99`, `$11.39`, `$10.99`,
`$3.00`). All cost_prices have cents too. This is expected — products
are explicitly cents-allowed per v3 Part 1 (no whole-dollar CHECK).

---

## HALT-AND-DECIDE summary

**Per LOCKED-10, pausing before any code work for user decisions:**

### Decision D-1 — Whole-dollar pre-violator policy (4 rows)

The 4 violators split into two categories:

**Likely dirty data (1 row):** `services.sale_price = 1.25` on
"Headlight Restoration" — looks like a fat-finger or test entry; the
service's flat_price is $125 and this sale_price would be a 99% discount.

**Intentional business data (3 rows):** Ceramic Shield half-off
sale_prices in service_pricing for sedan/truck_suv/suv_3row tiers.
These are real half-dollar prices.

Three options:
- **(a) Round violators to whole dollars during migration backfill.**
  - Headlight Restoration sale_price 1.25 → 1 (= $1.00, 100¢)
  - Ceramic Shield sedan 212.50 → 213 (= $213, 21300¢), truck 262.50 →
    263, suv 313. Half-cent rounding adds a dollar of revenue per sale.
  - User adopts the new whole-dollar policy and stale data is corrected
    en route.
- **(b) Round Headlight Restoration to 1 (or NULL it — it's clearly
  bad data) and SKIP the whole-dollar CHECK on
  `service_pricing.sale_price_cents` to allow the Ceramic Shield
  half-off prices to live.**
  - Preserves real business intent; opens a hole in the constraint.
  - The constraint can be added back later via UI migration to round
    half-dollar sales to whole dollar.
- **(c) Halt the phase. Address bad data in a separate one-shot session
  before resuming Unify-3.**
  - Cleanest from a constraint-design standpoint; adds latency.

**Recommendation:** option (a) — round all 4 violators. Headlight
Restoration is clearly dirty. The Ceramic Shield half-off prices have
$0.50 rounding error which is below normal pricing-decision noise; the
user can re-enter exact prices via admin UI after migration if desired.

User decides. If (b), I'll author the migration with that single
service_pricing.sale_price_cents CHECK omitted and a note in MONEY.md.

### Decision D-2 — Services whole-dollar sale-price discipline CHECK

v3 playbook + LOCKED-3 Step 4 assume `chk_service_sale_price` exists
on `services` and enforces `sale_price < flat_price`. It doesn't.

Two options:
- **(a) Add a new `chk_services_sale_price`** enforcing
  `sale_price_cents IS NULL OR sale_price_cents < flat_price_cents`.
  - Brings services into parity with service_pricing + products.
  - Existing dirty data (Headlight 1.25 vs 125.00) passes (1.25 < 125).
- **(b) Preserve current laxity** — only the non-negative CHECK.
  - Maintains backward compatibility.
  - Lets future drift accumulate.

**Recommendation:** option (a). Consistency with service_pricing +
products is more valuable than the laxity. The new constraint won't
reject any existing data.

User decides.

### Decision D-3 — `service_pricing.chk_service_sale_price` location

The session prompt's LOCKED-3 Step 4 DROPs `chk_service_sale_price`
from `services`. Real constraint is on `service_pricing`.

The migration script will correctly DROP from `service_pricing` and
recreate against `_cents`. No user decision needed — this is just a
prompt-vs-reality correction.

### Decision D-4 — Square import script forward-compat

`scripts/import-square-data.mjs` is currently dollars-canonical. v3
playbook's "Square import boundary stays" assumed the API integration
shape, not the CSV-import shape.

Two options:
- **(a) Update the script as part of Unify-3.** Writes
  `cost_price_cents` / `retail_price_cents` via `toCents()`. Forward-
  compatible for Phase 16 (Launch Prep) reimport.
- **(b) Defer.** Update at Phase 16 or Unify-Final.

**Recommendation:** option (a). Trivial scope (one parse boundary
swap), zero runtime cost, and keeps the script honest with the new
canonical model.

User decides.

### Decision D-5 — Caller surface ~135 (within projection)

135 files is below v3's 150-210 projection. **Not a halt signal**
(LOCKED-10 says halt > 250). Reporting for completeness — proceeding
with this caller count is fine.

### Decision D-6 — `void_transaction()` body has 2 OTHER money operations

The function body (Unify-2 form) also contains:

```sql
-- Family A / G concern, NOT Family D:
revenue_attributed = GREATEST(0,
  ROUND((revenue_attributed - v_tx.total_amount)::numeric, 2))
lifetime_spend = GREATEST(0, lifetime_spend - v_tx.total_amount)
```

These reference `transactions.total_amount` (Family A) and
`customers.lifetime_spend` (Family G). **Unify-3 must NOT touch
these.** They get rewritten when their respective families migrate.

The Unify-3 migration only changes the `cost_price` block.

---

## PAUSED — awaiting user direction on D-1, D-2, D-4.

D-3, D-5, D-6 are noted/decided without user input needed (correctness
of the migration script + scope discipline).

Will not author the migration script or touch any code until user
resolves D-1, D-2, D-4.

## Checkpoint #2 — Post-migration

> Generated 2026-05-14 immediately after
> `supabase db push --linked` applied
> `20260514071552_unify_3_catalog_family_to_cents.sql` to the
> shared Supabase project. All queries reflect schema + data
> state with both legacy NUMERIC columns and new INTEGER cents
> columns present; caller code has NOT been migrated yet.

### Migration apply

```
Applying migration 20260514071552_unify_3_catalog_family_to_cents.sql...
Finished supabase db push.
```

No errors. Single atomic transaction succeeded.

### Schema state

**15 new cents columns** (all INTEGER, nullable):

| Table | Columns |
|---|---|
| `services` | `flat_price_cents`, `sale_price_cents`, `custom_starting_price_cents`, `per_unit_price_cents` |
| `service_pricing` | `price_cents`, `sale_price_cents`, `vehicle_size_sedan_price_cents`, `vehicle_size_truck_suv_price_cents`, `vehicle_size_suv_van_price_cents`, `vehicle_size_exotic_price_cents`, `vehicle_size_classic_price_cents` |
| `products` | `cost_price_cents`, `retail_price_cents`, `sale_price_cents` |
| `packages` | `price_cents` |

**4 legacy NOT NULLs dropped** (legacy columns now nullable):

- `service_pricing.price`
- `products.cost_price`
- `products.retail_price`
- `packages.price`

**28 new CHECK constraints** (3 pre-existing dollar CHECKs dropped):

- 15 non-negative `*_cents IS NULL OR *_cents >= 0`
- 10 whole-dollar `*_cents IS NULL OR *_cents % 100 = 0` (base prices
  only — D-1 Lax)
- 3 sale-price-discipline against `_cents` columns:
  - `service_pricing.chk_service_pricing_sale_price`
  - `products.chk_product_sale_price`
  - **`services.chk_services_sale_price`** (NEW per D-2)

The 3 originals that were dropped:
- `service_pricing.chk_service_sale_price` (dollar-targeted; recreated as `chk_service_pricing_sale_price`)
- `products.chk_product_sale_price` (dollar-targeted; recreated against `_cents`)
- `services.services_sale_price_non_negative` (dollar-targeted; replaced by `services_sale_price_cents_check`)

### Per-column SUM equivalence + NULL parity + both-cols mismatch

All 15 columns checked. **Zero divergence across all 4 invariants.**

| Column | Dollar non-null | Cents non-null | Dollar sum | Cents sum | Expected (×100) | NULL mismatch | Both-cols mismatch |
|---|---|---|---|---|---|---|---|
| services.flat_price | 12 | 12 | 1550.00 | 155000 | 155000 | 0 | 0 |
| services.sale_price | 0 | 0 | null | null | null | 0 | 0 |
| services.custom_starting_price | 1 | 1 | 475.00 | 47500 | 47500 | 0 | 0 |
| services.per_unit_price | 1 | 1 | 150.00 | 15000 | 15000 | 0 | 0 |
| service_pricing.price | 54 | 54 | 29235.00 | 2923500 | 2923500 | 0 | 0 |
| service_pricing.sale_price | 3 | 3 | 787.50 | 78750 | 78750 | 0 | 0 |
| service_pricing.vsedan | 1 | 1 | 300.00 | 30000 | 30000 | 0 | 0 |
| service_pricing.vtruck | 1 | 1 | 350.00 | 35000 | 35000 | 0 | 0 |
| service_pricing.vsuv_van | 1 | 1 | 450.00 | 45000 | 45000 | 0 | 0 |
| service_pricing.vexotic | 0 | 0 | null | null | null | 0 | 0 |
| service_pricing.vclassic | 0 | 0 | null | null | null | 0 | 0 |
| products.cost_price | 432 | 432 | 8687.71 | 868771 | 868771 | 0 | 0 |
| products.retail_price | 432 | 432 | 17868.24 | 1786824 | 1786824 | 0 | 0 |
| products.sale_price | 0 | 0 | null | null | null | 0 | 0 |
| packages.price | 0 | 0 | null | null | null | 0 | 0 |

Headlight Restoration confirmed cleaned (services.sale_price = 0 non-null
rows, was 1 with $1.25 pre-cleanup). Ceramic Shield half-off survived
intact (service_pricing.sale_price non_null = 3, sum 78750¢ = $787.50 =
212.50 + 262.50 + 312.50).

### Sale-price discipline post-migration

| Table | Violations |
|---|---|
| services | 0 |
| service_pricing | 0 |
| products | 0 |

All 3 sale-price-discipline CHECKs hold.

### void_transaction() function state

| Probe | Result |
|---|---|
| Body reads `cost_price_cents INTO v_product` | true |
| Body inserts `v_product.cost_price_cents` directly | true |
| Body still contains `ROUND(v_product.cost_price` shim | **false** (removed) |
| Body still contains `TODO Unify-D` marker | **false** (removed) |

Function correctly updated per Step 6. The other money references in
the function body (`transactions.total_amount`, `customers.lifetime_spend`)
were preserved verbatim — they get rewritten in Unify-5 (Family A) and
Unify-9 (Family G).

## Verdict (Checkpoint #2)

**All reconciliation gates pass with zero divergence.** Migration is
correct. Caller-code migration may proceed in Task 4.

## Checkpoint #3 — Post-deploy (deferred)

To be populated after Task 13.

## Checkpoint #3 — Post-deploy (deferred)

To be populated after Task 13.
