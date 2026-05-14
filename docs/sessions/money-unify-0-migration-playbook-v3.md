# Money-Unify Epic: Migration Playbook (v3)

> Revised playbook incorporating the **Path 2 production-deploy strategy**
> locked after the VPS alignment session for Unify-1+2. v1
> (`money-unify-0-migration-playbook.md`) and v2
> (`money-unify-0-migration-playbook-v2.md`) remain untouched for
> historical reference. See "Changes from v2 to v3" at the end of this
> document for the full diff.
>
> Prerequisite reading:
> - `docs/sessions/money-audit-1-representation-archaeology.md`
> - `docs/sessions/money-audit-2-subsystem-deep-dive.md`
> - `docs/sessions/money-unify-0-migration-playbook-v2.md`
> - `docs/sessions/money-unify-2-reconciliation.md`
> - `docs/sessions/money-unify-post-epic-followups.md`
> - `docs/adr/0003-money-math-via-integer-cents.md` (to be superseded in Unify-Final)
> - `docs/dev/DB_SCHEMA.md`
> - Recent CHANGELOG entries: Unify-1 (`e93bed6d`), Unify-2 (`600a3655`),
>   VPS alignment deploy (`ec14ca8f`)

---

## Executive Summary

Phase Money-Audit-1 established that the codebase carries 65 NUMERIC(10,2) dollar columns alongside 12 INTEGER cents columns; `formatCurrency()` has 510 callers with only 1 using the canonical `fromCents()` composition; ADR-0003's "cents canonical" rule applies in `refund-math.ts`'s 22-file blast radius and nowhere else.

Phase Money-Audit-2 deepened that analysis with subsystem-by-subsystem business-rule discovery (coupons, loyalty, Stripe minimum, deposits, mobile surcharge, cancellation, cash drawer, refund residual, tax). That audit surfaced 10 specific findings that change the migration approach.

Playbook v2 locked 26 user decisions plus the audit-2 findings; v3 carries every substantive v2 decision forward unchanged. **v3's revisions are deploy-framing only:** v2 was authored under the false assumption that `supabase db push --linked` and `supabase db query --linked` targeted a dev-only Supabase project distinct from production. That assumption was incorrect — Smart Details has a single shared Supabase project that serves both local Next.js dev and the VPS production deployment. The schema migration shipped by Unify-2 was applied directly to the production DB at `supabase db push` time, before the VPS code had been updated. A VPS alignment deploy (commit `ec14ca8f`) resolved the misalignment by pushing both Unify-1 (`e93bed6d`) and Unify-2 (`600a3655`) commits to the VPS.

**Operational reality recorded in v3:**

- The linked Supabase project **is** production. There is no separate dev DB. Every `supabase db push --linked`, `supabase db query --linked`, and `supabase gen types --linked` touches production state.
- "Dev" and "production" in this playbook refer to **VPS deploy state**, not separate DB instances. Local Next.js (MBP) and the VPS app server (Hostinger) both read/write the same shared Supabase DB.
- **Path 2 strategy locked.** Each Unify-N phase that ships schema or callers is deployed to production after passing local gates. No more "dev-only until Unify-Final" framing anywhere in the playbook.
- **Unify-Final shrinks accordingly.** It is no longer "first production deploy event" — production has been receiving Unify-N deploys all along. Unify-Final's scope is now: drop legacy NUMERIC columns (Migration 2 of the two-phase commit), delete legacy helpers, rewrite remaining inline patterns, upgrade lint to `'error'`, supersede ADR-0003.
- **CC does not SSH to VPS.** The no-SSH directive is permanent for the epic. User performs deploy via SSH. CC verifies production via curl from its local environment and via `supabase db query --linked` for post-deploy reconciliation.

**Phase status (as of v3 authoring):**

| Phase | Status | Commit | Notes |
| --- | --- | --- | --- |
| Unify-1 (foundation) | **Complete + deployed** | `e93bed6d` | Code-only; 13-site Stripe-min + loyalty-rate consolidation |
| Unify-2 (Family H — Inventory) | **Complete + deployed** | `600a3655` | 3 columns + 17 app files + 3 support files + `void_transaction()`; `// TODO Unify-D` shims at 9 sites |
| VPS alignment | **Complete** | `ec14ca8f` | Brought VPS to parity with locally-committed Unify-1+2 |
| Unify-3 (Family D — Catalog) | Pending | — | Next phase; parallelizable with Unify-4 |
| Unify-4 (Family E — Orders) | Pending | — | Parallelizable with Unify-3 |
| Unify-5 (Family A — POS Transactions) | Pending | — | Solo phase; biggest risk |
| Unify-6 (Family C — Appointments) | Pending | — | Parallelizable with Unify-7 |
| Unify-7 (Family F — Marketing) | Pending | — | Parallelizable with Unify-6 |
| Unify-8 (Family B — Quotes) | Pending | — | Parallelizable with Unify-9 |
| Unify-9 (Family G — Customer aggregate) | Pending | — | Parallelizable with Unify-8 |
| Unify-Final | Pending | — | Cleanup + ADR supersession |

**Structural shape from v2 carries forward unchanged:**

- Migration order: `H → D → E → A → C → B → F → G` (H now complete)
- Parallelization pairs: `D∥E`, `C∥F`, `B∥G` (all share zero source files)
- Critical-path length: 7 phase-slots (with parallel pairs collapsed)
- Unify-1 scope: helpers + lint rule + Stripe-min consolidation + REDEEM_RATE_CENTS + 2 hardcoded 0.05 fixes (actually 9+4 sites after pre-flight expansion)
- Business-policy whole-dollar CHECK constraints on services, service_pricing, packages, mobile_zones, appointment/quote mobile_surcharge
- Per-phase pre-flight data audits mandated
- Catalog-first ordering eliminates downstream shims
- Decisions A, B, C, D from v2 → APPROVED
- New: **Decision E — Path 2 per-phase deploy strategy** (see Decisions Required)

**Parallelization model: Option 2 (serialized deploys).** Code work for two parallel phases can happen simultaneously (different CC sessions, different worktrees). But **deploys serialize**: the first phase in a pair ships fully (commit → push → deploy → verify → post-deploy reconciliation) before the second phase ships, even if their code work was parallel. Calendar time savings come from parallel coding, not parallel production exposure. Reasoning: keeps production state predictable, simplifies reconciliation, simplifies rollback.

Per-family scope estimates carried over from v2 are **2-3× under-counted** in practice — Unify-2's actual surface was 17 app files + 3 support files + 1 Postgres function vs. v2's "~8 files" estimate. **Trust pre-flight verification over playbook predictions** going forward.

---

## Part 1 — Canonical Money Model

### Target end-state

Every money-bearing value in the system carries integer cents from storage through math to the final display boundary. Conversion to dollars happens exactly once per render path, at the formatter call.

(Substantively unchanged from v2 §Part 1; reproduced here for self-containment.)

**Storage layer:**
- All money columns are `INTEGER` storing cents (smallest currency unit, USD).
- Every money column name carries a `_cents` suffix. The suffix is the type signal — a future maintainer scanning a schema diff sees "this column is cents" without reading the migration body.
- Every money column carries a `CHECK (col_cents >= 0)` (or domain-appropriate bound) **plus** any business-policy constraint listed below.
- JSONB money values (e.g. `business_settings.value` carrying `default_deposit_amount`) carry cents too. The key name is suffixed `_cents` (`default_deposit_amount_cents`).

**Business-policy CHECK constraints** (user-locked per v2 LOCKED-2 #21–25):

| Column class | Granularity | CHECK added |
| --- | --- | --- |
| `services.flat_price_cents`, `sale_price_cents`, `custom_starting_price_cents`, `per_unit_price_cents` | Whole dollar | `% 100 = 0` (plus `>= 0`) |
| `service_pricing.*` (all variants: `price_cents`, all `vehicle_size_*_price_cents`, `sale_price_cents`) | Whole dollar | `% 100 = 0` |
| `packages.price_cents` | Whole dollar | `% 100 = 0` |
| `mobile_zones.surcharge_cents`, `appointments.mobile_surcharge_cents`, `quotes.mobile_surcharge_cents` | Whole dollar | `% 100 = 0` (plus existing mobile-consistency relational CHECK) |
| `products.*` (retail_price, sale_price, cost_price) | Cents OK | No whole-dollar CHECK |
| All discount columns (`*.discount_amount_cents`, `coupon_rewards.*`, `transactions.loyalty_discount_cents`, etc.) | Cents OK | No whole-dollar CHECK |
| All refund columns (`refunds.amount_cents`, `refund_items.amount_cents`) | Cents OK | No whole-dollar CHECK |
| All tax columns (`*.tax_amount_cents`) | Cents OK (computed) | No whole-dollar CHECK |
| All tip columns (`*.tip_amount_cents`, `payments.tip_net_cents`) | Cents OK (computed) | No whole-dollar CHECK |
| Cash drawer columns | Cents OK (aggregated) | No whole-dollar CHECK |

The whole-dollar CHECKs are pre-flight-audited before being added (see per-family pre-flight queries in Part 6).

**Code layer:**
- Every variable holding cents is suffixed `Cents` in camelCase (`amountCents`, `subtotalCents`) or `_cents` in snake_case (`amount_cents`, `subtotal_cents`).
- The 14 existing `*Dollars` identifiers survive as the **explicit dollars-at-the-boundary marker**.
- Unnamed numeric literals carry cents (`amount: 5000`, not `amount: 50`). Dollar-literal constants must be re-expressed when they appear (e.g. `STRIPE_MIN_AMOUNT_CENTS = 50`).
- All money arithmetic uses integer operators on cents. No `* 100` or `/ 100` inside business logic. The only sites that may convert are: (a) external-API boundaries that demand dollars (QBO, Shippo), (b) the formatter helper, (c) controlled-input value coercion.

**Math layer:**
- All money helpers live in `src/lib/utils/money.ts` (renamed from `refund-math.ts` in Unify-1 — already complete). The module exports `toCents`, `fromCents`, plus the refund-specific computations.
- Arithmetic on cents uses native JS integer math (safe up to 2^53).
- Tax computation (`pos/utils/tax.ts`) is rewritten in Family A to operate entirely on cents.
- Helper additions are **just-in-time** (v2 LOCKED-2 #4): do not preemptively add `sumCents`, `clampCents`, etc. Each helper is added in the family phase that first needs it.

**Display layer:**
- Single canonical formatter going forward: `formatMoney(cents: number): string` exported from `src/lib/utils/format.ts` (already added in Unify-1).
- The existing `formatCurrency(dollars: number)` function survives through the entire epic. Unify-Final renames `formatMoney` → `formatCurrency` and deletes the dollars helper.
- **Display always shows 2 decimals** (v2 LOCKED-2 #26). Whole-dollar services still render as `$125.00`, not `$125`.
- `formatMoneyForInput(cents): string` (added in Unify-1) for controlled-input dollar-edit fields.
- The 4 duplicate formatter implementations (`template.ts:143-146` `formatDollar`, `quickbooks/page.tsx:147-149` `formatDollar`, `quote-helpers.ts:33-35` local `formatCurrency`, `quick-edit-drawer.tsx:44-47` `formatPrice`) are deleted in their family phases or Unify-Final.
- All 48 files containing inline `` `$${x.toFixed(2)}` `` patterns are rewritten to `formatMoney(cents)` in their family phase. The lint rule (already at `'warn'` from Unify-1) catches new violations.

**Boundary layer:**
- Stripe: cents on the wire (already aligned).
- Square Catalog API: cents on the wire (`price_money.amount`).
- QuickBooks Online: decimal dollars (`Amount: 17.64`). Conversion via `fromCents()` at the QBO sync boundary. **QBO sync drops tax line entirely** (current behavior — preserved in this epic, NOT fixed; see post-epic followups #5).
- Shippo: decimal dollar strings. `toCents(Number(rate.amount))` at intake.
- Email/SMS/PDF/HTML: always `formatMoney(cents)`. No raw numbers in customer output.

### Environment terminology

To prevent the same confusion v2 carried:

| Term | Meaning in v3 |
| --- | --- |
| "Production DB" / "the linked Supabase project" | The single shared Supabase project (`zwvahzymzardmxixyfim`). Touched by every `supabase` CLI command with `--linked`. |
| "Production app" / "VPS" | The Hostinger VPS running Next.js. Receives code via `deploy-smartdetails` SSH script run by user. |
| "Local app" / "dev" | The Next.js dev server running on the user's MBP. Reads/writes the same shared Supabase project as VPS. |
| "Pre-deploy" | Local commit exists; not yet pushed to `origin/main` or deployed to VPS. |
| "Post-deploy" | Code committed, pushed to `origin/main`, and `deploy-smartdetails` has completed successfully on VPS. |

There is no "dev DB" anywhere. Any phrase like "dev-only deploy" from v1/v2 is **operationally meaningless** — both local and VPS read the same DB, so the only deploy state that matters is VPS code parity with the latest committed migration.

### Decision recap

> `formatMoney` is the canonical formatter and accepts integer cents. The legacy `formatCurrency` (dollars-input) survives the migration so per-family caller rewrites stay tractable. Unify-Final renames `formatMoney` → `formatCurrency` and deletes the dollars helper.

### Why cents-canonical

(Unchanged from v1/v2.) Single mental model, IEEE-754 immunity by default, alignment with Stripe (highest-frequency external boundary), and lint-rule tractability.

---

## Part 2 — Table Family Inventory

77 money columns across 23 tables, grouped into **8 families** by business domain + code-path coupling + migration-coupling. (Family grouping unchanged from v1/v2.)

### Family A — POS Transactions

The transaction-level money record. Six tables, 29 columns.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `transactions` | `subtotal`, `tax_amount`, `tip_amount`, `discount_amount`, `total_amount`, `loyalty_discount`, `deposit_credit` — all NUMERIC(10,2) → INTEGER cents | 7 cols |
| `transaction_items` | `unit_price`, `total_price`, `tax_amount`, `standard_price` — all NUMERIC(10,2) → INTEGER cents | 4 cols |
| `payments` | `amount`, `tip_amount`, `tip_net` — all NUMERIC(10,2) → INTEGER cents | 3 cols |
| `refunds` | `amount` → INTEGER cents | 1 col |
| `refund_items` | `amount` → INTEGER cents | 1 col |
| `cash_drawers` | 13 columns (opening_amount, expected_cash, counted_cash, variance, deposit_amount, next_day_float, cash_sales, cash_tips, cash_refunds, total_revenue, total_tax, total_tips, total_refunds) — all NUMERIC(10,2) → INTEGER cents | 13 cols |

**Column count:** 29. **Approximate caller count (v2 estimate):** ~110 source files. **Actual likely:** ~250-330 files given v2's 2-3× underestimate observed in Unify-2.

**Composite discount nature (v2 LOCKED-3 #29):** `transactions.discount_amount` is a **composite** value: `coupon + loyalty + manual`. `transactions.loyalty_discount` holds only the loyalty portion (for refund accounting). The coupon and manual portions are NOT independently stored on transactions. Reconciliation queries reflect this — see Part 6 §Family A.

**Migration-coupling:** Transactions and transaction_items migrate together. Payments and refunds couple to transactions via FK with reconciliation invariants (sum of payments ≤ transaction.total_amount). Cash_drawers aggregates from payments → must migrate atomically.

**cash_drawers backfill policy** (v2 LOCKED-2 #17): × 100 of existing values. Do NOT recompute from source rows — historical financial records should not change. Backfill is `ROUND(value * 100)::INTEGER` per column.

### Family B — Quotes

Quote builder pricing model. Two tables, 7 columns.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `quotes` | `subtotal`, `tax_amount`, `total_amount`, `mobile_surcharge` → INTEGER cents | 4 cols |
| `quote_items` | `unit_price`, `total_price`, `standard_price` → INTEGER cents | 3 cols |

**Column count:** 7. **Approximate caller count (v2 estimate):** ~28 files. **Actual likely:** 2-3× larger.

**CHECK constraint to migrate atomically** (v2 LOCKED-3 #27, verified from DB_SCHEMA.md:2095):
```
quotes_mobile_consistency:
CHECK (((is_mobile = false) AND (mobile_surcharge = (0)::numeric))
    OR ((is_mobile = true)  AND (mobile_surcharge > (0)::numeric)))
```
Must DROP + recreate against `mobile_surcharge_cents`. Plus the new whole-dollar CHECK on `quotes.mobile_surcharge_cents % 100 = 0` (v2 LOCKED-2 #15).

**Migration-coupling:** Quote→transaction convert paths (`/api/pos/quotes/[id]/convert/route.ts`, `/api/quotes/[id]/convert/route.ts`). With Family A migrating before B in the order, the convert path reads cents-native transactions, writes from cents-native quotes — no shim needed.

### Family C — Appointments

The job/booking record. Carries the only intra-table mixed-unit storage in the schema today.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `appointments` | `mobile_surcharge`, `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `cancellation_fee`, `deposit_amount`, `coupon_discount` → INTEGER cents | 8 dollar cols |
| `appointments` | `payment_link_amount_cents` — already INTEGER cents | No data migration |
| `appointment_services` | `price_at_booking` → INTEGER cents | 1 col |
| `mobile_zones` | `surcharge` → INTEGER cents | 1 col |
| `job_addons` | `price`, `discount_amount` → INTEGER cents | 2 cols |

**Column count to migrate:** 12 (plus the 1 already-cents).

**CHECK constraints to migrate atomically** (v2 LOCKED-3 #27):
```
appointments_mobile_consistency:
CHECK (((is_mobile = false) AND (mobile_surcharge = (0)::numeric))
    OR ((is_mobile = true)  AND (mobile_surcharge > (0)::numeric)))

payment_link_amount_cents_check:  -- already cents, survives unchanged
CHECK (((payment_link_amount_cents IS NULL) OR (payment_link_amount_cents >= 50)))
```
Drop + recreate `appointments_mobile_consistency` against `mobile_surcharge_cents`. Plus new whole-dollar CHECK on `appointments.mobile_surcharge_cents % 100 = 0` and `mobile_zones.surcharge_cents % 100 = 0`. Plus new `appointments.deposit_amount_cents` CHECK `IS NULL OR >= 0` (v2 LOCKED-2 #14).

**mobile_zones reality (v2 LOCKED-3 #30):** `mobile_zones` are **distance-based**, not ZIP-based. Each zone has `min_distance_miles` + `max_distance_miles` + flat surcharge. Zone resolution happens by cashier-pick at job-creation time, with surcharge snapshotted from the live `mobile_zones` row at save time.

**business_settings JSONB key:** `default_deposit_amount` migrates with Family C (rename to `default_deposit_amount_cents`, value × 100).

### Family D — Catalog

The price source-of-truth. Sells INTO transactions, quotes, appointments, and orders.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `services` | `flat_price`, `custom_starting_price`, `per_unit_price`, `sale_price` → INTEGER cents | 4 cols |
| `service_pricing` | `price`, `vehicle_size_sedan_price`, `vehicle_size_truck_suv_price`, `vehicle_size_suv_van_price`, `vehicle_size_exotic_price`, `vehicle_size_classic_price`, `sale_price` → INTEGER cents | 7 cols |
| `products` | `cost_price`, `retail_price`, `sale_price` → INTEGER cents | 3 cols |
| `packages` | `price` → INTEGER cents | 1 col |

**Column count:** 15. **Approximate caller count (v2 estimate):** ~70 files. **Actual likely:** ~150-210 files.

**Bonus scope inherited from Unify-2:** D's phase removes the 9 `// TODO Unify-D` shims left in place by Unify-2 (Family H):
1. `src/app/admin/inventory/purchase-orders/new/page.tsx:114`
2. `src/app/api/admin/purchase-orders/[id]/receive/route.ts:116`
3. `src/app/api/admin/orders/[id]/refund/route.ts:120`
4. `src/app/api/pos/shop-use/route.ts:78`
5. `src/app/api/pos/transactions/route.ts:439`
6. `src/app/api/pos/sync-offline-transaction/route.ts:218`
7. `src/app/api/pos/refunds/route.ts:558`
8. `src/app/api/webhooks/stripe/route.ts:303`
9. `supabase/migrations/20260514051953_unify_2_inventory_family_to_cents.sql:173` (inside `void_transaction()`)

These sites currently convert `products.cost_price` (dollars) → cents via `ROUND(... * 100)`. After D migrates, the conversion drops to direct cents passthrough. Family D's phase must rewrite `void_transaction()` in the same atomic migration that converts `products.cost_price` → `cost_price_cents`.

**CHECK constraints to migrate** (existing):
- `chk_service_sale_price` (sale_price < price → sale_price_cents < flat_price_cents)
- `chk_product_sale_price` (sale_price < retail_price → cents-equivalent)
- `services_sale_price_non_negative` (>= 0 → cents-equivalent)

**New CHECK constraints to add** (v2 LOCKED-2 #21–22 — services/packages whole-dollar; products NO whole-dollar):
```
chk_service_flat_price_whole_dollar:        flat_price_cents % 100 = 0
chk_service_sale_price_whole_dollar:        sale_price_cents IS NULL OR sale_price_cents % 100 = 0
chk_service_custom_starting_price_whole_dollar: custom_starting_price_cents IS NULL OR custom_starting_price_cents % 100 = 0
chk_service_per_unit_price_whole_dollar:    per_unit_price_cents IS NULL OR per_unit_price_cents % 100 = 0
chk_service_pricing_price_whole_dollar:     price_cents % 100 = 0
chk_service_pricing_vehicle_*_whole_dollar: each vehicle_size_*_price_cents % 100 = 0 (nullable-aware)
chk_service_pricing_sale_price_whole_dollar: sale_price_cents IS NULL OR sale_price_cents % 100 = 0
chk_package_price_whole_dollar:             price_cents % 100 = 0
```
No whole-dollar constraint on products. cost_price stays unconstrained (vendor prices may carry cents).

**Migration-coupling:** Catalog is **read by every transactional family**. With D at position 2 + two-phase commit (cents columns added alongside dollar columns, dollar columns retained), downstream families' readers continue to operate against dollar columns until each family migrates. Each transactional family's phase switches its readers to `_cents` as part of its scope.

### Family E — Orders (e-commerce)

Phase 9 e-commerce schema. Already cents-canonical internally; needs renaming + caller pattern rewrite.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `orders` | `subtotal`, `discount_amount`, `tax_amount`, `shipping_amount`, `total` — already INTEGER cents → rename to `_cents` | 5 rename-only |
| `order_items` | `unit_price`, `line_total`, `discount_amount` — already INTEGER cents → rename to `_cents` | 3 rename-only |
| `shipping_settings` | `flat_rate_amount` — already INTEGER cents → rename to `flat_rate_amount_cents` | 1 rename |
| `shipping_settings` | `handling_fee_amount` — NUMERIC(8,2) → INTEGER cents → `handling_fee_amount_cents` | 1 type migrate |

**Column count:** 9 rename + 1 type-migrate. **Approximate caller count (v2 estimate):** ~30 files (55 Pattern-B `formatCurrency(x / 100)` callers concentrated here). **Actual likely:** 2-3× larger.

**v2 finding:** orders reads from `products.retail_price` at checkout (in `/api/checkout/create-payment-intent/route.ts`). With D∥E parallelization, D's schema migration applies FIRST within the slot (per `supabase db push` sequencing), then E's code can read `products.retail_price_cents`. See Part 5 for the within-pair sequencing protocol.

### Family F — Marketing (Coupons + Campaigns)

Coupon discount mechanics + campaign attribution. Three tables, 4 columns.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `coupons` | `min_purchase` → INTEGER cents | 1 col |
| `coupon_rewards` | `discount_value`, `max_discount` → INTEGER cents | 2 cols (discount_type-aware) |
| `campaigns` | `revenue_attributed` → INTEGER cents | 1 col |

**Column count:** 4. **Approximate caller count (v2 estimate):** ~20 files. **Actual likely:** 2-3× larger.

**discount_type enum** (v2 LOCKED-3 #28): `'percentage' | 'flat' | 'free'`. Migration must handle all three:
- `flat`: `× 100` (dollars → cents)
- `percentage`: untouched (stays as percentage points, e.g. 10 means 10%)
- `free`: untouched (stored as 0; ignored by `calculateRewardDiscount`)

**Coupon use_count behavior** (v2 LOCKED-2 #12): partial refunds leave use_count un-decremented. Preserved in this epic; not fixed. Reconciliation queries cannot assume `use_count == count(completed transactions with this coupon)`.

**Q1.1 deferred** (v2 LOCKED-2 #7): the split-vs-single-column decision for `discount_value` is deferred to Unify-7 planning phase. Default assumption: single-column with discount_type-aware migration.

### Family G — Customer Aggregate

Single column.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `customers` | `lifetime_spend` → INTEGER cents | 1 col |

**Column count:** 1. **Approximate caller count (v2 estimate):** ~15 files. **Actual likely:** 2-3× larger.

**Migration-coupling:** `lifetime_spend` is a derived aggregate from `transactions.total_amount`. Must migrate AFTER Family A. With the order, G is at position 8, A is at position 4 — invariant satisfied. The Stripe webhook for e-commerce orders also writes lifetime_spend (`webhooks/stripe/route.ts:337-338`) — that write path needs cents handling as part of G's migration.

### Family H — Inventory & Procurement — **MIGRATED + DEPLOYED**

Vendor purchase orders + stock-adjustment costs. **Completed in Unify-2 (`600a3655`); deployed to VPS via `ec14ca8f`.**

| Table | Columns (current type → target) | Status |
| --- | --- | --- |
| `purchase_order_items` | `unit_cost` → `unit_cost_cents` | Migrated; legacy column retained |
| `stock_adjustments` | `unit_cost` → `unit_cost_cents` | Migrated; legacy column retained |
| `vendors` | `min_order_amount` → `min_order_amount_cents` | Migrated; legacy column retained |

**Unify-2 actual scope vs. v2 estimate:**
- v2 estimated ~8 caller files.
- Actual: **17 app files + 3 support files + 1 Postgres function** (`void_transaction`).
- **2.5× under-counted.** v2's estimate didn't trace transaction-lifecycle writers that write `stock_adjustments.unit_cost = product.cost_price`.

This scope-expansion observation drives v3's calendar-time honesty: **trust pre-flight verification over playbook estimates.**

Family H left 9 `// TODO Unify-D` shims in place at sites that convert `products.cost_price` → cents via `ROUND(... * 100)`. Family D's phase removes them.

### Family inventory summary

| Family | Tables | Columns to migrate | v2 caller estimate | Actual (or projected 2-3×) | Position |
| --- | --- | --- | --- | --- | --- |
| H. Inventory | 3 | 3 | ~8 | **20 actual** | 1 (Unify-2 — complete) |
| D. Catalog | 4 | 15 | ~70 | ~150-210 projected | 2 (Unify-3, parallel with E) |
| E. Orders | 3 | 9 rename + 1 migrate | ~30 | ~60-90 projected | 3 (Unify-4, parallel with D) |
| A. POS Transactions | 6 | 29 | ~110 | ~250-330 projected | 4 (Unify-5, solo) |
| C. Appointments | 4 | 12 | ~60 | ~120-180 projected | 5 (Unify-6, parallel with F) |
| F. Marketing | 3 | 4 | ~20 | ~40-60 projected | 6 (Unify-7, parallel with C) |
| B. Quotes | 2 | 7 | ~28 | ~56-84 projected | 7 (Unify-8, parallel with G) |
| G. Customer aggregate | 1 | 1 | ~15 | ~30-45 projected | 8 (Unify-9, parallel with B) |

**Total: 81 column changes** (77 type-migrate + 4 rename-only on Orders), ~350 v2-estimated distinct caller files — **likely ~700-1000 actual**.

---

## Part 3 — Migration Order

**Recommended order: H → D → E → A → C → B → F → G** (unchanged from v2). H is complete.

Eight families, ordered by (a) catalog-first readers-cents-from-start, (b) risk-tolerance (validate pattern on small family first), (c) dependency direction (derived families after their sources), and (d) blast-radius staging.

| Pos | Phase | Family | Status | Rationale |
| --- | --- | --- | --- | --- |
| 1 | Unify-2 | **H. Inventory** | **Done** | Pattern validator. 3 cols, 20 actual files. Closed `600a3655`; deployed `ec14ca8f`. |
| 2 | Unify-3 | **D. Catalog** | Pending | Largest READ fan-out. Two-phase commit; whole-dollar CHECKs land here. Removes the 9 Unify-2 `// TODO Unify-D` shims. |
| 3 | Unify-4 | **E. Orders** | Pending | Mostly rename + 1 type-migrate. Parallel with D; within-pair, D's schema applies FIRST. |
| 4 | Unify-5 | **A. POS Transactions** | Pending | Solo phase. 29 cols. Receipt fixture suite is safety net. cash_drawers backfill is × 100. |
| 5 | Unify-6 | **C. Appointments** | Pending | Depends on A. Includes business_settings JSONB key migration. mobile_consistency + whole-dollar + non-negative CHECKs all updated atomically. |
| 6 | Unify-7 | **F. Marketing** | Pending | discount_type-aware migration. Parallel with C. |
| 7 | Unify-8 | **B. Quotes** | Pending | Depends on A + C. Quote-side mobile_consistency CHECK + whole-dollar CHECK. |
| 8 | Unify-9 | **G. Customer Aggregate** | Pending | Aggregation source cents-native by position 4. Parallel with B. |

### Position-specific notes

- **Unify-1** (helpers + lint rule + Stripe-min consolidation + REDEEM_RATE_CENTS + 2 hardcoded 0.05 fixes) ran BEFORE position 1. **Complete (`e93bed6d`); deployed (`ec14ca8f`).**
- **Unify-Final** runs AFTER position 8. Now scoped to cleanup only (not "first production deploy"):
  - Drop legacy NUMERIC columns left behind by two-phase commits (Migration 2 per family)
  - Delete the legacy `refund-math.ts` deprecated re-export shim
  - Delete legacy `formatCurrency(dollars)` helper
  - Delete the 4 duplicate formatters per playbook §Family-by-Family
  - Rewrite the ~48 inline `${x.toFixed(2)}` files (large sub-pass, may warrant its own session)
  - Upgrade `money/no-unsuffixed-money-prop` from `'warn'` to `'error'`
  - Supersede ADR-0003 with new ADR documenting end-state
  - Update CLAUDE.md to remove "epic in progress" note
  - Final commit + push + deploy
- **Family A (Unify-5) is the single largest unit of risk.** Recommend 2 sessions minimum: one to migrate + commit + deploy, one to run reconciliation + fix any drift.

### Order alternatives considered (and rejected)

(Unchanged from v2 — analysis remains valid.)

- "Run all families strictly sequential, no parallel pairs." Calendar-time cost higher; rejected because parallel pairs are zero-overlap on source files and user has bandwidth.
- "Run D last (v1's order)." Rejected: every downstream family would need `// TODO Unify-D` shims at catalog read sites.
- "Run A second (right after H)." Rejected: A's reconciliation depends on stable reads from catalog. Catalog-first removes the friction.

---

## Part 4 — File-Overlap Matrix

(Matrix structure unchanged from v1/v2 — overlap is per-family-pair, independent of migration order.)

**Honesty note on estimate accuracy:** Unify-2 demonstrated that v1/v2 file estimates were 2.5× under-counted for Family H. Pair-overlap counts in this section may be similarly under-counted. Per-pair pre-flight verification (Part 6) is the authoritative source — do not trust this matrix's absolute counts.

### Per-family touch sets (summarized)

(Archetype touch sets per family. Parallelization pairs derived directly from this matrix.)

### Matrix (HIGH / MEDIUM / LOW)

|     | A   | B   | C   | D   | E   | F   | G   | H   |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A** | —   |     |     |     |     |     |     |     |
| **B** | **HIGH** | —   |     |     |     |     |     |     |
| **C** | **MED** | LOW | —   |     |     |     |     |     |
| **D** | **MED** | LOW | LOW | —   |     |     |     |     |
| **E** | LOW | LOW | LOW | **LOW** | —   |     |     |     |
| **F** | **MED** | LOW | LOW | LOW | **MED** | —   |     |     |
| **G** | **MED** | LOW | LOW | LOW | LOW | LOW | —   |     |
| **H** | LOW | LOW | LOW | **MED** | LOW | LOW | LOW | —   |

### Per-pair commentary on the non-LOW cells

(Unchanged from v2; restated for self-containment.)

- **A × B = HIGH.** Quote→transaction convert paths share `/api/pos/quotes/[id]/convert/route.ts` and similar. **Order: A (Unify-5) precedes B (Unify-8) — strict sequential.** A's scope includes `toCents(quote.discount_amount)` shim at the convert boundary (3 sites). B's scope removes these shims.
- **A × C = MEDIUM.** Shared anchors: `src/app/pos/jobs/components/job-detail.tsx` and `/api/pos/jobs/[id]/complete/route.ts`. **Order: A (5) precedes C (6) sequentially.** Shared files belong to A's scope.
- **A × D = MEDIUM.** A reads catalog. **Order: D (3) precedes A (5).** With two-phase commit, A reads cents-native catalog columns added by D's earlier phase. No shim direction reversal needed.
- **A × F = MEDIUM.** Coupon helpers (`coupon-helpers.ts`) write `discount_amount` into transactions + orders. **Order: A (5) precedes F (7).** A leaves a shim `// TODO Unify-7` at coupon-discount sites. F removes them.
- **A × G = MEDIUM.** Transactions completion writes `customers.lifetime_spend`. **Order: A (5) precedes G (9).** A leaves a `// TODO Unify-9` shim.
- **E × F = MEDIUM.** `/api/checkout/create-payment-intent/route.ts` is shared. **Order: E (4) precedes F (7).** Sequential.
- **D × H = MEDIUM.** Both touch `products` (D writes prices, H reads `cost_price`). **Order: H (2) precedes D (3).** H migrated first against still-dollar `products.cost_price` and left 9 `// TODO Unify-D` shims. D's phase removes them.

### MEDIUM cells: per-cell scope reservation

| Pair | Shared files (~) | Owner during overlap |
| --- | --- | --- |
| A × B | 3 convert-path files | A's scope leaves shim; B's scope removes |
| A × C | 2 files (`job-detail.tsx`, `/api/pos/jobs/[id]/complete/route.ts`) | A's scope |
| A × D | 3 files (`compose-line-items.ts`, `service-resolver.ts`, `pos/utils/pricing.ts`) | A reads cents-native columns added by D's earlier phase |
| A × F | 1 file (`coupon-helpers.ts`, indirect via validate endpoints) | F's scope (A uses shims) |
| A × G | 1 path (transactions-completion → customer-aggregate write) | G's scope (A uses shim) |
| E × F | 1 file (`/api/checkout/create-payment-intent/route.ts`) | F's scope (E uses shim) |
| D × H | 9 `// TODO Unify-D` shim sites in H's scope | D's scope removes them (Family H complete; shims live in committed code) |

---

## Part 5 — Parallelization Plan

**Recommended pairs: D∥E, C∥F, B∥G.** All three pairs have LOW overlap per the matrix. (Pairs unchanged from v2.)

### Parallelization model — Option 2 (serialized deploys)

v2 implicitly assumed "parallel" meant both phases ship simultaneously. **v3 locks Option 2: code work parallelizes; deploys serialize.**

**What can run in parallel:**
- Plan-phase artifacts for both pair-mates (PLAN.md, RESEARCH.md, etc.)
- Pre-flight queries and analysis
- Caller-code authoring in separate worktrees / separate CC sessions
- Local test runs (against the shared Supabase project — coordinate to avoid stomping)

**What must serialize:**
- `supabase db push --linked` — applies to production DB; two simultaneous applies risk migration-order races
- Local commit ordering — first phase commits, then second
- Push to `origin/main` — first phase pushes, second phase rebases
- `deploy-smartdetails` runs — first phase deploys fully (build → PM2 restart → curl verify → post-deploy reconciliation) before second phase pushes/deploys
- Post-deploy reconciliation queries — run after each deploy, not interleaved

**Why Option 2 over "true parallel deploys":**

1. **Predictable production state.** At any moment, production code corresponds to a specific commit on `origin/main`. Concurrent deploys would create windows where the deployed code references columns added by an unapplied migration.
2. **Simpler reconciliation.** Post-deploy reconciliation compares pre-deploy and post-deploy DB state to confirm zero drift. If two phases deploy concurrently, reconciliation can't distinguish drift sources.
3. **Simpler rollback.** Rolling back a single deploy is well-defined (`git revert` + DOWN migration + redeploy). Rolling back two concurrent deploys requires choreographed unwinding.
4. **Real time savings come from parallel coding, not parallel deploy.** Deploy itself is ~5-10 minutes; the savings from parallelizing two 5-minute deploys are dwarfed by the risk of misaligned production state.

### Recommended parallel groupings (revised)

```
                 ┌──────────────┐
                 │  Unify-1     │   Helpers + lint rule + Stripe-min
                 │  (helpers)   │   consolidation + REDEEM_RATE_CENTS
                 └──────┬───────┘   STATUS: COMPLETE + DEPLOYED
                        │           (e93bed6d → VPS via ec14ca8f)
                  ┌─────▼──────┐
                  │  Unify-2   │     Family H — Inventory
                  │  Family H  │     STATUS: COMPLETE + DEPLOYED
                  └─────┬──────┘     (600a3655 → VPS via ec14ca8f)
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-3  │                  │  Unify-4   │
    │ Family D │   code in        │  Family E  │
    │ Catalog  │   parallel,      │  Orders    │
    │ (15 cols)│   deploys        │  (rename+1)│
    └───┬──────┘   serialize      └────┬───────┘
        │  (D deploys first)            │
        └───────────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │  Unify-5   │     Family A — POS Transactions
                  │  Family A  │     (29 cols, ~250-330 files projected; SOLO)
                  └─────┬──────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-6  │                  │  Unify-7   │
    │ Family C │   code in        │  Family F  │
    │ Appoint. │   parallel,      │  Marketing │
    │ (12 cols)│   deploys        │  (4 cols)  │
    └───┬──────┘   serialize      └────┬───────┘
        │  (C deploys first)            │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-8  │                  │  Unify-9   │
    │ Family B │   code in        │  Family G  │
    │ Quotes   │   parallel,      │  Customer  │
    │ (7 cols) │   deploys        │  aggregate │
    └───┬──────┘   serialize      └────┬───────┘
        │  (B deploys first)            │
        └───────────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │ Unify-Final│     Drop legacy NUMERIC columns,
                  │            │     rename formatMoney→formatCurrency,
                  │            │     delete duplicates, lint→error,
                  │            │     supersede ADR-0003. Deploy as
                  │            │     normal phase (not first-deploy event).
                  └────────────┘
```

### Critical-path length

| Approach | Phase-slot count |
| --- | --- |
| Strict sequential | 10 |
| With recommended parallelization (code parallel, deploys serial) | **7 phase-slots** (Unify-1 done, Unify-2 done, [3∥4], Unify-5, [6∥7], [8∥9], Unify-Final) |

Calendar savings from Option 2 come from **parallel coding sessions**, not from parallel deploys. Realistic estimate: 0.5-1 day saved per pair (compared to strict sequential), total ~1.5-3 days for the remaining epic.

### Within-pair sequencing protocol

**Sequence per pair:**

1. **Plan/research in parallel.** Both phases produce plan artifacts (PLAN.md, RESEARCH.md, etc.) without touching production state.
2. **Pre-flight queries in parallel.** Each phase's pre-flight runs against the shared Supabase project (queries are read-only).
3. **First schema apply.** One phase's migration applied via `npx supabase db push --linked`. Recommend: D's schema first in pair 1, C's schema first in pair 2, B's schema first in pair 3 (smaller table footprint or more dependent columns goes first).
4. **First-phase caller updates committed locally.** Run all gates (typecheck, tests, lint, smoke).
5. **First-phase push to origin + deploy.** Hand off to user for `deploy-smartdetails`. Verify via curl. Run post-deploy reconciliation.
6. **Second schema apply.** Other phase's migration applied via `npx supabase db push --linked`.
7. **Second-phase caller updates committed locally.** Run all gates.
8. **Second-phase push to origin + deploy.** Hand off to user. Verify via curl. Run post-deploy reconciliation.
9. **Pair-level reconciliation.** Confirm both phases' invariants still hold; check for any cross-phase drift introduced by the second deploy.

This ordering matters for D∥E specifically: E's `/api/checkout/create-payment-intent/route.ts` reads `products.retail_price`. Until D's schema lands (adding `retail_price_cents`), E's caller can only read the old dollar column. By sequencing D first, E's code can switch to `retail_price_cents` immediately after D's schema apply.

### Parallelization caveats

- **Use different worktrees** or strictly-disjoint branches when running two CC sessions concurrently. `isolation: "worktree"` recommended when spawning agents.
- **Schema migrations apply one at a time** (production DB; per the within-pair protocol).
- **FILE_TREE.md updates contend.** Each pair's two phases serialize their FILE_TREE.md commits at end-of-phase.
- **Tests share production DB.** Reconciliation runs AFTER both deploys complete.
- **`origin/main` linearizes both phases.** Second phase's commit rebases on first phase's. If second phase pushes before first's deploy completes, the deploy script will pick up both commits — undesirable for clean reconciliation. **Wait for first phase's deploy to verify green before pushing second phase.**

---

## Part 6 — Reconciliation Strategy

Each family migration must prove: (a) total money preserved (zero-cent drift), (b) per-row preservation, (c) cross-table invariants preserved. **Every family has a mandatory pre-flight data audit** (v2 LOCKED-4) — SELECT queries surface CHECK violators, negative values, and cross-table drift BEFORE migration runs. Halt-and-decide if anomalies found.

**v3 addition — post-deploy reconciliation.** After `deploy-smartdetails` completes on VPS, the SAME reconciliation queries run AGAIN via `supabase db query --linked`. Results are compared to the post-migration (pre-deploy) snapshot. **Zero divergence is expected** between pre-deploy and post-deploy reconciliation. Any drift would indicate that the VPS code, in the deploy window, wrote inconsistent rows to the shared DB — which would be a critical signal.

Each family's reconciliation section below contains three checkpoints:
1. **Pre-flight data audit** — runs BEFORE schema migration; halt-and-decide on anomalies.
2. **Post-migration reconciliation** — runs AFTER `supabase db push --linked` succeeds, BEFORE code is pushed/deployed.
3. **Post-deploy reconciliation** — runs AFTER `deploy-smartdetails` succeeds on VPS. SAME queries as checkpoint 2. Confirm zero drift.

The query bodies are identical between checkpoints 2 and 3; only the timing changes. v3 documents the query once per family and notes "run at #2 and #3" rather than duplicating.

### Family A — POS Transactions

**Pre-flight data audit (REQUIRED before any migration step):**

```sql
-- 1. NULL anomalies on NOT NULL money columns (sanity check; should be 0)
SELECT COUNT(*) FROM transactions
WHERE subtotal IS NULL OR tax_amount IS NULL OR total_amount IS NULL
   OR discount_amount IS NULL OR tip_amount IS NULL OR loyalty_discount IS NULL
   OR deposit_credit IS NULL;

-- 2. Negative anomalies (should be 0; refunds.amount may be signed downstream)
SELECT COUNT(*) FROM transactions WHERE total_amount < 0 OR subtotal < 0;
SELECT COUNT(*) FROM payments WHERE amount < 0;
SELECT COUNT(*) FROM refunds WHERE amount < 0;

-- 3. Composite-discount invariant: loyalty_discount <= discount_amount
SELECT id, discount_amount, loyalty_discount
FROM transactions
WHERE loyalty_discount > discount_amount AND status IN ('completed', 'partial_refund', 'refunded');
-- Expected: 0 rows. Any returned = pre-existing data bug.

-- 4. Cross-table reconciliation drift: coupon use_count vs completed transactions
SELECT c.id, c.code, c.use_count, COUNT(t.id) AS completed_count
FROM coupons c
LEFT JOIN transactions t ON t.coupon_id = c.id AND t.status = 'completed'
GROUP BY c.id, c.code, c.use_count
HAVING c.use_count != COUNT(t.id);
-- Expected: rows OK (partial refund leaves use_count un-decremented per v2 LOCKED-2 #12).

-- 5. cash_drawers historical sanity: check for non-2-decimal precision
SELECT id, opening_amount, counted_cash, variance
FROM cash_drawers
WHERE opening_amount * 100 != ROUND(opening_amount * 100)
   OR counted_cash * 100 != ROUND(counted_cash * 100)
   OR variance * 100 != ROUND(variance * 100);
-- Expected: 0 rows.
```

**Post-migration (#2) and post-deploy (#3) preservation queries — RUN BOTH TIMES:**

```sql
-- transactions
-- BEFORE-MIGRATION SNAPSHOT (captured during pre-flight)
SELECT
  COUNT(*) AS row_count,
  SUM(total_amount)::NUMERIC(18,2) AS sum_total,
  SUM(subtotal)::NUMERIC(18,2) AS sum_subtotal,
  SUM(tax_amount)::NUMERIC(18,2) AS sum_tax,
  SUM(tip_amount)::NUMERIC(18,2) AS sum_tip,
  SUM(discount_amount)::NUMERIC(18,2) AS sum_discount,
  SUM(loyalty_discount)::NUMERIC(18,2) AS sum_loyalty,
  SUM(deposit_credit)::NUMERIC(18,2) AS sum_deposit_credit
FROM transactions;

-- POST-MIGRATION (and POST-DEPLOY): same shape on _cents columns
SELECT
  COUNT(*) AS row_count,
  SUM(total_amount_cents)::BIGINT AS sum_total_cents,
  SUM(subtotal_cents)::BIGINT AS sum_subtotal_cents,
  SUM(tax_amount_cents)::BIGINT AS sum_tax_cents,
  SUM(tip_amount_cents)::BIGINT AS sum_tip_cents,
  SUM(discount_amount_cents)::BIGINT AS sum_discount_cents,
  SUM(loyalty_discount_cents)::BIGINT AS sum_loyalty_cents,
  SUM(deposit_credit_cents)::BIGINT AS sum_deposit_credit_cents
FROM transactions;
-- Invariant: each cents sum == BEFORE value × 100. Tolerance: 0 cents.
-- Invariant (post-deploy vs post-migration): cents sums match exactly.
```

Repeat structure for `transaction_items`, `payments`, `refunds`, `refund_items`, `cash_drawers`.

**Per-component discount-amount breakdown** (v2 LOCKED-3 #29):

```sql
-- Verify discount_amount = coupon_portion + loyalty + manual identity
-- (Coupon portion is NOT stored directly; manual + coupon together = discount - loyalty)
SELECT
  COUNT(*) AS total_tx_with_discount,
  COUNT(*) FILTER (WHERE loyalty_discount > 0) AS has_loyalty,
  COUNT(*) FILTER (WHERE coupon_id IS NOT NULL) AS has_coupon,
  COUNT(*) FILTER (WHERE loyalty_discount = 0 AND coupon_id IS NULL) AS pure_manual,
  SUM(discount_amount)::NUMERIC(18,2) AS total_discounts,
  SUM(loyalty_discount)::NUMERIC(18,2) AS loyalty_total,
  SUM(discount_amount - loyalty_discount)::NUMERIC(18,2) AS coupon_plus_manual_total
FROM transactions
WHERE status IN ('completed', 'partial_refund', 'refunded') AND discount_amount > 0;
```

**Cross-table invariants:**
```sql
-- Transaction totals match item sums (invariant survives unit migration)
SELECT t.id, t.total_amount_cents,
  COALESCE(SUM(ti.total_price_cents + ti.tax_amount_cents), 0) AS item_sum_cents,
  t.discount_amount_cents
FROM transactions t
JOIN transaction_items ti ON ti.transaction_id = t.id
WHERE t.status IN ('completed', 'partial_refund', 'refunded')
GROUP BY t.id
HAVING ABS(t.total_amount_cents -
  (COALESCE(SUM(ti.total_price_cents + ti.tax_amount_cents), 0) - t.discount_amount_cents)) > 0;
-- Expected: 0 rows.

-- Payments + refunds balance against transactions for completed/refunded rows
SELECT t.id, t.total_amount_cents,
  COALESCE(SUM(p.amount_cents), 0) AS paid_cents,
  COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.transaction_id = t.id), 0) AS refunded_cents
FROM transactions t
LEFT JOIN payments p ON p.transaction_id = t.id
WHERE t.status = 'completed'
GROUP BY t.id
HAVING COALESCE(SUM(p.amount_cents), 0)
     - COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.transaction_id = t.id), 0)
     != t.total_amount_cents;
-- Expected: 0 rows.
```

**Integration-level reconciliation (post-deploy production curl checks per LOCKED-X):**
- `GET https://app.smartdetailsautospa.com/admin/transactions` → HTTP 307 (auth redirect; migrated code compiles)
- `GET https://app.smartdetailsautospa.com/pos` → HTTP 307
- `GET https://smartdetailsautospa.com/` → HTTP 200 (public; sanity)
- End-to-end (manual, post-deploy): cash + Stripe + split sales through POS; verify thermal + HTML receipts; verify 38-baseline receipt fixture suite at `src/lib/data/__tests__/__fixtures__/receipt-baselines/`.
- Stripe reconcile: `payments.amount_cents` for Stripe-paid transactions = `charges.amount` from Stripe API (tolerance 0).
- QBO sync: `src/lib/qbo/sync-transaction.ts` uses `fromCents(unit_price_cents)` post-migration; tax line continues to be omitted (preserve current behavior, see followups #5).

### Family B — Quotes

**Pre-flight data audit:**

```sql
-- 1. quotes_mobile_consistency pre-violators (should be 0 — CHECK is active)
SELECT COUNT(*) FROM quotes
WHERE (is_mobile = false AND mobile_surcharge != 0)
   OR (is_mobile = true AND mobile_surcharge <= 0);

-- 2. Whole-dollar pre-violators on mobile_surcharge
SELECT id, mobile_surcharge
FROM quotes
WHERE mobile_surcharge IS NOT NULL
  AND mobile_surcharge * 100 != ROUND(mobile_surcharge * 100)::INTEGER
  AND mobile_surcharge != ROUND(mobile_surcharge);

-- 3. Quote totals consistency
SELECT q.id, q.subtotal, COALESCE(SUM(qi.total_price), 0) + q.mobile_surcharge AS expected_subtotal
FROM quotes q
LEFT JOIN quote_items qi ON qi.quote_id = q.id
WHERE q.deleted_at IS NULL
GROUP BY q.id
HAVING q.subtotal != COALESCE(SUM(qi.total_price), 0) + q.mobile_surcharge;
```

**Post-migration AND post-deploy preservation (same query both times):**
```sql
-- BEFORE
SELECT COUNT(*), SUM(subtotal), SUM(tax_amount), SUM(total_amount), SUM(mobile_surcharge)
FROM quotes WHERE deleted_at IS NULL;
SELECT COUNT(*), SUM(unit_price), SUM(total_price), SUM(standard_price) FROM quote_items;

-- AFTER (× 100 of every BEFORE value)
SELECT COUNT(*), SUM(subtotal_cents), SUM(tax_amount_cents), SUM(total_amount_cents),
       SUM(mobile_surcharge_cents)
FROM quotes WHERE deleted_at IS NULL;
SELECT COUNT(*), SUM(unit_price_cents), SUM(total_price_cents), SUM(standard_price_cents)
FROM quote_items;
```

**Cross-table invariant:** subtotal = sum(items.total_price) + mobile_surcharge.

**Integration (post-deploy production curl):**
- `GET https://app.smartdetailsautospa.com/admin/quotes` → HTTP 307
- `GET https://app.smartdetailsautospa.com/pos/quotes` → HTTP 307
- Manual: quote build via POS, send via SMS+email, accept via public quote page, convert to transaction.

### Family C — Appointments

**Pre-flight data audit:**

```sql
-- 1. appointments_mobile_consistency pre-violators
SELECT COUNT(*) FROM appointments
WHERE (is_mobile = false AND mobile_surcharge != 0)
   OR (is_mobile = true AND mobile_surcharge <= 0);

-- 2. Whole-dollar pre-violators on appointments.mobile_surcharge + mobile_zones.surcharge
SELECT id, mobile_surcharge FROM appointments
WHERE mobile_surcharge IS NOT NULL AND mobile_surcharge != ROUND(mobile_surcharge);
SELECT id, name, surcharge FROM mobile_zones
WHERE surcharge != ROUND(surcharge);

-- 3. deposit_amount > total_amount cases (per v2 Q4.1 / LOCKED-2 #13)
SELECT id, deposit_amount, total_amount
FROM appointments
WHERE deposit_amount IS NOT NULL AND deposit_amount > total_amount;
-- Halt-and-decide if rows returned.

-- 4. deposit_amount >= 0 pre-violators
SELECT COUNT(*) FROM appointments
WHERE deposit_amount IS NOT NULL AND deposit_amount < 0;

-- 5. business_settings money keys
SELECT key, value FROM business_settings
WHERE key IN ('default_deposit_amount');

-- 6. Appointment subtotal sanity
SELECT a.id, a.subtotal,
  COALESCE(SUM(asvc.price_at_booking), 0) + a.mobile_surcharge AS expected_subtotal
FROM appointments a
LEFT JOIN appointment_services asvc ON asvc.appointment_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id
HAVING a.subtotal != COALESCE(SUM(asvc.price_at_booking), 0) + a.mobile_surcharge;
```

**CHECK constraints to migrate atomically** (v2 LOCKED-3 #27):
```sql
ALTER TABLE appointments DROP CONSTRAINT appointments_mobile_consistency;

ALTER TABLE appointments ADD CONSTRAINT appointments_mobile_consistency
  CHECK ((is_mobile = false AND mobile_surcharge_cents = 0)
      OR (is_mobile = true  AND mobile_surcharge_cents > 0));

ALTER TABLE appointments ADD CONSTRAINT chk_appointments_mobile_surcharge_whole_dollar
  CHECK (mobile_surcharge_cents % 100 = 0);

ALTER TABLE appointments ADD CONSTRAINT chk_appointments_deposit_amount_cents_non_negative
  CHECK (deposit_amount_cents IS NULL OR deposit_amount_cents >= 0);

ALTER TABLE mobile_zones ADD CONSTRAINT chk_mobile_zones_surcharge_whole_dollar
  CHECK (surcharge_cents % 100 = 0);
```

**business_settings JSONB key:**
```sql
UPDATE business_settings
SET value = (CAST(value AS NUMERIC) * 100)::TEXT::JSONB, key = 'default_deposit_amount_cents'
WHERE key = 'default_deposit_amount';
```

**Integration (post-deploy production curl):**
- `GET https://app.smartdetailsautospa.com/admin/jobs` → HTTP 307
- `GET https://smartdetailsautospa.com/book` → HTTP 200
- Manual: booking flow end-to-end, pay-link send, mobile-fee edit, deposit credit on POS checkout.

### Family D — Catalog

**Pre-flight data audit:**

```sql
-- 1. Whole-dollar pre-violators on services
SELECT id, name, flat_price, sale_price, custom_starting_price, per_unit_price
FROM services
WHERE (flat_price IS NOT NULL AND flat_price != ROUND(flat_price))
   OR (sale_price IS NOT NULL AND sale_price != ROUND(sale_price))
   OR (custom_starting_price IS NOT NULL AND custom_starting_price != ROUND(custom_starting_price))
   OR (per_unit_price IS NOT NULL AND per_unit_price != ROUND(per_unit_price));

-- 2. Whole-dollar pre-violators on service_pricing
SELECT id, service_id, price, sale_price,
       vehicle_size_sedan_price, vehicle_size_truck_suv_price,
       vehicle_size_suv_van_price, vehicle_size_exotic_price,
       vehicle_size_classic_price
FROM service_pricing
WHERE price != ROUND(price)
   OR (sale_price IS NOT NULL AND sale_price != ROUND(sale_price))
   OR (vehicle_size_sedan_price IS NOT NULL AND vehicle_size_sedan_price != ROUND(vehicle_size_sedan_price))
   OR (vehicle_size_truck_suv_price IS NOT NULL AND vehicle_size_truck_suv_price != ROUND(vehicle_size_truck_suv_price))
   OR (vehicle_size_suv_van_price IS NOT NULL AND vehicle_size_suv_van_price != ROUND(vehicle_size_suv_van_price))
   OR (vehicle_size_exotic_price IS NOT NULL AND vehicle_size_exotic_price != ROUND(vehicle_size_exotic_price))
   OR (vehicle_size_classic_price IS NOT NULL AND vehicle_size_classic_price != ROUND(vehicle_size_classic_price));

-- 3. Whole-dollar pre-violators on packages
SELECT id, name, price FROM packages
WHERE price != ROUND(price);

-- 4. Sale-price discipline (existing CHECK; verify still holding)
SELECT id, name, retail_price, sale_price FROM products
WHERE sale_price IS NOT NULL AND sale_price >= retail_price;
SELECT id, name, flat_price, sale_price FROM services
WHERE sale_price IS NOT NULL AND sale_price >= flat_price;

-- 5. Non-negative service prices
SELECT id, name, flat_price, sale_price, custom_starting_price, per_unit_price
FROM services
WHERE flat_price < 0 OR sale_price < 0 OR custom_starting_price < 0 OR per_unit_price < 0;
```

**Preservation (run at #2 and #3):**
```sql
-- BEFORE
SELECT COUNT(*), SUM(flat_price), SUM(custom_starting_price), SUM(per_unit_price), SUM(sale_price) FROM services;
SELECT COUNT(*), SUM(price), SUM(sale_price),
  SUM(vehicle_size_sedan_price), SUM(vehicle_size_truck_suv_price),
  SUM(vehicle_size_suv_van_price), SUM(vehicle_size_exotic_price),
  SUM(vehicle_size_classic_price)
FROM service_pricing;
SELECT COUNT(*), SUM(retail_price), SUM(cost_price), SUM(sale_price) FROM products;
SELECT COUNT(*), SUM(price) FROM packages;

-- AFTER mirrors (× 100 of every BEFORE column).
```

**New CHECK constraints to add:** see Part 2 §Family D for the full list.

**Integration (post-deploy production curl):**
- `GET https://smartdetailsautospa.com/services` → HTTP 200
- `GET https://smartdetailsautospa.com/products` → HTTP 200
- `GET https://app.smartdetailsautospa.com/admin/catalog/services` → HTTP 307
- AI content writer round-trip, Square import boundary check, POS pricing picker, public service/product pages, booking step-service-select, voice-agent services/products routes.

### Family E — Orders

**Pre-flight data audit:**

```sql
-- 1. Order total identity
SELECT o.id, o.total,
  (o.subtotal + o.tax_amount + o.shipping_amount - o.discount_amount) AS expected_total
FROM orders o
WHERE o.total != (o.subtotal + o.tax_amount + o.shipping_amount - o.discount_amount);

-- 2. order_items line_total identity
SELECT oi.id, oi.line_total, (oi.unit_price * oi.quantity - oi.discount_amount) AS expected
FROM order_items oi
WHERE oi.line_total != (oi.unit_price * oi.quantity - oi.discount_amount);

-- 3. shipping_settings handling_fee precision
SELECT id, flat_rate_amount, handling_fee_amount FROM shipping_settings;
```

**Preservation (run at #2 and #3):**
```sql
-- orders: identity preservation (just renaming cents columns)
SELECT COUNT(*), SUM(subtotal), SUM(discount_amount), SUM(tax_amount), SUM(shipping_amount), SUM(total) FROM orders;
SELECT COUNT(*), SUM(unit_price), SUM(line_total), SUM(discount_amount) FROM order_items;
SELECT COUNT(*), SUM(subtotal_cents), SUM(discount_amount_cents), SUM(tax_amount_cents),
       SUM(shipping_amount_cents), SUM(total_cents) FROM orders;
SELECT COUNT(*), SUM(unit_price_cents), SUM(line_total_cents), SUM(discount_amount_cents) FROM order_items;

-- shipping_settings handling_fee: × 100 migration
SELECT flat_rate_amount, handling_fee_amount FROM shipping_settings;
SELECT flat_rate_amount_cents, handling_fee_amount_cents FROM shipping_settings;
```

**Integration (post-deploy production curl):**
- `GET https://smartdetailsautospa.com/store` → HTTP 200
- `GET https://smartdetailsautospa.com/store/cart` → HTTP 200
- `GET https://app.smartdetailsautospa.com/admin/orders` → HTTP 307
- Manual: full checkout end-to-end (cart → coupon → ship → Stripe pay); replay payment_intent.succeeded webhook; verify order email render.

### Family F — Marketing

**Pre-flight data audit:**

```sql
-- 1. discount_type enum sanity
SELECT discount_type, COUNT(*) FROM coupon_rewards GROUP BY discount_type;

-- 2. Percentage row sanity
SELECT id, discount_value, max_discount
FROM coupon_rewards
WHERE discount_type = 'percentage' AND discount_value > 100;

-- 3. Free row sanity
SELECT id, discount_value
FROM coupon_rewards
WHERE discount_type = 'free' AND discount_value > 0;

-- 4. campaigns.revenue_attributed precision
SELECT COUNT(*) FROM campaigns
WHERE revenue_attributed * 100 != ROUND(revenue_attributed * 100);

-- 5. Coupon use_count vs completed transactions (informational)
SELECT c.id, c.code, c.use_count, COUNT(t.id) AS completed_count
FROM coupons c
LEFT JOIN transactions t ON t.coupon_id = c.id AND t.status = 'completed'
GROUP BY c.id, c.code, c.use_count
HAVING c.use_count != COUNT(t.id);
```

**Type-aware migration** (v2 LOCKED-3 #28):
```sql
ALTER TABLE coupon_rewards ADD COLUMN discount_value_cents INTEGER;
ALTER TABLE coupon_rewards ADD COLUMN max_discount_cents INTEGER;

UPDATE coupon_rewards SET discount_value_cents = ROUND(discount_value * 100)::INTEGER
WHERE discount_type = 'flat';

UPDATE coupon_rewards SET discount_value_cents = discount_value::INTEGER
WHERE discount_type = 'percentage';

UPDATE coupon_rewards SET discount_value_cents = 0
WHERE discount_type = 'free';

UPDATE coupon_rewards SET max_discount_cents = ROUND(max_discount * 100)::INTEGER
WHERE max_discount IS NOT NULL;

ALTER TABLE coupons ADD COLUMN min_purchase_cents INTEGER;
UPDATE coupons SET min_purchase_cents = ROUND(min_purchase * 100)::INTEGER
WHERE min_purchase IS NOT NULL;

ALTER TABLE campaigns ADD COLUMN revenue_attributed_cents INTEGER;
UPDATE campaigns SET revenue_attributed_cents = ROUND(revenue_attributed * 100)::INTEGER;
```

**Integration (post-deploy production curl):**
- `GET https://app.smartdetailsautospa.com/admin/marketing/coupons` → HTTP 307
- `GET https://app.smartdetailsautospa.com/admin/marketing/campaigns` → HTTP 307
- Manual: apply fixed $10 coupon at POS and checkout (verify discount = 1000 cents); apply 10% percentage coupon; apply 'free' coupon.

### Family G — Customer Aggregate

**Pre-flight data audit:**

```sql
-- 1. lifetime_spend precision
SELECT COUNT(*) FROM customers
WHERE lifetime_spend * 100 != ROUND(lifetime_spend * 100);

-- 2. Aggregation drift
SELECT c.id, c.first_name, c.last_name, c.lifetime_spend,
  COALESCE(SUM(t.total_amount), 0) AS actual_sum
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id AND t.status = 'completed'
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.first_name, c.last_name, c.lifetime_spend
HAVING ABS(c.lifetime_spend - COALESCE(SUM(t.total_amount), 0)) > 0.01;
```

**Preservation (run at #2 and #3):**
```sql
SELECT COUNT(*), SUM(lifetime_spend) FROM customers WHERE deleted_at IS NULL;       -- BEFORE
SELECT COUNT(*), SUM(lifetime_spend_cents) FROM customers WHERE deleted_at IS NULL; -- AFTER × 100
```

**Stripe webhook code update:** `src/app/api/webhooks/stripe/route.ts:337-338` switches to:
```js
lifetime_spend_cents: (customer.lifetime_spend_cents || 0) + order.total_cents,
```
(after orders renamed to `total_cents` in Unify-4).

**Integration (post-deploy production curl):**
- `GET https://app.smartdetailsautospa.com/admin/customers` → HTTP 307
- Manual: complete a test sale; verify increment; run lifecycle-engine cron; compare campaign-eligibility decisions before/after.

### Family H — Inventory — COMPLETE

For historical reference, reconciliation results for Family H are captured in `docs/sessions/money-unify-2-reconciliation.md` and the post-deploy curl checks are documented in the CHANGELOG entry for `ec14ca8f`. All gates passed with zero divergence.

The post-deploy reconciliation pattern v3 codifies was first validated by the VPS alignment deploy:
- SUM(dollars) vs SUM(cents) divergence: 0 across all 3 tables
- NULL parity mismatches: 0 across all 3 tables
- Both-cols-set row mismatches: 0 across all 3 tables
- Production curl checks: 6/6 HTTP 200 or 307; `STRIPE_MIN_DOLLARS` rejection confirmed live

---

## Part 7 — Rollback Plan

Every family migration is revertible at two distinct scopes: **pre-deploy** (local commits not yet pushed) and **post-deploy** (commits pushed and VPS deployed). v2 implicitly conflated these; v3 separates them.

### General rollback patterns

**Pre-deploy rollback** (commits live locally but not on `origin/main`):

1. Apply DOWN migration via `supabase db push --linked` (or run the DOWN SQL directly via `supabase db query --linked --file <DOWN-migration>`) — preserves access to the DOWN migration file in working tree until applied
2. Verify schema returned to pre-phase state via pre-flight queries
3. `git reset --hard <pre-phase-commit-hash>` — discard local commits
4. Code state and DB state both match pre-phase

**Order matters:** apply DOWN migration BEFORE `git reset --hard`. The DOWN migration file lives in `supabase/migrations/` and was created by the phase commit being rolled back; resetting first would remove the file from the working tree before it can be applied.

Pre-deploy rollback is **cheap and routine** — should be used liberally if any local gate fails.

**Post-deploy rollback** (commits on `origin/main` and VPS):

1. `git revert <phase-commit-hash>` — creates a NEW commit reversing the phase
2. `git push origin main`
3. Hand off to user: SSH to VPS and run `time deploy-smartdetails` to deploy the revert
4. Apply DOWN migration via `supabase db push --linked` (drops _cents columns, restores NUMERIC NOT NULL where applicable)
5. Run post-rollback reconciliation queries
6. Verify VPS code matches DB schema after rollback

Post-deploy rollback is **expensive and disruptive** — destroys live production data shape in the rollback window. Use only when post-deploy reconciliation surfaces drift or production curl checks fail catastrophically.

**Critical invariant for post-deploy rollback:** The DOWN migration MUST be authored alongside the UP migration in the same Unify-N phase. Authoring DOWN after the fact during a rollback emergency is unacceptable. Every Unify-N migration file ships with a companion `<ts>_<name>_down.sql` describing the inverse operations.

CC produces the DOWN migration during phase authoring. User performs the VPS-side rollback via SSH.

### Per-family rollback procedures

(Commit-boundary message format matches v2; rollback procedures expanded for two scopes.)

#### Family A — POS Transactions rollback

- **UP migration file:** `<ts>_migrate_pos_transactions_to_cents.sql`
- **DOWN migration file:** `<ts>_migrate_pos_transactions_to_cents_down.sql` (authored alongside UP)
- **Commit boundary:** `feat(money): migrate POS Transactions family to integer cents (Phase Money-Unify-5)`
- **Pre-deploy rollback** (apply DOWN BEFORE reset — see "Order matters" in §General rollback patterns):
  1. `npx supabase db push --linked` with DOWN migration file in `supabase/migrations/` (or `npx supabase db query --linked --file <DOWN-migration>`)
  2. Run pre-flight queries; confirm cents columns gone and dollar values unchanged
  3. `git reset --hard <pre-phase-hash>` — discard local commits (only after DOWN applied)
- **Post-deploy rollback:**
  1. `git revert <phase-hash>` + `git push origin main`
  2. User SSHes to VPS + `time deploy-smartdetails`
  3. `npx supabase db push --linked` (applies DOWN migration)
  4. Post-rollback reconciliation: pre-flight queries return to pre-phase baseline
- **cash_drawers backfill rollback** (v2 LOCKED-2 #17 — × 100 historical preservation): the DOWN script reverses by `value_cents / 100.0` (lossless for our data).
- **Verification gates:** reconciliation queries return zero drift; 38-baseline receipt fixture suite passes; cash + Stripe + split + refund + void POS end-to-end; QBO sync round-trip on sample transaction.

#### Family B — Quotes rollback

- **Commit boundary:** `feat(money): migrate Quotes family to integer cents (Phase Money-Unify-8)`
- **Pre-deploy + post-deploy scopes:** same shape as Family A.
- **CHECK constraint preservation:** `quotes_mobile_consistency` recreated against `mobile_surcharge_cents`. Rollback recreates against `mobile_surcharge`.
- **Whole-dollar CHECK** (new): also dropped during rollback.
- **Gates:** quote build, send (SMS+email), accept, convert.

#### Family C — Appointments rollback

- **Commit boundary:** `feat(money): migrate Appointments family to integer cents (Phase Money-Unify-6)`
- **Pre-deploy + post-deploy scopes:** same shape as Family A.
- **CHECK constraints rolled back:**
  - `appointments_mobile_consistency` (recreated against original `mobile_surcharge`)
  - `chk_appointments_mobile_surcharge_whole_dollar` (dropped)
  - `chk_appointments_deposit_amount_cents_non_negative` (dropped)
  - `chk_mobile_zones_surcharge_whole_dollar` (dropped)
- **business_settings rollback:**
  ```sql
  UPDATE business_settings
  SET value = (CAST(value AS NUMERIC) / 100)::TEXT::JSONB, key = 'default_deposit_amount'
  WHERE key = 'default_deposit_amount_cents';
  ```
- **Gates:** booking flow end-to-end, pay-link send, mobile-fee edit, deposit credit on POS checkout.

#### Family D — Catalog rollback

- **Commit boundary:** `feat(money): migrate Catalog family to integer cents (Phase Money-Unify-3)`
- **Pre-deploy + post-deploy scopes:** same shape as Family A.
- **CHECK constraints rolled back:** all whole-dollar constraints dropped; sale-price discipline constraints recreated against original dollar columns.
- **`void_transaction()` function rollback:** restore the cents-targeted body to the pre-D `cost_price` form. **Coordination required with Unify-2's body** — the DOWN must restore the Unify-2 form (cents-via-ROUND) rather than the original pre-Unify-2 form.
- **Gates:** AI content writer round-trip; Square import round-trip; POS pricing picker; public service/product pages; booking step-service-select; voice-agent.

#### Family E — Orders rollback

- **Commit boundary:** `feat(money): canonicalize Orders family naming + handling-fee migration (Phase Money-Unify-4)`
- **Pre-deploy + post-deploy scopes:** same shape as Family A.
- **Rollback:** column renames reversed; handling_fee migration reversed via `handling_fee_amount = handling_fee_amount_cents / 100.0`.
- **Gates:** checkout end-to-end; Stripe webhook replay; order email; admin orders detail.

#### Family F — Marketing rollback

- **Commit boundary:** `feat(money): migrate Marketing family to integer cents (Phase Money-Unify-7)`
- **Pre-deploy + post-deploy scopes:** same shape as Family A.
- **Critical:** `coupon_rewards.discount_value` discount_type-aware rollback (must match the migration's discount_type-aware backfill).
- **Gates:** apply fixed coupon (POS + e-commerce); apply percentage coupon; apply 'free' coupon; marketing analytics revenue sanity.

#### Family G — Customer aggregate rollback

- **Commit boundary:** `feat(money): migrate customer.lifetime_spend to cents (Phase Money-Unify-9)`
- **Pre-deploy + post-deploy scopes:** same shape as Family A.
- **Gates:** sale → lifetime_spend increment; lifecycle-engine cron decision stability.

#### Family H — Inventory rollback (historical)

- **Commit boundary:** `feat(money): migrate Inventory family to integer cents (Phase Money-Unify-2)` — `600a3655`
- **Deployment:** `ec14ca8f` (VPS alignment deploy)
- **Status:** Live in production. Pre-deploy rollback no longer applicable; post-deploy rollback procedure documented for completeness:
  - `git revert 600a3655 ec14ca8f` + push + deploy
  - Apply DOWN migration to drop `unit_cost_cents`, `min_order_amount_cents`, restore `NOT NULL` on `purchase_order_items.unit_cost`, restore `void_transaction()` pre-Unify-2 body
  - Post-rollback reconciliation: pre-Unify-2 baseline (NUMERIC sums = current cents sums / 100)

### Atomic-commit boundary template (v3)

```
feat(money): migrate <Family Name> family to integer cents (Phase Money-Unify-<N>)

- Schema: <N> columns NUMERIC(10,2) → INTEGER cents (UP)
- DOWN migration: <ts>_<name>_down.sql (revertible)
- Backfill: ROUND(col * 100) for each column
- Code: <N> source files rewritten, <M> Pattern-A callers → Pattern-C
- New CHECK constraints: <list> (where applicable)
- Pre-flight audit results: <summary, e.g. "0 anomalies found">
- Tests: reconciliation passes, fixture suite passes (where applicable)
- Production deploy: pending user `deploy-smartdetails` after push
```

The "Dev only" line from v2's template is removed — there is no dev-only state.

---

## Part 8 — Test Surface

Each family's test surface from v2 carries forward unchanged. v3 adds **production curl smoke checks** to each phase as part of post-deploy verification (per LOCKED-X step 4 in the per-phase template).

### Family A — POS Transactions

**Existing tests:** (carried from v2)
- `src/lib/utils/__tests__/refund-math.test.ts` (271 lines, Session 36)
- `src/lib/data/__tests__/receipt-composer.test.ts` + 38 fixture files
- `src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts`
- `src/app/api/pos/transactions/__tests__/auto-receipt-interlock.test.ts`
- `src/app/api/pos/transactions/[id]/__tests__/void.test.ts`
- `src/app/pos/components/transactions/__tests__/transaction-detail-void.test.tsx`
- `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts`
- `src/lib/utils/__tests__/validation-refund-shopuse.test.ts`
- `src/app/pos/utils/__tests__/pricing.test.ts`

**New for Unify-5:**
- End-of-day variance computation in cents
- cash_drawers backfill verification test (× 100 preserves history)
- QBO sync-transaction unit conversion (`fromCents()` boundary)
- Payment + refund balance invariant
- Composite discount-amount breakdown test
- Regenerate all 38 receipt fixtures; assert byte-identical to pre-migration
- **Post-deploy curl smoke set** (see Part 6 §Family A integration section)

### Family B — Quotes

**New for Unify-8:**
- Quote → transaction convert preserves totals exactly
- Quote subtotal = sum(items.total_price) + mobile_surcharge (cents-native)
- Whole-dollar mobile_surcharge CHECK rejects fractional surcharge writes
- Snapshot test for quote PDF render
- Post-deploy curl smoke set

### Family C — Appointments

**New for Unify-6:**
- Booking-flow money round-trip
- `appointments_mobile_consistency` CHECK rejects mobile=true,surcharge=0 writes
- Whole-dollar CHECK rejects $X.50 writes
- `deposit_amount_cents` non-negative CHECK rejects negative writes
- business_settings JSON deposit value reads correctly post-key-rename
- Pay-link amount validates against appointment.total_amount in cents
- Appointment-detail-dialog rendered totals snapshot
- Post-deploy curl smoke set

### Family D — Catalog

**New for Unify-3:**
- Vehicle-size pricing resolver returns cents
- Whole-dollar CHECK on every services / service_pricing / packages column rejects non-whole writes
- Sale-price discipline CHECK (recreated against `_cents` columns) rejects sale_price >= flat_price
- AI content writer reads cents and renders dollars correctly
- POS pricing picker snapshots regenerated
- Public service/product page snapshots regenerated
- **Removes all 9 `// TODO Unify-D` shim sites** (verify with `grep -rn "TODO Unify-D" src/ supabase/migrations/ | wc -l` returning `0`)
- Post-deploy curl smoke set

### Family E — Orders

**New for Unify-4:**
- Checkout total = subtotal_cents + tax_cents + shipping_cents − discount_cents
- Order email renders amounts via `formatMoney(cents)`
- Stripe webhook order-update flow on renamed columns
- Post-deploy curl smoke set

### Family F — Marketing

**New for Unify-7:**
- `calculateCouponDiscount` for flat coupon returns cents
- `calculateCouponDiscount` for percentage coupon returns cents
- `'free'` variant test
- max_discount_cents cap applied correctly
- discount_type-aware migration script verified
- campaign revenue_attributed_cents sums match attribution events
- Post-deploy curl smoke set

### Family G — Customer Aggregate

**New for Unify-9:**
- Completing a sale increments `customers.lifetime_spend_cents` by `transactions.total_amount_cents`
- Refund decrements lifetime_spend_cents
- Lifecycle-engine eligibility decision stable across migration
- Stripe webhook lifetime_spend update operates in cents
- Post-deploy curl smoke set

### Family H — Inventory (completed)

Original test scope shipped with Unify-2. Pattern reference for future families.

### Cross-family fixtures

| Fixture | Family | When regenerated |
| --- | --- | --- |
| 38 receipt baselines | A | Unify-5; expect byte-identical |
| Quote PDF baseline (new) | B | Unify-8 |
| Appointment-detail snapshot (new) | C | Unify-6 |
| Service/product page snapshots (new) | D | Unify-3 |
| Order confirmation email baseline (new) | E | Unify-4 |

---

## Decisions Required — APPROVED

(Decisions A, B, C, D carried forward unchanged from v2. New Decision E locks Path 2.)

### Decision A — `formatCurrency()` signature — **APPROVED**

`formatMoney(cents)` added in Unify-1 (complete). `formatCurrency(dollars)` survives the entire epic; Unify-Final renames `formatMoney → formatCurrency` and deletes the dollars helper.

### Decision B — Helper API surface — **APPROVED with modification**

Just-in-time, not preemptive. Unify-1 (complete) shipped:
- Rename `refund-math.ts` → `money.ts`
- Re-export from old path with `// @deprecated` comment
- All existing refund-math exports retained verbatim
- `toCents`, `fromCents`
- `formatMoney(cents)` in `format.ts`
- `formatMoneyForInput(cents)` in `format.ts`
- `STRIPE_MIN_AMOUNT_CENTS = 50` + `STRIPE_MIN_DOLLARS` (derived) in `money.ts`
- `LOYALTY.REDEEM_RATE_CENTS = 5` in `constants.ts`
- MONEY.md docs
- ESLint rule at `'warn'`

NOT added preemptively: `sumCents`, `clampCents`, `applyPercentageBps`, `splitProportionalCents`. Each helper added in the family phase that first needs it.

### Decision C — Naming convention — **APPROVED**

`_cents` suffix everywhere. Lint rule at `'warn'` through epic, `'error'` at Unify-Final.

### Decision D — External boundary policy — **APPROVED with addition**

| Boundary | Direction | Wire format | Conversion site |
| --- | --- | --- | --- |
| Stripe payment intent / refund | out | cents | Native pass-through after Unify-5 |
| Stripe webhook | in | cents | Native pass-through |
| Square Catalog API | in | cents | Native intake |
| QBO invoice/journal | out | decimal dollars | `fromCents()` in QBO sync |
| **QBO tax line** | **out** | **omitted (current behavior, NOT fixed)** | **See post-epic followups #5** |
| QBO read | in | decimal dollars | `toCents()` at intake (no read path currently) |
| Shippo rate | in | decimal string | `toCents(Number(rate.amount))` |
| Email / SMS render | out | formatted string | `formatMoney(cents)` |
| Receipt HTML/PDF | out | formatted string | `formatMoney(cents)` |
| Public quote/order/receipt pages | out | formatted string | `formatMoney(cents)` |
| Form inputs (price entry, refund) | in | dollar string from user | Parse + `toCents()` at submit time |
| Controlled-input edit fields | bidirectional | `formatMoneyForInput(cents)` display; `toCents()` submit | — |

### Decision E — Per-phase production deploy strategy (Path 2) — **APPROVED**

Each Unify-N phase (Unify-3 through Unify-9, plus Unify-Final) deploys to production after passing local gates. No "dev-only until Unify-Final" framing. The shared Supabase project IS production; every schema migration ships to production at `supabase db push --linked` time regardless of when the app code reaches VPS.

**Per-phase deploy template:**

1. Pre-flight verification
2. Migration apply via `supabase db push --linked`
3. Migration reconciliation (Part 6 #2)
4. Caller code migration
5. Local verification gates (typecheck, tests, lint, smoke)
6. Local commit
7. **NEW: Push to origin main**
8. **NEW: Hand off to user for `deploy-smartdetails` (no CC SSH)**
9. **NEW: Post-deploy production verification via curl**
10. **NEW: Post-deploy reconciliation (Part 6 #3, same queries as #2)**
11. **NEW: CHANGELOG entry documenting the deploy (build time, reconciliation result, warnings)**
12. **NEW: Push CHANGELOG commit to origin (no re-deploy needed for docs-only)**

**Parallelization model: Option 2 — serialized deploys.** Code work parallelizes (separate CC sessions, separate worktrees); deploys serialize (first phase fully ships before second).

**No-SSH directive:** CC does not SSH to VPS at any point. All VPS operations are user-performed. CC verifies production via curl + `supabase db query --linked` reconciliation.

**DOWN migration co-authoring:** Every UP migration ships with a companion DOWN migration in the same phase. DOWN authoring during a rollback emergency is unacceptable.

**Rollback scopes:**
- **Pre-deploy rollback** (local commits not yet pushed): DOWN migration apply FIRST, then `git reset --hard` (order matters — see Part 7 §General rollback patterns)
- **Post-deploy rollback** (commits pushed and deployed): `git revert` + push + user-deployed revert + DOWN migration apply

---

## Phase Sequence Summary

### Unify-1 — Helpers + Lint Rule + Stripe-Min Consolidation + Loyalty Constants

- **Status:** **COMPLETE + DEPLOYED** (`e93bed6d` → VPS via `ec14ca8f`)
- **Dependencies:** none
- **Parallelizable with:** nothing
- **Scope shipped:**
  1. Renamed `refund-math.ts` → `money.ts`; deprecated re-export shim
  2. Added `formatMoney`, `formatMoneyForInput` to `format.ts`
  3. Consolidated **9 Stripe-minimum sites** (3 more than v2 estimated) → single `STRIPE_MIN_AMOUNT_CENTS = 50` + `STRIPE_MIN_DOLLARS`
  4. Added `LOYALTY.REDEEM_RATE_CENTS = 5`
  5. Fixed **4 hardcoded 0.05 sites** (2 more than v2 estimated)
  6. Added ESLint rule `money/no-unsuffixed-money-prop` at `'warn'`
  7. Documented in `docs/dev/MONEY.md`; updated CLAUDE.md
- **Rollback scope used:** N/A — phase passed gates first time.

### Unify-2 — Family H: Inventory

- **Status:** **COMPLETE + DEPLOYED** (`600a3655` → VPS via `ec14ca8f`)
- **Dependencies:** Unify-1
- **Parallelizable with:** none (position 1 is solo)
- **Scope shipped:** 3 columns + **17 app files + 3 support files + `void_transaction()` function** (vs. v2 ~8 estimate; 2.5× actual)
- **Reconciliation result:** all gates zero divergence (see `docs/sessions/money-unify-2-reconciliation.md`)
- **Post-deploy verification:** 6/6 curl checks passed; `STRIPE_MIN_DOLLARS` rejection confirmed live; build time 5m 25s
- **9 `// TODO Unify-D` shims** left in place at `cost_price` conversion sites; cleaned up in Unify-3.

### Unify-3 — Family D: Catalog (parallel with Unify-4)

- **Dependencies:** Unify-1, Unify-2
- **Parallelizable with:** Unify-4 (Family E). Within-pair: D's schema applies FIRST.
- **Scope:** 15 columns + new whole-dollar CHECK constraints + sale-price discipline CHECK recreation + ~150-210 caller files (projected, 2-3× v2's ~70 estimate) + removal of all 9 Unify-2 `// TODO Unify-D` shim sites + `void_transaction()` rewrite to direct cents passthrough.
- **LOCKED decisions in prompt:** (v2 list carried forward)
  - LOCKED: migrate `services.flat_price`, `custom_starting_price`, `per_unit_price`, `sale_price`
  - LOCKED: migrate `service_pricing.*` (7 columns)
  - LOCKED: migrate `products.cost_price`, `retail_price`, `sale_price` + remove the 9 `// TODO Unify-D` shims
  - LOCKED: migrate `packages.price`
  - LOCKED: add whole-dollar CHECKs on services, service_pricing, packages (NOT on products)
  - LOCKED: recreate `chk_service_sale_price`, `chk_product_sale_price`, `services_sale_price_non_negative` against `_cents` columns
  - LOCKED: rewrite POS pricing picker, public service/product pages, AI content writer service/product context, voice-agent services/products routes
  - LOCKED: delete `quick-edit-drawer.tsx:44-47` `formatPrice` shim and replace with `formatMoneyForInput(cents)`
  - LOCKED: Square import boundary stays — input cents, store cents
  - LOCKED: schema applies BEFORE Unify-4's schema within pair
  - LOCKED: run pre-flight queries; halt if any whole-dollar pre-violators surface
- **Opportunistic fix candidate:** post-epic followups #11 (`po_items` typo in `catalog/products/[id]/page.tsx:174`) since this phase already touches `products`. User-decide at plan-phase.
- **Pre-flight queries:** see Part 6 §Family D.
- **Reconciliation:** see Part 6 §Family D (run at #2 post-migration and #3 post-deploy).
- **Rollback:** see Part 7 §Family D.
- **Test surface:** see Part 8 §Family D.
- **LOCKED-X — Production deploy procedure:**
  - Step 1: `git push origin main`. Verify `origin/main` reflects the Unify-3 commit.
  - Step 2: Hand off to user with this message:
    > "Commit `<hash>` is now on origin/main.
    > USER: please SSH to VPS and run:
    >   `cd /home/media/repositories/smart-details`
    >   `git log -1 --oneline` (verify pre-state)
    >   `git status` (verify clean)
    >   `pm2 list | grep smart-details` (pre-restart state)
    >   `time deploy-smartdetails` (perform deploy)
    > Report back with: pre-deploy git state, pre-deploy PM2 state, build time, post-deploy PM2 status, errors/warnings, final git state."
  - Step 3: Wait for user's deploy report.
  - Step 4: Run production verification via curl:
    - `https://smartdetailsautospa.com/` → HTTP 200
    - `https://smartdetailsautospa.com/services` → HTTP 200
    - `https://smartdetailsautospa.com/products` → HTTP 200
    - `https://app.smartdetailsautospa.com/admin/catalog/services` → HTTP 307
    - At least one money-touching endpoint exercised (e.g. GET service detail page renders price via `formatMoney`)
  - Step 5: Run post-deploy reconciliation queries via `supabase db query --linked` (same queries as post-migration). Confirm zero divergence vs pre-deploy snapshot.
  - Step 6: Append CHANGELOG entry documenting the deploy (build time, reconciliation result, any warnings, the 9 shim-site cleanups).
  - Step 7: Push CHANGELOG commit to origin (no re-deploy needed).
  - Step 8: Final phase gate report to user.
- **LOCKED-Y — Rollback procedures:**
  - **Pre-deploy rollback:** apply DOWN migration FIRST via `npx supabase db push --linked` (drops new whole-dollar CHECKs, drops `_cents` columns, restores `void_transaction()` to its Unify-2 body); verify schema via pre-flight queries; THEN `git reset --hard <pre-Unify-3-hash>` to discard local commits (restoring the 9 `// TODO Unify-D` shim conversions in source files). See Part 7 §General rollback patterns for the order rationale.
  - **Post-deploy rollback:** `git revert <Unify-3-hash>` + `git push origin main` + user-performed `deploy-smartdetails` of the revert + `npx supabase db push --linked` to apply DOWN. Post-rollback reconciliation: pre-Unify-3 baseline confirmed via Part 6 §Family D pre-flight queries.
- **LOCKED-Z — No-SSH directive:** CC does not SSH to VPS at any point. All VPS operations are user-performed. CC verifies production via curl.

### Unify-4 — Family E: Orders (parallel with Unify-3)

- **Dependencies:** Unify-1, Unify-2
- **Parallelizable with:** Unify-3. Within-pair: E's schema applies SECOND.
- **Scope:** 9 column renames + 1 type migration (`handling_fee_amount`) + 55 Pattern-B caller rewrites + Stripe webhook unit-alignment + order-emails formatter update.
- **LOCKED decisions in prompt:**
  - LOCKED: rename `orders.*` and `order_items.*` cents columns to `*_cents`
  - LOCKED: migrate `shipping_settings.handling_fee_amount` NUMERIC(8,2) → INTEGER cents + rename
  - LOCKED: rewrite ALL Pattern-B `formatCurrency(x / 100)` callers to `formatMoney(x)` (55 sites across 11 files)
  - LOCKED: delete inline `$${x.toFixed(2)}` patterns in order-emails / receipt routes
  - LOCKED: when reading `products.retail_price_cents` (D's column), depend on D's schema having landed first within the pair
- **Pre-flight queries:** see Part 6 §Family E.
- **Reconciliation:** see Part 6 §Family E (#2 and #3).
- **Rollback:** see Part 7 §Family E.
- **Test surface:** see Part 8 §Family E.
- **LOCKED-X — Production deploy procedure:** (8-step template per Decision E; specific curl set per Part 6 §Family E)
  - Curl set: `https://smartdetailsautospa.com/store` → 200; `https://smartdetailsautospa.com/store/cart` → 200; `https://app.smartdetailsautospa.com/admin/orders` → 307; one checkout-page render.
- **LOCKED-Y — Rollback procedures:** standard pre/post-deploy scopes per Decision E. DOWN reverses renames and `handling_fee_amount` × 100 backfill.
- **LOCKED-Z — No-SSH directive:** as above.

### Unify-5 — Family A: POS Transactions (solo)

- **Dependencies:** Unify-1, Unify-2, Unify-3, Unify-4
- **Parallelizable with:** nothing (solo phase, biggest risk)
- **Scope:** 29 columns + `pos/utils/tax.ts` rewrite (cents-native) + 8 `Math.round(x * 100)` sites + `compose-line-items.ts` rewrite + QBO sync conversion update + 38-fixture regeneration + refund-math importers re-import from `money.ts` + ~250-330 caller files projected.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate all 29 columns + `_cents` suffix
  - LOCKED: rewrite `pos/utils/tax.ts` to compute entirely in cents
  - LOCKED: rewrite all 8 `Math.round(x * 100)` sites
  - LOCKED: when reading catalog, switch to `_cents` columns (D's columns exist since Unify-3)
  - LOCKED: leave `toCents(quote.discount_amount)` shim at quote→transaction convert path (3 sites); comment `// TODO Unify-8 cleanup`
  - LOCKED: leave shim at lifetime_spend update site; comment `// TODO Unify-9 cleanup`
  - LOCKED: leave shim at coupon-helpers integration; comment `// TODO Unify-7 cleanup`
  - LOCKED: regenerate all 38 receipt fixtures; any non-zero diff blocks merge
  - LOCKED: `cash_drawers` backfill = × 100 only (no recompute)
  - LOCKED: per-component discount_amount breakdown reconciliation query passes
  - LOCKED: QBO tax-line behavior unchanged
- **Pre-flight queries:** see Part 6 §Family A.
- **Reconciliation:** see Part 6 §Family A (#2 and #3).
- **Rollback:** see Part 7 §Family A.
- **Test surface:** see Part 8 §Family A. **Recommend 2-session minimum** (one migrate+commit+deploy, one reconciliation+drift-fix).
- **LOCKED-X — Production deploy procedure:** (8-step template per Decision E)
  - Curl set: `https://app.smartdetailsautospa.com/admin/transactions` → 307; `https://app.smartdetailsautospa.com/pos` → 307; `https://smartdetailsautospa.com/` → 200; verify one Stripe payment-intent flow (manual).
  - **Special note:** because Family A is the largest unit of risk, post-deploy verification should include manual smoke (cash + Stripe + split + refund + void) before the phase is marked complete, not just curl health checks.
- **LOCKED-Y — Rollback procedures:** standard pre/post-deploy scopes. cash_drawers DOWN reverses by `value_cents / 100.0`. Receipt fixture set should regenerate to pre-Unify-5 state on rollback.
- **LOCKED-Z — No-SSH directive:** as above.

### Unify-6 — Family C: Appointments (parallel with Unify-7)

- **Dependencies:** Unify-5
- **Parallelizable with:** Unify-7 (Family F). Within-pair: C's schema applies FIRST.
- **Scope:** 8 appointments columns + 1 appointment_services + 1 mobile_zones + 2 job_addons + business_settings JSONB rename + ~120-180 caller files projected.
- **LOCKED decisions in prompt:**
  - LOCKED: rename `appointments.subtotal` → `subtotal_cents` and 7 siblings
  - LOCKED: rename JSONB key `default_deposit_amount` → `default_deposit_amount_cents`, value × 100
  - LOCKED: `payment_link_amount_cents` stays as-is
  - LOCKED: drop + recreate `appointments_mobile_consistency` against `mobile_surcharge_cents`
  - LOCKED: add whole-dollar CHECK `chk_appointments_mobile_surcharge_whole_dollar`
  - LOCKED: add non-negative CHECK `chk_appointments_deposit_amount_cents_non_negative`
  - LOCKED: add whole-dollar CHECK on `mobile_zones.surcharge_cents`
  - LOCKED: rewrite booking-flow display, pay-link send, mobile-fee picker, appointment detail dialog
  - LOCKED: update `src/lib/data/booking.ts` to read renamed JSONB key
  - LOCKED: rewrite `src/lib/utils/mobile-service-edit.ts` pure-cents
  - LOCKED: run pre-flight queries — especially deposit_amount > total_amount and mobile=true,surcharge=0
- **Opportunistic fix candidate:** post-epic followups #10 (`REDEEM_MINIMUM = 100` shadow in `step-confirm-book.tsx:186`) since Family C is the closest match to this booking-flow site.
- **Pre-flight queries:** see Part 6 §Family C.
- **Reconciliation:** see Part 6 §Family C (#2 and #3).
- **Rollback:** see Part 7 §Family C.
- **Test surface:** see Part 8 §Family C.
- **LOCKED-X — Production deploy procedure:** (8-step template per Decision E)
  - Curl set: `https://app.smartdetailsautospa.com/admin/jobs` → 307; `https://smartdetailsautospa.com/book` → 200; booking-completion smoke (manual).
- **LOCKED-Y — Rollback procedures:** standard scopes. DOWN reverses business_settings JSONB key + all CHECK constraints + cents columns.
- **LOCKED-Z — No-SSH directive:** as above.

### Unify-7 — Family F: Marketing (parallel with Unify-6)

- **Dependencies:** Unify-4, Unify-5
- **Parallelizable with:** Unify-6. Within-pair: F's schema applies SECOND.
- **Scope:** 4 columns + `coupon-helpers.ts` rewrite + analytics route updates + remove A's `// TODO Unify-7` shim at coupon integration sites + ~40-60 caller files projected.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `coupons.min_purchase`, `coupon_rewards.discount_value` (discount_type-aware), `coupon_rewards.max_discount`, `campaigns.revenue_attributed`
  - LOCKED: discount_type enum is `'percentage' | 'flat' | 'free'`
  - LOCKED: discount_type-aware migration (flat × 100, percentage untouched, free untouched)
  - LOCKED: rewrite `calculateCouponDiscount` to return cents
  - LOCKED: remove Unify-5's `// TODO Unify-7` shim at coupon integration points
  - LOCKED: partial refund use_count behavior preserved
  - LOCKED: max_discount migrates unconditional × 100
  - LOCKED: Q1.1 single-column vs split-column decision made at Unify-7 plan-phase
- **Pre-flight queries:** see Part 6 §Family F.
- **Reconciliation:** see Part 6 §Family F (#2 and #3).
- **Rollback:** see Part 7 §Family F.
- **Test surface:** see Part 8 §Family F.
- **LOCKED-X — Production deploy procedure:** (8-step template per Decision E)
  - Curl set: `https://app.smartdetailsautospa.com/admin/marketing/coupons` → 307; `https://app.smartdetailsautospa.com/admin/marketing/campaigns` → 307; apply fixed coupon flow (manual).
- **LOCKED-Y — Rollback procedures:** standard scopes. DOWN reverses discount_type-aware backfill (asymmetric — see Part 7 §Family F).
- **LOCKED-Z — No-SSH directive:** as above.

### Unify-8 — Family B: Quotes (parallel with Unify-9)

- **Dependencies:** Unify-5, Unify-6
- **Parallelizable with:** Unify-9. Within-pair: B's schema applies FIRST.
- **Scope:** 7 columns + ~56-84 caller files projected + delete `quote-helpers.ts:33-35` local `formatCurrency` + remove A's `// TODO Unify-8` shim at convert path.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `quotes.subtotal`, `tax_amount`, `total_amount`, `mobile_surcharge` and `quote_items.unit_price`, `total_price`, `standard_price`
  - LOCKED: drop + recreate `quotes_mobile_consistency` against `mobile_surcharge_cents`
  - LOCKED: add whole-dollar CHECK on `quotes.mobile_surcharge_cents`
  - LOCKED: rewrite POS quote builder, voice-agent quote routes, admin quote read view, public quote page
  - LOCKED: remove Unify-5's `// TODO Unify-8` shim at quote→transaction convert path
  - LOCKED: delete duplicate `formatCurrency` in `quote-helpers.ts:33-35`
- **Pre-flight queries:** see Part 6 §Family B.
- **Reconciliation:** see Part 6 §Family B (#2 and #3).
- **Rollback:** see Part 7 §Family B.
- **Test surface:** see Part 8 §Family B.
- **LOCKED-X — Production deploy procedure:** (8-step template per Decision E)
  - Curl set: `https://app.smartdetailsautospa.com/admin/quotes` → 307; `https://app.smartdetailsautospa.com/pos/quotes` → 307; quote → transaction convert (manual).
- **LOCKED-Y — Rollback procedures:** standard scopes. DOWN reverses CHECK + cents columns.
- **LOCKED-Z — No-SSH directive:** as above.

### Unify-9 — Family G: Customer Aggregate (parallel with Unify-8)

- **Dependencies:** Unify-5
- **Parallelizable with:** Unify-8. Within-pair: G's schema applies SECOND.
- **Scope:** 1 column + ~30-45 caller files projected + transaction-completion update path + Stripe webhook lifetime_spend update + lifecycle engine reads + remove A's `// TODO Unify-9` shim.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `customers.lifetime_spend` → `lifetime_spend_cents`
  - LOCKED: rewrite the aggregation site (transaction completion) to increment by cents
  - LOCKED: rewrite Stripe webhook `lifetime_spend` update to use cents
  - LOCKED: remove Unify-5's `// TODO Unify-9` shim at aggregate update site
  - LOCKED: rewrite admin customer pages, lifecycle engine, AI conversation summary, migration validation
- **Pre-flight queries:** see Part 6 §Family G.
- **Reconciliation:** see Part 6 §Family G (#2 and #3).
- **Rollback:** see Part 7 §Family G.
- **Test surface:** see Part 8 §Family G.
- **LOCKED-X — Production deploy procedure:** (8-step template per Decision E)
  - Curl set: `https://app.smartdetailsautospa.com/admin/customers` → 307; lifecycle-engine cron tick (verify via log or scheduler endpoint).
- **LOCKED-Y — Rollback procedures:** standard scopes. DOWN reverses `lifetime_spend_cents` to `lifetime_spend` (lossless).
- **LOCKED-Z — No-SSH directive:** as above.

### Unify-Final — Cleanup + ADR

- **Status:** Pending (after Unify-9)
- **Dependencies:** all of Unify-1 through Unify-9
- **Parallelizable with:** nothing
- **Scope (revised per LOCKED-2 #6 — no longer "first production deploy"):**
  - Drop all NUMERIC(10,2) dollar columns left by two-phase commits (Migration 2 per family)
  - Delete `src/lib/utils/refund-math.ts` re-export shim (after every importer migrated)
  - Delete legacy `formatCurrency(dollars)` helper
  - Rename `formatMoney` → `formatCurrency`
  - Delete duplicate formatters per playbook §Family-by-Family that survived (audit `template.ts:143-146`, `quickbooks/page.tsx:147-149`; others should be gone by their family phase)
  - Rewrite remaining ~48 inline `${x.toFixed(2)}` files to `formatMoney(cents)` (large sub-pass — may warrant a dedicated session within Unify-Final)
  - Upgrade `money/no-unsuffixed-money-prop` and `money/no-stripe-minimum-literal` lint rules from `'warn'` to `'error'`
  - Supersede ADR-0003 with ADR-000N "Money model unified to integer cents (end-state)"; leave ADR-0003 in place with "Superseded by 000N" header
  - Update CLAUDE.md to remove "Money-Unify epic in progress" note (Rule 20 → end-state form)
  - Regenerate DB_SCHEMA.md
- **LOCKED-X — Production deploy procedure:** same 8-step template per Decision E. Curl set covers the entire money surface (catalog, store, admin, POS, customer portal) at one go since this is the end-of-epic deploy. Build time may be longer due to the large file count (48-file inline rewrite).
- **LOCKED-Y — Rollback procedures:** standard scopes. DOWN restores the legacy dollar columns (re-add NUMERIC columns; backfill from `_cents / 100.0`). **Caveat:** rollback risk is highest here because two-phase commit ends — if a regression is found post-deploy, restoring the dollar columns may have data-shape implications worth user discussion before executing. Pre-deploy rollback (revert local commits) is safer; prefer that path.
- **LOCKED-Z — No-SSH directive:** as above.

---

## Open Questions

### Resolved (Priority 1 from audit-2 — all locked in v2/v3)

- ~~**Q1.1**~~ — Deferred to Unify-7 planning phase (v2 LOCKED-2 #7).
- ~~**Q3.1**~~ — RESOLVED: consolidated in Unify-1 (complete; 9 sites).
- ~~**Q9.1**~~ — DEFERRED: tracked in post-epic followups #1.
- ~~**Q9.2**~~ — RESOLVED: keep `TAX_RATE = 0.1025` float.
- ~~**Q2.1**~~ — RESOLVED: expressed alongside (LOYALTY.REDEEM_RATE_CENTS = 5); 4 hardcoded sites fixed in Unify-1.

### Remaining — Priority 2 (block specific later phases)

- **Q1.1 (re-stated, blocks Unify-7)** — `coupon_rewards.discount_value` split-column vs single-column. Default: single-column with discount_type-aware migration. Decide at Unify-7 plan-phase.
- **Q4.1 (blocks Unify-6)** — Cases where `appointments.deposit_amount > appointments.total_amount`. Pre-flight SELECT at Unify-6 start; user decides policy if rows surface.
- **Q5.2 (blocks Unify-6)** — Pre-flight `mobile=true,surcharge=0` audit. Halt-and-decide if rows surface.
- **D pre-flight whole-dollar audit (blocks Unify-3)** — Services / service_pricing / packages rows with non-whole-dollar prices. Halt-and-decide if rows surface.

### Remaining — Priority 3 (orthogonal but tracked)

Tracked in `docs/sessions/money-unify-post-epic-followups.md`. Items 1–12 cover:
- Q1.4 (combinable_with_sales dead column)
- Q1.6 (booking flow coupon use_count verification)
- Q1.7 (e-commerce campaigns redeemed_count omission)
- Q3.2 (booking wizard client-side $0.50 enforcement)
- Q4.3 (server-side deposit ≤ total validation)
- Q4.4 (already-correctly-named `payment_link_amount_cents`)
- Q6.1 (no global cancellation_fee setting)
- Q6.2 (already audit-logged — confirmed)
- Q6.3 (cancellation_fee doesn't auto-charge)
- Q7.3 (cash_drawers.deposit_amount naming overload)
- Q7.4 (end-of-day UTC midnight bug)
- Q8.1/8.2/8.3 (refund residual edge cases — verified safe)
- Q9.3 (TAX_PRODUCTS_ONLY dead constant)
- Q9.4 (tax rate change policy)
- Q9.5 (QBO drops tax line)
- **#10 — `REDEEM_MINIMUM = 100` shadow in `step-confirm-book.tsx:186`** (Unify-1 verification surfacing). Recommended Family C-adjacent or Unify-Final cleanup.
- **#11 — `po_items` typo in `catalog/products/[id]/page.tsx:174`** (Unify-2 verification surfacing). Recommended opportunistic fix during Unify-3 since that phase touches `products`.
- **#12 — "Failed to load active credentials" cron startup log** (VPS alignment deploy surfacing). Pre-existing; soft-failure. Investigation post-epic. **Not scoped into any Unify-N phase.**

---

## Honest Limitations of This Playbook

(Updated for production-deploy reality.)

What this playbook **cannot** predict:

- **Per-family actual caller counts.** Unify-2 demonstrated 2-3× v2 underestimate. Pre-flight verification is the only authoritative source; trust it over the file-overlap matrix.
- **VPS deploy behavior under specific conditions.** Build time, PM2 restart success, port binding, DNS propagation — all observed empirically per deploy. Unify-1+2 alignment deploy took 5m 25s; this is a sample of one, not a guarantee.
- **Reconciliation drift in the deploy window.** v3's post-deploy reconciliation surfaces drift if it occurs; no playbook can predict whether it will. The Unify-2 alignment deploy showed zero drift, but a longer window or higher-traffic period could behave differently.
- **Whether real-data corner cases will surface at pre-flight time.** v2 LOCKED-4 mandated pre-flight queries to catch many anomalies; v3 retains them. Unify-2 found 0 anomalies; no guarantee that Unify-3+ will be as clean.

What this playbook **assumes**:

- The shared Supabase project's data shape doesn't change radically between now and Unify-Final.
- The VPS deploy script (`deploy-smartdetails`) continues to behave as observed.
- User performs SSH operations promptly when handed off — phase handoffs are part of the critical path.
- `git revert` + `deploy-smartdetails` is sufficient for post-deploy rollback (true for code-only changes; schema rollback also requires DOWN migration apply).
- No external service (Stripe, QBO, Shippo) changes its API contract during the epic.

What **could change** as phases execute:

- Per-family scope estimates are projections; reality is 2-3× larger per Unify-2.
- The 2-3 day calendar-time savings from parallel pairs is best-case; user bandwidth coordinates this.
- Unify-5 (Family A) recommend 2-session minimum may grow if reconciliation surfaces unexpected drift.
- Opportunistic fixes (followups #10, #11) may bloat their host phase scope — user-decide at plan-phase.

---

## Sign-off Checklist (v3)

- [ ] Operational reality recorded: shared Supabase project = production; no separate dev DB
- [ ] Path 2 deploy strategy approved (Decision E)
- [ ] Per-phase deploy template (LOCKED-X) approved
- [ ] Pre-deploy + post-deploy rollback scopes (LOCKED-Y) approved
- [ ] No-SSH directive permanent for the epic (LOCKED-Z) approved
- [ ] Parallelization model Option 2 (serialized deploys) approved
- [ ] Post-deploy reconciliation step #3 mandated for every family
- [ ] DOWN migration co-authored alongside UP for every phase
- [ ] Unify-Final scope revised (cleanup only; not "first production deploy")
- [ ] Cron credential warning (followups #12) acknowledged as pre-existing, out-of-scope
- [ ] Scope-expansion observation recorded (Unify-2 was 2.5× v2 estimate; trust pre-flight over estimates)
- [ ] All v2 decisions A, B, C, D APPROVED (no substantive change)
- [ ] All v2 LOCKED decisions carried forward verbatim
- [ ] Unify-1 and Unify-2 marked as complete + deployed with commit references

Next phase: write the Unify-3 prompt.

---

## Changes from v2 to v3

This section enumerates every revision applied to v2 to produce v3. Substance unchanged; deploy framing revised throughout.

| Section | v2 state | v3 change | Source / rationale |
| --- | --- | --- | --- |
| Executive Summary | "Dev-only deploy through the entire epic; production deferred until Unify-Final verification." | Removed dev-only framing. Added Path 2 description: each Unify-N phase deploys to production after passing local gates. Added operational reality: shared Supabase = production. Added Unify-1+2 completion + deployment status. | LOCKED-2 #1, #2, #4, VPS alignment session |
| Part 1 — Canonical Money Model | No environment-terminology section | Added "Environment terminology" subsection defining production-DB, production-app/VPS, local-app/dev, pre-deploy, post-deploy. Explicitly states there is no "dev DB". | LOCKED-2 #2, LOCKED-3 Part 1 |
| Part 2 §Family H | Pending status | Marked **MIGRATED + DEPLOYED**. Added commit references (`600a3655`, `ec14ca8f`). Added 2.5× scope-expansion observation (v2 estimated ~8 files; actual 20). Noted 9 `// TODO Unify-D` shims left at cost_price conversion sites. | Unify-2 actual execution, CHANGELOG `ec14ca8f` |
| Part 2 §Family inventory summary | All families "Pending" or unspecified status | Added Status column with current state; Actual vs v2-estimate column showing 2-3× projection for remaining families. | LOCKED-3 Part 2, Unify-2 evidence |
| Part 3 — Migration Order | "H complete" not yet possible; status column generic | Updated status column: H complete, D-G pending. Added Unify-2 scope-expansion observation to position-specific notes. Revised Unify-Final scope per LOCKED-2 #6 (cleanup only, not "first deploy event"). | LOCKED-2 #6, LOCKED-3 Part 3 |
| Part 4 — File-Overlap Matrix | Implicit estimate accuracy | Added "Honesty note on estimate accuracy" noting 2-3× under-counted per Unify-2 evidence. Pre-flight verification is authoritative. | LOCKED-3 Part 4 |
| Part 4 D × H row | "Shim sites: 1 column read in H's scope" | Updated to: "9 `// TODO Unify-D` shim sites in H's scope; Family H complete; shims live in committed code; D's scope removes them." | Unify-2 actual execution |
| Part 5 — Parallelization Plan | Implicit deploy parallelism; "use when bandwidth available" | **Major revision.** Added Option 2 (serialized deploys) model: code work parallelizes, deploys serialize. Documented what can run parallel vs must serialize. Documented why Option 2 over true-parallel-deploys (predictable state, simpler reconciliation, simpler rollback). Added explicit pair-mate sequencing protocol with 9-step ordering. Phase sequence diagram updated to show "code in parallel, deploys serialize" labeling. | LOCKED-2 #5, LOCKED-3 Part 5 |
| Part 6 — Reconciliation Strategy | Pre-flight + post-migration only | **Added post-deploy reconciliation (checkpoint #3).** Same queries as #2; runs after `deploy-smartdetails` completes. Zero divergence expected vs pre-deploy snapshot. Each family's section explicitly documents "run at #2 and #3". | LOCKED-2 #3, LOCKED-3 Part 6 |
| Part 6 §Family H | Pending state | Marked complete. Added reference to `money-unify-2-reconciliation.md` for full output. Documented that the post-deploy reconciliation pattern was first validated by VPS alignment deploy. | Unify-2 reconciliation evidence, CHANGELOG `ec14ca8f` |
| Part 6 — All family sections | Curl-check integration was implicit/manual only | Added explicit "post-deploy production curl checks" listing endpoints to verify per family (domain root → 200; admin → 307; money-touching public page → 200). | LOCKED-2 #3 (deploy template step 4), LOCKED-3 Part 6 |
| Part 7 — Rollback Plan | Single rollback procedure per family ("revert + DOWN") | **Major revision.** Per family, documented both rollback scopes: pre-deploy (commits not yet pushed; `git reset --hard` + DOWN) and post-deploy (commits pushed and deployed; `git revert` + push + user-deployed revert + DOWN). User performs VPS-side rollback. CC produces DOWN migration. | LOCKED-2 #7, LOCKED-3 Part 7 |
| Part 7 — General rollback pattern | "Until Migration 2 ships, rollback = `git revert` + manual" | Added that DOWN migration MUST be authored alongside UP in same phase. Authoring DOWN during a rollback emergency is unacceptable. | LOCKED-3 Part 7, defensive practice |
| Part 7 §Family H | Standard rollback | Reframed as historical: phase is live in production; only post-deploy rollback path applies. | Unify-2 execution evidence |
| Part 7 §Family D | Did not address `void_transaction()` rollback coordination | Added: DOWN must restore Unify-2 form (cents-via-ROUND) rather than original pre-Unify-2 form. | Unify-2's `void_transaction()` rewrite + Unify-D scope |
| Part 7 — Atomic-commit boundary template | "Dev only — production deferred until Unify-Final" line | Removed. Replaced with "Production deploy: pending user `deploy-smartdetails` after push" line. | LOCKED-2 #4 |
| Part 8 — Test Surface | Test sections did not mention production curl | Added "Post-deploy curl smoke set" line to each family. Family A test surface notes manual smoke required before phase marked complete. | LOCKED-2 #3 |
| Decisions Required | A, B, C, D present | Added **Decision E — Per-phase production deploy strategy (Path 2)**. Locks the 12-step deploy template, Option 2 parallelization, no-SSH directive, DOWN co-authoring, two rollback scopes. | LOCKED-2 #1, #4, #5, #7 |
| Decisions B (helper API) | "Unify-1 adds..." | Updated to past tense ("Unify-1 (complete) shipped...") reflecting current state. Documented the +3 Stripe-min sites and +2 loyalty sites surfaced by Unify-1 verification. | Unify-1 execution evidence, CHANGELOG `e93bed6d` |
| Phase Sequence — Unify-1 | "Will rename, add..." | Status: **COMPLETE + DEPLOYED**. Past-tense scope-shipped list (9 Stripe sites, 4 loyalty sites). | Unify-1 execution evidence |
| Phase Sequence — Unify-2 | "Will migrate 3 columns + ~8 files" | Status: **COMPLETE + DEPLOYED**. Past-tense scope (17 + 3 + function). 2.5× scope-expansion noted. | Unify-2 execution evidence |
| Phase Sequence — Unify-3 (Family D) | Single section, no deploy steps | Added explicit LOCKED-X (Production deploy procedure with 8 steps), LOCKED-Y (pre-deploy + post-deploy rollback procedures), LOCKED-Z (no-SSH directive). Added curl-set specific to D. Added cleanup of 9 Unify-2 shim sites + `void_transaction()` rewrite. Added opportunistic-fix candidate (followups #11). Caller estimate revised to 150-210 (vs v2 ~70). | LOCKED-2 #3, LOCKED-4, LOCKED-3 Phase Sequence |
| Phase Sequence — Unify-4 (Family E) | Single section | Added LOCKED-X/Y/Z templates. Caller estimate revised to 60-90 (vs v2 ~30). | LOCKED-2 #3, LOCKED-4 |
| Phase Sequence — Unify-5 (Family A) | Single section, "Dev verification gates" | Added LOCKED-X/Y/Z templates. Special note: manual smoke required before phase complete (not just curl). Caller estimate revised to 250-330 (vs v2 ~110). | LOCKED-2 #3, LOCKED-4 |
| Phase Sequence — Unify-6 (Family C) | Single section | Added LOCKED-X/Y/Z templates. Added opportunistic-fix candidate (followups #10, REDEEM_MINIMUM shadow). Caller estimate revised to 120-180 (vs v2 ~60). | LOCKED-2 #3, LOCKED-4 |
| Phase Sequence — Unify-7 (Family F) | Single section | Added LOCKED-X/Y/Z templates. Caller estimate revised to 40-60 (vs v2 ~20). | LOCKED-2 #3, LOCKED-4 |
| Phase Sequence — Unify-8 (Family B) | Single section | Added LOCKED-X/Y/Z templates. Caller estimate revised to 56-84 (vs v2 ~28). | LOCKED-2 #3, LOCKED-4 |
| Phase Sequence — Unify-9 (Family G) | Single section | Added LOCKED-X/Y/Z templates. Caller estimate revised to 30-45 (vs v2 ~15). | LOCKED-2 #3, LOCKED-4 |
| Phase Sequence — Unify-Final | "Drop dollar columns, rename, supersede ADR-0003, etc. (first production deploy event)" | **Major scope revision** per LOCKED-2 #6: no longer "first production deploy event" (every Unify-N phase already deployed). Now scoped to cleanup: drop legacy NUMERIC columns, delete legacy helpers (refund-math re-export, formatCurrency(dollars), 4 duplicates), rewrite ~48 inline `${x.toFixed(2)}` files (large sub-pass), upgrade lint to 'error', supersede ADR-0003, update CLAUDE.md. Added LOCKED-X/Y/Z templates. Noted rollback risk highest here. | LOCKED-2 #6 |
| Open Questions | All Priority 1 marked RESOLVED/DEFERRED in v2 | Carried forward. Priority 3 list expanded to enumerate followups #10, #11, #12 (surfaced during Unify-1 + Unify-2 + VPS alignment execution). | Unify-1 + Unify-2 + VPS alignment execution evidence |
| Honest Limitations | "What v1 couldn't predict" | Updated for production-deploy reality. Added: per-family caller counts (2-3× underestimate confirmed by Unify-2), VPS deploy behavior (5m 25s sample-of-one), reconciliation drift in deploy window, real-data corner cases. Added what playbook assumes (Supabase shape stable, VPS script consistent, user SSH responsiveness, etc.). | LOCKED-3 Honest Limitations |
| Sign-off Checklist | v2 sign-off items (already approved) | Reset for v3: Path 2, per-phase deploy template, two rollback scopes, no-SSH, Option 2 parallelization, post-deploy reconciliation, DOWN co-authoring, Unify-Final scope revision, cron credential acknowledgment, scope-expansion observation, all v2 decisions A-D APPROVED, Unify-1+2 complete+deployed marked. | LOCKED-5 |
| (new section) | — | Added "Changes from v2 to v3" section. | LOCKED-3 |

---

End of v3. User reviews before Unify-3 prompt is authored.
