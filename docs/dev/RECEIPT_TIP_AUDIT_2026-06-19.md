# Receipt Tip Display Audit — 2026-06-19

> **Type:** Read-only audit (Type 1 Targeted Audit per Memory #29).
> **Scope:** Tip-line rendering across receipt/transaction surfaces.
> **Trigger:** Roadmap Item 3 — verify the thermal receipt fix (receipt #SD-006297, $92 tip on $552 total, validated earlier in Session #155 work) propagates to every adjacent receipt-and-transaction surface.
> **Out of scope:** Thermal receipt (already verified live), cash-tip rendering (Item 4), tip math (display only), refactoring.
> **Deliverable:** This document. No code changes proposed inline; recommended fixes block out at the bottom.

---

## 1. Scope adjustment from operator's original 6-surface list

The operator initially listed six surfaces. Pre-flight read found one of them does not exist in the codebase:

| Operator-listed | Status in codebase |
|---|---|
| Email **PDF** receipt | **Not implemented.** `sendEmail()` at `src/lib/utils/email.ts:27` exposes signature `(to, subject, text, html?, options?)` with no attachment parameter. The only `attachments`/`pdfkit` codepath in the repo is `src/app/api/quotes/[id]/pdf/route.ts` — that's for **quotes**, not receipts. The POS receipt email route (`src/app/api/pos/receipts/email/route.ts:101`) sends HTML body + text fallback only, no attached PDF. |

**Audit reduced to 5 actual surfaces** (operator-locked, this session). If a PDF receipt is later desired, treat it as a separate feature, not an Item 3 parity fix.

---

## 2. Surface matrix (5 surfaces)

### Surface A — Email HTML receipt (Mailgun delivery to customer)

| Field | Value |
|---|---|
| Entry point | `src/app/api/pos/receipts/email/route.ts:37` (`generateReceiptHtml(tx, config, images)`) |
| Render site | `src/app/pos/lib/receipt-template.ts:1172` (Tip row in totals block); `:1482` (TOTAL row) |
| Tip data path | `fetchReceiptData()` → `src/lib/data/receipt-data.ts:409` reads `tx.tip_amount` from raw transaction → flows into `tx` arg of `generateReceiptHtml` |
| Conditional | `receipt-template.ts:1172` — `if (tx.tip_amount > 0) totals.push(row('Tip', \`$${tx.tip_amount.toFixed(2)}\`))` |
| Render format | `Tip          $X.XX` — left-aligned label, right-aligned 2-decimal currency |
| Positioning | After Subtotal / Tax / Discount(s) / Loyalty Discount, **above** the TOTAL row in the totals table |
| Tip in TOTAL | ✅ Yes — `receipt-template.ts:1482` computes `$${(Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount).toFixed(2)}` |
| **Verdict** | ✅ Renders correctly |
| Also note | Plain-text fallback in `email/route.ts:80` independently renders `${tx.tip_amount > 0 ? \`Tip: $${tx.tip_amount.toFixed(2)}\n\` : ''}` + `Total: $${(tx.total_amount + tx.tip_amount).toFixed(2)}` — text fallback is also healthy. |

---

### Surface B — SMS receipt link → Public receipt page

| Field | Value |
|---|---|
| Entry point | SMS body composed at `src/app/api/pos/receipts/sms/route.ts:82-83` (link to `/receipt/{access_token}`); customer-rendered page at `src/app/(public)/receipt/[token]/page.tsx` |
| Render site | `src/app/(public)/receipt/[token]/page.tsx:318-325` (Tip line); `:361` (TOTAL line) |
| Tip data path | `fetchReceiptTransaction(token)` from `src/lib/data/receipt-data.ts` → server component → reads `tx.tip_amount` |
| Conditional | `page.tsx:318` — `{tx.tip_amount > 0 && ( ... <span>Tip</span><span>{formatCurrency(tx.tip_amount)}</span> ... )}` |
| Render format | `Tip          $X.XX` via `formatCurrency` (locale-aware 2-decimal currency) |
| Positioning | After loyalty discount, above the "Total saved today" rollup, above the `border-t` Total row |
| Tip in TOTAL | ✅ Yes — `page.tsx:361` computes `formatCurrency(Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount)` |
| **Verdict** | ✅ Renders correctly |
| Also note | The pre-link SMS body itself displays a `$total` chip via `buildSummaryLine()` (`receipts/sms/route.ts:86-87`) computed as `Number(total_amount) + Number(tip_amount || 0)` — also tip-inclusive. |

---

### Surface C — Browser-print receipt (POS Print button + print-copier)

| Field | Value |
|---|---|
| Entry point | `GET /api/pos/receipts/html?transaction_id=...` (`src/app/api/pos/receipts/html/route.ts:36`); also `POST /api/pos/receipts/print-copier` (`print-copier/route.ts:44`) |
| Render site | Both reuse `generateReceiptHtml()` → identical render sites as Surface A (`receipt-template.ts:1172`, `:1482`) |
| Tip data path | Same as Surface A (`fetchReceiptData` → `tx.tip_amount`) |
| Conditional | Same as Surface A (`receipt-template.ts:1172`: `tx.tip_amount > 0`) |
| Render format | Same as Surface A |
| Positioning | Same as Surface A |
| Tip in TOTAL | ✅ Yes — same code path as Surface A |
| **Verdict** | ✅ Renders correctly |
| Also note | `print-copier` post-processes the HTML to strip the page background and tighten borders (`print-copier/route.ts:48-51`) but does NOT touch the totals block — tip line and Total math identical to email HTML by construction. |

---

### Surface D — Internal admin/POS Transactions detail view

| Field | Value |
|---|---|
| Entry point | `src/app/pos/transactions/page.tsx:14` and `src/app/pos/transactions/[id]/page.tsx:12` → `<TransactionDetail transactionId=... />` component at `src/app/pos/components/transactions/transaction-detail.tsx:65` |
| Render sites | (1) `transaction-detail.tsx:334-338` — per-payment Tip sub-line under each payment method row; (2) `:381-388` — Tip row in the Totals block; (3) `:389-396` — TOTAL row |
| Tip data path | `posFetch('/api/pos/transactions/{id}')` (`transaction-detail.tsx:76`) → component state `transaction.tip_amount` and per-payment `payment.tip_amount` |
| Conditional (Tip row) | `transaction-detail.tsx:381` — `{transaction.tip_amount > 0 && ( ... <span>Tip</span><span>{formatCurrency(transaction.tip_amount)}</span> ... )}` |
| Conditional (per-payment) | `:334` — `{payment.tip_amount > 0 && (<p>Tip: {formatCurrency(payment.tip_amount)}</p>)}` |
| Render format | `Tip          $X.XX` |
| Positioning | (1) per-payment Tip rendered inside each payment card; (2) Tip row in Totals block after Subtotal / Tax / Discount / Loyalty Discount, above the Total row |
| **Tip in TOTAL** | **❌ NO** — `:393` renders `{formatCurrency(transaction.total_amount)}` with no `+ tip_amount`. Per `docs/dev/DB_SCHEMA.md:3009-3011`, `transactions.tip_amount` and `transactions.total_amount` are separate columns and `total_amount` does NOT include the tip. Every other surface (A, B, C, thermal) explicitly adds `+ tip_amount` at the TOTAL line; this one does not. |
| **Verdict** | ⚠️ **Renders with bug** — per-line Tip and per-payment Tip are correct, but the **Total** displays as `total_amount` only, understating by the tip amount. |
| Severity | **S0** — operator-visible reconciliation discrepancy. A staff member who emails/prints/SMS's the customer's receipt ($552) and then reviews the same transaction in the POS Transactions list will see $460 in the admin view (for the validated $92 tip example). This will cause confusion, suspected bookkeeping errors, and time waste during reconciliation. Same severity class as the original Item 3 thermal fix. |
| Recommended fix | Change `transaction-detail.tsx:393` from `{formatCurrency(transaction.total_amount)}` to `{formatCurrency(transaction.total_amount + (transaction.tip_amount ?? 0))}`. **Open decision:** mirror the canonical receipt formula (`Math.max(appointment_total, total_amount) + tip_amount`) exactly, or use the simpler `total_amount + tip_amount` form. Recommend mirroring the canonical formula for cross-surface consistency — the `Math.max(appointment_total, total_amount)` clause handles close-out shells vs in-store sales (see comment block at `receipt-template.ts:719-722`). However: `FullTransaction` in `transaction-detail.tsx:42-49` is typed as `Transaction & {...}` and may not carry `appointment_total` — verify the prop is present before adopting the full formula; if absent, defer to a follow-up. |

---

### Surface E — Job ticket display

| Field | Value |
|---|---|
| Entry point | `src/app/pos/jobs/components/job-detail.tsx` (in-app job-detail card); `src/app/admin/jobs/[id]/page.tsx` (admin job-detail) |
| Render sites | None — no `tip_amount`, no `Tip` literal, no tip-line rendering in any file under `src/app/pos/jobs/` or `src/app/admin/jobs/` |
| Tip data path | N/A — job-detail surfaces consume `appointments` + `jobs` rows; the tip lives on `transactions.tip_amount`, which is the post-checkout artifact. The job-detail page reads `appointment.total_amount` but not the linked transaction's tip. |
| **Verdict** | ✅ **N/A by design** (operator-locked, this session) |
| Rationale | Job tickets are pre/during-service work orders. Tip is collected at checkout (POS payment flow) and lives on the resulting transaction — not on the job/appointment record. Surfacing tip on the in-progress job-detail would be ambiguous (no tip exists yet at job-start) and the post-checkout staff workflow already surfaces tip via the receipt and the POS Transactions detail (Surface D, once fixed). |
| Recommended fix | None. |

---

## 3. Adjacent surfaces (out of original scope)

These were uncovered during the audit pass but are not part of the operator-locked 5-surface list. Captured here so operator can decide whether to expand the Item 3 fix scope.

### Adjacent-1 — Orphan customer-portal Transaction Detail component

| Field | Value |
|---|---|
| File | `src/components/account/transaction-detail.tsx` |
| Callers | **Zero.** A repo-wide search for `TransactionDetail` and `account/transaction-detail` finds no `import` statement in any `src/app/` page or layout. The file exists but is dead code. |
| Tip rendering | `:141-146` Tip line is conditional on `data.tip_amount > 0` and renders `{formatCurrency(data.tip_amount)}` correctly. |
| **Tip in TOTAL** | **❌ NO** — `:149` renders `{formatCurrency(data.total_amount)}` with no `+ tip_amount`. **Same bug class as Surface D.** |
| Verdict | ⚠️ Latent bug. Harmless while file is orphan; will activate if/when the customer portal wires a transaction-detail page. |
| Recommended | (a) Delete the orphan file as dead code, **or** (b) apply the same fix as Surface D so it's correct on revival. Operator decision. |

### Adjacent-2 — Customer-portal Transaction summary card

> **Status (locked Session #155):** Deferred to a separate session per operator decision. Tracked as a known follow-up; not included in the Item 3 fix.

| Field | Value |
|---|---|
| File | `src/components/account/transaction-card.tsx:57` |
| Tip line | None — summary card, no totals breakout |
| Total displayed | `formatCurrency(transaction.total_amount)` — excludes tip |
| Verdict | ⚠️ Arguable. A customer reviewing their transaction history sees a list of card-level "Totals" that under-report what they actually paid by the tip amount. |
| Severity | Lower than Surface D — this is a summary surface, not a receipt, and the customer can click through to (currently nonexistent — see Adjacent-1) detail. But the visible number is wrong relative to what the customer's card was charged. |
| Recommended | If/when Item 3 fix lands, apply `total_amount + tip_amount` here too for parity. Or: leave as-is and treat this as an Item-5+ followup. Operator decision. |

### Adjacent-3 — Customer-portal Appointment summary card

| Field | Value |
|---|---|
| File | `src/components/account/appointment-card.tsx:145` |
| Tip line | None — summary card |
| Total displayed | `formatCurrency(appointment.total_amount)` — appointment-level, no tip column on `appointments` |
| Verdict | ✅ Correct by construction — `appointments.total_amount` is the appointment's contracted/quoted total; tip is a transaction-time artifact and does not belong on the appointment-level summary. |
| Recommended | No fix. |

### Adjacent-4 — Admin Transactions LIST view + CSV export

> **Status (added + RESOLVED in Session #156, 2026-06-19):** Surfaced by an operator-driven column-audit follow-up the same day as Session #155's detail-view fix. **Same bug class as Surface D; broader operational reach** (the list view is the daily-reconciliation entry point; detail view is one click deeper). Closed in Session #156's bundled commit (column-restructure + Surface D' fix + CSV export fix).

| Field | Value |
|---|---|
| File | `src/app/admin/transactions/page.tsx:750` (on-screen Total cell, pre-#156) + `:781` (CSV export Total value, pre-#156) |
| Render site | Two: (1) `<TransactionTableRow>` Total `<td>` (on-screen), (2) `ExportButton.handleExport()` row body (CSV) |
| Tip data path | `tx.tip_amount` already on the row via SELECT `*` at `page.tsx:242`. Pre-#156 the value was UNUSED — list view showed no tip column anywhere, CSV exported no Tip header. |
| Conditional (Tip cell) | NEW Session #156 — `tx.tip_amount > 0` renders `formatCurrency(tx.tip_amount)`, else `---`. Operator-locked decision #4. |
| Tip in TOTAL | **❌ Pre-#156 NO — same bug as Surface D.** Total rendered `formatCurrency(tx.total_amount)` only. For the real-world SD-006297 balance-payment shape (`total_amount=$230, tip=$92, appointment.total_amount=$460`), the list view displayed `$230.00` while the receipt printed `$552.00` — operator-visible $322 reconciliation discrepancy. |
| Verdict (pre-#156) | ⚠️ Renders with bug — **S0**. Larger reach than Surface D: every tip-bearing row in the table + every row of the CSV export. |
| Severity | **S0** (matches Session #155 detail-view fix; same bug class, larger reach). |
| Fix shape | Mirrors Session #155 canonical formula: `Math.max(appointmentTotal ?? 0, tx.total_amount) + (tx.tip_amount ?? 0)`. Implementation routed via the existing `appointmentTotalsByApptId` map — widened from close-out-only to ALL appointment-linked rows; no SELECT extension needed (unlike Session #155's detail-route fix, which added a PostgREST embed). Map threaded through to `<ExportButton>` so CSV applies the same canonical formula. |
| **Verdict (post-#156)** | ✅ **RESOLVED.** Bundled with the Option B column restructure (Date \| Receipt # \| Customer \| Employee \| Method \| Status \| Services \| Tip \| Total), Customer column width 144→180 + tooltip, and corrective note for the Session #155 narrative misstatement (see CHANGELOG Corrections). |

---

## 4. Aggregate findings

### Bug class summary

| Bug class | Severity | Surface(s) affected | Open scope |
|---|---|---|---|
| **Total row excludes tip** — `total_amount` displayed as the grand total without adding `tip_amount` | **S0** (live, customer/staff-visible) | Surface D (POS admin Transactions detail) | + Adjacent-1 latent + Adjacent-2 arguable |
| All other surfaces | ✅ Healthy | Surfaces A, B, C (and the already-validated thermal printer + Surface E "N/A by design") | — |

### Tip-in-Total formula inventory across the codebase

Surfaces that compute tip-inclusive totals follow one of two formulas:

1. **Canonical formula** (used by thermal, email HTML, browser-print, public receipt page):
   `Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount`
   The `Math.max` clause handles close-out shells (transaction $0, appointment carries gross) vs in-store sales that exceed appointment value. Comment block at `receipt-template.ts:719-722`.

2. **Simplified formula** (used by email plain-text body + SMS body):
   `tx.total_amount + tx.tip_amount`
   No `appointment_total` access in these paths.

Surface D's fix should use one of these — see fix discussion in Surface D's row above.

### Strict-scope deliverables

- **Item 3 (this audit's purpose):** the canonical "any missing tip display" surface fix recommended by the roadmap is **Surface D**. One file, one line.
- **Optional bundled cleanup:** delete or fix `src/components/account/transaction-detail.tsx` (orphan, latent bug).
- **Out of scope for Item 3:** Adjacent-2 (portal Transaction card) and Adjacent-3 (Appointment card — already correct).

### Suggested commit shape (operator decision)

Operator pre-locked: don't commit this audit doc standalone. Suggested bundling for the upcoming Item 3 fix session:

```
fix(pos): Item 3 — POS Transactions detail Total row include tip

- src/app/pos/components/transactions/transaction-detail.tsx:393
  Total row now adds tip_amount (mirrors thermal/email/SMS-link/print canonical formula)
- docs/dev/RECEIPT_TIP_AUDIT_2026-06-19.md (audit doc)
- [optional] delete src/components/account/transaction-detail.tsx (orphan, same bug class)
```

---

## 5. Open operator decisions for the Item 3 fix session

1. **Canonical formula vs simplified formula for Surface D's TOTAL fix?**
   - Canonical: `Math.max(transaction.appointment_total ?? 0, transaction.total_amount ?? 0) + (transaction.tip_amount ?? 0)` — requires verifying `appointment_total` is present on the `FullTransaction` type (`transaction-detail.tsx:42-49`).
   - Simplified: `transaction.total_amount + (transaction.tip_amount ?? 0)` — strictly correct for this surface, drifts from the canonical pattern.

2. **Orphan `src/components/account/transaction-detail.tsx` — delete or patch?**
   - Delete: ~150 lines of dead code, removes the latent bug, gives a future portal page a clean slate.
   - Patch: keeps the file but applies the same fix as Surface D so revival is safe. (No measurable cost; just the carry-over of dead code.)

3. **Adjacent-2 customer-portal Transaction summary card** — include in Item 3 fix, or punt to a separate item?

4. **Severity record:** S0 (this doc's recommendation) confirmed for ROADMAP item-3 ledger, or downgrade?
