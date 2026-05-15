# Phase 2 Audit — Refund / Return / Deposit / Pre-payment + Remaining Surfaces (Preserved Reference)

> **Status: preserved-from-rollback, not currently actionable.** This document
> captures the Phase 2 audit appendix that was generated on 2026-05-14 during
> Session 1.5c as an addendum to `MONEY_UNIFY_3_COMPREHENSIVE_BUG_AUDIT.md`. The
> parent audit file was deleted by the Money-Unify-3 rollback on 2026-05-15
> (every Family D `_cents` column on services/service_pricing/products/packages
> was dropped, returning the schema to the pre-Unify-3 baseline). The findings,
> file references, and severity classifications below correspond to the
> Unify-3 deploy state and are no longer directly applicable to `main`.
>
> Kept as reference material for Money-Unify Attempt 2 (Option A — branded
> types first, then one-surface-at-a-time migration). The methodology — full
> per-surface enumeration of render sites, Stripe SDK calls, DB write paths,
> and Zod schema coverage — is the model future audits should reproduce
> BEFORE the next migration ships. The specific bug findings can be ignored
> on `main` today, but the surface inventory and severity rubric remain
> reusable as scaffolding.
>
> Extracted from `stash@{0}` (message: "phase-2-audit-appendix-pre-rollback")
> on 2026-05-15. Original parent file: `MONEY_UNIFY_3_COMPREHENSIVE_BUG_AUDIT.md`
> (deleted in rollback).

---

> Read-only audit performed 2026-05-14 after Phase 3.1a (commit `5266f113`)
> deploy and the discovery of the Session-1 root-cause bug at
> `src/app/api/checkout/create-payment-intent/route.ts:143`
> (`Math.round(product.retail_price_cents * 100)` — double-scales cents).
> Scope: every money-handling surface in the codebase EXCEPT the booking
> flow (covered separately) and e-commerce checkout (fixed in Session 1).
> 6 surface-groups audited via parallel sub-agents; findings synthesized
> below. **No fixes applied; this is an inventory.**

## TL;DR

- **15 surfaces audited; ~50 render sites; ~10 Stripe SDK call sites; ~15 DB
  write paths.**
- **0 S0 bugs** (no other customer-money corruption beyond the Session 1
  checkout fix).
- **1 S1 bug** — AI auto-responder leaks 100× product prices to customer
  conversations (messaging-ai.ts:275 — `Number(retail_price_cents).toFixed(2)`).
- **3 S2 findings** — missing Zod schemas on 2 money-accepting endpoints +
  Pattern-B inline `.toFixed()` style inconsistencies in 6 voice-agent
  sites.
- **Surface 3 (product returns) confirmed not to exist** as a separate
  surface — refunds are the only path. No new bugs there.
- **Surfaces 4 (booking deposit), 5 (pay-link), 6 (Stripe webhook), 7 (POS
  card), 8 (POS terminal), 10 (quotes), 11 (mobile zone), 12 (loyalty),
  13 (coupon), 14 (receipt) all CLEAN** — verified zero double-scale bugs.

The bug class is structurally rarer than originally feared. The Session-1
checkout bug (`_cents * 100` at the API write boundary) appears to be an
ISOLATED Unify-3 oversight, not a systemic pattern. The AI auto-responder
miss (Surface 15) is a SEPARATE bug class (raw `.toFixed(2)` on cents value
in a string interpolation) that the Phase 3.1a ESLint rule did not catch —
the rule fires only on `formatCurrency(...)` calls, not on inline
`${value.toFixed(2)}` patterns.

## Methodology recap

Per request:
- Every render site: file:line, variable name, formatter, source unit.
- Every Stripe SDK call: amount traced to origin.
- Every money-accepting endpoint: Zod schema or "MISSING" finding.
- NUMERIC-dollars-paired-with-formatMoney → inverse 100× bug.
- INTEGER-cents-paired-with-formatCurrency → forward 100× bug.
- `* 100` / `/ 100` / `toCents()` / `fromCents()` sites classified as
  write-boundary / display-boundary / suspicious-buried.

## CONFIRMED BUGS

### S1 — Customer-facing 100× display in AI auto-responder

**Bug Phase-2-1:** `src/lib/services/messaging-ai.ts:275`

```ts
const price = p.retail_price_cents
  ? `$${Number(p.retail_price_cents).toFixed(2)}`
  : 'Price varies';
```

- `p.retail_price_cents` is INTEGER cents (Family D, post-Unify-3).
- `Number(1599).toFixed(2)` returns `"1599.00"` — `.toFixed()` formats with 2
  decimals; it does **not** divide. The 100× scaling is missing.
- The string `"$1599.00"` is then injected into `productLines` which becomes
  part of the AI system prompt for `searchRelevantProducts()`, used by the
  AI auto-responder (Anthropic Claude) when answering customer messages
  about products.
- **Impact:** when a customer texts "what's the price of the foam pad?",
  the AI is given `"$1599.00"` as context and may quote that figure back.
  Customer-visible mis-quote.
- **Severity:** S1 (customer-visible, not a payment overcharge).
- **Target fix (one sentence):** replace `$${Number(p.retail_price_cents).toFixed(2)}`
  with `formatMoney(p.retail_price_cents)`.

### S2 — Missing Zod schemas on money-accepting endpoints

**Finding Phase-2-2:** `src/app/api/admin/orders/[id]/refund/route.ts`

- POST handler accepts `body.amount` (refund amount in cents, sent by
  `src/app/admin/orders/[id]/page.tsx:165` via
  `Math.round(parseFloat(refundAmount) * 100)`).
- **No Zod schema** validates the body. No unit assertion, no positive-bound
  check, no upper-bound vs `order.total`. The server line 50 does
  `Math.min(body.amount, order.total)` which prevents over-refund but the
  unit contract is enforced by client convention only.
- The client also bypasses the canonical `toCents()` helper (page.tsx:165
  uses raw `Math.round(parseFloat * 100)`).
- **Severity:** S2 (defense-in-depth; no known active exploit).
- **Target fix (one sentence):** add a Zod schema validating
  `{ amount?: positiveInt, reason?: string }` (integer cents), and have the
  client compute via `toCents()`.

**Finding Phase-2-3:** `src/app/api/pos/stripe/payment-intent/route.ts`

- POST handler accepts `body.amount` (cents per implicit Stripe contract,
  validated only with `if (!amount || amount < STRIPE_MIN_AMOUNT_CENTS)`).
- **No Zod schema** validates the body shape.
- Caller is `src/app/pos/components/checkout/card-payment.tsx:57`
  (`Math.round(amountDue * 100)`) which is correct but reliant on
  convention.
- **Severity:** S2.
- **Target fix (one sentence):** add a Zod schema validating
  `{ amount: integerCentsAtLeast50, description?: string }`.

### S2 — Pattern-B inline `.toFixed()` on dollar values (voice agent + AI)

**Finding Phase-2-4:** 6 sites inline-format dollars via `.toFixed()`
instead of `formatCurrency()`. **Math is correct** at every site (all
inputs are NUMERIC dollars from Family A); the issue is consistency with
the post-Phase-3.1a "use canonical formatters" rule.

| File | Line | Code | Source unit |
|---|---|---|---|
| `src/lib/services/messaging-ai.ts` | 421 | `(customerContext.loyalty_points * LOYALTY.REDEEM_RATE).toFixed(2)` | dollars |
| `src/lib/services/messaging-ai.ts` | 426 | `$${customerContext.lifetime_spend.toFixed(0)} lifetime spend` | dollars |
| `src/app/api/voice-agent/send-quote-sms/route.ts` | 288 | `$${Number(quote.total_amount).toFixed(2)}` | dollars |
| `src/app/api/voice-agent/initiation/route.ts` | 142 | `$${(customer.lifetime_spend \|\| 0).toFixed(0)}` | dollars |
| `src/app/api/voice-agent/initiation/route.ts` | 151 | `$${Number(lastTxn.total_amount).toFixed(0)}` | dollars |
| `src/app/api/voice-agent/initiation/route.ts` | 194 | `$${Number(q.total_amount).toFixed(0)}` | dollars |

- All 6 are internal AI / voice-agent system-prompt context (NOT customer-
  facing SMS or speech directly — they go to the LLM as context, the LLM
  may paraphrase). Treated as **S2 code style**.
- **Target fix (one sentence):** rewrite each via `formatCurrency(value)`;
  and extend the `money/no-format-currency-with-cents-args` rule (or add a
  new sibling rule) to flag `Number(x).toFixed(2)` and `x.toFixed(2)` when
  `x` looks like a money column.

## VERIFIED CORRECT — surfaces with zero bugs

### Surface 1 — POS Refund Flow

**Files:** `/api/pos/refunds/route.ts`, `pos/components/refund/{refund-dialog,refund-summary,refund-item-row}.tsx`, `lib/utils/validation.ts`, `lib/utils/money.ts`.

- 1 Stripe SDK call (`route.ts:395`): `stripe.refunds.create({ amount: stripeAmountCents })` — amount in cents ✓.
- Request body validated by Zod schema (`validation.ts:604-620`) in dollars; server converts via `toCents()` before Stripe.
- 15 render sites, all use `fromCents().toFixed(2)` or `(cents/100).toFixed(2)` paired correctly with their unit source.
- DB writes: `refunds.amount` and `refund_items.amount` receive dollars via `fromCents()`; `loyalty_ledger.points_change` is points only (no money); `campaigns.revenue_attributed` math is dollars-on-dollars.

**Verdict:** No bugs. Refund pipeline is the gold-standard example of correct boundary conversion in the codebase.

### Surface 2 — Admin Order Refund Flow

**Files:** `/api/admin/orders/[id]/refund/route.ts`, `admin/orders/[id]/page.tsx`.

- 1 Stripe SDK call: `stripe.refunds.create({ amount: refundAmount })` — amount in cents (client computes via `Math.round(parseFloat × 100)` at page.tsx:165). ✓ unit-correct.
- 0 render bugs (only place that renders refund money is the `order_events.description` string, which divides cents by 100 at line 75 — correct).

**Verdict:** No 100× bugs. **One S2 finding** (missing Zod) listed above.

### Surface 3 — Product Return Flow

**Confirmed: no separate return surface exists.**

- No `/api/*/returns/route.ts` file.
- No `/app/*/return/page.tsx` directory.
- No `returns` table.
- Returns are modeled as refunds with `refund_items.disposition='restock'`.

**Verdict:** N/A — not a surface.

### Surface 4 — Booking Deposit Path

**Files:** `lib/data/booking.ts`, `components/booking/{booking-wizard,step-confirm-book,step-payment}.tsx`, `/api/book/payment-intent/route.ts`, `/api/book/route.ts`, `admin/settings/business-profile/page.tsx`, `lib/utils/validation.ts`.

- `business_settings.default_deposit_amount` JSONB: NUMBER (dollars) — verified at admin write site.
- Wizard state holds deposit_amount in dollars; Zod `bookingSubmitSchema.deposit_amount` is `positiveNumber` (dollars).
- `/api/book/payment-intent`: client sends dollars; server `Math.round(amount * 100)` converts to cents for Stripe ✓.
- DB writes: `appointments.deposit_amount` (dollars from request), `transactions.total_amount`/`subtotal` (dollars), `payments.amount` (dollars) — all correct.
- Catalog entry conversion (`fromCents(data.price_cents)`) at `/api/book/route.ts:299-300` is a clean write-boundary.

**Verdict:** No bugs.

### Surface 5 — Pay-Link / Pre-Payment Flow

**Files:** `/api/pay/[token]/intent/route.ts`, `(public)/pay/[token]/{page,pay-form}.tsx`.

- Stripe call at `/api/pay/[token]/intent/route.ts:103`: `paymentIntents.create({ amount: chargeCents })` — cents ✓.
- Chain: `appt.total_amount` (dollars) → `toCents()` → `totalCents`; `p.amount` (dollars) → `toCents()` → `paidCents`; `appt.payment_link_amount_cents` (already cents); `Math.min(customAmountCents, remainingCents)` (cents) → Stripe. Every conversion is canonical.
- Pay-link page renders: dollar values via `formatCurrency(dollars)`; cents values via `formatMoney(cents)` (post-Phase-3.1a fix).
- Pay-form: `formatMoney(amountCents)` correctly takes cents from server response.

**Verdict:** No bugs.

### Surface 6 — Stripe Webhook Handler

**File:** `/api/webhooks/stripe/route.ts`.

- Event handlers: `payment_intent.succeeded` (order branch + appointment_payment_link branch), `payment_intent.payment_failed`, `payment_intent.canceled`.
- **Order branch:** writes `customers.lifetime_spend = (existing) + order.total / 100` — `order.total` is INTEGER cents (Family E), `/100` converts to dollars for the dollars-typed column. **Correct.**
- **Appointment-payment-link branch:** uses `toCents()` and `fromCents()` consistently to bridge Family A dollars ↔ cents at the Stripe boundary; transactions/payments writes receive dollars.
- Email rendering uses `formatMoney(_cents)` for all Family E order columns (post-Phase-3.1a).

**Verdict:** No bugs.

### Surface 7 — POS Card Payment

**Files:** `/api/pos/stripe/payment-intent/route.ts`, `pos/components/checkout/card-payment.tsx`, `/api/pos/stripe/capture-payment/route.ts`, `/api/pos/transactions/route.ts`.

- Stripe call: `amount: body.amount` (cents from client) ✓.
- Client conversion: `amountCents = Math.round(amountDue * 100)` where `amountDue = ticket.total` (Family A dollars). Correct.
- Tip math: `subtotalCents = Math.round(ticket.subtotal * 100)`; `tipCents = processed.amount - amountCents` (both cents); `tipAmount = tipCents / 100` (dollars for DB write).
- DB writes: all Family A dollars to dollar columns.

**Verdict:** No bugs. **One S2 finding** (missing Zod on the payment-intent endpoint) listed above.

### Surface 8 — POS Terminal (Stripe Terminal SDK)

**Files:** `pos/lib/stripe-terminal.ts`, plus the integration in `card-payment.tsx`.

- `collectPaymentMethod` receives cents-shaped `tip_configuration.options[].amount` and `tipping.eligible_amount`. ✓
- `processPayment` returns Stripe's `IPaymentIntent.amount` (cents) — caller subtracts another cents value for tip computation. ✓
- `capture-payment` endpoint passes `amount_to_capture` (cents) to Stripe. ✓

**Verdict:** No bugs.

### Surface 9 — Pay-on-Site (Job Complete)

**Files:** `/api/pos/jobs/[id]/complete/route.ts`, `pos/jobs/components/job-detail.tsx`.

- Job-complete is a data-only operation (status + timer + gallery_token); no payment capture inline.
- Payment for completed jobs flows through the separate `/api/pos/transactions` path (Surface 7's category).
- 2 render sites in the completion notification email use `formatCurrency(a.price - a.discount_amount)` on Family A dollars — correct.

**Verdict:** No bugs.

### Surface 10 — Quotes (Build / Send / Accept / Convert / PDF)

**Files:** `lib/quotes/{quote-service,convert-service,send-service}.ts`, `/api/quotes/[id]/{accept,convert,pdf}/route.ts`, `/api/pos/quotes/[id]/convert/route.ts`, `(public)/quote/[token]/page.tsx`, `pos/components/quotes/quote-totals.tsx`, `pos/context/quote-reducer.ts`.

- **Catalog (cents) → Quote Item (dollars) boundary** at `quote-reducer.ts:93,102,114,178,179` — all use `fromCents()` correctly.
- Quote totals math uses `Math.round((dollars) * 100) / 100` for 2-decimal normalization — this is dollar-on-dollar rounding, NOT the bug pattern.
- Quote → Appointment convert preserves dollars (Family B → Family C).
- Render sites in public quote page, POS, email, PDF, SMS all use `formatCurrency(dollars)` consistently.

**Verdict:** No bugs.

### Surface 11 — Mobile Zone Surcharge

**Files:** `admin/settings/mobile-zones/page.tsx`, `/api/book/route.ts`, `lib/utils/resolve-mobile-fields.ts`, `/api/pos/mobile-zones/route.ts`, `/api/pos/jobs/route.ts`, `lib/quotes/quote-service.ts`.

- `mobile_zones.surcharge` is NUMERIC(10,2) dollars (Family C, pre-migration).
- 9 read sites verified — all consume as dollars, render via `formatCurrency(dollars)` or arithmetic with other dollar values.
- Custom surcharge from cashier-input normalized via `Math.round(customAmount * 100) / 100` — dollar-on-dollar rounding (correct).

**Verdict:** No bugs.

### Surface 12 — Loyalty Redemption

**Files:** `/api/pos/loyalty/redeem/route.ts`, `/api/pos/transactions/route.ts`, `pos/components/loyalty-panel.tsx`, `(account)/account/{page,loyalty/page}.tsx`, `components/booking/step-confirm-book.tsx`, plus webhook/refund/sync-offline-transaction loyalty_ledger writers.

- `loyalty_ledger.points_change` and `points_balance` are INTEGER points (not money).
- Points → dollars conversion: `points * LOYALTY.REDEEM_RATE` (dollars-per-point = 0.05). Used at 6 distinct sites; all pair dollars with `formatCurrency()` or template literals correctly.
- `transactions.loyalty_discount` (dollars) written/read consistently.
- `LOYALTY.REDEEM_RATE_CENTS = 5` exists from Unify-1 but is not yet wired into runtime math; awaits Unify-5/Final.

**Verdict:** No bugs.

### Surface 13 — Coupon Application

**Files:** `/api/{public,book,pos}/coupons/validate/route.ts`, `lib/utils/coupon-helpers.ts`, `admin/marketing/coupons/[id]/page.tsx`, `admin/marketing/automations/new/page.tsx`, plus webhook coupon `use_count` increment.

- `coupon_rewards.discount_value` is multi-unit by `discount_type` (`percentage` → integer percent, `flat` → dollars, `free` → 0). `calculateRewardDiscount()` at coupon-helpers.ts:193-212 branches correctly for all three cases.
- `coupons.min_purchase` (dollars) compared against dollar subtotals.
- `coupon_rewards.max_discount` (dollars) caps percentage discounts in dollars.
- Render sites distinguish `%` vs `$` correctly (e.g., `available/route.ts:185-191`).
- `/api/checkout/create-payment-intent/route.ts:210-217` bridges cents → dollars → cents at the helper boundary correctly.

**Verdict:** No bugs.

### Surface 14 — Customer-Facing Receipt

**Files:** `(public)/receipt/[token]/page.tsx`, `lib/data/{receipt-data,receipt-composer}.ts`.

- 17 Family A dollar reads paired with `formatCurrency()` — all verified correct (transactions/transaction_items/payments/refunds/refund_items dollars; loyalty math dollars).
- 2 cents-sourced values from receipt-composer (`totalPaidCents`, `resolvedBalanceCents`) paired with `formatMoney()` — correct post-Phase-3.1a.

**Verdict:** No bugs. All ~17 of the audit-doc's "verified correct" sites confirmed correct against post-Unify-3 column state.

### Surface 15 — AI / Messaging

**Files:** `lib/services/messaging-ai.ts`, `lib/services/ai-content-writer.ts`, `lib/sms/composites.ts`, `/api/voice-agent/{send-quote-sms,send-info-sms,quotes,products,initiation}/route.ts`.

- **messaging-ai.ts service catalog** (lines 70, 74, 78, 96, 98, 109, 115, 119, 123): 13 sites, all use `formatMoney(_cents)` correctly.
- **messaging-ai.ts coupon/loyalty** (lines 185, 189, 196, 421, 426): dollars-template-literal — math correct but 2 sites (421, 426) are Pattern-B style inconsistencies (S2, listed in Phase-2-4).
- **messaging-ai.ts product search** (line 275): **BUG — Phase-2-1, S1** (listed above).
- **ai-content-writer.ts** (lines 658, 660): use `formatMoney(_cents)` correctly.
- **voice-agent/products/route.ts** (lines 109, 119, 121): mix of `formatMoney()` for human-readable text and `fromCents()` for the wire `price_dollars` field — both correct.
- **voice-agent/initiation/route.ts** (lines 142, 151, 194): 3 dollar-template-literal sites — Pattern-B style inconsistencies (S2, listed in Phase-2-4).
- **voice-agent/send-quote-sms/route.ts:288**: dollar-template-literal — S2 style (listed in Phase-2-4).
- **SMS composites.ts**: accepts pre-formatted strings from callers; no unit issue.

**Verdict:** 1 S1 bug (Phase-2-1, messaging-ai.ts:275) + 6 S2 style inconsistencies (Phase-2-4). No silent customer-money corruption.

## SUMMARY TABLE

| Surface | Files | Render sites | Stripe calls | DB writes | Bugs found | Severity |
|---|---|---|---|---|---|---|
| 1. POS refund | 6 | 15 | 1 | refunds/refund_items/loyalty_ledger | 0 | — |
| 2. Admin order refund | 2 | 1 | 1 | orders.payment_status | 0 + 1 Zod gap | S2 |
| 3. Product return | — | — | — | — | N/A (no surface) | — |
| 4. Booking deposit | 8 | ~10 | 1 | appointments/transactions/payments | 0 | — |
| 5. Pay-link | 4 | ~10 | 1 | (read-only intent gen) | 0 | — |
| 6. Stripe webhook | 1 | ~12 | 0 | orders/customers/transactions/payments/coupons | 0 | — |
| 7. POS card | 4 | 1 | 1 | transactions/payments | 0 + 1 Zod gap | S2 |
| 8. POS terminal | 2 | 0 | 2 | (via card payment) | 0 | — |
| 9. Pay-on-site | 2 | 2 | 0 | jobs | 0 | — |
| 10. Quotes | 8 | ~15 | 0 | quotes/quote_items/appointments | 0 | — |
| 11. Mobile zone | 6 | 1 | 0 | mobile_zones (admin CRUD) | 0 | — |
| 12. Loyalty | 9 | ~10 | 0 | loyalty_ledger/transactions | 0 | — |
| 13. Coupon | 6 | ~5 | 0 | coupons.use_count | 0 | — |
| 14. Receipt | 3 | 19 | 0 | (read-only) | 0 | — |
| 15. AI / messaging | 8 | ~26 | 0 | (read-only) | 1 + 6 style | S1 / S2 |
| **TOTAL** | **~60 files** | **~125** | **~10** | **~15 paths** | **1 S1 + 3 S2** | — |

## RECOMMENDATIONS

### Immediate (Phase 1.5 — same severity as Session 1 checkout fix)

1. **Phase-2-1**: Fix `messaging-ai.ts:275` to use `formatMoney(p.retail_price_cents)`. One-line change. Customer-visible AI-quoted-price bug.

### Pre-Phase-2 (bundled into Phase Money-Unify-3.1b)

2. **Phase-2-2 + Phase-2-3**: Add Zod schemas to the two endpoints. Defense-in-depth.
3. **Phase-2-4 (6 sites)**: Convert inline `.toFixed()` patterns to `formatCurrency(dollars)`. Code consistency.

### Lint-rule extension (Unify-Final candidate)

4. Extend `money/no-format-currency-with-cents-args` (or add a sibling
   rule) to flag `Number(x).toFixed(2)` / `x.toFixed(2)` where `x` looks
   like a money source. The Family D bug class includes inline-template
   patterns the current rule misses. The Phase-2-1 bug at
   messaging-ai.ts:275 would have been caught by such a rule.

## METHODOLOGY GAP CLOSURE

The original Money-Unify-3 audit walked specific files and missed:
- The server-side `_cents * 100` bug at the checkout API (Session 1 fix).
- The AI-context `Number(_cents).toFixed(2)` bug at messaging-ai.ts:275
  (this audit).

Both are real bug classes that the rendering-layer ESLint rule did not
cover. This Phase 2 audit closes the surface gap by enumerating
**every** payment-touching path. The remaining bug-class risk is
in linting coverage (Recommendation 4 above), not in unaudited surfaces.

Post-epic followup #15 ("Audit voice-agent routes for cents-as-dollars
display bugs") is **resolved** by this audit — voice-agent product
routes are clean; the AI auto-responder bug found is in a SIBLING file
(`messaging-ai.ts`, not under `/api/voice-agent/`).
