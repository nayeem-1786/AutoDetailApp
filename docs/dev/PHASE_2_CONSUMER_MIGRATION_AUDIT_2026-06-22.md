# Phase 2 (Option A) — Helper Consumer Migration Audit

> **Status:** AUDIT-ONLY. No code changed. No consumer migrated. Read-only evidence
> gathering on branch `audit/phase-2-consumer-migration`.
> **Date:** 2026-06-22
> **Predecessor:** `docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md` (Phase 1 / Session #158
> shipped the 5 helpers; Q2 / Session #162 migrated the first consumer).
> **Method:** 7 per-helper discover→verify agent pairs (each finding independently
> re-opened and confirmed) + 3 cross-cutting completeness sweeps + 12 first-hand
> spot-reads by the orchestrator. Every site below was opened and read; line numbers
> are current as of this branch's HEAD (`3ad9b596`).

---

## 1. Executive Summary

Phase 1 estimated "~16-17 consumer sites" cleanly migrating to 5 helpers. **The audit
found that estimate is materially wrong in both directions, and the per-helper count is
the least important finding.** The reality:

- **The money helpers (`computeGrandTotal`, `computeBalanceDue`) are migration-ready and
  high-value.** H1 has **6 confirmed direct consumers** (3 carry a latent NaN risk the
  helper closes); H2 has **8 confirmed direct consumers** — **5 more than Phase 1's
  claimed 3** (the composer, two receipt-template fallbacks, the pay-intent route, and the
  POS jobs route were all missed). Both are clean, low-risk substitutions in cents/dollars
  that match each helper's contract.

- **`deriveSubtotalFromItems` (H3) and `computeDisplayTotals` (H5) have ZERO direct
  consumers to migrate in Phase 2.** H3 is a *canonical-definition anchor*: every site
  resembling it is either an intentional divergence (loyalty earn excludes the water SKU;
  POS reducers sum a different in-memory model) or one of the 3 divergent subtotal **writes**
  that converge under **Phase 3**, not Phase 2. H5 is *foundation-only* — nothing builds the
  `DisplayTotals` shape, and adopting it now would **regress** discount granularity that
  `receipt-composer.ts` and the email receipt already compute (Q2 conflict). **Both should
  be explicitly de-scoped from Phase 2.**

- **The loyalty helpers are a unit-mismatch trap.** `pointsToCents` /`centsToPoints` /
  `getRedeemableRange` are **cents-canonical**, but **every would-be consumer works in
  dollars** (`* LOYALTY.REDEEM_RATE` = 0.05). `pointsToCents` has exactly **1 true consumer
  (already migrated)** and ~26 *display-only* dollars sites where migration means
  `fromCents(pointsToCents(x))` — strictly more verbose than today's `x * REDEEM_RATE` with
  no behavior gain. `centsToPoints` has **1 dollars-context semantic match** (loyalty-panel)
  + 3 divergent floor-caps; `getRedeemableRange` has **0 direct consumers** + 4 divergent
  single-cap sites. **The loyalty migration as specified does not fit its consumers and
  should be deferred or rescoped** (likely folded into Money-Unify, or preceded by adding a
  dollars-returning variant).

- **Two latent bugs surfaced** (flagged, NOT fixed): the **SMS** and **email** receipt
  totals (`receipts/sms/route.ts:86`, `receipts/email/route.ts:80`) omit the
  `Math.max(appointment_total, total_amount)` clamp, so a **close-out-shell transaction**
  (`total_amount = $0`, value carried on `appointment_total`) renders **`$0.00 + tip`** on
  the customer's SMS/email receipt. These are exactly the sites H1 exists to fix.

**Recommended strategy:** Reject the "1 session per helper" model — the file-overlap matrix
makes it infeasible (`receipt-template.ts` binds H1+H2+pointsToCents; `loyalty-panel.tsx`
binds all 3 loyalty helpers). Instead run **two cohesive batches by file ownership** —
**Batch M (Money: H1 + H2 + the 2 latent-bug fixes)** first, **Batch L (Loyalty)** second
and only after an operator decision on the dollars/cents unit question — with **H3/H5
explicitly deferred to Phase 3**. Batch M is the whole value of Phase 2; Batch L is
optional and may not be worth doing as specified.

| Helper | Phase-1 claim | Verified direct consumers | Net new finding |
|---|---|---|---|
| `computeGrandTotal` | 6 | **6** | +2 divergent latent-bug sites (SMS/email) |
| `computeBalanceDue` | 3 | **8** | +5 missed sites |
| `deriveSubtotalFromItems` | "3 writes + 2 reducers" | **0 direct** (3 divergent writes, 7 looks-similar) | reducers are camelCase in-memory, not consumers |
| `computeDisplayTotals` | (synthesizing) | **0** | Q2 granularity-regression conflict |
| `pointsToCents` | "~handful" | **1 migrated + ~26 dollars display/calc** | unit mismatch (cents vs dollars) |
| `centsToPoints` | "loyalty-panel + others" | **1 dollars semantic + 3 divergent** | NaN claim invalidated; floor-caps diverge |
| `getRedeemableRange` | "panel range" | **0 direct + 4 divergent** | no clean consumer exists |

---

## 2. Site Inventory

Units key: **$ = dollars, ¢ = cents, pts = points.** Risk codes: **NaN** = unguarded
nullable in the inline math that the helper's `?? 0` would change; **UNIT** = caller's unit
differs from the helper's; **GATE** = balance-due dual-gate (Q1) decision needed; **none** =
behavior-identical substitution.

### 2.1 `computeGrandTotal` — DOLLARS — `transaction-totals.ts:56`

Formula: `Math.max(appointment_total ?? 0, total_amount ?? 0) + (tip_amount ?? 0)`

| # | File : line | Current inline math | Variant | Unit | Risk | Q-lock | Class / complexity |
|---|---|---|---|---|---|---|---|
| 1 | `src/app/pos/lib/receipt-template.ts:723` | `Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount` | A | $ | **NaN** (tip unguarded) | none | direct / trivial |
| 2 | `src/app/pos/lib/receipt-template.ts:1482` | `Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount` (HTML `.toFixed(2)`) | A | $ | **NaN** | none | direct / trivial |
| 3 | `src/app/(public)/receipt/[token]/page.tsx:361` | `formatCurrency(Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount)` | A | $ | **NaN** (TS types tip non-null → mitigated) | none | direct / trivial |
| 4 | `src/app/pos/components/transactions/transaction-detail.tsx:412` | `Math.max(transaction.appointment?.total_amount ?? 0, transaction.total_amount) + (transaction.tip_amount ?? 0)` | B | $ | none | none | direct / trivial |
| 5 | `src/app/admin/transactions/page.tsx:742` | `Math.max(appointmentTotal ?? 0, tx.total_amount) + (tx.tip_amount ?? 0)` (table row) | C | $ | none | none | direct / trivial |
| 6 | `src/app/admin/transactions/page.tsx:919` | `Math.max(appointmentTotal ?? 0, tx.total_amount) + (tx.tip_amount ?? 0)` (CSV export) | C | $ | none | none | direct / trivial |

**NaN-corner per-site verdict (Audit Phase 2.1):** Sites 1–3 (Variant A) access `tip_amount`
**without** `?? 0`. The DB column is `NUMERIC(10,2) NOT NULL DEFAULT 0`, so production rows
never trigger it; the risk is a JS-constructed transaction-shaped object that omits
`tip_amount`. Site 3's TS type declares `tip_amount` non-optional, adding a compile-time
mitigation. **All three migrations change behavior only in the undefined-tip corner
(NaN → 0)** — a strict improvement, but operator should acknowledge it is a behavior change,
not a pure refactor. Sites 4–6 are byte-equivalent to the helper (no change).

Regression tests already lock Variants B (`transaction-detail-total-with-tip.test.tsx`) and
C (`transactions-list-tip-display.test.ts`); Variant A had no formula test until Phase 1's
`transaction-totals.test.ts`.

### 2.2 `computeBalanceDue` — CENTS — `transaction-totals.ts:98`

Formula: `paymentStatus === 'paid' ? 0 : Math.max(0, appointmentTotalCents - totalPaidCents)`

| # | File : line | Current inline math | Caller type | Unit | Risk | Class / complexity |
|---|---|---|---|---|---|---|
| 1 | `src/lib/payment-link/send.ts:368` | `Math.max(0, totalCents - paidCents)` | sizing-link (omit flag) | ¢ | none | direct / trivial |
| 2 | `src/app/api/webhooks/stripe/route.ts:152` | `Math.max(0, totalCents - paidSoFarCents)` | **DECISION** (computes `newPaymentStatus` at :192 — MUST omit flag) | ¢ | **GATE (omit)** | direct / trivial |
| 3 | `src/app/(public)/pay/[token]/page.tsx:127` | `Math.max(0, totalCents - paidCents)` | render/READ — but `payment_status` checked **separately** at :191 | ¢ | **GATE (see note)** | direct / **moderate** |
| 4 | `src/app/api/pay/[token]/intent/route.ts:110` | `Math.max(0, totalCents - paidCents)` | intent creation (render/decision) | ¢ | GATE (decide) | direct / moderate |
| 5 | `src/app/api/pos/jobs/[id]/route.ts:78` | `Math.max(0, totalCents - paidCents)` (`attachAmountDueCents`) | render | ¢ | none | direct / trivial |
| 6 | `src/lib/data/receipt-composer.ts:658` | `Math.max(0, appointmentTotalCents - totalPaidCents)` | render — **pure, no `payment_status` param available** | ¢ | GATE (plumb or omit) | direct / **moderate** |
| 7 | `src/app/pos/lib/receipt-template.ts:824` | `Math.max(0, transactionTotalCents - totalPaidCents)` (thermal walk-in fallback) | render | ¢ | none | direct / trivial |
| 8 | `src/app/pos/lib/receipt-template.ts:1226` | `Math.max(0, htmlTransactionTotalCents - htmlTotalPaidCents)` (HTML fallback) | render | ¢ | none | direct / trivial |

**Dual-gate per-site analysis (Audit Phase 2.3 / Q1):**
- **Site 2 (webhook)** is the canonical DECISION caller — it derives the *new*
  `payment_status` from the inbound payment. It **must continue to OMIT `paymentStatus`**
  (passing it would self-reference). Migration is trivial and Q1-correct.
- **Site 3 (pay page)** is the single most nuanced migration in Phase 2. Today the numeric
  balance is computed at `:127` and the flag cross-check lives **separately** at `:191`
  (`isPaid = appointment.payment_status === 'paid' || remainingCents <= 0`). If we migrate
  `:127` to **pass** `paymentStatus` (the Q1-intended render-caller behavior),
  `remainingCents` becomes `0` whenever the flag says paid even if the numeric subtraction
  disagrees — which then also changes `chargeCents` (`:131`) and makes the `:191` OR-branch
  partially redundant. The `isLinkConsumed` logic at `:198` also depends on `isPaid`.
  **Net effect is arguably more correct, but it is a real display/charge behavior change**
  in the flag-vs-numeric disagreement case, not a pure refactor. Operator must choose:
  (a) pass `paymentStatus` and simplify `:191`, or (b) keep numeric-only and don't pass.
- **Site 6 (composer)** is `pure / no DB access` (Q4 lock) — it has no `payment_status` in
  scope. To honor the dual-gate it must receive the flag as a new parameter; otherwise it
  stays a numeric-only caller (acceptable for a render feed, but then it can't benefit from
  the gate). This is the same "plumb-or-omit" decision as Site 3, one layer deeper.
- **Sites 1, 4, 5, 7, 8** are numeric-only today and stay numeric-only — trivial.

### 2.3 `deriveSubtotalFromItems` — DOLLARS — `transaction-totals.ts:131`

Formula: `items.reduce((sum, item) => sum + (item.total_price ?? 0), 0)`

**Direct consumers eligible for Phase-2 substitution: ZERO.** This helper is a
*canonical-definition anchor* (its own module spec calls it "scope-limited"). What exists:

**Looks-similar — intentional divergence (NOT migration targets):**

| File : line | Inline math | Why it diverges |
|---|---|---|
| `src/app/api/pos/card-customer/route.ts:144` | `items.reduce(... total_price)` minus water SKU | earn-spend excludes water product (loyalty rule) |
| `src/app/api/pos/loyalty/earn/route.ts:56` | filter `product_id !== water` then reduce | legacy earn, water exclusion |
| `src/app/api/pos/transactions/route.ts:534` | reduce minus water SKU | earn-on-redeem spend |
| `src/app/api/pos/sync-offline-transaction/route.ts:274` | reduce minus water SKU | offline-sync earn |
| `src/app/pos/context/ticket-reducer.ts:94` | `state.items.reduce((s,i)=>s+i.totalPrice,0)` | **camelCase `totalPrice` on in-memory `TicketState`** — different domain model, not `transaction_items` |
| `src/app/pos/context/quote-reducer.ts:44` | `state.items.reduce((s,i)=>s+i.totalPrice,0)` | same — in-memory `QuoteState` |
| `src/app/pos/jobs/components/job-detail.tsx:918` | `displayServices.reduce((s,s)=>s+s.total_price,0)` | `appointment_services`-derived entity; same shape but **different source** — *ambiguous* (could adopt helper, low value) |

**Divergent subtotal WRITES (Phase 3 convergence, NOT Phase 2):**

| File : line | Writes `subtotal =` | Semantic |
|---|---|---|
| `src/app/api/book/route.ts:709` | `totalAfterDiscount` (`= subtotal − coupon − loyalty`, `:611`) | **post-discount** |
| `src/app/api/pos/transactions/route.ts:191` | `data.subtotal` | **client-supplied** |
| `src/app/api/webhooks/stripe/route.ts:215` | `Number(appt.total_amount)` | **appointment snapshot** |

> Note: webhook also computes `subtotalCents = max(0, amountReceived − tip)` at `:185`, but
> that feeds the *payment_status decision*, not the written `transactions.subtotal` column
> (the write is `:215`). Two distinct values; only `:215` is the subtotal write.

These three write *semantically different values* into one column — the HIGH-severity
divergence from Round 3 Section 0 row 2. **They converge under Phase 3** (single-transaction
lifecycle), not by a Phase-2 helper substitution. Do **not** touch them in Phase 2.

### 2.4 `computeDisplayTotals` — DOLLARS — `transaction-totals.ts:202`

**Direct consumers: ZERO.** No production site builds the 10-field `DisplayTotals` shape;
the Phase-1 candidate files (`receipt-data.ts`, `receipt-composer.ts`, `receipt-template.ts`,
`transaction-detail.tsx`, `admin/transactions/page.tsx`) read transaction fields
individually or go through `composeReceiptPaymentLines`. The helper is **foundation work**.

**Adopting it in Phase 2 is a refactor, not a substitution — and it carries a Q2 conflict:**
`receipt-composer.ts:748` already derives `nonLoyaltyDiscount = Math.max(0, totalDiscount −
loyaltyDiscount)`, and `receipts/email/route.ts:80` already renders a coupon-vs-loyalty
split inline (`nld = discount_amount − (loyalty_discount || 0)`). `computeDisplayTotals`'
Phase-1 contract hard-codes `manual_discount = 0` and `coupon_discount = 0` (Q2 placeholder).
**Migrating these surfaces to H5 today would discard discount granularity they already
have.** H5 should wait for Phase 3 to populate the granular fields, or its adoption must be
scoped to surfaces that don't already split discounts.

### 2.5 `pointsToCents` — points → CENTS — `redemption-math.ts:46`

Formula: `points * LOYALTY.REDEEM_RATE_CENTS` (= `points * 5`)

**Already migrated (do not re-flag):** `src/lib/loyalty/redemption-guard.ts:69` —
`resolveBookingLoyaltyRedemption()` calls `pointsToCents(points)` and `/100`. This is the
Q2/Session-#162 path (`api/book/route.ts` calls the guard, not `pointsToCents` directly).

**The other ~26 sites all work in DOLLARS** (`x * LOYALTY.REDEEM_RATE`, 0.05). Migrating any
of them to the cents helper requires `fromCents(pointsToCents(x))` — *more code than the
status quo* for no behavior change. Representative (not exhaustive — full list in agent
output); all **UNIT** risk (cents helper vs dollars site), nearly all display-only/trivial:

| Surface | File : line(s) | Context |
|---|---|---|
| POS loyalty panel | `loyalty-panel.tsx:22`, `:72` | balance-value label; `:72` is the **Q3-locked UX rounding** (stays) |
| POS quote panel | `pos/components/quotes/quote-loyalty-panel.tsx:18` | display |
| **DECISION** | `api/pos/loyalty/redeem/route.ts:70` | returns discount to client — the one non-display path |
| Thermal/HTML receipt | `receipt-template.ts:923,933,1533,1539` | earned-points cash value |
| Email receipt | `receipts/email/route.ts:86,91` | earned-points display |
| POS milestone SMS | `api/pos/transactions/route.ts:586` | loyalty cash SMS |
| Booking wizard | `booking-wizard.tsx:1016` | client price calc |
| Booking confirm | `step-confirm-book.tsx:199,215,823` | client price calc + label |
| Account portal | `account/loyalty/page.tsx:88,197,240`; `account/page.tsx:189` | display |
| Public receipt | `receipt/[token]/page.tsx:560,570` | display |
| Admin | `admin/customers/[id]/page.tsx:1544`; `api/admin/messaging/[conversationId]/summary/route.ts:108` | display |

### 2.6 `centsToPoints` — CENTS → points — `redemption-math.ts:75`

Formula: `Math.ceil(cents / REDEEM_RATE_CENTS)` (clamp to balance when provided)

| File : line | Inline math | Unit | Class |
|---|---|---|---|
| `src/app/pos/components/loyalty-panel.tsx:70` | `Math.ceil(clamped / LOYALTY.REDEEM_RATE)` | **$** (÷0.05) | semantic match, **UNIT** — needs `centsToPoints(toCents(clamped), balance)`; the `:76` `Math.min(…, balance)` folds into the helper's clamp |
| `src/components/booking/booking-wizard.tsx:975` | `Math.floor(remainingAfterCoupon / REDEEM_RATE)` | $ | **divergent** — `Math.floor` cap (business-favoring), not `ceil` conversion |
| `src/components/booking/booking-wizard.tsx:996` | same | $ | divergent (cap) |
| `src/components/booking/step-confirm-book.tsx:212` | `Math.floor((subtotal − couponDiscount) / REDEEM_RATE)` | $ | divergent (cap) |

> **Correction to discovery (Audit Phase 2.1):** the discovery agent flagged
> `loyalty-panel.tsx:70` as carrying a NaN-via-undefined risk; the verification agent
> **invalidated** it — `dollarAmount` is `parseFloat(...) || 0` and `maxRedemption` derives
> from `number`-typed `TicketState` fields, so no `undefined` reaches the division. No NaN
> risk at this site.

Only **one** site (`loyalty-panel:70`) is a true semantic consumer, and it's dollars-context.

### 2.7 `getRedeemableRange` — points + CENTS → `{minPoints, maxPoints}` — `redemption-math.ts:115`

**Direct consumers: ZERO.** Four sites compute a *simplified single-cap* bound that omits
`minPoints`, the `REDEEM_MINIMUM` eligibility gate, and the dual-cap (balance ∧ subtotal):

| File : line | Inline math | Why divergent |
|---|---|---|
| `src/components/booking/step-confirm-book.tsx:210` | `Math.min(balance, Math.floor((subtotal − coupon) / REDEEM_RATE))` | dollars, single-cap, no min/eligibility |
| `src/components/booking/booking-wizard.tsx:975` | `Math.floor(remainingAfterCoupon / REDEEM_RATE)` | dollars, max-only |
| `src/components/booking/booking-wizard.tsx:996` | same | dollars, max-only |
| `src/app/pos/components/loyalty-panel.tsx:26` | `Math.min(fullDollarValue, ticket.total + ticket.loyaltyDiscount)` | compares two **dollar** amounts — not a points range at all |

Migrating any of these requires re-architecting their input/output contract (dollars→cents,
add min/eligibility). **Not Phase-2 candidates** without a product decision.

---

## 3. File Overlap Matrix

Rows = files touched by Phase-2-relevant math; columns = helpers. ✓ = direct consumer;
**d** = divergent/looks-similar (not a migration target but lives in the file); **w** =
divergent write (Phase 3). The matrix drives parallelization — a file with marks in
multiple columns **cannot** be split across parallel sessions assigned to different helpers.

| File | grandTotal | balanceDue | subtotal | displayTotals | pointsToCents | centsToPoints | redeemableRange |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `pos/lib/receipt-template.ts` | ✓✓ | ✓✓ | | | ✓✓✓✓ | | |
| `(public)/receipt/[token]/page.tsx` | ✓ | | | | ✓✓ | | |
| `admin/transactions/page.tsx` | ✓✓ | | | | | | |
| `pos/components/transactions/transaction-detail.tsx` | ✓ | | | | | | |
| `(public)/pay/[token]/page.tsx` | | ✓ | | | | | |
| `api/pay/[token]/intent/route.ts` | | ✓ | | | | | |
| `api/pos/jobs/[id]/route.ts` | | ✓ | | | | | |
| `lib/data/receipt-composer.ts` | | ✓ | | d(748) | | | |
| `lib/payment-link/send.ts` | | ✓ | | | | | |
| `api/webhooks/stripe/route.ts` | | ✓ | w(215) | | | | |
| `api/pos/receipts/email/route.ts` | **d(80)** | | | | ✓✓ | | |
| `api/pos/receipts/sms/route.ts` | **d(86)** | | | | d(earn) | | |
| `pos/components/loyalty-panel.tsx` | | | | | ✓✓ | ✓ | d(26) |
| `pos/components/quotes/quote-loyalty-panel.tsx` | | | | | ✓ | | |
| `api/pos/loyalty/redeem/route.ts` | | | | | ✓ | | |
| `api/book/route.ts` | | | w(709) | | (migrated via guard) | | |
| `api/pos/transactions/route.ts` | | | w(191) | | ✓(586) | | d(534) |
| `components/booking/booking-wizard.tsx` | | | | | ✓(1016) | d | d |
| `components/booking/step-confirm-book.tsx` | d(200) | | | | ✓ | d | d |
| `account/loyalty/page.tsx` · `account/page.tsx` | | | | | ✓ | | |
| `admin/customers/[id]/page.tsx` · `api/admin/messaging/.../summary/route.ts` | | | | | ✓ | | |

**Chokepoints that forbid per-helper parallelization:**

1. **`pos/lib/receipt-template.ts`** carries H1 (723,1482) **and** H2 (824,1226) **and**
   pointsToCents (923,933,1533,1539). A "grand-total session" and a "balance-due session"
   and a "loyalty session" would all collide here. → **H1, H2, and the loyalty display in
   this file must be one owner.**
2. **`pos/components/loyalty-panel.tsx`** carries all three loyalty helpers. → **the three
   loyalty migrations cannot be parallelized against each other.**
3. **`receipts/email/route.ts` + `receipts/sms/route.ts`** carry H1 (latent-bug fix) **and**
   pointsToCents (earn display). → these two files must be single-owner (assign to the money
   batch, which has to touch them for the clamp fix anyway).
4. **`api/webhooks/stripe/route.ts`** carries H2 (152) and an H3 divergent write (215) — but
   since H3 is Phase-3, Phase 2 only touches the H2 line here. No real conflict.

---

## 4. Looks-Similar-But-Not-Quite Findings

Classification: **(a) latent-bug** (flag for separate fix), **(b) intentional-divergence**
(out of scope), **(c) ambiguous** (operator decision). **None modified in this session.**

| # | File : line | Divergence from helper contract | Class |
|---|---|---|---|
| L1 | `api/pos/receipts/sms/route.ts:86` | grand-total **without** `Math.max(appointment_total, total_amount)` clamp → close-out shell renders `$0.00 + tip` | **(a) latent-bug** |
| L2 | `api/pos/receipts/email/route.ts:80` | grand-total without clamp (tip also unguarded) → same close-out-shell bug on email | **(a) latent-bug** |
| L3 | `lib/data/receipt-composer.ts:658` | balance-due without the `payment_status` dual-gate; pure/no-DB so can't consult the flag | **(c) ambiguous** — render-feed; correct *if* gate is plumbed (Q1) |
| L4 | `lib/data/receipt-composer.ts:748` | derives `nonLoyaltyDiscount` split — *more* granular than H5's `manual=0/coupon=0` placeholders | **(c) ambiguous** — blocks naive H5 adoption (Q2) |
| L5 | `components/booking/step-confirm-book.tsx:200` | `Math.max(0, subtotal − coupon − loyalty)` — clamps the *result* to 0, not the input choice; booking has no `appointment_total` | **(b) intentional** |
| L6 | `pos/context/ticket-reducer.ts:94`, `quote-reducer.ts:44` | sum `item.totalPrice` (camelCase) on in-memory state, not `transaction_items.total_price` | **(b) intentional** |
| L7 | earn sites: `card-customer:144`, `loyalty/earn:56`, `transactions:534`, `sync-offline:274` | subtotal-from-items **minus water SKU**; in service of earn (Q4-deferred) | **(b) intentional** |
| L8 | `loyalty-panel.tsx:22` | points→dollars via float `REDEEM_RATE` + manual `*100/round//100` instead of integer-cents | **(c) ambiguous** — sweep called it "latent-bug" (IEEE-754); single rounded conversion makes it low-severity, not an active bug |
| L9 | `booking-wizard.tsx:975,996`, `step-confirm-book.tsx:212` | `Math.floor` redemption **caps** (business-favoring) vs helper's `Math.ceil` conversion | **(b) intentional** |
| L10 | `api/pos/end-of-day/summary/route.ts:72` | `reduce(sum + total_amount)` for EOD revenue — management aggregate, not a per-receipt total | **(b) intentional** |
| L11 | `components/booking/booking-confirmation.tsx:81` | `remaining = total − amountCharged` — UX footnote text, not a transactional record | **(b) intentional** |
| L12 | `api/cron/lifecycle-engine/route.ts:1064` | loads `loyalty_redeem_rate` from `business_settings` (not the code constant) for SMS templates | **(b) intentional** — per-business config |

**Latent bugs L1 + L2 are the actionable surprise of this audit.** They are real
customer-facing render bugs for close-out-shell transactions and are precisely what
`computeGrandTotal` was built to prevent. They can be fixed *as part of* Batch M (migrate
them to the helper, gaining the clamp) or split into a standalone hotfix if the operator
wants the fix before the full migration.

---

## 5. Implementation Strategy Recommendation

### 5.1 Migration grouping — **reject per-helper; group by file ownership**

The file-overlap matrix kills "Option B: one session per helper" (§3 chokepoints 1–2). The
right split is **two cohesive batches plus a deferral**:

- **Batch M — Money (H1 + H2 + L1/L2 fixes).** Owns every money-receipt file end-to-end:
  `receipt-template.ts`, `receipt/[token]/page.tsx`, `transaction-detail.tsx`,
  `admin/transactions/page.tsx`, `pay/[token]/page.tsx`, `pay/[token]/intent/route.ts`,
  `pos/jobs/[id]/route.ts`, `receipt-composer.ts`, `payment-link/send.ts`,
  `webhooks/stripe/route.ts` (H2 line only), and `receipts/email|sms/route.ts` (clamp fix +
  the pointsToCents earn-display in those two files, so they stay single-owner). **6 H1 + 8
  H2 + 2 latent-bug sites.** This is the entire high-value, low-risk core of Phase 2.

- **Batch L — Loyalty (optional / gated).** Only worth running **after** the operator
  resolves the dollars-vs-cents unit question (§6 Q-A). Owns `loyalty-panel.tsx` (all 3
  helpers together), `quote-loyalty-panel.tsx`, `loyalty/redeem/route.ts`, the
  account/admin/booking display sites, **excluding** the money-receipt files Batch M owns.
  As specified (cents helpers, dollars consumers), this batch is **mostly negative-value**
  (verbosity↑, behavior unchanged) except the one DECISION path (`redeem/route.ts:70`).

- **Deferred — H3 + H5 → Phase 3.** Zero Phase-2 substitutions. The 3 divergent subtotal
  writes and the `DisplayTotals` shape adoption belong to the single-transaction lifecycle.

This is a refinement of Phase-1's "Option C: 2 batches (money vs loyalty)" — **endorsed**,
with the critical addenda that (a) H3/H5 leave Phase 2 entirely, and (b) Batch L is gated on
a unit decision and may be dropped.

### 5.2 Parallelization

- **Batch M and Batch L can run in parallel** *only because* Batch M takes full ownership of
  the shared `receipt-template.ts` / `receipt/[token]` / `email` / `sms` files (including
  their loyalty-display lines). If that ownership rule is not honored, they collide and must
  be sequential.
- **Within Batch L, the three loyalty helpers cannot be parallelized** (`loyalty-panel.tsx`
  binds them).
- Per Memory: parallel sessions must use a **git worktree** and renumber on merge collision.
  If both batches run concurrently, the second to merge renumbers and must diff
  ROADMAP/CHANGELOG against `origin/main` to avoid silently dropping the other's ledger row.

**Recommended: run Batch M solo first, then decide on Batch L.** The parallel option exists
but the file-ownership discipline it requires is error-prone for marginal calendar savings.

### 5.3 Per-session scope estimates (Memory #8 ceiling check)

| Session | Files | Sites | Est. LoC delta | Memory #8 |
|---|---|---|---|---|
| **Batch M** | ~11 | 16 (6 H1 + 8 H2 + 2 fix) | ~120–180 (mostly 1–3 line swaps + imports; pay-page Q1 + composer plumb are the heavy ones) | **OK** — under ceiling; if the pay-page Q1 rework feels large, split it out |
| **Batch L (if run)** | ~10 | ~27 | ~150–250 (every site needs unit handling) | **borderline** — recommend splitting by surface (POS panel / booking / account+admin display) into 2–3 sub-sessions |
| Phase 3 (H3/H5) | — | — | — | separate scope, not estimated here |

If Batch M's `pay/[token]` Q1 decision turns into a real rework of `isPaid`/`isLinkConsumed`,
peel sites 3/4/6 into a **Batch M2** so the trivial 11 sites ship clean and the nuanced
3 sites get their own review.

### 5.4 Test strategy — **(b) add per-consumer regression where one doesn't exist, else trust Phase-1 unit tests**

- H1 sites 4–6 are already locked by existing tests; sites 1–3 (Variant A) gain coverage
  from Phase-1's `transaction-totals.test.ts` undefined-tip case. **Add a thin
  render-level regression for the SMS/email close-out-shell fix (L1/L2)** — that's a real
  behavior change with no current guard.
- H2: the dual-gate is the risk. **Add a regression for the pay-page flag-vs-numeric
  disagreement** (the only site whose output changes), and a webhook test asserting the
  decision caller still omits the gate. The 5 trivial H2 sites can lean on Phase-1's
  `computeBalanceDue` unit tests.
- **Snapshot tests (option c) are discouraged** — receipt HTML/thermal output churns for
  unrelated reasons; targeted assertions on the computed total/balance are more durable.
- Batch L: if pursued, lock the `loyalty-panel` redemption math (ceil/clamp + Q3 rounding)
  with a behavior test *before* migrating, since the dollars→cents boundary is where a
  rounding regression would hide.

### 5.5 Risk assessment

| Batch | Deploy risk | UAT |
|---|---|---|
| Batch M (trivial 11) | **Low** — byte-equivalent swaps; Variant A NaN→0 is a strict improvement | Spot-check a normal receipt + a close-out-shell receipt (thermal, HTML, public page, admin, SMS, email) total/balance |
| Batch M (Q1 sites 3/4/6) | **Medium** — behavior change in flag-vs-numeric disagreement | Pay a partial link, confirm pay-page "remaining" + "link consumed" states; confirm composer balance on a partially-paid receipt |
| L1/L2 latent-bug fix | **Low→Medium** — fixes a real bug, but changes a previously-wrong number | Verify a close-out-shell SMS/email now shows gross, not `$0.00 + tip` |
| Batch L | **Low behavior risk, Medium churn risk** — mostly display, but ~27 sites of unit-conversion noise; the `redeem/route.ts:70` DECISION path is the one to watch | Redeem flow end-to-end at POS + booking; verify displayed loyalty cash values unchanged |

**Rollback plan:** each batch is a self-contained topic branch; the helpers are additive
(Phase 1 already shipped, no schema change), so reverting a consumer migration is a clean
`git revert` of the topic-branch merge with zero data implications. Migrate, then on a
production regression revert the single merge commit — the inline math returns and the
helper sits unused again (its state before this phase).

### 5.6 Order of operations

1. **Batch M first** — closes the user-visible feedback loop (receipts/balances are what
   customers and staff see) and fixes the L1/L2 latent bugs. Highest value, lowest risk.
2. **Operator unit decision (Q-A)** before any loyalty work.
3. **Batch L only if the unit decision makes it worthwhile** — otherwise fold loyalty
   consumer migration into Money-Unify when display sites move to cents wholesale.
4. **H3/H5 stay in Phase 3.**

Rationale for money-before-loyalty: the money helpers *fit* their consumers (same units,
clean substitution, real bug fixes); the loyalty helpers *don't* (cents vs dollars, mostly
display, no clean `centsToPoints`/`getRedeemableRange` consumer). Doing the well-matched
work first banks the value and de-risks the questionable work.

---

## 6. Open Questions for Operator

- **Q-A (gates Batch L) — Loyalty unit direction.** The loyalty helpers are cents-canonical;
  all ~27 consumers are dollars-context. Options: **(i)** add a dollars-returning variant
  (e.g. `pointsToDollars`) so display sites get a clean one-call swap; **(ii)** wrap every
  site in `fromCents(pointsToCents(x))` (verbose, no behavior gain); **(iii)** defer all
  loyalty consumer migration to Money-Unify when display moves to cents wholesale.
  **Recommendation: (i) or (iii).** Without this decision, Batch L is net-negative.

- **Q-B — Pay-page dual-gate (H2 site 3).** Migrate `pay/[token]:127` to **pass**
  `paymentStatus` (Q1-correct; folds the `:191` flag check into `remainingCents`, changing
  displayed "remaining"/charge when flag and numeric disagree) **or** keep it numeric-only
  and leave `:191` as the gate? **Recommendation: pass it and simplify `:191`** — but it's a
  behavior change that needs explicit sign-off.

- **Q-C — Composer dual-gate (H2 site 6).** `receipt-composer.ts` is pure/no-DB and has no
  `payment_status` in scope. Plumb the flag in as a parameter (full dual-gate) or leave it
  numeric-only (render feed)? **Recommendation: plumb it** so all receipt surfaces share the
  authoritative answer.

- **Q-D — L1/L2 latent bugs.** Fix the SMS/email close-out-shell total **inside Batch M**
  (migrate to the helper) or ship a **standalone hotfix first**? **Recommendation: inside
  Batch M** unless a close-out-shell receipt is being sent imminently.

- **Q-E — H3 `job-detail.tsx:918` (ambiguous).** The one looks-similar H3 site that *could*
  adopt `deriveSubtotalFromItems` (same shape, different entity). Migrate for consistency or
  leave it (it's a display sum on `appointment_services`, not `transaction_items`)?
  **Recommendation: leave it** — low value, and adopting a "transaction items" helper on a
  non-transaction entity muddies the helper's contract.

- **Q-F — H5 scope.** Confirm `computeDisplayTotals` adoption is **deferred to Phase 3**
  given the Q2 granularity-regression conflict (L4). **Recommendation: yes, defer.**

---

## 7. Memory #8 / Per-Session Scope Estimates

Per CLAUDE.md Rule 4 / Memory #8 (no quick fixes; fully-thought-out, scenario-complete
solutions) — the per-session ceiling is about reviewability, not a hard LoC cap:

- **Batch M (recommended single session):** ~16 sites / ~11 files / ~120–180 LoC. The 11
  trivial swaps are mechanical; the budget is dominated by the Q-B pay-page rework and the
  Q-C composer parameter plumb. **Within ceiling.** If Q-B/Q-C expand, split into **M1**
  (11 trivial + L1/L2 fixes) and **M2** (pay-page + intent + composer dual-gate, 3 sites).
- **Batch L (optional):** ~27 sites / ~10 files. **Recommend pre-splitting** into L-POS
  (`loyalty-panel` + `quote-loyalty-panel` + `redeem` route — the only behavior-bearing
  loyalty work), L-Booking (`booking-wizard` + `step-confirm-book` display), and L-Display
  (account + admin + public-receipt labels). Each sub-session is then comfortably small.
- **Phase 3 (H3 writes + H5 shape):** out of this audit's scope; estimate when the
  single-transaction-lifecycle design is locked.

**Bottom line:** Phase 2's real, valuable, in-scope work is **Batch M** — ~16 money sites
that fit their helpers and fix two latent receipt bugs. Everything else (H3, H5, and the
loyalty batch as currently specified) should be deferred or rescoped, not forced into Phase 2.

---

### Appendix — Audit provenance

- 7 discover→verify agent pairs (each site independently re-opened by a second agent) +
  3 completeness sweeps (money-math, loyalty-math, receipt-surfaces) + 12 first-hand
  orchestrator spot-reads. 17 agents, ~1.06M agent tokens.
- Every `file:line` in this document was opened and read on branch
  `audit/phase-2-consumer-migration` at HEAD `3ad9b596`. Line numbers reflect current code;
  drift from the 2026-06-20 Phase-1 audit is noted where it occurred (e.g. `send.ts`
  349→368; webhook subtotal write `170`→`215`).
- **No code was modified. No consumer was migrated. This document is the only artifact.**
