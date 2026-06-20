# Job Receipt Unification Audit — 2026-06-20

> **Status:** Architecture audit (Rounds 1–3 + Q-follow-ups). No code changes. Bundle with Phase 1 of implementation when that ships.
>
> **Design baseline for:** the unification of the two-transactions-per-job pattern (online deposit + POS close-out, OR payment-link + POS close-out) into a single-transaction lifecycle (Option A).

---

## Executive Summary

Today, a single job can produce **two `transactions` rows** in the DB:
1. A **deposit transaction** created at booking time (`/api/book/route.ts`) OR a **payment-link transaction** created by the Stripe webhook (`/api/webhooks/stripe/route.ts:162-181`) when a customer pays a sent payment link.
2. A **close-out transaction** created at POS finalization (`/api/pos/transactions/route.ts:182-207`).

The schema **allows** unification (`transactions.appointment_id` is not unique, `payments.transaction_id` allows N-payments-per-tx, `transactions.status='open'` already exists). The 2-row pattern is **behavioral, not structural**.

**Recommended target:** Option A — single transaction lifecycle (`open` at booking → `completed` at close-out), with payments accumulating on the one row.

**Revised plan** (per Round 3 findings on existing helpers):
- **Phase 1 — Helper consolidation** (1 session): extract grand-total, balance-due, subtotal-derivation, loyalty-redemption helpers.
- **Phase 2 — Helper migration** (1-2 sessions): rewrite all consumer sites to use helpers.
- **Phase 3 — Data-model unification** (2-3 sessions): convert booking + webhook + POS close-out to a single open-transaction lifecycle.

This is materially smaller than Round 1's 3-5-session estimate because most of the architectural complexity (calculation orchestration) is solved by the helpers in Phase 1; the data-model migration in Phase 3 is then mostly INSERT→UPDATE changes in two routes.

### Severity declarations

| Severity | Finding |
|---|---|
| **S1 — Architectural** | Two-transactions-per-job pattern. Causes customer confusion (two receipt numbers), staff reconciliation friction, QBO entity-count duplication, and discount/loyalty/coupon **audit-trail fidelity loss** on payment-link receipts. NOT a revenue bug — money flows correctly. |
| **S1 — Concurrency** | Loyalty double-spend window (Q2 deferred). Customer can redeem the same points on back-to-back bookings before the first closes out, because `customers.loyalty_points_balance` is debited only at POS close-out. Tactical fix possible (earlier debit), OR resolved by Phase 3 (open-transaction lifecycle naturally debits at redemption time). |
| **S0 — Receipt UX** (newly surfaced — Q4) | SD-06444-class payment-link receipts render an empty items block. Customer sees "Subtotal $369.75 → Tax $0.00 → TOTAL $369.75" with no line items. They know what they paid; they do not know what they paid for. Stripe webhook does not insert `transaction_items` (`webhooks/stripe/route.ts:162-181`). |

---

## Round 1 — Two-Receipt Architecture Audit

### Part 1 — Side-by-side: what's on each receipt

Both receipts are renderings of `transactions` rows via the same `fetchReceiptTransaction()` pipeline (`src/lib/data/receipt-data.ts`). The differences are entirely in the underlying data, not the renderer.

| Field | Deposit / Payment-link transaction | Final POS close-out transaction |
|---|---|---|
| `receipt_number` | New (e.g. `sd-06444`) | New (e.g. `sd-06446`) — **different number** |
| `appointment_id` | Linked | Linked to same appointment |
| `status` | `completed` | `completed` |
| `subtotal` | Booking-deposit: full service total; Payment-link: `appt.total_amount` snapshot | Full service total (operator-built) |
| `tax_amount` | **$0** (CDTFA Pub 100: tax on completion) | Actual tax at drain time |
| `tip_amount` | **$0** | Tip if collected |
| `discount_amount` | Booking-deposit: 0; Payment-link: 0 (webhook hardcodes — `webhooks/stripe/route.ts:173`) | Coupon + loyalty + manual combined |
| `total_amount` | Amount paid (deposit / link amount) | Balance (full − deposit_credit) |
| `deposit_credit` | 0 | Amount of prior deposit applied |
| `payment_method` | `card` | `cash`/`card`/`split`/`digital`/`null` (close-out shell) |
| `coupon_id`, `coupon_code` | Booking-deposit: **NULL** (`api/book/route.ts:656-671` omits); Payment-link: **NULL** (webhook doesn't select) | Set from POS client (`pos/transactions/route.ts:197-198`) |
| `loyalty_*` fields | Booking-deposit: **all 0**; Payment-link: **all 0** | Full data from POS client; recomputed earn |
| `transaction_items` | Booking-deposit: **full items written** (since 2026-04-12, commit `e86c77d1`); Payment-link: **ZERO items written** (webhook gap) | Full items written |
| `payments` rows | 1 row (Stripe PI, card brand/last4) | 1+ rows (cash/card/digital/check) |
| `notes` | `"Online booking deposit. Service total: $X. Balance due at service: $Y."` OR `"Online payment link. PI: ${pi.id}."` | Operator notes OR `"Closed out — fully pre-paid"` |
| `is_deposit` flag (render-time) | `true` if `appointments.payment_type='deposit'` | `false` |

**Round 2/3 corrections folded in:** payments table column is `method` (not `payment_method`); appointments column is `scheduled_date` (not `appointment_date`); payment-link receipts NEVER have items (webhook gap); booking-deposit receipts DO have items since 2026-04-12.

### Part 2 — How it works today

**Booking deposit path** (`/api/book/route.ts:649-867`):
1. `appointments` UPDATE — `stripe_payment_intent_id`, `payment_status='pending'`.
2. `transactions` INSERT (lines 656-671) — `total_amount=depositAmount`, `subtotal=fullTotal`, fresh `receipt_number`.
3. `transaction_items` INSERT (lines 744-819) — full line items (primary + addons + mobile fee).
4. `payments` INSERT (lines 852-861) — 1 row, Stripe PI + card_brand/last4 via `extractCardDetailsFromCharge`.

**Payment-link path:**
1. Operator (POS at `/api/pos/appointments/[id]/send-payment-link/route.ts`) or voice agent (`/api/voice-agent/send-payment-link/route.ts`) calls the **shared helper** `src/lib/payment-link/send.ts:217-650`.
2. Helper mints/reuses `payment_link_token`, dispatches SMS/email, stamps `payment_link_sent_at`, `payment_link_paid_at=NULL`, `payment_link_amount_cents`, writes audit log. **Never inserts a transactions row.**
3. Customer pays at `/pay/[token]`. Stripe fires `payment_intent.succeeded` with `pi.metadata.type === 'appointment_payment_link'`.
4. Webhook handler at `src/app/api/webhooks/stripe/route.ts:66-308` does the `transactions` INSERT (lines 162-181) + `payments` INSERT (lines 201-212). **Does NOT insert `transaction_items`.** Updates appointment `payment_status` (line 153 logic: `>= remaining ? 'paid' : 'partial'`).

**POS close-out path** (`/api/pos/transactions/route.ts:182-207`):
1. Resolves `linkedApptId` via `jobs` (lines 85-97).
2. Overpay guard (lines 107-154) — only fires when `payment_status='paid'` AND `existing + incoming > apptTotal` (no symmetric under-collection guard).
3. INSERTS a new `transactions` row with full POS state (subtotal, tax, tip, discount, coupon, loyalty fields).
4. INSERTS `transaction_items` (lines 264-310) and `payments` (lines 312-408).
5. Loyalty ledger writes at lines 473-486 (redemption) + 515-522 (earn, server-recomputed).

**Cross-linking at render time** (`src/lib/data/receipt-data.ts`):
- `composeReceiptPaymentLines()` (`receipt-composer.ts:582-673`) aggregates all payments for the appointment.
- `is_deposit` flag set when `appointments.payment_type='deposit'`.
- `linked_receipt` cross-reference between deposit and balance receipts.

### Part 3 — Why it was built this way

**Inferred design rationale:**

1. **Operator visibility.** `book/route.ts:649` comment is explicit: *"Record deposit as a transaction so it appears in Admin > Transactions."*
2. **INSERT-only immutability.** Each row is immutable except for refunds — eliminates UPDATE race conditions during Stripe webhook fires.
3. **Receipt number stability.** Each transaction owns a `receipt_number`. Deposit receipt's number is permanent.
4. **Clean refund attachment.** Refunds attach to a specific transaction; no ambiguity.
5. **QBO sync alignment.** Two transactions = two QBO sales receipts (mirrors how some accountants book deposits separately).
6. **Schema designed for it.** `transactions.appointment_id` is intentionally non-unique (`docs/dev/DB_SCHEMA.md:3033`).

**Round 2 correction:** The "Admin > Transactions visibility" rationale applies to booking-deposit transactions (`book/route.ts`). Payment-link transactions appear via the **webhook** for a different reason — the webhook is the sole writer for the pay-link payment, and inserting a transaction is the only way the payment becomes visible at all. The two creation paths are NOT byte-symmetric.

### Part 4 — Problems with two transactions per job

**Customer-facing:**
- Two receipt numbers for one service. Confusing — was I charged twice?
- Deposit receipt's `total_amount` ($50) doesn't match its `subtotal` ($100) — looks like math is wrong unless you read the notes.
- Two confirmation emails referencing the same job at different numbers.
- **Q4 finding:** payment-link receipts render an empty items block (Stripe webhook never writes `transaction_items`). Customer sees what they paid but NOT what they paid for.

**Staff/admin-facing:**
- Admin Transactions list shows TWO rows per job.
- "Today's revenue" ambiguity (does it include deposits for future jobs?).
- `jobs.transaction_id` FK conventionally points to the FINAL transaction; convention is not enforced.

**Reconciliation/accounting:**
- Stripe payouts include both charges. Matching requires summing across two transactions.
- QBO sync creates two entries per job (entity count doubled).
- End-of-day Z-reports must special-case to avoid double-counting.

**Data integrity (discount fidelity — the Round 2 reframe):**
- Manual discount: label stored only on `appointments`; transactions row has only the combined `discount_amount`. Payment-link transaction shows `discount_amount=0` (webhook hardcodes).
- Coupon: `coupon_id/code` set only on POS close-out tx (when operator stays in the deep-link drain). Payment-link tx is always `NULL/NULL`.
- Loyalty: all loyalty fields default 0 on deposit + payment-link txs. Only POS close-out carries the data.
- Sales / combos: discount is implicit in `unit_price`↓`standard_price` delta inside `transaction_items`. **Webhook payment-link tx has NO items, so sale/combo audit is also lost there.**

The system worked correctly money-wise for the Reem case ($435 ticket → $65.25 manual discount → $369.75 link paid → close-out shell). But the deposit/payment-link receipt has zero audit trail of the discount, which lives only on the appointment row.

**Refund edge cases:** Customer pays $50 deposit + $50 balance → wants full refund → refund must split across BOTH transactions, each with its own refund row.

### Part 5 — Architectural paths

**Option A — Single transaction, lifecycle states (RECOMMENDED)**

- Booking time: INSERT `transactions` row with `status='open'`, items populated, `total_amount=fullServiceTotal`, `subtotal=fullServiceTotal`. INSERT `payments` row for the deposit.
- POS close-out time: UPDATE the existing `transactions` row (recompute totals, set `status='completed'`). UPDATE/replace `transaction_items` if appointment was modified. INSERT additional `payments` row(s) for the balance.
- Customer-facing: one receipt number for the whole job.

**Tradeoffs:** ✅ Matches user's mental model. ✅ Reconciliation trivial. ✅ QBO once per job. ⚠️ UPDATE on in-flight row introduces concurrency risk — mitigation via row-level lock during POS finalization OR optimistic concurrency on `updated_at`. ⚠️ Customer sees "their receipt was updated" — needs UX framing.

**Option B — Defer transaction until POS** — No deposit transaction at all; payment lives on appointment fields. Webhook just stamps `appointments`. POS close-out creates the single transaction with all payments.

**Tradeoffs:** ✅ Cleanest single-receipt semantics. ⚠️ Operators lose admin-Transactions visibility for deposits collected today (would need separate "Pending Deposits" view). ⚠️ Refund-after-cancel has no transaction to attach to.

**Option C — Link the two transactions** — Add `parent_transaction_id` FK, aggregate at render time. Doesn't actually fix the data shape — papers over it in rendering.

### Part 6 — Recommended approach + migration plan

**Recommended: Option A** (single transaction, lifecycle states).

Smallest semantic departure from current behavior. Schema is already shaped for it. The mental model matches accounting: a job has one ledger entry, payments accumulate against it.

**Round 3 revision** — Section 0's helper landscape changes the phasing. Original Option A was a 3-5-session monolith. Revised plan:

- **Phase 1 — Helper consolidation** (~1 session). See "Revised 3-Phase Implementation Plan" below.
- **Phase 2 — Helper migration** (~1-2 sessions).
- **Phase 3 — Option A data-model unification** (~2-3 sessions).

### Part 7 — Edge cases to validate

1. Customer cancels after deposit → refund attaches to the open transaction (status → `refunded`).
2. Customer modifies appointment after deposit (adds addon, changes service) → need to define UPDATE strategy for `transaction_items` (REPLACE-at-edit OR version history). **Cascade endpoint already does the appointment-side recompute correctly (Q1 finding).**
3. Tip added post-completion → INSERT additional payment row against the same transaction.
4. Pay-link sent post-booking → payment attaches to the same open transaction.
5. Multi-visit jobs → unchanged; 1 transaction per job.
6. Walk-in jobs → unchanged; INSERT new transaction at POS.
7. Stripe charge succeeds but Next.js request times out before INSERT → SAME GAP as today, not a regression. Open question for any model: should webhook be a fallback writer?
8. Concurrent POS edits during finalization → row-level lock + optimistic concurrency.
9. Historical 2-row transactions → DO NOT MIGRATE — leave as-is for audit trail. New flow applies to bookings after cutover.
10. Receipt number stability — under Option A the deposit's receipt number IS the final receipt's number. Feature, not bug, for the mental model. Email footer: *"Receipt sd-06294 — updated at service completion."*

---

## Round 2 — Schema Verification + Data-Fidelity Reframe

### Schema corrections to Round 1

- `payments.method` (NOT `payment_method`). Verified at `docs/dev/DB_SCHEMA.md:1753`.
- `appointments.scheduled_date` (NOT `appointment_date`). Verified at `docs/dev/DB_SCHEMA.md:158`.

Full schema tables in Round 2 verified against the auto-generated `docs/dev/DB_SCHEMA.md` (regenerated 2026-06-07).

### SD-06444 code path (Round 2 correction)

SD-06444 was **NOT** created by `/api/book/route.ts`. It was created by the **Stripe webhook** branch at `webhooks/stripe/route.ts:162-181` when the customer paid the operator-sent payment link.

The webhook's transaction INSERT shape:
```typescript
{
  appointment_id: appt.id,
  customer_id: appt.customer_id,
  vehicle_id: appt.vehicle_id,
  employee_id: null,
  status: 'completed',
  subtotal: Number(appt.total_amount),   // ← frozen snapshot at payment time
  tax_amount: 0,
  tip_amount: 0,
  discount_amount: 0,                    // ← hardcoded
  total_amount: amountReceivedDollars,
  payment_method: 'card',
  notes: `Online payment link. PI: ${pi.id}.`,
  ...
}
```

**The webhook does NOT insert `transaction_items`.** This is the root cause of Q4's empty-items-block finding.

### Part 4.5 — Data divergence (Round 2 reframe to discount fidelity)

**Original framing** (struck): "$65.25 revenue loss bug — services added post-link not collected at close-out."

**Corrected framing** (per operator's clarification): the $65.25 was a manual discount applied at the POS BEFORE the payment link was sent. The actual sequence:

1. Ticket created with services worth $435
2. Operator applied $65.25 manual discount → effective ticket total $369.75 (cascade endpoint UPDATEs `appointments.total_amount` to $369.75 — **Q1 confirmed**)
3. Operator sent payment link for $369.75 (helper reads `appt.total_amount`)
4. Customer paid $369.75
5. Operator closed out — $0 balance due

**Money flowed correctly. The fidelity issue:**
- SD-06444 (payment-link) has `subtotal=$369.75` — treats discount as already absorbed, has `discount_amount=0`
- SD-06446 (close-out) has `subtotal=$435.00` — preserves pre-discount subtotal with `discount_amount=$65.25`

The payment-link transaction lost the audit trail of "$435 service with $65.25 discount." The close-out transaction has the full story. The appointment row has `manual_discount_value=65.25, manual_discount_label='...'` but the manual-discount label is never replicated onto either transaction row (no such column).

**This is a data-fidelity issue, not a revenue bug. Severity: S1 architectural.**

### Part 5.5 — Reconciliation impact

| Metric | Formula | Source | 2-row impact |
|---|---|---|---|
| `totalRevenue` | sum(transactions.total_amount) | `end-of-day/route.ts:57` | **NOT double-counted** — each tx's total_amount = actual money moved |
| `totalTips` | sum(transactions.tip_amount) | `end-of-day/route.ts:59` | **Correct today** (deposit/link rows always have tip=0). **At risk after Item 2 ships** |
| `totalTax` | sum(transactions.tax_amount) | `end-of-day/route.ts:58` | Correct (deposits/links have tax=0; close-out collects all) |
| `cashSales` | sum(total_amount WHERE payment_method='cash') | `end-of-day/route.ts:62-64` | Correct (deposits/links always card) |
| `cashTips` | sum(payments.tip_amount WHERE method='cash') | `end-of-day/route.ts:66-74` | Correct |
| `total_transactions` | count(transactions) | `end-of-day/route.ts:56` | **DOUBLED** per multi-payment job |

**QBO sync** (`batchSyncDayTransactions` called from `end-of-day/route.ts:198`): 2 transactions per job = 2 QBO entries. Accounting-side duplication confirmed.

**Revenue totals are correct under current pattern.** The architectural pain is operational (transaction counts, QBO entity counts) plus data-fidelity (the discount/coupon/loyalty audit trail).

### Part 6 — Item 2 (Stripe payment link tip) interim strategy

Item 2 spec (`docs/dev/ROADMAP-13-ITEMS.md:2878-2927`): full-payment Stripe payment link includes `tip_settings`; tip captured via Stripe link records to `transactions.tip_amount` on webhook receipt. S0 per roadmap.

**Three interim options** (decision deferred to Phase 0 of implementation):

- **6a — Pause Item 2 until Option A Phase 1+2 lands.** Clean target. Cons: customers can't tip via link for 3-5 sessions.
- **6b — Ship Item 2 as planned.** Tip lands on payment-link tx. Need pre-flight audit of tip-summing surfaces to ensure no double-counting at render time. End-of-day formula at `end-of-day/route.ts:59` (sum of `tx.tip_amount`) is safe today because deposit/link tip=0; after Item 2 it sums real values per row.
- **6c — Modify Item 2 scope.** Variant 6c-i: write tip ONLY to `payments.tip_amount`, not `transactions.tip_amount`. Forward-compatible with Option A migration.

---

## Round 3 — Calculation Helpers + Discount Data Model

### Section 0 — Shared Calculation Helper Matrix

| # | Calculation | Shared helper? | Helper file:line + API | Consumers using helper | Consumers rolling their own | Risk |
|---|---|---|---|---|---|---|
| 1 | **Grand total** = `Math.max(appointment_total ?? 0, total_amount ?? 0) + tip_amount` | **NO** — inlined | N/A | (none) | `pos/lib/receipt-template.ts:723`; `pos/lib/receipt-template.ts:1482`; `(public)/receipt/[token]/page.tsx:361`; `pos/components/transactions/transaction-detail.tsx:412`; `admin/transactions/page.tsx:742`; `admin/transactions/page.tsx:919` | MEDIUM — 6 sites, all match today |
| 2 | **Subtotal** | PARTIAL — `composeReceiptPaymentLines()` outputs `appointment_total_cents`; `computeTotalsForServiceEdit()` recomputes from items | `lib/data/receipt-composer.ts:582-673`; `lib/appointments/edit-services.ts:228-257` | `lib/data/receipt-data.ts:285`; `pos/jobs/[id]/checkout-items/route.ts:391`; cascade routes | 3 write paths: `api/book/route.ts:662` (`totalAfterDiscount`); `api/pos/transactions/route.ts:190` (client-supplied); `api/webhooks/stripe/route.ts:170` (`appt.total_amount`). POS reducers sum items inline (`ticket-reducer.ts:94`, `quote-reducer.ts:44`) | HIGH — three semantics for one column |
| 3 | **Tax** | YES — `calculateItemTax(price, isTaxable): number` | `pos/utils/tax.ts:8` | POS reducers + apply-*.ts utilities + UI quote-builder/jobs/use-edit-mode-drain | Booking deposit hardcodes `tax_amount: 0` (`api/book/route.ts:755,775,804`) per W4 design. Webhook no tax math. E-commerce checkout independent (`api/checkout/create-payment-intent/route.ts:244`) | MEDIUM — POS helper canonical for services; e-commerce separate |
| 4 | **Discount application order** | NO orchestrator | Piece-helpers only: `lib/quotes/manual-discount.ts:22` (`resolveManualDiscountAmount`); `lib/utils/coupon-helpers.ts:253` (`calculateCouponDiscount`) | Each piece has consumers | NO orchestrator. Order enforced by field arithmetic + convention: `pos/transactions/route.ts:160` checks `discount_amount - loyalty_discount > 0` for manual-discount permission, implying loyalty deducted first | HIGH — order is implicit |
| 5 | **Balance-due** | PARTIAL — `composeReceiptPaymentLines()` has `balance_due_cents`; other surfaces re-implement | `lib/data/receipt-composer.ts:658` | `lib/data/receipt-data.ts:285-307` → renders via `(public)/receipt/[token]/page.tsx:438-460` + `pos/lib/receipt-template.ts:825-826` | 3 different formulas: (A) `lib/payment-link/send.ts:349`; (B) `api/webhooks/stripe/route.ts:145-153`; (C) `(public)/pay/[token]/page.tsx:127,191` (only one consulting `appointment.payment_status`) | HIGH — two of three ignore payment_status flag |
| 6 | **Tip placement** | YES (CC-fee); NO (capture — flat dollar) | CC-fee: `payments.tip_net = tip_amount * (1 - CC_FEE_RATE)` single site `api/pos/transactions/route.ts:386-388` | Server-side CC deduction | Client capture: `pos/components/checkout/card-payment.tsx:104-106` (no math, just `processed.amount - amountCents`). Item 2 will introduce a new tip-capture site at the webhook | LOW today; MEDIUM after Item 2 |
| 7 | **Refund math** | YES — `computeTotalRefundCents()` | `lib/utils/money.ts:131-194` (returns `{lineAmountsCents[], totalCents}` with residual-cent redistribution) | `api/pos/refunds/route.ts:136-150`; client refund dialog; `webhooks/stripe/route.ts:534-605` (shell mode for external refunds); `lib/refunds/source-plan.ts:82-100` (multi-tx LIFO) | None | LOW — single source of truth |
| 8 | **Loyalty redemption** | PARTIAL (constants only) — no `redeemPoints()` or `calculateLoyaltyDiscount()` helper | `lib/utils/constants.ts:16-27` (`LOYALTY.REDEEM_RATE = 0.05`, `REDEEM_MINIMUM = 100`, etc.) | Constants only | Inline math everywhere: client `pos/components/loyalty-panel.tsx:70-72`; server earn `pos/transactions/route.ts:510`; legacy `pos/loyalty/earn/route.ts:60-61`; account portal `(account)/account/loyalty/page.tsx:88-90` | MEDIUM — **server trusts client-submitted `loyalty_discount` without recompute** (`pos/transactions/route.ts:160,201`); earn IS server-recomputed |
| 9 | **Coupon discount** | YES — `calculateCouponDiscount(rewards, items, subtotal)` | `lib/utils/coupon-helpers.ts:253` (base = eligible-items-only subtotal, excludes `pricing_type='sale'|'combo'`, lines 259-268) | `api/pos/coupons/validate/route.ts:424`; `api/book/validate-coupon/route.ts:376`; `api/checkout/create-payment-intent/route.ts:210` | None | LOW |

**Section 0 cross-cutting findings:**

1. **The Stripe webhook is the consistent BLIND writer.** Never invokes any helper. Sparse field-by-field copies. The two structural sources of fidelity loss: (a) the webhook's lack of items/discounts, (b) the absence of a shared balance-due/total contract.
2. **Three coexisting "what is the subtotal" semantics** (row 2). End-of-day rolls them up via `sum(tx.subtotal)` — defensibly numeric but semantically incoherent.
3. **Three coexisting balance-due implementations** (row 5). Only `pay/[token]` cross-checks `appointment.payment_status`. The Reem-class symptoms ride on this divergence.
4. **Two helpers (`calculateCouponDiscount`, `computeTotalRefundCents`) are exemplary.** Single source, multiple consumers, no divergence. The shape Phase 1 should emulate.
5. **Grand-total formula (row 1) is lowest risk + highest extraction value.** Extract first — cheap, locks the contract before Option A reshapes anything.

### Section 1 — Discount Data Model

#### Manual discount

| Surface | Storage | Label preserved? | Type preserved? |
|---|---|---|---|
| Online booking | (operator-only — not supported) | — | — |
| Quote builder | `quotes.manual_discount_type/value/label` (`DB_SCHEMA.md:2173-2175`, via `lib/quotes/quote-service.ts:178,320` through `lib/quotes/manual-discount.ts:22-34`) | YES | YES |
| POS ticket | `ticket.manualDiscount` in-memory (`pos/components/ticket-panel.tsx:363-390`) | YES | YES |
| Edit-mode save | `appointments.manual_discount_value/label` via cascade (`pos/components/ticket-actions.tsx:165-179`) | YES | NO (type collapsed) |
| Booking-deposit tx | `discount_amount` (no manual columns) | NO | NO |
| Payment-link tx (webhook) | `discount_amount: 0` hardcoded (`webhooks/stripe/route.ts:173`) | NO | NO |
| POS close-out tx | `discount_amount: data.discount_amount` — **`manual_discount_value/label` columns don't exist on transactions** | NO | NO |

#### Coupon

| Surface | appointments | transactions | Notes |
|---|---|---|---|
| Online booking | `coupon_code`, `coupon_discount` (`api/book/route.ts:594-595`) | (NULL on deposit tx) | Validated by `api/book/validate-coupon/route.ts:376` |
| POS ticket | (in-memory) | — | Validated via `api/pos/coupons/validate/route.ts:424` |
| POS close-out tx | (no write) | `coupon_id`, `coupon_code` (`pos/transactions/route.ts:197-198`) — **Q3: DOES auto-read from appointment via deep-link drain** | Inherited from booking only when operator enters via the deep-link drain (re-validated at `use-edit-mode-drain.ts:359-368`) |
| Webhook payment-link tx | (no read) | NULL/NULL (`webhooks/stripe/route.ts:85` doesn't fetch coupon) | — |

**Coupon no-stacking** (`coupon-helpers.ts:259-268`): excludes `pricing_type='sale'|'combo'` items from eligible base. Enforced by helper.

#### Loyalty redemption

| Surface | appointments | transactions | loyalty_ledger | customers balance |
|---|---|---|---|---|
| Online booking | `loyalty_points_redeemed`, `loyalty_discount` (`api/book/route.ts:596-597`) | (deposit tx hardcodes 0) | NO entry | **NOT debited** (stays stale) |
| POS ticket | (in-memory) | — | — | — |
| Payment-link tx (webhook) | (no read) | all 0 (`webhooks/stripe/route.ts:162-181`) | NO entry | (not touched) |
| POS close-out tx | (read for context) | `loyalty_points_redeemed`, `loyalty_discount`, `loyalty_points_earned` server-recomputed (`pos/transactions/route.ts:470-486, 488-532`) | 2 entries: redeemed + earned | **Debited + credited here** (lines 484, 513) |

**Server trusts client-submitted `loyalty_points_redeemed`** at line 470 (no recompute). Earn IS server-recomputed at 488-510. **Asymmetric trust boundary.**

**Earn-on-redeem:** points earned on `subtotal − ALL_DISCOUNTS` (line 509). $500 service with $25 loyalty + $50 coupon = $425 paid → 425 points earned (net +375 vs. 50 redeemed).

#### Auto-applied promotions (sales + combos)

| Mechanism | Auto? | Stored as | Where in tx |
|---|---|---|---|
| Service sales (`services.sale_price` + window) | YES | `transaction_items.unit_price=sale, standard_price=regular, pricing_type='sale'` (resolver: `lib/services/picker-engine.ts:72-91`) | Inside `transaction_items`, NOT `discount_amount` |
| Combos (`service_addon_suggestions.combo_price`) | YES (when anchor+addon both in cart, `auto_suggest=true`, in seasonal window) | `transaction_items.unit_price=combo, standard_price=prior, pricing_type='combo'` (resolver: `lib/services/combo-resolver.ts:106-175`) | Inside `transaction_items` |
| Coupon `auto_apply` flag | **NO** (display-only; operator must accept) | — | — |
| Loyalty tiers / birthday / first-time / mobile-discount / lifecycle-engine auto-apply | **NONE EXIST** | — | — |

#### The discount fidelity matrix

| Discount type | Appt row | Booking-deposit tx | Payment-link tx | POS close-out tx |
|---|---|---|---|---|
| Manual | `manual_discount_value/label` ✓ | discount_amount=0 ✗ | discount_amount=0 ✗ | discount_amount=value, label LOST ⚠ |
| Coupon | `coupon_code/coupon_discount` ✓ | coupon_id=NULL ✗ | coupon_id=NULL ✗ | coupon_id+code ✓ (when deep-link drained) |
| Loyalty | `loyalty_points_redeemed/discount` ✓ | all=0 ✗ | all=0 ✗ | full data + ledger ✓ |
| Sale (auto) | (per-service price) | unit_price ✓ items present | **NO items at all ✗✗** | unit_price ✓ items present |
| Combo (auto) | (per-addon price) | unit_price ✓ items present | **NO items at all ✗✗** | unit_price ✓ items present |

**Consistent pattern: payment-link webhook is the single point of fidelity loss** across all 5 discount types. The appointment row is the canonical store; close-out tx faithfully replicates; webhook propagates only `subtotal=appt.total_amount` and `total_amount=amount paid`.

### Q1 — Cascade endpoint behavior (CONFIRMED CORRECT)

**Question:** Does `appointments` cascade UPDATE `appointments.total_amount` when manual_discount is added/changed?

**Answer:** YES. The Reem case worked correctly, not by coincidence.

**Trace:**
- `editAppointmentServices` (`src/lib/appointments/service-edit.ts:159-654`) is the canonical cascade helper, used by both admin (`/api/admin/appointments/[id]/services`) and POS (`/api/pos/appointments/[id]/services`) routes.
- Resolves effective coupon/loyalty/manual values (`service-edit.ts:337-380`) with `payload || existing` semantics — payload overrides, omitted modifiers carry through.
- Calls `computeTotalsForServiceEdit` (`src/lib/appointments/edit-services.ts:228-257`):
  ```typescript
  serviceCents = sum(services.price_at_booking)
  subtotalCents = serviceCents + mobileSurchargeCents
  discountCents = (perModifier? sum(coupon+loyalty+manual) : input.discountAmount)
  totalCents = max(0, subtotalCents - discountCents + taxCents)
  ```
- UPDATE at `service-edit.ts:442-475` writes `subtotal`, `total_amount`, `discount_amount` together with the modifier columns.

**Implication:** `appt.total_amount` is always post-discount after any service or modifier edit. When `lib/payment-link/send.ts:240-252` reads `appt.total_amount` to compute the link amount, it gets the correct net value. The Reem case's $369.75 link was correct.

**No hidden bug. The discount-fidelity issue is purely about audit trail visibility on the payment-link transaction row — the money flow is correct.**

### Q3 — Coupon carry-over at POS close-out (CONFIRMED via deep-link drain)

**Question:** When operator loads an appointment at POS, does the client auto-add the booking-applied coupon to ticket state?

**Answer:** YES — via the deep-link drain hook.

**Trace:**
- Load endpoint `src/app/api/pos/appointments/[id]/load/route.ts:199-212` returns all four modifier columns: `coupon_code`, `coupon_discount`, `loyalty_points_redeemed`, `loyalty_discount`, `manual_discount_value`, `manual_discount_label`.
- `buildTicketStateFromLoad` (`src/app/pos/hooks/use-edit-mode-drain.ts:152-240`) zeros all modifiers in the initial TicketState (lines 218-221) — by design, so the follow-up dispatches replace rather than accumulate.
- `runEditModeDrain` (lines 258-397) follows up with:
  - `SET_LOYALTY_REDEEM` (lines 325-333) when `loyalty_points_redeemed > 0 OR loyalty_discount > 0`.
  - `APPLY_MANUAL_DISCOUNT` (lines 335-343) when `manual_discount_value > 0`.
  - Coupon RE-VALIDATED via `/api/pos/coupons/validate` (lines 348-386), then `SET_COUPON` dispatched if the helper returns `total_discount > 0`.

**Caveats:**
1. **Coupon may be silently dropped.** If the coupon is no longer valid (sold out / expired / customer no longer qualifies), the drain swallows the error at line 384 (`"Coupon revalidate failed — swallow; ticket already hydrated."`). Operator and customer get no notice.
2. **Only fires via deep-link entry.** If the operator opens POS fresh and manually starts a ticket (not from `?source=appointment&id=...&returnTo=...`), the appointment's modifiers are NOT inherited. The common close-out flow IS via the deep-link, so this is usually fine — but a sloppy operator path can lose discounts.

### Q4 — Receipt rendering for SD-06444-class (sparse) payment-link receipts

**Question:** What does the customer see on a payment-link receipt where the webhook wrote no items, no discounts, no tax?

**Answer:** They see an empty items block, then totals jump straight to subtotal/tax/total. They know what they paid; they don't know what they paid for.

**Trace (thermal renderer, `src/app/pos/lib/receipt-template.ts:595-720`):**
- Line 595: `lines.push({ type: 'divider' });` — divider rendered.
- Lines 602-664: `for (const item of tx.items)` — when `tx.items.length === 0`, loop body doesn't execute. **No `length === 0` guard, no fallback row.**
- Line 666: `lines.push({ type: 'divider' });` — second divider rendered (back-to-back with the first).
- Lines 669-679: Subtotal + Tax lines render UNCONDITIONALLY.
- Lines 681-689: Discount line guarded by `nonLoyaltyDiscount > 0` — skipped when 0.
- Lines 691-701: Loyalty line guarded by `loyalty_discount > 0` — skipped when 0.
- Lines 703-709: Tip line guarded by `tx.tip_amount > 0` — skipped when 0.
- Line 723: TOTAL line via the canonical `Math.max(appointment_total ?? 0, total_amount ?? 0) + tip_amount` formula.

**HTML renderer** (`receipt-template.ts:1076`): `tx.items.map(...).join('')` produces empty string when items is empty. Same structural shape.

**Customer-visible output for SD-06444** (subtotal=$369.75, all other discount/tax/tip = 0):
```
Smart Details Auto Spa
[business info]
[customer info]
[vehicle info]
─────────────
(no service rows)
─────────────
Subtotal     $369.75
Tax            $0.00
TOTAL        $369.75

Payments:
Visa ****1074    $369.75
```

**Implication:** The payment-link receipt is *structurally* a receipt, but *informationally* not — there's nothing telling the customer what services they paid for. The data is in `appointment_services`, and the close-out receipt has it, but the payment-link receipt does not. Under Option A this disappears: the single open transaction has `transaction_items` populated from the start.

### Q2 — Deferred S1 note: loyalty double-spend window

**Concurrency hazard not audited further this session.** Customer can redeem the same loyalty points on back-to-back bookings before the first appointment is closed out at POS, because `customers.loyalty_points_balance` is debited only at `/api/pos/transactions/route.ts:484` (POS close-out), not at booking/quote/redemption time.

**Fixable two ways:**
- **Tactical:** Move balance debit earlier — to appointment-create time when `loyalty_points_redeemed > 0`. Requires careful refund/cancel reversal logic.
- **Architectural:** Resolved by Option A Phase 3. Under single-open-transaction lifecycle, redemption writes a `loyalty_ledger` entry and debits the balance immediately at the moment the redemption is committed to the open transaction. No timing window.

**To investigate in Phase 0 of implementation, not in this audit.**

---

## Revised 3-Phase Implementation Plan

### Phase 1 — Helper consolidation (~1 session)

**Goal:** Add the missing shared helpers so Phase 2 + Phase 3 work through them.

- **New helper: `src/lib/data/transaction-totals.ts`** — exports `grandTotal({appointment_total, total_amount, tip_amount})`. Locks the `Math.max(...) + tip_amount` formula in one place.
- **Extend `composeReceiptPaymentLines()`** (`lib/data/receipt-composer.ts:582`) — promote `balance_due_cents` to the canonical balance-due derivation. Add the `appointment.payment_status` flag cross-check so all consumers benefit from the dual-gate semantics today only at `pay/[token]:191`.
- **Subtotal contract** — document and enforce: `subtotal = sum(transaction_items.total_price)` at insert/update time. Add an invariant assertion in any new transaction-writer path.
- **New helper: `src/lib/loyalty/redemption.ts`** — exports `calculateLoyaltyDiscount(points: number): {discount: number, points: number}` that mirrors the client-side math at `loyalty-panel.tsx:70-72`. Server `pos/transactions/route.ts` calls it to RECOMPUTE the client-submitted `loyalty_discount` instead of trusting it (closes the trust asymmetry from Section 0 row 8).
- **New helper: `src/lib/discounts/application-order.ts`** — exports `applyDiscounts({subtotal, coupon, loyalty, manual})` that returns the canonical per-component breakdown and the combined `discount_amount`. Locks the order: loyalty → coupon (on eligible-items subtotal) → manual.
- **Add `transactions.manual_discount_value` + `manual_discount_label` columns** — migration. Replicates `appointments.manual_*` onto transactions so the label survives at the transaction level. (Alternative: a more general `discount_breakdown` JSONB column for future flexibility — design decision in Phase 0.)

### Phase 2 — Helper migration (~1-2 sessions)

**Goal:** Every existing consumer flows through the helpers from Phase 1. Atomic commits per consumer family.

- Rewrite 6 grand-total sites (Section 0 row 1 list) to call `grandTotal()` from `lib/data/transaction-totals.ts`.
- Rewrite 3 balance-due sites (`payment-link/send.ts:349`, `webhooks/stripe/route.ts:145-153`, `(public)/pay/[token]/page.tsx:127,191`) to call the extended `composeReceiptPaymentLines()` derivation.
- Rewrite 3 subtotal-write sites (`api/book/route.ts:662`, `api/pos/transactions/route.ts:190`, `api/webhooks/stripe/route.ts:170`) to compute subtotal from `transaction_items` sum (or assert the invariant at insert time).
- Migrate `pos/transactions/route.ts:470-486` to recompute loyalty_discount server-side via `calculateLoyaltyDiscount()` instead of trusting client.
- Migrate `pos/transactions/route.ts` discount-application sites to use `applyDiscounts()`.

**Gates:** typecheck + lint + test should stay clean per consumer family. No data-model changes yet.

### Phase 3 — Option A data-model unification (~2-3 sessions)

**Goal:** One transaction per job. Payments accumulate. Receipt number is permanent across the lifecycle.

- **Sub-phase 3a — Booking flow rewrite.** `/api/book/route.ts:653-867` — change INSERT to `status='open'`, `total_amount=fullServiceTotal`, items pre-populated. INSERT `payments` row for the deposit.
- **Sub-phase 3b — Webhook rewrite.** `/api/webhooks/stripe/route.ts:66-308` — detect existing open transaction for the appointment; if found, UPDATE totals + INSERT new payment row. If not (walk-in pay-link, no prior booking), create new open transaction with items derived from `appointment_services`. Add row-level lock during UPDATE.
- **Sub-phase 3c — POS close-out rewrite.** `/api/pos/transactions/route.ts:182-207` — detect existing open transaction; if found, UPDATE totals/items, set `status='completed'`, INSERT additional payment rows. If not (walk-in), INSERT new tx as today.
- **Sub-phase 3d — Receipt rendering update.** Remove `linked_receipt` cross-reference (no longer two transactions). Update `is_deposit` detection to derive from `status='open'` rather than `appointments.payment_type='deposit'`.
- **Sub-phase 3e — Admin UI updates.** Admin Transactions list filter: add `status=open` view for in-flight transactions. Update reports to count payments not transactions.
- **Sub-phase 3f — QBO sync.** One QBO entry per transaction. Payments sync as QBO payments against the invoice. Status-change re-sync (`open→completed`).
- **Sub-phase 3g — Refund flow review.** Refunds attach to the one transaction. Refund can specify which payment(s) it offsets.

**Out of scope for Phase 3** (separately tracked):
- Historical 2-row data migration (intentionally not migrated — leave as-is for audit trail).
- Loyalty double-spend window fix (Q2) — naturally resolved by 3c when redemption is committed to the open transaction.

---

## Item 2 (Stripe payment link tip) — Interim Strategy

Decision deferred to Phase 0 of implementation. Three options recap:

| Option | Description | Pros | Cons |
|---|---|---|---|
| **6a** | Pause Item 2 until Phase 1+2 lands | Cleanest target — tip lands on unified row, no migration cleanup | Customers can't tip via link for 3-5 sessions |
| **6b** | Ship Item 2 as planned | Customer tip option available immediately | End-of-day `totalTips = sum(tx.tip_amount)` becomes a 2-row sum; needs pre-flight audit of tip-summing surfaces; cleanup at Phase 3 migration |
| **6c** | Modify scope — store tip on `payments.tip_amount` only | Forward-compatible with Phase 3; clean migration | Schema decision deviates from roadmap's stated acceptance criterion |

**Recommendation framework** (not a decision):
- If Phase 1+2 timeline is firm and short → **6a** (pause).
- If Phase 1+2 is uncertain or further out → **6c-i** (payment-row tip only).
- If you want the feature now and accept Phase 3 cleanup → **6b** with a pre-flight tip-summing audit.

---

## Open Questions for Sections 2-5 (Phase 0 of implementation)

To be resolved in Phase 0 of implementation, BEFORE Phase 1 writes any code.

### Section 2 — Payment Method Matrix (8 channels)

For each of: cash, card-WisePOS-E, digital-Venmo, digital-Zelle, check, card-Stripe-deposit, card-Stripe-link, card-Stripe-online-booking-full-payment — document:
- Which route creates the transaction (today vs. under Option A)
- The transaction shape on insert
- How payments attach (1:1 vs N:1)
- Any channel-specific edge cases (e.g., cash change-given, digital platform required)

### Section 3 — Cross-Product Patterns (7 scenarios)

Walk each scenario under BOTH current 2-row pattern AND Option A. Highlight where current pattern fails to capture the full picture.

1. Walk-in: $100 service, cash at pickup, no discount
2. Walk-in: $100 service, $20 manual discount, $80 cash at pickup
3. Online deposit: $500 service, $100 deposit at booking (card), $400 balance card at pickup
4. **The Reem case:** $435 service, $65.25 manual discount applied first, $369.75 link sent, customer paid via link, closed out
5. Multi-link: $500 service, $100 deposit at booking, $200 via link mid-job, $200 cash at pickup
6. Loyalty + coupon: $500 service, 50pts redeemed ($25 off), 10% coupon ($50 off), $425 paid via card at pickup
7. **Maximum case:** $500 service, 10% coupon ($50 off), 50pts loyalty ($25 off), $25 manual discount, $100 deposit at booking, $200 via link, $100 cash + tip via card at pickup

For each: show transactions row(s), payments row(s), discount/coupon/loyalty fields, expected receipt rendering, fidelity gaps under current pattern.

### Section 4 — Refund Data Model

Under Option A, where does refund attach? Cover:
- Pre-completion partial refund (deposit only)
- Pre-completion full refund (cancellation)
- Post-completion partial refund (one item)
- Post-completion full refund (entire job)

### Section 5 — Item 2 strategy refinement

Lock the 6a / 6b / 6c decision after Sections 2-4 land.

### Pre-Phase-1 unknowns to investigate

1. Does adding `transactions.manual_discount_value/label` columns conflict with the planned `discount_breakdown` JSONB approach? Design decision.
2. Row-level lock vs. optimistic concurrency for in-flight UPDATE — pick one for Phase 3b/3c.
3. Customer-facing UX framing for "your receipt was updated" emails — wording lock.
4. Migration policy for the loyalty trust-asymmetry fix — server-recompute might surface client/server discrepancies in existing data; do we backfill or accept drift?

---

## Document Bundling Note

**This document does NOT get committed alone.** Bundle with the Phase 1 implementation commit. The doc becomes the design baseline for the entire implementation arc — Phases 1, 2, 3 all reference it. Update Sections 2-5 (currently placeholders) during Phase 0 of implementation, in-session.

**Trace of audit history:** Round 1 (architecture), Round 2 (schema + reframe), Round 3 (helpers + discount data model), Q1/Q3/Q4 (cascade + carry-over + sparse receipt), Q2 (deferred). All findings consolidated above.

---

## Phase 1 Audit Addendum (2026-06-20, Session #158 worktree `wt-option-a-phase-1`)

Pre-implementation read-only audit performed during Phase 1 of the 3-phase
plan (helper consolidation, no consumer migration). Surfaces ONE
correction to Round 3 Section 0, plus implementation-locked Q-decisions.

### Correction to Section 0 row 1 — grand-total formula is NOT byte-identical

Round 3 Section 0 row 1 claimed the canonical grand-total formula
`Math.max(appointment_total ?? 0, total_amount ?? 0) + tip_amount` was
duplicated **byte-identically** across 6 inlined sites. The Phase 1
pre-implementation re-audit found that claim is **wrong** — three
variants exist:

| Variant | Sites | Expression |
|---|---|---|
| A — Flat + lax | `receipt-template.ts:723` (thermal), `receipt-template.ts:1482` (HTML), `(public)/receipt/[token]/page.tsx:361` | `Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount` |
| B — Nested + defensive | `pos/components/transactions/transaction-detail.tsx:412` | `Math.max(transaction.appointment?.total_amount ?? 0, transaction.total_amount) + (transaction.tip_amount ?? 0)` |
| C — Derived param + defensive | `admin/transactions/page.tsx:742` + `:919` | `Math.max(appointmentTotal ?? 0, tx.total_amount) + (tx.tip_amount ?? 0)` |

**Functional drift:** Variants B and C `?? 0` the tip; Variant A does
not. If `tip_amount` is ever `null` or `undefined` on a transaction,
Variant A would produce `NaN` (Math.max + NaN). Variants B and C
would not. All three produce identical output when `tip_amount` is a
real number.

**Why no production NaN incidents to date:** the database column is
`NUMERIC(10,2) NOT NULL DEFAULT 0` (DB_SCHEMA.md:3009), so values
written via the schema are always real numbers. The risk surface is
upstream data drift — e.g., a future code path that constructs a
transaction-shaped object in JS without setting `tip_amount`, or a
type assertion that bypasses the column constraint. **Latent risk,
not active bug.**

### How Phase 1 closes the risk

`computeGrandTotal` in `src/lib/data/transaction-totals.ts` (NEW)
bakes in the defensive `?? 0` on all three inputs:

```typescript
export function computeGrandTotal(input: {
  appointment_total?: number | null;
  total_amount?: number | null;
  tip_amount?: number | null;
}): number {
  return (
    Math.max(input.appointment_total ?? 0, input.total_amount ?? 0) +
    (input.tip_amount ?? 0)
  );
}
```

Phase 2 migration rewrites all three variants to call this helper.
The latent NaN risk on Variant A goes away as a side effect.

### Anti-regression tests today

Variant B is locked by `transaction-detail-total-with-tip.test.tsx`
(Session #155). Variant C is locked by
`transactions-list-tip-display.test.ts` cases 5 + 9 (Sessions
#156 + #157). Variant A (sites 1-3) had **no explicit formula test**
before Phase 1 — Phase 1's `transaction-totals.test.ts` covers the
helper formula directly, including a dedicated case for the
"tip absent (undefined)" guard that explicitly documents the Variant
A NaN protection. Phase 2 migrations of the 6 consumer sites
preserve the existing regression tests; the new helper tests provide
the upstream contract.

### Q-locks for Phase 1 implementation (5)

Reference for future phases — Phase 1 shipped these decisions:

| Q | Decision | Reason |
|---|---|---|
| Q1 | `computeBalanceDue` bakes in dual-gate (`paymentStatus='paid' → 0`); webhook callers omit | Asymmetric by design — render/read callers want authoritative answer, DECISION callers (webhook computing the NEW status) must not self-reference |
| Q2 | `DisplayTotals` shape keeps `manual_discount` + `coupon_discount` placeholder fields (always 0 in Phase 1) | Phase 3 schema work (transactions.manual_discount_value + manual_discount_label columns) only has to POPULATE the fields. Avoids shape change touching every consumer in Phase 3. |
| Q3 | `getActualRedemptionCents` deferred to Phase 2 | UX-boundary rounding (loyalty-panel.tsx:70-72's `Math.round(Math.min(...) * 100) / 100`) stays at the consumer site; Phase 1 helper module is pure math. |
| Q4 | Earn-math deferred to Phase 1.5 | Asymmetric trust model (server-canonical earn vs client-canonical redemption) + legacy `loyalty/earn/route.ts:60-61` lacks discount exclusion. Both need their own resolution session. |
| Q5 | Units: dollars for H1/H3/H4/H5, cents for H2 | Matches each helper's current consumer sites. The 3 `computeBalanceDue` consumers (send.ts:349, webhooks/stripe/route.ts:151, pay/[token]:127) already operate in cents; the rest are dollars. Money-Unify migrates dollars-side helpers later. |

### Phase 1 deliverable summary

- 2 NEW helper modules: `src/lib/data/transaction-totals.ts`, `src/lib/loyalty/redemption-math.ts`
- 2 NEW test files: 40 cases total (25 + 15)
- 3 doc MOD: CHANGELOG entry, ROADMAP ledger row, this addendum
- Gates: tsc 3 baseline preserved, lint 101 problems (0 new on new files), vitest 3534/3600 (+40), build clean
- **No consumer migrations** (Phase 2). **No touching `lib/payment-link/send.ts` or `webhooks/stripe/route.ts`** (parallel Item 2 work coordinated with Track A). **No schema changes** (Phase 3). **No behavior changes** (helpers are not called by any production code path yet).
