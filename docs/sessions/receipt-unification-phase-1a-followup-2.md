# Phase 1A-followup-2 — Thermal ✓ rendering + admin search global scope

Two cosmetic/UX fixes after Phase 1A-followup dev verification.

## ITEM 1 — Thermal ✓ indicator (CP437 byte 0xFB)

### CP437 investigation

CP437 has **no exact ✓ glyph**. Authoritative chart confirms:
- 0xFB = √ (RADICAL / square root)
- 0xFE = ■ (BLACK SQUARE)
- 0xFD = ² (superscript two — irrelevant)

The prompt's hint "0xFB = ✓" was incorrect. Chose **0xFB (√)** as the substitute — industry-standard "almost-check" convention on thermal POS printers; reads as a tick-style mark to customers. Better than ASCII fallback `[v]` (looks like programmer notation) and better than `■` (looks like a block).

### Implementation

1. `THERMAL_SUBSTITUTIONS` map (`receipt-template.ts:1553`): changed `'✓' → [0x76]` (lowercase 'v') to `'✓' → [0xFB]` (CP437 RADICAL).
2. Consolidated `PAID_IN_FULL_HTML` + `PAID_IN_FULL_THERMAL` into a single `PAID_IN_FULL_INDICATOR: 'Paid in Full ✓'` constant in `receipt-composer.ts`. The literal `✓` is universal across HTML/email/public (UTF-8 native) and thermal (substituted to CP437 0xFB at print time).
3. Updated 4 consumer sites:
   - `receipt-template.ts` thermal renderer
   - `receipt-template.ts` HTML renderer
   - `(public)/receipt/[token]/page.tsx`
   - (Email pipeline uses the HTML renderer — propagates automatically via `generateReceiptHtml`. Verified by call-site audit: `/api/pos/receipts/email`, `/api/pos/receipts/print-copier`, `/api/pos/receipts/html`, and the receipt-printer settings preview all call the same function.)

### Pre-implementation check A — stray `[v]` literals

Grep across `src/`, `scripts/`, `supabase/` confirmed the only `[v]` literal lived inside the old `PAID_IN_FULL_THERMAL` value. The comment at `receipt-template.ts:1553` referenced `[v]` and was rewritten alongside the byte change. **Zero remaining literals.**

### Pre-implementation check B — email surface verification

`generateReceiptHtml` is the single source for all HTML-style receipts. Consumers (audited via grep):
- `src/app/admin/settings/receipt-printer/page.tsx:481` (admin preview)
- `src/app/api/pos/receipts/print-copier/route.ts:44`
- `src/app/api/pos/receipts/html/route.ts:36`
- `src/app/api/pos/receipts/email/route.ts:6` (email path)

All consume the same function output; the constant rename propagates to email automatically. **No parallel email-side fix needed.**

### SMS receipt parity

Re-confirmed (consistent with Phase 1A.5 and 1A-followup audits): SMS receipt is `business_name + summary_line + receipt_link`. No `PAID_IN_FULL_*` reference anywhere in `/api/pos/receipts/sms/route.ts`. Independent of this change.

### Fixture verification

The plain-text fixture files (`*.thermal.txt`) show literal UTF-8 `✓` — correct, because `receiptToPlainText` doesn't run the byte-substitution map. The byte-level substitution (`✓ → 0xFB`) fires only when receipt text flows through `receiptToEscPos` → `textToBytes` at actual print time. Confirmed by inspecting `THERMAL_SUBSTITUTIONS[0x2713]` (U+2713 '✓') mapping resolves to `[0xFB]` in the printer byte stream.

All 34 fixtures regenerated; paid-in-full scenarios (1, 2, 3, 5, 8, 14, 15, 16) now contain `Paid in Full ✓` (was `Paid in Full [v]` on thermal, `Paid in Full ✓` on HTML — the discrepancy is gone). 664/664 tests pass.

## ITEM 2 — Admin search bypasses ALL filters

### Behavior locked

When `searchQuery.trim().length > 0`:
- Status filter — bypassed
- Payment method filter — bypassed
- Digital platform sub-filter — bypassed
- Date range filter — bypassed

When `searchQuery.trim().length === 0`: all filters apply normally.

**No visual hint UI** — clean and predictable. The behavior is the behavior.

### Implementation

`fetchTransactions` in `src/app/admin/transactions/page.tsx`: wrapped the four filter blocks (status, payment-method, digital-platform sub-filter, date range) in a single `if (!isSearchActive)` guard. The search filter itself follows below and always runs when there's a non-empty term.

Phase 1A-followup-1's stale-closure fix (filter values passed as fn args) is preserved — the `useCallback([])` pattern stays correct because the function reads filter values from its arguments.

### Payments report (per audit-task D)

`/admin/reports/payments` has date pickers but **no search input**. LOCKED-2 doesn't apply; no change needed.

## Files touched

- `src/lib/data/receipt-composer.ts` — `PAID_IN_FULL_HTML` + `PAID_IN_FULL_THERMAL` → consolidated `PAID_IN_FULL_INDICATOR: 'Paid in Full ✓'`.
- `src/app/pos/lib/receipt-template.ts` — `'✓' → [0xFB]` in `THERMAL_SUBSTITUTIONS`; both renderer call sites updated.
- `src/app/(public)/receipt/[token]/page.tsx` — public page call site updated.
- `src/app/admin/transactions/page.tsx` — search-active short-circuit around all filter blocks.
- 34 fixtures regenerated.

No schema changes, no migrations, no new dependencies.
