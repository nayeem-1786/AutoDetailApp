# Phase 1A.5 — Digital payment types + Stripe webhook brand/last4 capture

Two independent additions shipping together. Both surfaced in production this week — Part A from the Zelle mismarked-as-Cash incident, Part B from the Phase 1A diff-review review of pay-link receipts rendering generic "Card".

## Part A — Digital payment types

### Database

Two sequential migrations:

1. **`20260510000001_add_digital_payment_enum_value.sql`** — `ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'digital'`. In its own file because Postgres requires `ADD VALUE` to commit before the value can be referenced in the same transaction.
2. **`20260510000002_add_digital_platform_column.sql`** — adds `payments.digital_platform TEXT NULL`, a biconditional CHECK constraint (`method='digital' ⇔ digital_platform IS NOT NULL`), and a partial index on `digital_platform` filtered to `method='digital'` for reporting query performance.

`docs/dev/DB_SCHEMA.md` regenerated against the live DB after `supabase db push`. New column documented under `payments`, enum entry under "Enums".

### POS flow

New "Digital" button on the checkout payment-method screen (Smartphone icon from lucide-react). Tap opens a platform picker with 4 options:
- **Zelle** → posts `digital_platform='zelle'`
- **Venmo** → posts `digital_platform='venmo'`
- **AppleCash** → posts `digital_platform='apple_cash'`
- **Other…** → reveals a text input for free-text platform names

Free-text validation (LOCKED-A5):
- Required (non-empty after trim)
- Max 30 characters
- Allowed chars: `a-zA-Z0-9`, spaces, hyphens
- Rejects free-text matching one of the 3 canonical platforms (case-insensitive) — operator must use the dedicated button so reporting groups consistently.

After confirm, the screen POSTs to `/api/pos/transactions` with `payment_method='digital'` and `payments[0]` carrying `method='digital'` + the canonical lowercase identifier. The route's existing permission gate adds a `paymentMethod === 'digital'` branch that checks `pos.process_cash` (digital is cash-equivalent — no card fee, no PCI scope). Method-vs-field validation enforces the same biconditional as the DB CHECK constraint, returning 422 with a useful message on mismatch.

### Composer label mapping

`mapDigitalPlatformToFriendly(platform)` exported from `receipt-composer.ts`:
- `'zelle'` → `"Zelle"`
- `'venmo'` → `"Venmo"`
- `'apple_cash'` → `"AppleCash"` (intentional camelCase wordmark; `toTitleCase` would drop the underscore and lose the brand identity)
- everything else → `toTitleCase(value)` (new helper in `src/lib/utils/format.ts`)
- null/undefined/blank → `"Digital"` (defensive fallback for corrupt rows)

`buildSuggestedPaymentLabel` short-circuits on `method='digital'` and returns the friendly platform name as the primary label. Digital is treated like Cash/Check in the combined-label assembly (`buildCombinedPaymentLabel`): the primary IS the user-visible identifier, so the `method_detail` segment is omitted to avoid redundant repetition like `"Zelle · Zelle · 5/6/26 11:34 AM"`.

Renderer output across all surfaces: `"Zelle · 5/6/26 11:34 AM"`. Compact thermal format from Phase 1A LOCKED-6. No surface ever renders the literal string "Digital Payment".

### Admin filter

`src/app/admin/transactions/page.tsx` gains a "Payment Method" filter dropdown with options All / Cash / Card / Check / Split / Digital. When Digital is selected, a second "Digital Platform" sub-filter appears (All Platforms / Zelle / Venmo / AppleCash).

The sub-filter resolution **deduplicates client-side** per Option A refinement: instead of a raw inner join (which would duplicate transaction rows for transactions with multiple payments), the page issues a separate `payments` query, dedupes `transaction_id` values via a JS `Set`, then constrains the main transactions query with `.in('id', txIds)`. Short-circuits to empty state if zero matches.

**Pattern characteristics** (for future developers):
- **Two queries** instead of one inner-joined query. Tradeoff: an extra round-trip vs. row-duplication complexity. With the existing pagination shape, the row-duplication path would've required client-side dedup on every page or a Postgres `DISTINCT ON` rewrite of the main query — not free either.
- **`.limit(1000)` cap** on the `payments` lookup. Protects against payload bloat for accounting historical reviews. For Smart Details' transaction volume this is comfortably above operational reality; if a single platform-month ever exceeds 1000 payments, paginate the sub-filter or switch to a server-side `DISTINCT` materialized view.
- **NOT a Postgres `DISTINCT` or `EXISTS` clause.** Supabase JS client doesn't expose `DISTINCT` cleanly, and an `EXISTS` subquery would require a Postgres RPC. The two-query Set pattern keeps the implementation idiomatic JS-side.
- Free-text platform names (e.g., `cash app`) aren't surfaced in the dropdown — the 3 canonical platforms cover the operational reporting need. Free-text rows are still selectable via the top-level "Digital" filter.

### Payments report

New page at `/admin/reports/payments`:
- Date range picker (default: from = 1st of current month PST, to = today PST)
- Groups payments by `(method, digital_platform)`, sorted by total desc
- Shows count, total ($), percentage-of-total per group
- Total row at bottom
- CSV export button (client-side blob, no API call) → `payments-report-YYYY-MM-DD-to-YYYY-MM-DD.csv` with columns `payment_method, digital_platform, count, total_amount, percentage_of_total, date_range_start, date_range_end`

Sidebar nav gains a "Reports" parent (`BarChart3` icon) with one child (Payments, `CreditCard` icon). Future reports land as siblings.

### One-off SQL fix template

`scripts/fix-zelle-misclassification.sql` — three-step template (VERIFY → UPDATE both `payments` and `transactions` → VERIFY again). Not executed; operator pastes the affected transaction id and runs manually after Phase 1A.5 deploys. CHECK constraint enforces the post-update invariant.

## Part B — Stripe webhook brand/last4 capture

### Problem

Phase 1A's byte-diff verification surfaced that online Stripe payments (booking deposit + pay-link) render generic `"Card"` on receipts instead of the brand+last4 the in-store Stripe Terminal already captures correctly. Two payment-insert sites lacked the extraction step.

### Helper

New `src/lib/utils/stripe-card-details.ts` exports `extractCardDetailsFromCharge(stripe, chargeId, context)` returning `{ card_brand: string | null, card_last_four: string | null }`. One Stripe API call per row (charges.retrieve). Title-cases the brand for storage consistency with the in-store Terminal path. **Never throws** per LOCKED-B4 — returns nulls on any failure (missing latest_charge, non-card payment method, Stripe API error). Composer's existing fallback renders generic "Card" when nulls land.

### Wired into

1. **`src/app/api/webhooks/stripe/route.ts:173-200`** — pay-link `payment_intent.succeeded` branch. `pi.latest_charge` is a string (charge id) in the webhook payload; helper retrieves the charge separately.
2. **`src/app/api/book/route.ts:459-490`** — booking deposit insert. Synchronous flow; helper called via a fresh `Stripe` SDK instance constructed inline (the route didn't previously import Stripe). Wrapped in try/catch so PI retrieve failures don't block booking confirmation.

### No backfill (LOCKED-B1)

Going-forward only. Historical pay-link / booking-deposit payment rows remain `card_brand=NULL, card_last_four=NULL`. Re-opening their receipts continues to show generic "Card". Acceptable per the lock; documented in CHANGELOG.

### Verified-correct paths (unchanged)

In-store Stripe Terminal (`split-payment.tsx`, `card-payment.tsx`) already extracts brand+last4 from the SDK's `processed` result. Verified in Phase 1A byte-diff as the working baseline; no edits here this session.

## Type-system updates

`'digital'` added to:
- `PaymentMethod` type — `src/lib/supabase/types.ts`
- `PaymentMethodLike` type — `src/lib/utils/payment-source-label.ts` (default-case branch returns `'Digital'` for the rare ungenerated path)
- Zod schemas — `src/lib/utils/validation.ts` (both `paymentSchema.method` and `transactionCreateSchema.payment_method`)
- `paymentSchema` gains optional `digital_platform: optionalString` field
- `PriorPayment.method` union — `src/app/pos/types.ts`
- `CheckoutStep` enum — `src/app/pos/context/checkout-context.tsx` (adds `'digital'` step)
- `ReceiptPayment.digital_platform?: string | null` — `src/app/pos/lib/receipt-template.ts`
- `ComposerPaymentInput.digital_platform?: string | null` — `src/lib/data/receipt-composer.ts`
- `RenderedPaymentLine.digital_platform: string | null` — `src/lib/data/receipt-composer.ts`

## Testing

`src/lib/data/__tests__/receipt-composer.test.ts` extended:
- `toTitleCase` — various inputs including empty/whitespace
- `mapDigitalPlatformToFriendly` — 3 canonical keys, free-text title-casing, defensive fallback, case-insensitivity on canonical lookup
- Digital combined-label assembly via `composeReceiptPaymentLines`, `buildSuggestedLabelForPayment`, and `buildCombinedPaymentLabel`
- Digital first-payment-with-remainder does NOT get wrapped in "Deposit (...)" — digital primary always wins
- Free-text validation rules (canonical-clash rejection, length, character set, empty)
- Stripe `extractCardDetailsFromCharge` — success, uppercase brand, null chargeId, non-card payment_method_details (ACH/Apple Pay shape), Stripe API error path, missing brand/last4 fields

Test count: **659 / 659 pass** (up from 635 after Phase 1A; +24 new tests).

15th fixture scenario added:
- **Scenario 15: digital-zelle** — $75 Zelle payment, paid in full. Renders `"Zelle · 5/6/26 9:15 AM    $75.00"` followed by `"Paid in Full [v]"`. All 30 fixtures (15 × 2 surfaces) regenerated via `scripts/capture-receipt-baselines.ts`.

## Deferred items (intentionally out of scope)

- **`pos.process_digital` dedicated permission** — Digital currently gates under `pos.process_cash`. A future session may introduce a dedicated permission if stricter gating is desired.
- **Split payment supports digital tender** — currently the split flow hardcodes cash/card branches in `src/app/pos/components/checkout/split-payment.tsx`. Digital isn't selectable inside a split today.
- **Historical Stripe PaymentIntent backfill** — LOCKED-B1, never planned.
- **Historical Cash → Digital mass-backfill** — only the one Zelle transaction will be fixed via the manual SQL template. Anything else is on the operator's discretion.
