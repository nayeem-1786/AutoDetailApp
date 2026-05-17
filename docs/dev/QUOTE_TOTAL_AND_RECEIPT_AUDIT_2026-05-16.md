# Quote `total_amount` + Receipt Rendering Audit

**Date:** 2026-05-16
**Author:** read-only audit (no code or schema changes)
**Trigger:** UAT against shipped Item 15g Layers 15g-i + 15g-ii + 15g-iii surfaced two findings:

- **Finding 1.** Q-0067 (subtotal $1600, coupon $1584, loyalty $7.60, manual $7.10) persists with `quotes.total_amount = 1600.00`. The operator UI computes and shows `Total: $1.30` correctly via live state, but the DB value is `1600.00`.
- **Finding 2.** The customer-facing SMS link, email, PDF, and operator-facing detail view show the wrong total (no modifier breakdown, displays `$1600.00`).

**Purpose:** Establish whether `quotes.total_amount` is a writer-side bug, a semantic naming choice, or a consumer-side bug. Quantify the receipt-rendering gap. Recommend the smallest correct fix and its placement in Item 15g.
**Scope:** commit `8eaad4c5` on `main`. No external systems.
**This is NOT:** a fix, a redesign, or a sprint plan.

---

## Executive summary (read first)

**It's BOTH bugs, layered.**

1. **Writer-side semantic bug** (since pre-15g-ii): `createQuote` and `updateQuote` write `total_amount = subtotal + tax` with **no discount subtraction**. The field name implies "final amount owed", but the math stored is "pre-discount". Layer 15g-ii added per-modifier columns to `quotes` but did NOT update the `total_amount` formula — so the schema now carries the discount snapshot, but the totalling math still ignores it.

2. **Single internal consumer correctly handles the semantic.** `convert-service.ts:106-109` reads `quote.total_amount` and subtracts the modifier sum to compute `appointment.total_amount`. This is the ONLY consumer that treats `quote.total_amount` as pre-discount. Every other consumer (admin pages, public quote landing, SMS, email, PDF, voice agent) displays it AS the final total — silently mis-rendering by the modifier sum.

3. **Cross-table inconsistency.** `appointments.total_amount` (booking wizard + convertQuote) and `transactions.total_amount` are **net-of-discounts**. Only `quotes.total_amount` is pre-discount. The semantic drifts at the table boundary.

4. **Modifier line items absent from 4 of 4 customer-facing surfaces.** Even if `total_amount` is fixed to net, the customer SMS link, email, PDF, and operator detail view show no coupon/loyalty/manual lines at all — there's nothing in the templates that references the new columns. Customer sees a number with no breakdown explaining how it was reached.

**Recommended fix:** new Layer 15g-v ("Quote totals + receipt modifier rendering"). Touches the `quote-service.ts` total formula, all 4 customer-facing quote templates, and the saved-quote detail view. ~1-1.5 sessions. No schema migration needed (columns already exist from 15g-ii). Should land BEFORE Phase 1 (Layer 8a-8f) because Phase 1's edit-via-POS load-endpoint reads quote-derived data; if `quote.total_amount` is wrong the operator sees inconsistent numbers on appointment/job edits too.

---

## Section 1 — `quotes.total_amount` semantic audit

### 1.1 Schema state

`DB_SCHEMA.md:2073-2084`:

```
| Column       | Type            | Constraints          |
|--------------|-----------------|----------------------|
| subtotal     | NUMERIC(10,2)   | NOT NULL, DEFAULT 0  |
| tax_amount   | NUMERIC(10,2)   | NOT NULL, DEFAULT 0  |
| total_amount | NUMERIC(10,2)   | NOT NULL, DEFAULT 0  |
```

`DB_SCHEMA.md:2104-2113` (Layer 15g-ii additions):

```
| coupon_discount         | NUMERIC(10,2) | nullable |
| loyalty_points_to_redeem| INTEGER       | nullable |
| loyalty_discount        | NUMERIC(10,2) | nullable |
| manual_discount_type    | TEXT          | nullable |
| manual_discount_value   | NUMERIC(10,2) | nullable |
| manual_discount_label   | TEXT          | nullable |
```

**CHECK constraints** on `quotes` (DB_SCHEMA.md:2111-2114):
- `quotes_loyalty_coherent` — both loyalty fields nullable or both non-null + ≥ 0.
- `quotes_manual_discount_coherent` — type+value nullable as a pair; type ∈ {dollar,percent}; value > 0; percent ≤ 100.
- `quotes_mobile_consistency` — is_mobile + mobile_surcharge.

**No CHECK constraint relates `total_amount` to `subtotal` / `tax_amount` / the modifier columns.** The schema permits any non-null numeric value; the writer code-path decides the meaning.

No column comment on `total_amount` either — the live DB description is empty.

### 1.2 Writers

There are exactly **two** writers of `quotes.total_amount`:

#### 1.2.1 `createQuote` — `src/lib/quotes/quote-service.ts:134-170`

```ts
const itemsSubtotal = data.items.reduce((sum, item) => {
  return sum + item.quantity * item.unit_price;
}, 0);
const subtotal = Math.round((itemsSubtotal + mobileResolved.surcharge) * 100) / 100;

// Tax: apply TAX_RATE to items with product_id (products are taxable).
const taxableAmount = data.items.reduce((sum, item) => {
  if (item.product_id) {
    return sum + item.quantity * item.unit_price;
  }
  return sum;
}, 0);
const taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100;
const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
                                  // ^^^^^^^^^^^^^^^^^^^^^^
                                  // Pre-discount: subtotal + tax only
```

Then at line 170 the insert payload writes `total_amount: totalAmount`. Discount columns (coupon_discount / loyalty_discount / manual_discount_value) are persisted at lines 175-180 alongside it, but **they're not factored into `total_amount`.**

#### 1.2.2 `updateQuote` — `src/lib/quotes/quote-service.ts:344-361`

```ts
if (data.items && data.items.length > 0) {
  // ... compute subtotal + taxAmount as above ...
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  update.subtotal = subtotal;
  update.tax_amount = taxAmount;
  update.total_amount = totalAmount;
```

Same formula. `update.total_amount` is **only recomputed when `data.items` is supplied** (line 334 guard). A PATCH that changes ONLY the manual-discount fields won't re-derive `total_amount` — it stays at whatever was last written.

**No other writer touches `quotes.total_amount`.** Verified via:

```bash
grep -rn "total_amount" src/lib/quotes/ src/app/api/quotes/ src/app/api/pos/quotes/ src/app/api/voice-agent/quotes/ \
  | grep -v "test\|__tests__"
```

— only matches are the createQuote/updateQuote definitions and convert-service.ts (which READS, never writes back to the quote).

### 1.3 Readers

`grep -rn "quote\.total_amount\|q\.total_amount" src --include="*.ts" --include="*.tsx" | grep -v test`:

| File | Line | Reader behavior |
|---|---|---|
| `src/lib/quotes/convert-service.ts` | 108 | **Subtracts modifiers** — `Math.max(0, Number(quote.total_amount ?? 0) - totalDiscount)`. The ONLY consumer that treats `total_amount` as pre-discount. Output is written to `appointments.total_amount`. |
| `src/lib/quotes/send-service.ts` | 247, 331, 336, 486, 596 | **Displays as-is** in email template variable `quote_total`, SMS template variable `total_amount`, fallback text/HTML body Total line. Customer sees pre-discount. |
| `src/app/(public)/quote/[token]/page.tsx` | 322, 340 | **Displays as-is** in the public quote landing page Total row + "Accept" button confirmation. Customer sees pre-discount. |
| `src/app/api/quotes/[id]/pdf/route.ts` | 331 | **Displays as-is** in PDF TOTAL row. Customer sees pre-discount. |
| `src/app/api/quotes/[id]/accept/route.ts` | 127, 131, 162, 176 | **Displays as-is** in admin-fallback SMS + email confirming quote accepted. Customer sees pre-discount. |
| `src/app/admin/quotes/[id]/page.tsx` | 416 | **Displays as-is** in admin quote detail page Total. Operator sees pre-discount. |
| `src/app/admin/quotes/page.tsx` | 410 | **Displays as-is** in admin quote list "Total" column. Operator sees pre-discount. |
| `src/app/admin/quotes/components/quote-slide-over.tsx` | 173 | **Displays as-is** in admin quote slide-over. Operator sees pre-discount. |
| `src/app/admin/customers/[id]/page.tsx` | 1733, 1862 | **Sums for "Booked revenue"** stat across customer's converted quotes + displays as Total in quote-history rows. Analytics distorted upward by modifier sum. |
| `src/app/pos/components/quotes/quote-detail.tsx` | 551 | **Displays as-is** in POS quote-detail "Total" row. Operator sees pre-discount on the saved-quote review surface. |
| `src/app/pos/components/quotes/quote-list.tsx` | 270 | **Displays as-is** in POS quote list rows. Operator sees pre-discount. |
| `src/app/pos/components/quotes/quote-builder.tsx` | 168 | **Hydrates into runtime state** (`total: q.total_amount`), then `recalculateTotals` (reducer) immediately overrides with live-computed live total. So the builder UI shows the correct value AFTER load — but the line itself is misleading code (the stuffed value is never read). |
| `src/app/api/admin/messaging/[conversationId]/summary/route.ts` | 137 | **Returns to AI auto-responder context.** Pre-discount value bleeds into AI conversation summaries. |
| `src/app/api/voice-agent/quotes/route.ts` | 284, 299, 326 | **Logs + returns to ElevenLabs voice agent.** Caller hears pre-discount total on follow-up calls referencing the quote. |
| `src/app/api/voice-agent/initiation/route.ts` | 194 | **Inlines into voice-agent prompt context** for warm callbacks. Caller hears pre-discount totals. |
| `src/app/api/webhooks/twilio/inbound/route.ts` | 591 | **Inlines into Twilio AI inbound context.** Same as above. |
| `src/lib/quotes/quote-service.ts` | 524 | **Sums for `getQuoteStats()` aggregate revenue.** Quote-stats KPI distorted upward. |

**Summary:** 18 readers (excluding test files); only 1 (`convert-service.ts`) correctly treats `total_amount` as pre-discount. The remaining 17 surfaces display, sum, or relay the value as the final amount — silently inflating numbers across customer-facing UI, customer SMS/email/PDF, admin analytics, voice agent, AI responder.

### 1.4 Design intent assessment

**Inferred intent based on writer + readers (no explicit code comment or doc):**

There is no comment, docstring, or doc that explicitly says `quotes.total_amount` is meant to be "pre-discount" or "net". The writers compute `subtotal + tax`. The single consumer that subtracts modifiers (`convert-service.ts`) was written that way after Layer 15g-i added the convert-side modifier subtraction — i.e., it's a workaround that compensates for the writer NOT being changed.

**Option grading:**

- **Option A: "Final amount customer owes"** — matches what 17/18 readers do, matches the field name, matches the convention in `appointments.total_amount` + `transactions.total_amount`. **CONSISTENT with the rest of the schema and with consumer expectations.**
- **Option B: "Pre-modifier subtotal-equivalent; modifiers re-derived at read time"** — matches the writer math and matches `convert-service.ts`'s defensive read. **Single consumer benefits; everyone else is wrong.**
- **Option C: Mixed/inconsistent** — describes the current state precisely.

**Verdict:** Option A is the design intent the field name + ecosystem convention imply. The current writer-side math is a bug. `convert-service.ts`'s subtraction is a workaround that should be removed once the writer is fixed.

### 1.5 Pre-15g-ii behavior

Before Layer 15g-ii landed (commit `f59aff82` prior), the only modifier persisted on `quotes` was `coupon_code` — there was no `coupon_discount` snapshot at all. The discount was re-derived from the coupon code on every quote load via `/api/pos/coupons/validate`.

`createQuote` / `updateQuote` already had the same formula then — `total_amount = subtotal + tax`. **So `quotes.total_amount` was wrong pre-15g-ii too**, but the bug was less visible:

- Coupon discount was the only modifier that mattered, and most coupons are dollar amounts ≤ $50 — the "$1600 displayed when actual $1575" delta was small enough to slide past UAT.
- Manual discount and loyalty redemption were client-only state (per the prior audit) — they never reached the DB at all, so quote display showed pre-discount `total_amount` and that matched what the customer actually owed (because the customer-facing surfaces never knew about manual-discount or loyalty either).

Layer 15g-ii ELEVATED the bug from latent to visible: by persisting all 3 modifiers on the quote AND continuing to compute `total_amount = subtotal + tax`, the gap between "what we stash" and "what we display" widened proportionally. Q-0067 is the maximal case: $1598.70 of modifiers, $1600 displayed, $1.30 actually owed.

The pre-15g-ii writer was equivalent. Pre-15g-i (commit `409ab9de`), the convert-side subtraction in `convert-service.ts` didn't exist either — but that's the convert path, not the writer.

### 1.6 Conclusion on Finding 1

**BUG. The writer side is wrong.** `quotes.total_amount` should equal `subtotal + tax − (coupon_discount + loyalty_discount + manual_discount_resolved_dollar_value)`, clamped to ≥ 0. This matches:
- The field name semantic ("total").
- `appointments.total_amount` convention (`api/book/route.ts:332-363`).
- `transactions.total_amount` convention.
- What 17 of 18 readers currently assume.
- The operator UI's live `quote.total` (the in-memory state computed by `quote-reducer.ts:45-62`).

**Minimal change to fix (writer-side):**

- `src/lib/quotes/quote-service.ts` (createQuote, `:134-170`): after computing `subtotal` and `taxAmount`, resolve the modifier sum (coupon_discount + loyalty_discount + manual_discount_dollar — where manual percent is converted against `subtotal` exactly the way `convert-service.ts:resolveManualDiscountAmount` does it). Subtract from `subtotal + taxAmount`. Clamp ≥ 0.
- `src/lib/quotes/quote-service.ts` (updateQuote, `:334-361`): same recompute. **Also lift the "only when items provided" guard** so a PATCH that changes a modifier (and nothing else) triggers a `total_amount` recompute. The Layer 15g-ii auto-save now hashes modifiers (per `quote-ticket-panel.tsx:62-89`), so a modifier edit DOES PATCH; the server endpoint just needs to re-derive on modifier change.
- `src/lib/quotes/convert-service.ts:106-109`: REMOVE the subtraction workaround. Once writers store the net total, the convert path is just `total_amount: Number(quote.total_amount ?? 0)`. Keep the `Math.max(0, …)` clamp as defense-in-depth.

**Downstream readers stay as-is.** They were already correct in their assumption; the writer just needs to match them.

---

## Section 2 — Quote receipt rendering surfaces audit

The user described "4 receipts" but the actual quote-rendering surfaces are 4 distinct ones (none of them is the POS thermal-receipt printer, which is transaction-only — verified by `grep -n "quote\|estimate" src/app/pos/lib/receipt-template.ts` returning no quote-shaped content). The actual matrix:

| # | Surface | Entry point | Template file | Data scope | Renders modifiers today? | Total source | Q-0067 displays |
|---|---|---|---|---|---|---|---|
| 1 | **SMS body** | `POST /api/quotes/[id]/send` (`api/quotes/[id]/send/route.ts`) → `sendQuote()` in `src/lib/quotes/send-service.ts:91` | SMS template slug `quote_sms_admin` (rendered via `renderSmsTemplate` at `send-service.ts:334-338`) + fallback string at `:329-332` | `quote.total_amount` + `quote.quote_number` + business name + short_url only — no modifier fields passed | **No.** SMS body has only `total_amount` chip; no coupon/loyalty/manual chips. | `formatCurrency(quote.total_amount)` (pre-discount) | "Total: $1,600.00" — wrong; no modifier breakdown |
| 2 | **Public quote landing** (SMS link target, also the customer's web view) | `src/app/(public)/quote/[token]/page.tsx` (server component, fetched via `quotes` table SELECT `*` + items join) | Inline JSX in the same file | Full quote row + items (`SELECT *`); modifier columns ARE in scope | **No.** Renders Subtotal, Tax (conditional), Sale Savings (per-item delta), Total. No coupon/loyalty/manual rows. (`page.tsx:288-326`) | `formatCurrency(quote.total_amount)` | "Subtotal $1,600 / Total $1,600" — wrong; modifier rows never appear |
| 3 | **Email body** | Same `sendQuote()` flow; `templated.usedTemplate` path at `send-service.ts:238-256` calls `sendTemplatedEmail('quote_sent', …)`; fallback path at `:266-272` uses `buildEmailHtml`/`buildEmailText` at `send-service.ts:457-622` | Two paths: (a) DB template `quote_sent` rendered via the email block-renderer engine, variables `quote_subtotal` + `quote_tax` + `quote_total`; (b) Hardcoded fallback HTML/text — same 3 lines | Templated path: 3 currency vars only. Fallback path: same. | **No.** Both paths render Subtotal + Tax + Total, no modifier lines. | `formatCurrency(quote.total_amount)` | "Subtotal $1,600 / Tax $0 / Total $1,600" — wrong; no modifier breakdown |
| 4 | **PDF** (downloaded by customer, also attached as MMS to the SMS in production) | `GET /api/quotes/[id]/pdf` (`src/app/api/quotes/[id]/pdf/route.ts`) | Same file — inline PDFKit drawing instructions | Full quote row + items; modifier columns in scope | **No.** Renders Subtotal, Tax, TOTAL (`pdf/route.ts:310-334`). No modifier rows. | `formatCurrency(quote.total_amount)` | "Subtotal $1,600 / Tax $0 / TOTAL $1,600" — wrong; no breakdown |

**Bonus 5th surface (operator-facing, not a "receipt" but same bug):**

| # | Surface | File | Behavior |
|---|---|---|---|
| 5 | **POS Quote Detail** (saved-quote review screen) | `src/app/pos/components/quotes/quote-detail.tsx:537-553` | Renders Subtotal + Tax + Total (uses `quote.total_amount`). No modifier rows. Operator sees same wrong total as the customer. |

**Common pattern across all 4 customer-facing surfaces:**

1. None of them iterate the modifier columns. They were all built before Layer 15g-ii added the columns.
2. All 4 read `quote.total_amount` and display it as the final amount.
3. Fixing **just** the writer (Section 1.6) would make the displayed total match the discounted amount, but the customer STILL wouldn't see the modifier breakdown — they'd just see a smaller number with no explanation.
4. Customer-facing UX requires BOTH the writer fix AND a template update that renders coupon/loyalty/manual lines (mirroring what `<QuoteTotals>` already does in the operator UI).

The operator UI's `<QuoteTotals>` component at `src/app/pos/components/quotes/quote-totals.tsx:42-76` is a complete reference implementation — it renders:

```jsx
{quote.coupon && (
  <div>Coupon ({quote.coupon.code}) … −${quote.coupon.discount}</div>
)}
{quote.loyaltyDiscount > 0 && (
  <div>Loyalty ({quote.loyaltyPointsToRedeem} pts) … −${quote.loyaltyDiscount}</div>
)}
{quote.manualDiscount && (
  <div>{quote.manualDiscount.label} (…) … −${manualDiscountAmount}</div>
)}
```

The 4 customer-facing templates need the equivalent block, sourced from `quote.coupon_code`/`quote.coupon_discount`/`quote.loyalty_points_to_redeem`/`quote.loyalty_discount`/`quote.manual_discount_*` (the persisted columns added in Layer 15g-ii).

---

## Section 3 — Cross-reference: what does the operator-facing Quote UI do?

### 3.1 Component

`<QuoteTicketPanel>` at `src/app/pos/components/quotes/quote-ticket-panel.tsx:119+` is the in-flight quote builder. It renders `<QuoteTotals />` at `:1052`, which lives at `src/app/pos/components/quotes/quote-totals.tsx`.

### 3.2 Source of the displayed Total

**Live runtime state, NOT `quote.total_amount`.** `quote-totals.tsx:80`:

```jsx
<span>Total</span>
<span className="tabular-nums">${quote.total.toFixed(2)}</span>
```

`quote.total` is computed by the reducer in `src/app/pos/context/quote-reducer.ts:45-62`:

```ts
function recalculateTotals(state: QuoteState): QuoteState {
  const subtotal = state.items.reduce((sum, item) => sum + item.totalPrice, 0);
  let manualDiscountAmount = 0;
  if (state.manualDiscount) {
    if (state.manualDiscount.type === 'dollar') {
      manualDiscountAmount = state.manualDiscount.value;
    } else {
      manualDiscountAmount = Math.round(subtotal * state.manualDiscount.value / 100 * 100) / 100;
    }
  }
  const discountAmount =
    (state.coupon?.discount ?? 0) + state.loyaltyDiscount + manualDiscountAmount;
  const mobileSurcharge = state.mobile?.isMobile ? state.mobile.surcharge : 0;
  const totals = calculateTicketTotals(state.items, discountAmount, 0, 0, mobileSurcharge);
  return { ...state, ...totals };
}
```

This runs on every reducer action (ADD_PRODUCT, ADD_SERVICE, SET_COUPON, SET_LOYALTY_REDEEM, APPLY_MANUAL_DISCOUNT, …) — so the UI always reflects `subtotal − discountSum + tax + mobile`. On LOAD_QUOTE the persisted `total_amount` is briefly stuffed into state (`quote-builder.tsx:168`), but the next dispatch (or initial reducer pass) immediately overwrites with the live-computed value. This is why the UI shows `$1.30` correctly while the DB stashes `$1600.00`.

### 3.3 Could the same formula apply to the 4 receipt templates?

**Yes, with one transformation.** The reducer reads runtime state shapes (`state.coupon.discount`, `state.manualDiscount.{type,value}`, `state.loyaltyDiscount`). The persisted columns added in Layer 15g-ii are 1-to-1 with these:

| Reducer field | Persisted column |
|---|---|
| `state.coupon.discount` | `quote.coupon_discount` |
| `state.manualDiscount.type` | `quote.manual_discount_type` |
| `state.manualDiscount.value` | `quote.manual_discount_value` |
| `state.manualDiscount.label` | `quote.manual_discount_label` |
| `state.loyaltyDiscount` | `quote.loyalty_discount` |
| `state.loyaltyPointsToRedeem` | `quote.loyalty_points_to_redeem` |
| `state.subtotal` | `quote.subtotal` |
| `state.taxAmount` | `quote.tax_amount` |

Pulling the formula into a pure helper (e.g., `computeQuoteTotals(quote): { subtotal, tax, couponDiscount, loyaltyDiscount, manualDiscountAmount, total }`) callable from:
- `quote-service.ts createQuote` + `updateQuote` (write `total_amount` from the helper)
- `convert-service.ts` (already does the math inline; can call the helper instead)
- All 4 customer-facing templates (for the modifier rows)
- `quote-detail.tsx` (saved-quote review)

…would consolidate the math and eliminate the writer/reader semantic drift. The shipped reducer is the de-facto reference implementation; lifting it to a shared helper is mostly straight-line work.

---

## Section 4 — Other tables for consistency check

### 4.1 `appointments.total_amount`

**Net-of-discounts.** Writers:

- `api/book/route.ts:332, 363`: `totalAfterDiscount = subtotal - couponDiscount - loyaltyDiscount` → `total_amount: totalAfterDiscount`.
- `convert-service.ts:131`: `total_amount: finalTotal` where `finalTotal = Math.max(0, quote.total_amount - totalDiscount)`.
- `api/pos/jobs/route.ts:361-364` (walk-in synthetic appointment): `total_amount: appointmentTotal` where `appointmentTotal = servicesTotal + mobileSurcharge` (no modifier subtraction, but walk-in path starts with `discount_amount: 0` and operator applies discounts at the register — so net == subtotal at this stage by construction).
- `api/admin/appointments/[id]/services/route.ts` cascade (Layer 15g-iii): `total_amount: totals.totalAmount` where `totals` comes from `computeTotalsForServiceEdit` which does `subtotal − discount + tax`, clamped ≥ 0.

All writers converge on **net-of-discounts**. The convention is consistent and matches the field name.

### 4.2 `transactions.total_amount`

**Net-of-discounts (final tendered).** Writers:

- `api/pos/transactions/route.ts:189`: `total_amount: data.total_amount` — accepted from client-side. The client (POS checkout) sends the live-computed ticket total, which is `subtotal − all_discounts + tax + tip − loyalty_redemption − deposit_credit` per the `<TicketContext>` reducer at `ticket-reducer.ts`. Net.

Consistent with `appointments.total_amount`.

### 4.3 Consistency assessment

**Drift is isolated to `quotes.total_amount`.** Appointments and transactions both treat `total_amount` as net. Only quotes write pre-discount under that field name. The drift was created at the writer level (the createQuote/updateQuote formulas were written before any modifiers existed on quotes — back when subtotal + tax == total) and was never updated as modifiers landed.

The drift is invisible UNTIL modifiers are applied. Operators saving modifier-less quotes have always seen consistent numbers; the moment Layer 15g-ii widened the schema to persist modifiers, every modifier-bearing quote started revealing the gap.

---

## Section 5 — Recommendation

### 5.1 What's the actual bug?

**Both, layered:**

1. **`quotes.total_amount` is semantically wrong** — written as pre-discount, named as net. Fix: update the writer formula in `createQuote` / `updateQuote` to subtract modifiers, mirroring `appointments.total_amount` convention.

2. **Receipts don't display modifier breakdown** — 4 customer-facing templates (SMS, public landing, email, PDF) + 1 operator review (`quote-detail.tsx`) render Subtotal + Tax + Total without iterating the modifier columns. Even after fix #1 (so Total displays the correct discounted number), the customer would see a smaller number with no explanation of how it was reached. Fix: add coupon/loyalty/manual rows to each template, sourced from the persisted columns.

The two fixes are independent and additive — both are required for the UX to be correct.

### 5.2 Effort estimate per fix

**Fix A — `quotes.total_amount` writer correction** (~0.5 session):

- `src/lib/quotes/quote-service.ts`: extract a shared `computeQuoteTotals(input)` helper that mirrors the reducer math. Call from both `createQuote` and `updateQuote`. Lift the `data.items` guard in `updateQuote` so modifier-only PATCHes also recompute. ~30 LOC + co-located unit tests.
- `src/lib/quotes/convert-service.ts:106-109`: remove the `Number(quote.total_amount) - totalDiscount` workaround once writers are fixed; either delete the subtraction (trusting the new writer) or keep it behind a defense-in-depth comment.
- Tests: extend `quote-service.modifiers.test.ts` to assert `total_amount` = net for every modifier combination. Extend `convert-service.test.ts` to verify the post-fix convert path produces identical `appointments.total_amount` for a modifier-bearing quote.
- No schema migration. No DB_SCHEMA.md regen.
- **Risk:** every existing modifier-bearing quote currently has a wrong `total_amount` persisted. They become correct on the next save/PATCH (the auto-save fires on any edit per Layer 15g-ii's `computeQuoteHash`), but quotes that are never edited again will retain the wrong value. Optional: ship a one-shot recompute script that walks existing quotes and PATCHes `total_amount`.

**Fix B — Receipt modifier rendering** (~0.75-1 session):

- `src/app/(public)/quote/[token]/page.tsx`: insert coupon/loyalty/manual rows between Subtotal/Tax and Total (lines 288-326). Conditional on each modifier being applied; mirror `<QuoteTotals>` styling.
- `src/lib/quotes/send-service.ts buildEmailHtml` (`:496-622`) + `buildEmailText` (`:457-494`): same row insertions in both HTML and text bodies.
- `src/lib/quotes/send-service.ts` (templated path): templated email currently passes 3 currency variables (`quote_subtotal`, `quote_tax`, `quote_total`) to the DB-rendered template — extending requires either widening the variable set (would touch the email-template editor too) OR routing modifier-bearing quotes through the fallback HTML path. Cleaner: widen the variable set and update the seeded `quote_sent` template body.
- `src/lib/quotes/send-service.ts buildEmailHtml` fallback already has all the data via the `quote` parameter — straightforward additions.
- SMS template `quote_sms_admin`: short by design (160-char-ish limit). Adding modifier rows isn't viable — recommended UX is to use the message as a hook to the public-landing link, and let the landing page show the breakdown. **No SMS template change.** (Confirms with user.)
- PDF: `src/app/api/quotes/[id]/pdf/route.ts:300-334`: insert modifier rows between Subtotal/Tax and TOTAL. Same conditional rendering pattern.
- POS quote-detail surface (`quote-detail.tsx:537-553`): also gets the modifier rows so the operator's saved-quote review matches the customer view.
- Tests: snapshot tests for the email HTML + PDF output (or assertion-style); confirm modifier rows present when applicable, absent when not. The public landing page is a server component — a thin react-testing-library test verifying the modifier rows render with the appropriate persisted-column inputs.
- **Risk:** the email DB template (`quote_sent`) is admin-editable from `/admin/marketing/email-templates`. Widening its variable set risks operators reverting/customizing the template and losing the modifier rows. Mitigation: document the variables in the admin UI (variables drawer); seed the default template with the modifier-row markup.

**Total: ~1-1.5 sessions, ~2-3 hours.**

### 5.3 Item 15g sub-layer placement

**Recommend: new Layer 15g-v, distinct from 15g-iv.**

Reasoning:
- Layer 15g-iv's scope is booking wizard cleanup + comprehensive tests. Adding 2 more deliverables (writer fix + receipt rendering across 4 surfaces) inflates 15g-iv beyond its session brief and intertwines two unrelated concerns (booking wizard migration vs. quote display correctness).
- The writer fix is **logically the closing layer of the persistence chain** — Layer 15g-i closed convert+checkout, Layer 15g-ii added schema + endpoint propagation, Layer 15g-iii added UI surfacing on appointment/job, Layer 15g-iv finishes booking wizard. Layer 15g-v closes the customer-facing receipt + the persisted-total semantic.
- Layer 15g-v has independent test coverage (writer math + 4 template snapshots) — easy to atomize.

**Proposed name:** *"Layer 15g-v — Quote totals + receipt modifier rendering"*.

Effort: ~1-1.5 sessions. No schema migration; ESLint enforcement out of scope.

### 5.4 Sequencing vs. Phase 1 (Layer 8a-8f)

**Strongly recommended: 15g-v lands BEFORE Phase 1.**

Reasoning:
- Phase 1's `LOAD_FROM_SOURCE` action (per QUOTE_TO_POS_EDIT_AUDIT §7) hydrates `<TicketContext>` from a load endpoint (likely `checkout-items` or a new sibling). The load endpoint reads `appointment.total_amount` today. After 15g-iii, the appointment-side is correct (cascade preserves modifiers + writes canonical combined `discount_amount`).
- But Phase 1 also touches the QUOTE→APPOINTMENT path indirectly — if the operator opens an appointment that originated from a quote and reviews it, the appointment values are correct, but the source quote (still viewable in admin/POS) shows the wrong total. Phase 1's UX includes "edit services via POS" round-trips; the operator landing on the cart sees correct numbers, but if they navigate back to the source quote (saved-quote detail view) the numbers diverge.
- Customer-facing surfaces (SMS link, email, PDF, public landing) are user-facing **today** — every existing quote with a modifier sends the wrong number to the customer. Phase 1 only worsens this if it ships first (more operator-facing surfaces showing the wrong number; more confusion when reconciling).
- Phase 1 effort estimate (~5.5 sessions per QUOTE_TO_POS_EDIT_AUDIT §8.2) dwarfs 15g-v's 1-1.5 sessions. Landing 15g-v first is cheap and unblocks the rest.

**Recommended order:** 15g-iv (booking wizard cleanup, ~1 session) → 15g-v (this audit's fix, ~1-1.5 sessions) → Phase 1 (~5.5 sessions). Total ~8 sessions remaining in the immediate stack.

Alternative: parallel-track 15g-v alongside Phase 1's 8a (backend cascade extraction) — no file overlap. Increases simultaneous in-flight work but doesn't extend the critical path.

### 5.5 Breaking-change risks

| Risk | Severity | Notes |
|---|---|---|
| QBO line-item sync (`src/lib/qbo/sync-transaction.ts`) | **Zero.** | QBO syncs `transactions`, not quotes. Quotes are pre-sale; QBO never sees them. |
| Reports / analytics that aggregate `quotes.total_amount` | **Medium.** | `getQuoteStats()` at `quote-service.ts:524` sums `total_amount`. `admin/customers/[id]/page.tsx:1733` sums for "Booked revenue" stat. Both currently OVERSTATE by the modifier sum. Post-fix, both will report the truthful (lower) number — that's a STAT REGRESSION even though it's mathematically the correct number. Operator may notice "revenue went down" after deploy; release notes should explain. |
| Customer-facing receipts already sent (SMS history, email log, PDF downloads) | **Low-medium.** | If a customer received an SMS yesterday quoting Total $1,600 and clicks the link today after deploy, the public landing page renders Total $1.30 + modifier rows. **This is an improvement** (truthful), but the customer may be confused by the discrepancy with the historical SMS. Mitigation: the PDF + landing page are re-rendered on every view; the persisted SMS body itself cannot be retroactively edited. Acceptable trade-off — accuracy > consistency-with-stale-SMS. |
| Voice agent + AI auto-responder context | **Low.** | These read `total_amount` from quote summaries; post-fix they'll relay the truthful net total. Less confusing for the customer, not more. |
| `convertQuote` behavior change | **Low.** | If `convert-service.ts:108`'s subtraction is removed, the resulting `appointment.total_amount` is unchanged (since the writer now produces a quote.total_amount that's already net). Verifiable by extending `convert-service.test.ts` with a same-input-different-fix-stage assertion. |
| In-flight quote edits | **Zero.** | The operator UI computes `quote.total` live from runtime state — unaffected by either fix. Auto-save PATCH will trigger the recomputed `total_amount` on the next edit cycle. |
| Existing modifier-bearing quotes with wrong persisted `total_amount` | **Low.** | Auto-save naturally fixes them on the next edit. One-shot back-fill script optional — recommended for quotes that haven't been touched in 30+ days (a SQL script that PATCHes `total_amount` directly from `subtotal + tax_amount - coupon_discount - loyalty_discount - resolved_manual_discount`). |
| ESLint enforcement | **Out of scope.** | Item 15f Layer 4 covers no-bespoke-pricing; this audit doesn't expand it. |

**Net assessment:** breaking-change risk is **low across the board**. The fix makes the data path more correct, not less. Largest behavioral change is in stats/analytics — operators will see "Booked revenue" drop after deploy for the period covered by modifier-bearing quotes, but the post-fix number is the truthful one.

---

## Appendix A — Files referenced (read-only)

### Quote writers/readers
- `src/lib/quotes/quote-service.ts` (createQuote, updateQuote, getQuoteById, getQuoteStats)
- `src/lib/quotes/convert-service.ts` (sole correctly-defensive reader)
- `src/lib/quotes/send-service.ts` (sendQuote — SMS + email rendering)
- `src/app/api/quotes/[id]/send/route.ts` (entry point)
- `src/app/api/quotes/[id]/pdf/route.ts` (PDF generator)
- `src/app/api/quotes/[id]/accept/route.ts` (accept flow + confirmation SMS/email)
- `src/app/(public)/quote/[token]/page.tsx` (customer landing)

### Operator UI
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` (in-flight builder)
- `src/app/pos/components/quotes/quote-totals.tsx` (reference reducer-based total renderer)
- `src/app/pos/components/quotes/quote-detail.tsx` (saved-quote review — also broken)
- `src/app/pos/components/quotes/quote-builder.tsx` (LOAD_QUOTE stuff)
- `src/app/pos/components/quotes/quote-list.tsx`
- `src/app/pos/context/quote-context.tsx` + `quote-reducer.ts` (live-state reference)

### Admin
- `src/app/admin/quotes/page.tsx` + `[id]/page.tsx` + `components/quote-slide-over.tsx`
- `src/app/admin/customers/[id]/page.tsx` (booked-revenue stat + history)

### Other readers
- `src/app/api/voice-agent/quotes/route.ts`
- `src/app/api/voice-agent/initiation/route.ts`
- `src/app/api/webhooks/twilio/inbound/route.ts`
- `src/app/api/admin/messaging/[conversationId]/summary/route.ts`

### Schema / docs
- `docs/dev/DB_SCHEMA.md` § `quotes` (lines 2073-2123)
- `docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md` (full)
- `docs/dev/ROADMAP-13-ITEMS.md` § Item 15g (lines 1428-1547)

---

*End of audit. No code changes performed. The deliverable is this document; the decision (Layer 15g-v scope, ordering relative to Phase 1) is the user's.*
