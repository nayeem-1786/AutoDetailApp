# Money-Unify Epic: Migration Playbook (v2)

> Revised playbook incorporating user-locked decisions from Money-Audit-1
> and Money-Audit-2 review. v1 (`money-unify-0-migration-playbook.md`)
> remains untouched for historical reference. See "Changes from v1" at
> the end of this document for the full diff.
>
> Prerequisite reading:
> - `docs/sessions/money-audit-1-representation-archaeology.md`
> - `docs/sessions/money-audit-2-subsystem-deep-dive.md`
> - `docs/adr/0003-money-math-via-integer-cents.md` (to be superseded in Unify-Final)
> - `docs/dev/DB_SCHEMA.md`

---

## Executive Summary

Phase Money-Audit-1 established that the codebase carries 65 NUMERIC(10,2) dollar columns alongside 12 INTEGER cents columns; `formatCurrency()` has 510 callers with only 1 using the canonical `fromCents()` composition; ADR-0003's "cents canonical" rule applies in `refund-math.ts`'s 22-file blast radius and nowhere else.

Phase Money-Audit-2 deepened that analysis with subsystem-by-subsystem business-rule discovery (coupons, loyalty, Stripe minimum, deposits, mobile surcharge, cancellation, cash drawer, refund residual, tax). That audit surfaced 10 specific findings that change the migration approach, including: dead admin UI for tax_rate, intra-table CHECK constraints that must migrate atomically, the composite nature of `transactions.discount_amount`, the corrected coupon discount_type enum (`'percentage' | 'flat' | 'free'`, not `'fixed_amount'`), and 5 separate Stripe-minimum enforcement sites that should consolidate.

This revision incorporates **26 user-locked decisions** plus the audit-2 findings. The major structural changes from v1:

- **Migration order changed**: `H → D → E → A → C → B → F → G` (v1 was `H → E → A → C → B → F → D → G`). Catalog (D) moves to position 2 so every downstream transactional family reads cents-native catalog from the start.
- **Parallelization pairs changed**: `D∥E`, `C∥F`, `B∥G` (v1 was `H∥E`, `C∥F`, `B∥G`). Each pair has zero source-file overlap.
- **Unify-1 scope expanded**: Stripe-minimum consolidation across 5 sites, `LOYALTY.REDEEM_RATE_CENTS = 5` export, and 2 hardcoded `0.05` fixes — all bundled into Unify-1.
- **Business-policy whole-dollar CHECK constraints**: services, service_pricing, packages, mobile_zones, and appointment/quote mobile_surcharge get `% 100 = 0` constraints during their family phases.
- **Per-phase pre-flight data audits** mandated: each family phase prompt starts with SELECT queries that surface anomalies (CHECK violators, negative values, cross-table drift) BEFORE any migration runs. Halt-and-decide if anomalies found.
- **Catalog-first ordering eliminates downstream shims**: with D at position 2 + two-phase commit (dual columns), transactional families read from cents-native catalog naturally — no `// TODO Unify-D` shims needed in A, B, C.

10 phases total. Critical-path length: 7 phase-slots (with parallel pairs collapsed). Dev-only deploy through the entire epic; production deferred until Unify-Final verification.

The four decisions at the end of this document are now marked APPROVED; the open questions section enumerates remaining Priority 2/3 items that arise during specific family phase planning. Post-epic follow-ups (9 items pre-existing across the codebase) are tracked separately in `docs/sessions/money-unify-post-epic-followups.md`.

---

## Part 1 — Canonical Money Model

### Target end-state

Every money-bearing value in the system carries integer cents from storage through math to the final display boundary. Conversion to dollars happens exactly once per render path, at the formatter call.

**Storage layer:**
- All money columns are `INTEGER` storing cents (smallest currency unit, USD).
- Every money column name carries a `_cents` suffix. The suffix is the type signal — a future maintainer scanning a schema diff sees "this column is cents" without reading the migration body.
- Every money column carries a `CHECK (col_cents >= 0)` (or domain-appropriate bound) **plus** any business-policy constraint listed below.
- JSONB money values (e.g. `business_settings.value` carrying `default_deposit_amount`) carry cents too. The key name is suffixed `_cents` (`default_deposit_amount_cents`).

**Business-policy CHECK constraints** (user-locked decision per LOCKED-2 #21–25):

| Column class | Granularity | CHECK added |
| --- | --- | --- |
| `services.flat_price_cents`, `sale_price_cents`, `custom_starting_price_cents`, `per_unit_price_cents` | Whole dollar | `% 100 = 0` (plus `>= 0`) |
| `service_pricing.*` (all variants: `price_cents`, all `vehicle_size_*_price_cents`, `sale_price_cents`) | Whole dollar | `% 100 = 0` |
| `packages.price_cents` | Whole dollar | `% 100 = 0` |
| `mobile_zones.surcharge_cents`, `appointments.mobile_surcharge_cents`, `quotes.mobile_surcharge_cents` | Whole dollar | `% 100 = 0` (plus the existing mobile-consistency relational CHECK) |
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
- Unnamed numeric literals carry cents (`amount: 5000`, not `amount: 50`). Dollar-literal constants must be re-expressed when they appear (e.g. `STRIPE_MIN_AMOUNT_CENTS = 50`, not `STRIPE_MINIMUM = 0.50`).
- All money arithmetic uses integer operators on cents. No `* 100` or `/ 100` inside business logic. The only sites that may convert are: (a) external-API boundaries that demand dollars (QBO, Shippo), (b) the formatter helper, (c) controlled-input value coercion.

**Math layer:**
- All money helpers live in `src/lib/utils/money.ts` (renamed from `refund-math.ts` in Unify-1). The module exports `toCents`, `fromCents`, plus the refund-specific computations.
- Arithmetic on cents uses native JS integer math (safe up to 2^53).
- Tax computation (`pos/utils/tax.ts`) is rewritten in Family A to operate entirely on cents.
- Helper additions are **just-in-time** per LOCKED-2 #4: do not preemptively add `sumCents`, `clampCents`, etc. Each helper is added in the family phase that first needs it.

**Display layer:**
- Single canonical formatter going forward: `formatMoney(cents: number): string` exported from `src/lib/utils/format.ts`. Produces same output as today's `formatCurrency` (`$1,234.56`, comma separator, two decimals, USD symbol).
- The existing `formatCurrency(dollars: number)` function survives through the entire epic. Unify-Final renames `formatMoney` → `formatCurrency` and deletes the dollars helper.
- **Display always shows 2 decimals** (per LOCKED-2 #26). Whole-dollar services still render as `$125.00`, not `$125`. Both helpers produce this format.
- `formatMoneyForInput(cents): string` is added in Unify-1 for controlled-input dollar-edit fields (returns `"17.64"`, no `$`, no commas).
- The 4 duplicate formatter implementations (`template.ts:143-146` `formatDollar`, `quickbooks/page.tsx:147-149` `formatDollar`, `quote-helpers.ts:33-35` local `formatCurrency`, `quick-edit-drawer.tsx:44-47` `formatPrice`) are deleted in their family phases or Unify-Final.
- All 48 files containing inline `` `$${x.toFixed(2)}` `` patterns are rewritten to `formatMoney(cents)` in their family phase. The lint rule landing in Unify-1 catches new violations.

**Boundary layer:**
- Stripe: cents on the wire (already aligned).
- Square Catalog API: cents on the wire (`price_money.amount`).
- QuickBooks Online: decimal dollars (`Amount: 17.64`). Conversion via `fromCents()` at the QBO sync boundary. **QBO sync drops tax line entirely** (current behavior — preserved in this epic, NOT fixed; see post-epic followups doc).
- Shippo: decimal dollar strings. `toCents(Number(rate.amount))` at intake.
- Email/SMS/PDF/HTML: always `formatMoney(cents)`. No raw numbers in customer output.

### Decision recap

> `formatMoney` is the canonical formatter and accepts integer cents. The legacy `formatCurrency` (dollars-input) survives the migration so per-family caller rewrites stay tractable. Unify-Final renames `formatMoney` → `formatCurrency` and deletes the dollars helper.

### Why cents-canonical

(Unchanged from v1.) Single mental model, IEEE-754 immunity by default, alignment with Stripe (highest-frequency external boundary), and lint-rule tractability.

---

## Part 2 — Table Family Inventory

77 money columns across 23 tables, grouped into **8 families** by business domain + code-path coupling + migration-coupling. (Family grouping unchanged from v1; ordering and parallelization revised — see Parts 3 and 5.)

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

**Column count:** 29. **Approximate caller count:** ~110 source files.

**Audit-2 finding (LOCKED-3 #29):** `transactions.discount_amount` is a **composite** value: `coupon + loyalty + manual` (verified at `src/app/pos/context/ticket-reducer.ts:49-50`). `transactions.loyalty_discount` holds only the loyalty portion (for refund accounting). The coupon and manual portions are NOT independently stored on transactions. Reconciliation queries must reflect this — see Part 6 §Family A.

**Migration-coupling:** Transactions and transaction_items migrate together. Payments and refunds couple to transactions via FK with reconciliation invariants (sum of payments ≤ transaction.total_amount). Cash_drawers aggregates from payments → must migrate atomically.

**cash_drawers backfill policy (LOCKED-2 #17):** × 100 of existing values. Do NOT recompute from source rows — historical financial records should not change. Backfill is `ROUND(value * 100)::INTEGER` per column.

### Family B — Quotes

Quote builder pricing model. Two tables, 7 columns.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `quotes` | `subtotal`, `tax_amount`, `total_amount`, `mobile_surcharge` → INTEGER cents | 4 cols |
| `quote_items` | `unit_price`, `total_price`, `standard_price` → INTEGER cents | 3 cols |

**Column count:** 7. **Approximate caller count:** ~28 files.

**CHECK constraint to migrate atomically** (LOCKED-3 #27, verified from DB_SCHEMA.md:2095):
```
quotes_mobile_consistency:
CHECK (((is_mobile = false) AND (mobile_surcharge = (0)::numeric))
    OR ((is_mobile = true)  AND (mobile_surcharge > (0)::numeric)))
```
Must DROP + recreate against `mobile_surcharge_cents`. Plus the new whole-dollar CHECK on `quotes.mobile_surcharge_cents % 100 = 0` (LOCKED-2 #15).

**Migration-coupling:** Quote→transaction convert paths (`/api/pos/quotes/[id]/convert/route.ts`, `/api/quotes/[id]/convert/route.ts`). With Family A migrating before B in the new order, the convert path reads cents-native transactions, writes from cents-native quotes — no shim needed.

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

**CHECK constraints to migrate atomically** (LOCKED-3 #27):
```
appointments_mobile_consistency:
CHECK (((is_mobile = false) AND (mobile_surcharge = (0)::numeric))
    OR ((is_mobile = true)  AND (mobile_surcharge > (0)::numeric)))

payment_link_amount_cents_check:  -- already cents, survives unchanged
CHECK (((payment_link_amount_cents IS NULL) OR (payment_link_amount_cents >= 50)))
```
Drop + recreate `appointments_mobile_consistency` against `mobile_surcharge_cents`. Plus new whole-dollar CHECK on `appointments.mobile_surcharge_cents % 100 = 0` and `mobile_zones.surcharge_cents % 100 = 0`. Plus new `appointments.deposit_amount_cents` CHECK `IS NULL OR >= 0` (LOCKED-2 #14).

**Audit-2 correction (LOCKED-3 #30):** `mobile_zones` are **distance-based**, not ZIP-based. Each zone has `min_distance_miles` + `max_distance_miles` + flat surcharge. Zone resolution happens by cashier-pick at job-creation time, with surcharge snapshotted from the live `mobile_zones` row at save time (Phase Mobile-1 Option α). v1 playbook descriptions of "ZIP/address resolves to zone" are incorrect.

**business_settings JSONB key:** `default_deposit_amount` migrates with Family C (rename to `default_deposit_amount_cents`, value × 100).

### Family D — Catalog

The price source-of-truth. Sells INTO transactions, quotes, appointments, and orders.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `services` | `flat_price`, `custom_starting_price`, `per_unit_price`, `sale_price` → INTEGER cents | 4 cols |
| `service_pricing` | `price`, `vehicle_size_sedan_price`, `vehicle_size_truck_suv_price`, `vehicle_size_suv_van_price`, `vehicle_size_exotic_price`, `vehicle_size_classic_price`, `sale_price` → INTEGER cents | 7 cols |
| `products` | `cost_price`, `retail_price`, `sale_price` → INTEGER cents | 3 cols |
| `packages` | `price` → INTEGER cents | 1 col |

**Column count:** 15. **Approximate caller count:** ~70 files.

**CHECK constraints to migrate** (existing):
- `chk_service_sale_price` (sale_price < price → sale_price_cents < flat_price_cents)
- `chk_product_sale_price` (sale_price < retail_price → cents-equivalent)
- `services_sale_price_non_negative` (>= 0 → cents-equivalent)

**New CHECK constraints to add** (LOCKED-2 #21 — services/packages whole-dollar; LOCKED-2 #22 — products NO whole-dollar):
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

**Migration-coupling:** Catalog is **read by every transactional family**. With the new order putting D at position 2 + two-phase commit (cents columns added alongside dollar columns, dollar columns retained), downstream families' readers continue to operate against dollar columns until each family migrates. Each transactional family's phase switches its readers to `_cents` as part of its scope.

### Family E — Orders (e-commerce)

Phase 9 e-commerce schema. Already cents-canonical internally; needs renaming + caller pattern rewrite.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `orders` | `subtotal`, `discount_amount`, `tax_amount`, `shipping_amount`, `total` — already INTEGER cents → rename to `_cents` | 5 rename-only |
| `order_items` | `unit_price`, `line_total`, `discount_amount` — already INTEGER cents → rename to `_cents` | 3 rename-only |
| `shipping_settings` | `flat_rate_amount` — already INTEGER cents → rename to `flat_rate_amount_cents` | 1 rename |
| `shipping_settings` | `handling_fee_amount` — NUMERIC(8,2) → INTEGER cents → `handling_fee_amount_cents` | 1 type migrate |

**Column count:** 9 rename + 1 type-migrate. **Approximate caller count:** ~30 files (55 Pattern-B `formatCurrency(x / 100)` callers concentrated here).

**Audit-2 finding:** orders reads from `products.retail_price` at checkout (in `/api/checkout/create-payment-intent/route.ts`). With D∥E parallelization (LOCKED-2 #2), D's schema migration applies FIRST within the slot (per `supabase db push` sequencing), then E's code can read `products.retail_price_cents`. See Part 5 for the within-pair sequencing protocol.

### Family F — Marketing (Coupons + Campaigns)

Coupon discount mechanics + campaign attribution. Three tables, 4 columns.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `coupons` | `min_purchase` → INTEGER cents | 1 col |
| `coupon_rewards` | `discount_value`, `max_discount` → INTEGER cents | 2 cols (discount_type-aware) |
| `campaigns` | `revenue_attributed` → INTEGER cents | 1 col |

**Column count:** 4. **Approximate caller count:** ~20 files.

**Audit-2 correction (LOCKED-3 #28):** `coupon_rewards.discount_type` enum is `'percentage' | 'flat' | 'free'` (v1 said `'percentage' | 'fixed_amount'`). Verified at `coupon_rewards_discount_type_check` constraint, DB_SCHEMA.md:470. Migration must handle all three:
- `flat`: `× 100` (dollars → cents)
- `percentage`: untouched (stays as percentage points, e.g. 10 means 10%)
- `free`: untouched (stored as 0; ignored by `calculateRewardDiscount`)

**Audit-2 finding:** Coupon usage tracking has 5 write paths but only 1 partial-reversal path (full refund only — LOCKED-2 #12 keeps this behavior). Reconciliation queries cannot assume `use_count == count(completed transactions with this coupon)`.

**Q1.1 deferred** (LOCKED-2 #7): the split-vs-single-column decision for `discount_value` is deferred to Unify-7 planning phase, not locked here. Default assumption: single-column with discount_type-aware migration.

### Family G — Customer Aggregate

Single column.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `customers` | `lifetime_spend` → INTEGER cents | 1 col |

**Column count:** 1. **Approximate caller count:** ~15 files.

**Migration-coupling:** `lifetime_spend` is a derived aggregate from `transactions.total_amount`. Must migrate AFTER Family A. With the new order, G is at position 8, A is at position 4 — invariant satisfied. The Stripe webhook for e-commerce orders also writes lifetime_spend (`webhooks/stripe/route.ts:337-338`) — that write path needs cents handling as part of G's migration.

### Family H — Inventory & Procurement

Vendor purchase orders + stock-adjustment costs. Lowest-traffic family.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `purchase_order_items` | `unit_cost` → INTEGER cents | 1 col |
| `stock_adjustments` | `unit_cost` → INTEGER cents | 1 col |
| `vendors` | `min_order_amount` → INTEGER cents | 1 col |

**Column count:** 3. **Approximate caller count:** ~8 files.

**Migration-coupling impact (new order):** With D migrating BEFORE H in v1's order would have created issues, but H still goes first (position 1 unchanged). H reads `products.cost_price` (Family D's column). With H at position 1 and D at position 2, H migrates against the dollar `cost_price` column. After D migrates (position 2), H's read sites get a follow-up update — track as `// TODO Unify-D` shim in H's scope (1-line conversion `toCents(cost_price)` at 3 read sites). D's phase removes these shims.

### Family inventory summary

| Family | Tables | Columns to migrate | Caller count (approx) | New order position |
| --- | --- | --- | --- | --- |
| H. Inventory | 3 | 3 | ~8 | 1 (Unify-2) |
| D. Catalog | 4 | 15 | ~70 | 2 (Unify-3, parallel with E) |
| E. Orders | 3 | 9 rename + 1 migrate | ~30 | 3 (Unify-4, parallel with D) |
| A. POS Transactions | 6 | 29 | ~110 | 4 (Unify-5, solo) |
| C. Appointments | 4 | 12 | ~60 | 5 (Unify-6, parallel with F) |
| F. Marketing | 3 | 4 | ~20 | 6 (Unify-7, parallel with C) |
| B. Quotes | 2 | 7 | ~28 | 7 (Unify-8, parallel with G) |
| G. Customer aggregate | 1 | 1 | ~15 | 8 (Unify-9, parallel with B) |

**Total: 81 column changes** (77 type-migrate + 4 rename-only on Orders), ~350 distinct caller files with substantial reuse across families.

---

## Part 3 — Migration Order (revised)

**New recommended order: H → D → E → A → C → B → F → G**

Eight families, ordered by (a) catalog-first readers-cents-from-start, (b) risk-tolerance (validate pattern on small family first), (c) dependency direction (derived families after their sources), and (d) blast-radius staging.

| Pos | Phase | Family | Rationale |
| --- | --- | --- | --- |
| 1 | Unify-2 | **H. Inventory** | 3 columns, ~8 files, admin-only. Validates the per-family migration pattern (schema diff + caller rewrite + reconciliation + rollback) on the lowest-risk family. No customer-facing exposure. |
| 2 | Unify-3 | **D. Catalog** | Largest READ fan-out (~70 files). Migrated EARLY so every downstream transactional family reads from cents-native catalog when their phase arrives. Two-phase commit (cents columns alongside dollar columns) keeps existing readers working until each family migrates. Whole-dollar CHECK constraints land here (services/packages). |
| 3 | Unify-4 | **E. Orders** | Mostly rename + 1 type-migrate (`handling_fee_amount`). Lowest data-transformation risk. Validates the Pattern-B → Pattern-C caller migration playbook on a contained ~30-file blast radius. Parallel with D since they share zero source files; within-pair sequencing ensures D's schema lands before E's catalog-reading callers update. |
| 4 | Unify-5 | **A. POS Transactions** | The heart of the system. 29 columns, ~110 files. Solo phase (risk isolation). All downstream + upstream cents alignment validated by the prior 3 phases. Receipt fixture suite (38 baselines) is the safety net. cash_drawers backfill is × 100 (historical preservation). |
| 5 | Unify-6 | **C. Appointments** | Depends on A (transaction-completion path reads appointment fields; bidirectional flow via deposit_credit). Includes business_settings JSONB key migration. The 1 already-cents column (`payment_link_amount_cents`) stays as-is. mobile_consistency CHECK + new whole-dollar CHECK + deposit_amount_cents >= 0 CHECK all updated atomically. |
| 6 | Unify-7 | **F. Marketing** | Depends on A + E (coupons write into both transactions.discount_amount and orders.discount_amount). discount_type-aware migration (flat/percentage/free). Parallel with C since they share zero source files (coupon-helpers.ts is F's territory; C's appointments.coupon_discount belongs to C). |
| 7 | Unify-8 | **B. Quotes** | Depends on A + C (quote→transaction + quote→appointment convert paths). Quote-side mobile_consistency CHECK + whole-dollar CHECK on quotes.mobile_surcharge_cents. Deletes the duplicate `formatCurrency` in `quote-helpers.ts:33-35`. |
| 8 | Unify-9 | **G. Customer Aggregate** | Aggregation source (transactions.total_amount) is cents-native by position 4. Stripe webhook lifetime_spend update + lifecycle engine reads + AI summary reads all switch to cents. Parallel with B since they share zero source files. |

### Position-specific notes

- **Unify-1** (helpers + lint rule + Stripe-min consolidation + REDEEM_RATE_CENTS + 2 hardcoded 0.05 fixes) runs BEFORE position 1. Foundational; no dependencies.
- **Unify-Final** runs AFTER position 8. Drops dollar columns left behind by two-phase commits, renames `formatMoney → formatCurrency`, deletes legacy duplicates, upgrades lint rule severity, supersedes ADR-0003.
- **Family A (Unify-5) is the single largest unit of risk.** Recommend 2 sessions minimum: one to migrate + commit, one to run reconciliation + fix any drift.

### Order alternatives considered (and rejected)

- **"Run all families strictly sequential, no parallel pairs."** Calendar-time cost ~3-4 days higher. Rejected: parallel pairs are zero-overlap and the user has bandwidth to coordinate them.
- **"Run D last (v1's order)."** Discussed in v1 §Part 3. Rejected: every downstream family then needs `// TODO Unify-D` shims at catalog read sites. Catalog-first eliminates shims at the cost of pushing the biggest read-fan-out family earlier when the playbook pattern hasn't been battle-tested yet. The Unify-2 (H) phase serves as the small-blast-radius pattern validator before tackling D.
- **"Run A second (right after H)."** Tempting because A is the biggest risk and "do the hard part first" appeals. Rejected: A's reconciliation depends on stable reads from catalog. Doing A before D forces shims on A's catalog reads. Catalog-first removes that friction.

---

## Part 4 — File-Overlap Matrix

(Matrix structure unchanged from v1 — overlap is per-family-pair, independent of migration order. Parallelization implications updated for the new order.)

Methodology: per-family touch sets; pairwise set intersection; categorized HIGH (>30%), MEDIUM (10-30%), LOW (<10%).

### Per-family touch sets (summarized)

(Unchanged from v1 §Part 4; archetype touch sets per family. The new order's parallelization pairs are derived directly from this matrix.)

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

### Per-pair commentary on the non-LOW cells (revised for new order)

- **A × B = HIGH.** Quote→transaction convert paths share `/api/pos/quotes/[id]/convert/route.ts` and similar. **In the new order: A (Unify-5) precedes B (Unify-8) — strict sequential.** When A migrates, the convert path writes from old-dollar-quotes into new-cents-transactions; A's scope includes `toCents(quote.discount_amount)` shim at the convert boundary (3 sites). B's scope (Unify-8) removes these shims.
- **A × C = MEDIUM.** Shared anchors: `src/app/pos/jobs/components/job-detail.tsx` and `/api/pos/jobs/[id]/complete/route.ts`. **New order: A (5) precedes C (6) sequentially.** Shared files belong to A's scope; C's scope touches only C-specific columns.
- **A × D = MEDIUM.** v1 marked this MEDIUM because A reads catalog. **New order: D (3) precedes A (5).** With two-phase commit, when A migrates its readers in `compose-line-items.ts` / `service-resolver.ts` / `pos/utils/pricing.ts`, those reads switch from `services.flat_price` (still present) to `services.flat_price_cents` (present since D's phase). **No shim direction reversal needed** — A reads from cents-native catalog columns that have existed since D's phase. The dollar columns stay readable until Unify-Final.
- **A × F = MEDIUM.** Coupon helpers (`coupon-helpers.ts`) write `discount_amount` into transactions + orders. **New order: A (5) precedes F (7).** A leaves a shim `// TODO Unify-7` at coupon-discount sites. F's scope (Unify-7) removes them and rewrites `calculateCouponDiscount` to return cents.
- **A × G = MEDIUM.** transactions completion writes `customers.lifetime_spend`. **New order: A (5) precedes G (9).** A leaves a `// TODO Unify-9` shim at the lifetime_spend update site. G's scope removes it.
- **E × F = MEDIUM.** `/api/checkout/create-payment-intent/route.ts` is shared. **New order: E (4) precedes F (7).** Sequential; F migrates last.
- **D × H = MEDIUM.** Both touch `products` (D writes prices, H reads `cost_price`). **New order: H (2) precedes D (3).** H migrates first against still-dollar `products.cost_price`. After D migrates (position 3), H's `cost_price` read sites need a 1-line update — D's scope owns this cleanup (3 read sites in H's scope get `// TODO Unify-D` shim from H's phase; D's phase removes them).

### MEDIUM cells: per-cell scope reservation (revised for new order)

| Pair | Shared files (~) | Owner during overlap |
| --- | --- | --- |
| A × B | 3 convert-path files | A's scope leaves shim; B's scope removes |
| A × C | 2 files (`job-detail.tsx`, `/api/pos/jobs/[id]/complete/route.ts`) | A's scope |
| A × D | 3 files (`compose-line-items.ts`, `service-resolver.ts`, `pos/utils/pricing.ts`) | A's scope reads cents-native columns added by D's earlier phase |
| A × F | 1 file (`coupon-helpers.ts`, indirect via validate endpoints) | F's scope (A uses shims) |
| A × G | 1 path (transactions-completion → customer-aggregate write) | G's scope (A uses shim) |
| E × F | 1 file (`/api/checkout/create-payment-intent/route.ts`) | F's scope (E uses shim) |
| D × H | 1 column (`products.cost_price` read in H's scope) | D's scope removes H's shim |

---

## Part 5 — Parallelization Plan (revised)

**New recommended pairs: D∥E, C∥F, B∥G.** All three pairs have LOW overlap per the matrix. (v1's H∥E pair is obsolete.)

### Recommended parallel groupings

```
                 ┌──────────────┐
                 │  Unify-1     │   Helpers + lint rule + Stripe-min
                 │  (helpers)   │   consolidation + REDEEM_RATE_CENTS
                 └──────┬───────┘   + 2 hardcoded 0.05 fixes
                        │
                  ┌─────▼──────┐
                  │  Unify-2   │     Family H — Inventory
                  │  Family H  │     (3 cols, ~8 files; pattern validator)
                  └─────┬──────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-3  │                  │  Unify-4   │
    │ Family D │   ∥ parallel ∥   │  Family E  │
    │ Catalog  │                  │  Orders    │
    │ (15 cols)│                  │  (rename+1)│
    └───┬──────┘                  └────┬───────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │  Unify-5   │     Family A — POS Transactions
                  │  Family A  │     (29 cols, ~110 files; SOLO)
                  └─────┬──────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-6  │                  │  Unify-7   │
    │ Family C │   ∥ parallel ∥   │  Family F  │
    │ Appoint. │                  │  Marketing │
    │ (12 cols)│                  │  (4 cols)  │
    └───┬──────┘                  └────┬───────┘
        │                               │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-8  │                  │  Unify-9   │
    │ Family B │   ∥ parallel ∥   │  Family G  │
    │ Quotes   │                  │  Customer  │
    │ (7 cols) │                  │  aggregate │
    └───┬──────┘                  └────┬───────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │ Unify-Final│     Drop dollar columns, rename
                  │            │     formatMoney→formatCurrency,
                  │            │     lint→error, supersede ADR-0003
                  └────────────┘
```

### Critical-path length

| Approach | Phase-slot count |
| --- | --- |
| Strict sequential | 10 |
| With recommended parallelization | **7 phase-slots** (Unify-1, Unify-2, [3∥4], Unify-5, [6∥7], [8∥9], Unify-Final) |

### Within-pair sequencing protocol (LOCKED-2 #2)

**`supabase db push` is sequential per pair completion.** Within a parallel pair, both phases plan and prepare in parallel, but the actual schema migration application is sequenced:

1. **Pair start:** both phases plan-phase artifacts written in parallel (no DB touch yet).
2. **First schema apply:** one phase's migration applied (`npx supabase db push` against dev). Recommend: D's schema first in pair 1, C's schema first in pair 2, B's schema first in pair 3 (smaller table footprint goes first).
3. **First-phase code commits:** that phase's caller updates committed.
4. **Second schema apply:** other phase's migration applied.
5. **Second-phase code commits:** other phase's caller updates committed.
6. **Pair reconciliation:** both phases' reconciliation queries run.

This ordering matters for D∥E specifically: E's `/api/checkout/create-payment-intent/route.ts` reads `products.retail_price`. Until D's schema lands (adding `retail_price_cents`), E's caller can only read the old dollar column. By sequencing D first, E's code can switch to `retail_price_cents` immediately after D's schema apply.

### Parallelization caveats (carried from v1, restated for new pairs)

- **Use different worktrees** or strictly-disjoint branches. `isolation: "worktree"` recommended when spawning agents.
- **Schema migrations apply one at a time** to dev (per the within-pair protocol above).
- **FILE_TREE.md updates contend.** Each pair's two phases serialize their FILE_TREE.md commits at end.
- **Tests run against shared dev DB.** Reconciliation runs AFTER both pair migrations land.

### Calendar-time estimate

Sequential: ~10 calendar days minimum (varies per phase).
Parallel: ~7 calendar-days if pairs run truly concurrent. Realistic: 1-2 days saved per pair, total ~3-4 days saved.

Parallelization is an **option**, not a default. Use when the user has bandwidth to coordinate two CC sessions.

---

## Part 6 — Reconciliation Strategy (revised)

Each family migration must prove: (a) total money preserved (zero-cent drift), (b) per-row preservation, (c) cross-table invariants preserved. **Every family now has a mandatory pre-flight data audit** (LOCKED-4) — SELECT queries surface CHECK violators, negative values, and cross-table drift BEFORE migration runs. Halt-and-decide if anomalies found.

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
-- Expected: rows OK (partial refund leaves use_count un-decremented per LOCKED-2 #12).
-- Document any large drifts (more than ±2 per coupon) before proceeding.

-- 5. cash_drawers historical sanity: check for non-2-decimal precision (artifacts of raw SQL)
SELECT id, opening_amount, counted_cash, variance
FROM cash_drawers
WHERE opening_amount * 100 != ROUND(opening_amount * 100)
   OR counted_cash * 100 != ROUND(counted_cash * 100)
   OR variance * 100 != ROUND(variance * 100);
-- Expected: 0 rows. Any returned means a historical drawer has 3+ decimal precision
-- that × 100 backfill will round; investigate before migration.
```

**Per-table preservation (BEFORE migration, save output; AFTER migration, compare exactly):**

```sql
-- transactions
-- BEFORE
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

-- AFTER
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
-- Invariant: AFTER value == BEFORE value × 100. Tolerance: 0 cents.
```
Repeat structure for `transaction_items`, `payments`, `refunds`, `refund_items`, `cash_drawers`.

**Per-component discount-amount breakdown** (LOCKED-3 #29):

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
-- After migration, the same query in cents produces × 100 of every column.
-- Note: coupon_portion is not separable from manual_portion without re-running calculateCouponDiscount.
-- This breakdown is the limit of what the schema permits — see audit-2 Q1.2.
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

**Integration-level reconciliation:**
- End-to-end: cash + Stripe + split sales through POS; verify thermal + HTML receipts; verify 38-baseline receipt fixture suite at `src/lib/data/__tests__/__fixtures__/receipt-baselines/`.
- Stripe reconcile: `payments.amount_cents` for Stripe-paid transactions = `charges.amount` from Stripe API (tolerance 0).
- QBO sync: `src/lib/qbo/sync-transaction.ts:280,294` uses `fromCents(unit_price_cents)` post-migration; **tax line continues to be omitted** per LOCKED-2 #6 (preserve current behavior, do not fix in this epic — see followups doc).

### Family B — Quotes

**Pre-flight data audit:**

```sql
-- 1. quotes_mobile_consistency pre-violators (should be 0 — CHECK is active)
SELECT COUNT(*) FROM quotes
WHERE (is_mobile = false AND mobile_surcharge != 0)
   OR (is_mobile = true AND mobile_surcharge <= 0);

-- 2. Whole-dollar pre-violators on mobile_surcharge (Family B's new CHECK at LOCKED-2 #15)
SELECT id, mobile_surcharge
FROM quotes
WHERE mobile_surcharge IS NOT NULL
  AND mobile_surcharge * 100 != ROUND(mobile_surcharge * 100)::INTEGER
  AND mobile_surcharge != ROUND(mobile_surcharge);
-- Expected: 0 rows. Any returned = quote with $X.50 mobile fee; user decides
-- whether to round or amend before constraint addition.

-- 3. Quote totals consistency
SELECT q.id, q.subtotal, COALESCE(SUM(qi.total_price), 0) + q.mobile_surcharge AS expected_subtotal
FROM quotes q
LEFT JOIN quote_items qi ON qi.quote_id = q.id
WHERE q.deleted_at IS NULL
GROUP BY q.id
HAVING q.subtotal != COALESCE(SUM(qi.total_price), 0) + q.mobile_surcharge;
-- Expected: 0 rows. Pre-migration sanity.
```

**Preservation:**
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

**Cross-table invariant:** subtotal = sum(items.total_price) + mobile_surcharge (same shape as Family A's invariant).

**Integration:** quote build via POS, send via SMS+email, accept via public quote page, convert to transaction; verify converted transaction totals match quote totals exactly.

### Family C — Appointments

**Pre-flight data audit:**

```sql
-- 1. appointments_mobile_consistency pre-violators (per audit-2 Q5.2 — LOCKED-2 #16)
SELECT COUNT(*) FROM appointments
WHERE (is_mobile = false AND mobile_surcharge != 0)
   OR (is_mobile = true AND mobile_surcharge <= 0);
-- Investigate any returned rows. CHECK blocks new writes but pre-CHECK rows may violate.

-- 2. Whole-dollar pre-violators on appointments.mobile_surcharge + mobile_zones.surcharge
SELECT id, mobile_surcharge FROM appointments
WHERE mobile_surcharge IS NOT NULL AND mobile_surcharge != ROUND(mobile_surcharge);
SELECT id, name, surcharge FROM mobile_zones
WHERE surcharge != ROUND(surcharge);
-- Expected: 0 rows. Resolve before constraint addition.

-- 3. deposit_amount > total_amount cases (per audit-2 Q4.1 — LOCKED-2 #13)
SELECT id, deposit_amount, total_amount
FROM appointments
WHERE deposit_amount IS NOT NULL AND deposit_amount > total_amount;
-- Halt-and-decide if rows returned. Policy: user choice between (a) leave as-is,
-- (b) cap deposit_amount = total_amount at migration time, (c) flag for manual review.

-- 4. deposit_amount >= 0 pre-violators
SELECT COUNT(*) FROM appointments
WHERE deposit_amount IS NOT NULL AND deposit_amount < 0;
-- Expected: 0 rows.

-- 5. business_settings money keys
SELECT key, value FROM business_settings
WHERE key IN ('default_deposit_amount');
-- Document the value before migration.

-- 6. Appointment subtotal sanity
SELECT a.id, a.subtotal,
  COALESCE(SUM(asvc.price_at_booking), 0) + a.mobile_surcharge AS expected_subtotal
FROM appointments a
LEFT JOIN appointment_services asvc ON asvc.appointment_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id
HAVING a.subtotal != COALESCE(SUM(asvc.price_at_booking), 0) + a.mobile_surcharge;
-- Document any drift.
```

**CHECK constraints to migrate atomically** (LOCKED-3 #27):
```sql
-- DROP existing
ALTER TABLE appointments DROP CONSTRAINT appointments_mobile_consistency;

-- ADD new (relational)
ALTER TABLE appointments ADD CONSTRAINT appointments_mobile_consistency
  CHECK ((is_mobile = false AND mobile_surcharge_cents = 0)
      OR (is_mobile = true  AND mobile_surcharge_cents > 0));

-- ADD whole-dollar (per LOCKED-2 #15)
ALTER TABLE appointments ADD CONSTRAINT chk_appointments_mobile_surcharge_whole_dollar
  CHECK (mobile_surcharge_cents % 100 = 0);

-- ADD non-negative deposit (per LOCKED-2 #14)
ALTER TABLE appointments ADD CONSTRAINT chk_appointments_deposit_amount_cents_non_negative
  CHECK (deposit_amount_cents IS NULL OR deposit_amount_cents >= 0);

-- mobile_zones whole-dollar
ALTER TABLE mobile_zones ADD CONSTRAINT chk_mobile_zones_surcharge_whole_dollar
  CHECK (surcharge_cents % 100 = 0);
```

**business_settings JSONB key:**
```sql
UPDATE business_settings
SET value = (CAST(value AS NUMERIC) * 100)::TEXT::JSONB, key = 'default_deposit_amount_cents'
WHERE key = 'default_deposit_amount';
```

**Preservation + integration:** as v1.

### Family D — Catalog

**Pre-flight data audit (REQUIRED — per LOCKED-2 #21 the new whole-dollar CHECKs may surface pre-existing data anomalies):**

```sql
-- 1. Whole-dollar pre-violators on services
SELECT id, name, flat_price, sale_price, custom_starting_price, per_unit_price
FROM services
WHERE (flat_price IS NOT NULL AND flat_price != ROUND(flat_price))
   OR (sale_price IS NOT NULL AND sale_price != ROUND(sale_price))
   OR (custom_starting_price IS NOT NULL AND custom_starting_price != ROUND(custom_starting_price))
   OR (per_unit_price IS NOT NULL AND per_unit_price != ROUND(per_unit_price));
-- Halt-and-decide if rows returned.

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
-- Halt-and-decide if rows returned.

-- 3. Whole-dollar pre-violators on packages
SELECT id, name, price FROM packages
WHERE price != ROUND(price);

-- 4. Sale-price discipline (existing CHECK; verify still holding pre-migration)
SELECT id, name, retail_price, sale_price FROM products
WHERE sale_price IS NOT NULL AND sale_price >= retail_price;
SELECT id, name, flat_price, sale_price FROM services
WHERE sale_price IS NOT NULL AND sale_price >= flat_price;
-- Expected: 0 rows on both.

-- 5. Non-negative service prices
SELECT id, name, flat_price, sale_price, custom_starting_price, per_unit_price
FROM services
WHERE flat_price < 0 OR sale_price < 0 OR custom_starting_price < 0 OR per_unit_price < 0;
-- Expected: 0 rows.
```

**Preservation:** standard pattern.
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

**New CHECK constraints to add** (per LOCKED-2 #21):
```sql
ALTER TABLE services ADD CONSTRAINT chk_services_flat_price_whole_dollar
  CHECK (flat_price_cents IS NULL OR flat_price_cents % 100 = 0);
ALTER TABLE services ADD CONSTRAINT chk_services_sale_price_whole_dollar
  CHECK (sale_price_cents IS NULL OR sale_price_cents % 100 = 0);
ALTER TABLE services ADD CONSTRAINT chk_services_custom_starting_price_whole_dollar
  CHECK (custom_starting_price_cents IS NULL OR custom_starting_price_cents % 100 = 0);
ALTER TABLE services ADD CONSTRAINT chk_services_per_unit_price_whole_dollar
  CHECK (per_unit_price_cents IS NULL OR per_unit_price_cents % 100 = 0);

ALTER TABLE service_pricing ADD CONSTRAINT chk_service_pricing_price_whole_dollar
  CHECK (price_cents % 100 = 0);
-- + analogous for each vehicle_size_*_price_cents (nullable-aware)
-- + sale_price_cents whole-dollar

ALTER TABLE packages ADD CONSTRAINT chk_packages_price_whole_dollar
  CHECK (price_cents % 100 = 0);

-- Existing sale-price discipline constraints recreate against _cents columns
ALTER TABLE services DROP CONSTRAINT chk_service_sale_price;
ALTER TABLE services ADD CONSTRAINT chk_service_sale_price
  CHECK (sale_price_cents IS NULL OR sale_price_cents < flat_price_cents);
-- (analogous for products' chk_product_sale_price)
```

**Integration:** AI content writer round-trip, Square import boundary check, POS pricing picker, public service/product pages, booking step-service-select, voice-agent services/products routes.

### Family E — Orders

**Pre-flight data audit:**

```sql
-- 1. Order total identity
SELECT o.id, o.total,
  (o.subtotal + o.tax_amount + o.shipping_amount - o.discount_amount) AS expected_total
FROM orders o
WHERE o.total != (o.subtotal + o.tax_amount + o.shipping_amount - o.discount_amount);
-- Expected: 0 rows.

-- 2. order_items line_total identity
SELECT oi.id, oi.line_total, (oi.unit_price * oi.quantity - oi.discount_amount) AS expected
FROM order_items oi
WHERE oi.line_total != (oi.unit_price * oi.quantity - oi.discount_amount);

-- 3. shipping_settings handling_fee precision (the lone type-migrate column)
SELECT id, flat_rate_amount, handling_fee_amount FROM shipping_settings;
-- Document values; verify handling_fee_amount has at most 2 decimal precision.
```

**Preservation (rename-only is identity; type-migrate is × 100):**
```sql
-- orders: identity preservation (just renaming cents columns)
-- BEFORE
SELECT COUNT(*), SUM(subtotal), SUM(discount_amount), SUM(tax_amount), SUM(shipping_amount), SUM(total) FROM orders;
SELECT COUNT(*), SUM(unit_price), SUM(line_total), SUM(discount_amount) FROM order_items;
-- AFTER (identical values, _cents-suffixed names)
SELECT COUNT(*), SUM(subtotal_cents), SUM(discount_amount_cents), SUM(tax_amount_cents),
       SUM(shipping_amount_cents), SUM(total_cents) FROM orders;
SELECT COUNT(*), SUM(unit_price_cents), SUM(line_total_cents), SUM(discount_amount_cents) FROM order_items;

-- shipping_settings handling_fee: × 100 migration
-- BEFORE
SELECT flat_rate_amount, handling_fee_amount FROM shipping_settings;
-- AFTER
SELECT flat_rate_amount_cents, handling_fee_amount_cents FROM shipping_settings;
-- handling_fee_amount_cents == BEFORE handling_fee_amount × 100.
```

**Integration:** full checkout end-to-end (cart → coupon → ship → Stripe pay); replay payment_intent.succeeded webhook; verify order email render.

### Family F — Marketing

**Pre-flight data audit:**

```sql
-- 1. discount_type enum sanity
SELECT discount_type, COUNT(*) FROM coupon_rewards GROUP BY discount_type;
-- Expected: 'percentage', 'flat', 'free' (per LOCKED-3 #28).

-- 2. Percentage row sanity
SELECT id, discount_value, max_discount
FROM coupon_rewards
WHERE discount_type = 'percentage' AND discount_value > 100;
-- Investigate any (>100% off would be unusual).

-- 3. Free row sanity
SELECT id, discount_value
FROM coupon_rewards
WHERE discount_type = 'free' AND discount_value > 0;
-- Expected: discount_value = 0 for 'free' (ignored by calculateRewardDiscount).
-- If rows returned, document but migration still untouches them.

-- 4. campaigns.revenue_attributed precision
SELECT COUNT(*) FROM campaigns
WHERE revenue_attributed * 100 != ROUND(revenue_attributed * 100);
-- Expected: 0 rows. Any returned would round during × 100 backfill.

-- 5. Coupon use_count vs completed transactions (informational; partial refunds
--    leave use_count un-decremented per LOCKED-2 #12)
SELECT c.id, c.code, c.use_count, COUNT(t.id) AS completed_count
FROM coupons c
LEFT JOIN transactions t ON t.coupon_id = c.id AND t.status = 'completed'
GROUP BY c.id, c.code, c.use_count
HAVING c.use_count != COUNT(t.id);
-- Document; do not halt.
```

**Type-aware migration** (LOCKED-3 #28):
```sql
-- Add cents columns
ALTER TABLE coupon_rewards ADD COLUMN discount_value_cents INTEGER;
ALTER TABLE coupon_rewards ADD COLUMN max_discount_cents INTEGER;

-- discount_type-aware backfill
UPDATE coupon_rewards SET discount_value_cents = ROUND(discount_value * 100)::INTEGER
WHERE discount_type = 'flat';

UPDATE coupon_rewards SET discount_value_cents = discount_value::INTEGER
WHERE discount_type = 'percentage';  -- preserves percentage points (10 stays 10)

UPDATE coupon_rewards SET discount_value_cents = 0
WHERE discount_type = 'free';  -- already 0; explicit for clarity

-- max_discount unconditional × 100 (it's always a dollar cap on percentage discount)
UPDATE coupon_rewards SET max_discount_cents = ROUND(max_discount * 100)::INTEGER
WHERE max_discount IS NOT NULL;

-- coupons.min_purchase
ALTER TABLE coupons ADD COLUMN min_purchase_cents INTEGER;
UPDATE coupons SET min_purchase_cents = ROUND(min_purchase * 100)::INTEGER
WHERE min_purchase IS NOT NULL;

-- campaigns.revenue_attributed
ALTER TABLE campaigns ADD COLUMN revenue_attributed_cents INTEGER;
UPDATE campaigns SET revenue_attributed_cents = ROUND(revenue_attributed * 100)::INTEGER;
```

**Q1.1 deferred to Unify-7 planning phase** (LOCKED-2 #7). If split-column path is chosen instead of single-column, the migration script changes accordingly.

**Integration:** apply fixed $10 coupon at POS and checkout (verify discount = 1000 cents); apply 10% percentage coupon (verify discount = subtotal_cents × 10 / 100); apply 'free' coupon on target service.

### Family G — Customer Aggregate

**Pre-flight data audit:**

```sql
-- 1. lifetime_spend precision
SELECT COUNT(*) FROM customers
WHERE lifetime_spend * 100 != ROUND(lifetime_spend * 100);
-- Expected: 0 rows.

-- 2. Aggregation drift: customers.lifetime_spend vs sum(transactions.total_amount) for completed
SELECT c.id, c.first_name, c.last_name, c.lifetime_spend,
  COALESCE(SUM(t.total_amount), 0) AS actual_sum
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id AND t.status = 'completed'
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.first_name, c.last_name, c.lifetime_spend
HAVING ABS(c.lifetime_spend - COALESCE(SUM(t.total_amount), 0)) > 0.01;
-- Document drift. Refunds may explain some — verify against the aggregation logic.
```

**Preservation:** standard × 100.
```sql
SELECT COUNT(*), SUM(lifetime_spend) FROM customers WHERE deleted_at IS NULL;       -- BEFORE
SELECT COUNT(*), SUM(lifetime_spend_cents) FROM customers WHERE deleted_at IS NULL; -- AFTER × 100
```

**Stripe webhook code update:** `src/app/api/webhooks/stripe/route.ts:337-338` currently does:
```js
lifetime_spend: (customer.lifetime_spend || 0) + order.total / 100,
```
becomes:
```js
lifetime_spend_cents: (customer.lifetime_spend_cents || 0) + order.total_cents,
```
(after orders renamed to `total_cents` in Unify-4).

**Integration:** complete a test sale; verify increment; run lifecycle-engine cron; compare campaign-eligibility decisions before/after.

### Family H — Inventory

**Pre-flight data audit:**

```sql
-- 1. Precision check on all 3 columns
SELECT COUNT(*) FROM purchase_order_items WHERE unit_cost * 100 != ROUND(unit_cost * 100);
SELECT COUNT(*) FROM stock_adjustments WHERE unit_cost IS NOT NULL AND unit_cost * 100 != ROUND(unit_cost * 100);
SELECT COUNT(*) FROM vendors WHERE min_order_amount IS NOT NULL AND min_order_amount * 100 != ROUND(min_order_amount * 100);
-- Expected: 0 rows.

-- 2. Non-negative cost
SELECT COUNT(*) FROM purchase_order_items WHERE unit_cost < 0;
SELECT COUNT(*) FROM stock_adjustments WHERE unit_cost IS NOT NULL AND unit_cost < 0;
SELECT COUNT(*) FROM vendors WHERE min_order_amount IS NOT NULL AND min_order_amount < 0;
```

**Preservation + integration:** standard pattern. PO receive cycle + stock adjustment commit/revert tested end-to-end.

---

## Part 7 — Rollback Plan (revised)

Every family migration is revertible via (a) DB DOWN steps that recreate dollar columns, (b) git commit boundaries for code rollback, (c) verification gates before considering "settled".

### General rollback pattern

(Unchanged from v1.) Two-phase commit:
- Migration 1 (within phase): add cents columns, backfill, leave dollar columns intact, deploy code that reads/writes both.
- Migration 2 (Unify-Final): drop dollar columns.

Until Migration 2 ships, rollback = `git revert` of code + manual inverse of dollar column repopulation if needed.

### Per-family rollback procedures

(Procedures from v1 retained; updated for new order and new CHECK constraints below.)

#### Family A — POS Transactions rollback

- **Migration files:** `<ts>_migrate_pos_transactions_to_cents.sql` (add+backfill); `<ts>_drop_pos_transactions_dollar_columns.sql` (in Unify-Final)
- **Commit boundary:** `feat(money): migrate POS Transactions family to integer cents (Phase Money-Unify-5)`
- **Rollback:** `git revert <hash>` + manual inverse of any cents→dollars repopulation.
- **Dev verification gates:** reconciliation queries return zero drift; 38-baseline receipt fixture suite passes; cash + Stripe + split + refund + void POS end-to-end; QBO sync round-trip on sample transaction; 1 week of dev usage with no money bugs.
- **cash_drawers backfill rollback** (per LOCKED-2 #17 — × 100 historical preservation): the DOWN script reverses by `value_cents / 100.0` (lossless for our data).

#### Family B — Quotes rollback

- **Commit boundary:** `feat(money): migrate Quotes family to integer cents (Phase Money-Unify-8)`
- **CHECK constraint preservation:** `quotes_mobile_consistency` recreated against `mobile_surcharge_cents`. Rollback recreates against `mobile_surcharge`.
- **Whole-dollar CHECK** (new): also dropped during rollback.
- **Dev gates:** quote build, send (SMS+email), accept, convert.

#### Family C — Appointments rollback

- **Commit boundary:** `feat(money): migrate Appointments family to integer cents (Phase Money-Unify-6)`
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
- **Dev gates:** booking flow end-to-end, pay-link send, mobile-fee edit, deposit credit on POS checkout.

#### Family D — Catalog rollback

- **Commit boundary:** `feat(money): migrate Catalog family to integer cents (Phase Money-Unify-3)`
- **CHECK constraints rolled back:** all whole-dollar constraints dropped; sale-price discipline constraints recreated against original dollar columns.
- **Dev gates:** AI content writer round-trip; Square import round-trip; POS pricing picker; public service/product pages; booking step-service-select; voice-agent.

#### Family E — Orders rollback

- **Commit boundary:** `feat(money): canonicalize Orders family naming + handling-fee migration (Phase Money-Unify-4)`
- **Rollback:** column renames reversed; handling_fee migration reversed via `handling_fee_amount = handling_fee_amount_cents / 100.0`.
- **Dev gates:** checkout end-to-end; Stripe webhook replay; order email; admin orders detail.

#### Family F — Marketing rollback

- **Commit boundary:** `feat(money): migrate Marketing family to integer cents (Phase Money-Unify-7)`
- **Critical:** `coupon_rewards.discount_value` discount_type-aware rollback (must match the migration's discount_type-aware backfill).
- **Dev gates:** apply fixed coupon (POS + e-commerce); apply percentage coupon; apply 'free' coupon; marketing analytics revenue sanity.

#### Family G — Customer aggregate rollback

- **Commit boundary:** `feat(money): migrate customer.lifetime_spend to cents (Phase Money-Unify-9)`
- **Dev gates:** sale → lifetime_spend increment; lifecycle-engine cron decision stability.

#### Family H — Inventory rollback

- **Commit boundary:** `feat(money): migrate Inventory family to integer cents (Phase Money-Unify-2)`
- **Dev gates:** test PO receive; stock adjustment commit/revert.

### Atomic-commit boundary template

```
feat(money): migrate <Family Name> family to integer cents (Phase Money-Unify-<N>)

- Schema: <N> columns NUMERIC(10,2) → INTEGER cents
- Backfill: ROUND(col * 100) for each column
- Code: <N> source files rewritten, <M> Pattern-A callers → Pattern-C
- New CHECK constraints: <list> (where applicable)
- Pre-flight audit results: <summary, e.g. "0 anomalies found">
- Tests: reconciliation passes, fixture suite passes (where applicable)
- Dev only — production deferred until Unify-Final
```

---

## Part 8 — Test Surface (revised)

### Family A — POS Transactions

**Existing tests:** (carried from v1)
- `src/lib/utils/__tests__/refund-math.test.ts` (271 lines, Session 36)
- `src/lib/data/__tests__/receipt-composer.test.ts` + 38 fixture files
- `src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts`
- `src/app/api/pos/transactions/__tests__/auto-receipt-interlock.test.ts`
- `src/app/api/pos/transactions/[id]/__tests__/void.test.ts`
- `src/app/pos/components/transactions/__tests__/transaction-detail-void.test.tsx`
- `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts`
- `src/lib/utils/__tests__/validation-refund-shopuse.test.ts`
- `src/app/pos/utils/__tests__/pricing.test.ts`

**New tests required for Unify-5:**
- end-of-day variance computation in cents
- **cash_drawers backfill verification test** (LOCKED-2 #17): regression test asserting that the × 100 backfill produces values identical (to the cent) to the pre-migration values multiplied by 100 — no historical revision
- QBO sync-transaction unit conversion (`fromCents()` boundary)
- payment + refund balance invariant
- composite discount-amount breakdown test (loyalty + manual + coupon identity, with coupon_portion as derived value)
- regenerate all 38 receipt fixtures; assert byte-identical to pre-migration

### Family B — Quotes

**Existing:** `quote-send-dialog.test.tsx`, `mobile-fee-picker.test.tsx`, `quotes/__tests__/send-service.test.ts`

**New for Unify-8:**
- quote → transaction convert preserves totals exactly (subtotal + tax + discount → cents transaction)
- quote subtotal = sum(items.total_price) + mobile_surcharge (cents-native)
- **quote whole-dollar mobile_surcharge CHECK** rejects fractional surcharge writes
- snapshot test for quote PDF render (baseline fixture)

### Family C — Appointments

**Existing:** `mobile-service-edit.test.ts`, `validation-mobile-address.test.ts`, `resolve-mobile-fields.test.ts`, `edit-mobile-modal.test.tsx`

**New for Unify-6:**
- booking-flow money round-trip (form → API → DB → display)
- **appointments_mobile_consistency CHECK** rejects mobile=true,surcharge=0 writes (cents form)
- **whole-dollar CHECK** on `appointments.mobile_surcharge_cents` rejects $X.50 writes
- **deposit_amount_cents non-negative CHECK** rejects negative writes
- business_settings JSON deposit value reads correctly post-key-rename
- pay-link amount validates against appointment.total_amount in cents
- appointment-detail-dialog rendered totals snapshot

### Family D — Catalog

**Existing:** `quick-edit-drawer.test.tsx`, products variants test

**New for Unify-3:**
- vehicle-size pricing resolver returns cents
- **whole-dollar CHECK** on every services / service_pricing / packages column rejects non-whole writes
- **sale-price discipline CHECK** (recreated against `_cents` columns) rejects sale_price >= flat_price
- AI content writer reads cents and renders dollars correctly via formatMoney
- POS pricing picker snapshots regenerated
- Public service/product page snapshots regenerated

### Family E — Orders

**Existing:** `refund.test.ts` (e-commerce), `payment-intent-succeeded.test.ts`

**New for Unify-4:**
- checkout total = subtotal_cents + tax_cents + shipping_cents − discount_cents
- order email renders amounts via `formatMoney(cents)`
- Stripe webhook order-update flow on renamed columns

### Family F — Marketing

**Existing:** `compose-line-items.test.ts`

**New for Unify-7:**
- `calculateCouponDiscount` for flat coupon returns cents
- `calculateCouponDiscount` for percentage coupon returns cents (subtotal × pct / 100)
- **`'free'` variant test** (LOCKED-3 #28): `calculateRewardDiscount({ discount_type: 'free', discount_value: 0 }, applicablePriceCents)` returns `applicablePriceCents`
- max_discount_cents cap applied correctly
- discount_type-aware migration script verified: percentage rows untouched, flat × 100, free untouched
- campaign revenue_attributed_cents sums match attribution events

### Family G — Customer Aggregate

**Existing:** none directly; `job-complete-vehicle-literal.test.ts` exercises completion path

**New for Unify-9:**
- completing a sale increments `customers.lifetime_spend_cents` by `transactions.total_amount_cents`
- refund decrements lifetime_spend_cents
- lifecycle-engine eligibility decision stable across migration
- Stripe webhook lifetime_spend update operates in cents

### Family H — Inventory

**Existing:** `stock-adjustments.test.ts`, `inventory/counts/__tests__/commit.test.ts`, `revert.test.ts`, `revert-preview.test.ts`, `revert-flow.test.tsx`

**New for Unify-2:**
- PO receive applies cents-typed costs
- stock adjustment commits with cents-typed unit_cost
- vendor min_order_amount validation against order subtotal_cents
- 3 sites in H's scope that read `products.cost_price` carry `// TODO Unify-D` shims (cleaned up in Unify-3)

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

(All four v1 sign-off items now APPROVED per LOCKED-2; recorded here for completeness.)

### Decision A — `formatCurrency()` signature — **APPROVED**

`formatMoney(cents)` added in Unify-1. `formatCurrency(dollars)` survives the entire epic; Unify-Final renames `formatMoney → formatCurrency` and deletes the dollars helper.

### Decision B — Helper API surface — **APPROVED with modification**

Just-in-time, not preemptive. Unify-1 adds:
- Rename `refund-math.ts` → `money.ts`
- Re-export from old path with `// @deprecated` comment
- All existing refund-math exports retained verbatim
- `toCents`, `fromCents` (already there; promoted in documentation)
- `formatMoney(cents)` in `format.ts`
- `formatMoneyForInput(cents)` in `format.ts`
- `STRIPE_MIN_AMOUNT_CENTS = 50` in `money.ts` (or `constants.ts` — see Unify-1 spec)
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
| QBO invoice/journal | out | decimal dollars (`Amount: 17.64`) | `fromCents()` in QBO sync |
| **QBO tax line** | **out** | **omitted (current behavior, NOT fixed in this epic)** | **No tax sent — see post-epic followups doc** |
| QBO read | in | decimal dollars | `toCents()` at intake (currently no read path) |
| Shippo rate | in | decimal string (`"19.95"`) | `toCents(Number(rate.amount))` |
| Email / SMS render | out | formatted string | `formatMoney(cents)` |
| Receipt HTML/PDF | out | formatted string | `formatMoney(cents)` |
| Public quote/order/receipt pages | out | formatted string | `formatMoney(cents)` |
| Form inputs (price entry, refund) | in | dollar string from user | Parse + `toCents()` at submit time |
| Controlled-input edit fields | bidirectional | `formatMoneyForInput(cents)` display; `toCents()` submit | — |

---

## Phase Sequence Summary (revised)

### Unify-1 — Helpers + Lint Rule + Stripe-Min Consolidation + Loyalty Constants

- **Dependencies:** none
- **Parallelizable with:** nothing
- **Scope:**
  1. Rename `src/lib/utils/refund-math.ts` → `src/lib/utils/money.ts`. Re-export from `refund-math.ts` with `// @deprecated` comment so existing importers don't break.
  2. Add `formatMoney(cents: number): string` to `src/lib/utils/format.ts` (mirrors `formatCurrency` output exactly).
  3. Add `formatMoneyForInput(cents: number): string` to `src/lib/utils/format.ts` (returns dollar-decimal string for controlled inputs).
  4. **Consolidate Stripe minimum** (LOCKED-2 #8 / LOCKED-3 #31): export `STRIPE_MIN_AMOUNT_CENTS = 50` from `src/lib/utils/money.ts`. Rewrite all 5 sites:
     - `src/app/api/book/payment-intent/route.ts:16-23` (dollars form → cents form)
     - `src/app/api/pay/[token]/intent/route.ts:9` (local const → import)
     - `src/app/api/pos/appointments/[id]/send-payment-link/route.ts:17` (local const → import)
     - `src/app/pos/components/refund/refund-dialog.tsx:40-43` (local const → import)
     - `src/app/api/checkout/create-payment-intent/route.ts:259` (inline literal → import)
     - `src/app/api/pos/stripe/payment-intent/route.ts:29` (inline literal → import)
  5. **Add `LOYALTY.REDEEM_RATE_CENTS = 5`** to `src/lib/utils/constants.ts` (LOCKED-2 #11) alongside existing `REDEEM_RATE = 0.05`.
  6. **Fix 2 hardcoded 0.05 sites** (LOCKED-2 #11, paths verified):
     - `src/app/admin/customers/[id]/page.tsx:1541` — replace `customer.loyalty_points_balance * 0.05` with `customer.loyalty_points_balance * LOYALTY.REDEEM_RATE` (import added)
     - `src/app/api/admin/messaging/[conversationId]/summary/route.ts:107` — replace `((customer.loyalty_points_balance || 0) * 0.05).toFixed(2)` with `((customer.loyalty_points_balance || 0) * LOYALTY.REDEEM_RATE).toFixed(2)`
  7. Add ESLint rule `money/no-unsuffixed-money-prop` at `'warn'` severity. Skip patterns: test files, `*Dollars`/`_dollars` identifiers, prop pass-through, JSX attribute-assertion contexts.
  8. Add ESLint rule `money/no-stripe-minimum-literal` (in same Unify-1) flagging future `50` or `0.50` literals in Stripe-context expressions. Severity `'warn'`.
  9. Create `docs/dev/MONEY.md` — canonical helpers, naming convention, lint rule, opt-out patterns. Mirror structure of `docs/dev/PHONE_LINT.md`.
  10. Update CLAUDE.md to reference MONEY.md and the lint rule (similar to the existing phone-lint rule note).
- **LOCKED decisions in prompt:**
  - LOCKED: helper module is `money.ts`; refund-math.ts becomes a deprecated re-export
  - LOCKED: lint rule severity `'warn'` (upgraded to `'error'` in Unify-Final)
  - LOCKED: `formatMoney(cents)` is the new canonical formatter; `formatCurrency(dollars)` survives the epic
  - LOCKED: Stripe min consolidates to a single `STRIPE_MIN_AMOUNT_CENTS = 50` import; all 5+1 sites rewritten
  - LOCKED: `REDEEM_RATE_CENTS = 5` exported alongside existing `REDEEM_RATE = 0.05`; 2 hardcoded `0.05` sites fixed
  - LOCKED: do NOT migrate any other callers yet (family phases own those)
- **Pre-flight queries:** N/A (no DB changes).
- **Reconciliation:** N/A.
- **Rollback:** `git revert` the single commit.
- **Test surface:**
  - Add `src/lib/utils/__tests__/money.test.ts` (or extend existing refund-math.test.ts with the alias) covering new helpers (`formatMoney`, `formatMoneyForInput`, STRIPE_MIN_AMOUNT_CENTS export).
  - Ensure refund-math.test.ts continues passing under the new module name (re-export path).
  - ESLint rule unit tests for `money/no-unsuffixed-money-prop` and `money/no-stripe-minimum-literal`.

### Unify-2 — Family H: Inventory

- **Dependencies:** Unify-1
- **Parallelizable with:** none (position 1 is solo)
- **Scope:** 3 columns + ~8 caller files. Add cents columns alongside dollar columns; backfill; update writers/readers in H's scope to read from `_cents`. Leave `// TODO Unify-D` shim at 3 `products.cost_price` read sites (D's phase removes).
- **LOCKED decisions in prompt:**
  - LOCKED: convert NUMERIC(10,2) → INTEGER cents via two-phase add/backfill (drop in Unify-Final)
  - LOCKED: rename columns to `*_cents`
  - LOCKED: rewrite caller display sites to `formatMoney(cents)`
  - LOCKED: 3 `products.cost_price` read sites get `// TODO Unify-D` shim
  - LOCKED: run pre-flight queries before any migration; halt if anomalies found
- **Pre-flight queries:** see Part 6 §Family H.
- **Reconciliation:** see Part 6 §Family H.
- **Rollback:** standard. Inventory has no CHECK constraints to migrate.
- **Test surface:** see Part 8 §Family H.

### Unify-3 — Family D: Catalog (parallel with Unify-4)

- **Dependencies:** Unify-1, Unify-2
- **Parallelizable with:** Unify-4 (Family E). Within-pair: D's schema applies FIRST.
- **Scope:** 15 columns + new whole-dollar CHECK constraints + sale-price discipline CHECK recreation + ~70 caller files.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `services.flat_price`, `custom_starting_price`, `per_unit_price`, `sale_price`
  - LOCKED: migrate `service_pricing.*` (7 columns)
  - LOCKED: migrate `products.cost_price`, `retail_price`, `sale_price` + remove the 3 `// TODO Unify-D` shims left in H's scope
  - LOCKED: migrate `packages.price`
  - LOCKED: **add whole-dollar CHECKs** on services, service_pricing, packages (NOT on products) — see Part 6 §Family D for full list
  - LOCKED: **recreate** `chk_service_sale_price`, `chk_product_sale_price`, `services_sale_price_non_negative` against `_cents` columns
  - LOCKED: rewrite POS pricing picker, public service/product pages, AI content writer service/product context, voice-agent services/products routes
  - LOCKED: delete `quick-edit-drawer.tsx:44-47` `formatPrice` shim and replace with `formatMoneyForInput(cents)`
  - LOCKED: Square import boundary stays — input cents, store cents (no change)
  - LOCKED: schema applies BEFORE Unify-4's schema within pair
  - LOCKED: run pre-flight queries; halt if any whole-dollar pre-violators surface (decide policy with user)
- **Pre-flight queries:** see Part 6 §Family D.
- **Reconciliation:** see Part 6 §Family D.
- **Rollback:** see Part 7 §Family D.
- **Test surface:** see Part 8 §Family D.

### Unify-4 — Family E: Orders (parallel with Unify-3)

- **Dependencies:** Unify-1, Unify-2
- **Parallelizable with:** Unify-3. Within-pair: E's schema applies SECOND.
- **Scope:** 9 column renames + 1 type migration (`handling_fee_amount`) + 55 Pattern-B caller rewrites + Stripe webhook unit-alignment (verification only; already cents) + order-emails formatter update.
- **LOCKED decisions in prompt:**
  - LOCKED: rename `orders.*` and `order_items.*` cents columns to `*_cents`
  - LOCKED: migrate `shipping_settings.handling_fee_amount` NUMERIC(8,2) → INTEGER cents + rename to `_cents`
  - LOCKED: rewrite ALL Pattern-B `formatCurrency(x / 100)` callers to `formatMoney(x)` (55 sites across 11 files)
  - LOCKED: delete inline `$${x.toFixed(2)}` patterns in order-emails / receipt routes (route through `formatMoney`)
  - LOCKED: when reading `products.retail_price_cents` (D's column), depend on D's schema having landed first within the pair
- **Pre-flight queries:** see Part 6 §Family E.
- **Reconciliation:** see Part 6 §Family E.
- **Rollback:** see Part 7 §Family E.
- **Test surface:** see Part 8 §Family E.

### Unify-5 — Family A: POS Transactions (solo)

- **Dependencies:** Unify-1, Unify-2, Unify-3, Unify-4
- **Parallelizable with:** nothing (solo phase, biggest risk)
- **Scope:** 29 columns + `pos/utils/tax.ts` rewrite (cents-native) + 8 `Math.round(x * 100)` sites + `compose-line-items.ts` rewrite + QBO sync conversion update + 38-fixture regeneration + refund-math importers re-import from `money.ts`.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate all 29 columns + `_cents` suffix
  - LOCKED: rewrite `pos/utils/tax.ts` to compute entirely in cents (eliminate `Math.round(x * 100) / 100` dollars-precision floor)
  - LOCKED: rewrite all 8 `Math.round(x * 100)` sites from audit-1 (`card-payment.tsx:57,75`, `split-payment.tsx:237,254`, `job-detail.tsx:1683`, `checkout/create-payment-intent/route.ts:142,214`, `book/payment-intent/route.ts:26`)
  - LOCKED: when reading catalog (`compose-line-items.ts`, `service-resolver.ts`, `pos/utils/pricing.ts`), switch to `_cents` columns (D's columns exist since Unify-3)
  - LOCKED: leave `toCents(quote.discount_amount)` shim at quote→transaction convert path (3 sites); comment `// TODO Unify-8 cleanup` (B's phase removes)
  - LOCKED: leave shim at lifetime_spend update site; comment `// TODO Unify-9 cleanup` (G removes)
  - LOCKED: leave shim at coupon-helpers integration; comment `// TODO Unify-7 cleanup` (F removes)
  - LOCKED: regenerate all 38 receipt fixtures; diff against pre-migration; **any non-zero diff blocks merge**
  - LOCKED: **cash_drawers backfill = × 100 only**; do NOT recompute from source rows (LOCKED-2 #17 — historical financial records preserved)
  - LOCKED: per-component discount_amount breakdown reconciliation query passes (Part 6 §Family A)
  - LOCKED: QBO tax-line behavior unchanged (no tax line sent; preserved current behavior)
- **Pre-flight queries:** see Part 6 §Family A (especially #5 cash_drawers precision check).
- **Reconciliation:** see Part 6 §Family A.
- **Rollback:** see Part 7 §Family A.
- **Test surface:** see Part 8 §Family A. Recommend 2-session minimum.

### Unify-6 — Family C: Appointments (parallel with Unify-7)

- **Dependencies:** Unify-5
- **Parallelizable with:** Unify-7 (Family F). Within-pair: C's schema applies FIRST (more dependent columns).
- **Scope:** 8 appointments columns + 1 appointment_services + 1 mobile_zones + 2 job_addons + business_settings JSONB rename + ~60 caller files.
- **LOCKED decisions in prompt:**
  - LOCKED: rename `appointments.subtotal` → `subtotal_cents` and 7 siblings
  - LOCKED: rename JSONB key `default_deposit_amount` → `default_deposit_amount_cents`, value × 100
  - LOCKED: `payment_link_amount_cents` stays as-is (already correctly suffixed)
  - LOCKED: drop + recreate `appointments_mobile_consistency` against `mobile_surcharge_cents`
  - LOCKED: **add whole-dollar CHECK** `chk_appointments_mobile_surcharge_whole_dollar`
  - LOCKED: **add non-negative CHECK** `chk_appointments_deposit_amount_cents_non_negative`
  - LOCKED: **add whole-dollar CHECK** on `mobile_zones.surcharge_cents`
  - LOCKED: rewrite booking-flow display, pay-link send, mobile-fee picker, appointment detail dialog
  - LOCKED: update `src/lib/data/booking.ts` to read renamed JSONB key
  - LOCKED: rewrite `src/lib/utils/mobile-service-edit.ts` to operate pure-cents (eliminate cents-internal/dollars-at-storage boundary)
  - LOCKED: run pre-flight queries — especially deposit_amount > total_amount (LOCKED-2 #13) and mobile=true,surcharge=0 (LOCKED-2 #16); halt-and-decide if rows returned
- **Pre-flight queries:** see Part 6 §Family C.
- **Reconciliation:** see Part 6 §Family C.
- **Rollback:** see Part 7 §Family C.
- **Test surface:** see Part 8 §Family C.

### Unify-7 — Family F: Marketing (parallel with Unify-6)

- **Dependencies:** Unify-4, Unify-5
- **Parallelizable with:** Unify-6. Within-pair: F's schema applies SECOND.
- **Scope:** 4 columns + `coupon-helpers.ts` rewrite + analytics route updates + remove A's `// TODO Unify-7` shim at coupon integration sites.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `coupons.min_purchase`, `coupon_rewards.discount_value` (discount_type-aware!), `coupon_rewards.max_discount`, `campaigns.revenue_attributed`
  - LOCKED: discount_type enum is `'percentage' | 'flat' | 'free'` (corrected from v1)
  - LOCKED: discount_type-aware migration:
    - `flat`: × 100
    - `percentage`: untouched
    - `free`: untouched (stays 0)
  - LOCKED: rewrite `calculateCouponDiscount` in `coupon-helpers.ts` to return cents
  - LOCKED: remove Unify-5's `// TODO Unify-7` shim at coupon integration points
  - LOCKED: **partial refund use_count behavior preserved** (LOCKED-2 #12 — keep current; do not fix to net attribution)
  - LOCKED: max_discount migrates unconditional × 100 (always a dollar cap on percentage discount)
  - LOCKED: Q1.1 single-column vs split-column decision deferred to Unify-7 planning phase
- **Pre-flight queries:** see Part 6 §Family F.
- **Reconciliation:** see Part 6 §Family F.
- **Rollback:** see Part 7 §Family F.
- **Test surface:** see Part 8 §Family F.

### Unify-8 — Family B: Quotes (parallel with Unify-9)

- **Dependencies:** Unify-5, Unify-6
- **Parallelizable with:** Unify-9. Within-pair: B's schema applies FIRST.
- **Scope:** 7 columns + ~28 caller files + delete `quote-helpers.ts:33-35` local `formatCurrency` + remove A's `// TODO Unify-8` shim at convert path.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `quotes.subtotal`, `tax_amount`, `total_amount`, `mobile_surcharge` and `quote_items.unit_price`, `total_price`, `standard_price`
  - LOCKED: drop + recreate `quotes_mobile_consistency` against `mobile_surcharge_cents`
  - LOCKED: **add whole-dollar CHECK** on `quotes.mobile_surcharge_cents` (LOCKED-2 #15)
  - LOCKED: rewrite POS quote builder, voice-agent quote routes, admin quote read view, public quote page
  - LOCKED: remove Unify-5's `// TODO Unify-8` shim at quote→transaction convert path (`/api/pos/quotes/[id]/convert/route.ts`)
  - LOCKED: delete duplicate `formatCurrency` in `quote-helpers.ts:33-35`
- **Pre-flight queries:** see Part 6 §Family B.
- **Reconciliation:** see Part 6 §Family B.
- **Rollback:** see Part 7 §Family B.
- **Test surface:** see Part 8 §Family B.

### Unify-9 — Family G: Customer Aggregate (parallel with Unify-8)

- **Dependencies:** Unify-5
- **Parallelizable with:** Unify-8. Within-pair: G's schema applies SECOND.
- **Scope:** 1 column + ~15 caller files + transaction-completion update path + Stripe webhook lifetime_spend update + lifecycle engine reads + remove A's `// TODO Unify-9` shim.
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `customers.lifetime_spend` → `lifetime_spend_cents`
  - LOCKED: rewrite the aggregation site (transaction completion) to increment by cents
  - LOCKED: rewrite Stripe webhook `lifetime_spend` update (`src/app/api/webhooks/stripe/route.ts:337-338`) to use cents
  - LOCKED: remove Unify-5's `// TODO Unify-9` shim at aggregate update site
  - LOCKED: rewrite admin customer pages, lifecycle engine, AI conversation summary, migration validation
- **Pre-flight queries:** see Part 6 §Family G.
- **Reconciliation:** see Part 6 §Family G.
- **Rollback:** see Part 7 §Family G.
- **Test surface:** see Part 8 §Family G.

### Unify-Final — Cleanup + ADR

- **Dependencies:** all of Unify-1 through Unify-9
- **Parallelizable with:** nothing
- **Scope:**
  - Drop all NUMERIC(10,2) dollar columns left by two-phase commits (Migration 2 per family)
  - Rename `formatMoney` → `formatCurrency`; delete legacy dollars `formatCurrency(dollars)`
  - Delete duplicate formatters: `template.ts:143-146`, `quickbooks/page.tsx:147-149` (others already deleted in their family phases)
  - Rewrite remaining ~48 inline `` `$${x.toFixed(2)}` `` files to `formatMoney(cents)`
  - Upgrade `money/no-unsuffixed-money-prop` and `money/no-stripe-minimum-literal` lint rules from `'warn'` to `'error'`
  - Delete `src/lib/utils/refund-math.ts` re-export stub (after every importer has migrated)
  - Supersede ADR-0003 with ADR-0006 "Money model unified to integer cents (end-state)"; leave ADR-0003 in place with "Superseded by 0006" header
  - Update CLAUDE.md
  - Regenerate DB_SCHEMA.md

---

## Open Questions (revised)

### Resolved (Priority 1 from audit-2 — all locked in this revision)

- ~~**Q1.1**~~ — Deferred to Unify-7 planning phase (LOCKED-2 #7). Will be locked when Unify-7 prompt is written.
- ~~**Q3.1**~~ — RESOLVED: consolidate in Unify-1 (LOCKED-2 #8).
- ~~**Q9.1**~~ — DEFERRED: pre-existing bug, not unit-related; tracked in post-epic followups doc (LOCKED-2 #9).
- ~~**Q9.2**~~ — RESOLVED: keep `TAX_RATE = 0.1025` float (LOCKED-2 #10).
- ~~**Q2.1**~~ — RESOLVED: express alongside (LOCKED-2 #11); fix 2 hardcoded sites in Unify-1.

### Remaining — Priority 2 (block specific later phases)

- **Q1.1 (re-stated, blocks Unify-7)** — `coupon_rewards.discount_value` split-column vs single-column. Default: single-column with discount_type-aware migration. Decide at Unify-7 plan-phase.
- **Q4.1 (blocks Unify-6)** — Cases where `appointments.deposit_amount > appointments.total_amount`. Pre-flight SELECT at Unify-6 start; user decides policy if rows surface (cap at total, leave as-is, or flag for manual review).
- **Q5.2 (blocks Unify-6)** — Pre-flight `mobile=true,surcharge=0` audit. CHECK blocks new writes; existing rows may violate. Halt-and-decide if rows surface.
- **D pre-flight whole-dollar audit (blocks Unify-3)** — Services / service_pricing / packages rows with non-whole-dollar prices. Halt-and-decide if rows surface.

### Remaining — Priority 3 (orthogonal but tracked)

These are tracked in `docs/sessions/money-unify-post-epic-followups.md`:
- Q1.4 (combinable_with_sales dead column)
- Q1.6 (booking flow coupon use_count verification)
- Q1.7 (e-commerce campaigns redeemed_count omission)
- Q3.2 (booking wizard client-side $0.50 enforcement)
- Q4.3 (server-side deposit ≤ total validation)
- Q4.4 (already-correctly-named `payment_link_amount_cents`)
- Q6.1 (no global cancellation_fee setting)
- Q6.2 (already audit-logged — confirmed)
- Q6.3 (cancellation_fee doesn't auto-charge)
- Q7.3 (cash_drawers.deposit_amount naming overload with appointments.deposit_amount)
- Q7.4 (end-of-day UTC midnight bug)
- Q8.1 / Q8.2 / Q8.3 (refund residual edge cases — verified safe)
- Q9.3 (TAX_PRODUCTS_ONLY dead constant)
- Q9.4 (tax rate change policy — grandfather is current behavior)
- Q9.5 (QBO drops tax line)

---

## Honest Limitations

(Carried from v1.) What this playbook cannot predict, what it assumes, what could change as phases execute. Pre-flight queries (newly mandated per LOCKED-4) catch many of the "real data corner cases" that v1 noted as a blind spot.

---

## Changes from v1

This section enumerates every revision applied to v1 to produce v2.

| Section | v1 state | v2 change | Source / rationale |
| --- | --- | --- | --- |
| Executive Summary | "8 migration phases plus Unify-1 and Unify-Final — 10 phases total. Three pairs run in parallel; the critical-path length is 7 phases." | Order corrected to H → D → E → A → C → B → F → G. Pairs corrected to D∥E, C∥F, B∥G. | LOCKED-2 #1, #2 |
| Part 1 (Canonical Model) | Did not enumerate per-column-class whole-dollar policy | Added Business-policy CHECK table: services/packages whole-dollar; products/discounts/refunds/tax/tips cents-OK; mobile_surcharge whole-dollar | LOCKED-2 #21–26 |
| Part 1 (Helpers) | Listed `sumCents`, `clampCents`, `applyPercentageBps`, `splitProportionalCents` as Unify-1 additions | Removed preemptive additions; just-in-time per family that needs them. Added Stripe-min consolidation + REDEEM_RATE_CENTS + 2 hardcoded 0.05 fixes to Unify-1 scope | LOCKED-2 #4, #8, #11 |
| Part 1 (Boundary) | "QBO sends tax via standard sales receipt" (implicit) | Explicit: QBO drops tax line entirely; preserved in this epic, NOT fixed; see followups doc | LOCKED-2 #6, audit-2 Q9.5 |
| Part 2 §Family A | discount_amount described as monolithic | Documented composite nature (coupon + loyalty + manual); loyalty portion separately stored; coupon/manual not separately decomposable | LOCKED-3 #29, audit-2 finding |
| Part 2 §Family B | Did not call out `quotes_mobile_consistency` CHECK | Added: CHECK migration atomic; whole-dollar CHECK added | LOCKED-3 #27, LOCKED-2 #15 |
| Part 2 §Family C | "ZIP/address resolves to zone" | Corrected: mobile_zones are distance-based; resolution is cashier-pick at job-creation; surcharge snapshotted | LOCKED-3 #30, audit-2 finding |
| Part 2 §Family C | Did not enumerate the appointments_mobile_consistency CHECK explicitly in the family description | Added: CHECK migration atomic; new whole-dollar + deposit non-negative CHECKs | LOCKED-3 #27, LOCKED-2 #14, #15 |
| Part 2 §Family F | discount_type stated as `'percentage' | 'fixed_amount'` | Corrected to `'percentage' | 'flat' | 'free'`; 'free' variant migration documented | LOCKED-3 #28, audit-2 finding |
| Part 3 (Migration Order) | H → E → A → C → B → F → D → G | H → D → E → A → C → B → F → G (D moved from position 7 to position 2) | LOCKED-2 #1 |
| Part 3 (Rationale) | Catalog-last reasoning | Catalog-first reasoning: two-phase commit + dual-column intermediate state eliminates downstream shims | LOCKED-2 #1, deduced from new order |
| Part 4 (Matrix) | A × D = MEDIUM noted A reads catalog (shim direction = A leaves TODO for D) | Same MEDIUM rating; shim direction reversed: with D at position 2, A's catalog readers switch to cents-native without shims | LOCKED-2 #1 |
| Part 5 (Pairs) | H∥E, C∥F, B∥G | D∥E, C∥F, B∥G | LOCKED-2 #2 |
| Part 5 (Sequencing) | Did not specify `supabase db push` ordering within pairs | Added "Within-pair sequencing protocol": sequential schema apply, smaller-table-first | LOCKED-2 #2 |
| Part 6 (Reconciliation) | Pre-flight audits implicit | Every family now has explicit pre-flight queries (CHECK violators, negative values, cross-table drift). Halt-and-decide if anomalies found | LOCKED-4 |
| Part 6 §Family A | Reconciliation queries didn't break down discount_amount | Added per-component breakdown query (loyalty separately stored; coupon/manual together = discount − loyalty) | LOCKED-3 #29 |
| Part 6 §Family F | discount_type values wrong; migration script SQL wrong | Corrected to flat/percentage/free; SQL updated per LOCKED-3 #28 | LOCKED-3 #28 |
| Part 6 §Family A | cash_drawers backfill described as "× 100 OR recompute" | LOCKED to × 100 only (historical preservation) | LOCKED-2 #17 |
| Part 6 §Family C | Did not include deposit > total or mobile=true,surcharge=0 audits | Added per LOCKED-2 #13, #16 | LOCKED-2 #13, #16 |
| Part 6 §Family D | Did not include whole-dollar pre-violator audit | Added; pre-flight queries enumerated for services/service_pricing/packages | LOCKED-2 #21 |
| Part 7 (Rollback) | Did not enumerate CHECK constraint rollbacks | Added per family: C rolls back appointments_mobile_consistency + new whole-dollar + non-negative deposit CHECKs; B rolls back quotes_mobile_consistency + whole-dollar; D rolls back all new whole-dollar CHECKs | LOCKED-3 #27, LOCKED-2 #14, #15, #21 |
| Part 8 (Tests) | Did not include cash_drawers × 100 verification | Added per Family A: regression test asserting × 100 backfill preserves history | LOCKED-2 #17 |
| Part 8 (Tests) | Did not include CHECK constraint tests | Added per family: each new CHECK has a rejection test | LOCKED-2 #14, #15, #21 |
| Part 8 (Tests) | Did not include 'free' variant test | Added per Family F | LOCKED-3 #28 |
| Decisions section | Open sign-off | All four marked APPROVED; Decision B modified to just-in-time helpers; Decision D adds QBO tax line caveat | LOCKED-2 #3–6 |
| Phase Sequence | 10 phases with H,E,A,C,F,B,G,D ordering | 10 phases with H,D,E,A,C,F,B,G ordering; phase numbers updated (D = Unify-3, E = Unify-4, A = Unify-5, etc.) | LOCKED-2 #1 |
| Phase Sequence — Unify-1 | Scope: helpers + lint + MONEY.md | Scope expanded: + Stripe-min consolidation + REDEEM_RATE_CENTS + 2 hardcoded 0.05 fixes | LOCKED-2 #8, #11 |
| Phase Sequence — Unify-5 (A) | Did not specify cash_drawers backfill strategy | LOCKED: × 100 only (no recompute) | LOCKED-2 #17 |
| Phase Sequence — Unify-7 (F) | Q1.1 deferred message | Explicit deferral note; default = single-column with discount_type-aware migration | LOCKED-2 #7 |
| Open Questions | All listed as open | Priority 1 marked RESOLVED/DEFERRED; Priority 2 listed with phase-block annotation; Priority 3 moved to followups doc | LOCKED-2 #7–20, LOCKED-5 |
| (new section) | — | Added "Changes from v1" section | LOCKED-6 |

---

## Sign-off Checklist

Already approved per LOCKED-2; recorded for completeness:

- [x] Cents-canonical end-state (Part 1)
- [x] 8-family grouping (Part 2)
- [x] Migration order H → D → E → A → C → B → F → G
- [x] Parallelization pairs D∥E, C∥F, B∥G
- [x] Decision A: formatMoney(cents) + formatCurrency(dollars) coexist until Unify-Final
- [x] Decision B: rename to money.ts; just-in-time helpers
- [x] Decision C: _cents suffix + lint rule
- [x] Decision D: boundary table + QBO tax-line caveat
- [x] Q1.1 deferred to Unify-7 plan-phase
- [x] Q3.1: Stripe-min consolidation in Unify-1
- [x] Q9.1: tax_rate admin UI deferred to post-epic
- [x] Q9.2: keep TAX_RATE float
- [x] Q2.1: REDEEM_RATE_CENTS alongside; fix 2 hardcoded 0.05 sites
- [x] Q1.2: partial refund use_count behavior preserved
- [x] Q4.1: pre-flight at Unify-6; user-decide if anomalies
- [x] Q4.2: add deposit_amount_cents non-negative CHECK
- [x] Q5.1: whole-dollar CHECK on mobile_surcharge (appointments + zones + quotes)
- [x] Q5.2: pre-flight mobile=true,surcharge=0 audit
- [x] Q7.1: cash_drawers backfill × 100 (no recompute)
- [x] Q7.2: max_variance threshold deferred to post-epic
- [x] Q2.3: leave loyalty redemption unlimited
- [x] Q2.4: no earn on loyalty_discount portion (intentional)
- [x] Whole-dollar CHECK family-by-family per LOCKED-2 #21–26
- [x] Per-phase pre-flight data audits mandated (LOCKED-4)
- [x] Post-epic followups doc tracks pre-existing items (LOCKED-5)

Next phase: write the Unify-1 prompt.
