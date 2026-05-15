# Money-Unify-3 Comprehensive Bug Audit

> Diagnosis only. No fixes applied. Produced 2026-05-14.

## TL;DR

**5 distinct bug classes found across 28 confirmed sites in 11 files.** Two
classes (B' write-side, B' price-range read) are new and were not in the
user's original Class A/B/C taxonomy. One is a **data-corruption bug**
that silently writes 100× wrong values to `job_addons.price` in
production every time staff flag an issue from a catalog service or
product.

| Class | Description | Sites | Severity |
| --- | --- | --- | --- |
| A | `formatCurrency(cents)` — legacy formatter fed cents | 5 | User-visible 100× |
| B | `cents × 100` double-scale in compute | 3 | Stripe overcharge + free-shipping break |
| B' | Missing `× 100` at dollars-out boundary | 1 | Shipping fee 100× undercharge |
| C | `cents.toFixed(2)` template-string render | 27+ | User-visible 100× across POS catalog |
| C' | Mixed-unit `price` field stored to NUMERIC column | 1 write site + 7 downstream | **DATA CORRUPTION** |

POS catalog browsing currently shows **every non-on-sale service and
every product at 100× the actual price** for staff. The only reason
this hasn't been more visibly catastrophic is that the sale-aware
branches were retrofitted with `formatMoney()` in Phase 3.1a but the
non-sale fallback branches were not.

## Methodology

1. Read `docs/dev/MONEY.md` to lock in which families are cents (D, H) vs
   still-dollars (A, B, C, E, F, G).
2. Verified helper semantics: `formatMoney` throws on non-integer (so dollars
   fed to it crash, not silently scale); `formatCurrency` does not throw (so
   cents fed to it silently 100×).
3. Spawned 4 parallel `Explore` agents to enumerate:
   - All 279 `formatCurrency(...)` callsites with arg-expression trace
   - All 302 `* 100` / `/ 100` sites outside `money.ts`
   - All Family D + H `_cents` column read sites with downstream flow
   - All Stripe / Square / Shippo / QBO money boundary sites
4. Verified every agent claim against source. (Agents over-report; spot
   checks caught at least one false-positive in the formatCurrency
   sweep, since corrected.)
5. Followed up with targeted manual traces for two areas the agents
   could not see end-to-end:
   - `getServicePriceRange()` / `resolveServicePrice()` return-unit usage
     across all 5 POS catalog rendering components
   - `flag-issue-flow.tsx` → `/api/pos/jobs/[id]/addons` POST → DB write
     path (caught the unit-mismatched write).
6. Cross-checked each suspect site's argument unit by reading the
   declaring file, the DB schema (`docs/dev/DB_SCHEMA.md` + migrations),
   and the upstream API route.

## Family-state ground truth

| Family | Tables | Unit (post-Unify-3) |
| --- | --- | --- |
| D — Catalog | `services`, `service_pricing`, `products`, `packages` | **CENTS** (`_cents` cols) |
| H — Inventory | `purchase_order_items`, `stock_adjustments`, `vendors` | **CENTS** (`_cents` cols) |
| E — Orders | `orders`, `order_items`, `shipping_settings` | Dollars (NUMERIC) |
| A — POS Txns | `transactions`, `transaction_items`, `payments`, `refunds`, `cash_drawers` | Dollars (NUMERIC) |
| C — Appointments | `appointments`, `appointment_services`, `mobile_zones`, `job_addons` | Dollars (NUMERIC) |
| F — Marketing | `coupons`, `coupon_rewards`, `campaigns` | Dollars (NUMERIC) |
| B — Quotes | `quotes`, `quote_items` | Dollars (NUMERIC) |
| G — Customer | `customers` | Dollars (NUMERIC) |

Note: `orders.total` and `order_items.*` are documented in the Money-Unify
playbook as still-dollars at this point in the epic, but some callsites
(e.g. `src/app/admin/orders/[id]/page.tsx:165`, `global-search/route.ts:335`)
treat `orders.total` as **cents** today. This deserves a follow-up
verification — see Section "Audit gaps", below.

## CONFIRMED BUGS — by severity

### S0 — Data corruption (silent write of cents into a dollars column)

#### Bug 1 (Class C'): `job_addons.price` written with cents from POS

- **Write path**: `src/app/pos/jobs/components/flag-issue-flow.tsx:191-216` builds
  `selectedItem.price = perUnitQty * service.per_unit_price_cents`
  **(cents)** for the per-unit path, `resolveServicePrice(pricing, vsc)`
  **(cents)** for the tier path, `product.retail_price_cents` **(cents)**
  for the product path, but `parseFloat(customPrice)` **(dollars)** for
  the custom-description path.
- Sent to `/api/pos/jobs/[id]/addons` POST.
- **`src/app/api/pos/jobs/[id]/addons/route.ts:124,141`** destructures
  `price` from body and `.insert({ price, ... })` directly into
  `job_addons.price` — a Family C `NUMERIC(10,2)` dollars column.
- **Effect**: every addon flagged from a service or product card stores
  100× the actual price in the DB. Custom-description addons store
  correctly. The corrupted row then propagates:
  - **`src/app/api/admin/jobs/[id]/route.ts:78`** reads `addon.price`,
    calls `toCents(addon.price)` → `price_cents` is now 10,000× wrong.
    `admin/jobs/[id]/page.tsx` renders `formatMoney(750000)` → "$7,500.00".
  - **`src/app/api/pos/jobs/[id]/checkout-items/route.ts:178`** reads
    `addon.price` and `addon.discount_amount` as dollars to compute
    `finalPrice` — the corrupted value flows straight into transaction
    line items at checkout. Customers get **billed 100×** if the addon
    was flagged from a catalog service/product.
  - **`src/app/authorize/[token]/page.tsx:263`** renders
    `${Number(addon.price_cents).toFixed(2)}` (a *second* compounding
    bug — see Class C below; addon.price_cents is already cents).
  - **`src/app/api/jobs/[token]/photos/route.ts:66+`** also reads
    `addon.price` as Family C dollars.
- **Severity**: **S0 — silent production data corruption + actual customer
  overbill at checkout**. Every staff-flagged addon since the Family D
  migration shipped has stored a wrong value. The DB is dirty. Forward
  fix alone is not enough; back-fill / reconciliation is needed.

  *Verification status*: code-path confirmed; have not queried the live
  DB to count corrupted rows. Strongly recommend doing so before any
  fix.

#### Bug 2 (Class B'): Shipping handling-fee `feeAmount` returned without `× 100`

- **`src/lib/services/shippo.ts:124`** — `if (feeType === 'flat') return Math.round(feeAmount);`
- `feeAmount` is `shipping_settings.handling_fee_amount` (NUMERIC dollars).
- Function declares it returns *cents* (caller adds it into `rate.amount`
  which is cents).
- **Effect**: a configured $5 flat handling fee is added as 5 cents.
  Customer is undercharged the handling fee on every shipped order.
- **Severity**: **S1 — revenue leakage**. Net effect only if
  `offer_handling_fee` is enabled with a flat (not percent) fee. Verify
  current `shipping_settings.handling_fee_type` before sizing impact.

### S0 — Payment overcharge

#### Bug 3 (Class B): `/api/checkout/create-payment-intent/route.ts:143`

- `const unitPriceCents = Math.round(product.retail_price_cents * 100);`
- `product.retail_price_cents` is already cents.
- **Effect**: Stripe PaymentIntent created for 100× the cart total. A
  $50 cart charges $5,000. Already known from the user's brief — listed
  here for completeness.

#### Bug 4 (Class B): `/api/checkout/shipping-rates/route.ts:95`

- `subtotalCents += Math.round(Number(product.retail_price_cents) * 100) * item.quantity;`
- Same pattern as Bug 3.
- **Effect**: free-shipping eligibility check inflates cart subtotal 100×,
  so customers qualify for free shipping at 1/100th the actual threshold.
  Revenue leakage on shipping. Was *not* in the user's brief; new find.

### S1 — User-visible 100× display in POS staff UI (Class C/A)

These are wrong-magnitude renders. Staff see "$7,500.00" for a $75
service. No DB writes here unless the staffer is using the display to
make pricing decisions and propagates to a customer.

| File | Line(s) | Source | Render expression |
| --- | --- | --- | --- |
| `src/app/pos/components/catalog-card.tsx` | 30 | `product.retail_price_cents` | `${product.retail_price_cents.toFixed(2)}` |
| `src/app/pos/components/catalog-card.tsx` | 89 (×2) | `service.per_unit_price_cents`, `service.sale_price_cents` | `${service.per_unit_price_cents.toFixed(2)}/${label}` etc. |
| `src/app/pos/components/catalog-card.tsx` | 93 | `service.per_unit_price_cents` | `${service.per_unit_price_cents.toFixed(2)}/{label}` |
| `src/app/pos/components/catalog-card.tsx` | 101 (×2) | `service.flat_price_cents`, `service.sale_price_cents` | `$${service.flat_price_cents.toFixed(2)}` |
| `src/app/pos/components/catalog-card.tsx` | 105 | `service.flat_price_cents` | `${service.flat_price_cents.toFixed(2)}` |
| `src/app/pos/components/catalog-card.tsx` | 113 | `service.custom_starting_price_cents` | `From ${service.custom_starting_price_cents.toFixed(2)}` |
| `src/app/pos/components/catalog-card.tsx` | 144 | `resolveServicePrice()` → cents | `${resolved.toFixed(2)}` |
| `src/app/pos/components/catalog-card.tsx` | 150 (×2) | `getServicePriceRange()` → [cents, cents] | `$${min.toFixed(2)}–$${max.toFixed(2)}` **← user's reported "$7500.00" range bug** |
| `src/app/pos/components/catalog-card.tsx` | 164 | `tier.price_cents` | `${tier.price_cents.toFixed(2)}` |
| `src/app/pos/components/product-detail.tsx` | 56 | `product.retail_price_cents` | `${product.retail_price_cents.toFixed(2)}` |
| `src/app/pos/components/product-detail.tsx` | 107 | `product.retail_price_cents * qty` | `${(product.retail_price_cents * qty).toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 314 | `service.per_unit_price_cents` | `${service.per_unit_price_cents!.toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 317 | `service.sale_price_cents` | `${service.sale_price_cents!.toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 327 | `service.per_unit_price_cents` | `${service.per_unit_price_cents!.toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 386 | `perUnitEffectivePrice` (cents) | `${perUnitEffectivePrice.toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 391 | `perUnitQty * service.per_unit_price_cents` | `${(perUnitQty * service.per_unit_price_cents!).toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 398 | `resolvedPrice` (cents) | `${resolvedPrice!.toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 481 | `effectivePrice` (cents) | `${effectivePrice.toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 504 | `getDisplayPrice(selectedTier!)` (cents) | `${getDisplayPrice(selectedTier!).toFixed(2)}` |
| `src/app/pos/components/service-detail-dialog.tsx` | 553 | same | same |
| `src/app/pos/components/service-detail-dialog.tsx` | 556 | `perUnitQty * getDisplayPrice(...)` (cents) | `${(perUnitQty * getDisplayPrice(selectedTier!)).toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 174 | `sizePrice` (from `resolveServicePrice`, cents) | `${sizePrice.toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 256 | `price` (from `resolveServicePrice`, cents) | `${price.toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 349 | `perUnitPrice = service.per_unit_price_cents` | `${perUnitPrice.toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 350 | `service.sale_price_cents` | `${service.sale_price_cents!.toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 353 | `perUnitPrice` | `${perUnitPrice.toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 501 | `standardPrice` (cents) | `${standardPrice.toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 502 | `tier.sale_price_cents` | `${tier.sale_price_cents!.toFixed(2)}` |
| `src/app/pos/components/service-pricing-picker.tsx` | 505 | `standardPrice` (cents) | `${standardPrice.toFixed(2)}` |

### S1 — User-visible 100× display in customer-facing UI (Class C/A)

| File | Line(s) | Source | Render expression |
| --- | --- | --- | --- |
| `src/app/authorize/[token]/page.tsx` | 263 | `addon.price_cents` (cents from `toCents(addon.price)`) | `${Number(addon.price_cents).toFixed(2)}` |
| `src/app/admin/jobs/[id]/page.tsx` | 520 | `servicesTotal = Σ s.price_cents` | `formatCurrency(servicesTotal)` |
| `src/app/admin/jobs/[id]/page.tsx` | 589 | `addonsTotal = Σ (a.price_cents − a.discount_amount_cents)` | `formatCurrency(addonsTotal)` |
| `src/app/admin/jobs/[id]/page.tsx` | 621 | same | `formatCurrency(servicesTotal)` |
| `src/app/admin/jobs/[id]/page.tsx` | 626 | same | `formatCurrency(addonsTotal)` |
| `src/app/admin/jobs/[id]/page.tsx` | 632 | `grandTotal = servicesTotal + addonsTotal` | `formatCurrency(grandTotal)` |

The `admin/jobs` totals interact with **Bug 1**: even if `job_addons.price`
were stored correctly, these would still display 100× because the
totals carry cents but are passed to the dollars formatter. With Bug 1
in play they display 10,000×.

### S1 — Wrong values shipped to customer notifications (SMS + email)

Triggered by the same data flow as Bug 1 (the `addon.price` write path).

| File | Line(s) | What goes out |
| --- | --- | --- |
| `src/app/api/pos/jobs/[id]/addons/route.ts` | 241 | SMS fallback body: `additional $${finalPrice.toFixed(2)}` |
| `src/app/api/pos/jobs/[id]/addons/route.ts` | 252 | SMS chip value: `final_price: finalPrice.toFixed(2)` |
| `src/app/api/pos/jobs/[id]/addons/route.ts` | 296 | Email text body: `additional $${finalPrice.toFixed(2)}` |
| `src/app/api/pos/jobs/[id]/addons/route.ts` | 400-404 | Email HTML body: `${price.toFixed(2)}`, `${discountAmount.toFixed(2)}`, `${finalPrice.toFixed(2)}` |

In these sites the **arguments are passed in from the request body and
flow directly to outbound customer messaging**. If the client sent
cents (service/product paths), the customer receives a 100× price quote
via SMS and email.

### S2 — Wrong values in AI / SEO context (Class A/C)

Low immediate-impact bugs. Wrong magnitudes leak into AI system prompts
and SEO metadata. Not user-visible directly, but affects model
behaviour and search engine indexing.

| File | Line(s) | Render |
| --- | --- | --- |
| `src/lib/services/page-content-extractor.ts` | 118 | `$${s.flat_price_cents}` |
| `src/lib/services/page-content-extractor.ts` | 192 | `$${s.flat_price_cents}`, `From $${s.custom_starting_price_cents}` |
| `src/lib/services/page-content-extractor.ts` | 334 | `$${Number(p.retail_price_cents).toFixed(2)}` |
| `src/lib/services/page-content-extractor.ts` | 370 | `$${Number(prod.retail_price_cents).toFixed(2)}` |
| `src/lib/services/messaging-ai.ts` | 275 | `$${Number(p.retail_price_cents).toFixed(2)}` (AI system prompt for product catalog) |

## VERIFIED CORRECT — sites that look suspicious but are not

For audit traceability; do not fix these.

- All Stripe SDK callers other than Bug 3 above. `pi.amount_received`,
  `pi.amount`, `stripe.paymentIntents.create({ amount })` etc. all see
  cents from cents-typed sources (`toCents(...)`, `*Cents` locals).
- All QBO sync callers (`src/lib/qbo/sync-transaction.ts:280-291`).
  QBO expects dollars; values come from Family A `transactions.*`
  NUMERIC columns which are still dollars. Correct.
- `src/app/pos/lib/receipt-template.ts` lines 256, 596, 605, 622, 639,
  650, 656, 665, 677, 685, 705, 743, 760: all operate on `tx.*` and
  `item.*` from Family A NUMERIC dollars. Correct *for now*. Will
  become bugs at Unify-5 and must be re-audited then.
- `src/app/pos/components/refund/*.tsx` all use `fromCents(x).toFixed(2)`
  or `(x / 100).toFixed(2)` — explicit conversion. Correct.
- `src/app/pos/lib/receipt-template.ts:782, 815, 1164, 1182` use
  `(totalPaidCents / 100).toFixed(2)`. Correct conversion.
- All margin/discount-percent ratios (`(retail − cost) / retail * 100`)
  — same-unit numerator/denominator cancel, result is a percentage.
- All time-unit `× 1000` / `× 60` math. Not money.
- All UI-coordinate `× 100` math (zoom, opacity, layout percentages).
- `src/lib/seo/json-ld.ts` — uses `formatMoney()` and `fromCents()`
  at the boundary.
- `src/lib/qbo/sync-catalog.ts:557-576` — uses `fromCents()` at boundary.
- `src/lib/services/ai-content-writer.ts` — uses `formatMoney()`.
- `src/lib/services/messaging-ai.ts:70-123` — uses `formatMoney()` for
  services. Bug only on the product path (line 275).
- Voice-agent endpoints (`src/app/api/voice-agent/products/*`,
  `services/route.ts`, `quotes/route.ts`): keep `_cents` field names on
  the wire to the ElevenLabs agent; convert via `fromCents()` only
  where the legacy `price` field is expected. The naming on the wire
  is in-contract.

## AUDIT GAPS — things I did not fully verify

State this so you can decide whether to extend the audit before fixing.

1. **`orders.total` unit ambiguity.** Several sites read `orders.total`
   as cents (`global-search/route.ts:335` does `Number(o.total) / 100`,
   `admin/orders/[id]/page.tsx:165` does `(chargeCents / 100).toFixed(2)`)
   while the Money-Unify playbook says Family E hasn't migrated yet.
   Either the playbook is stale, the migration shipped without a
   playbook update, or these sites have a latent bug. Worth a 15-min
   investigation: read `supabase/migrations/` for any `orders` column
   change and reconcile against the playbook.

2. **`/api/admin/orders/[id]/refund/route.ts:59`** — depends on (1).
   If `orders.total` is dollars, this site is buggy (refund.amount =
   dollars sent to Stripe expecting cents). If cents, correct.
   The inline comment claims cents; verify against the live schema.

3. **Custom-pricing form-state in `service-pricing-form.tsx`**. The
   form interfaces hold dollars and parent admin pages convert at
   load/save boundaries. I did not exhaustively walk every
   `toCents()`/`fromCents()` site in every admin services edit page.
   These were verified correct by Phase 3 acceptance and the lint, but
   they have not been retested since the production deploy. Worth a
   targeted spot-check of one save → DB cycle per pricing model.

4. **Booking wire schema** (`bookingSubmitSchema.price_cents`). Trusted
   the playbook's claim that the route collapses cents → dollars at
   entry. Did not walk the full conversion. Recommended re-verify
   before fix, since this is adjacent to Bug 1 in spirit (cents on the
   wire being stored to a dollars column at the other end).

5. **`stock_adjustments` cost writes from Stripe webhook** —
   `src/app/api/webhooks/stripe/route.ts` reads `cost_price_cents` and
   passes through to `unit_cost_cents` on stock_adjustments. Agent
   verified this as correct (unit preserved). I did not independently
   re-read it.

6. **Receipt template at Family A migration**. Every `tx.*.toFixed(2)`
   in `receipt-template.ts` will become a Class C bug the moment
   Unify-5 ships. Worth tagging now (per the playbook's "TODO
   Unify-5" pattern) so the next family phase doesn't miss them.

## RECOMMENDED FIX SCOPE (single comprehensive commit)

Per the user's instruction (one commit, not phased), the fix should
cover:

1. **Bug 1 — root cause.** Change `flag-issue-flow.tsx` to send dollars
   (convert cents → dollars before posting, OR redesign the wire
   schema to send `price_cents` + have the API convert at the
   boundary). The cleaner long-term shape is the latter — matches the
   Family D form-state pattern from Phase 3.
2. **Bug 1 — back-fill.** Query `job_addons` for rows where `price`
   exceeds a sanity threshold (e.g. ≥ $1,000 with a non-custom
   description, or correlate with `service_id`/`product_id` against
   the current catalog price) and audit / repair. Necessary before
   the fix lands or simultaneously, otherwise future reads of legacy
   rows still display 100×. (Optional: add a one-off migration that
   divides corrupted rows by 100 — but be very careful, this is
   irreversible and depends on no legitimate `service_id`-linked
   addons being stored as dollars at any point.)
3. **Bug 2** — `shippo.ts:124`: change to `Math.round(feeAmount * 100)`.
4. **Bug 3** — `create-payment-intent/route.ts:143`: drop the `* 100`.
   Cart amounts already in cents.
5. **Bug 4** — `shipping-rates/route.ts:95`: drop the `* 100`. Same
   reason.
6. **Class C/A POS catalog renders (27 sites in 4 files)** — replace
   every `cents.toFixed(2)` and `$${cents}` with `formatMoney(cents)`.
   `formatMoney`'s integer-only invariant will surface any remaining
   unit-mismatched callers at runtime, which is the desired safety
   net.
7. **Class A admin/jobs totals (5 sites)** — change `formatCurrency` →
   `formatMoney` for `servicesTotal` / `addonsTotal` / `grandTotal`.
   Rename to `servicesTotalCents` etc. to satisfy the lint rule.
8. **AI/SEO sites (5 sites)** — same fix: `formatMoney()`.
9. **Customer-notification renders in addons POST handler** (Bug 1
   side-effect: lines 241, 252, 296, 400-404 in addons/route.ts) —
   re-derive these from a clean dollars value once Bug 1 is fixed; the
   `.toFixed(2)` patterns themselves stay valid (those are still in
   dollars by contract).
10. **Lint upgrade**. After all of the above, the codebase should have
    zero `money/no-unsuffixed-money-prop` warnings (this fix sweep
    should be the last clearing before Unify-Final). Consider
    promoting the rule to `error` in the same commit so regressions
    can't sneak back in. (The MONEY.md doc already commits to this at
    Unify-Final; if the user prefers to keep that as the formal flip
    point, leave at `warn` for now.)

## Out-of-scope follow-ups

- Add a typed wrapper / branded type for cents so this class of bug is
  caught at the type level rather than at runtime. (Phase ≥ Unify-Final
  candidate, not part of this fix.)
- Add a per-family integration test that walks `catalog → POS render →
  ticket → checkout → DB write → admin read` end-to-end with an
  assertion on rendered values. Would have caught Bug 1 before
  production.
- Inspect the live DB for the count and date range of corrupted
  `job_addons` rows before deciding on back-fill strategy. (Not a code
  task.)
