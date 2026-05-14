# Phase Money-Audit-1 — Money representation archaeology

> Read-only audit. No source code changes. Goal: map money representation
> across the codebase before deciding how (or whether) to unify.

---

## TL;DR

The codebase has three coexisting money representations layered by era:

1. **NUMERIC(10,2) dollars** — the original POS / quotes / services model
   (Phase 1, Feb 1 2026). Still ~94 % of money columns.
2. **INTEGER cents** — the e-commerce orders side (Phase 9, Feb 17 2026).
   Modeled on Stripe's wire format.
3. **`refund-math.ts` integer-cent helpers** — added Apr 20 2026
   (Session 36) to fix a single shipped refund bug ($17.60 instead of
   $17.64). Surgical scope: refund pipeline, cash/split payment screens,
   pay-link, mobile-service edit.
4. **ADR-0003** (May 13 2026) generalizes #3 into a global rule: "all
   money arithmetic operates on integer cents." The codebase has not
   been refactored to match — ADR-0003 currently documents
   **aspiration**, not reality.

**Key numeric findings:**

| Signal | Count |
| --- | --- |
| Money columns stored as `NUMERIC(10,2)` (dollars) | 65 |
| Money columns stored as `INTEGER` (cents) | 12 |
| `formatCurrency()` callers, total | 510 |
| &nbsp;&nbsp;Pattern A — dollars input (raw) | 437 |
| &nbsp;&nbsp;Pattern B — `formatCurrency(x / 100)` manual conversion | 55 |
| &nbsp;&nbsp;Pattern C — `formatCurrency(fromCents(x))` canonical | 1 |
| &nbsp;&nbsp;Pattern D — composite expressions (Math.max, sub/add, ×rate) | ~17 |
| Files importing `refund-math.ts` | 22 |
| Sites doing `Math.round(x * 100)` for money outside refund-math (i.e. `toCents` candidates) | 8 |
| Files with inline `` `$${x.toFixed(2)}` `` currency formatting | 48 |
| Distinct duplicate currency-formatter implementations | 4 |
| Distinct identifier names ending `Cents` / `_cents` | 129 |
| Distinct identifier names ending `Dollars` / `_dollars` | 14 |

The dollar/cents split is **structural**, not chaotic — it tracks a
clean date boundary (Feb 17 2026 = Phase 9 e-commerce launch). After
that boundary, new modules pick the form that matches their nearest
external boundary (Stripe → cents; bare display → dollars), with no
project-wide rule.

---

## PART A — Identifier audit

Money-bearing identifier names were sampled by `grep -Eo '[a-zA-Z]+(Cents|Dollars|_cents|_dollars)\b'` across `src/` plus targeted searches on the canonical-name vocabulary listed in the prompt. Highlights below; full list of cents-suffix identifiers (129 distinct names, 987 occurrences) and dollars-suffix identifiers (14 distinct names, 38 occurrences) is reproducible with the same grep.

### Names that carry their unit explicitly (suffix)

| Suffix | Count | Confidence | Where they cluster |
| --- | --- | --- | --- |
| `*Cents` / `*_cents` | 129 distinct (987 references) | HIGH — name encodes unit | POS refund pipeline (`refund-math.ts`, `refund-dialog.tsx`, `refund-summary.tsx`), POS checkout (`split-payment.tsx`, `cash-payment.tsx`), receipts/composer (`receipt-composer.ts`, `receipt-template.ts`, `(public)/receipt/[token]/page.tsx`), pay link (`(public)/pay/[token]/page.tsx`, `payment-link-amount-modal.tsx`), Stripe webhook (`/api/webhooks/stripe/route.ts`), mobile-service edit (`mobile-service-edit.ts`), `attachAmountDueCents` data helpers |
| `*Dollars` / `*_dollars` | 14 distinct (38 references) | HIGH — explicit | Almost exclusively in pay-link + payment screens where a cents value is bridged to dollars for display: `chargeDollars`, `paidDollars`, `amountDueDollars`, `tenderedDollars`, `linkAmountDollars`, etc. The `*_dollars` shape is rare; `*Dollars` is the camelCase variant. |

The most-used `*Cents` names are exported helpers and shared parameters: `toCents` (107), `fromCents` (58), `amountCents` (41), `totalCents` (40), `remainingCents` (31), `grandTotalCents` (24), `paidCents` (21), `subtotalCents` (16), `lineAmountsCents` (16), `partialCents` (13).

### Names that DO NOT carry their unit (most of the codebase)

| Identifier | References | Inferred unit | Confidence | Notes |
| --- | --- | --- | --- | --- |
| `total_amount` | 391 | Dollars | HIGH | Always the `transactions.total_amount` / `appointments.total_amount` column → NUMERIC(10,2) |
| `subtotal` | 315 | Dollars | HIGH (in transactions/POS context) | Same column source; matches `Math.round(subtotal * 100) / 100` rounding pattern in `pos/utils/tax.ts` |
| `tax_amount` | 199 | Dollars | HIGH | NUMERIC(10,2); pre-discount per ADR-0003 + `pos/utils/tax.ts` header |
| `discount_amount` | 185 | **MIXED** | MEDIUM | NUMERIC(10,2) on `transactions`, `quotes`, `appointments`, `quote_items`, `transaction_items`, `job_addons`. **INTEGER cents** on `orders` + `order_items`. Same identifier, two units depending on table. |
| `amount` (refunds, payments) | many | Dollars | HIGH | Both `refunds.amount` and `payments.amount` are NUMERIC(10,2) — despite the refund pipeline's internal math being in cents. Conversion happens at the DB write boundary in `/api/pos/refunds/route.ts`. |
| `unit_price`, `total_price` | many | **MIXED** | HIGH | NUMERIC(10,2) on `transaction_items`, `quote_items`. **INTEGER cents** on `order_items`. |
| `price` (services, products, packages) | many | Dollars | HIGH | NUMERIC(10,2) on `services`, `service_pricing`, `products` (`retail_price`, `cost_price`, `sale_price`), `packages`, `quote_items` |
| `mobile_surcharge`, `cancellation_fee`, `coupon_discount`, `deposit_amount` | many | Dollars | HIGH | All NUMERIC(10,2) on appointments/quotes |
| `payment_link_amount_cents` | several | Cents | HIGH (suffix) | Single appointments column that breaks with sibling columns; named explicitly. CHECK constraint `>= 50` (cents) confirms. |
| `min_purchase`, `max_discount`, `discount_value` | many | Dollars | HIGH | Coupons table — NUMERIC(10,2) |
| `lifetime_spend`, `revenue_attributed` | many | Dollars | HIGH | NUMERIC(10,2) |
| `cash_sales`, `cash_tips`, `cash_refunds`, `total_revenue`, `total_tax`, `total_tips`, `total_refunds`, `opening_amount`, `expected_cash`, `counted_cash`, `variance`, `next_day_float` | many | Dollars | HIGH | All `cash_drawers`, NUMERIC(10,2) |
| `tip_amount`, `tip_net`, `tip_refund` | many | Dollars at the boundary, **cents internally** | HIGH | Stored NUMERIC(10,2). Refund pipeline converts via `toCents(tip_refund)` inside `computeTotalRefundCents`. |
| `loyalty_points_balance`, `points_change`, `points_balance` | many | **Points, not money** | HIGH | INTEGER. Out of scope for money audit but flagged so they're not double-counted. |

### Confidence summary

- HIGH-confidence identifiers (suffix-bearing OR table-grounded): the
  bulk of identifiers in the audit.
- MEDIUM-confidence identifiers: only `discount_amount`, `unit_price`,
  `total_price` — names whose meaning **changes by table**.
  The reader of any single function must know which table the value
  came from to know its unit.
- LOW-confidence identifiers: not encountered in this audit. The
  unit-by-table problem is the dominant ambiguity.

---

## PART B — Storage audit

Compiled from `docs/dev/DB_SCHEMA.md` (auto-generated from live DB on the last regen). Tables ordered by representation block.

### Block 1 — `INTEGER` cents storage (e-commerce / pay-link)

| Table.column | Type | Unit | Naming signal | Notes |
| --- | --- | --- | --- | --- |
| `orders.subtotal` | INTEGER | cents | none | Phase 9, Feb 17 2026 |
| `orders.discount_amount` | INTEGER | cents | none | |
| `orders.tax_amount` | INTEGER | cents | none | |
| `orders.shipping_amount` | INTEGER | cents | none | |
| `orders.total` | INTEGER | cents | none | |
| `order_items.unit_price` | INTEGER | cents | none | |
| `order_items.line_total` | INTEGER | cents | none | |
| `order_items.discount_amount` | INTEGER | cents | none | |
| `appointments.payment_link_amount_cents` | INTEGER | cents | YES (`_cents` suffix) | CHECK `>= 50` (cents) |
| `shipping_settings.flat_rate_amount` | INTEGER | cents | none | Pattern-B caller in `checkout/page.tsx` |

### Block 2 — `NUMERIC(10,2)` dollars storage (POS / quotes / services)

| Table | Money columns (all NUMERIC(10,2) unless noted) |
| --- | --- |
| `appointments` | `mobile_surcharge`, `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `cancellation_fee`, `deposit_amount`, `coupon_discount` (plus `payment_link_amount_cents` INTEGER from Block 1) |
| `quotes` | `subtotal`, `tax_amount`, `total_amount`, `mobile_surcharge` |
| `quote_items` | `unit_price`, `total_price`, `standard_price` |
| `transactions` | `subtotal`, `tax_amount`, `tip_amount`, `discount_amount`, `total_amount`, `loyalty_discount`, `deposit_credit` |
| `transaction_items` | `unit_price`, `total_price`, `tax_amount`, `standard_price` |
| `payments` | `amount`, `tip_amount`, `tip_net` |
| `refunds` | `amount` |
| `refund_items` | `amount` |
| `services` | `flat_price`, `custom_starting_price`, `per_unit_price`, `sale_price` |
| `service_pricing` | `price`, `vehicle_size_sedan_price`, `vehicle_size_truck_suv_price`, `vehicle_size_suv_van_price`, `vehicle_size_exotic_price`, `vehicle_size_classic_price`, `sale_price` |
| `products` | `cost_price`, `retail_price`, `sale_price` |
| `packages` | `price` |
| `coupons` | `min_purchase` |
| `coupon_rewards` | `discount_value`, `max_discount` |
| `customers` | `lifetime_spend` |
| `cash_drawers` | `opening_amount`, `expected_cash`, `counted_cash`, `variance`, `deposit_amount`, `next_day_float`, `cash_sales`, `cash_tips`, `cash_refunds`, `total_revenue`, `total_tax`, `total_tips`, `total_refunds` |
| `mobile_zones` | `surcharge` |
| `vendors` | `min_order_amount` |
| `appointment_services` | `price_at_booking` |
| `job_addons` | `price`, `discount_amount` |
| `purchase_order_items` | `unit_cost` |
| `stock_adjustments` | `unit_cost` |
| `campaigns` | `revenue_attributed` |
| `shipping_settings` | `handling_fee_amount` (NUMERIC(8,2)) |

### Notable features

- **Same-table mixed storage**: `appointments` carries 8 NUMERIC dollar columns *and* one INTEGER `payment_link_amount_cents` column. The `_cents` suffix is the only signal; nothing prevents writing dollars to it (no domain type, only a `>= 50` CHECK that happens to also be true for $50+ in cents).
- **CHECK constraints**: 3 in total, none enforce unit.
  - `chk_product_sale_price`: `sale_price < retail_price` (semantic, not unit)
  - `chk_service_sale_price`: `sale_price < price` (semantic, not unit)
  - `payment_link_amount_cents_check`: `>= 50` (suggestive of cents but technically unit-agnostic)
  - `services_sale_price_non_negative`: `>= 0` (unit-agnostic)
- **Same-named columns differ across tables**: `discount_amount` is NUMERIC on transactions/quotes/appointments/transaction_items/quote_items/job_addons but INTEGER on orders/order_items. `unit_price`, `total_price` likewise.
- **Tax convention** (per `pos/utils/tax.ts:8-11` and ADR-0003): stored `transaction_items.tax_amount` is computed on the **pre-discount** line subtotal. Transaction-level discounts subtract from `subtotal + tax` at the totals stage.

### Sample values not collected

Sample SELECTs were not run because the type information alone is unambiguous: NUMERIC(10,2) holds dollar values like `17.64`, INTEGER columns whose siblings are `_cents` or whose calling code passes `Math.round(x * 100)` hold cents. No column was discovered where the type/name signals were inconclusive.

---

## PART C — `formatCurrency()` caller patterns

Total caller occurrences in `src/`: **510** (excluding 103 import/export lines, across 99 unique files).

### Pattern counts

| Pattern | Count | % | Description |
| --- | --- | --- | --- |
| **A** — `formatCurrency(x)` (dollars in) | **437** | 86 % | Bare property/variable, computed from a NUMERIC(10,2) source |
| **B** — `formatCurrency(x / 100)` | **55** | 11 % | Manual cents → dollars at call site |
| **C** — `formatCurrency(fromCents(x))` | **1** | 0.2 % | The single "canonical" composition, in `(public)/pay/[token]/page.tsx:441` |
| **D** — composite expressions | **~17** | 3 % | `Math.max(...)`, `Math.min(...)`, `x.price - x.discount`, `total - deposit_amount`, `x * rate`, `x + suffix`, etc. — units inferred from operands |

### File-area breakdown of all callers

| Area | Caller count |
| --- | --- |
| `src/app/admin/` | 167 |
| `src/components/` | 148 |
| `src/app/(public)` + `(account)` + `(auth)` | 87 |
| `src/app/api/` | 43 |
| `src/app/pos/` | 42 |
| `src/lib/` | 23 |

### Pattern B (`/100`) cluster — exclusively in the e-commerce path

| File | Pattern-B callers |
| --- | --- |
| `src/app/api/webhooks/stripe/route.ts` | 10 |
| `src/app/admin/orders/[id]/page.tsx` | 10 |
| `src/app/(public)/checkout/page.tsx` | 9 |
| `src/app/(public)/checkout/confirmation/page.tsx` | 7 |
| `src/app/(account)/account/orders/[id]/page.tsx` | 6 |
| `src/lib/utils/order-emails.ts` | 4 |
| `src/app/admin/page.tsx` | 2 |
| `src/app/admin/orders/page.tsx` | 2 |
| `src/app/(public)/receipt/[token]/page.tsx` | 2 |
| `src/app/(public)/pay/[token]/pay-form.tsx` | 2 |
| `src/app/(account)/account/orders/page.tsx` | 1 |

Every Pattern-B caller reads from a column in Block 1 (INTEGER cents) and divides by 100 inline. The `(public)/receipt/[token]/page.tsx` and `(public)/pay/[token]/pay-form.tsx` references are pay-link surfaces that mirror the Stripe-cents shape.

### Mixed-pattern files (cents AND dollars in the same file)

- `src/app/(public)/checkout/page.tsx` — 9 Pattern-B callers; the rest are Pattern A (book-flow dollars). Cart math operates in cents (orders schema); upstream/legacy bits operate in dollars.
- `src/app/(public)/receipt/[token]/page.tsx` — Pattern A for `transactions.*` (dollars); Pattern B for `appointments.payment_link_amount_cents` (cents); also imports `toCents` for receipt-data composition.
- `src/app/(public)/pay/[token]/page.tsx` — the only Pattern-C caller in the codebase. Imports both `toCents` and `fromCents`. Internally cents; renders via `fromCents → formatCurrency`.

### Pattern D — composite expressions

13 sites where the caller passes a non-trivial expression. None are bugs in themselves; flagged because the unit of the *expression* is implicit and bypasses any future unit-checking lint:

```
src/app/admin/customers/[id]/page.tsx:1541          (loyalty_points_balance * 0.05)        — points × redemption rate → dollars
src/app/admin/appointments/.../appointment-detail-dialog.tsx:220   (total_amount - deposit_amount)  — dollars
src/app/admin/marketing/promotions/.../quick-sale-dialog.tsx:249    formatCurrency(x) + suffix     — string concat
src/app/admin/marketing/promotions/.../promotion-row.tsx:62         formatCurrency(basePrice) + (suffix || '')
src/app/admin/jobs/[id]/page.tsx:551                (addon.price - addon.discount_amount) — dollars
src/app/admin/migration/steps/validation-step.tsx:329               Math.abs(s.dbSpend - s.csvSpend)
src/app/pos/end-of-day/page.tsx:493                  autoDeposit (counted − next-day float) — dollars
src/app/(public)/receipt/[token]/page.tsx:232,315    Math.max(...) on appointment + transaction totals
src/app/(public)/services/.../opengraph-image.tsx:34 Math.min(...prices) — dollars
src/app/api/pos/jobs/[id]/complete/route.ts:411      a.price - a.discount_amount — dollars (HTML email)
src/app/api/book/route.ts:674                        Number(appointment.total_amount) - data.deposit_amount — dollars
src/components/booking/step-confirm-book.tsx:893     grandTotal - depositAmount — dollars
src/components/booking/step-service-select.tsx:639,1283  originalPrice - addon.price; Math.min(...)  — dollars
```

---

## PART D — Duplicate currency-formatter implementations

Four distinct implementations live outside `src/lib/utils/format.ts`:

### 1. `src/lib/utils/template.ts:143-146` — `formatDollar`

```ts
export function formatDollar(amount: number): string {
  if (amount === 0) return '$0';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
```

- Unit expected: dollars.
- Differs from canonical: `$0` (no `.00`) for zero; `minimumFractionDigits: 0` on non-zero values.
- Why it likely exists: SMS / email template rendering wanted a more compact dollar string than the canonical `$0.00`.

### 2. `src/app/admin/settings/integrations/quickbooks/page.tsx:147-149` — `formatDollar`

```ts
function formatDollar(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
```

- Unit expected: dollars.
- Differs from canonical: identical behavior to `formatCurrency`. Pure duplicate. Likely a "didn't know the helper existed" copy.

### 3. `src/app/pos/components/quotes/quote-helpers.ts:33-35` — local `formatCurrency`

```ts
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
```

- Unit expected: dollars.
- Differs from canonical: no thousands separator, no `Intl` runtime cost. Likely written before the canonical helper or to avoid a circular import; same name, same call signature, drop-in replaceable.

### 4. `src/app/admin/catalog/products/components/quick-edit-drawer.tsx:44-47` — `formatPrice`

```ts
function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return Number.isFinite(n) ? n.toFixed(2) : '';
}
```

- Unit expected: dollars.
- Differs from canonical: returns `17.64` (no `$`, no commas) — used as the value for an `<input>` field. Less a duplicate "formatter" than a value-coercion shim. Still bypass-worthy.

### Plus: 48 files using inline `` `$${x.toFixed(2)}` ``

Discovered via `grep -rE '\$\$\{[^}]*\.toFixed\(2\)\}'` — 125 occurrences across 48 files. These aren't named functions but they are inline currency-formatting code paths that bypass the canonical helper. Common pattern in PDF/HTML email generation routes (`/api/pos/jobs/[id]/complete/route.ts`, `/api/pos/receipts/email/route.ts`, etc.) and in some admin/POS components (`pos/components/service-pricing-picker.tsx` alone has ~15).

---

## PART E — `refund-math.ts` reality check

### Exported functions

| Function | Signature | Purpose |
| --- | --- | --- |
| `toCents` | `(dollars: number) => number` | `Math.round(dollars * 100)` |
| `fromCents` | `(cents: number) => number` | `cents / 100` |
| `computePerUnitRefundableCents` | `(PerUnitInput) => number` | Unrounded fractional cents |
| `computeRefundLineAmountCents` | `(LineAmountInput) => number` | Single-rounded line amount |
| `computeTotalRefundCents` | `(TotalRefundInput) => TotalRefundResult` | Total + per-line w/ residual distribution |
| `distributeResidualCents` | `(number[], number) => number[]` | ±N-cent allocation across largest-abs lines |

### Importers (22 files)

POS refund pipeline (5):
- `src/app/pos/components/refund/refund-dialog.tsx`
- `src/app/pos/components/refund/refund-summary.tsx`
- `src/app/pos/components/refund/refund-item-row.tsx`
- `src/app/api/pos/refunds/route.ts`
- `src/lib/refunds/source-plan.ts`

POS checkout / payment screens (3):
- `src/app/pos/components/checkout/cash-payment.tsx`
- `src/app/pos/components/checkout/split-payment.tsx`
- `src/app/pos/lib/receipt-template.ts`

Pay-link / payment-link feature (5):
- `src/app/(public)/pay/[token]/page.tsx`
- `src/app/api/pay/[token]/intent/route.ts`
- `src/app/api/pos/appointments/[id]/send-payment-link/route.ts`
- `src/components/jobs/payment-link-amount-modal.tsx`
- (plus `appointments.payment_link_amount_cents` storage)

Mobile-service / appointments (3):
- `src/app/api/admin/appointments/[id]/mobile-service/route.ts`
- `src/app/api/pos/appointments/[id]/mobile-service/route.ts`
- `src/lib/utils/mobile-service-edit.ts`

Receipts / composer / job detail (4):
- `src/app/(public)/receipt/[token]/page.tsx`
- `src/lib/data/receipt-composer.ts`
- `src/app/pos/jobs/components/job-detail.tsx`
- `src/app/api/pos/jobs/[id]/route.ts`

Other (2):
- `src/app/api/webhooks/stripe/route.ts`
- `src/app/api/pos/transactions/route.ts`

Plus the test file: `src/lib/utils/__tests__/refund-math.test.ts`.

### Sites doing the manual conversion that `refund-math.ts` is supposed to replace

The exact pattern ADR-0003 forbids — `Math.round(x * 100)` for money — appears at **8 production sites** outside `refund-math.ts`:

```
src/app/pos/components/checkout/card-payment.tsx:57         Math.round(amountDue * 100)
src/app/pos/components/checkout/card-payment.tsx:75         Math.round(ticket.subtotal * 100)
src/app/pos/components/checkout/split-payment.tsx:237       Math.round(cardAmount * 100)
src/app/pos/components/checkout/split-payment.tsx:254       Math.round(ticket.subtotal * 100)
src/app/pos/jobs/components/job-detail.tsx:1683             Math.round(amountDueDollars * 100)
src/app/api/checkout/create-payment-intent/route.ts:142     Math.round(product.retail_price * 100)
src/app/api/checkout/create-payment-intent/route.ts:214     Math.round(discountResult.total_discount * 100)
src/app/api/book/payment-intent/route.ts:26                 Math.round(amount * 100)
```

(`src/app/admin/website/ads/creatives/[id]/page.tsx:728` — `Math.round(previewScale * 100)` — is a percentage scale, not money, and excluded.)

`split-payment.tsx` and `card-payment.tsx` already import `toCents` from `refund-math.ts` for OTHER lines on the same screen — they have the helper in scope and still didn't use it. That's a documented `toCents` adoption gap, not a discoverability problem.

Broader manual-conversion footprint in money context:

| Pattern | Occurrences |
| --- | --- |
| `x * 100` in money-context lines (excluding refund-math.ts/tests) | 42 |
| `x / 100` in money-context lines (excluding refund-math.ts/tests) | 95 |
| `Math.round(x * 100) / 100` (dollars-rounding idiom in `pos/utils/tax.ts`) | included above |

The `/ 100` count is dominated by **Pattern B** `formatCurrency(x / 100)` callers (55) plus equivalent inline display formatting in admin pages, email/PDF routes, and the booking confirmation. The `* 100` count is dominated by either (a) the `Math.round(x * 100) / 100` "round dollars to 2 decimals" idiom in `pos/utils/tax.ts`, `pos/jobs/page.tsx`, `pos/components/eod/cash-count-form.tsx`, `pos/components/checkout/tip-screen.tsx`, `api/admin/integrations/qbo/reports/route.ts`, `api/admin/marketing/analytics/coupons/route.ts` — *not* a cents conversion, but a dollars-precision floor — or (b) the `Math.round(x * 100)` toCents-equivalent flagged above.

### Verdict

ADR-0003 says: *"All money arithmetic operates on integer cents… No inline `* 100` or `/ 100`."*

Reality: integer cents is the dominant model in **22 files** (the POS refund pipeline, the orders e-commerce path, pay-link, and the receipt composer). Everywhere else — admin views, quote/transaction CRUD, services/products catalog, marketing analytics, QBO sync, the booking flow's display surfaces — the codebase still computes and renders in dollars, with ad-hoc `× 100` / `÷ 100` at the seams.

ADR-0003 documents **the rule that applies inside `refund-math.ts`'s blast radius**, generalized into a global aspiration. The codebase has not been refactored to match the global form. There are 8 sites where `Math.round(x * 100)` appears in money context outside `refund-math.ts` — a small, fixable list — but the deeper gap is that the *source* values for those conversions live in NUMERIC(10,2) dollars columns that the rest of the codebase reads, displays, and arithmetics on as dollars. Unifying on cents requires either (a) migrating the dollar columns or (b) treating "convert at every read" as the canonical pattern.

---

## Architectural questions (LOCKED-4)

### 1. Is the dollars vs cents split consistent or chaotic?

**Consistent — split tracks an era boundary.** The break is structural, not random. Three groups:

- **Dollars-natively (Block 2)**: everything created during Phase 1 (Feb 1 2026). POS, transactions, payments, refunds, quotes, services, products, packages, coupons, customers, cash drawers, mobile zones, vendors, campaigns, appointments. NUMERIC(10,2). 65 columns.
- **Cents-natively (Block 1)**: everything created during Phase 9 (Feb 17 2026, e-commerce launch) plus the pay-link migration (May 3 2026). orders, order_items, shipping_settings.flat_rate_amount, appointments.payment_link_amount_cents. INTEGER. 12 columns.
- **Cents-internally, dollars-at-storage**: refund pipeline, mobile-fee-edit pipeline. Code computes in cents (via `refund-math.ts`); writes back to NUMERIC(10,2) dollar columns at the API boundary.

There are zero columns where the unit is genuinely ambiguous — every column's unit is determinable from type + table.

### 2. If there's a clear split, what was the transition point?

| Date | Commit | Event |
| --- | --- | --- |
| 2026-02-01 | `846ece12` | Phase 1: POS / transactions / payments / quotes — NUMERIC(10,2) dollars |
| 2026-02-17 | `7cc5e49f` | Phase 9 e-commerce: orders + order_items — INTEGER cents (modeled on Stripe wire format) |
| 2026-04-20 | `c5af7eb1` | Session 36: `refund-math.ts` lands. First cents-internal arithmetic helpers. Surgical scope. |
| 2026-05-03 | (migration `20260503160000_add_payment_link_amount_cents.sql`) | First "cents column added to a dollars table" — the `appointments.payment_link_amount_cents` outlier. |
| 2026-05-13 | (today, ADR-0003) | Cents declared canonical for "all money arithmetic." Codebase not refactored. |

### 3. Tables where the SAME concept is stored as both dollars and cents

- **`appointments`**: 8 NUMERIC dollar columns (`subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `mobile_surcharge`, `cancellation_fee`, `deposit_amount`, `coupon_discount`) + 1 INTEGER cents column (`payment_link_amount_cents`). Same row, two units, no domain or naming convention enforces.
- **No other true intra-table mix found.** But three identifiers — `discount_amount`, `unit_price`, `total_price` — exist in both forms across the orders side (cents) and the transactions/quotes/items side (dollars). The pay-link feature deliberately pulled cents into appointments to align with Stripe's wire format.

### 4. Round-trip dollars → cents → dollars sites

Files that import **both** `toCents` and `fromCents` (10 files, definite round-trip surface):

- `src/app/api/pos/refunds/route.ts` — ingests dollars from DB, converts to cents for math, converts back to dollars for `refunds.amount` write
- `src/app/api/webhooks/stripe/route.ts` — Stripe sends cents, server stores dollars on `payments.amount`, converts back to cents to compare
- `src/app/api/pos/appointments/[id]/send-payment-link/route.ts` — dollars-from-DB → cents-to-Stripe → dollars-back-to-display
- `src/app/(public)/pay/[token]/page.tsx` — dollars props → cents math → dollars display (visible in `chargeDollars = fromCents(chargeCents)` at line 208)
- `src/app/pos/components/checkout/split-payment.tsx`
- `src/app/pos/components/checkout/cash-payment.tsx`
- `src/app/pos/components/refund/refund-summary.tsx`
- `src/components/jobs/payment-link-amount-modal.tsx`
- (plus the test file and `refund-math.ts` itself)

Each of these is a known surface where rounding bugs CAN appear if any leg uses a non-canonical conversion. The Session-35 bug was exactly this class. Per ADR-0003 invariant 4, server-side recomputation with tolerance 0 catches the divergence — but only inside the refund pipeline. The other round-trip surfaces (Stripe webhook, pay-link, split/cash payment) do not have the same server-recompute guard.

### 5. Cost of unifying — how many files would change?

To reach **cents-canonical everywhere** (the ADR-0003 endpoint):

- **Migrate 65 columns** from `NUMERIC(10,2)` to `INTEGER` cents (multiply existing rows by 100 + change column type) across 23 tables.
- **Rewrite ~437 Pattern-A `formatCurrency(x)` callers** to either `formatCurrency(fromCents(x))` or to a new `formatCurrencyCents(x)` helper. Footprint: 99 files, concentrated in `src/app/admin/` (167 callers) and `src/components/` (148 callers).
- **Replace 48 inline `` `$${x.toFixed(2)}` `` files** with the canonical helper.
- **Delete or redirect 4 duplicate formatter implementations** (`template.ts:143`, `quickbooks/page.tsx:148`, `quote-helpers.ts:33`, `quick-edit-drawer.tsx:44`).
- **Replace 8 `Math.round(x * 100)` sites** with `toCents()`.
- **Update QBO sync, marketing analytics, end-of-day, lifecycle, AI auto-responder** — every read of a money column needs unit awareness.

Rough order of magnitude: ~120-150 files changed, plus a coordinated DB migration. Not impossible but easily a 2-3 phase initiative on the scale of the recent phone normalization work (Normalization-1 + Phone-UX-1 + Lint-Hardening-1 + Schema-Hardening-1).

The cheaper alternative is **dollars-canonical-with-cents-at-the-boundary** (Stripe and orders are the only real cents constituencies). That direction inverts the orders schema migration (12 columns → NUMERIC dollars) but leaves the bulk of the codebase untouched. Footprint: 12 column migrations, ~55 Pattern-B caller cleanups, no change to the 437 Pattern-A callers.

### 6. External API constraints

- **Stripe** — operates in cents natively. Already aligned; payment intents, charges, refunds, terminal — all cents on the wire. This is non-negotiable; conversion happens somewhere regardless.
- **Square** — used as a catalog source historically. Square's Catalog API returns `price_money: { amount: <int>, currency: "USD" }` where `amount` is in cents (the "smallest currency unit"). Currently used for product import via `import-square-transactions.mjs`; not a daily integration touch point.
- **QuickBooks Online** — API uses decimal money (`Amount: 17.64`). Sync engine in `src/lib/qbo/` reads and writes dollars. Aligned with the dominant codebase representation.
- **Shippo** — rates are decimal money strings. Aligned with dollars.
- **Mailgun, Twilio, Anthropic** — no money fields.

External boundaries are split: Stripe + Square favor cents; QBO + Shippo favor dollars. There's no single boundary that would be "free" if we adopted it as canonical.

### 7. Bugs plausibly traceable to the lack of a canonical form

- **Session 35 ($17.60 vs $17.64)** — explicitly documented in `refund-math.ts:11-14` and ADR-0003. Per-unit dollar value rounded before multiplying by quantity. Root: ad-hoc `* 100` / `/ 100` in the refund path. This is the bug that prompted refund-math.ts.
- **Session 36** (commit `c5af7eb1`) — added 271 lines of test coverage (`src/lib/utils/__tests__/refund-math.test.ts`) for fractional-cent / residual / multi-line cases that previously went untested. Implicitly closes a class of bugs that were latent before April 20.
- **Round-trip surfaces without the server-recompute guard** (#4 above) — Stripe webhook, pay-link intent, split-payment Stripe charge — are structurally vulnerable to the same class of bug. No documented production failure has been traced to one yet, but the safety mechanism that catches refund mismatches doesn't exist at those surfaces.
- **Cosmetic display drift**: e-commerce orders pages format with `value / 100` while the booking confirmation formats the dollars-stored `total_amount` directly. Both render correctly today, but the divergence means a future maintainer copying a "format an amount" pattern picks the wrong one half the time.

---

## Recommendations

### What the canonical form should be

**Recommendation: dollars-canonical-with-cents-at-stripe-boundary.** Inverts the unstated assumption of ADR-0003.

Reasoning:
- 65 / 77 money columns (84 %) and ~437 / 510 formatCurrency callers (86 %) already operate in dollars. The minority (cents) is concentrated in the orders + pay-link surfaces, which exist BECAUSE Stripe wants cents on the wire — nothing fundamentally requires the storage to be cents.
- The unit-class-of-bug (Session 35) is **rounding order**, not representation. `Math.round(x * 100)` is dangerous regardless of whether `x` came from a cents column or a dollars column. The fix is "round once at the boundary" — a discipline ADR-0003 already enforces inside refund-math.ts. That discipline can be applied while keeping NUMERIC(10,2) storage.
- NUMERIC(10,2) Postgres values arrive as JS strings (`"17.64"`); JS doing `Number("17.64") * Number("17.64")` doesn't suffer the IEEE-754 multiplication artifact unless we do unnecessary intermediate rounding. The `* 100` artifact is specifically a cents-conversion artifact.
- Inverting toward cents-canonical requires changing ~120-150 files. Inverting toward dollars-canonical requires changing ~25-30 (the orders/pay-link path, plus the 8 `Math.round(x * 100)` sites). Asymmetric cost.

If the user prefers cents-canonical (ADR-0003's direction), the next paragraph is the concession.

**Alternative: cents-canonical** — the path ADR-0003 charts. Higher cost (~120-150 files + DB migration), but produces a single mental model and eliminates the "which unit does this identifier carry?" ambiguity for `discount_amount`, `unit_price`, `total_price`. Cleaner long-term, more invasive short-term.

### Risk areas regardless of direction chosen

- **Mixed-pattern files** (3 identified): `(public)/checkout/page.tsx`, `(public)/receipt/[token]/page.tsx`, `(public)/pay/[token]/page.tsx`. Highest risk for a maintainer pasting the wrong pattern.
- **The 8 `Math.round(x * 100)` sites**: small, targeted fix regardless of canonical direction. Could be a single phase.
- **The 4 duplicate formatter functions + 48 inline `` `$${x.toFixed(2)}` `` files**: duplicate-formatter cleanup is independent of the canonical-form decision and could be its own phase.
- **`appointments.payment_link_amount_cents` outlier**: same-table mixed-unit storage. Either rename + migrate the column to match siblings, or keep but document why it's special.
- **Round-trip surfaces without server-recompute guards** (Stripe webhook, pay-link intent, split-payment): a hardening pass to apply the ADR-0003 invariant 4 (server tolerance 0) to these surfaces would close a real risk class.

### Suggested phase sequence (if cents-canonical wins)

1. **Glossary phase** — author `docs/dev/MONEY.md` defining canonical helpers, naming convention (`*Cents` suffix in code, `*_cents` suffix in DB), and conversion contract. Mirror the structure of `docs/dev/PHONE_LINT.md`.
2. **Lint phase** — author `money/no-raw-toFixed`, `money/no-inline-mul-100`, and `money/no-unsuffixed-money-prop` rules. Configure as `'warn'` initially.
3. **Schema migration phase** — convert NUMERIC(10,2) columns to INTEGER cents in priority order (transactions → quotes → services → products → catalog), one phase per table family.
4. **Caller migration phase** — convert Pattern-A callers to Pattern-C, area by area. Lint rule severity → `'error'` once an area is clean.
5. **Duplicate cleanup phase** — eliminate the 4 duplicate formatters and the 48 inline-template files. Independent of canonical direction.

### Suggested phase sequence (if dollars-canonical wins)

1. **Glossary phase** — `docs/dev/MONEY.md` declares dollars canonical, names cents-conversion as "Stripe-boundary only," documents the suffix convention (`*Cents` / `*_cents` for the small minority that exists at the boundary).
2. **Lint phase** — `money/no-raw-toFixed`, `money/no-inline-formatCurrency-divide-100` (forbid Pattern B; require Pattern C `formatCurrency(fromCents(x))` or migrate column to dollars).
3. **Cents-storage migration phase** — convert orders/order_items columns from INTEGER cents to NUMERIC(10,2) dollars. Pay-link cents column either migrates or stays as the explicit outlier with documentation.
4. **Math.round-x-100 cleanup phase** — replace the 8 sites with a `toCents` helper that's understood as "Stripe-boundary only."
5. **Duplicate cleanup phase** — same as cents-canonical sequence.

### What this audit deliberately did NOT do

- Recommend a final canonical form. (LOCKED-5: "decide cents vs dollars after audit.")
- Modify any source code. (LOCKED-1.)
- Write the glossary. (Comes after canonical form is chosen.)
- Write the lint rule. (Comes after the glossary.)
- Touch the schema. (Comes after canonical form + glossary + lint.)
- Modify ADR-0003. (Will be revised or superseded after the canonical decision.)

---

## Reproducing the audit

```sh
# Pattern-B / Pattern-C / Pattern-A counts
mkdir -p /tmp/money-audit
grep -rn "formatCurrency(" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "import\|export\|from '" > /tmp/money-audit/all-calls.txt
wc -l /tmp/money-audit/all-calls.txt                                       # 510
grep -E "formatCurrency\([^)]*\/\s*100" /tmp/money-audit/all-calls.txt | wc -l   # 55
grep -E "formatCurrency\(\s*fromCents" /tmp/money-audit/all-calls.txt | wc -l    # 1

# Cents-suffix identifiers
grep -rhEo "[a-zA-Z_]+_cents\b|[a-zA-Z]+Cents\b" src/ --include="*.ts" --include="*.tsx" | sort -u | wc -l   # 129

# refund-math importers
grep -rln "from '@/lib/utils/refund-math'" src/ --include="*.ts" --include="*.tsx" | wc -l   # 22

# Math.round(x*100) toCents-candidates outside refund-math
grep -rnE 'Math\.round\([^)]*\*\s*100\)' src/ --include="*.ts" --include="*.tsx" \
  | grep -v "refund-math.ts\|__tests__\|/\s*100"

# Inline $${x.toFixed(2)} files
grep -rlE '\$\$\{[^}]*\.toFixed\(2\)\}' src/ --include="*.ts" --include="*.tsx" | wc -l   # 48

# Duplicate formatter declarations
grep -rn "function format[A-Z]" src/ --include="*.ts" --include="*.tsx" \
  | grep -iE "dollar|currency|price|money"
grep -rn "Intl\.NumberFormat" src/ --include="*.ts" --include="*.tsx" | grep -i "currency\|USD"
```

DB column inventory came from `docs/dev/DB_SCHEMA.md` (auto-generated). Per LOCKED-3, sample SELECTs were not necessary because every money column's unit was determinable from type + name + sibling-column context.
