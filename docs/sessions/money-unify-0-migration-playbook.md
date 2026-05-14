# Phase Money-Unify-0 — Migration Playbook

> Audit-only session. No source-code changes. This document is operating
> instructions for the multi-phase Money-Unify epic that will migrate
> the codebase from a mixed-representation money model
> (86 % NUMERIC dollars / 11 % INTEGER cents / 4 % composite expressions)
> to **cents-canonical end-to-end**, per the direction set by ADR-0003.
>
> Prerequisite reading:
> - `docs/sessions/money-audit-1-representation-archaeology.md` (the 635-line audit this playbook is built on)
> - `docs/adr/0003-money-math-via-integer-cents.md` (will be superseded in Unify-Final)
> - `docs/adr/0001-canonical-form-pattern.md` (parent meta-pattern that motivates the work)
> - `docs/dev/DB_SCHEMA.md` (live column types — auto-regenerated)

---

## Executive Summary

Phase Money-Audit-1 established that the codebase carries **65 NUMERIC(10,2) dollar columns** across 23 tables (~94 % of money storage) coexisting with **12 INTEGER cents columns** in the e-commerce / pay-link surface. `formatCurrency()` has 510 callers — 86 % feed it raw dollars, 11 % feed it `value / 100`, and exactly **one** caller in the entire codebase uses the canonical `formatCurrency(fromCents(x))` composition. ADR-0003's "cents canonical" rule applies in `refund-math.ts`'s 22-file blast radius and nowhere else.

The Money-Unify epic moves the rest of the codebase onto the ADR-0003 model. This playbook breaks the work into **8 migration phases plus Unify-1 (helpers) and Unify-Final (cleanup + ADR rewrite)** — 10 phases total. Three pairs run in parallel; the critical-path length is 7 phases.

**Eight table families** define the work. Each family migrates atomically: schema + all callers in a single phase that commits as one verifiable unit. Each family carries (a) reconciliation SQL that proves SUM-equality before/after, (b) a documented rollback procedure with explicit DOWN steps, (c) a test surface enumeration (existing tests + identified gaps + new tests required), and (d) the file-overlap analysis that determines what can run in parallel.

**Critical constraint:** every phase deploys to dev only. No production exposure until the full epic is verified end-to-end at the end of Unify-Final.

The four locked decisions at the end of this document (formatter signature, helper API surface, naming convention, boundary policy) need user sign-off before Unify-1 starts. They drive every subsequent phase.

---

## Part 1 — Canonical Money Model

### Target end-state

Every money-bearing value in the system carries integer cents from storage through math to the final display boundary. Conversion to dollars happens exactly once per render path, at the formatter call.

**Storage layer:**
- All money columns are `INTEGER` storing cents (smallest currency unit, USD).
- Every money column name carries a `_cents` suffix. The suffix is the type signal — a future maintainer scanning a schema diff sees "this column is cents" without reading the migration body.
- Every money column carries a `CHECK (col_cents >= 0)` (or domain-appropriate bound: refunds may need ≥ 0, discounts always ≥ 0, prices always ≥ 0). Tax-rate-adjusted lines that could theoretically be negative under exotic refund flows get a documented exemption.
- JSONB money values (e.g. `business_settings.value` carrying `default_deposit_amount`) carry cents too. The key name is suffixed `_cents` (`default_deposit_amount_cents`).

**Code layer:**
- Every variable holding cents is suffixed `Cents` in camelCase (`amountCents`, `subtotalCents`) or `_cents` in snake_case (`amount_cents`, `subtotal_cents`).
- The 14 existing `*Dollars` identifiers (`chargeDollars`, `paidDollars`, `linkAmountDollars`) survive as the **explicit dollars-at-the-boundary marker**. They live only in display-adjacent code where a cents value is converted for a one-shot use (e.g. an `<input value={dollars}>` controlled input).
- Unnamed numeric literals carry cents (`amount: 5000`, not `amount: 50`). For dollar literals in legacy boundary code, the unit is documented inline (`const stripeMinimumDollars = 0.50;`) — but such constants should be rare after Unify-Final.
- All money arithmetic uses integer operators on cents. No `* 100` or `/ 100` inside business logic. The only sites that may convert are: (a) external-API boundaries that demand dollars (QBO, Shippo), (b) the formatter helper, (c) controlled-input value coercion.

**Math layer:**
- All money helpers live in `src/lib/utils/money.ts` (renamed from `refund-math.ts` — see Decision B). The module exports `toCents`, `fromCents`, plus the refund-specific computations.
- Arithmetic on cents uses native JS integer math. JavaScript's `Number` represents integers exactly up to 2^53 — more than enough headroom for cents (a $10M order is 10^9 cents).
- Tax computation moves to `pos/utils/tax.ts` after Unify-2; it operates entirely on cents and stops emitting the `Math.round(x * 100) / 100` dollars-precision floor.

**Display layer:**
- Single canonical formatter: `formatMoney(cents: number): string` exported from `src/lib/utils/format.ts`. Returns the same output as today's `formatCurrency` ($1,234.56 with comma separator, two decimal places, USD symbol).
- The existing `formatCurrency(dollars: number)` function survives through the migration so families can migrate one at a time without touching every caller. Unify-Final renames `formatMoney` to `formatCurrency` and deletes the old function. Naming `formatMoney` during the transition is the migration signal: every site that has switched is one fewer to audit.
- The 4 duplicate formatter implementations (`template.ts:143-146` `formatDollar`, `quickbooks/page.tsx:147-149` `formatDollar`, `quote-helpers.ts:33-35` local `formatCurrency`, `quick-edit-drawer.tsx:44-47` `formatPrice`) are deleted in Unify-Final after their families have migrated.
- All 48 files containing inline `` `$${x.toFixed(2)}` `` patterns are rewritten to use `formatMoney(cents)`. The lint rule that lands in Unify-1 catches new violations.

**Boundary layer (see Decision D):**
- Stripe: cents on the wire (already the API contract).
- Square Catalog API: cents on the wire (their `price_money.amount`).
- QuickBooks Online: decimal dollars (`Amount: 17.64`). Conversion via `fromCents()` at the QBO sync boundary.
- Shippo: decimal dollar strings. Conversion at the Shippo sync boundary.
- Email/SMS/PDF/HTML: never raw numbers. Always `formatMoney(cents)`.

### Decision recap

The first locked decision (formatter signature) is restated as the **operational rule** that drives Parts 2–8:

> `formatMoney` is the canonical formatter and accepts integer cents. The old `formatCurrency` (dollars-input) survives the migration so per-family caller rewrites are tractable. Unify-Final renames `formatMoney` → `formatCurrency` and deletes the dollars helper.

### Why cents-canonical (re-affirming the user's choice)

The Money-Audit-1 recommendation favored dollars-canonical based on caller asymmetry (changing 25-30 files vs 120-150). The user has chosen cents-canonical, accepting the higher caller-count cost in exchange for:

1. **A single mental model.** Future maintainers no longer ask "what unit is `discount_amount` on this row?" — same name, same unit, every table.
2. **IEEE-754 immunity by default.** ADR-0003's invariant 1 ("no inline `* 100` or `/ 100`") becomes structurally enforceable, not just disciplinarily.
3. **Alignment with the highest-frequency external boundary.** Stripe is the dominant payment integration; orders are already cents; refunds compute in cents. Cents-canonical reduces the round-trip footprint to QBO + Shippo (low-frequency reads).
4. **Lint-rule tractability.** A `money/no-numeric-money-column` rule has a clean specification ("INTEGER cents only") and is enforceable end-to-end. The dollars-with-exceptions alternative requires a more nuanced rule that names every exempted column.

---

## Part 2 — Table Family Inventory

77 money columns across 23 tables. Grouped into **8 families** by business domain + code-path coupling + migration-coupling.

### Family A — POS Transactions

The transaction-level money record: what a customer paid, when, broken into items, recorded as discrete payment events, and refunded line-by-line if needed. Plus the end-of-day cash drawer that aggregates these flows.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `transactions` | `subtotal`, `tax_amount`, `tip_amount`, `discount_amount`, `total_amount`, `loyalty_discount`, `deposit_credit` — all `NUMERIC(10,2)` → `INTEGER` cents (rename `+_cents`) | 7 cols |
| `transaction_items` | `unit_price`, `total_price`, `tax_amount`, `standard_price` — all `NUMERIC(10,2)` → `INTEGER` cents | 4 cols |
| `payments` | `amount`, `tip_amount`, `tip_net` — all `NUMERIC(10,2)` → `INTEGER` cents | 3 cols |
| `refunds` | `amount` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `refund_items` | `amount` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `cash_drawers` | `opening_amount`, `expected_cash`, `counted_cash`, `variance`, `deposit_amount`, `next_day_float`, `cash_sales`, `cash_tips`, `cash_refunds`, `total_revenue`, `total_tax`, `total_tips`, `total_refunds` — all `NUMERIC(10,2)` → `INTEGER` cents | 13 cols |

**Column count:** 29.

**Approximate caller count:** 167 admin files + 42 POS files + parts of api/pos + receipt routes + lifecycle engine ≈ **~110 source files touch transactions-family columns**.

**Current state:** Mixed-state internally. The refund pipeline (5 files) and checkout split-payment (2 files) already operate in cents internally via `refund-math.ts`, but writes go back through `toCents` boundary conversion at the DB layer. Tax computation (`pos/utils/tax.ts`) does dollars-precision flooring via `Math.round(x * 100) / 100` — needs full cents-internal rewrite, not just a column-type swap.

**Migration-coupling:** Transactions and `transaction_items` MUST migrate together — total_amount is computed from item sums. `payments` and `refunds` couple to transactions via FK, and both have reconciliation invariants (sum of payments ≤ transaction.total_amount; sum of refunds ≤ sum of original payments). Splitting these into sub-phases breaks reconciliation. `cash_drawers` aggregates from `payments` rows; migrating drawers before payments produces dollar-summed cents (broken).

### Family B — Quotes

Quote builder pricing model. Quotes are the read path; transactions are the write path (POS converts a quote into a transaction). Two-table family.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `quotes` | `subtotal`, `tax_amount`, `total_amount`, `mobile_surcharge` — all `NUMERIC(10,2)` → `INTEGER` cents | 4 cols |
| `quote_items` | `unit_price`, `total_price`, `standard_price` — all `NUMERIC(10,2)` → `INTEGER` cents | 3 cols |

**Column count:** 7.

**Approximate caller count:** ~28 files. POS quote builder (`src/app/pos/components/quotes/*` = 12 files), API routes (`src/app/api/quotes/*`, `src/app/api/pos/quotes/*` = 11 files), admin read view (`src/app/admin/quotes/*` = 3 files), voice-agent quote send (2 files).

**Current state:** Pure dollars storage; pure dollars math. `src/app/pos/components/quotes/quote-helpers.ts:33-35` carries a duplicate local `formatCurrency(dollars)` that gets deleted in Unify-Final.

**Migration-coupling:** Quotes → Transactions conversion code is in `src/app/api/pos/quotes/[id]/convert/route.ts` and `src/app/api/quotes/[id]/convert/route.ts`. Either both family A (transactions) and family B (quotes) migrate atomically together (large blast radius), or the convert path is migrated as a third step after both families are done. **Recommendation: keep them separate but adjacent — Unify-2 (transactions) lands first, Unify-3 (quotes) lands second, and the convert-path code change happens inside Unify-3's scope because Unify-2 will have already established the cents shape on the transactions side.**

### Family C — Appointments

The job/booking record. **This family carries the only intra-table mixed-unit storage in the schema**: 8 NUMERIC dollar columns plus 1 INTEGER cents column (`payment_link_amount_cents`).

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `appointments` | `mobile_surcharge`, `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `cancellation_fee`, `deposit_amount`, `coupon_discount` — all `NUMERIC(10,2)` → `INTEGER` cents | 8 dollar cols to migrate |
| `appointments` | `payment_link_amount_cents` — already `INTEGER` cents | No data migration; just suffix-alignment with siblings post-migration (they too will be `_cents`) |
| `appointment_services` | `price_at_booking` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `mobile_zones` | `surcharge` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `job_addons` | `price`, `discount_amount` — `NUMERIC(10,2)` → `INTEGER` cents | 2 cols |

**Column count:** 12 to migrate (plus the 1 existing cents column).

**Approximate caller count:** ~60 files. POS quote/ticket builders read `mobile_zones.surcharge`. Admin appointments page (`src/app/admin/appointments/components/appointment-detail-dialog.tsx`), POS jobs (`src/app/pos/jobs/components/job-detail.tsx`), booking flow (`src/components/booking/*`), pay-link send (`src/app/api/pos/appointments/[id]/send-payment-link/route.ts`), mobile-service edit (admin + POS variants), cancellation flow, voice-agent appointment booking.

**Current state:** Mixed-state intra-table — the 9th column (`payment_link_amount_cents`) is already cents. Most of the import pipeline (`mobile-service-edit.ts`) already operates in cents internally and converts at the DB boundary. The booking-flow display (`step-confirm-book.tsx:893`) does the `grandTotal - depositAmount` subtraction in dollars.

**Migration-coupling:** `appointments.deposit_amount` and `business_settings.default_deposit_amount` form a one-way pipe (deposit setting flows into appointments.deposit_amount at booking time). The JSONB key in `business_settings.value` must migrate with appointments to avoid runtime unit mismatch. `appointments.subtotal/tax/total` is derived from `appointment_services.price_at_booking` + `mobile_zones.surcharge`, so those three must migrate together.

### Family D — Catalog (Services, Products, Packages)

The price source-of-truth: what the business charges for each service tier or product. Sells INTO transactions, quotes, appointments, and orders.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `services` | `flat_price`, `custom_starting_price`, `per_unit_price`, `sale_price` — all `NUMERIC(10,2)` → `INTEGER` cents | 4 cols. `chk_service_sale_price` CHECK survives migration (changes from `< price` to `< price_cents`). |
| `service_pricing` | `price`, `vehicle_size_sedan_price`, `vehicle_size_truck_suv_price`, `vehicle_size_suv_van_price`, `vehicle_size_exotic_price`, `vehicle_size_classic_price`, `sale_price` — all `NUMERIC(10,2)` → `INTEGER` cents | 7 cols. `services_sale_price_non_negative` CHECK survives. |
| `products` | `cost_price`, `retail_price`, `sale_price` — all `NUMERIC(10,2)` → `INTEGER` cents | 3 cols. `chk_product_sale_price` survives. |
| `packages` | `price` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |

**Column count:** 15.

**Approximate caller count:** ~70 files. Heavy concentration in admin catalog pages, POS service-pricing picker, public product/service pages, booking step-service-select, voice-agent service routes, and the AI content writer.

**Current state:** Pure dollars storage. The `quick-edit-drawer.tsx:44-47` `formatPrice` shim lives in this family. `coupon-helpers.ts` reads `min_purchase`, `max_discount`, `discount_value` from the marketing family but applies them to catalog prices — cross-family read.

**Migration-coupling:** Catalog is read FROM by every transactional family (transactions, quotes, appointments, orders). Reads must continue to work for non-migrated families. The migration order (Part 3) puts catalog **late** for this reason — when catalog migrates, every reader is already speaking cents.

### Family E — Orders (e-commerce)

The Phase 9 e-commerce schema. **Already cents-canonical internally** but with two outstanding gaps: (a) column names lack `_cents` suffix (`orders.subtotal`, not `orders.subtotal_cents`); (b) all consumer code reads via Pattern B `formatCurrency(x / 100)` instead of canonical `formatMoney(x)`.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `orders` | `subtotal`, `discount_amount`, `tax_amount`, `shipping_amount`, `total` — all `INTEGER` cents → rename to `_cents` | 5 cols (rename only, no value transform) |
| `order_items` | `unit_price`, `line_total`, `discount_amount` — all `INTEGER` cents → rename to `_cents` | 3 cols (rename only) |
| `shipping_settings` | `flat_rate_amount` — `INTEGER` cents → rename to `flat_rate_amount_cents` | 1 col (rename only). `handling_fee_amount` is `NUMERIC(8,2)` dollars → migrate to `INTEGER` cents AND rename. |

**Column count:** 9 to rename, 1 to migrate (handling_fee_amount).

**Approximate caller count:** ~30 files. Pattern-B concentration: 55 `/100` divisions across 11 files — every one of them is in or adjacent to this family.

**Current state:** Cents-internal, dollars-suffix-naming, dollars-format-call pattern. The migration here is mostly **renaming and call-site rewrites** rather than schema-type changes. Lower risk than other families because the storage type is already correct.

**Migration-coupling:** Independent of A–D for data. Couples to the Stripe webhook (cents on the wire) and the order-emails formatter. The 22 inline `$${x.toFixed(2)}` files in api/ (mostly receipt/email routes) overlap heavily with this family's blast radius.

### Family F — Marketing (Coupons + Campaigns)

Coupon discount mechanics + campaign attribution.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `coupons` | `min_purchase` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `coupon_rewards` | `discount_value`, `max_discount` — `NUMERIC(10,2)` → `INTEGER` cents | 2 cols |
| `campaigns` | `revenue_attributed` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |

**Column count:** 4.

**Approximate caller count:** ~20 files. `src/lib/utils/coupon-helpers.ts` is the single canonical math site per CLAUDE.md rule. Consumers: `/api/pos/coupons/validate`, `/api/book/validate-coupon`, `/api/pos/promotions/available`, `/api/checkout/create-payment-intent`. Admin marketing pages (`src/app/admin/marketing/coupons/*`, `src/app/admin/marketing/campaigns/*`). Marketing analytics route.

**Current state:** Pure dollars storage. `coupon_rewards.discount_value` carries a unit-discriminator at runtime — when `discount_type = 'percentage'`, the value is a percentage (NOT money); when `discount_type = 'fixed_amount'`, it's dollars. **The migration must NOT convert percentage rows by ×100.** This requires a `discount_type`-aware migration script, not a blind `UPDATE coupon_rewards SET discount_value = discount_value * 100`.

**Migration-coupling:** Coupons read FROM cart subtotals (catalog prices summed); they write INTO transactions (`discount_amount`) and orders (`discount_amount`). Migration order: coupons land AFTER both Family A (transactions) and Family E (orders) have unified, because the validate endpoints sum cart cents and apply coupon cents — both sides must be cents-native for the math to work without conversion shims.

### Family G — Customer Aggregate

Single column. The customer's running lifetime spend.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `customers` | `lifetime_spend` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |

**Column count:** 1.

**Approximate caller count:** ~15 files. Admin customer list, customer detail page, customer stats endpoint, lifecycle engine (campaign eligibility), AI conversation summary, migration validation step.

**Current state:** Pure dollars storage. Computed/updated by trigger or by the transactions completion endpoint (write path: `src/app/api/pos/jobs/[id]/complete/route.ts` and the QBO/lifecycle aggregation jobs). Read-heavy.

**Migration-coupling:** `lifetime_spend` is a derived aggregate from `transactions.total_amount`. It must migrate AFTER Family A so the aggregation logic re-reads cents-typed columns. If migrated before A, the aggregation accumulates dollars but the column is cents — bad write 100× too small. **Hard order constraint: Family G after Family A.**

### Family H — Inventory & Procurement

Vendor purchase orders and stock-adjustment costs. Lowest-traffic, lowest-coupling family.

| Table | Columns (current type → target) | Notes |
| --- | --- | --- |
| `purchase_order_items` | `unit_cost` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `stock_adjustments` | `unit_cost` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `vendors` | `min_order_amount` — `NUMERIC(10,2)` → `INTEGER` cents | 1 col |
| `products` | `cost_price` — already in Family D | — |

**Column count:** 3 (cost_price counted under Family D).

**Approximate caller count:** ~8 files. Admin inventory pages (counts, vendors, purchase orders), `/api/admin/purchase-orders/*`, `/api/admin/stock-adjustments`.

**Current state:** Pure dollars storage. No cross-family math. No customer-facing display surface (admin-internal only).

**Migration-coupling:** None. This family can migrate independently of A-G. Ideal candidate for the **first non-orders migration** because it has low blast radius and lets us validate the per-family pattern before tackling transactions.

### Family inventory summary

| Family | Tables | Columns to migrate | Caller count (approx) | Couples to |
| --- | --- | --- | --- | --- |
| A. POS Transactions | 6 | 29 | ~110 | (foundation) |
| B. Quotes | 2 | 7 | ~28 | A (convert path) |
| C. Appointments | 4 | 12 (+1 already cents) | ~60 | A, business_settings JSON |
| D. Catalog | 4 | 15 | ~70 | A, B, C, E (every transactional family) |
| E. Orders | 3 | 9 rename + 1 migrate | ~30 | (independent storage; couples to Stripe webhook) |
| F. Marketing | 3 | 4 (percent-discriminated) | ~20 | A, E (write into both) |
| G. Customer aggregate | 1 | 1 | ~15 | A (derived) |
| H. Inventory | 3 | 3 | ~8 | D (cost_price relationship) |

**Total: 80 column migrations (77 type-changes + 3 renames), ~350 distinct caller files** with substantial reuse across families.

---

## Part 3 — Migration Order

Eight families, ordered by (a) risk-tolerance (validate pattern on small family first), (b) dependency direction (derived families AFTER their sources), (c) blast radius (largest family in the middle of the sequence so we still have momentum on either side), and (d) external-boundary coverage (Stripe + e-commerce checkpoint mid-sequence so the migration is half-validated against live integration shape before we tackle catalog rewrite).

### Recommended order

| Pos | Family | Rationale |
| --- | --- | --- |
| **1** | **H. Inventory** | 3 columns, ~8 files, admin-only. Validates the per-family migration pattern (schema diff + caller rewrite + reconciliation queries + rollback) without exposure to customer-facing flow. If the pattern breaks here, we re-design before risking transactions. |
| **2** | **E. Orders (rename + handling-fee migration)** | Mostly rename — lowest data-transformation risk. Reveals the Pattern-B → Pattern-C conversion playbook on a contained ~30-file blast radius. The orders pipeline + Stripe webhook are the first cents-on-the-wire integration validated post-rename; sets the cents+name expectation for everything downstream. |
| **3** | **A. POS Transactions** | The heart of the system. 29 columns, ~110 files. Migrated mid-sequence — late enough that the pattern is proven (steps 1+2), early enough that all derived families (B, C, F, G) have stable foundations to migrate against. This is the riskiest single migration; everything else in the playbook is calibrated around this phase's success. |
| **4** | **C. Appointments** | Migrating after A because: (i) `appointments` rows are read by transactions completion path, so completing a job needs both sides to speak the same unit; (ii) the deposit_credit on transactions came from appointments.deposit_amount — bidirectional flow. Migrating both atomically is too large; staging A→C in two adjacent phases lets us reconcile each independently. The 1 already-cents column on appointments becomes the explicit anchor (rename-only on it; type-change on the 8 dollar siblings). |
| **5** | **B. Quotes** | Quotes convert to transactions and appointments. Both targets are cents-native by step 5, so the convert paths simplify rather than fight the in-flight migration. The quote builder is fully read-only data-flow downstream of catalog (step 7) but writes to quote/quote_items which only this family owns. |
| **6** | **F. Marketing** | Couples to A (transactions.discount_amount) and E (orders.discount_amount). Both are cents-native by step 6. The `discount_value` percentage/dollars discriminator is the risk — handled with a `discount_type`-aware migration script. |
| **7** | **D. Catalog** | The largest read-fan-out family (~70 files). Migrated last among the transactional set because every read consumer (transactions, quotes, appointments, orders) is already cents-native; consumers don't need to be touched again. Catalog migration becomes a pure write-side rewrite. |
| **8** | **G. Customer Aggregate** | The aggregation source (transactions.total_amount) is cents-native after step 3. Migrating the aggregate column AND the aggregation logic atomically. Last in sequence because it has zero blockers but several inbound readers (lifecycle, campaigns, AI summary) that are easier to validate when the aggregation upstream is stable. |

### Position-specific notes

- **Phase Unify-1** (helpers + lint rule) runs BEFORE position 1. It's a prerequisite to all 8 family migrations and has no dependencies of its own.
- **Phase Unify-Final** runs AFTER position 8. It deletes the duplicate formatters, rewrites the 48 inline `` `$${x.toFixed(2)}` `` files, renames `formatMoney → formatCurrency`, upgrades the lint rule from `'warn'` to `'error'`, and supersedes ADR-0003 with a follow-up ADR that documents the post-migration end-state.
- **Family A is the single largest unit of risk.** Even if every other family migrates flawlessly, a regression in transactions migration corrupts revenue. The session for Unify-3 (Family A) should be scoped longer than the others — at minimum 2 sessions: one to migrate, one to validate against a reconciliation pass on real (dev) data.

### Order alternatives considered

- **"Catalog first" alternative.** Catalog is the read source for every other family — migrating it first would feel structurally clean. Rejected: catalog has ~70 consumer files in nearly every other family. Doing it first means every consumer in steps 3-8 also needs the consumer-side rewrite. By migrating catalog LAST among transactionals, every consumer is already speaking cents and the catalog rewrite is a contained write-path change.
- **"Orders first" alternative.** Orders is already cents — tempting to leave it for last (no real type change). Rejected: it's the lowest-risk family with the cleanest migration (rename + caller pattern flip). Doing it second after Inventory validates the **Pattern-B → Pattern-C caller migration playbook**, which is the dominant pattern in transactions migration. Saving it for last forfeits this rehearsal.
- **"Marketing before Transactions" alternative.** Coupons feed into transactions, so superficially they should migrate together. Rejected: coupons compute their effect at write-time and write the resulting `discount_amount` into transactions. As long as `coupon-helpers.ts` is unit-aware during the transition (it can produce cents or dollars depending on flag), coupons can migrate AFTER transactions. The cleaner approach: transactions go cents (step 3); coupons keep emitting dollars temporarily (one-line conversion at the write site); coupons migrate (step 6) to drop the conversion shim.

---

## Part 4 — File-Overlap Matrix

Methodology: for each family, enumerate the source files that will be touched (schema migration is excluded from overlap analysis — only TypeScript/TSX changes count, since schema migrations live in disjoint files). Compute pairwise set intersection. Categorize by overlap percentage.

- **HIGH (>30 % overlap)**: cannot parallelize. Either migrate together (risky) or strictly sequence (chosen).
- **MEDIUM (10–30 % overlap)**: parallelizable only with explicit per-session scope boundaries. Each session must reserve its files in writing before starting.
- **LOW (<10 % overlap)**: parallelizable freely. Conflicts at PR-merge level only.

### Per-family touch sets (approximate, will firm up in each phase's plan-phase)

| Family | Touch-set archetype |
| --- | --- |
| A. Transactions | `src/app/pos/components/checkout/*` (8 files), `src/app/api/pos/transactions/*` (3 files), `src/app/api/pos/refunds/*` (2 files), `src/app/api/pos/jobs/*` (4 files), `src/app/pos/utils/tax.ts`, `src/app/pos/utils/pricing.ts`, `src/app/pos/context/ticket-reducer.ts`, `src/app/pos/jobs/components/job-detail.tsx`, `src/app/pos/components/transactions/*` (3 files), `src/app/pos/components/refund/*` (3 files), `src/lib/data/receipt-composer.ts`, `src/lib/data/receipt-data.ts`, `src/lib/refunds/source-plan.ts`, `src/lib/qbo/sync-transaction.ts`, `src/app/admin/transactions/**` (~10 files), `src/app/(public)/receipt/[token]/page.tsx`, `src/app/api/cron/qbo-sync/route.ts`, `src/lib/utils/coupon-helpers.ts` (read-only ref), receipt fixtures (19 scenarios × 2 = 38 files) |
| B. Quotes | `src/app/pos/components/quotes/*` (12 files), `src/app/api/pos/quotes/*` (4 files), `src/app/api/quotes/*` (5 files), `src/app/admin/quotes/**` (3 files), `src/app/pos/context/quote-reducer.ts`, `src/lib/quotes/send-service.ts`, `src/lib/utils/compose-line-items.ts`, voice-agent quote routes (2 files), `src/app/(public)/quote/[token]/page.tsx` |
| C. Appointments | `src/app/admin/appointments/**` (~6 files), `src/app/api/admin/appointments/*` (~4 files), `src/app/api/pos/appointments/*` (~5 files), `src/app/api/admin/mobile-zones/route.ts`, `src/app/api/pos/jobs/*` (overlap with A), `src/app/pos/jobs/components/job-detail.tsx` (overlap with A), `src/lib/utils/mobile-service-edit.ts`, `src/components/jobs/payment-link-amount-modal.tsx`, `src/components/booking/**` (4 files), `src/lib/data/booking.ts`, `src/app/api/book/route.ts`, `src/app/api/book/payment-intent/route.ts`, `src/lib/data/business-defaults.ts` (deposit_amount key) |
| D. Catalog | `src/app/admin/catalog/**` (~15 files), `src/app/api/admin/products/*`, `src/lib/services/service-resolver.ts`, `src/app/pos/components/service-pricing-picker.tsx`, `src/app/pos/components/catalog-card.tsx`, `src/app/pos/components/service-detail-dialog.tsx`, `src/lib/utils/sale-pricing.ts`, `src/components/public/service-card.tsx`, `src/components/public/product-card.tsx`, `src/components/public/service-pricing-display.tsx`, `src/app/(public)/products/**` (~3 files), `src/app/(public)/services/**` (~3 files), voice-agent services/products routes (~4 files), `src/lib/qbo/sync-catalog.ts`, `src/components/booking/step-service-select.tsx` |
| E. Orders | `src/app/api/checkout/*` (5 files), `src/app/api/admin/orders/*` (3 files), `src/app/api/account/orders/*` (2 files), `src/app/admin/orders/[id]/page.tsx`, `src/app/admin/orders/page.tsx`, `src/app/(public)/checkout/page.tsx`, `src/app/(public)/checkout/confirmation/page.tsx`, `src/app/(account)/account/orders/**` (2 files), `src/app/api/webhooks/stripe/route.ts`, `src/lib/utils/order-emails.ts`, `src/lib/utils/order-number.ts`, `src/components/public/cart-*` |
| F. Marketing | `src/lib/utils/coupon-helpers.ts`, `src/app/api/pos/coupons/validate/route.ts`, `src/app/api/book/validate-coupon/route.ts`, `src/app/api/pos/promotions/available/route.ts`, `src/app/api/checkout/create-payment-intent/route.ts`, `src/app/admin/marketing/coupons/**` (~4 files), `src/app/admin/marketing/campaigns/**` (~4 files), `src/app/api/admin/marketing/analytics/*` (~4 files) |
| G. Customer aggregate | `src/app/admin/customers/**` (~5 files), `src/app/api/admin/customers/*` (~5 files), `src/app/(account)/account/transactions/page.tsx`, lifecycle engine, campaigns, AI conversation summary, `src/app/api/cron/lifecycle-engine/route.ts`, `src/app/admin/migration/steps/customer-step.tsx` |
| H. Inventory | `src/app/admin/inventory/**` (~6 files), `src/app/api/admin/purchase-orders/*` (~3 files), `src/app/api/admin/stock-adjustments/route.ts`, `src/app/api/admin/inventory/counts/*` (~8 files, write side carries unit_cost) |

### Matrix (HIGH / MEDIUM / LOW)

Rows = family; columns = family. Diagonal omitted. Symmetric matrix shown lower-triangular.

|     | A   | B   | C   | D   | E   | F   | G   | H   |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A** | —   |     |     |     |     |     |     |     |
| **B** | **HIGH** | —   |     |     |     |     |     |     |
| **C** | **MED** | LOW | —   |     |     |     |     |     |
| **D** | **MED** | LOW | LOW | —   |     |     |     |     |
| **E** | LOW | LOW | LOW | LOW | —   |     |     |     |
| **F** | **MED** | LOW | LOW | LOW | **MED** | —   |     |     |
| **G** | **MED** | LOW | LOW | LOW | LOW | LOW | —   |     |
| **H** | LOW | LOW | LOW | **MED** | LOW | LOW | LOW | —   |

### Per-pair commentary on the non-LOW cells

- **A × B = HIGH.** Quote-to-transaction conversion lives in `src/app/api/pos/quotes/[id]/convert/route.ts` and `src/app/api/quotes/[id]/convert/route.ts`, which read quote columns and write transaction columns. Quote builder shares context with the ticket builder (`src/app/pos/context/quote-reducer.ts` ↔ `src/app/pos/context/ticket-reducer.ts` — sibling files with parallel logic). `src/lib/data/receipt-composer.ts` joins transactions to quotes for receipt context. **Cannot parallelize.** Strict order: A then B.
- **A × C = MEDIUM.** Two anchor files are shared: (i) `src/app/pos/jobs/components/job-detail.tsx` reads and writes both transaction completion state and appointment fields; (ii) `src/app/api/pos/jobs/[id]/complete/route.ts` does the same on the API side. Other appointments code is largely disjoint from transactions code. **Parallelization possible** if the two shared files are reserved to exactly one of the two phases (recommend: shared files belong to A's scope; C touches only its appointments-specific columns on those files).
- **A × D = MEDIUM.** Transactions read catalog prices at line-creation time via `src/lib/utils/compose-line-items.ts` and `src/lib/services/service-resolver.ts`. The pos/utils/pricing.ts helper bridges both. **Sequential preferred** — catalog migration in step 7 already trails transactions in step 3 by 4 positions. By the time D runs, A is settled.
- **A × F = MEDIUM.** Coupon helpers (`src/lib/utils/coupon-helpers.ts`) write discount_amount into both transactions (via `/api/pos/transactions/route.ts`) and orders (via `/api/checkout/create-payment-intent/route.ts`). Three caller endpoints share the helper. **Parallelizable with caveat**: coupon-helpers.ts is owned by F. A's scope only reads coupon-helper outputs (no direct edits). The validate endpoints get one-line conversion shims in A and remove them in F.
- **A × G = MEDIUM.** `customers.lifetime_spend` updates are emitted from transactions completion via SQL trigger or app-level write. The lifecycle engine reads lifetime_spend. **Sequential.** G migrates last; by step 8, A has been settled since step 3.
- **E × F = MEDIUM.** `/api/checkout/create-payment-intent/route.ts` is shared (uses coupon-helpers). F's scope owns the conversion shim removal here. **Sequential preferred** — F runs after E by two positions.
- **D × H = MEDIUM.** Both touch `products` (D writes prices, H reads cost_price). The cost_price column lives in products (Family D) but is consumed by inventory (Family H) purchase-order math. By the time D runs (step 7) H has already settled (step 1). **Order constraint: H before D.**

### The 4 HIGH-overlap pair: A×B (only one in the matrix)

Strict sequence with one specific code synchronization: when A migrates `transactions.discount_amount` to cents, the quote-to-transaction convert path must keep working even though `quotes.discount_amount` is still dollars at that moment. Strategy: A's scope adds a one-line `toCents(quote.discount_amount)` at the convert boundary (3 sites). B's scope removes those shims when quotes migrates. The shims are tagged `// TODO Unify-3 cleanup` so they're discoverable.

### MEDIUM cells: per-cell scope reservation

| Pair | Shared files (~) | Owner during overlap |
| --- | --- | --- |
| A × C | 2 files (`job-detail.tsx`, `/api/pos/jobs/[id]/complete/route.ts`) | A. C touches only appointments-only columns on these files. |
| A × D | 3 files (`compose-line-items.ts`, `service-resolver.ts`, `pos/utils/pricing.ts`) | A. D migrates the catalog-read sites later. |
| A × F | 1 file (`coupon-helpers.ts`, indirect via validate endpoints) | F. A uses shims that F removes. |
| A × G | 1 path (transactions-completion → customer-aggregate write) | G. A leaves a `// TODO Unify-G` at the aggregate-update site. |
| E × F | 1 file (`/api/checkout/create-payment-intent/route.ts`) | F. E touches only the orders-write sites. |
| D × H | 1 column (`products.cost_price`) | D. H reads `cost_price` and gets cents after step 7. By then H has migrated its own columns; H's `cost_price` reads need a follow-up tiny PR (~1 line per read site, ~3 sites). Track as `// TODO Unify-D` in H's commit. |

---

## Part 5 — Parallelization Plan

The order recommendation in Part 3 is the **critical path**. Parts 4 + 5 identify which families can be lifted out of the critical path and run alongside another family.

### Parallelization candidates (LOW-overlap pairs)

Cells in the matrix marked LOW are parallel-safe. The candidate pairs are:

- **E ∥ H** — LOW overlap. Orders and inventory share zero source files. Both have small blast radius (~30 + ~8 files). Both run in early sequence.
- **B ∥ E** — LOW overlap. Quotes and orders share zero source files (quotes operate on POS dollars; orders operate on e-commerce cents).
- **C ∥ E** — LOW overlap. Appointments and orders are completely disjoint (booking vs e-commerce).
- **D ∥ G** — LOW overlap. Catalog and customer-aggregate share zero files (catalog is write-side prices; G is read-side aggregate display).
- **F ∥ G** — LOW overlap. Marketing and customer-aggregate share zero files.

### Recommended parallel groupings

Combining the LOW-overlap candidates with the order constraints (A before C, A before B, H before D, A before G, A before F, E before F):

```
                 ┌──────────────┐
                 │  Unify-1     │   Helpers + lint rule (no DB)
                 │  (helpers)   │
                 └──────┬───────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-2  │                  │  Unify-3   │
    │ Family H │   ∥ parallel ∥   │  Family E  │
    │ Inventory│                  │  Orders    │
    └───┬──────┘                  └────┬───────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │  Unify-4   │     Family A — POS Transactions
                  │  Family A  │     (THE BIG ONE — solo phase)
                  └─────┬──────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───▼──────┐                  ┌────▼───────┐
    │ Unify-5  │                  │  Unify-6   │
    │ Family C │   ∥ parallel ∥   │  Family F  │
    │ Appoint. │                  │  Marketing │
    └───┬──────┘                  └────┬───────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │  Unify-7   │      Family B — Quotes
                  │  Family B  │      (depends on A only; could parallel with G but
                  └─────┬──────┘       Unify-8 is small enough that strict sequence
                        │              is preferable for risk isolation)
                        │
                  ┌─────▼──────┐
                  │  Unify-8   │      Family G — Customer aggregate
                  │  Family G  │      (small, last verification)
                  └─────┬──────┘
                        │
                  ┌─────▼──────┐
                  │  Unify-9   │      Family D — Catalog (largest read fan-out;
                  │  Family D  │       runs after every reader is cents-native)
                  └─────┬──────┘
                        │
                  ┌─────▼──────┐
                  │ Unify-Final│     Duplicate cleanup, lint upgrade, ADR
                  └────────────┘
```

### Critical-path length

| Approach | Phase count | Critical path (sequential) |
| --- | --- | --- |
| Strict-sequential (Unify-1 → 8 families → Unify-Final) | 10 | 10 phases |
| With recommended parallelization | 10 | **7 phases on the critical path** (Unify-1, Unify-2/3 pair, Unify-4, Unify-5/6 pair, Unify-7, Unify-8, Unify-9, Unify-Final = 8 phase-slots; if the user has bandwidth to run two sessions concurrently, calendar time compresses) |

**Calendar-time estimate (rough, dev-only, single-developer):**
- Sequential: 10 phases × 1 day median = ~10 calendar days minimum (some phases will be 2 days, others 0.5).
- Parallel: 8 phase-slots ≈ 8 calendar days, but the model is "user runs two CC sessions in different terminals simultaneously" — bandwidth-bound on the user, not on calendar.
- Realistic: the parallel pairs save 1-2 calendar days each, total ~3-4 days saved. Net: ~6-7 calendar days for the full epic at maximum parallelization with diligent reconciliation gates.

### Parallelization caveats

- **Parallel pairs must use different worktrees or strictly-disjoint branches.** Two CC sessions in the same repo will race on lockfiles, migrations folder, FILE_TREE.md updates. Spawning each parallel phase with `isolation: "worktree"` is the safest option.
- **Schema migrations cannot truly parallel-execute.** Two migrations land on the same dev DB; race on `npx supabase db push` or equivalent. The pair's schema migrations must be applied in a defined order (alphabetical timestamp), and the second session must NOT start its schema migration until the first completes. The application-code rewrites within each phase can parallelize freely.
- **FILE_TREE.md updates contend.** Per CLAUDE.md rule 13, any new files require a FILE_TREE.md update before commit. Two parallel sessions touching FILE_TREE.md create merge conflicts. Mitigation: scoped sections in FILE_TREE.md per family, or serialize FILE_TREE.md commits at the end.
- **Tests run on a shared dev DB.** If both parallel sessions are doing reconciliation checks against the same dev database while migrations are mid-flight, results are meaningless. Reconciliation queries must run AFTER both parallel migrations have applied.

### Recommendation

**Run sequential by default. Use the parallel pairs only when:**
1. You have meaningful idle time between sessions and want to compress calendar.
2. You're willing to manage two worktrees / two branches / staged migration application.
3. Both phases in the pair have been planned (plan-phase agent run) and their scopes have been verified disjoint by a human review of the touch sets.

The parallelization plan is an **option**, not a default. The single-developer reality is that running two CC sessions concurrently is mentally expensive even when the code work is parallel. Treat it as a reserve for the rare day you have bandwidth.

---

## Part 6 — Reconciliation Strategy

Each family migration must prove: (a) total money preserved (zero-cent drift across the schema swap), (b) per-row preservation (no row corrupted by the migration), (c) cross-table invariants preserved (sum of items = parent total, payments + refunds balance against transactions, etc.).

The reconciliation playbook below is what executors will run during each phase's verification step. Every query is read-only.

### Family A — POS Transactions

**Per-table preservation (run BEFORE migration, save output; run AFTER migration, compare exactly):**

```sql
-- Transactions: total dollars preserved
-- BEFORE
SELECT
  COUNT(*) as row_count,
  SUM(total_amount)::NUMERIC(18,2) as sum_total,
  SUM(subtotal)::NUMERIC(18,2) as sum_subtotal,
  SUM(tax_amount)::NUMERIC(18,2) as sum_tax,
  SUM(tip_amount)::NUMERIC(18,2) as sum_tip,
  SUM(discount_amount)::NUMERIC(18,2) as sum_discount,
  SUM(loyalty_discount)::NUMERIC(18,2) as sum_loyalty,
  SUM(deposit_credit)::NUMERIC(18,2) as sum_deposit_credit
FROM transactions;

-- AFTER (every value × 100 expected)
SELECT
  COUNT(*) as row_count,
  SUM(total_amount_cents)::BIGINT as sum_total_cents,
  SUM(subtotal_cents)::BIGINT as sum_subtotal_cents,
  SUM(tax_amount_cents)::BIGINT as sum_tax_cents,
  SUM(tip_amount_cents)::BIGINT as sum_tip_cents,
  SUM(discount_amount_cents)::BIGINT as sum_discount_cents,
  SUM(loyalty_discount_cents)::BIGINT as sum_loyalty_cents,
  SUM(deposit_credit_cents)::BIGINT as sum_deposit_credit_cents
FROM transactions;

-- Expected: AFTER == BEFORE * 100. Tolerance: 0 cents.
```

Repeat the same structure for `transaction_items`, `payments`, `refunds`, `refund_items`, `cash_drawers`.

**Cross-table invariants:**

```sql
-- Transaction totals match item sums (before AND after — invariant doesn't depend on unit)
SELECT
  t.id,
  t.total_amount_cents,
  SUM(ti.total_price_cents + ti.tax_amount_cents) as item_sum_cents,
  t.discount_amount_cents
FROM transactions t
JOIN transaction_items ti ON ti.transaction_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id
HAVING ABS(t.total_amount_cents - (SUM(ti.total_price_cents + ti.tax_amount_cents) - t.discount_amount_cents)) > 0;
-- Expected: 0 rows. Any row returned = bug.

-- Payments balance against transactions
SELECT
  t.id,
  t.total_amount_cents,
  COALESCE(SUM(p.amount_cents), 0) as paid_cents,
  COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.transaction_id = t.id), 0) as refunded_cents
FROM transactions t
LEFT JOIN payments p ON p.transaction_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id
HAVING COALESCE(SUM(p.amount_cents), 0) - COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.transaction_id = t.id), 0)
       != t.total_amount_cents
   AND t.status = 'completed';
-- Expected: 0 rows for status='completed' transactions.
```

**Integration-level reconciliation:**
- End-to-end: run a test sale through POS (cash + Stripe + split), verify receipt thermal output, verify receipt HTML output, verify the 19-scenario receipt fixture suite still passes (`src/lib/data/__tests__/receipt-composer.test.ts`).
- Reconcile against Stripe: compare `payments.amount_cents` for Stripe-paid transactions against the `charges.amount` field in the Stripe API for the same `stripe_charge_id`. Tolerance: 0 cents.
- QBO sync: run `/api/cron/qbo-sync` against a freshly-migrated transactions table; verify `Amount: 17.64` (dollars-decimal) still appears on QBO line items — the conversion happens in `src/lib/qbo/sync-transaction.ts:280,294` which must use `fromCents(unit_price_cents)`.

### Family B — Quotes

```sql
-- BEFORE
SELECT COUNT(*), SUM(subtotal), SUM(tax_amount), SUM(total_amount), SUM(mobile_surcharge) FROM quotes WHERE deleted_at IS NULL;
SELECT COUNT(*), SUM(unit_price), SUM(total_price), SUM(standard_price) FROM quote_items;

-- AFTER (multiply BEFORE values by 100)
SELECT COUNT(*), SUM(subtotal_cents), SUM(tax_amount_cents), SUM(total_amount_cents), SUM(mobile_surcharge_cents) FROM quotes WHERE deleted_at IS NULL;
SELECT COUNT(*), SUM(unit_price_cents), SUM(total_price_cents), SUM(standard_price_cents) FROM quote_items;
```

**Cross-table invariant:**
```sql
-- Quote totals match item sums (subtotal = sum(quote_items.total_price) + mobile_surcharge)
SELECT q.id, q.subtotal_cents,
  COALESCE(SUM(qi.total_price_cents), 0) + q.mobile_surcharge_cents as expected_subtotal_cents
FROM quotes q
LEFT JOIN quote_items qi ON qi.quote_id = q.id
WHERE q.deleted_at IS NULL
GROUP BY q.id, q.subtotal_cents, q.mobile_surcharge_cents
HAVING q.subtotal_cents != COALESCE(SUM(qi.total_price_cents), 0) + q.mobile_surcharge_cents;
-- Expected: 0 rows.
```

**Integration-level reconciliation:**
- End-to-end: build a quote via POS, send via SMS + email, accept via public quote page, convert to transaction, verify the converted transaction's totals match the quote's totals exactly.
- Quote PDF render: regenerate a sample quote PDF before and after, diff the rendered HTML.

### Family C — Appointments

```sql
-- BEFORE
SELECT COUNT(*),
  SUM(mobile_surcharge), SUM(subtotal), SUM(tax_amount), SUM(discount_amount),
  SUM(total_amount), SUM(cancellation_fee), SUM(deposit_amount), SUM(coupon_discount)
FROM appointments WHERE deleted_at IS NULL;

-- AFTER (× 100)
SELECT COUNT(*),
  SUM(mobile_surcharge_cents), SUM(subtotal_cents), SUM(tax_amount_cents), SUM(discount_amount_cents),
  SUM(total_amount_cents), SUM(cancellation_fee_cents), SUM(deposit_amount_cents), SUM(coupon_discount_cents)
FROM appointments WHERE deleted_at IS NULL;

-- Mobile zone surcharges
SELECT COUNT(*), SUM(surcharge) FROM mobile_zones;
SELECT COUNT(*), SUM(surcharge_cents) FROM mobile_zones;

-- Job addons
SELECT COUNT(*), SUM(price), SUM(discount_amount) FROM job_addons;
SELECT COUNT(*), SUM(price_cents), SUM(discount_amount_cents) FROM job_addons;
```

**Cross-table invariant:**
```sql
-- Appointment subtotal = sum(appointment_services.price_at_booking) + mobile_surcharge
SELECT a.id, a.subtotal_cents,
  COALESCE(SUM(asvc.price_at_booking_cents), 0) + a.mobile_surcharge_cents as expected_subtotal_cents
FROM appointments a
LEFT JOIN appointment_services asvc ON asvc.appointment_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id, a.subtotal_cents, a.mobile_surcharge_cents
HAVING a.subtotal_cents != COALESCE(SUM(asvc.price_at_booking_cents), 0) + a.mobile_surcharge_cents;
-- Expected: 0 rows.
```

**Special: business_settings JSONB anchor**
```sql
-- BEFORE: deposit_amount is a JSON number representing dollars
SELECT value FROM business_settings WHERE key = 'default_deposit_amount';
-- e.g. "50"

-- AFTER: rename key to default_deposit_amount_cents, value × 100
SELECT value FROM business_settings WHERE key = 'default_deposit_amount_cents';
-- e.g. "5000"
```

**Integration-level reconciliation:**
- End-to-end booking flow: book an appointment via public booking page, confirm deposit amount displayed matches business_settings, complete payment intent, verify appointment record total + deposit_amount columns.
- Pay-link send: trigger a payment link from POS for an appointment with mixed cents/dollars (legacy state), verify the link arrives with correct amount.
- Mobile-service edit: edit a mobile fee on a live appointment, verify totals recompute correctly.

### Family D — Catalog

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

-- AFTER (× 100 with _cents suffix)
-- (mirror queries)
```

**Cross-table invariant — sale_price discipline:**
```sql
-- sale_price must remain less than the base price after migration
-- CHECK constraints will enforce this but explicit verification:
SELECT id FROM services WHERE sale_price_cents >= flat_price_cents;  -- expect 0
SELECT id FROM products WHERE sale_price_cents >= retail_price_cents;  -- expect 0
```

**Integration-level reconciliation:**
- AI content writer: regenerate sample copy for a service detail page; verify prices in copy match storage exactly.
- Square catalog sync: re-run `scripts/import-square-transactions.mjs` against a sample line; verify cents-on-the-wire ↔ cents-in-storage.
- QBO sync: verify `src/lib/qbo/sync-catalog.ts` writes `Amount` in dollars (decimal) via `fromCents()`.
- POS pricing picker: navigate every service in POS, verify displayed price matches `services.flat_price_cents → formatMoney`.

### Family E — Orders

**Rename-only family, mostly. The single type-change is `handling_fee_amount`:**

```sql
-- BEFORE rename
SELECT COUNT(*), SUM(subtotal), SUM(discount_amount), SUM(tax_amount), SUM(shipping_amount), SUM(total) FROM orders;
SELECT COUNT(*), SUM(unit_price), SUM(line_total), SUM(discount_amount) FROM order_items;
SELECT flat_rate_amount, handling_fee_amount FROM shipping_settings;

-- AFTER rename (same values, new names; handling_fee_amount migrates to handling_fee_amount_cents)
SELECT COUNT(*), SUM(subtotal_cents), SUM(discount_amount_cents), SUM(tax_amount_cents), SUM(shipping_amount_cents), SUM(total_cents) FROM orders;
-- Expect identical to BEFORE values (already cents, just renamed).
SELECT flat_rate_amount_cents, handling_fee_amount_cents FROM shipping_settings;
-- Expect: flat_rate_amount_cents identical to BEFORE flat_rate_amount; handling_fee_amount_cents == BEFORE handling_fee_amount * 100
```

**Cross-table invariant:**
```sql
-- Order total = subtotal + tax + shipping - discount
SELECT o.id, o.total_cents,
  (o.subtotal_cents + o.tax_amount_cents + o.shipping_amount_cents - o.discount_amount_cents) as expected
FROM orders o
WHERE o.total_cents != (o.subtotal_cents + o.tax_amount_cents + o.shipping_amount_cents - o.discount_amount_cents);
-- Expected: 0 rows.

-- Order item line_total = unit_price * quantity - discount
SELECT oi.id, oi.line_total_cents, oi.unit_price_cents * oi.quantity - oi.discount_amount_cents as expected
FROM order_items oi
WHERE oi.line_total_cents != oi.unit_price_cents * oi.quantity - oi.discount_amount_cents;
-- Expected: 0 rows.
```

**Integration-level reconciliation:**
- Full checkout flow: add a product to cart, apply a coupon, ship to a CA address, complete Stripe payment, verify confirmation page totals, verify order confirmation email totals, verify Stripe charge amount equals `orders.total_cents`.
- Stripe webhook: replay a known payment_intent.succeeded webhook against the migrated schema; verify the order row is marked paid with correct amount.

### Family F — Marketing

```sql
-- Coupons
-- BEFORE
SELECT COUNT(*), SUM(min_purchase) FROM coupons;
SELECT cr.id, cr.discount_type, cr.discount_value, cr.max_discount FROM coupon_rewards;

-- The migration script for coupon_rewards MUST be discount_type-aware:
-- UPDATE coupon_rewards SET discount_value_cents = ROUND(discount_value * 100)::INTEGER
--   WHERE discount_type = 'fixed_amount';
-- UPDATE coupon_rewards SET discount_value_cents = discount_value::INTEGER
--   WHERE discount_type = 'percentage';  -- preserves percentage points (10 stays 10)
-- (Or split discount_value into discount_amount_cents + discount_percentage_bps to remove the unit ambiguity entirely)

-- AFTER
SELECT COUNT(*), SUM(min_purchase_cents) FROM coupons;
SELECT cr.id, cr.discount_type, cr.discount_value_cents, cr.max_discount_cents FROM coupon_rewards;
```

**Percentage-row preservation:**
```sql
-- Specifically verify that percentage rows did NOT get × 100
SELECT id, discount_type, discount_value_cents
FROM coupon_rewards
WHERE discount_type = 'percentage' AND discount_value_cents > 100;
-- Investigate any rows >100 (a 100%+ off coupon is unusual; would expect cap at 100).
```

**Integration-level reconciliation:**
- Apply a $10-off fixed coupon at booking and at checkout; verify discount line equals 1000 cents.
- Apply a 10 %-off percentage coupon; verify discount = 10 % of subtotal_cents.
- Verify the marketing analytics revenue-attributed sum.

### Family G — Customer Aggregate

```sql
-- BEFORE
SELECT COUNT(*), SUM(lifetime_spend) FROM customers WHERE deleted_at IS NULL;

-- AFTER
SELECT COUNT(*), SUM(lifetime_spend_cents) FROM customers WHERE deleted_at IS NULL;

-- AFTER × 100 should equal BEFORE.
```

**Cross-table reconciliation:**
```sql
-- Aggregate must match transactions sum for each customer
SELECT c.id, c.lifetime_spend_cents,
  COALESCE(SUM(t.total_amount_cents), 0) as actual_sum_cents
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id AND t.status = 'completed'
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.lifetime_spend_cents
HAVING ABS(c.lifetime_spend_cents - COALESCE(SUM(t.total_amount_cents), 0)) > 0;
-- Investigate any rows returned. (Refunds may legitimately cause drift if aggregation doesn't subtract them — verify the aggregation rule first.)
```

**Integration-level reconciliation:**
- Complete a test sale for a known customer; verify `customers.lifetime_spend_cents` increments by `transactions.total_amount_cents`.
- Run the lifecycle engine; verify campaign-eligibility decisions consistent before/after migration.

### Family H — Inventory

```sql
-- BEFORE
SELECT COUNT(*), SUM(unit_cost), SUM(unit_cost * quantity) as cogs FROM purchase_order_items;
SELECT COUNT(*), SUM(unit_cost), SUM(unit_cost * quantity_change) FROM stock_adjustments;
SELECT COUNT(*), SUM(min_order_amount) FROM vendors;

-- AFTER (× 100)
SELECT COUNT(*), SUM(unit_cost_cents), SUM(unit_cost_cents * quantity) FROM purchase_order_items;
SELECT COUNT(*), SUM(unit_cost_cents), SUM(unit_cost_cents * quantity_change) FROM stock_adjustments;
SELECT COUNT(*), SUM(min_order_amount_cents) FROM vendors;
```

**Cross-table invariant:**
```sql
-- Purchase order total = sum(items.unit_cost * quantity)
SELECT po.id, po.total_cents, COALESCE(SUM(poi.unit_cost_cents * poi.quantity), 0) as expected
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
GROUP BY po.id, po.total_cents
HAVING po.total_cents != COALESCE(SUM(poi.unit_cost_cents * poi.quantity), 0);
-- (note: purchase_orders may have its own total column — verify against DB_SCHEMA before this query)
```

**Integration-level reconciliation:**
- Create a test purchase order with 3 line items, receive it, verify inventory counts and unit_cost roll up correctly.
- Run a stock-adjustment cycle (inventory count → commit → revert), verify costs preserve cent-exact.

---

## Part 7 — Rollback Plan

Every family migration must be revertible. The rollback procedure has three components: (a) DB DOWN steps that recreate dollar columns, (b) git commit-boundary identification for code rollback, (c) verification gates that must pass before considering the family "settled" and removing the rollback safety net.

### General rollback pattern

Each family's schema migration follows a 3-step pattern in a single SQL file:

```sql
-- Step 1: Add new _cents columns (NULL allowed initially)
ALTER TABLE transactions ADD COLUMN total_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN subtotal_cents INTEGER;
-- ... etc

-- Step 2: Backfill (× 100 with ROUND to int)
UPDATE transactions SET
  total_amount_cents = ROUND(total_amount * 100)::INTEGER,
  subtotal_cents = ROUND(subtotal * 100)::INTEGER;
-- ... etc

-- Step 3: Add NOT NULL + CHECK + drop old columns (LAST — after code is verified)
ALTER TABLE transactions ALTER COLUMN total_amount_cents SET NOT NULL;
ALTER TABLE transactions ADD CONSTRAINT total_amount_cents_check CHECK (total_amount_cents >= 0);
-- ... etc
ALTER TABLE transactions DROP COLUMN total_amount;
-- ... etc
```

**Critical: do NOT drop old columns in the same migration as backfill.** Two-phase commit:
- **Migration 1** (within phase): add new columns, backfill, leave old columns intact, deploy code that **reads from new and writes to both**. Run reconciliation. Verify zero drift over the dev usage window.
- **Migration 2** (a follow-up, may be its own micro-phase or appended to the next family's plan): drop old columns. Code stops writing to old columns. This step is the "settled" gate.

This two-phase approach makes rollback trivial: until Migration 2 ships, the old columns are still populated, and reverting is `revert code commit` + skip Migration 2.

### Per-family rollback procedures

#### Family A — POS Transactions rollback

- **Migration 1 file:** `supabase/migrations/<timestamp>_migrate_pos_transactions_to_cents.sql`
- **Migration 2 file:** `supabase/migrations/<timestamp>_drop_pos_transactions_dollar_columns.sql` (lands later in Unify-Final after every family is settled)
- **Commit boundary:** `feat(money): migrate POS Transactions family to integer cents (Phase Money-Unify-4)`
- **Rollback procedure:**
  1. `git revert <commit-hash>` — reverts the code changes
  2. Re-run dev DB against the pre-migration schema state by manually executing the inverse: `UPDATE transactions SET total_amount = total_amount_cents / 100.0` for each column, then drop the `_cents` columns
  3. Run reconciliation queries to confirm dollar columns restored to pre-migration values
- **Dev verification gates before considering settled:**
  1. Reconciliation queries return zero drift
  2. Receipt fixture suite passes (`npm test -- receipt-composer`)
  3. POS end-to-end: cash sale, Stripe sale, split sale, refund, void — all produce correct receipts
  4. QBO sync round-trip on a sample transaction
  5. 1 week of dev usage with no money-related bugs filed

#### Family B — Quotes rollback

- **Migration file:** `<timestamp>_migrate_quotes_to_cents.sql`
- **Commit boundary:** `feat(money): migrate Quotes family to integer cents (Phase Money-Unify-7)`
- **Rollback procedure:** Same 3-step pattern as A. Special: quote-to-transaction convert paths have shims from Unify-A; reverting B re-introduces them; that's fine.
- **Dev gates:** Quote builder end-to-end, quote send (SMS+email), quote accept, quote convert.

#### Family C — Appointments rollback

- **Migration file:** `<timestamp>_migrate_appointments_to_cents.sql`
- **Migration 2 (companion):** `<timestamp>_rename_payment_link_amount_cents_to_amount_cents.sql` — the existing cents column gets renamed to align with sibling naming (`payment_link_amount_cents` is already correctly suffixed; this micro-step is optional polishing).
- **business_settings JSONB:** the migration also includes:
  ```sql
  UPDATE business_settings
  SET value = (CAST(value AS NUMERIC) * 100)::TEXT, key = 'default_deposit_amount_cents'
  WHERE key = 'default_deposit_amount';
  ```
- **Commit boundary:** `feat(money): migrate Appointments family to integer cents (Phase Money-Unify-5)`
- **Rollback:** reverse the business_settings key + value; reverse the column type changes.
- **Dev gates:** booking flow, pay-link send, mobile-fee edit, deposit credit on POS checkout.

#### Family D — Catalog rollback

- **Migration file:** `<timestamp>_migrate_catalog_to_cents.sql`
- **Commit boundary:** `feat(money): migrate Catalog family to integer cents (Phase Money-Unify-9)`
- **Rollback:** standard 3-step inverse. Sale-price CHECK constraints (`chk_service_sale_price`, `chk_product_sale_price`, `services_sale_price_non_negative`) re-create against new column names.
- **Dev gates:** AI service writer round-trip, Square import round-trip, POS pricing picker, public service/product pages, booking step-service-select, voice-agent product/service responses.

#### Family E — Orders rollback

- **Migration file:** `<timestamp>_rename_orders_money_columns.sql` (rename-heavy)
- **Commit boundary:** `feat(money): canonicalize Orders family naming + handling-fee migration (Phase Money-Unify-3)`
- **Rollback:** rename columns back. The handling_fee_amount migration follows the standard add/backfill/drop pattern.
- **Dev gates:** checkout flow end-to-end, Stripe webhook replay, order email render, admin orders detail.

#### Family F — Marketing rollback

- **Migration file:** `<timestamp>_migrate_coupons_campaigns_to_cents.sql`
- **Critical care:** the `coupon_rewards.discount_value` migration is **discount_type-aware** (see Part 6, Family F). If rolling back, the inverse is also discount_type-aware.
- **Commit boundary:** `feat(money): migrate Marketing family to integer cents (Phase Money-Unify-6)`
- **Dev gates:** apply fixed coupon at POS, apply fixed coupon at e-commerce checkout, apply percentage coupon at both, marketing analytics revenue card sanity check.

#### Family G — Customer aggregate rollback

- **Migration file:** `<timestamp>_migrate_customer_lifetime_spend_to_cents.sql`
- **Commit boundary:** `feat(money): migrate customer.lifetime_spend to cents (Phase Money-Unify-8)`
- **Dev gates:** complete a sale, verify lifetime_spend_cents updates correctly; run lifecycle-engine cron, verify decisions match pre-migration.

#### Family H — Inventory rollback

- **Migration file:** `<timestamp>_migrate_inventory_costs_to_cents.sql`
- **Commit boundary:** `feat(money): migrate Inventory family to integer cents (Phase Money-Unify-2)`
- **Dev gates:** create test purchase order, receive it, run inventory count, verify cost rollup.

### Dev-only constraint reminder

Per LOCKED-3 (CRITICAL CONSTRAINTS section of the session prompt): **NO production deploy until the full epic is verified end-to-end at the end of Unify-Final**.

The two-phase commit (add cents columns, drop dollar columns separately) is consistent with this: even mid-epic, the dev environment carries both columns until Unify-Final's cleanup. Production-deploy isn't on the critical path of any single family.

### Atomic-commit boundaries (summary)

Every family migration produces exactly one git commit (per the conventional-commits + per-phase-commit pattern established in recent phases). The commit message format:

```
feat(money): migrate <Family Name> family to integer cents (Phase Money-Unify-<N>)

- Schema: <N> columns NUMERIC(10,2) → INTEGER cents
- Backfill: ROUND(col * 100) for each column
- Code: <N> source files rewritten, <M> Pattern-A callers → Pattern-C
- Tests: <reconciliation queries pass, fixture suite passes, etc.>
- Dev only — production deferred until Unify-Final
```

This pattern makes `git revert <hash>` the unambiguous rollback path for the code side. The DB side requires manual inverse application (the migration file's DOWN steps).

---

## Part 8 — Test Surface

Each family has an existing test surface, identified gaps, and new tests required. The 19-scenario receipt fixture suite from ADR-0004 is the cross-family safety net — every transactional family must regenerate the appropriate fixtures.

### Family A — POS Transactions

**Existing tests:**
- `src/lib/utils/__tests__/refund-math.test.ts` (271 lines, Session 36 — covers `toCents`, `fromCents`, `computePerUnitRefundableCents`, `computeRefundLineAmountCents`, `computeTotalRefundCents`, `distributeResidualCents`; fractional cents; multi-line residuals)
- `src/lib/data/__tests__/receipt-composer.test.ts` + 19-scenario fixture suite (38 baseline files: 19 HTML + 19 thermal at `src/lib/data/__tests__/__fixtures__/receipt-baselines/`)
- `src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts` (e-commerce refunds, but the helper math is shared)
- `src/app/api/pos/transactions/__tests__/auto-receipt-interlock.test.ts`
- `src/app/api/pos/transactions/[id]/__tests__/void.test.ts`
- `src/app/pos/components/transactions/__tests__/transaction-detail-void.test.tsx`
- `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts`
- `src/lib/utils/__tests__/validation-refund-shopuse.test.ts`
- `src/app/pos/utils/__tests__/pricing.test.ts`

**Gaps:**
- No tests for `cash_drawers` end-of-day math (open/close, variance, deposit calculation)
- No tests for transaction-completion → customer.lifetime_spend update
- No tests for `payments.tip_amount` vs `payments.tip_net` reconciliation
- No tests for QBO sync money conversion (`src/lib/qbo/sync-transaction.ts`)

**New tests required for Unify-4:**
- Add test: end-of-day variance computation in cents
- Add test: QBO sync-transaction unit conversion (`fromCents()` boundary)
- Add test: payment + refund balance invariant
- Regenerate all 38 receipt fixtures (HTML + thermal) — values will be byte-identical, but the regeneration validates that `formatMoney(cents)` produces the same output as `formatCurrency(dollars)`.

### Family B — Quotes

**Existing tests:**
- `src/app/pos/components/quotes/__tests__/quote-send-dialog.test.tsx`
- `src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx`
- `src/lib/quotes/__tests__/send-service.test.ts`

**Gaps:**
- No tests for quote → transaction conversion (the convert path)
- No tests for quote totals computation from items
- No tests for quote PDF rendering (HTML diff against fixture)

**New tests required for Unify-7:**
- Add test: quote convert preserves totals exactly through unit transition
- Add test: quote totals from items (subtotal = sum(item.total_price) + mobile_surcharge)
- Snapshot test: quote PDF rendering against a baseline fixture

### Family C — Appointments

**Existing tests:**
- `src/lib/utils/__tests__/mobile-service-edit.test.ts`
- `src/lib/utils/__tests__/validation-mobile-address.test.ts`
- `src/lib/utils/__tests__/resolve-mobile-fields.test.ts`
- `src/components/jobs/__tests__/edit-mobile-modal.test.tsx`

**Gaps:**
- No tests for booking-flow money math (deposit + subtotal + tax + surcharge total)
- No tests for `appointments.deposit_amount` ↔ `business_settings.default_deposit_amount` synchronization
- No tests for pay-link amount validation against appointment.total_amount

**New tests required for Unify-5:**
- Add test: booking-flow money round-trip (form input → API → DB → display)
- Add test: business_settings deposit JSON value reads correctly post-migration
- Add test: pay-link amount validates against appointment.total_amount in cents
- Snapshot test: appointment-detail-dialog rendered totals

### Family D — Catalog

**Existing tests:**
- `src/app/api/admin/products/__tests__/` (variants test)
- `src/app/admin/catalog/products/components/__tests__/` (quick-edit-drawer)
- `src/app/admin/catalog/products/[id]/__tests__/`

**Gaps:**
- No tests for `service_pricing` vehicle-size price resolution
- No tests for Square catalog import (cents → cents round-trip)
- No tests for sale-price discipline (`chk_*_sale_price` CHECK behavior)

**New tests required for Unify-9:**
- Add test: vehicle-size pricing resolver returns cents
- Add test: sale_price CHECK rejects rows where sale_price_cents >= price_cents
- Add test: AI content writer reads cents and renders dollars correctly
- Regenerate POS pricing picker snapshots
- Regenerate public service/product page snapshots

### Family E — Orders

**Existing tests:**
- `src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts`
- `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts`

**Gaps:**
- No tests for checkout total computation
- No tests for shipping-rate application
- No tests for order email rendering

**New tests required for Unify-3:**
- Add test: checkout total = subtotal_cents + tax_cents + shipping_cents - discount_cents
- Add test: order email renders amounts via `formatMoney(cents)`
- Add test: Stripe webhook order-update flow

### Family F — Marketing

**Existing tests:**
- `src/lib/utils/__tests__/compose-line-items.test.ts` (covers coupon application in line items)

**Gaps:**
- No tests for `coupon-helpers.ts` `calculateCouponDiscount`
- No tests for percentage-vs-fixed coupon discrimination
- No tests for campaign revenue_attributed aggregation

**New tests required for Unify-6:**
- Add test: `calculateCouponDiscount` for fixed coupon returns cents
- Add test: `calculateCouponDiscount` for percentage coupon returns cents (subtotal × pct / 100)
- Add test: percentage coupon never touched by ×100 in migration
- Add test: max_discount_cents cap applied correctly
- Add test: campaign revenue_attributed sums match attribution events

### Family G — Customer Aggregate

**Existing tests:**
- None directly. `src/app/api/pos/jobs/[id]/complete/__tests__/job-complete-vehicle-literal.test.ts` exercises completion but not the aggregate update.

**Gaps:**
- No tests for `lifetime_spend` update on transaction completion
- No tests for lifecycle-engine campaign-eligibility decisions
- No tests for purge/restore flow's lifetime_spend recomputation

**New tests required for Unify-8:**
- Add test: completing a sale increments customers.lifetime_spend_cents by transaction.total_amount_cents
- Add test: refund decrements lifetime_spend_cents
- Add test: lifecycle-engine eligibility decision is stable across the migration

### Family H — Inventory

**Existing tests:**
- `src/lib/utils/__tests__/stock-adjustments.test.ts`
- `src/app/api/admin/inventory/counts/__tests__/commit.test.ts`
- `src/app/api/admin/inventory/counts/__tests__/revert.test.ts`
- `src/app/api/admin/inventory/counts/__tests__/revert-preview.test.ts`
- `src/app/admin/inventory/counts/__tests__/revert-flow.test.tsx`

**Gaps:**
- No tests for purchase-order receive → cost rollup
- No tests for vendor min_order_amount validation

**New tests required for Unify-2:**
- Add test: purchase order receive applies cents-typed costs
- Add test: stock adjustment commits with cents-typed unit_cost
- Add test: vendor min_order_amount validation against order subtotal_cents

### Cross-family fixtures (regeneration)

| Fixture set | Family | Regeneration trigger |
| --- | --- | --- |
| `__fixtures__/receipt-baselines/*` (38 files, 19 scenarios × 2 formats) | A primarily; touches B, C, F, G | Unify-4 (Family A) regenerates all 38. Should be byte-identical to pre-migration. Any diff = bug. |
| Quote-PDF baseline (new) | B | Created in Unify-7 |
| Appointment-detail snapshot (new) | C | Created in Unify-5 |
| Service/product page snapshots (new) | D | Created in Unify-9 |
| Order confirmation email baseline (new) | E | Created in Unify-3 |

---

## Decisions Required

Four decisions need user sign-off before Unify-1 starts. These are the inputs to the lint rule, helper API, and every subsequent phase prompt.

### Decision A — `formatCurrency()` signature

**Recommendation: Add a new `formatMoney(cents: number)` and migrate to it gradually. Keep the legacy `formatCurrency(dollars: number)` working through the migration; delete it in Unify-Final.**

Tradeoffs:

- **Option 1 — Migrate `formatCurrency` in-place to accept cents.**
  - Pros: same name everywhere, no transition vocabulary needed.
  - Cons: 437 Pattern-A call sites and 55 Pattern-B call sites must ALL flip on a single moment (or accept temporary visual bugs where dollar values render 100× too large or 100× too small). The migration must land atomically in one massive commit — incompatible with the per-family pattern that's the spine of this playbook.
- **Option 2 — Add `formatMoney(cents)` and migrate gradually. (recommended)**
  - Pros: per-family rewrites flip call sites one family at a time. Old `formatCurrency(dollars)` keeps working for not-yet-migrated families. Unify-Final renames `formatMoney → formatCurrency` and deletes the dollars one.
  - Cons: two formatter names exist for the duration of the epic. Lint rule flagging Pattern-A on cents-typed sources is the discipline that prevents regressions.
- **Option 3 — Add a TS branded type (`type Cents = number & { __brand: 'Cents' }`).**
  - Pros: structural type-checking. Misuse fails at compile time.
  - Cons: every Postgres read becomes wrapper-ceremony (`asCents(row.total_amount_cents)`). High churn for marginal additional safety beyond the suffix-naming convention.

**Recommendation: Option 2.** Lower transition cost; reversible; tractable lint.

### Decision B — Helper API surface

**Recommendation: Rename `src/lib/utils/refund-math.ts` to `src/lib/utils/money.ts`. Expand the export surface.**

Current `refund-math.ts` exports: `toCents`, `fromCents`, `computePerUnitRefundableCents`, `computeRefundLineAmountCents`, `computeTotalRefundCents`, `distributeResidualCents`.

Proposed `money.ts` exports after Unify-1:

- **Conversion (already exist; promoted to canonical):**
  - `toCents(dollars: number): number` — `Math.round(dollars * 100)` — for boundary intake only (QBO read, legacy NUMERIC reads during transition)
  - `fromCents(cents: number): number` — `cents / 100` — for boundary output only (QBO write, Shippo, external APIs requiring decimal)
- **Refund-specific math (unchanged):**
  - `computePerUnitRefundableCents`, `computeRefundLineAmountCents`, `computeTotalRefundCents`, `distributeResidualCents` — moved verbatim
- **New utilities (added if-and-only-if a real consumer needs them; pulled in by family-migrations as they surface):**
  - `sumCents(cents: number[]): number` — array sum, with overflow assertion in dev. Replaces ad-hoc reduce(0+) patterns.
  - `clampCents(value: number, min?: number, max?: number): number` — for amount bounds (e.g., refund cap = original payment amount).
  - `applyPercentageBps(cents: number, bps: number): number` — basis-points percentage application, single rounding. Used by coupon-helpers + tax computation. (Coupon percentage stored as integer percent; convert to bps at read time, OR store bps natively in a Marketing follow-up.)
  - `splitProportionalCents(total: number, weights: number[]): number[]` — proportional split with residual distribution, generalizing `distributeResidualCents`. Used by coupon proportional discount across items, refund line shares, etc.

**Do NOT add:** `addCents`, `subCents`, `mulCents`, `divCents`. JS native integer math (`+`, `-`, `*`) is exact for cents under 2^53. Wrapping these adds noise.

**Do NOT add:** a tax-rate helper in money.ts. Tax math is business-logic (`pos/utils/tax.ts`); money.ts stays narrow.

**`formatMoney(cents)` does NOT live in money.ts.** It lives in `format.ts` alongside the other formatters (`formatPhone`, `formatDate`). Separation of concerns: money.ts = arithmetic; format.ts = presentation.

### Decision C — Naming convention

**Recommendation: enforce `_cents` suffix on every money column AND every money-bearing identifier in code.**

- **Columns:** every money column ends in `_cents`. The migration renames existing INTEGER cents columns that don't already end in `_cents` (`orders.subtotal` → `orders.subtotal_cents`, etc.). The new dollar-to-cents migrations create columns with the `_cents` suffix from the start.
- **Variables (camelCase):** money-bearing variables end in `Cents` when they carry cents. Already a 129-identifier convention. The migration applies it to remaining money-suggestive variable names (`amountDue` → `amountDueCents`, `subtotal` → `subtotalCents`).
- **Variables (snake_case, API JSON):** API request/response field names are `*_cents` when they carry cents. Existing API JSON that uses `total_amount` (dollars) gets renamed to `total_amount_cents` in the same phase as the DB column.
- **Legacy `*Dollars` identifiers (14 existing names):** survive as the explicit boundary marker. They stay because they're (i) loud about their unit, (ii) only used at narrow display boundaries, (iii) wholesale rename would be cosmetic churn.
- **Lint rule (added in Unify-1, severity `'warn'`; upgraded to `'error'` in Unify-Final):**
  - Rule name: `money/no-unsuffixed-money-prop`
  - Triggers: assignment from a `*_cents` column / `Cents` variable / `formatMoney(...)` source to an identifier that doesn't end in `Cents`. (Or the inverse: passing a non-`Cents` value to `formatMoney`.)
  - Skip patterns (proven necessary by the analogous phone-lint experience):
    - Test files (`**/*.test.ts*`, `**/__tests__/**`)
    - `_dollars` / `Dollars` suffix at boundary (still unit-bearing, just opposite)
    - Component prop pass-through where the prop name is set externally (e.g., recharts data props)
    - JSX expression where unit is asserted in the component contract (`value` prop of a labeled `<MoneyField label="Refund cap" value={refundCapCents} />`)

### Decision D — External boundary policy

**Recommendation:**

| Boundary | Direction | Wire format | Conversion site |
| --- | --- | --- | --- |
| Stripe — payment intent create | out | cents (integer) | Already cents; native pass-through after Unify-4 (transactions ≡ cents). |
| Stripe — webhook (charge.succeeded, etc.) | in | cents (integer) | Already cents; native pass-through. |
| Stripe — refund create | out | cents | Already cents (`refund-math.ts` pipeline). |
| Square Catalog API — read | in | cents (`price_money.amount`) | Native cents intake; no conversion. |
| QuickBooks Online — invoice/journal create | out | decimal dollars (`Amount: 17.64`) | `fromCents()` at the boundary in `src/lib/qbo/sync-transaction.ts`, `sync-catalog.ts`. |
| QuickBooks Online — read | in | decimal dollars | `toCents()` at the boundary in any read path (currently no QBO read path stores money locally). |
| Shippo — rate request | in | decimal string (`"19.95"`) | Parse to cents at intake via `toCents(Number(rate.amount))`. |
| Mailgun / email render | out | formatted string | `formatMoney(cents)` — no unit on the wire, just text. |
| Twilio / SMS render | out | formatted string | `formatMoney(cents)` via SMS template engine. |
| Receipt PDF / HTML | out | formatted string | `formatMoney(cents)` everywhere. |
| Public quote/order/receipt pages (server-rendered) | out | formatted string | `formatMoney(cents)`. |
| Form inputs (price entry, refund entry) | in | dollar string from user | Caller parses + `toCents()` once at submit time. Display value uses `*Dollars` variable convention. |

**Special:** the controlled-input value coercion in `quick-edit-drawer.tsx:44-47` is the right pattern for editable dollar fields:
- Display: dollars (`formatPrice(cost_price_cents / 100)` — or a helper that does this in one call).
- Submit: `toCents(parseFloat(input))`.
- Storage: cents.

A new helper, `formatMoneyForInput(cents): string` (returns `"17.64"`, no `$`, no commas), is a candidate addition to format.ts during Unify-1 to encapsulate this pattern.

---

## Phase Sequence Summary

Master sequence with parallelization annotations.

### Unify-1 — Helpers + Lint (no DB, no callers)

- **Dependencies:** none (this is the foundation)
- **Parallelizable with:** nothing (foundational; all subsequent phases depend on its output)
- **Scope:**
  - Rename `src/lib/utils/refund-math.ts` → `src/lib/utils/money.ts`
  - Re-export from old path with `// @deprecated` comment (so existing imports don't break — they migrate to new path in their own family's phase)
  - Add `formatMoney(cents: number)` to `src/lib/utils/format.ts`
  - Add `formatMoneyForInput(cents: number)` to `src/lib/utils/format.ts` (returns dollars-decimal string for `<input>` value)
  - Add `sumCents`, `clampCents`, `applyPercentageBps`, `splitProportionalCents` to money.ts
  - Add ESLint rule `money/no-unsuffixed-money-prop` at severity `'warn'` (no breakage; just visibility)
  - Add `docs/dev/MONEY.md` documenting all conventions, helper API, lint rule, opt-out patterns — mirroring the structure of `docs/dev/PHONE_LINT.md`
  - Add CLAUDE.md rule referencing MONEY.md and the lint rule (following the phone-lint precedent)
- **LOCKED decisions in prompt:**
  - LOCKED: helper module name is `money.ts`
  - LOCKED: lint rule severity is `'warn'` (upgraded to `'error'` in Unify-Final)
  - LOCKED: `formatMoney(cents)` is the new canonical formatter; `formatCurrency(dollars)` survives the migration
  - LOCKED: do not migrate any callers yet — that happens in the family phases
- **Reconciliation queries:** N/A (no DB changes)
- **Rollback procedure:** `git revert` the single commit
- **Test surface:**
  - Add `src/lib/utils/__tests__/money.test.ts` covering new helpers (`sumCents`, `clampCents`, `applyPercentageBps`, `splitProportionalCents`)
  - Add `src/lib/utils/__tests__/format-money.test.ts` covering `formatMoney`, `formatMoneyForInput`
  - Ensure existing refund-math tests still pass after rename + re-export

### Unify-2 — Family H: Inventory

- **Dependencies:** Unify-1
- **Parallelizable with:** Unify-3 (Family E) — see Part 5
- **Scope:** 3 columns (`purchase_order_items.unit_cost`, `stock_adjustments.unit_cost`, `vendors.min_order_amount`) + ~8 caller files (admin inventory pages + 3 API routes)
- **LOCKED decisions in prompt:**
  - LOCKED: convert NUMERIC(10,2) → INTEGER cents via two-phase add/backfill (drop deferred to Unify-Final)
  - LOCKED: rename columns to `*_cents`
  - LOCKED: rewrite all caller display sites to `formatMoney(cents)`
  - LOCKED: read sites of `products.cost_price` (Family D) leave a `// TODO Unify-D` shim using `toCents(cost_price)` (3 sites)
- **Reconciliation queries:** see Part 6, Family H
- **Rollback:** see Part 7, Family H
- **Test surface:** see Part 8, Family H

### Unify-3 — Family E: Orders rename + handling-fee migration

- **Dependencies:** Unify-1
- **Parallelizable with:** Unify-2 (Family H) — different worktrees recommended
- **Scope:** 9 column renames + 1 type migration (`handling_fee_amount`) + 55 Pattern-B caller rewrites + Stripe webhook unit-alignment (no change; just verify) + order-emails formatter update
- **LOCKED decisions in prompt:**
  - LOCKED: rename `orders.*` and `order_items.*` cents columns to `*_cents`
  - LOCKED: migrate `shipping_settings.handling_fee_amount` NUMERIC(8,2) → INTEGER cents + rename to `_cents`
  - LOCKED: rewrite ALL Pattern-B `formatCurrency(x / 100)` callers to `formatMoney(x)` (55 sites across 11 files)
  - LOCKED: delete the inline `$${x.toFixed(2)}` patterns in order-emails / receipt routes (where applicable) and route through `formatMoney`
- **Reconciliation queries:** see Part 6, Family E
- **Rollback:** see Part 7, Family E
- **Test surface:** see Part 8, Family E

### Unify-4 — Family A: POS Transactions (THE BIG ONE)

- **Dependencies:** Unify-1, Unify-2, Unify-3 (sequence-required; everything later depends on this)
- **Parallelizable with:** nothing (solo phase — too large and risky to share session bandwidth)
- **Scope:** 29 columns across 6 tables, ~110 caller files, tax helper rewrite (`pos/utils/tax.ts`), QBO sync conversion site, 38 receipt fixture regenerations, refund-math.ts caller migration to `money.ts` import path, `compose-line-items.ts` rewrite to cents
- **LOCKED decisions in prompt:**
  - LOCKED: migrate all 29 columns + rename to `*_cents`
  - LOCKED: rewrite `pos/utils/tax.ts` to compute entirely in cents (no more `Math.round(x * 100) / 100` dollars-precision floor)
  - LOCKED: rewrite all 8 `Math.round(x * 100)` sites identified in Money-Audit-1 (card-payment.tsx, split-payment.tsx, job-detail.tsx, create-payment-intent/route.ts, book/payment-intent/route.ts)
  - LOCKED: add conversion shim `toCents(quote.discount_amount)` at quote→transaction convert path; comment `// TODO Unify-7 cleanup`
  - LOCKED: leave a similar shim at the lifetime_spend update site; comment `// TODO Unify-8 cleanup`
  - LOCKED: leave shim in coupon-helpers integration; comment `// TODO Unify-6 cleanup`
  - LOCKED: regenerate all 38 receipt fixtures; diff against pre-migration; any non-zero diff blocks merge
- **Reconciliation queries:** see Part 6, Family A
- **Rollback:** see Part 7, Family A
- **Test surface:** see Part 8, Family A. Recommend 2-session minimum: one to migrate + commit, one to run reconciliation + fix any drift.

### Unify-5 — Family C: Appointments

- **Dependencies:** Unify-4 (transactions must be cents-native before appointments can be — transaction-completion path reads appointment fields)
- **Parallelizable with:** Unify-6 (Family F) — different worktrees recommended
- **Scope:** 8 columns on appointments + 1 column on appointment_services + 1 on mobile_zones + 2 on job_addons + business_settings JSONB key rename + ~60 caller files
- **LOCKED decisions in prompt:**
  - LOCKED: rename `appointments.subtotal` → `appointments.subtotal_cents` and 7 siblings
  - LOCKED: rename JSONB key `default_deposit_amount` → `default_deposit_amount_cents` and × 100 the value
  - LOCKED: the existing `payment_link_amount_cents` column stays as-is (no rename — already correctly suffixed)
  - LOCKED: rewrite booking-flow display, pay-link send, mobile-fee picker, appointment detail dialog
  - LOCKED: update `src/lib/data/booking.ts` to read the renamed JSONB key
  - LOCKED: rewrite `src/lib/utils/mobile-service-edit.ts` to stop boundary-converting (currently does cents-internal, dollars-at-storage)
- **Reconciliation queries:** see Part 6, Family C
- **Rollback:** see Part 7, Family C
- **Test surface:** see Part 8, Family C

### Unify-6 — Family F: Marketing

- **Dependencies:** Unify-4 (transactions.discount_amount must be cents) + Unify-3 (orders.discount_amount must be cents)
- **Parallelizable with:** Unify-5 (Family C) — different worktrees recommended
- **Scope:** 4 columns + `coupon-helpers.ts` rewrite + analytics route updates
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `coupons.min_purchase`, `coupon_rewards.discount_value` (discount_type-aware!), `coupon_rewards.max_discount`, `campaigns.revenue_attributed`
  - LOCKED: rewrite `calculateCouponDiscount` in `coupon-helpers.ts` to compute and return cents
  - LOCKED: remove the conversion shim from Unify-4 at coupon integration points
  - LOCKED: for percentage rows, do NOT × 100 the discount_value; preserve percentage points (or convert to basis-points — Marketing follow-up TBD)
- **Reconciliation queries:** see Part 6, Family F
- **Rollback:** see Part 7, Family F
- **Test surface:** see Part 8, Family F

### Unify-7 — Family B: Quotes

- **Dependencies:** Unify-4 (transactions) + Unify-5 (appointments) — quote convert paths write to both
- **Parallelizable with:** Unify-8 (Family G) — different worktrees; small phases, but they share zero files so safe to parallelize
- **Scope:** 7 columns + ~28 caller files + delete `quote-helpers.ts:33-35` local `formatCurrency`
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `quotes.subtotal`, `tax_amount`, `total_amount`, `mobile_surcharge` and `quote_items.unit_price`, `total_price`, `standard_price`
  - LOCKED: rewrite POS quote builder, voice-agent quote routes, admin quote read view, public quote page
  - LOCKED: remove the conversion shim from Unify-4 at quote→transaction convert path (`/api/pos/quotes/[id]/convert/route.ts`)
  - LOCKED: delete the duplicate `formatCurrency` in `quote-helpers.ts:33-35`
- **Reconciliation queries:** see Part 6, Family B
- **Rollback:** see Part 7, Family B
- **Test surface:** see Part 8, Family B

### Unify-8 — Family G: Customer Aggregate

- **Dependencies:** Unify-4 (aggregation source)
- **Parallelizable with:** Unify-7 (Family B) — disjoint file sets
- **Scope:** 1 column + ~15 caller files + transaction-completion update path + lifecycle engine reads
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `customers.lifetime_spend` → `lifetime_spend_cents`
  - LOCKED: rewrite the aggregation site (transaction completion) to increment by cents
  - LOCKED: remove the conversion shim from Unify-4 at the aggregate update site
  - LOCKED: rewrite admin customer pages, lifecycle engine, AI conversation summary, migration validation
- **Reconciliation queries:** see Part 6, Family G
- **Rollback:** see Part 7, Family G
- **Test surface:** see Part 8, Family G

### Unify-9 — Family D: Catalog

- **Dependencies:** Unify-4, Unify-5, Unify-6, Unify-7 (every reader is cents-native by now)
- **Parallelizable with:** nothing (largest fan-out family; running solo for risk isolation)
- **Scope:** 15 columns across 4 tables + ~70 caller files + 4-CHECK constraint update + sale_price discipline preservation
- **LOCKED decisions in prompt:**
  - LOCKED: migrate `services.flat_price`, `custom_starting_price`, `per_unit_price`, `sale_price`
  - LOCKED: migrate `service_pricing.*` (7 columns)
  - LOCKED: migrate `products.cost_price`, `retail_price`, `sale_price` + remove the Unify-2 `// TODO Unify-D` shim in inventory
  - LOCKED: migrate `packages.price`
  - LOCKED: recreate `chk_service_sale_price`, `chk_product_sale_price`, `services_sale_price_non_negative` against `_cents` columns
  - LOCKED: rewrite POS pricing picker, public service/product pages, AI content writer service/product context, voice-agent services/products routes
  - LOCKED: delete `quick-edit-drawer.tsx:44-47` `formatPrice` shim and replace with `formatMoneyForInput(cents)`
  - LOCKED: Square import boundary stays — input cents, store cents (no change)
- **Reconciliation queries:** see Part 6, Family D
- **Rollback:** see Part 7, Family D
- **Test surface:** see Part 8, Family D

### Unify-Final — Cleanup + ADR

- **Dependencies:** all of Unify-1 through Unify-9
- **Parallelizable with:** nothing (final phase)
- **Scope:**
  - Drop all NUMERIC(10,2) dollar columns left behind by the two-phase commits (Migration 2 step for every family)
  - Rename `formatMoney` → `formatCurrency`; delete the legacy dollars `formatCurrency`
  - Delete the duplicate formatters: `template.ts:143-146`, `quickbooks/page.tsx:147-149`. (`quote-helpers.ts:33-35` is deleted in Unify-7; `quick-edit-drawer.tsx:44-47` is deleted in Unify-9.)
  - Rewrite the remaining 48 inline `` `$${x.toFixed(2)}` `` files to use `formatMoney(cents)`. Categorize first — the 22 in api/ are mostly receipt/email/PDF routes; the 17 in pos/ are POS components; the rest are mixed. Audit each as cents-source or dollars-source; convert accordingly.
  - Upgrade `money/no-unsuffixed-money-prop` lint rule from `'warn'` to `'error'`
  - Delete `src/lib/utils/refund-math.ts` re-export stub (after every importer has migrated to money.ts)
  - Supersede ADR-0003 with ADR-0006 "Money model unified to integer cents (end-state)": document the post-migration model, link to MONEY.md, leave ADR-0003 in place with a "Superseded by 0006" header.
  - Update CLAUDE.md to reflect post-epic state.
  - Update DB_SCHEMA.md via the regen script.

---

## Open Questions

The following are CC-surfaced uncertainties that the user must answer before specific phases can start. Listed in the order they need resolution.

### Q1 — Coupon percentage representation (blocks Unify-6)

`coupon_rewards.discount_value` carries dollar-amount on fixed-amount rows and percentage-points (e.g. 10 for 10 %) on percentage rows. Three options:

- **Q1a**: Keep one column; migrate is `discount_type`-aware; percentage rows pass through unchanged. Lowest churn but the column's unit stays ambiguous.
- **Q1b**: Split into two columns: `discount_amount_cents` (NULL for percentage rows) and `discount_percentage_bps` (NULL for fixed rows). Resolves the unit ambiguity entirely. Higher migration cost (one extra column rename + caller logic split).
- **Q1c**: Store percentage as basis-points in `discount_value_bps`, fixed as cents in a separate column or via a sentinel value. Cleaner but the most invasive.

**Recommendation: Q1b**. The audit identified `discount_value` as a MEDIUM-confidence identifier specifically because of this ambiguity. The migration is the right time to split it.

### Q2 — `cash_drawers` variance/tip math precision (blocks Unify-4)

`cash_drawers` carries `variance`, `cash_tips`, `cash_sales`, etc. End-of-day uses these to compute auto-deposit (counted_cash − next_day_float). Today's code does `Math.round(x * 100) / 100` to floor variance precision. In cents, variance is integer-exact — but if the source rows (payments, refunds) had floating-cent intermediate values before the migration, the historical drawer values are slightly imprecise. Should the migration:

- **Q2a**: Backfill cash_drawers as `ROUND(value * 100)::INTEGER` — preserves the existing imprecision as-is in the cents value
- **Q2b**: Recompute every cash_drawers row from its source payments/refunds — but this only works if those tables are also migrated (they are — both in Family A)

**Recommendation: Q2b**. Because Family A migrates cash_drawers alongside payments/refunds in the same phase, recomputing drawer values from the cent-exact payment rows is feasible and produces stricter integrity.

### Q3 — Receipt fixtures: byte-identical or content-identical? (blocks Unify-4)

The 19-scenario receipt fixture suite has 38 baseline files. After Unify-4 migrates transactions to cents, the regenerated fixtures should produce **byte-identical** output if `formatMoney(cents)` produces the same string as `formatCurrency(dollars)`. Both helpers use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`, so this should hold.

But the input data flow may produce subtle differences:
- A dollar value `17.64` round-trips through `toCents` → 1764 cents → `fromCents` → 17.64 (exact for this case)
- A dollar value `17.645` round-trips through `toCents` → 1765 cents (rounded up) → `fromCents` → 17.65 (a 0.005 → 0.01 rounding step at the boundary)

If any production transaction was stored with a precision of more than 2 decimals (NUMERIC(10,2) technically permits this if it was written via raw SQL bypassing the constraint), the migration's `ROUND(x * 100)::INTEGER` will round to 2 decimals. The fixture regeneration may surface tiny diffs.

**Question for user:** if a single receipt fixture diffs by 1 cent post-migration, is that:
- **Q3a**: a bug to fix (preserve byte-identical at the cost of leaving the imprecise dollar source as-is — impossible if dollar columns are dropped)
- **Q3b**: expected (cents-rounding is the new truth; regenerate the baseline and document why it diverged)

**Recommendation: Q3b** with a note in the migration commit message identifying any diverged fixtures.

### Q4 — JSONB money keys beyond `default_deposit_amount` (blocks Unify-1 and Unify-5)

Is `default_deposit_amount` in `business_settings` the only JSONB money value, or are there others lurking? Audit identified one. The migration of business_settings JSON values should run a discovery query first.

**Question for user:** approve a `Unify-5` precondition step that audits `business_settings.value` JSON contents for any monetary key (regex match `amount|price|fee|cost|deposit|surcharge|spend|discount` against the key names + manual classification).

**Recommendation: yes, run the precondition audit at Unify-5 start.**

### Q5 — Loyalty points-to-dollars conversion factor (blocks Unify-8 only if it touches points→spend bridge)

`customer-detail page` at line 1541 (cited in Money-Audit-1, Pattern D) renders `(loyalty_points_balance * 0.05)` as a dollar value. The `0.05` is a redemption rate (points → dollars). Where is this rate stored?

**Question for user:** is the 0.05 hardcoded or driven by `business_settings`? If hardcoded, Unify-8 should NOT migrate it without surfacing the hardcoded value first. If settings-driven, the rate's unit needs documentation in MONEY.md.

**Recommendation: investigate at Unify-8 start; do not migrate until clear.**

### Q6 — Stripe Terminal off-line transactions

Stripe Terminal's offline mode can produce delayed payment confirmations. The webhook may arrive after the transaction record has been migrated. Is there a chance of a webhook landing during a family-migration window where the schema state is mid-flight?

**Question for user:** confirm that dev environment is the ONLY exposure during the epic (per LOCKED-3 constraint), and that no Stripe Terminal hardware will be active against the dev DB during migration windows. If yes, no concern. If hardware testing happens against dev, schedule the migrations during quiet windows.

**Recommendation: confirm hardware idle during migration windows.**

### Q7 — `quote_items.total_price` vs computed value

`quote_items.total_price` is stored — but it could also be computed as `unit_price × quantity − discount`. Are there quote items where the stored `total_price` diverges from the computed value? The migration is safer if these are reconciled before the type change.

**Question for user:** approve a pre-migration audit in Unify-7 that lists any quote_items rows where stored total_price ≠ computed. If non-zero, those are pre-existing data bugs that should be addressed BEFORE migration so the cent-converted values aren't pre-corrupted.

**Recommendation: yes, run the audit at Unify-7 start.**

### Q8 — Concurrent Unify and other ongoing work

This epic runs alongside whatever other phases are active. Looking at recent commits (b051c0af → dfd7713f), the codebase is in "phase completion + ADR work" mode. Risk: a non-Unify phase introduces new money-handling code (new column, new caller) during the Unify epic and the new code is in dollars.

**Question for user:** during the Unify epic, gate any non-Unify phase that touches money-bearing code through this playbook's Decision A (use `formatMoney`, suffix variables) so we're not paving over fresh dollars-canonical code as we go?

**Recommendation: yes — add a one-line note to CLAUDE.md at Unify-1: "Money-Unify epic in progress. New money-handling code must use cents (see docs/dev/MONEY.md)."**

---

## Honest Limitations of This Playbook

What this playbook **cannot** predict:

- **Bugs discovered mid-migration that change scope.** When Unify-4 regenerates the 38 receipt fixtures, we may discover one pre-existing miscomputation that the migration surfaces. That single bug may turn into a half-day diversion that wasn't in the scope.
- **Real data corner cases.** The reconciliation queries assume clean data. If `transactions.subtotal` has a row with `subtotal = NULL` (despite the NOT NULL constraint) due to a historical migration bug, the `ROUND(NULL * 100)` will fail or coerce, and the SUM comparison will silently drop the row. Each phase needs a pre-flight NULL/anomaly audit on the columns it touches.
- **Per-family caller count drift.** The "approximate caller count" numbers in Part 2 are extrapolated from grep counts at audit time. By the time Unify-4 runs, the actual file set may differ by 10-20 % due to ongoing development.
- **Lint rule false positives.** The phone-lint experience (Phase 1.3 added 5 context-aware skip patterns) suggests the money-lint will need a similar iterative tightening. Plan for `'warn'` for the duration of the epic and `'error'` only at Unify-Final.

What this playbook **assumes** that could prove wrong:

- **JavaScript Number precision is sufficient for cents.** Holds up to 2^53 ≈ 9 quadrillion cents = $90T. For this business: indisputable. Doesn't generalize to financial-services-scale workloads.
- **NUMERIC(10,2) data is always exactly 2 decimal places.** True in the application code path, but raw SQL writes (historical migrations) could have inserted higher precision. The migration's `ROUND` clause handles this safely; the reconciliation queries surface any divergence.
- **`Intl.NumberFormat` produces identical output across Node versions.** Validated today; could drift if Node minor version changes mid-epic. Lock Node version for the epic if not already locked.
- **No business policy change mid-epic.** A change to tax rate, deposit amount, sale-price discipline, or refund policy mid-migration would compound scope. Recommend deferring policy changes until after Unify-Final.

What this playbook **will need updating** as phases execute:

- File counts in Part 2 (extrapolated; need firming up by each phase's plan-phase agent run)
- The medium-overlap shared-file reservations in Part 4 (some may turn out high or low after detailed mapping)
- The test-surface inventory in Part 8 (new tests added during the epic should be reflected here)
- The Open Questions section as the user answers each

What has the **highest unknown-unknown risk**:

- **Family A.** The largest phase with the deepest cross-references. The receipt fixture suite is the safety net, but it covers 19 scenarios — real production usage has more variation than that.
- **Family F.** The percentage-vs-fixed discriminator in coupon_rewards is the kind of detail that historically causes migration bugs (the `discount_type`-aware migration script is one wrong CASE statement away from corrupting every percentage coupon).
- **Family C.** The intra-table mixed unit (the existing `payment_link_amount_cents` outlier) plus the JSONB key migration is the messiest layout in the schema. Easy to miss one writer.

---

## Reproducing the Playbook

The audit queries used to build this playbook are documented at the end of `docs/sessions/money-audit-1-representation-archaeology.md`. Key facts cited here can be re-verified against the live DB and source via:

```sh
# Family-column counts come from docs/dev/DB_SCHEMA.md (auto-regenerated)
grep -nE "NUMERIC\(10,2\)|INTEGER" docs/dev/DB_SCHEMA.md | wc -l

# refund-math importers
grep -rln "from '@/lib/utils/refund-math'" src/ --include="*.ts" --include="*.tsx" | wc -l   # 21

# formatCurrency caller files by area
grep -rln "formatCurrency" src/ --include="*.ts" --include="*.tsx" | sort > /tmp/fc-files.txt
echo "admin: $(grep -c '^src/app/admin/' /tmp/fc-files.txt)"        # 47
echo "components: $(grep -c '^src/components/' /tmp/fc-files.txt)"  # 16
echo "api: $(grep -c '^src/app/api/' /tmp/fc-files.txt)"            # 10
echo "pos: $(grep -c '^src/app/pos/' /tmp/fc-files.txt)"            # 10
echo "public/account: $(grep -cE '^src/app/\((public|account|customer-auth)\)' /tmp/fc-files.txt)"  # 16
echo "lib: $(grep -c '^src/lib/' /tmp/fc-files.txt)"                # 4

# 8 Math.round(x*100) money sites (outside refund-math)
grep -rnE 'Math\.round\([^)]*\*\s*100\)' src/ --include="*.ts" --include="*.tsx" \
  | grep -v "refund-math.ts\|__tests__\|\/\s*100\|previewScale"

# 48 inline ${x.toFixed(2)} files
grep -rlE '\$\$\{[^}]*\.toFixed\(2\)\}' src/ --include="*.ts" --include="*.tsx" | wc -l
```

---

## Sign-off Checklist

Before proceeding to Unify-1, the user should:

- [ ] Read Part 1 (canonical model) and confirm the cents-canonical end-state
- [ ] Read Part 2 (table families) and approve the 8-family grouping
- [ ] Read Part 3 (migration order) and approve the H → E → A → C/F → B/G → D sequence
- [ ] Read Part 5 (parallelization) and decide: sequential by default, or use parallel pairs?
- [ ] Decision A: confirm `formatMoney(cents)` as new helper, keep `formatCurrency(dollars)` through migration
- [ ] Decision B: confirm `refund-math.ts` → `money.ts` rename + new helpers
- [ ] Decision C: confirm `_cents` suffix convention + lint rule at `'warn'`
- [ ] Decision D: confirm external-boundary table
- [ ] Open Q1: decide between single column (discount_type-aware) vs split columns for coupon_rewards
- [ ] Open Q3: confirm fixture-diff handling policy
- [ ] Open Q8: confirm CLAUDE.md gate-note for concurrent work during the epic

Once approved, Unify-1 prompt can be authored. Each subsequent phase prompt builds on this playbook's LOCKED decisions and reconciliation queries.
