# Phase Money-Audit-2 — Subsystem Deep-Dive

> Audit-only session. No code changes, no schema changes, no migrations.
> Output: structured findings for the 9 money-handling subsystems plus
> cross-subsystem flows. Feeds into the Money-Unify-0 playbook revision.
>
> Prerequisite reading:
> - `docs/sessions/money-audit-1-representation-archaeology.md`
> - `docs/sessions/money-unify-0-migration-playbook.md`
> - `docs/adr/0003-money-math-via-integer-cents.md`
> - `docs/dev/DB_SCHEMA.md`

---

## Executive Summary

The Money-Unify-0 playbook grouped 77 money columns into 8 families based
on schema topology. This audit interrogates 9 **business-logic subsystems**
that span those families — the cross-cutting rules, helpers, integration
hand-offs, and constraint enforcement points that the playbook treated
abstractly. Each subsystem section documents data model, code paths,
helper inventory, constraint enforcement, current unit handling,
inter-subsystem flows, migration implications, and open questions.

**Top-level findings that change the playbook:**

1. **The `tax_rate` admin UI writes a value to `business_settings` that nothing reads.** The runtime tax is `TAX_RATE = 0.1025` hardcoded in `src/lib/utils/constants.ts:7`. The admin page at `src/app/admin/settings/tax-config/page.tsx:100` writes `{ key: 'tax_rate', value: validated.tax_rate }` into `business_settings`, but **no caller reads `'tax_rate'` from `business_settings`** anywhere. This is a real disconnect — either the constant should be replaced by a DB read, or the admin UI is dead.
2. **`appointments_mobile_consistency` CHECK constraint blocks the trivial migration form.** The constraint reads `((is_mobile=false AND mobile_surcharge=(0)::numeric) OR (is_mobile=true AND mobile_surcharge>(0)::numeric))`. Migrating `mobile_surcharge` to cents requires updating the constraint at the same time — pre-flight `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT … CHECK (… mobile_surcharge_cents > 0)`.
3. **`transactions.discount_amount` is a sum, not a pure-coupon column.** It holds `coupon + loyalty + manual` combined (verified at `src/app/pos/context/ticket-reducer.ts:49-50`). `transactions.loyalty_discount` holds only the loyalty portion for refund accounting. Reconciliation queries in the playbook for Family A must account for this composite nature.
4. **Coupon `discount_type` enum is `'percentage' | 'flat' | 'free'`** (verified `coupon_rewards_discount_type_check` constraint). The playbook said `'percentage' | 'fixed_amount'`. The `'free'` variant returns the full applicable price as discount — no migration impact, but the migration spec must address all three.
5. **Coupon usage tracking has THREE write paths (POS, e-commerce, offline sync) and ONE refund-side reversal.** The reversal in `refunds/route.ts:676-710` decrements `use_count` AND adjusts `campaigns.revenue_attributed` — but only on **full** refund. Partial refunds leave `use_count` and `revenue_attributed` unchanged. This is intentional but the reconciliation queries must not assume `use_count == completed_transactions_with_this_coupon`.
6. **Stripe minimum is enforced in 5 separate places** with literal constants. Both `STRIPE_MIN_AMOUNT_CENTS = 50` (3 sites) and `STRIPE_MINIMUM = 0.50` dollars (1 site) and inline `< 50` checks (2 sites). The migration phase should consolidate these into a single export from `money.ts`.
7. **The 13 cash drawer money columns are 12 single-tx writes plus 1 derived field**, all computed and rounded at the end-of-day close in `src/app/api/pos/end-of-day/route.ts:107-129`. Backfill from source rows during migration is feasible.
8. **Mobile zones are distance-based, not ZIP-based**. The audit-1 / playbook descriptions of "ZIP/address resolves to zone" are wrong. Resolution happens via cashier zone-pick at job-creation time, with surcharge snapshotted from the LIVE zone row at save time. No automatic ZIP→zone matching exists.
9. **Refund residual distribution is well-tested (16 unit tests covering all edge cases identified in this audit).** The migration impact is zero — residual distribution math is already cents-native.
10. **Loyalty redemption is dollars-input clamped to balance × REDEEM_RATE, then converted to whole points.** Customer types dollars in POS panel → `Math.ceil(clamped / REDEEM_RATE)` → points used. The reverse direction (points to dollars) uses `points * REDEEM_RATE`. The migration must preserve this asymmetric clamping or the redemption math changes.

The audit surfaces **22 Open Questions** consolidated at the end. Five of
them block Unify-1 directly.

---

## Subsystem 1: Coupons

### 1.1 Business rule statement

A coupon is a code (or auto-apply rule) that produces one or more
"rewards" — each reward describes a discount applied to a target slice
of the cart (whole order, single product, single service, or a category).
Sale-priced and combo-priced items are excluded from coupon discounts
(no-stacking rule). A coupon may have eligibility conditions
(min purchase, customer tags, customer type, required products/
services/categories), usage limits (single-use, max-uses, max
customer visits), and time bounds (`expires_at`).

The discount cannot exceed the eligible subtotal (`Math.min(totalDiscount, subtotal)`
at `src/lib/utils/coupon-helpers.ts:313`). On full refund, the coupon's
`use_count` is decremented and the campaign's `revenue_attributed` is
reduced. Partial refunds leave coupon and campaign metrics untouched.

### 1.2 Data model

**`coupons`** (`docs/dev/DB_SCHEMA.md:479-541`):
- `code TEXT UNIQUE NOT NULL` — the visible code
- `min_purchase NUMERIC(10,2)` — minimum cart subtotal to qualify (dollars)
- `is_single_use BOOLEAN NOT NULL DEFAULT true`
- `use_count INTEGER NOT NULL DEFAULT 0` — incremented at transaction completion
- `max_uses INTEGER` — null = unlimited
- `status coupon_status` — enum: `draft|active|redeemed|expired|disabled`
- `expires_at TIMESTAMPTZ`
- `auto_apply BOOLEAN`
- `customer_id`, `customer_tags TEXT[]`, `tag_match_mode TEXT` (`any|all`), `target_customer_type TEXT` (`enthusiast|professional`)
- `condition_logic TEXT` (`and|or`)
- `requires_product_ids UUID[]`, `requires_service_ids UUID[]`, `requires_product_category_ids UUID[]`, `requires_service_category_ids UUID[]`
- `max_customer_visits INTEGER`
- `combinable_with_sales BOOLEAN NOT NULL DEFAULT true` (column exists but the helper at `coupon-helpers.ts:259-264` enforces sale/combo exclusion regardless — see Open Q1.4)
- `campaign_id UUID` — campaign attribution FK

**`coupon_rewards`** (1-to-many, `DB_SCHEMA.md:452-477`):
- `applies_to TEXT` — `order | product | service`
- `discount_type TEXT` — `percentage | flat | free` (NOT `fixed_amount` — playbook had this wrong)
- `discount_value NUMERIC(10,2) NOT NULL DEFAULT 0` — meaning depends on `discount_type`:
  - `percentage`: percentage points (e.g. 10 means 10 %)
  - `flat`: dollar amount
  - `free`: ignored (always equals applicable price)
- `max_discount NUMERIC(10,2)` — cap on percentage discount
- `target_product_id`, `target_service_id`, `target_product_category_id`, `target_service_category_id`

**`transactions`** (coupon snapshot fields, `DB_SCHEMA.md:2927,2935`):
- `coupon_id UUID FK → coupons(id) ON DELETE SET NULL`
- `coupon_code TEXT` — snapshot at write time

**`appointments`** (coupon snapshot fields, `DB_SCHEMA.md:177-178`):
- `coupon_code TEXT`
- `coupon_discount NUMERIC(10,2)` — dollar amount discounted at booking

**`orders`** (e-commerce):
- `discount_amount INTEGER` (cents) holds the discounted amount.

### 1.3 Code paths

**Single source-of-truth helper:** `src/lib/utils/coupon-helpers.ts`
- `evaluateCouponTargeting(coupon, customer, mode)` — customer_id / tags / type checks (lines 69-113)
- `evaluateCouponConditions(coupon, items, subtotal, customer)` — product/service/category requirements + min_purchase + max_customer_visits (lines 123-185)
- `calculateCouponDiscount(rewards, items, subtotal)` — math (lines 253-324)
  - Sale/combo exclusion: filters items where `pricing_type === 'sale' || 'combo'` (line 259-264)
  - Per-reward dispatch: `calculateRewardDiscount` switches on `discount_type`
  - `percentage`: `applicablePrice × (value/100)`, capped by `max_discount`
  - `flat`: `min(value, applicablePrice)` (can't discount more than the price)
  - `free`: returns full `applicablePrice`
- Three rounding sites: `round2(x) = Math.round(x*100)/100` at line 189-191
- Final clamp: `totalDiscount = min(totalDiscount, subtotal)` line 313

**Three validate endpoints (read path):**
- POS: `src/app/api/pos/coupons/validate/route.ts` — `calculateCouponDiscount` at line 429
- Booking: `src/app/api/book/validate-coupon/route.ts` — same at line 376
- E-commerce: `src/app/api/checkout/create-payment-intent/route.ts` — same at line 209
- POS promotion list: `src/app/api/pos/promotions/available/route.ts` — checks eligibility but doesn't compute discount

**Five write paths (use_count + campaign metrics):**
1. **POS transaction completion** — `src/app/api/pos/transactions/route.ts:571-595` increments `use_count`, updates `campaigns.redeemed_count` and `campaigns.revenue_attributed`
2. **POS offline sync** — `src/app/api/pos/sync-offline-transaction/route.ts:307-326` same logic
3. **E-commerce Stripe webhook** — `src/app/api/webhooks/stripe/route.ts:310-322` increments `use_count` only (no campaign metrics — Open Q1.7)
4. **Booking acceptance** — at `src/app/api/book/route.ts` (need to verify Q1.8 if booking flow increments use_count)
5. **POS full refund reversal** — `src/app/api/pos/refunds/route.ts:676-710` decrements `use_count` and reduces `revenue_attributed`

### 1.4 Helper inventory

| Helper | Location | Purpose |
| --- | --- | --- |
| `calculateCouponDiscount` | `coupon-helpers.ts:253` | Discount math; single source per CLAUDE.md rule |
| `evaluateCouponTargeting` | `coupon-helpers.ts:69` | Customer-level eligibility |
| `evaluateCouponConditions` | `coupon-helpers.ts:123` | Item/min-purchase/visit-count conditions |
| `round2` (private) | `coupon-helpers.ts:189` | `Math.round(n * 100) / 100` |
| `calculateRewardDiscount` (private) | `coupon-helpers.ts:193` | Per-reward switch on discount_type |
| `getMatchingItems` (private) | `coupon-helpers.ts:214` | Filter cart items by target |

### 1.5 Constraint enforcement

- **DB:** `coupon_rewards_applies_to_check` and `coupon_rewards_discount_type_check` (DB_SCHEMA.md:469-470). `coupons_condition_logic_check`, `coupons_tag_match_mode_check`, `coupons_target_customer_type_check` (DB_SCHEMA.md:510-512). No CHECK on dollar amounts — `min_purchase >= 0` is enforced at app layer only.
- **App:** `evaluateCouponConditions` enforces `subtotal >= coupon.min_purchase` at `coupon-helpers.ts:162`. `use_count < max_uses` at validate endpoints (e.g. `pos/coupons/validate/route.ts:75-76`, `promotions/available/route.ts:156`). `expires_at < now()` enforced at validate-endpoint level.
- **None at the helper layer:** `calculateCouponDiscount` doesn't check `min_purchase`, doesn't check `expires_at`, doesn't check `use_count`. The validate endpoints are responsible. **Risk:** any new endpoint that uses `calculateCouponDiscount` without first running `evaluateCouponConditions` will skip these gates.
- **"Discount cannot exceed transaction total":** enforced by `Math.min(totalDiscount, subtotal)` at `coupon-helpers.ts:313`. **Note:** this is `subtotal` (the eligible cart subtotal pre-tax), not `total` (subtotal + tax - discount). If a coupon discounts $30 on a $25 cart with $2.50 tax, the discount is clamped to $25 (the eligible subtotal), not $27.50 (the gross). This appears intentional.

### 1.6 Unit handling

All caller-facing units are dollars (NUMERIC(10,2)):
- `coupons.min_purchase`, `coupon_rewards.discount_value`, `coupon_rewards.max_discount` — dollars (with the percentage exception for `discount_value`).
- `appointments.coupon_discount` — dollars
- `transactions.discount_amount` — dollars, **composite**: coupon + loyalty + manual (verified at `pos/context/ticket-reducer.ts:49-50`)
- `orders.discount_amount` — INTEGER cents
- `campaigns.revenue_attributed` — dollars

The `round2` discipline at `coupon-helpers.ts:189` is the existing "dollars-precision floor" idiom that the audit-1 surfaced. Cents-canonical migration eliminates the need for this floor (integer cents are exact).

### 1.7 Integration with other subsystems

- **Loyalty:** `transactions.discount_amount` is composed of coupon + loyalty (Subsystem 2 §2.7). Loyalty earn happens on `earnableAfterAllDiscounts = earnableSpend - data.discount_amount`. Since `discount_amount` includes coupon discounts, customers earn loyalty points only on the post-coupon spend.
- **Tax (§9):** Coupon discounts apply at the transaction-totals stage, not per-line. Tax is computed on **pre-discount** line subtotals (per refund-math.ts:26-33 invariant). Coupon discount on a $100 cart with $10.25 tax = $10 off → customer pays `$100 + $10.25 - $10 = $100.25`. Tax is NOT reduced by the discount.
- **Refunds (§8):** Coupon discount allocation across refund lines is `itemSubtotal / txSubtotal * txDiscount` (`refund-math.ts:71-79`). The refund residual distribution covers any cent drift from this share.
- **Campaigns:** Coupon reversal on full refund updates `campaigns.revenue_attributed` (`refunds/route.ts:704`); partial refunds leave it untouched. This means revenue_attributed in `campaigns` is a **gross attribution**, not a net-of-refunds figure.
- **POS no-stacking:** sale-priced and combo-priced items are excluded from coupon discount (Subsystem 4 in audit-1 implicitly covered this). The `combinable_with_sales` column exists but is currently not consulted — Open Q1.4.

### 1.8 Migration considerations

When migrating coupons to cents (Unify-6 / Family F):
- `coupons.min_purchase` → `min_purchase_cents` (× 100 backfill)
- `coupon_rewards.discount_value` — **discount_type-aware**: × 100 for `flat`, untouched for `percentage`, untouched for `free` (the value is ignored for `free`)
- `coupon_rewards.max_discount` → `max_discount_cents` (× 100 — unconditional, since percentage rows still cap the resulting cents discount)
- `campaigns.revenue_attributed` → `revenue_attributed_cents` (× 100)
- `appointments.coupon_discount` migrates with Family C (Unify-5)
- The `round2` calls inside `coupon-helpers.ts` become `Math.round` once at boundary, then integer math throughout.
- The `Math.round(((camp.revenue_attributed || 0) - transaction.total_amount) * 100) / 100` pattern at `refunds/route.ts:704` becomes `camp.revenue_attributed_cents - transaction.total_amount_cents` (pure integer subtraction).

**Coupling concern:** The composite `transactions.discount_amount` migration must coordinate with loyalty migration. Either both go cents at the same phase, or the breakdown column (`loyalty_discount`) accepts cents while `discount_amount` is still dollars → broken sum. **Phase recommendation:** Unify-4 (Family A) migrates both `discount_amount` and `loyalty_discount` atomically.

### 1.9 Open questions

- **Q1.1** (blocks Unify-1) — Does `discount_value` need to split into `discount_amount_cents` (for flat/free) and `discount_percentage_bps` (for percentage), as the playbook recommended in Q1b, or stay as a single column with type-aware migration as Q1a? Migration tractability favors Q1a; long-term clarity favors Q1b. (Already in playbook Q1.)
- **Q1.2** (blocks Unify-6) — Partial refunds intentionally leave `use_count` and `revenue_attributed` unchanged. Is this the desired final-state behavior, or should the migration also fix this to attribute net revenue? (Behavior change vs. just-the-migration question.)
- **Q1.3** (blocks Unify-6) — `discount_value` for `free` rewards is currently `0` in the DB but the math returns `applicablePrice`. After migration, should this be stored as some sentinel (e.g. `-1`) to disambiguate, or stay `0` and continue switching on `discount_type`? Switching-on-type works fine; no migration change needed unless we want stricter validation.
- **Q1.4** (orthogonal to migration) — `coupons.combinable_with_sales` exists in the schema (DB_SCHEMA.md:506) but `coupon-helpers.ts:259-264` unconditionally excludes sale/combo items. Is the column dead, or is it consulted somewhere this audit missed? Worth a separate session to resolve.
- **Q1.5** (blocks Unify-6) — `appointments.coupon_discount` is dollars; orders.discount_amount is cents; transactions.discount_amount is dollars (composite). The reconciliation query in playbook Family F must NOT compare cross-table sums until each side is in matching units.
- **Q1.6** (verification, not blocking) — Does the booking flow (`/api/book/route.ts`) increment `coupons.use_count`? Audit-2 didn't fully verify the booking-completion write path.
- **Q1.7** (orthogonal) — E-commerce Stripe webhook increments `coupons.use_count` but doesn't update `campaigns.redeemed_count` or `campaigns.revenue_attributed`. Is this a known omission or expected?

---

## Subsystem 2: Loyalty Points

### 2.1 Business rule statement

Customers earn 1 point per $1 spent (post-discount) and can redeem 100+
points at $0.05/point. Earning excludes water sales (water has its own
SKU `0000001`). Redemption is dollar-input → ceiling-converted to whole
points → multiplied by REDEEM_RATE to produce the actual discount. The
discount cannot exceed the cart subtotal after other discounts.

The constants are defined in `src/lib/utils/constants.ts:16-20`:
```
EARN_RATE: 1,       // 1 point per $1 spent
REDEEM_RATE: 0.05,  // $0.05 per point
REDEEM_MINIMUM: 100 // 100 points = $5.00 minimum redemption
```

### 2.2 Data model

**`customers`** (`DB_SCHEMA.md:598`):
- `loyalty_points_balance INTEGER NOT NULL DEFAULT 0` — current balance (NOT money — points)

**`transactions`** (`DB_SCHEMA.md:2928-2930`):
- `loyalty_points_earned INTEGER NOT NULL DEFAULT 0`
- `loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0`
- `loyalty_discount NUMERIC(10,2) NOT NULL DEFAULT 0` — **dollars value of the redemption** (the discount equivalent, not the points count)

**`loyalty_ledger`** (`DB_SCHEMA.md:1334-ish`) — full audit trail:
- `customer_id`, `transaction_id`, `action TEXT` (`earned|redeemed|adjusted|expired`)
- `points_change INTEGER` (signed)
- `points_balance INTEGER` (running balance after this row)
- `description TEXT`
- `created_by UUID` (employee for manual adjustments)

### 2.3 Code paths

**Earn path** (`src/app/api/pos/transactions/route.ts:447-521`):
1. Check `LOYALTY_REWARDS` feature flag (line 447)
2. Fetch current balance (line 450-454)
3. If redemption present, deduct first (lines 459-475), insert ledger 'redeemed' row
4. Compute `earnableSpend` = items.total_price minus water-SKU lines (lines 478-494)
5. Compute `earnableAfterAllDiscounts = max(0, earnableSpend - discount_amount)` (line 498). **discount_amount is composite — see §1.7.**
6. `pointsEarned = Math.floor(earnableAfterAllDiscounts * LOYALTY.EARN_RATE)` (line 499)
7. Insert ledger 'earned' row, update customer balance, update transaction.loyalty_points_earned (lines 504-521)
8. Send milestone SMS if crossing `REDEEM_MINIMUM` threshold (lines 523-560)

**Redeem path (POS UI):** `src/app/pos/components/loyalty-panel.tsx`
- `balance × REDEEM_RATE` produces full dollar value (line 22)
- Customer enters dollar amount → `pointsToRedeem = Math.ceil(clamped / REDEEM_RATE)` (line 70)
- `actualDiscount = min(pointsToRedeem × REDEEM_RATE, maxRedemption)` (line 72)
- Dispatched to ticket reducer via `SET_LOYALTY_REDEEM` action
- Reducer at `pos/context/ticket-reducer.ts:556+` updates `loyaltyPointsToRedeem` and `loyaltyDiscount` on ticket state
- On checkout submit, the values flow to `/api/pos/transactions` POST as `loyalty_points_redeemed` and `loyalty_discount`

**Refund path** (`src/app/api/pos/refunds/route.ts:566-627`):
- Proportional restoration on partial refund: `restoredPoints = Math.floor(loyalty_points_redeemed × (refundAmount / total_amount))` (line 583)
- Proportional clawback on partial refund: `clawbackPoints = Math.floor(loyalty_points_earned × (refundAmount / total_amount))` (line 604)
- Full refund: both restored = original redeemed; clawed back = original earned
- Single customer balance update at end (line 622-625)
- Refund record stores `points_restored`, `points_clawed_back` (line 630-637)

**Other write paths:**
- `src/app/api/pos/card-customer/route.ts:115-172` — POS "add customer to existing card transaction" earn path (mirrors the main earn logic at line 151)
- `src/app/api/pos/sync-offline-transaction/route.ts` — offline-mode earn (likely mirrors main path)
- Admin manual adjustment: `src/app/admin/customers/[id]/page.tsx:561-579` — `newBalance = current + adjust.points_change`, writes ledger 'adjusted' row
- Admin customer restore: `src/app/api/admin/customers/[id]/restore/route.ts:40` — resets balance to 0 on un-soft-delete

### 2.4 Helper inventory

There is **no dedicated loyalty math helper module**. The math is inline:
- Earn computation: `pointsEarned = Math.floor(earnableSpend × LOYALTY.EARN_RATE)`
- Redeem reverse: `pointsToRedeem = Math.ceil(dollars / LOYALTY.REDEEM_RATE)`
- Dollar value display: `points × LOYALTY.REDEEM_RATE`
- Refund proportional: `Math.floor(original × ratio)`

Sites that duplicate the dollar-value formula:
- `pos/components/loyalty-panel.tsx:22`: `Math.round(balance * LOYALTY.REDEEM_RATE * 100) / 100`
- `pos/components/quotes/quote-loyalty-panel.tsx:18`: same
- `admin/customers/[id]/page.tsx:1541`: `formatCurrency(customer.loyalty_points_balance * 0.05)` — **hardcoded 0.05, not LOYALTY.REDEEM_RATE**
- `api/admin/messaging/[conversationId]/summary/route.ts:107`: `((customer.loyalty_points_balance || 0) * 0.05).toFixed(2)` — hardcoded
- `(account)/account/page.tsx:189`: `formatCurrency(customer.loyalty_points_balance * LOYALTY.REDEEM_RATE)` — uses constant
- `(account)/account/loyalty/page.tsx:88`: `balance * LOYALTY.REDEEM_RATE` — uses constant

**Finding:** 2 of 6 sites carry a hardcoded `0.05` instead of `LOYALTY.REDEEM_RATE`. If the rate ever changes, those sites drift silently.

### 2.5 Constraint enforcement

- **DB:** No CHECK constraint on loyalty_points_balance >= 0. The app enforces non-negative via `Math.max(0, …)` at update sites (e.g. refunds/route.ts:624).
- **App earn:** Math.floor() → no fractional points. Water excluded via SKU match (constants.ts:11). Feature flag gates the entire pipeline.
- **App redeem:** UI clamps to `min(balance × REDEEM_RATE, maxRedemption)`. Minimum redemption is 100 points = $5 (REDEEM_MINIMUM). The minimum is enforced in the POS panel's `minDollars = LOYALTY.REDEEM_MINIMUM * LOYALTY.REDEEM_RATE` (loyalty-panel.tsx:87).
- **App refund:** `Math.floor(loyalty_points_redeemed × ratio)` for partial restoration — never restores more than originally redeemed; `Math.max(0, runningBalance - clawback)` prevents negative balance.

### 2.6 Unit handling

- `loyalty_points_balance` — INTEGER points (not money, but flows into money displays)
- `loyalty_points_earned`, `loyalty_points_redeemed` — INTEGER
- `loyalty_discount` — NUMERIC(10,2) dollars (the redemption's discount equivalent)
- Display arithmetic: `points × REDEEM_RATE` is dollars (decimal multiplication of integer × float). `REDEEM_RATE = 0.05` is a float — the `× 0.05` produces values like `5.0000000000000001` for 100 points, which is why several call sites do `Math.round(x * 100) / 100`.

**After cents-canonical migration:**
- `loyalty_discount` → `loyalty_discount_cents` (INTEGER cents)
- REDEEM_RATE expressed as cents: each point = 5 cents. So `pointsValueCents = points * 5` — exact integer math, no rounding.
- The constant can be reshaped as `LOYALTY.REDEEM_RATE_CENTS = 5` (cents per point) alongside the existing `REDEEM_RATE = 0.05` (for display/legacy compatibility during transition).

### 2.7 Integration with other subsystems

- **Coupons (§1.7):** loyalty discount is bundled into `transactions.discount_amount` along with coupon and manual discounts at write time (`ticket-reducer.ts:49-50`). Loyalty has its own dedicated column (`transactions.loyalty_discount`) so the refund accounting can split out the loyalty portion for points restoration.
- **Tax (§9):** loyalty discount is a transaction-level discount; doesn't reduce per-line tax_amount (refund-math.ts:28-33).
- **Refunds (§8):** points restoration is proportional on partial refund. The proportional formula uses `transaction.total_amount` — which itself is post-discount. This is mathematically subtle: if a customer paid $50 (after $10 loyalty discount on $60 subtotal) and we refund $25 (half the total), they get 200 points × 0.5 = 100 points restored. Mismatch with the "right" answer ($10 of loyalty was used; $5 of that was refunded; 100 points = $5 → correct). Net result: restoration is correct by accident — the ratio works because `loyalty_discount / total = loyalty_dollars / total_paid = points / total_paid_points`.
- **Receipts:** `loyalty_points_earned` shows on receipts at `api/pos/receipts/email/route.ts:78-80` via `pointsEarned × REDEEM_RATE` formatted.

### 2.8 Migration considerations

- `transactions.loyalty_discount` migrates with Family A (`transactions` table). Type swap NUMERIC → INTEGER cents.
- `customers.loyalty_points_balance` is points (INTEGER), not money — **excluded from money migration**.
- `loyalty_ledger.points_change` is points — excluded.
- Inline math at all earn/redeem sites needs unit awareness:
  - `data.discount_amount` (composite, dollars currently) becomes `data.discount_amount_cents` (post-Unify-4)
  - `earnableSpend` accumulates `item.total_price` (dollars now, cents post-Unify-4)
  - `Math.floor(earnableAfterAllDiscounts × EARN_RATE)` — when both operands are cents, `EARN_RATE` becomes `1/100` (1 point per 100 cents). The formula becomes `Math.floor(earnableAfterAllDiscountsCents / 100)`. Cleaner expressed as `Math.floor(cents / 100)`.
  - `pointsToRedeem = Math.ceil(clampedCents / REDEEM_RATE_CENTS)` where `REDEEM_RATE_CENTS = 5`. Exact integer division.
- The 2 hardcoded `0.05` sites (`customers/[id]/page.tsx:1541`, `messaging/[conversationId]/summary/route.ts:107`) get fixed in the migration commit — either reference the constant or use the new `pointsToCents(points)` helper.

### 2.9 Open questions

- **Q2.1** (blocks Unify-8) — Should the constant be expressed as `REDEEM_RATE_CENTS = 5` (cents per point) and `EARN_DENOMINATOR_CENTS = 100` (1 point per 100 cents), or keep the float REDEEM_RATE alongside as a display compatibility layer?
- **Q2.2** (orthogonal) — The 2 hardcoded-`0.05` display sites (customers/[id]/page.tsx:1541, messaging/[conversationId]/summary/route.ts:107) are dead-code drift risks. The migration phase should replace them with the constant.
- **Q2.3** (business policy) — Is there a max redemption per transaction (e.g. "can't redeem more than 50% of the cart")? Current code clamps to subtotal-after-other-discounts; no other cap. (Stated in prompt as "Open question for user".)
- **Q2.4** (business policy) — Are loyalty points eligible to be earned on the loyalty_discount portion itself? Currently NO — `earnableAfterAllDiscounts = max(0, earnableSpend - discount_amount)` subtracts ALL discounts including loyalty. Customer redeems $5 → doesn't earn points on that $5 → net "compound loyalty" doesn't happen. Intentional?

---

## Subsystem 3: Stripe Minimum Enforcement

### 3.1 Business rule statement

Stripe rejects payment intents below $0.50 USD (50 cents). The codebase
must reject before reaching Stripe's API to give a clear local error
instead of a Stripe-side rejection. Five surfaces enforce the minimum
independently with different forms (cents vs. dollars vs. inline).

### 3.2 Data model

No dedicated column. `appointments.payment_link_amount_cents` carries a
DB CHECK that mirrors the constant: `payment_link_amount_cents_check`:
`CHECK (((payment_link_amount_cents IS NULL) OR (payment_link_amount_cents >= 50)))`
(DB_SCHEMA.md:189). This is the **only DB-level Stripe-minimum
enforcement** in the schema.

### 3.3 Code paths

**Five enforcement sites with three different forms:**

| Site | Form | Constant | Code |
| --- | --- | --- | --- |
| Booking deposit | dollars float | `STRIPE_MINIMUM = 0.50` | `src/app/api/book/payment-intent/route.ts:16-23` |
| Pay-link intent | cents int | `STRIPE_MIN_AMOUNT_CENTS = 50` | `src/app/api/pay/[token]/intent/route.ts:9,94-99` |
| Pay-link send (server pre-validation) | cents int | `STRIPE_MIN_AMOUNT_CENTS = 50` (copy) | `src/app/api/pos/appointments/[id]/send-payment-link/route.ts:15-17,78-86` |
| POS refund partial (Stripe side) | cents int | `STRIPE_MIN_AMOUNT_CENTS = 50` (copy) | `src/app/pos/components/refund/refund-dialog.tsx:40-43,332-340` |
| E-commerce checkout | inline literal | `< 50` (cents) | `src/app/api/checkout/create-payment-intent/route.ts:259-264` |
| POS card payment | inline literal | `< 50` (cents) | `src/app/api/pos/stripe/payment-intent/route.ts:29-34` |

Two of the five (`pay-link/intent`, `refund-dialog`) carry a "mirrors X"
comment. The other three carry no cross-reference.

### 3.4 Helper inventory

No helper exists. Each site re-declares the constant or inlines the
literal.

### 3.5 Constraint enforcement

- **DB:** Only on `appointments.payment_link_amount_cents` (one column).
- **Client:** Booking flow disables the "Pay deposit" button if amount < 0.50 (assumed; need to verify in `booking-wizard.tsx`). POS refund-dialog disables continue button (lines 332-340).
- **Server:** All 5 endpoints listed above.
- **Stripe:** ultimate fallback — rejects with `amount_too_small` error code if the local check is bypassed.

### 3.6 Unit handling

Three of five sites already operate in cents (integer). The booking-deposit
site uses dollars (`STRIPE_MINIMUM = 0.50`, `amount` is dollars). The two
inline-literal sites operate in cents.

**Inconsistency:** the booking-deposit site does `Math.round(amount * 100)` to convert dollars to cents AFTER the dollar-side minimum check, then passes cents to Stripe. The other four sites work in cents end-to-end.

### 3.7 Integration with other subsystems

- **Deposits (§4):** booking flow's STRIPE_MINIMUM gates the booking deposit input. If the admin sets `default_deposit_amount` to a value below $0.50, customers will be unable to book with a deposit. (Practically unlikely — current default is $50.)
- **Pay-link (§4):** STRIPE_MIN_AMOUNT_CENTS gates both the send-time pre-validation and the eventual pay-time intent creation. The DB CHECK on `payment_link_amount_cents` is the third layer.
- **Refunds (§8):** Stripe partial refunds must each meet the minimum. The refund-dialog at line 332 enforces a per-source partial floor; the source-plan logic in `src/lib/refunds/source-plan.ts` likely deals with this when fanning out refunds across multiple payment intents.
- **Tips:** A subtotal below $0.50 plus a tip that pushes it over $0.50 — the gross amount sent to Stripe is `subtotal + tip`. The Stripe minimum is on the total charge, not the subtotal. Currently no site enforces "subtotal must be ≥ minimum, ignoring tip" — meaning a $0.30 product with a $0.30 tip = $0.60 total works (the Stripe minimum IS met). This appears acceptable.

### 3.8 Migration considerations

**Unify-1 consolidation:** Create `STRIPE_MIN_AMOUNT_CENTS = 50` as a single export in `src/lib/utils/money.ts` (or `src/lib/utils/constants.ts`). All 6 sites import from it. The booking-deposit site additionally exports a `STRIPE_MIN_DOLLARS = STRIPE_MIN_AMOUNT_CENTS / 100` for legacy dollar-input until that site migrates.

**DB CHECK preservation:** When `appointments.payment_link_amount_cents` is renamed (no migration; already cents) or aligned with siblings in Family C migration, the CHECK constraint stays as-is.

**No other DB CHECKs needed:** Stripe minimum is an integration-level concern, not a domain invariant — adding CHECK to every money column would over-constrain (refunds, drawer counts, etc. don't have a minimum).

### 3.9 Open questions

- **Q3.1** (orthogonal — quality) — Should there be a single source-of-truth constant or duplicate-constants-with-"mirrors" comments? The phone-lint precedent suggests one canonical export. Unify-1 is the right time.
- **Q3.2** (verification, not blocking) — Does the booking-wizard client UI also enforce the $0.50 floor? Not verified in this audit. If client doesn't, then a sub-50¢ booking flow lands on a server 400. Acceptable but worse UX.

---

## Subsystem 4: Deposits

### 4.1 Business rule statement

A booking-time **deposit** is a partial payment customers make to reserve
a service slot. The deposit amount is configured globally
(`business_settings.default_deposit_amount`) and stored on each
appointment (`appointments.deposit_amount`). When the service is
completed and the POS rings up the transaction, the deposit is applied
as a credit (`transactions.deposit_credit`) to reduce the balance due.

The pipe is one-way: deposit configured → appointment.deposit_amount →
transaction.deposit_credit. A second concept, the **payment link**
(`appointments.payment_link_amount_cents`), is a one-time Stripe charge
for a specific dollar amount tied to an appointment (e.g. invoice for
remaining balance after deposit).

### 4.2 Data model

**`business_settings`** (`DB_SCHEMA.md:248-265`):
- `key TEXT` — generic key/value store, JSONB value
- Money keys: `default_deposit_amount` (JSON number, dollars). **Also** `tax_rate` (JSON number, decimal — see §9 finding).

**`appointments`** (`DB_SCHEMA.md:176-189`):
- `payment_type TEXT` — `deposit | pay_on_site | full` (CHECK constraint `appointments_payment_type_check`)
- `deposit_amount NUMERIC(10,2)` — nullable, set at booking time if `payment_type='deposit'`
- `payment_link_amount_cents INTEGER` — nullable, set when staff sends a custom payment link
- `payment_link_token TEXT UNIQUE` (partial unique index — DB_SCHEMA.md:193)
- `payment_link_sent_at`, `payment_link_paid_at TIMESTAMPTZ`
- `stripe_payment_intent_id TEXT` — for the booking-time deposit's PI
- `payment_status payment_status` — enum: `pending|partial|paid|refunded|partial_refund`

**`transactions`** (`DB_SCHEMA.md:2942`):
- `deposit_credit NUMERIC(10,2) NOT NULL DEFAULT 0` — credit applied at POS checkout from a prior deposit payment

**`payments`** — the booking deposit creates a row here too (with method = 'card' usually).

### 4.3 Code paths

**Write path 1: Booking-time deposit setup.**
- `src/app/api/book/payment-intent/route.ts` creates the Stripe PI (lines 38-45) with `isDeposit: true` metadata.
- `src/app/api/book/route.ts:325-540` handles the booking submission. Sets `appointments.deposit_amount = data.deposit_amount` (line 357), `appointments.payment_type = 'deposit'` (line 356), `stripe_payment_intent_id`.
- Inserts a `transactions` row representing the deposit payment (line 419+) with `total_amount = depositAmount`.
- Inserts a `payments` row tied to the deposit transaction (line 447+).
- Updates `appointments.payment_status` based on whether deposit covers full vs partial.

**Write path 2: Custom payment-link.**
- POS staff opens `<send-payment-link-dialog>` for an appointment.
- Server endpoint `src/app/api/pos/appointments/[id]/send-payment-link/route.ts:47-...` validates `amount_cents` (lines 72-88), checks STRIPE_MIN_AMOUNT_CENTS, generates a token, sets `appointments.payment_link_token`, `payment_link_amount_cents`, `payment_link_sent_at`.
- Customer visits `/pay/[token]` → `src/app/api/pay/[token]/intent/route.ts:88-99` creates Stripe PI for `chargeCents = min(payment_link_amount_cents, remainingCents)`.
- Stripe webhook (`src/app/api/webhooks/stripe/route.ts:63-247`) handles `payment_intent.succeeded` with `type === 'appointment_payment_link'` metadata: updates `payment_link_paid_at`, clears `payment_link_amount_cents` (line 215), inserts a transactions+payments row representing the link payment.

**Read path 1: POS checkout populates deposit_credit.**
- `src/app/api/pos/jobs/[id]/checkout-items/route.ts:243-291` looks up the appointment, sees `payment_type === 'deposit'` and `deposit_amount > 0`, returns `deposit_amount` in the response payload.
- Receipt-side: the POS ticket reducer applies this as `depositCredit` in totals math (`pos/utils/tax.ts:25,33`).
- Plus "prior_payments" total — the sum of all `payments.amount` for transactions tied to this appointment (line 300-353). This includes payment-link payments and any prior in-store partial payments.

**Read path 2: POS transaction completion writes deposit_credit.**
- `src/app/api/pos/transactions/route.ts:188` — `deposit_credit: data.deposit_credit || 0` — the value flows from POS state into the new transaction row.

### 4.4 Helper inventory

- `computePaidCentsForAppointment(supabase, appointmentId)` in `src/lib/utils/mobile-service-edit.ts:96-114` — sums all `payments.amount` for transactions linked to an appointment (returns cents). Used by mobile-fee edit flow to detect prior payments.
- `attachAmountDueCents` (referenced but not located in this audit) — appears in `src/app/api/pos/jobs/[id]/route.ts` per audit-1 §A — the "what's left to pay" computation.
- No dedicated `getDefaultDepositAmount()` helper — booking-flow reads the JSONB key directly in `src/lib/data/booking.ts:254-265`.

### 4.5 Constraint enforcement

- **DB:** `appointments_payment_type_check` enforces enum values for payment_type. `payment_link_amount_cents_check` enforces `≥ 50` (Stripe minimum). No CHECK on `deposit_amount ≥ 0` or `deposit_amount ≤ total_amount` (this is the source of Q4.1).
- **App:** Booking flow client clamps the deposit input to `default_deposit_amount` from business_settings (booking-wizard.tsx:928,987). Server doesn't re-validate that deposit ≤ total — relies on client sanity.
- **Refund-path:** Refund of a transaction that has `deposit_credit > 0` recomputes refundable from `transactions.total_amount` (the post-deposit charge). The deposit itself is a separate transaction row and refundable on its own.

### 4.6 Unit handling

- `business_settings.value` for `default_deposit_amount` — JSONB stored as a JSON number, dollars (e.g. `50` → $50).
- `appointments.deposit_amount` — NUMERIC(10,2) dollars
- `appointments.payment_link_amount_cents` — INTEGER cents (the **only** explicit cents column on appointments)
- `transactions.deposit_credit` — NUMERIC(10,2) dollars
- `payments.amount` (for the deposit) — NUMERIC(10,2) dollars

**Cross-unit pitfalls:**
- `attachAmountDueCents` operates in cents but reads from dollar columns → does internal `toCents()` conversion.
- The pay-link flow is the only end-to-end cents-internal pipeline; everything else converts at the read site.

### 4.7 Integration with other subsystems

- **Stripe minimum (§3):** payment_link_amount_cents ≥ 50 enforced at three layers (DB CHECK, send-time, pay-time).
- **Refunds (§8):** A refund of a deposit-paid transaction is a refund of the deposit row (separate transaction). Refunding the final POS transaction doesn't auto-refund the deposit (different row).
- **Tax (§9):** Deposit payments are recorded as transactions with `subtotal = depositAmount`, `tax_amount = 0`, `total = depositAmount`. **Tax is NOT recomputed on the deposit transaction itself** — the booking flow at `src/app/api/book/route.ts:429` writes `total_amount: depositAmount` directly. The tax is computed later on the POS-side completion transaction, on the FULL service subtotal, and the deposit is subtracted as `deposit_credit` from the total. Net result: customer pays correct gross; tax is applied to the entire transaction at completion time.
- **Receipts:** The 19-scenario fixture suite includes "deposit-only running" and "deposit+closeout" scenarios — these are the high-risk test surfaces during migration.

### 4.8 Migration considerations

- `appointments.deposit_amount` migrates with Family C (Unify-5). NUMERIC → INTEGER cents.
- `transactions.deposit_credit` migrates with Family A (Unify-4). NUMERIC → INTEGER cents.
- `business_settings` key rename + value × 100:
  ```sql
  UPDATE business_settings
  SET value = (CAST(value AS NUMERIC) * 100)::TEXT::JSONB, key = 'default_deposit_amount_cents'
  WHERE key = 'default_deposit_amount';
  ```
  Plus a follow-up read-site update in `src/lib/data/booking.ts:254-265` to switch the key name.
- `appointments.payment_link_amount_cents` is already cents — no data migration. Optional naming alignment with siblings (rename to `payment_link_amount_cents` already cents-suffixed; siblings post-migration are also `_cents`-suffixed).
- The booking-wizard's `bookingConfig.default_deposit_amount` (booking-wizard.tsx:928) and POS deposit-credit math (pos/utils/tax.ts:33) need cents conversion in their respective family phases.

### 4.9 Open questions

- **Q4.1** (blocks Unify-5) — Are there any cases where `appointments.deposit_amount > appointments.total_amount`? E.g. customer paid $50 deposit, then services dropped to $40 total. Currently no CHECK constraint prevents this. What's the reconciliation policy? (Stated in prompt as Open Q.)
- **Q4.2** (blocks Unify-5) — Should `appointments.deposit_amount_cents` get a `CHECK (deposit_amount_cents IS NULL OR deposit_amount_cents >= 0)`? Currently no non-negative CHECK. Worth adding for defense-in-depth.
- **Q4.3** (orthogonal) — Does the booking flow at `/api/book/route.ts` validate `deposit_amount <= total_amount` server-side? Audit-2 saw client-side clamp but didn't fully verify the server.
- **Q4.4** (blocks Unify-Final) — Should the playbook's two-phase commit pattern (add new column, drop old later) be applied here even though `payment_link_amount_cents` is already correctly named? The siblings rename to `_cents`-suffix and the existing one stays — minor naming inconsistency for ~1 phase between Unify-5 and Unify-Final.

---

## Subsystem 5: Mobile Surcharge

### 5.1 Business rule statement

A mobile-service appointment carries a surcharge ($X added to the bill)
that reflects the travel distance. Zones are **distance-based, not
ZIP-based** — each zone has `min_distance_miles` and `max_distance_miles`
plus a flat surcharge. At job creation, staff picks a zone (or enters a
custom amount); the surcharge is snapshotted from the live `mobile_zones`
row at save time (Phase Mobile-1 Option α — historical accuracy).

Custom-amount path: bypasses zone match; cashier enters surcharge directly
(capped at $500); zone_id stays null and `mobile_zone_name_snapshot`
holds a free-text label.

The mobile surcharge is **non-taxable** (LOCKED-2 of Phase Mobile-1 per
`mobile-service-edit.ts:32-38` and `checkout-items/route.ts:269`).

### 5.2 Data model

**`mobile_zones`** (`DB_SCHEMA.md:1412-1429`):
- `name TEXT` — display label
- `min_distance_miles NUMERIC(5,1)` — inclusive lower bound
- `max_distance_miles NUMERIC(5,1)` — inclusive upper bound
- `surcharge NUMERIC(10,2)` — flat dollar surcharge
- `is_available BOOLEAN` — toggle
- `display_order INTEGER`

**`appointments`** (mobile fields, `DB_SCHEMA.md:159-162,184,187`):
- `is_mobile BOOLEAN NOT NULL DEFAULT false`
- `mobile_zone_id UUID FK → mobile_zones(id) ON DELETE SET NULL` — null for custom-amount path
- `mobile_address TEXT`
- `mobile_surcharge NUMERIC(10,2) DEFAULT 0`
- `mobile_zone_name_snapshot TEXT` — captures zone name (or custom label) at save time

**`quotes`** (mobile fields):
- `mobile_surcharge NUMERIC(10,2)` (DB_SCHEMA.md:2074 — verified)

**CHECK constraint:** `appointments_mobile_consistency`:
```
CHECK ((is_mobile = false AND mobile_surcharge = (0)::numeric)
    OR (is_mobile = true AND mobile_surcharge > (0)::numeric))
```
**Critical:** this constraint blocks setting mobile_surcharge to 0 on a mobile=true appointment, AND blocks setting it to nonzero on a mobile=false appointment. The migration must update this constraint atomically.

### 5.3 Code paths

**Resolver:** `src/lib/utils/resolve-mobile-fields.ts` — single source of truth (78 lines).
- Validates required fields: address (lines 73-76), zone_id OR is_custom (lines 78-88, 105-111)
- Zone path: fetches zone, validates surcharge match (`Math.abs(zone.surcharge - clientSurcharge) > 0.01`) (lines 79-95)
- Custom path: enforces `0 < amount ≤ 500`, rounds to 2 decimals (lines 112-116)
- Returns `{ isMobile, zoneId, address, surcharge, snapshotName }`

**Delta helper:** `src/lib/utils/mobile-service-edit.ts:computeAppointmentDelta` (lines 32-54)
- Operates in cents internally via `toCents(input.newSurcharge) - toCents(input.currentSurcharge)`
- Adjusts subtotal + total by delta. **Does NOT adjust tax** (mobile fee is non-taxable per LOCKED-2)
- Returns dollar values (rounded to 2 decimals at boundary)

**JSONB sync helper:** `applyMobileEditToJobServices` (mobile-service-edit.ts:74-88)
- Strips existing `is_mobile_fee=true` entries from `jobs.services` JSONB
- Appends fresh synthetic entry when `is_mobile=true AND surcharge>0`

**Callers of `resolveMobileFields`:**
- Booking submission: `src/app/api/book/route.ts` (verified via audit-1)
- POS quote service: `src/lib/quotes/quote-service.ts` (re-wraps as `resolveMobileForQuote`)
- POS mobile-service PATCH: `src/app/api/pos/appointments/[id]/mobile-service/route.ts`
- Admin mobile-service PATCH: `src/app/api/admin/appointments/[id]/mobile-service/route.ts`

**Display:**
- Booking wizard: `src/components/booking/step-service-select.tsx` and others (mobile fee added as a separate line)
- POS quote/ticket: `src/app/pos/components/quotes/mobile-fee-picker.tsx`, `quote-totals.tsx`
- POS jobs detail: `src/app/pos/jobs/components/job-detail.tsx` (totals computation)
- Receipt: rendered as a synthesized line item via `mobile_fee` item_type (no DB row in transaction_items typically — defensive injection at `pos/transactions/route.ts:222-241`)

### 5.4 Helper inventory

- `resolveMobileFields` — single source of truth for validation
- `computeAppointmentDelta` — cents-internal delta math
- `applyMobileEditToJobServices` — JSONB synchronization
- `computePaidCentsForAppointment` — prior-payments sum (cents)

### 5.5 Constraint enforcement

- **DB:** `appointments_mobile_consistency` (described §5.2). No CHECK on `mobile_zones.surcharge ≥ 0` (relies on app cap).
- **App:** `MAX_CUSTOM_SURCHARGE = 500` cap (resolve-mobile-fields.ts:57). Zone-surcharge mismatch validation (line 91). Custom path requires `is_custom=true` flag plus positive amount (line 107-114).
- **Surcharge snapshot strategy:** Once an appointment is saved, the surcharge is FROZEN on `appointments.mobile_surcharge`. Future edits of the underlying `mobile_zones.surcharge` do NOT cascade to existing appointments. This is the "Option α — historical accuracy" design per `mobile-service-edit.ts:9-10`.

### 5.6 Unit handling

- Storage: NUMERIC(10,2) dollars (both `mobile_zones.surcharge` and `appointments.mobile_surcharge`).
- Internal math: `computeAppointmentDelta` operates in cents (cents-internal pattern from refund-math). Returns dollars.
- Display: `formatCurrency(surcharge)` everywhere.

### 5.7 Integration with other subsystems

- **Tax (§9):** Mobile fee is **non-taxable**. The `tax_amount` on appointments and transactions excludes the surcharge. Verified at `checkout-items/route.ts:269` (`is_taxable: false`) and at `mobile-service-edit.ts:32-38` ("tax and discount lines stay unchanged" on delta computation).
- **Quotes (§B):** `quotes.mobile_surcharge` is the same shape on quote-side. Conversion to transaction inherits the same value via the convert path.
- **Refunds (§8):** Mobile-fee line is refundable like any line item. Its `is_taxable=false` means refund-math doesn't allocate tax to it; the discount-share allocation works normally.
- **Receipts:** Mobile fee surfaces as a synthetic line in the receipt composer.

### 5.8 Migration considerations

- `mobile_zones.surcharge` migrates with Family C (Unify-5). NUMERIC → INTEGER cents.
- `appointments.mobile_surcharge` and `quotes.mobile_surcharge` migrate with their respective families (C and B). The Family B (quotes) migration must remember that quotes.mobile_surcharge is unrelated to mobile_zones.surcharge (snapshotted at quote save time).
- **CRITICAL: The `appointments_mobile_consistency` CHECK constraint must be updated atomically.** New constraint:
  ```sql
  ALTER TABLE appointments DROP CONSTRAINT appointments_mobile_consistency;
  ALTER TABLE appointments ADD CONSTRAINT appointments_mobile_consistency
    CHECK ((is_mobile = false AND mobile_surcharge_cents = 0)
        OR (is_mobile = true AND mobile_surcharge_cents > 0));
  ```
- `resolveMobileFields` zone-match comparison `Math.abs(zone.surcharge - clientSurcharge) > 0.01` (line 91) becomes integer-exact: `zone.surcharge_cents !== clientSurchargeCents` (no tolerance).
- `MAX_CUSTOM_SURCHARGE = 500` becomes `MAX_CUSTOM_SURCHARGE_CENTS = 50000`.
- `computeAppointmentDelta` simplifies from "cents-internal, dollars-at-boundary" to pure cents.

### 5.9 Open questions

- **Q5.1** (blocks Unify-5) — User prompt asked: "should mobile surcharge get the whole-dollar CHECK constraint (like services), or can it be fractional like products?" Audit answer: surcharge can already be fractional in DB (NUMERIC(10,2) permits cents); but in practice all live zones use whole dollars per business convention. **Recommend: no whole-dollar CHECK; cents-precision aligns with cents-canonical and lets a future $X.50 zone be added without schema change.**
- **Q5.2** (verification, not blocking) — Are there any quote/appointment rows where `is_mobile=true` and `mobile_surcharge=0`? The CHECK constraint blocks new writes; existing rows pre-CHECK could violate. Worth a pre-migration SELECT.
- **Q5.3** (orthogonal) — Mobile fee is hardcoded non-taxable. If a future jurisdiction taxes services-with-delivery, this becomes a schema change. Not migration-relevant.

---

## Subsystem 6: Cancellation Fees

### 6.1 Business rule statement

When an appointment is cancelled, staff with the `appointments.waive_fee`
permission may set a cancellation fee. The fee is stored on
`appointments.cancellation_fee` but is **not automatically charged** —
it's recorded for tracking/audit only. The customer is not billed from
this column; if a charge is desired, staff would create a separate POS
transaction or send a payment link.

The fee mechanism is gated by feature flag `CANCELLATION_FEE` (verified
at `api/appointments/[id]/cancel/route.ts:71`). When the flag is off, the
fee is null regardless of what the form submits.

### 6.2 Data model

**`appointments`** (`DB_SCHEMA.md:169`):
- `cancellation_fee NUMERIC(10,2)` — nullable
- `cancellation_reason TEXT`

**`appointment_status`** enum includes `cancelled` (line 152).

No separate cancellation_fee transactions table — the fee is informational
only.

### 6.3 Code paths

**Write path:** `src/app/api/appointments/[id]/cancel/route.ts:30-92`
- Permission check: if `cancellation_fee != null`, require `appointments.waive_fee` permission (lines 41-44)
- Guard: cannot cancel an already-terminal-status appointment (lines 63-68)
- Feature flag check: `feeEnabled = await isFeatureEnabled(FEATURE_FLAGS.CANCELLATION_FEE)` (line 71)
- Set fee: `fee = feeEnabled ? (data.cancellation_fee ?? null) : null` (line 72)
- Update appointment: `status='cancelled'`, `cancellation_reason`, `cancellation_fee` (lines 74-84)
- Send notifications + fire webhook + check waitlist (lines 94-130)

**UI:** `src/app/admin/appointments/components/cancel-appointment-dialog.tsx`
- Form uses `cancellation_fee` as a number field
- Default value undefined (line 50)

**Display:** `src/app/admin/appointments/components/appointment-detail-dialog.tsx:351-352`
- Shows fee as red text below cancellation reason: `Fee: {formatCurrency(appointment.cancellation_fee)}`

### 6.4 Helper inventory

None. Cancellation logic is endpoint-local.

### 6.5 Constraint enforcement

- **DB:** No CHECK on cancellation_fee. Permits any value including negative (unlikely in practice but unconstrained).
- **App:** Permission gate; feature flag gate; terminal-status guard.

### 6.6 Unit handling

NUMERIC(10,2) dollars throughout. No internal cents math.

### 6.7 Integration with other subsystems

- **Deposits (§4):** A cancelled appointment may have a paid deposit. There is **no automatic logic** to convert the deposit into the cancellation fee or refund the difference. Staff handle deposit-vs-fee reconciliation manually (refund the deposit, create a separate cash sale for the fee, etc.).
- **Refunds (§8):** No coupling — cancellation_fee is a tracking column, not a transactional amount.
- **Receipts:** Not on receipts. Cancellation generates notification email but no receipt.

### 6.8 Migration considerations

- `appointments.cancellation_fee` migrates with Family C (Unify-5). NUMERIC → INTEGER cents.
- No CHECK constraint to update.
- 2-3 caller updates: cancel endpoint, cancel dialog (input parse), detail dialog (display).
- The migration could optionally add `CHECK (cancellation_fee_cents IS NULL OR cancellation_fee_cents >= 0)` for defense.

### 6.9 Open questions

- **Q6.1** (blocks Unify-5) — Are there any cases where `cancellation_fee` is configured globally (in settings) vs always per-appointment? Audit found no global setting; the fee is fully per-appointment. (Stated in prompt as Open Q.)
- **Q6.2** (orthogonal) — Should there be an audit-log entry whenever a fee is set/changed? Cancellation already logs via `logAudit` at the cancel endpoint (verified at line 165-180).
- **Q6.3** (orthogonal) — The fee is informational. Should the system ever charge it (deposit forfeit, payment link, etc.)? Currently no — separate transaction required.

---

## Subsystem 7: Cash Drawer Reconciliation

### 7.1 Business rule statement

At end-of-day, staff counts cash in the drawer and submits the count.
The system computes expected cash from the day's transactions
(opening_amount + cash_sales + cash_tips − cash_refunds) and records the
variance. Staff also enters next-day-float (cash to leave in the drawer)
and bank-deposit amount (cash going to the bank); these are usually
auto-calculated as `counted_cash − next_day_float = deposit_amount`.

A successful close fires a fire-and-forget QBO batch sync of the day's
transactions.

### 7.2 Data model

**`cash_drawers`** (`DB_SCHEMA.md:353-383`):
- `opened_at TIMESTAMPTZ`, `closed_at TIMESTAMPTZ`
- `opening_amount NUMERIC(10,2) DEFAULT 0` — manually set at drawer open
- `expected_cash NUMERIC(10,2)` — computed at close
- `counted_cash NUMERIC(10,2)` — staff input at close
- `variance NUMERIC(10,2)` — counted − expected (signed)
- `deposit_amount NUMERIC(10,2)` — bank deposit (overloaded name with appointments.deposit_amount!)
- `next_day_float NUMERIC(10,2)` — cash to leave for next day
- `cash_sales NUMERIC(10,2)` — sum of cash-paid transaction totals
- `cash_tips NUMERIC(10,2)` — sum of cash payment tip_amount
- `cash_refunds NUMERIC(10,2)` — sum of refunds on cash-paid transactions
- `total_transactions INTEGER`
- `total_revenue NUMERIC(10,2)` — all completed/partial_refund transaction totals
- `total_tax NUMERIC(10,2)` — sum of transaction.tax_amount
- `total_tips NUMERIC(10,2)` — sum of transaction.tip_amount (all methods)
- `total_refunds NUMERIC(10,2)` — sum of refund.amount
- `opened_by`, `closed_by` FK → employees

13 money columns; 1 integer column (`total_transactions`).

### 7.3 Code paths

**Write path:** `src/app/api/pos/end-of-day/route.ts:10-214`
- Permission check: `pos.end_of_day` (line 17)
- Find open drawer (lines 33-40)
- Compute today's UTC start/end (lines 43-45) — **uses UTC midnight, not PST** (Q7.4)
- Fetch today's transactions (lines 47-53), filter `status IN ('completed', 'partial_refund')`
- Aggregate: total_transactions, total_revenue, total_tax, total_tips (lines 55-59)
- Cash sales: `txList.filter(t => payment_method === 'cash').reduce(...)` (lines 62-64)
- Cash tips: query `payments` table for `method='cash'` rows in today's window, sum tip_amount (lines 67-74)
- Cash refunds: query `refunds`, then `transactions` for those refunds' transaction_id to filter cash payment_method (lines 78-105)
- Expected cash: `openingAmount + cashSales + cashTips - cashRefundsTotal` (line 109)
- Variance: `data.counted_cash - expectedCash` (line 110)
- 12 of 13 money columns get `roundTwo(n) = Math.round(n*100)/100` floor (lines 113, 117-129)
- Upsert pattern: update existing open drawer OR insert new closed drawer (lines 134-175)
- Audit log entry (lines 177-193)
- QBO batch sync fire-and-forget (lines 195-204)

**UI:** `src/app/pos/end-of-day/page.tsx`
- Form: counted_cash input, next_day_float input, deposit_amount input (defaults to auto-calc)
- Auto-deposit: `autoDeposit = Math.max(0, countedCash - nextDayFloatNum)` (line 126)
- Display: `formatCurrency(autoDeposit)` with placeholder showing the computed value (lines 488, 493)

### 7.4 Helper inventory

- `roundTwo(n) = Math.round(n*100)/100` — local utility in the route (line 113). Duplicates the round2 pattern from coupon-helpers.
- No reusable cash-drawer reconciliation module — the logic is endpoint-inline.

### 7.5 Constraint enforcement

- **DB:** No CHECK on any cash_drawers money column. variance is unsigned in the schema definition (i.e. can be negative — correct).
- **App:** Permission gate (`pos.end_of_day`). Open-drawer-or-fresh-insert is the only structural rule.
- **No max_variance threshold.** A $10,000 variance closes the drawer just as cleanly as a $0 variance. No manager-override flow.

### 7.6 Unit handling

NUMERIC(10,2) dollars throughout. All 13 money columns. Round-to-2 idiom at write time. No internal cents math.

### 7.7 Integration with other subsystems

- **Transactions (§A):** cash_drawers is fully derived from transactions + payments + refunds rows. Re-computing a drawer row from its source rows is feasible.
- **QBO:** End-of-day triggers a batch sync of transactions (not the drawer itself — drawers aren't synced to QBO).
- **Audit log:** End-of-day writes an audit row.

### 7.8 Migration considerations

- All 13 money columns migrate with Family A (Unify-4). NUMERIC → INTEGER cents.
- `roundTwo` floor disappears (integer math is exact).
- The aggregation step (lines 55-105) becomes integer-exact:
  - `totalRevenueCents = txList.reduce((s, t) => s + (t.total_amount_cents || 0), 0)`
  - No more rounding step at line 113.
- Backfill option: instead of `× 100` on existing cash_drawers rows, **recompute from source**. The playbook Q2 already raised this. Recommendation: recompute for accuracy.

### 7.9 Open questions

- **Q7.1** (blocks Unify-4) — Should backfill be `× 100` on existing drawers or recompute from source (transactions + payments + refunds)? Recompute is stricter; × 100 is faster. (Already in playbook Q2.)
- **Q7.2** (business policy) — Is there a max_variance threshold above which end-of-day should require manager override? Currently no. (Stated in prompt as Open Q.)
- **Q7.3** (orthogonal) — `cash_drawers.deposit_amount` and `appointments.deposit_amount` are two unrelated columns with the same name (overloaded). Migration phase opportunity to rename the cash-drawer one to `bank_deposit_amount_cents` for clarity? Optional; the contexts disambiguate at read sites.
- **Q7.4** (orthogonal — bug?) — End-of-day's "today" window uses UTC midnight (`new Date(today.getFullYear(), today.getMonth(), today.getDate())` is local-time midnight, but `.toISOString()` converts to UTC) — a PST 11pm close-out gets the UTC-midnight-truncated previous day in some windows. Worth verifying separately from the money migration.

---

## Subsystem 8: Refund Residual Distribution

### 8.1 Business rule statement

When refunding multiple lines with a transaction-level discount, the
per-line refundable amounts (after share-of-discount allocation) may sum
to a value ±N cents off from the rounded-once total. The residual is
distributed by adding/subtracting 1 cent to the largest-absolute-value
lines, then 2 cents to the largest, etc., until the line sum equals the
target total exactly.

This guarantees: stored line cents sum equals total cents, with tolerance 0.

### 8.2 Data model

`refunds.amount` NUMERIC(10,2). `refund_items.amount` NUMERIC(10,2).
After Family A migration, both become INTEGER cents. Currently
refund-math.ts internally computes cents, then converts to dollars at
the DB write boundary in `/api/pos/refunds/route.ts`.

### 8.3 Code paths

**The function:** `src/lib/utils/refund-math.ts:167-198`

Algorithm walkthrough:
1. Copy input array (`result = lineAmounts.slice()`).
2. Early return if `residual === 0 || result.length === 0`.
3. Sort indices by absolute-value descending, stable tiebreak by index.
4. Direction: +1 if residual > 0, -1 if < 0.
5. Full sweeps (line 187-190): while `remaining >= line_count`, add `direction` to every line, decrement remaining by line_count.
6. Leftover (lines 193-195): top `remaining` lines (by abs-sort) each get one more `direction`.

**Worked example** — `distributeResidualCents([889, 1, 1], 1)`:
- Sort: indices [0, 1, 2] (by abs: 889, 1, 1; ties resolved by original index)
- Direction +1, remaining 1
- Full sweeps: skipped (remaining < line_count)
- Leftover: result[sortedIndices[0]] += 1 → result[0] = 890
- Return `[890, 1, 1]`

**Caller:** Only `computeTotalRefundCents` (line 148):
```js
const redistributed = distributeResidualCents(lineAmounts, residual);
```

### 8.4 Helper inventory

`distributeResidualCents` and its caller `computeTotalRefundCents` plus
the per-unit/per-line helpers (`computePerUnitRefundableCents`,
`computeRefundLineAmountCents`) all in `refund-math.ts`.

### 8.5 Constraint enforcement

- **Algorithmic invariant:** `Math.abs(residual) ≤ items.length` in practice (one cent per item max), but the algorithm gracefully handles `remaining ≥ result.length` via full sweeps (defensive guardrail).
- **Server recompute invariant:** `/api/pos/refunds/route.ts` recomputes the total independently and rejects if it doesn't exactly match the client's sent amount (tolerance 0). ADR-0003 invariant 4.

### 8.6 Unit handling

Pure cents internally. No dollars at any point in the residual-distribution path.

### 8.7 Integration with other subsystems

- **Coupons (§1):** Per-line discount share allocation produces the fractional cents that drive the residual.
- **Loyalty (§2):** Loyalty discount is part of `transactions.discount_amount` (composite) → fed into `computePerUnitRefundableCents.tx_discount_amount` (line 69). Same flow.
- **Tax (§9):** Tax is computed pre-discount per line; refund pulls `transaction_items.tax_amount` directly (line 67). The residual is on the (subtotal + tax − discount_share) per line.

### 8.8 Migration considerations

The math is **already cents-native and fully tested**. Migration impact: **zero**.

Indirect impact: `refund-math.ts` is renamed to `money.ts` in Unify-1; importers update import paths in their respective family phases. The 4 helpers stay byte-identical.

The data conversion at the DB write boundary in `refunds/route.ts` (currently `fromCents()` at write time) becomes a no-op when `refunds.amount` becomes `refunds.amount_cents` in Family A — the write site stores the cents value directly.

### 8.9 Open questions

- **Q8.1** (verification, not blocking) — The tests cover residual up to magnitude > line_count (full-sweep defensive guard tested at line 254-256). Are there real-world cases that hit this branch? Likely not — but the test exists. Worth noting as defensive.
- **Q8.2** (edge case) — When `transaction.subtotal === 0` (e.g. fully-discounted comped sale) and a refund is requested, `computePerUnitRefundableCents` returns `itemSubtotal + itemTax - 0 = itemSubtotal + itemTax` (no share allocation). Test at refund-math.test.ts:82-91 confirms behavior. Not migration-relevant.
- **Q8.3** (edge case) — When ALL lines have equal absolute value and residual > 0, the tiebreak goes by original index — earlier indices win. Stable, predictable, tested at refund-math.test.ts:258-260.

---

## Subsystem 9: Tax Computation

### 9.1 Business rule statement

Sales tax at 10.25% (CA rate) applies to **products only**, not services
(`TAX_PRODUCTS_ONLY = true` in constants.ts:8). Per-item taxability is
determined by the item's `is_taxable` flag (products usually true,
services usually false). Tax is computed on the **pre-discount** line
subtotal. Transaction-level discounts (coupon, loyalty, manual) reduce
the total at the totals stage but never feed back into per-line
tax_amount.

When tax rate changes (e.g. new city rate), in-flight quotes and
appointments are **NOT re-priced** — the stored tax is the historical
value at the time of original computation. (Open Q9.4 — but the
existing snapshot pattern on mobile-fee suggests this is the convention.)

### 9.2 Data model

**Constants** (`src/lib/utils/constants.ts:7-9`):
- `TAX_RATE = 0.1025` (the actual runtime rate)
- `TAX_PRODUCTS_ONLY = true` (currently consulted only in comments — see §9.5)

**`business_settings`** keys (JSONB value, dollars-naive):
- `tax_rate` — written by admin UI (tax-config/page.tsx:100) but **no caller reads from this key**. The constant is the authoritative source. **This is a real disconnect.**
- `tax_products_only` — written by admin UI (tax-config/page.tsx:101 implied) — same disconnect status.

**Per-item taxability:**
- `products.is_taxable BOOLEAN` (verified at admin/catalog/products/new/page.tsx:418)
- `services.is_taxable BOOLEAN` (verified at admin/catalog/services/new/page.tsx:401)

**Per-line tax storage:**
- `transaction_items.tax_amount NUMERIC(10,2)` (DB_SCHEMA.md:2889)
- `quote_items` — has `tax_amount` (verified via audit-1)

**Aggregate tax storage:**
- `transactions.tax_amount NUMERIC(10,2)` — sum of transaction_items.tax_amount
- `quotes.tax_amount NUMERIC(10,2)` — sum of quote_items
- `appointments.tax_amount NUMERIC(10,2)` — sum at booking time

### 9.3 Code paths

**Per-item tax math:** `src/app/pos/utils/tax.ts:8-11`
```js
export function calculateItemTax(price: number, isTaxable: boolean): number {
  if (!isTaxable) return 0;
  return Math.round(price * TAX_RATE * 100) / 100;
}
```

**Caller sites (8 in POS reducers):** `src/app/pos/context/quote-reducer.ts` lines 83, 102, 141, 202, 252, 287, 319, 341, 461. Plus `ticket-reducer.ts:80, 99, 161, ...`.

**Aggregate computation:** `calculateTicketTotals` (`src/app/pos/utils/tax.ts:22-43`)
- Sum item tax_amounts
- Subtract discount + deposit_credit + prior_payments + mobile_surcharge from gross
- Round each output to 2 decimals (lines 38-41)

**Quote-service tax:** `src/lib/quotes/quote-service.ts:139-147,316-320`
- `taxableAmount = items.filter(i => i.product_id != null).reduce(...)` (line 139 implied)
- `taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100` (line 147, 316)
- Stored on quote row

**Booking flow tax:** `src/app/api/book/route.ts` — uses quote-service or its own analog (not fully read in this audit, but the constant is imported per audit-1).

### 9.4 Helper inventory

- `calculateItemTax(price, isTaxable)` — per-line
- `calculateTicketTotals(items, discount, depositCredit, priorPayments, mobileSurcharge)` — aggregate
- No `calculateQuoteTax` — quote-service has its own inline math.

### 9.5 Constraint enforcement

- **DB:** No CHECK on tax_amount.
- **App:** `is_taxable === false → returns 0` (constants-driven per-line).
- **No tax-exempt customer flag** at the customer level (verified — no `is_tax_exempt` column on customers). Exemption flows through item-level `is_taxable=false` only.
- **TAX_PRODUCTS_ONLY = true** is declared in constants but **not consulted in code** — the actual gating happens via `is_taxable` per item. If `TAX_PRODUCTS_ONLY` were toggled, nothing would change unless someone wires it in.

### 9.6 Unit handling

NUMERIC(10,2) dollars everywhere. The pattern `Math.round(price * TAX_RATE * 100) / 100` is the dollars-precision floor (the same idiom as `roundTwo`).

After migration to cents:
```js
export function calculateItemTaxCents(priceCents: number, isTaxable: boolean): number {
  if (!isTaxable) return 0;
  // TAX_RATE = 0.1025 → bps = 1025 → priceCents * 1025 / 10000
  // Or just: Math.round(priceCents * 0.1025)
  return Math.round(priceCents * TAX_RATE);
}
```
Single rounding site; no double-multiply-by-100.

### 9.7 Integration with other subsystems

- **Coupons (§1) + Loyalty (§2):** Transaction-level discounts don't reduce per-line tax_amount (refund-math invariant). Customer pays `subtotal + tax − discount` at totals stage.
- **Mobile (§5):** Mobile fee is non-taxable.
- **Refunds (§8):** Per-line tax is included in the per-unit refundable amount (`itemTaxCents = toCents(tax_amount)` at refund-math.ts:67).
- **QBO sync:** **QBO sync does NOT send a tax line.** The Sales Receipt payload has line items, optionally a discount line, but no `TxnTaxDetail`. The line `Amount` is the pre-tax unit_price * qty. **Net result: QBO sees a lower-total than the customer paid** (by the tax amount). Verified at `src/lib/qbo/sync-transaction.ts:280-294` — only DiscountLineDetail is added; no TaxLineDetail.

This is a real finding that's orthogonal to the cents migration but worth flagging: the existing QBO sync drops tax. Either QBO is configured to compute its own tax on the SmartDetails Customer profile, or QBO is recording lower revenue than the POS shows. **Open Q9.5.**

### 9.8 Migration considerations

- `transactions.tax_amount`, `transaction_items.tax_amount` migrate with Family A.
- `quotes.tax_amount`, `quote_items.tax_amount` with Family B.
- `appointments.tax_amount` with Family C.
- `calculateItemTax` rewrite to `calculateItemTaxCents(priceCents, isTaxable)` returning cents. Single-round at the boundary.
- `TAX_RATE = 0.1025` stays as-is (it's a rate, not a money value). Could be re-expressed as `TAX_RATE_BPS = 1025` (basis points) for clarity and to enable `Math.round(priceCents * TAX_RATE_BPS / 10000)` integer math. Recommendation: KEEP `TAX_RATE = 0.1025` as the source of truth; the per-line rounding step naturally handles the precision.

### 9.9 Open questions

- **Q9.1** (blocks Unify-1 OR Unify-4) — **Dead UI bug**: admin saves `tax_rate` to `business_settings` but no caller reads it. Should the migration phase: (a) wire the constant to read from business_settings (and delete the constant), (b) delete the admin UI (and keep the constant), or (c) defer to a separate phase outside the money epic? Recommendation: defer to a separate ticket; this isn't a money-unit problem.
- **Q9.2** (blocks Unify-1) — Should `TAX_RATE` be re-expressed as `TAX_RATE_BPS = 1025` or stay as `0.1025`? Recommend stay — it's a rate, not money.
- **Q9.3** (orthogonal) — `TAX_PRODUCTS_ONLY = true` is declared but unused. Migration phase opportunity to either delete the constant or wire it as a gate (`isTaxable && !TAX_PRODUCTS_ONLY ? 0 : computedTax` — but this inverts current behavior, so probably just delete).
- **Q9.4** (business policy — stated in prompt) — When tax rate changes, what happens to in-flight quotes/appointments? Re-price or grandfather? Current behavior: tax stored on `quotes.tax_amount` at quote creation time → grandfather. New quote after rate change → new rate.
- **Q9.5** (orthogonal — finding) — QBO sync drops tax. Worth a separate investigation; not part of cents migration.

---

## Cross-Subsystem Flows

### Flow 1: Booking with deposit, coupon, and tax

| Step | Action | Money state | Unit (current → target) |
| --- | --- | --- | --- |
| 1 | Customer selects services on booking wizard | Items list with unit_price | dollars (svc.flat_price etc.) → cents |
| 2 | Customer applies coupon code | `/api/book/validate-coupon` → calculateCouponDiscount → returns `total_discount` | dollars → cents |
| 3 | Booking wizard computes totals | itemsSubtotal − coupon_discount + tax (computed on PRE-discount taxable items) + mobile_surcharge | dollars; wizard's local math → cents after Unify-5 |
| 4 | Customer chooses to pay deposit | `bookingConfig.default_deposit_amount` from `business_settings` | JSONB dollars → JSONB cents |
| 5 | Stripe PI created via `/api/book/payment-intent` | `amountInCents = Math.round(amount * 100)` | dollars input → cents to Stripe (already cents at wire) |
| 6 | Customer pays | Stripe webhook (NOT for booking deposit — booking uses synchronous flow) | — |
| 7 | `/api/book/route.ts` writes appointment | `deposit_amount`, `coupon_discount`, `tax_amount`, `subtotal`, `total_amount` | dollars → cents (Family C) |
| 8 | Deposit transaction row written | `transactions.total_amount = depositAmount`, no tax on deposit | dollars → cents (Family A) |
| 9 | Coupon use_count incremented | `coupons.use_count += 1` (write path 4 in §1.3 — need to verify booking flow does this) | integer (no money) |

**Cross-table writes that must remain transactionally consistent during migration:**
- appointment row + deposit transaction row + payment row + coupon increment must land atomically (currently sequential Supabase calls, not in a real transaction)
- If migration runs mid-booking and one side is migrated and another isn't, the booking partially-fails. Mitigation: deploy migrations during quiet windows; no booking concurrent with migration.

### Flow 2: POS sale with loyalty redeem and tips

| Step | Action | Money state | Unit (current → target) |
| --- | --- | --- | --- |
| 1 | Cashier adds services + products to ticket | items[] with totalPrice, taxAmount per line | dollars → cents (Family A) |
| 2 | Cashier looks up customer; loyalty panel shows balance × REDEEM_RATE | `balance * 0.05` dollar value | dollars; → cents (`balance * 5`) |
| 3 | Customer redeems $X | `pointsToRedeem = Math.ceil(X / REDEEM_RATE)` → `loyaltyDiscount = pointsToRedeem * REDEEM_RATE` | dollars → cents (use REDEEM_RATE_CENTS = 5) |
| 4 | ticket-reducer combines discounts | `discountAmount = coupon.discount + loyaltyDiscount + manualDiscount` | dollars → cents (composite) |
| 5 | Tax computed pre-discount per line | `calculateItemTax(price, isTaxable)` | dollars → cents |
| 6 | Cashier collects card payment + tip | tipAmount on payment; total includes tip | dollars → cents (Family A) |
| 7 | Stripe Terminal charges card | sent as cents (already cents at wire) | — |
| 8 | `/api/pos/transactions` writes transaction + items + payments | All money columns | dollars → cents (Family A) |
| 9 | Loyalty points earn: floor((subtotal − discount) × EARN_RATE), excluding water | new pointsEarned | integer (no money) |
| 10 | Customer balance updated; loyalty_ledger row appended | integer adjustments | integer |
| 11 | Coupon use_count incremented (if coupon present) | integer | integer |
| 12 | Tip net computed (5% CC fee deduction) | `tip_net = tip - tip * CC_FEE_RATE` (assumed at receipt-template.ts level — needs verification) | dollars → cents |

**Multi-table write inconsistency window:** transaction insert → items insert → payments insert → coupon update → customer loyalty update → loyalty_ledger insert. Sequential, not transactional. Migration window must avoid live POS use.

### Flow 3: Refund of coupon+loyalty transaction

| Step | Action | Money state | Unit |
| --- | --- | --- | --- |
| 1 | Original tx: subtotal $100, tax $5.13 (5% taxable + 5% non), coupon −$10, loyalty −$2, total $93.13 | composite discount = $12 | dollars |
| 2 | Cashier refunds 1 line out of 3 (qty 1 of 3) | refund request: 1 item, partial quantity | — |
| 3 | computePerUnitRefundableCents computes share of $12 discount allocated to this line | itemSubtotal/txSubtotal × txDiscount = share | cents-internal (refund-math) |
| 4 | Single Math.round produces line cents | computeRefundLineAmountCents | cents |
| 5 | distributeResidualCents handles any 1-cent residual | redistributed[] | cents |
| 6 | Loyalty restoration: `Math.floor(loyalty_points_redeemed × (refundAmount/total_amount))` | proportional points | integer |
| 7 | Loyalty clawback: `Math.floor(loyalty_points_earned × (refundAmount/total_amount))` | proportional points | integer |
| 8 | Coupon use_count decremented IF newStatus === 'refunded' (full refund only) | integer (-1) | integer |
| 9 | campaigns.revenue_attributed reduced by transaction.total_amount IF full refund | NUMERIC math | dollars → cents (Family F) |
| 10 | refunds + refund_items rows written | `amount` in dollars (currently converted from cents at boundary) | dollars → cents (Family A) |
| 11 | transaction.status updated to 'partial_refund' or 'refunded' | — | — |

**Migration insight:** the residual distribution (cents-internal) is unchanged. The migration affects only the boundary conversion at step 10 (dollars-write removed).

### Flow 4: Appointment cancellation with deposit

| Step | Action | Money state | Unit |
| --- | --- | --- | --- |
| 1 | Customer cancels via portal OR staff cancels via admin | — | — |
| 2 | If feature flag `CANCELLATION_FEE` enabled AND staff sets fee, requires `appointments.waive_fee` permission | data.cancellation_fee | dollars → cents (Family C) |
| 3 | appointments.status = 'cancelled', cancellation_fee set, cancellation_reason set | — | — |
| 4 | NO automatic charge of the fee | — | — |
| 5 | NO automatic refund of the deposit | — | — |
| 6 | Staff manually reconciles: refund deposit, create cash sale for fee, OR forfeit deposit (set fee = deposit_amount, no actual money movement) | — | — |
| 7 | Notifications fired; webhook fired; waitlist scanned | — | — |

**Migration insight:** No multi-table money math. Migration of `appointments.cancellation_fee` is trivial (rename + × 100).

### Flow 5: Mobile job with surcharge and tax

| Step | Action | Money state | Unit |
| --- | --- | --- | --- |
| 1 | Booking wizard: customer enables mobile, selects zone (or types address) | mobile_surcharge from zone | dollars → cents |
| 2 | Booking submission: `resolveMobileFields` validates zone match, snapshots surcharge | appointments.mobile_surcharge = zone.surcharge | dollars → cents (Family C) |
| 3 | Tax computed on items only (mobile fee is non-taxable per CHECK in code, item.is_taxable=false) | `tax_amount = itemsTax`, mobile NOT in tax base | dollars → cents |
| 4 | appointments.subtotal = sum(appointment_services.price_at_booking) + mobile_surcharge | NUMERIC sum | dollars → cents |
| 5 | appointments.total_amount = subtotal + tax_amount − discount | — | dollars → cents |
| 6 | POS checkout pulls deposit_credit and mobile_surcharge; ticket-reducer adds mobile_fee line | item_type='mobile_fee', is_taxable=false | dollars → cents |
| 7 | Receipt renders subtotal, mobile fee line, tax, deposit credit (if any), total | display via formatCurrency → formatMoney(cents) | dollars → cents |

**Multi-write coordination:** appointment insert + appointment_services insert + (optionally) deposit transaction insert. Sequential.

### Flow 6: Cash drawer end-of-day with mixed payments

| Step | Action | Money state | Unit |
| --- | --- | --- | --- |
| 1 | Cashier closes register; UI shows expected_cash placeholder | computed live | — |
| 2 | Cashier counts physical cash, enters counted_cash | input dollars | dollars input |
| 3 | Cashier enters next_day_float; auto-deposit = countedCash − nextDayFloat | client-side math | dollars |
| 4 | POST /api/pos/end-of-day with counted_cash, next_day_float, deposit_amount | request body | dollars |
| 5 | Server: fetch today's transactions, payments (filter by cash method), refunds | aggregate sums | dollars |
| 6 | Compute expected = opening + cash_sales + cash_tips − cash_refunds; variance = counted − expected | floating-point reduce, then × 100 / 100 floor | dollars (rounded) |
| 7 | Insert/update cash_drawers row with 13 money fields | DB write | dollars → cents (Family A, recompute backfill) |
| 8 | Audit log entry | — | — |
| 9 | QBO batch sync of today's transactions, fire-and-forget | per-tx sync | dollars (QBO API requirement) |

**Migration approach:** see Flow 6's step 7 — recompute from transactions/payments/refunds at backfill time gives integer-exact cash_drawers values instead of `× 100` on already-rounded dollar values.

---

## Consolidated Open Questions

Ordered by which phase they block. **Priority 1** = blocks Unify-1; **Priority 2** = blocks specific later phase; **Priority 3** = orthogonal but worth resolving in the epic.

### Priority 1 — Block Unify-1

- **Q1.1** — Split `coupon_rewards.discount_value` into `discount_amount_cents` + `discount_percentage_bps`, or stay single-column with discount_type-aware migration? (Already in playbook Q1.)
- **Q3.1** — Consolidate STRIPE_MIN_AMOUNT_CENTS into a single export from `money.ts`, or keep 5 copies with "mirrors X" comments?
- **Q9.1** — The `tax_rate` admin UI writes a value nothing reads. Wire the constant to read from `business_settings`, delete the admin UI, or defer to a separate phase? Recommend defer.
- **Q9.2** — Re-express TAX_RATE as TAX_RATE_BPS = 1025, or keep as 0.1025 float? Recommend keep.
- **Q2.1** — Express LOYALTY.REDEEM_RATE_CENTS = 5 alongside REDEEM_RATE = 0.05? Or replace? Recommend express alongside.

### Priority 2 — Block specific later phases

- **Q1.2** (Unify-6) — Partial refunds leave use_count and revenue_attributed unchanged. Keep this behavior, or fix during migration to net attribution?
- **Q1.5** (Unify-6) — `appointments.coupon_discount` (dollars) and `orders.discount_amount` (cents) — reconciliation queries can't compare cross-table sums until both sides are in matching units. Plan order accordingly.
- **Q4.1** (Unify-5) — Cases where `deposit_amount > total_amount`? Reconciliation policy needed.
- **Q4.2** (Unify-5) — Add `CHECK (deposit_amount_cents IS NULL OR deposit_amount_cents >= 0)`? Recommend yes.
- **Q5.1** (Unify-5) — Whole-dollar CHECK on mobile_surcharge_cents? Recommend NO (preserve cents-precision for future zones).
- **Q5.2** (Unify-5) — SELECT count of rows where `is_mobile=true AND mobile_surcharge=0` BEFORE migration. The CHECK constraint blocks new writes; existing rows may violate.
- **Q7.1** (Unify-4) — Backfill cash_drawers via `× 100` or recompute from transactions/payments/refunds? (Already in playbook Q2.) Recommend recompute.
- **Q7.2** (Unify-4) — Add a max_variance threshold + manager-override flow at end-of-day? Out of scope for migration but flagged.
- **Q2.3** (Unify-8) — Max redemption per transaction beyond "subtotal-after-other-discounts"? Currently unlimited.
- **Q2.4** (Unify-8) — Do loyalty points earn on the loyalty_discount portion? Currently NO. Intentional?

### Priority 3 — Orthogonal but resolve in the epic

- **Q1.4** — `coupons.combinable_with_sales` column exists but appears unused. Is the column dead?
- **Q1.6** — Does booking flow increment coupons.use_count? Verify.
- **Q1.7** — E-commerce coupon use does NOT update campaigns.redeemed_count or revenue_attributed. Known omission?
- **Q3.2** — Booking-wizard client-side $0.50 enforcement?
- **Q4.3** — Server-side `deposit_amount <= total_amount` validation in /api/book/route.ts?
- **Q4.4** — Naming alignment for the already-correctly-named `payment_link_amount_cents` during Unify-5?
- **Q6.1** — Any global cancellation_fee configuration vs per-appointment-only? Audit found per-appointment only.
- **Q6.2** — Audit log entry when fee is set/changed? Already logged via `logAudit` in cancel route — confirmed.
- **Q6.3** — Cancellation fee — should the system charge it? Currently not; separate transaction required.
- **Q7.3** — Rename `cash_drawers.deposit_amount` to `bank_deposit_amount_cents` for clarity (vs `appointments.deposit_amount`)?
- **Q7.4** — End-of-day "today" window uses UTC midnight, not PST. Real bug? Worth separate investigation.
- **Q8.1** — Defensive full-sweep branch in distributeResidualCents — real-world cases? Likely none, but tested.
- **Q8.2** — Behavior when `transaction.subtotal === 0` and refund requested? Verified safe.
- **Q8.3** — Tiebreak in equal-line refund residual? Stable, predictable, tested.
- **Q9.3** — `TAX_PRODUCTS_ONLY = true` constant declared but unused. Delete or wire?
- **Q9.4** — Tax rate change: re-price in-flight quotes or grandfather? Current = grandfather.
- **Q9.5** — QBO sync drops tax line. Worth separate investigation outside this epic.

---

## Migration Impact on Playbook

### Section A — Things the playbook got right

1. **8-family grouping** is structurally sound. The audit didn't surface a need to add or split families.
2. **Phase order H → E → A → C/F → B/G → D** holds up. Specifically, the rationale for catalog-last (every reader is cents-native by then) is reinforced by the multi-write inconsistency windows surfaced in Flows 1-6.
3. **Two-phase commit (add cents, drop dollars in Unify-Final)** is the right pattern for the discount-bearing rows where reconciliation queries need both columns visible until the cleanup phase.
4. **refund-math.ts → money.ts rename + Unify-1 helpers** matches the audit's finding that residual-distribution math is already cents-native and migration-impact-zero.
5. **Decision A** (add `formatMoney(cents)` alongside `formatCurrency(dollars)`) is reinforced — the audit found that gradual per-family caller migration is the only tractable path given the 437 Pattern-A call sites.
6. **Family A as solo phase** is reinforced — the audit surfaced that transactions touches loyalty, coupons, deposit_credit, cash_drawers, refund residuals, AND has the 19-scenario receipt fixture suite as its safety net.

### Section B — Things the playbook missed

1. **`appointments_mobile_consistency` CHECK constraint must be updated atomically in Unify-5.** Playbook §Family C didn't call this out. It's the only intra-family constraint that gates the schema migration.
2. **`tax_rate` admin UI is dead code** (Q9.1) — not a money-unit problem but discovered during this audit. Worth surfacing.
3. **`TAX_PRODUCTS_ONLY` constant is declared but unused** (Q9.3) — similar.
4. **2 hardcoded `0.05` sites bypass the LOYALTY.REDEEM_RATE constant** (Q2.2) — drift risk; migration phase opportunity.
5. **STRIPE_MIN_AMOUNT_CENTS is duplicated 5 times with one site in dollars** — Unify-1 consolidation candidate. Playbook §Family C / Family E mentioned the pay-link CHECK but missed the constant duplication.
6. **`transactions.discount_amount` is a composite** (coupon + loyalty + manual). Reconciliation queries in playbook §Family A must NOT assume it equals coupon-only or loyalty-only or breakdown — it's the sum. The playbook's invariant query `SUM(transaction_items.total_price + tax_amount) - discount_amount == total_amount` is correct, but the per-component breakdown queries should be added.
7. **QBO sync drops tax line entirely** (Q9.5) — Family A's QBO sync rewrite in Unify-4 should preserve current behavior (not fix this) since it's a pre-existing condition and out of scope.
8. **Booking flow lacks server-side `deposit_amount <= total_amount` validation** (Q4.3) — not a money-unit problem but discovered.
9. **End-of-day "today" window uses UTC midnight, not PST** (Q7.4) — pre-existing bug; flagged.
10. **`mobile_zones` are distance-based, not ZIP-based** — playbook §Family C said "ZIP/address resolves to a zone" — wrong. Resolution is cashier-pick at job-creation time.

### Section C — Things that need to change in the playbook revision

1. **§Family C migration spec (Unify-5)** add an explicit step: drop `appointments_mobile_consistency` CHECK, recreate against `mobile_surcharge_cents`. Include in the LOCKED list.
2. **§Family A reconciliation queries (Unify-4)** add explicit per-component breakdown queries for `transactions.discount_amount` showing coupon vs loyalty vs manual sums.
3. **§Family F migration spec (Unify-6)** update `discount_type` enum values from `'percentage' | 'fixed_amount'` to `'percentage' | 'flat' | 'free'`. The migration script must handle all three: `flat` × 100; `free` × 100 (or stays 0); `percentage` untouched.
4. **§Unify-1 spec** add STRIPE_MIN_AMOUNT_CENTS consolidation as an explicit deliverable.
5. **§Unify-1 spec** add LOYALTY.REDEEM_RATE_CENTS as an explicit export alongside the existing REDEEM_RATE float (or replace, pending Q2.1).
6. **§Family C scope** add `business_settings.default_deposit_amount` JSONB key rename + × 100 as an explicit DB-side step.
7. **§Family F scope** add the 2 hardcoded `0.05` sites in customer-detail and messaging-summary to the rewrite list.
8. **§Decision D** clarify: QBO sync sends `Amount` as dollars (decimal) per `fromCents()` conversion at boundary — confirmed by reading sync-transaction.ts. **QBO does NOT receive tax breakout** (current behavior preserved by migration).
9. **§Family C migration spec** acknowledge the Mobile-1 snapshot pattern — `appointments.mobile_surcharge` is independent of `mobile_zones.surcharge` post-snapshot. Tax invariant verification queries must account for this.
10. **§Open Questions** add Q4.1 (deposit_amount > total_amount), Q4.2 (CHECK constraint), Q5.2 (pre-migration audit of mobile=true,surcharge=0 rows), Q1.2 (partial refund attribution policy).

### Section D — Things that need new phases or new scope

1. **No new families needed.** The 8-family grouping covers everything found.
2. **Optional new phase: Unify-1.5 (Constant Consolidation)** before Family migrations. Scope: STRIPE_MIN_AMOUNT_CENTS unification, LOYALTY.REDEEM_RATE_CENTS export, 2 hardcoded 0.05 fixes. Could fold into Unify-1 instead — recommend folding to keep phase count at 10.
3. **Optional follow-up phase (outside this epic): Tax-Rate-Plumbing.** Wire `business_settings.tax_rate` to a runtime helper; delete the hardcoded TAX_RATE if read site exists. Or delete the admin UI if no read site is desired. Either way, this is an architectural cleanup, not a unit-migration.
4. **Optional follow-up phase (outside this epic): QBO-Tax-Sync.** If the business wants QBO to record tax separately, that's a meaningful integration change.
5. **Optional follow-up phase (outside this epic): EOD-Variance-Threshold.** Q7.2 — manager-override flow above a configurable threshold.
6. **The playbook's Open Q3 (fixture diff policy)** is reinforced — the 19-scenario receipt fixtures are unchanged-by-design under the migration. The audit confirmed no fractional-cent storage in production paths (NUMERIC(10,2) constraint), so byte-identical regeneration is expected and any diff is a bug.
7. **Add a pre-migration data audit phase (Unify-0.5? or as Unify-1 precondition).** SELECT queries:
   - Mobile-fee CHECK violators: `SELECT COUNT(*) FROM appointments WHERE is_mobile = true AND mobile_surcharge = 0` (Q5.2)
   - Deposit overage: `SELECT COUNT(*) FROM appointments WHERE deposit_amount > total_amount` (Q4.1)
   - Discount-amount sanity: `SELECT COUNT(*) FROM transactions WHERE discount_amount < 0 OR discount_amount > total_amount + tax_amount + 100` (sanity check on composite)
   - business_settings money keys: `SELECT key, value FROM business_settings WHERE key IN ('default_deposit_amount', 'tax_rate', 'tax_products_only')`
   - Coupon usage-count vs completed transactions:
     ```sql
     SELECT c.id, c.code, c.use_count, COUNT(t.id) as completed_count
     FROM coupons c LEFT JOIN transactions t ON t.coupon_id = c.id AND t.status = 'completed'
     GROUP BY c.id, c.code, c.use_count
     HAVING c.use_count != COUNT(t.id);
     ```

Recommend running this pre-migration audit at the start of Unify-1 or as a separate 30-minute fact-finding session.

---

## Honest Limitations of This Audit

1. **`/api/book/route.ts` not fully read.** Audit-2 spot-checked deposit + appointment writes but did not exhaustively trace every money path through booking submission. Q1.6 (booking coupon use_count), Q4.3 (server-side deposit validation), and Q9 booking-tax math are partial.
2. **POS sync-offline-transaction route not fully read.** It's a parallel write path to /api/pos/transactions and may have its own discount/loyalty/tax math.
3. **Voice-agent paths spot-checked only.** ElevenLabs integration touches quotes; quote-service is canonical, but voice paths could have their own per-flow math.
4. **Quote-service deep dive deferred.** Audit-2 confirmed quote-service uses TAX_RATE and `resolveMobileForQuote` but did not exhaustively trace every quote-side calculation.
5. **Cash-drawer "today" window UTC bug not verified end-to-end.** The code at end-of-day/route.ts:43-45 looks suspicious; Q7.4 flagged for separate investigation.
6. **No SELECT queries actually run against the live DB.** Audit was code-and-schema only. The pre-migration data audit (Section D §7) is a recommendation, not executed.
7. **Receipt-template.ts not deep-read.** Tip-net CC fee math at Flow 2 step 12 was assumed based on `CC_FEE_RATE = 0.05` constant; not verified at the receipt-render boundary.
8. **`combinable_with_sales` mystery (Q1.4) not resolved.** Column exists in schema; helper hardcodes the exclusion. Could be dead code; could be consulted somewhere greppable but not in this audit's scope.

---

## Reproducing the Audit

```sh
# Coupon code paths
grep -rn "calculateCouponDiscount\|use_count\|coupon_discount" src/ --include="*.ts" --include="*.tsx"

# Loyalty constants + math
grep -rn "LOYALTY\|REDEEM_RATE\|EARN_RATE\|loyalty_points_" src/ --include="*.ts" --include="*.tsx"

# Stripe minimum sites
grep -rn "STRIPE_MIN\|STRIPE_MINIMUM\|< 50\b" src/ --include="*.ts" --include="*.tsx" | grep -iE "stripe|minimum|amount|cents"

# Deposit pipe
grep -rn "deposit_amount\b\|deposit_credit\b\|default_deposit_amount\|payment_link_amount_cents" src/ --include="*.ts" --include="*.tsx"

# Mobile surcharge
grep -rn "mobile_surcharge\|mobile_zone\|MAX_CUSTOM_SURCHARGE\|resolveMobileFields" src/ --include="*.ts" --include="*.tsx"

# Cancellation
grep -rn "cancellation_fee\|cancellation_reason" src/ --include="*.ts" --include="*.tsx"

# Cash drawer
grep -rn "cash_drawers\|counted_cash\|expected_cash\|next_day_float\|cash_tips" src/ --include="*.ts" --include="*.tsx"

# Refund math
cat src/lib/utils/refund-math.ts
cat src/lib/utils/__tests__/refund-math.test.ts | grep -E "^describe|^  it"

# Tax computation
cat src/app/pos/utils/tax.ts
grep -rn "TAX_RATE\|calculateItemTax\|TAX_PRODUCTS_ONLY" src/ --include="*.ts" --include="*.tsx"

# business_settings money keys
grep -rn "key:.*default_deposit\|key:.*tax_rate\|business_settings.*eq..key" src/ --include="*.ts" --include="*.tsx"
```

DB schema sections verified against `docs/dev/DB_SCHEMA.md` lines 144-202 (appointments), 248-265 (business_settings), 353-383 (cash_drawers), 452-512 (coupons + coupon_rewards), 573-634 (customers), 1412-1429 (mobile_zones), 2909-2959 (transactions).
