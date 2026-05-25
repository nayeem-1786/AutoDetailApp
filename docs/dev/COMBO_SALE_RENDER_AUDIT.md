# Combo / Sale Discount Rendering Audit (2026-05-24)

> Read-only audit of every quote and receipt rendering surface in the
> codebase. Output of Issue 33 root-cause fix follow-up: combo pricing
> now persists correctly in `quote_items.unit_price` /
> `standard_price` / `pricing_type='combo'` across all 5 quote-creation
> paths, but the customer-facing quote page does NOT show the
> strikethrough / savings visualization for combo lines. Empirical
> evidence: Q-0085 shows `Pet Hair & Dander Removal | Qty 1 | $100 |
> $100` with no indication that the original price was $125.
>
> Goal: inventory every render surface, identify the gap, and recommend
> a maximum-reuse fix that closes the customer-facing fidelity gap and
> prevents future drift.
>
> NO code changes in this session. NO new tests. File:line citations
> throughout.

## TL;DR

**10 line-item render surfaces audited across 6 distinct files.** The
RECEIPT side (transaction surfaces) is uniformly correct — the
`item.pricing_type !== 'standard' && item.standard_price > item.unit_price`
predicate appears verbatim in 4 places (thermal text, thermal HTML,
public receipt page, email plain-text fallback) and handles combo +
sale together. The QUOTE side is the gap: the public quote page
filters strictly on `pricing_type === 'sale'`, so combo lines render
as plain prices; the admin / POS quote views render only `total_price`
with no discount visualization at all; the quote PDF route doesn't
even SELECT `pricing_type` / `standard_price` from the database.

**There is NO shared line-item rendering component today.** Each
surface inlines its own conditional. The receipt-side surfaces drifted
into uniform correctness by accident — the predicate has been
copy-pasted 4 times with identical wording. The quote-side surfaces
have drifted in the OPPOSITE direction — different conditionals (or
none) per surface.

**Recommendation: extract a shared formatter helper (NOT a shared
component), adopt across all 6 quote-side surfaces, and shrink the 4
receipt-side conditional sites to call the same helper.** A helper
returns `{ hasDiscount: boolean; label: 'Combo' | 'Sale'; standardPrice; savings }`
and each surface decides its own JSX/HTML/PDF/plain-text shape. This
keeps each surface's visual styling autonomous (the thermal needs
single-line text; the web pages need responsive table cells; the PDF
needs explicit `doc.text(...)` coordinates) while collapsing the
predicate to one source of truth. Estimated fix scope: **1 helper
(~30 LOC) + 6 surface adoptions (~15 LOC each) + savings-total
helper for the "You saved $X" line (~20 LOC) + tests (~25-30) =
1 focused session, ~1.5-2 hours CC.**

**The quote PDF route ALSO needs a SELECT widening to pull
`pricing_type` and `standard_price` from `quote_items`.** This is an
additional ~2-line change beyond the helper adoption.

## Surface inventory

| # | Surface | File:lines | Discount UI today? | `standard_price`/`pricing_type` in scope? | Action |
|---|---------|-----------|--------------------|-------------------------------------------|--------|
| 1 | **Public quote page** (customer-facing) | `src/app/(public)/quote/[token]/page.tsx:240-280, 304-319` | ⚠️ PARTIAL — `pricing_type === 'sale'` only; combo silently falls through | ✅ Yes — `quote_items(*)` SELECT at line 32 pulls all columns | **PRIMARY FIX** — generalize predicate to include `'combo'`; rename "Sale Savings" total label to "You saved" |
| 2 | **Quote PDF** | `src/app/api/quotes/[id]/pdf/route.ts:290, 296` + local type at 12-18 + SELECT at 470 | ❌ NONE | ❌ No — SELECT omits `pricing_type` / `standard_price`; local QuoteItem type also omits | **EXPAND** SELECT + type, then adopt formatter |
| 3 | **Admin quote detail page** | `src/app/admin/quotes/[id]/page.tsx:381-400` | ❌ NONE — bare `formatCurrency(unit_price)` / `total_price` | ✅ Yes — `item.pricing_type` / `item.standard_price` available on `QuoteItem` type | **ADOPT** formatter helper |
| 4 | **Admin quote slide-over** | `src/app/admin/quotes/components/quote-slide-over.tsx:138-151` | ❌ NONE — only `total_price` shown | ✅ Yes — same `QuoteItem` shape | **ADOPT** formatter helper (lower priority — internal) |
| 5 | **POS quote detail page** | `src/app/pos/components/quotes/quote-detail.tsx:514-545` | ❌ NONE — only `total_price` shown | ✅ Yes — `quote.items[idx]` carries DB fields | **ADOPT** formatter helper |
| 6 | **POS quote-item-row** (active quote builder) | `src/app/pos/components/quotes/quote-item-row.tsx:230` | ❌ NONE — `${item.totalPrice.toFixed(2)}` only | ✅ Yes — `item.pricingType` / `item.standardPrice` already on `TicketItem` (`pos/types.ts`) | **ADOPT** — POS sale-side `ticket-item-row.tsx` is the reference (it ALREADY handles combo + sale at line 278-409) |
| 7 | **Public receipt page** (post-sale) | `src/app/(public)/receipt/[token]/page.tsx:230-234` | ✅ YES — `pricing_type !== 'standard' && ...` correctly handles combo + sale | ✅ Yes — `transaction_items(*)` SELECT in `receipt-data.ts:50` | **MIGRATE** to formatter helper (no behavior change; collapses the inline predicate) |
| 8 | **Thermal receipt text** | `src/app/pos/lib/receipt-template.ts:617-622` | ✅ YES — same predicate | ✅ Yes — `ReceiptTransactionItem` type at lines 13-25 includes both fields | **MIGRATE** to formatter helper |
| 9 | **Thermal receipt HTML / print-copier** | `src/app/pos/lib/receipt-template.ts:1079-1083` | ✅ YES — same predicate | ✅ Yes — same type | **MIGRATE** to formatter helper |
| 10 | **Email receipt plain-text fallback** | `src/app/api/pos/receipts/email/route.ts:48-52` | ✅ YES — same predicate | ✅ Yes — same shape | **MIGRATE** to formatter helper |
| (N/A) | **POS sale ticket-item-row** | `src/app/pos/components/ticket-item-row.tsx:128-291, 365-409, 464` | ✅ YES — full strikethrough + combo + sale; the reference pattern for surfaces 3-6 | n/a — already correct | **MIGRATE** to formatter helper (cosmetic consolidation) |
| (N/A) | **SMS body — `quote_sms_midcall`** | `src/app/api/voice-agent/send-quote-sms/route.ts:405-411` | n/a — body is just `"Here's your quote from {biz} for {service names}: {url}"`, no prices | n/a | **NONE** — line items only appear on the quote URL (surface #1) |
| (N/A) | **SMS body — quote reminder cron** | `src/app/api/cron/quote-reminders/route.ts:51, 92, 178, 215` | n/a — only `servicesList` (comma-joined names), no prices | n/a | **NONE** — same reason |

**Effective render surfaces requiring change: 6 (surfaces 1-6).**
**Surfaces eligible for cosmetic consolidation (already correct
behavior): 4 (surfaces 7-10) + ticket-item-row.**

## Detailed findings per target

### Target 1 — Customer-facing quote HTML surfaces

**File:** `src/app/(public)/quote/[token]/page.tsx`

Surface routed to via the SMS short-link in `quote_sms_midcall`. This
is THE customer-facing fidelity bar.

**Current rendering (lines 234-284):**

The page iterates `composeLineItems(quote, quote.items || [])`. For each
item, it cross-references the original `quote.items[idx]` (skipping
synthetic mobile-fee rows at the end per Phase Mobile-1.7) and computes:

```typescript
const isSaleItem =
  !!original &&
  original.pricing_type === 'sale' &&
  original.standard_price != null &&
  original.standard_price > original.unit_price;
const savings =
  isSaleItem && original ? original.standard_price! - original.unit_price : 0;
```

The render then branches: `isSaleItem ? <strikethrough + green new price + "Save $X">  : <plain price>`.

**Defect:** the predicate at line 241 is `pricing_type === 'sale'`,
not `pricing_type !== 'standard'`. Combo items pass through to the
plain-price else branch at line 270-272 even when their
`standard_price > unit_price`.

The "Sale Savings" totals row at lines 304-319 uses the SAME defective
predicate (line 306) and therefore underreports savings when combos
are present.

**`composeLineItems`** at `src/lib/utils/compose-line-items.ts` does
not consume `pricing_type` or `standard_price` (it's a synthesizer for
the mobile-fee row only). Its output's `unit_price` / `total_price`
preserve the original line item's DB values. So the source data IS
there — just gated behind the wrong predicate.

**Required change (verbatim diff sketch):**

```diff
- const isSaleItem =
+ const isDiscountItem =
    !!original &&
-   original.pricing_type === 'sale' &&
+   original.pricing_type != null &&
+   original.pricing_type !== 'standard' &&
    original.standard_price != null &&
    original.standard_price > original.unit_price;
```

Plus rename "Sale Savings" → "You Saved" (or per operator preference)
and broaden the same predicate inside the savings reduce at line 306.

### Target 2 — Receipt surfaces (4 surfaces, per CLAUDE.md rule)

All four are correct today. Documented for completeness so the
implementation knows what NOT to break.

**Surface a — Public receipt web page** (`src/app/(public)/receipt/[token]/page.tsx:230-234`):
```typescript
{item.pricing_type && item.pricing_type !== 'standard' &&
 item.standard_price != null && item.standard_price > item.unit_price && (
  <div className="text-xs text-green-500 mt-0.5">
    {item.pricing_type === 'combo' ? 'Combo' : 'Sale'}: Reg
    {formatCurrency(item.standard_price)} | Saved
    {formatCurrency(item.standard_price - item.unit_price)}!
  </div>
)}
```

**Surface b — Thermal receipt text** (`src/app/pos/lib/receipt-template.ts:617-622`):
```typescript
if (item.pricing_type && item.pricing_type !== 'standard' &&
    item.standard_price != null && item.standard_price > item.unit_price) {
  const savings = item.standard_price - item.unit_price;
  const label = item.pricing_type === 'combo' ? 'Combo' : 'Sale';
  push({ text: `  ${label}: Reg $${item.standard_price.toFixed(2)} | Saved $${savings.toFixed(2)}!`, ... });
}
```

**Surface c — Thermal receipt HTML / print-copier output**
(`src/app/pos/lib/receipt-template.ts:1079-1083`): same predicate +
`<td colspan="3"...>${label}: Reg $X | Saved $Y!</td>`.

**Surface d — Email receipt plain-text fallback**
(`src/app/api/pos/receipts/email/route.ts:48-52`): same predicate +
`line += `\n  ${label}: Reg $X | Saved $Y!``.

All four are post-sale (`transaction_items`), not quote. Thermal
receipts are sale-only — quote → thermal is not a flow. **Quote vs
sale separation is correct in the codebase already.**

`fetchReceiptTransaction` at `src/lib/data/receipt-data.ts:50` uses
`items:transaction_items(*)` so all DB columns flow through, including
`pricing_type` and `standard_price`.

### Target 3 — Email and SMS templates

**Quote SMS body** (`src/app/api/voice-agent/send-quote-sms/route.ts:405-411`):

The slug `quote_sms_midcall` renders as
`"Here's your quote from {biz} for {service names}: {short_url}"`.
No prices appear in the SMS body — the SMS is a pointer to the quote
URL. No render change needed in the SMS template itself; the fix lives
at the URL target (surface #1).

**Quote reminder SMS** (`src/app/api/cron/quote-reminders/route.ts:51,
92, 178, 215`):
```typescript
items:quote_items(item_name)
...
const servicesList = (items ?? []).map((i) => i.item_name)
  .filter(Boolean).join(', ');
```
Same shape — service-name pointer, no price content. No change needed.

**Quote-receipt email:** Verified by reading the entire
`src/lib/email/` directory. **There is NO quote-receipt email
template today.** Quote distribution is SMS-only. The
`send-quote-sms` route sends SMS with a link; if email distribution
is ever added, it would be a NEW surface. Out of scope for this audit.

**Transaction receipt email:** Surface 7-10 above cover this. Combo
already handled.

### Target 4 — PDF generation

**File:** `src/app/api/quotes/[id]/pdf/route.ts`

This route DOES exist and renders quote line items via `pdfkit`. **It
is fully broken for combo display.** Two issues:

1. **SELECT omits the columns** (line 470):
   ```typescript
   items:quote_items(item_name, tier_name, quantity, unit_price, total_price)
   ```
   Missing `pricing_type` and `standard_price`.

2. **Local `QuoteItem` interface omits them too** (lines 12-18):
   ```typescript
   interface QuoteItem {
     item_name: string;
     tier_name: string | null;
     quantity: number;
     unit_price: number;
     total_price: number;
   }
   ```

3. **Render uses `doc.text(formatCurrency(item.unit_price), ...)` at
   line 290** with no conditional. No way to show strikethrough or
   savings.

**Required change:** widen SELECT to `quote_items(*)` or explicitly
add `pricing_type, standard_price`; extend the local type; add the
formatter helper invocation; render an extra `doc.text(...)` line
below the price showing "Reg $X | Saved $Y" when `hasDiscount`.

### Target 5 — Admin internal views

**Admin quote detail page** (`src/app/admin/quotes/[id]/page.tsx:381-400`):
```typescript
{(quote.items || []).map((item) => (
  <tr key={item.id} className="border-b border-gray-100">
    <td className="py-3">
      <div className="font-medium text-gray-900">{item.item_name}</div>
      {item.tier_name && (<div className="text-xs text-gray-500">{item.tier_name}</div>)}
      {item.notes && (<div className="text-xs text-gray-400">{item.notes}</div>)}
    </td>
    <td className="py-3 text-center text-gray-600">{item.quantity}</td>
    <td className="py-3 text-right text-gray-600">
      {formatCurrency(item.unit_price)}
    </td>
    <td className="py-3 text-right font-medium text-gray-900">
      {formatCurrency(item.total_price)}
    </td>
  </tr>
))}
```

No discount visualization at all. `pricing_type` and `standard_price`
flow through `QuoteItem` type but are unused at the render layer.

**Admin quote slide-over** (`src/app/admin/quotes/components/quote-slide-over.tsx:138-151`):

Even simpler — only `{formatCurrency(item.total_price)}` per row. No
unit_price column, no discount indicator. Suitable for a high-density
sidebar but doesn't surface combo savings.

**Operator value of the fix:** medium. Internal surfaces; the admin
operator could click through to the public quote page to see the
customer view. But for at-a-glance scanning of a queue of quotes,
having "Combo" / "Sale" badges on the lines would be useful. **Lower
priority than customer-facing fixes** but recommended for the same
implementation session to prevent future drift.

### Target 6 — Shared rendering components

**Critical finding: NO shared line-item rendering component exists.**

Every render surface inlines its own conditional. The 4 receipt-side
surfaces happen to be identical because the predicate has been
copy-pasted (literally — character-for-character) across them. The
6 quote-side surfaces are inconsistent because no copy-paste happened
there.

**Why a shared `<LineItemRow>` component is the WRONG abstraction:**

- Each surface has different visual constraints. Thermal text needs
  fixed-width single-line strings. Thermal HTML uses `<td colspan="3">`
  inside a print-optimized layout. Public web pages need responsive
  table cells with hover affordances. The admin slide-over wants
  high-density flex rows. The PDF needs explicit `doc.text(text, x, y)`
  positioning. There is no markup that is universal across these
  outputs.

**Why a shared FORMATTER HELPER is the RIGHT abstraction:**

- The PREDICATE is universal (`pricing_type !== 'standard' &&
  standard_price > unit_price`).
- The COMPUTATION is universal (`savings = standard_price - unit_price`,
  `label = pricing_type === 'combo' ? 'Combo' : 'Sale'`).
- The TEXT TEMPLATE is universal (`{Label}: Reg {standard} | Saved {savings}!`).
- The RENDERING (JSX vs HTML string vs PDF doc.text vs plain-text) is
  per-surface.

**Recommended helper signature:**

Location: `src/lib/quotes/line-item-pricing.ts` (new file — quote-and-
sale-shared since the predicate applies to both). Alternatively
co-locate in `src/lib/utils/format.ts` if the team prefers — both files
are already in the canonical-money story per CLAUDE.md Rule 20.

```typescript
export interface LineItemPricingInfo {
  hasDiscount: boolean;
  /** 'Combo' | 'Sale' — capitalized, ready for display. */
  label: 'Combo' | 'Sale' | null;
  /** Original price (dollars) — null when no discount applies. */
  standardPrice: number | null;
  /** Savings per unit (dollars) — null when no discount applies. */
  savings: number | null;
  /** Savings × quantity (dollars). Convenience for totals math. */
  totalSavings: number | null;
}

/**
 * Single source of truth for line-item discount detection across
 * quote and receipt render surfaces. Each surface consumes
 * `hasDiscount` + the derived fields and renders in its native
 * shape (JSX, HTML, PDF doc.text, plain text).
 *
 * Predicate mirrors the verbatim copy used at:
 *  - src/app/(public)/receipt/[token]/page.tsx:230
 *  - src/app/pos/lib/receipt-template.ts:617, 1079
 *  - src/app/api/pos/receipts/email/route.ts:48
 *
 * The defective quote-page predicate at
 * src/app/(public)/quote/[token]/page.tsx:241 (which checks only
 * 'sale') is what motivated this helper.
 */
export function getLineItemPricingInfo(item: {
  unit_price: number;
  quantity: number;
  standard_price: number | null;
  pricing_type: string | null;
}): LineItemPricingInfo {
  if (
    item.pricing_type &&
    item.pricing_type !== 'standard' &&
    item.standard_price != null &&
    item.standard_price > item.unit_price
  ) {
    const savings = item.standard_price - item.unit_price;
    return {
      hasDiscount: true,
      label: item.pricing_type === 'combo' ? 'Combo' : 'Sale',
      standardPrice: item.standard_price,
      savings,
      totalSavings: savings * item.quantity,
    };
  }
  return {
    hasDiscount: false,
    label: null,
    standardPrice: null,
    savings: null,
    totalSavings: null,
  };
}

/**
 * Sum the per-line savings across an item array, returning total
 * dollars saved. Used for the "You saved $X" totals row.
 */
export function sumLineItemSavings(items: ReadonlyArray<{
  unit_price: number;
  quantity: number;
  standard_price: number | null;
  pricing_type: string | null;
}>): number {
  let total = 0;
  for (const item of items) {
    const info = getLineItemPricingInfo(item);
    if (info.totalSavings) total += info.totalSavings;
  }
  return total;
}
```

The POS-side `TicketItem` shape uses camelCase (`pricingType`,
`standardPrice`, `unitPrice`). A second variant
`getTicketItemPricingInfo` OR a thin adapter
`{ pricing_type: item.pricingType, standard_price: item.standardPrice, ... }`
keeps the helper input shape stable.

### Target 7 — Existing tests

**Quote page rendering:** NO test files exist for
`src/app/(public)/quote/[token]/page.tsx`. The page is server-rendered
and tested only through end-to-end live verification. Result: the
combo-vs-sale predicate defect was never caught by CI.

**Receipt page rendering:** NO test file for
`src/app/(public)/receipt/[token]/page.tsx` either. Discount display
is covered indirectly by `src/lib/data/__tests__/receipt-composer.test.ts`
which tests the data shape, not the JSX.

**Thermal receipt template:** NO test for `receipt-template.ts`
specifically. Receipt rendering coverage exists in
`src/lib/data/__tests__/receipt-composer.test.ts` + the baseline
fixtures at `src/lib/data/__tests__/__fixtures__/receipt-baselines/`.

**PDF route:** NO test for `src/app/api/quotes/[id]/pdf/route.ts`.

**Coverage gap summary:** every render surface in this audit is
untested for discount visualization. The fix session MUST add tests
or future regressions are silent.

### Target 8 — Subtotal / "You saved $X" placement

Per operator: "a 'You saved $X' line above the total on quote-rendering
surfaces."

**Per-surface placement recommendation:**

| Surface | Current totals layout | Recommended savings line position |
|---|---|---|
| Public quote page | Subtotal → Tax → (modifier rows) → Total | NEW: After modifier rows, BEFORE Total. Green text, "You Saved $X". Existing "Sale Savings" row at line 304-319 GENERALIZES to this. |
| Quote PDF | Subtotal → Tax → Total | NEW: Above Total. `doc.text("You Saved $X", ...)` with green or accent color. |
| Admin quote detail | Subtotal → Tax → Total | NEW: Above Total. Same styling as discount rows in `<QuoteTotals>` component (if reused) or inline `text-green-600`. |
| Admin quote slide-over | Subtotal → Tax → Total | NEW: Above Total. Same as above. |
| POS quote detail | Subtotal → Tax → (modifier rows) → Total | NEW: Above Total, alongside the existing `resolveQuoteModifierRows` output. |
| POS quote-item-row + quote-totals | (per-line totals) → quote-totals | The POS sale-side ticket-totals already shows savings (`ticket-item-row.tsx:409`). Mirror that. |
| Public receipt page | Subtotal → Tax → Discount → Loyalty → Tip → Total | NO new line needed — the existing per-line "Combo: Reg $X | Saved $Y" already surfaces savings; totals reflect via `subtotal` already net of combo. Optional: add a roll-up "Total saved on this visit: $X" as a feel-good footer (lower priority). |

**Savings amount source:** call `sumLineItemSavings(quote.items)` from
the helper. Result is in dollars (the helper input shape is the DB row
shape — `unit_price` / `standard_price` are dollar numbers per
`QuoteItem` / `TransactionItem` types).

### Target 9 — Money math compliance

CLAUDE.md Rule 20 mandates integer-cents math for NEW money-handling
code via `src/lib/utils/refund-math.ts` (`toCents` / `fromCents`) and
display via `formatMoney(cents)`. Existing surfaces (1-6) currently
use `formatCurrency(dollars)` — the legacy path that survives the
Money-Unify epic until Unify-Final.

**Risk in the savings computation:**

```typescript
const savings = item.standard_price - item.unit_price;  // dollars subtraction
```

`item.standard_price` and `item.unit_price` are `number` columns
representing dollars (per `quote_items` schema in `DB_SCHEMA.md`).
JavaScript float subtraction risks like `125.00 - 100.00 = 25.000000004`
are NOT a concern at the cent boundary because both values are stored
with 2-decimal precision; the result is exact for any pair of values
the DB can hold. But it IS a concern for floating-point representation
in JSX outputs.

**Recommended approach for the helper:**

Option A — **Dollars math** (matches existing receipt surfaces):
```typescript
const savings = item.standard_price - item.unit_price;
```
Justification: byte-identical to the verbatim predicate in the 4
existing receipt surfaces; no Money-Unify migration churn; quote_items
columns are dollars.

Option B — **Cents math** (Money-Unify forward-compat):
```typescript
import { toCents, fromCents } from '@/lib/utils/refund-math';
const savingsCents = toCents(item.standard_price) - toCents(item.unit_price);
const savings = fromCents(savingsCents);
```
Justification: aligns with CLAUDE.md Rule 20 going forward.

**Recommendation: Option A in this session.** The receipt-side
surfaces already use dollars subtraction; switching to cents in the
helper would introduce a Money-Unify gradient (new code in cents,
existing code in dollars) that is wider than this audit's scope. The
Money-Unify epic has its own per-family migration plan
(`docs/dev/MONEY.md`); when quotes get their family migration, the
helper migrates with it.

If operator prefers Option B, the helper can use cents internally and
expose dollars at the boundary — `getLineItemPricingInfo` returns
`savings: fromCents(savingsCents)` so callers don't need to know.

## Recommended implementation approach

**Single session, two-phase implementation:**

### Phase 1 — Helper extraction (no behavior change)

1. Create `src/lib/quotes/line-item-pricing.ts` with
   `getLineItemPricingInfo` + `sumLineItemSavings`.
2. Create `src/lib/quotes/__tests__/line-item-pricing.test.ts`
   with ~10-15 tests covering: standard pricing (no discount), sale
   item (discount), combo item (discount), edge case
   `standard_price = unit_price` (no discount), edge case
   `standard_price < unit_price` (defensive — no discount), null
   `standard_price`, null `pricing_type`, multi-quantity savings.
3. **Migrate the 4 receipt surfaces** (no behavior change — predicate
   already matches the helper):
   - `src/app/(public)/receipt/[token]/page.tsx:230-234`
   - `src/app/pos/lib/receipt-template.ts:617-622`
   - `src/app/pos/lib/receipt-template.ts:1079-1083`
   - `src/app/api/pos/receipts/email/route.ts:48-52`
4. Each migration: extract the inline predicate to
   `getLineItemPricingInfo(item)`, render from the result. ~5 LOC
   reduction per surface.

### Phase 2 — Quote-side adoption (behavior change)

5. **Fix the customer-facing quote page** — `src/app/(public)/quote/[token]/page.tsx`:
   - Replace the `isSaleItem` predicate at lines 240-243 with the
     helper. Combo lines now show strikethrough + "Save $X".
   - Replace the totals reduce at lines 304-319 with
     `sumLineItemSavings(quote.items)`. Generalize the row label from
     "Sale Savings" to "You Saved" (or per operator wording).
6. **Quote PDF** — `src/app/api/quotes/[id]/pdf/route.ts`:
   - Widen SELECT at line 470 to include `pricing_type, standard_price`.
   - Extend local `QuoteItem` interface (lines 12-18) with both fields.
   - Adopt the helper at the line-item render (line 290-301) and add
     a sub-line "Reg $X | Saved $Y" when `hasDiscount`.
   - Add a "You Saved $X" line above Total when `sumLineItemSavings > 0`.
7. **Admin quote detail** — `src/app/admin/quotes/[id]/page.tsx:381-400`:
   - Add the discount sub-line below `item_name` (mirror surface #1's
     shape).
   - Add "You Saved $X" above Total.
8. **Admin quote slide-over** — `src/app/admin/quotes/components/quote-slide-over.tsx:138-151`:
   - Add a small green "Combo / Sale: -$X" indicator next to each line.
9. **POS quote detail** — `src/app/pos/components/quotes/quote-detail.tsx:514-545`:
   - Add the discount sub-line.
10. **POS quote-item-row** — `src/app/pos/components/quotes/quote-item-row.tsx:230`:
    - Mirror the POS sale-side `ticket-item-row.tsx` pattern (lines
      278-291) for combo + sale display.

### Phase 3 — Tests for changed surfaces

11. Add render tests for the public quote page (Q-0085 reproduction —
    Pet Hair line shows strikethrough + "Save $25"; totals row shows
    "You Saved $25").
12. Add render test for the PDF route (snapshot or text-content
    assertion).
13. Extend `compute-expected-price.test.ts` or create
    `quote-render.test.ts` for the admin/POS surfaces.

**Estimated total scope:**

| Workitem | LOC | Tests | Risk |
|---|---|---|---|
| Helper file + tests | ~50 + ~80 | 10-15 | LOW |
| 4 receipt surface migrations (no behavior change) | ~20 | 0 (existing fixtures preserve) | LOW |
| Quote page fix + savings row | ~25 | ~6 | LOW-MEDIUM (customer-facing) |
| Quote PDF widening + render | ~30 | ~3-5 | LOW |
| Admin quote detail | ~10 | ~2 | LOW |
| Admin quote slide-over | ~5 | ~1 | LOW |
| POS quote detail | ~10 | ~2 | LOW |
| POS quote-item-row | ~15 | ~3 | LOW |
| Docs (CHANGELOG, ROADMAP, FILE_TREE) | ~30 | 0 | — |
| **Total** | **~195 LOC** | **~27-30** | LOW |

**Single session, ~1.5-2 hours CC.** Branch:
`feat/combo-sale-discount-render`.

### Order-of-adoption guidance

1. Helper + tests first — establishes the contract.
2. Receipt-side migrations next — proves the helper handles the
   existing correct predicate exactly (no behavior change). If any
   receipt snapshot breaks, the helper is wrong.
3. Public quote page next — the customer-facing fidelity fix.
4. Quote PDF — independent of UI, can be done in parallel.
5. Admin + POS quote surfaces last — internal consistency.

## Open questions for operator

1. **"You Saved $X" wording.** Options to consider:
   - "You Saved $X"
   - "Total Savings: $X"
   - "Bundle & Sale Discounts: -$X"
   - "You're saving $X today"

   Recommendation: "You Saved $X" — short, customer-friendly,
   matches the per-line "Saved $Y" text already used in receipts.
   The current "Sale Savings" label on the quote page (line 313)
   becomes inaccurate once combos are included; rename either way.

2. **Internal admin surfaces — full visualization or compact badge?**

   The public quote page shows strikethrough + green new price + "Save
   $Y" per line. Admin slide-over has limited horizontal space —
   recommend a compact green "−$Y" indicator + tooltip with full
   detail. Confirm preferred treatment.

3. **Receipt-side roll-up "Total saved today: $X"?**

   The public receipt page (surface #7) already shows per-line savings
   but has no roll-up. Operator may want a feel-good footer
   ("You saved $X today!") for retention. Lower priority than the
   primary quote fix. Defer or include in same session?

4. **Money-Unify timing.** The new helper can use either dollars
   (Option A above) or cents (Option B). Recommend Option A for this
   session (matches existing surfaces) and migration alongside the
   quotes family of the Money-Unify epic when it lands. Confirm.

5. **PDF visual treatment.** Strikethrough in PDFKit requires manual
   drawing. Options:
   - Two-line rendering: `Reg: $125` (strikethrough via doc.text +
     line-drawing) above `$100` accent color.
   - Single-line: `$125 → $100 (Save $25)` with no strikethrough.

   The thermal HTML uses single-line text. Recommend single-line for
   PDF too, for parity with the thermal HTML. Confirm.

## Risk matrix

| Change | Files | Blast radius | Risk |
|---|---|---|---|
| New `line-item-pricing.ts` helper + tests | 2 new files | New surface, no existing callers | LOW — additive |
| Migrate 4 receipt surfaces to helper | 4 files (~5 LOC each) | All receipt rendering (high-traffic) | LOW — predicate is byte-identical; tests would catch any drift |
| Fix public quote page combo display | 1 file (~15 LOC delta) | Every customer-facing quote URL view | LOW-MEDIUM — high visibility but the change is a strict superset of current behavior (combo NOW shows discount; sale display unchanged) |
| Fix quote PDF SELECT + render | 1 file (~20 LOC delta) | PDF endpoint (used when?) | LOW — PDF route is rarely-hit; widening SELECT can't break existing callers |
| Admin + POS quote surfaces | 4 files (~10-15 LOC each) | Internal operator views | LOW — internal only; visual addition only |
| Savings-totals row across surfaces | Same files as above (~5 LOC each) | Customer-facing total row visual | LOW — additive row, never decreases displayed savings; defensive `if (totalSavings > 0)` gate already exists at quote-page:311 |
| Test additions for changed surfaces | New + extended test files | Test suite | LOW — additive |

**No schema migrations. No new database columns. No tool changes.
No prompt changes. No combo-resolver changes.** This is a pure
rendering / presentation layer fix.

## What this audit deliberately does NOT cover

- **Refund display.** Refund rendering on receipts is a separate
  pattern (red strikethrough on line items + refund summary block)
  and is already correctly implemented at
  `src/app/(public)/receipt/[token]/page.tsx:218-242, 330-380`. The
  discount predicate and refund predicate intentionally compose
  (a partially-refunded combo line shows BOTH the combo savings AND
  the refund strikethrough). The new helper does NOT touch refund
  rendering.

- **Coupon / loyalty / manual modifier rows.** These render through
  `resolveQuoteModifierRows` from `src/lib/quotes/modifier-display.ts`
  — a separate concern with its own established pattern. The new
  helper sits ABOVE the modifier rows in the totals layout, not
  inside.

- **Appointment-payment receipt aggregation.** `tx.appointment_total`,
  `tx.appointment_balance_due`, and the payment-method receipt rows
  are out of scope. Discount lives at the item layer; aggregation
  lives at the transaction layer. The helper operates only on items.

- **PDF generation library swap.** The quote PDF uses `pdfkit`. If
  the team ever migrates to `@react-pdf/renderer` or similar, the
  helper's contract is unchanged — `getLineItemPricingInfo` returns
  data, the new library would render it differently. No coupling.

- **Mobile fee line items.** The synthetic mobile-fee row appended by
  `composeLineItems` has `pricing_type` null and `standard_price`
  null, so the helper's `hasDiscount` is false for it. Mobile-fee
  lines correctly render as plain prices — no change needed.

- **Per-unit pricing display.** Per-unit lines have their own price-
  display pattern (`$X.XX/unit × qty`). The combo/sale predicate
  composes — a per-unit line on combo would show both the unit
  pricing AND the savings indicator. The helper handles this
  uniformly via `quantity` in the `totalSavings` computation; no
  additional per-unit case needed.

---

## Sources cited

| Citation | Purpose |
|---|---|
| `src/app/(public)/quote/[token]/page.tsx:240-280, 304-319` | Public quote page — defective `pricing_type === 'sale'` predicate (THE primary defect) |
| `src/app/(public)/receipt/[token]/page.tsx:230-234` | Public receipt — correct combo + sale predicate (reference) |
| `src/app/pos/lib/receipt-template.ts:617-622, 1079-1083` | Thermal text + thermal HTML predicates (correct) |
| `src/app/api/pos/receipts/email/route.ts:48-52` | Email plain-text fallback predicate (correct) |
| `src/app/api/quotes/[id]/pdf/route.ts:12-18, 290, 470` | Quote PDF — missing fields in type AND SELECT |
| `src/app/admin/quotes/[id]/page.tsx:381-400` | Admin quote detail — no discount UI |
| `src/app/admin/quotes/components/quote-slide-over.tsx:138-151` | Admin slide-over — only total_price |
| `src/app/pos/components/quotes/quote-detail.tsx:514-545` | POS quote detail — only total_price |
| `src/app/pos/components/quotes/quote-item-row.tsx:230` | POS quote builder item row — `${totalPrice.toFixed(2)}` only |
| `src/app/pos/components/ticket-item-row.tsx:128-291, 365-409, 464` | POS sale-side reference (already handles combo + sale correctly) |
| `src/lib/data/receipt-data.ts:50` | `transaction_items(*)` SELECT — confirms pricing fields flow through |
| `src/lib/utils/compose-line-items.ts` | `composeLineItems` — does NOT consume pricing_type / standard_price (pure pass-through) |
| `src/lib/quotes/modifier-display.ts` | `resolveQuoteModifierRows` — separate concern, untouched |
| `src/lib/utils/format.ts:25-29, 38-58` | `formatCurrency(dollars)` vs `formatMoney(cents)` — legacy vs Money-Unify |
| `src/lib/services/combo-resolver.ts` (Issue 33 Layer 1) | Data layer — sets `pricing_type='combo'` + `standard_price` correctly |
| `docs/dev/MONEY.md` | Money-Unify epic — per-family migration policy |
| `CLAUDE.md` Rule 20 (Money), Rule 22 (canonical engine) | Operator-locked invariants for money math + service pricing |
