# Phase 1A — Visual UX changes (running receipts)

First visual UX changes to receipts since the composer landed. Customer-facing impact across all 4 surfaces (thermal, HTML print/copier, HTML email, public page). Historical receipts re-rendering today pick up the new presentation automatically.

## Locked decisions shipped

| Decision | Summary |
|---|---|
| LOCKED-1 | Sign convention: payments POSITIVE, refunds NEGATIVE. (Refunds already negative; payments stayed positive — no actual change, locked the contract.) |
| LOCKED-2 | "Total Paid:" row added below all payment rows, above Balance Due / Paid in Full. Rendered when at least one payment row exists. |
| REVISED LOCKED-3 | "Paid in Full ✓" REPLACES the Balance Due row when `appointment_balance_due === 0 AND appointment_total > 0`. Fires regardless of HOW the balance became zero — tender, loyalty redemption, full coupon discount, etc. Original LOCKED-3 keyed off `total_paid > 0`, which excluded the loyalty-only path (bill fully discounted by redemption with no tender). Revised during the diff-review pass to handle that case cleanly. |
| LOCKED-4 | "Balance Due:" wording preserved (already matched). Constant adoption via `RECEIPT_VOCAB.BALANCE_DUE`. |
| LOCKED-5 | All `is_deposit` chrome retired across all 4 surfaces: BOOKING DEPOSIT banner, "TOTAL CHARGED" relabel, "EST. BALANCE DUE AT SERVICE" amber row, "Final balance may include additional services" centered note, the "Deposit Paid - Online on MM/DD/YYYY" subtotal-section line (both `is_deposit` and `deposit_credit` branches). Running deposit receipts now render with the standard partial-payment format — deposit transactions appear as payment rows in the unified Payments block. The `is_deposit` flag remains on `ReceiptTransaction` for data fidelity but no renderer reads it. |
| LOCKED-6 | Per-payment-row timestamp format: `M/D/YY h:MM AM/PM` PST, no leading zeros. New helper `formatReceiptDateTimeCompact` added to `src/lib/utils/format.ts`. |
| REVISED LOCKED-7 | Loyalty handling REVERTED from "virtual payment row" to "discount line above TOTAL" — CDTFA Reg 1671.1 says loyalty redemption reduces the taxable base, not a tender. Label updated from "Loyalty (N pts)" → "Loyalty Discount (N pts)". Tax math unchanged. NEW footer block below Balance Due / Paid in Full: `Loyalty redeemed: N pts` and `Loyalty balance: M pts remaining`. M is sourced from `loyalty_ledger.points_balance` (LATEST row for this transaction, `created_at DESC LIMIT 1`) so the value is a historical snapshot, not the customer's current balance. Lookup fires only when `loyalty_points_redeemed > 0`; null fallback when no ledger row found (footer renders only the "redeemed" line). |
| LOCKED-8 | Deposit ordinal labeling per Interpretation B: first payment is labeled `Deposit (...)` only when there's a remainder after applying. Online-booking-deposit transactions always carry `Deposit (Online)` (appointment is by definition incomplete at booking time). Behavior already in composer — no change. |
| LOCKED-9 | Payment-row label hierarchy: `${primary} · ${method_detail} · ${date_time_compact}` for meta-primary labels (Deposit Online/In-Store, Pay Link Online); 2-segment for regular method labels (cash/check use primary alone; card uses method_detail alone — bare "Card" is redundant when brand+last4 is known). New composer export `buildCombinedPaymentLabel` is the single source of truth. |
| NEW LOCKED-10 | Thermal width wrap: when `${label} + space + ${amount}` exceeds the 48-column thermal budget, split at the LAST ` · ` segment so line 1 carries `primary · method_detail` + amount, line 2 carries `  ${timestamp}` indented 2 spaces with no amount. 48 matches the shop's 80mm thermal printer width (also the `receiptToPlainText` / escpos default). HTML and public page get no wrap (no width constraint). Helper `wrapPaymentLabelForThermal` in `src/app/pos/lib/receipt-template.ts`. |
| LOCKED-11 | 14-scenario fixture coverage. Added scenarios 13 (loyalty-only) and 14 (loyalty + cash + tax) to cover loyalty paths the original 12-scenario set didn't exercise. |

## Files changed

| File | What |
|---|---|
| `src/lib/utils/format.ts` | New helper `formatReceiptDateTimeCompact(iso)` → `M/D/YY h:MM AM/PM` PST. |
| `src/lib/data/receipt-composer.ts` | New `RECEIPT_VOCAB.LOYALTY_LABEL` + loyalty footer prefixes. New exports `buildCombinedPaymentLabel`, `buildSuggestedLabelForPayment`, `composeLoyaltyFooter`, `RenderedLoyaltyFooter`. Combined-label assembly in `composeReceiptPaymentLines` now uses the LOCKED-9 hierarchy via `buildCombinedPaymentLabel`. |
| `src/lib/data/receipt-data.ts` | Loyalty-ledger query (fires only when `loyalty_points_redeemed > 0`) populates `tx.loyalty_balance_after_pts`. Field plumbed onto `ReceiptTransaction`. |
| `src/app/pos/lib/receipt-template.ts` | `loyalty_balance_after_pts?: number \| null` added to `ReceiptTransaction`. `formatDepositLabel` (unused after chrome retirement) deleted. New thermal-side helpers: `buildFirstWithRemainderFlags`, `wrapPaymentLabelForThermal`. Thermal generator: BOOKING DEPOSIT banner + TOTAL CHARGED + EST. BALANCE DUE branch + Final balance footnote + deposit_credit subtotal line deleted; Loyalty label switched to `Loyalty Discount`; payment loop uses `buildSuggestedLabelForPayment` + thermal wrap; Total Paid row added; Paid in Full ✓ conditional swap; loyalty footer block. HTML generator: BOOKING DEPOSIT badge + TOTAL CHARGED relabel + EST. BALANCE DUE row + Final balance footnote + deposit subtotal lines deleted; Loyalty label switched; payment table uses unified composer label (no wrap); Total Paid HTML row; Paid in Full ✓ HTML row; loyalty footer HTML rows. |
| `src/app/(public)/receipt/[token]/page.tsx` | Imports `buildSuggestedLabelForPayment`, `composeLoyaltyFooter`, `RECEIPT_VOCAB`, `toCents`. BOOKING DEPOSIT badge + deposit-paid subtotal lines + "Total Charged" relabel + "Est. Balance Due at Service" + Final balance footnote deleted. Loyalty discount line uses `RECEIPT_VOCAB.LOYALTY_LABEL`. Payment loop swaps inline label construction for unified composer helper. Total Paid + Paid in Full ✓ conditional + loyalty footer added. |
| `src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts` | Two new scenarios (13 loyalty-only, 14 loyalty + cash + tax) with `loyalty_balance_after_pts` snapshots. |
| `src/lib/data/__tests__/__fixtures__/receipt-baselines/*.html/.thermal.txt` | 28 fixtures regenerated (14 scenarios × HTML + thermal). |
| `src/lib/data/__tests__/receipt-composer.test.ts` | New test blocks for `formatReceiptDateTimeCompact`, `buildCombinedPaymentLabel`, `buildSuggestedLabelForPayment`, `composeLoyaltyFooter`, and combined-label assembly inside `composeReceiptPaymentLines`. The existing 12-scenario fixture-equality loop now iterates the full 14 scenarios automatically. |

## Loyalty model — historical-accuracy choice

The loyalty footer's `Loyalty balance: M pts remaining` line shows the customer's balance AT THE TIME of the transaction (post-redemption + post-earning), not their current balance. Sourced from `loyalty_ledger.points_balance` (latest row for this transaction).

Rejected alternative: joining `customers.loyalty_points_balance` would show the customer's CURRENT balance, which drifts as they visit again. Re-opening a receipt months later under that scheme would show a balance that wasn't accurate at receipt time — misleading for the artifact's role as a frozen record.

Fallback: when the ledger lookup returns no row (very rare data corruption case, or pre-ledger historical transactions), the footer renders only `Loyalty redeemed: N pts` without the balance line.

## Tax implication

`Loyalty Discount` continues to reduce the taxable base BEFORE tax calculation, consistent with CDTFA Reg 1671.1. Historical receipts re-rendered today print the same tax amount they printed originally — Phase 1A makes no change to tax math.

## Sign convention

- Payment amounts: positive `$50.00` (industry standard for receipts).
- Refund amounts: negative `-$50.00` (already in place pre-Phase 1A; reaffirmed and locked).
- Discounts (Loyalty Discount, Coupon, Manual): negative `-$X.XX` (unchanged).
- Cash Tendered + Change sub-rows: positive (unchanged).
- Total Paid: positive `$X.XX`.
- Balance Due: positive `$X.XX` (or "Paid in Full ✓" with no amount).

## Old vs new — visual diff highlights

Two of the 14 baseline scenarios as before/after pairs.

### Scenario 4 — Booking deposit only ($50 of $175), running

**Before (legacy chrome):**
```
** BOOKING DEPOSIT **
------------------------------------------------
Receipt #R-0004-DEP         May 4, 2026, 1:00 PM
Sample Customer, Enthusiast       (310) 555-1234
sample@example.com      Customer Since: Aug 2024
Vehicle | 2022 White Tesla Model 3
------------------------------------------------
Full Detail                           $175.00
------------------------------------------------
Subtotal                                 $175.00
Tax                                        $0.00
Deposit Paid - Online on 05/04/2026      -$50.00

TOTAL CHARGED                             $50.00

EST. BALANCE DUE AT SERVICE              $125.00
       Final balance may include
            additional services
------------------------------------------------
Booking deposit · May 4, 2026, 1:00 PM    $50.00
Balance Due                              $125.00
```

**After (running-receipt format):**
```
------------------------------------------------
Receipt #R-0004-DEP         May 4, 2026, 1:00 PM
Sample Customer, Enthusiast       (310) 555-1234
sample@example.com      Customer Since: Aug 2024
Vehicle | 2022 White Tesla Model 3
------------------------------------------------
Full Detail                           $175.00
------------------------------------------------
Subtotal                                 $175.00
Tax                                        $0.00

TOTAL                                    $175.00
------------------------------------------------
Deposit (Online) · Amex ****1234          $50.00
                  5/4/26 1:00 PM
Total Paid:                               $50.00
Balance Due:                             $125.00
```

### Scenario 8 — Zero close-out (fully pre-paid via deposit + pay-link)

**Before (legacy chrome):**
```
------------------------------------------------
Receipt #R-0008-FINAL       May 6, 2026, 8:00 PM
... (header) ...
Subtotal                                 $175.00
Tax                                        $0.00
Deposit Paid - Online on 05/04/2026      -$50.00

TOTAL                                    $125.00
     See also: Deposit Receipt #R-0008-DEP
------------------------------------------------
Booking deposit · May 4, 2026, 1:00 PM    $50.00
Online (pay link) · May 5, 2026, 5:00 PM $125.00
Balance Due                                $0.00
```

**After (running-receipt format):**
```
------------------------------------------------
Receipt #R-0008-FINAL       May 6, 2026, 8:00 PM
... (header) ...
Subtotal                                 $175.00
Tax                                        $0.00

TOTAL                                    $175.00
     See also: Deposit Receipt #R-0008-DEP
------------------------------------------------
Deposit (Online) · Amex ****1234          $50.00
                  5/4/26 1:00 PM
Pay Link (Online) · Visa ****0001        $125.00
                  5/5/26 5:00 PM
Total Paid:                              $175.00
                Paid in Full [v]
```

Note: the new TOTAL shows the gross $175 (appointment total), matching customer expectation. The legacy version showed $125 ("balance after deposit credit"), which was the post-credit transaction amount — misleading because the customer paid the full gross over multiple events.

## Byte-diff harness usage

The byte-diff harness from Phase 0b.2 (`scripts/diff-receipt-renders.ts`) still works against the same 10 production transaction IDs. For Phase 1A verification:

- The diff WILL show non-trivial visual differences this time (Total Paid row appears, Balance Due wording adjusts, deposit-chrome lines disappear, payment row labels reformat). These diffs are EXPECTED and intentional.
- Review each diff by category:
  - **Deposit-bearing receipts:** confirm BOOKING DEPOSIT banner + TOTAL CHARGED + EST. BALANCE DUE blocks are gone, replaced by standard format with a `Deposit (Online) · ...` payment row.
  - **Paid-in-full receipts:** confirm Balance Due $0.00 → Paid in Full ✓.
  - **Multi-event receipts (pay-link, interim):** confirm each payment row carries its own timestamp.
  - **Loyalty-redemption receipts:** confirm "Loyalty Discount (N pts)" replaces "Loyalty (N pts)" and the footer appears below Paid in Full / Balance Due.
- A diff IS a regression only when:
  - The DATA changed (subtotal, tax, payment count, amounts) — should never happen since this session touches presentation only.
  - The receipt fails to render at all (template error / missing field).
  - Loyalty footer shows wrong balance (verify against `loyalty_ledger.points_balance` for the transaction).

## Diff-review refinements (applied in same session)

Both flags surfaced at diff-review time were resolved before commit:

1. **Thermal wrap budget = 48 cols** (was 32 in the first pass). Matches the shop's actual 80mm thermal printer width. Lines like `Amex ****1074 · 5/6/26 8:05 PM` (30 chars) now fit on a single line; the long `Deposit (Online) · Amex ****1234 · 5/4/26 1:00 PM` (50 chars) still wraps as designed.

2. **REVISED LOCKED-3** semantics — see the locked-decisions table. Loyalty-only paid receipts (scenario 13) now correctly flip to "Paid in Full ✓" instead of "Balance Due: $0.00".
