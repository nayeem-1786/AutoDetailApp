# Phase 1A-followup — three production fixes

Bundle of three fixes surfaced after Phase 1A.5 dev verification. Atomic commit; ships behind the same review gate as 1A.5.

## FIX 1 — Admin transactions Digital filter (stale-closure bug)

**Root cause:** `fetchTransactions` in `src/app/admin/transactions/page.tsx` was wrapped in `useCallback` with deps `[]`. Phase 1A.5 introduced `paymentMethodFilter` + `digitalPlatformFilter` as captured closure variables inside the function body. Because deps were empty, the closure froze the filter values at first-render (`'all'` / `'all'`). The useEffect re-fired on every filter change (deps include the filters), and `fetchTransactions(...)` was called — but the function body still saw stale `'all'`, so `.eq('payment_method', ...)` never executed.

**Fix:** pass `paymentMethod` + `digitalPlatform` as function arguments (matching the existing pattern for `status`, `searchQuery`, etc.). useCallback deps `[]` stays empty and semantically correct.

The two-query Set pattern for the digital-platform sub-filter was retained and clarified — `.in('id', txIds)` is the server-side EXISTS-equivalent (Postgres dedupes by PK; the JS `new Set()` is defense against unlikely payment-row duplicates).

**Verification matrix to run on dev:**
- `paymentMethod=all` → all transactions returned
- `paymentMethod=cash`/`card`/`check`/`split`/`digital` → only matching `transactions.payment_method`
- `paymentMethod=digital`, `digitalPlatform=zelle/venmo/apple_cash` → only matching `payments.digital_platform`
- `paymentMethod=digital`, `digitalPlatform=all` → all digital transactions

## FIX 2 — Paid in Full ✓ fallback for legacy walk-in transactions

**Problem:** Phase 1A's LOCKED-3 condition keyed off `appointment_balance_due` only. Pre-Phase-0a walk-in transactions have no appointment row (`appointment_id IS NULL`), so the Balance Due / Paid in Full block didn't render at all on those receipts.

**Fix:** widen the renderer-side gate. Falls back to transaction-level totals when `appointment_balance_due` is undefined AND `tx.payments.length > 0 && tx.total_amount > 0`:

```ts
const balanceCents = tx.appointment_balance_due !== undefined
  ? tx.appointment_balance_due
  : (tx.payments.length > 0 && transactionTotalCents > 0
      ? Math.max(0, transactionTotalCents - totalPaidCents)
      : undefined);

const billingTotalCents = Math.max(appointmentTotalCents, transactionTotalCents);
const isPaidInFullStatus = tx.status !== 'voided' && tx.status !== 'refunded' && tx.status !== 'partial_refund';

if (balanceCents === 0 && billingTotalCents > 0 && isPaidInFullStatus) {
  // Paid in Full ✓
} else {
  // Balance Due: $X.XX
}
```

Applied identically across all 3 renderers (thermal, HTML, public page).

**Voided/refunded guard (CHECK 2):** the `tx.status !== 'voided' && tx.status !== 'refunded' && tx.status !== 'partial_refund'` clause prevents "Paid in Full ✓" from rendering on voided receipts. Voided shows the VOIDED banner above + "Balance Due: $0.00" in the payment block — confirmed via scenario 9 fixture regeneration.

**Composer scope:** `composeReceiptPaymentLines.is_paid_in_full` continues to key off appointment data only (its data scope). Renderers compute their own `isPaidInFull` flag for the wider gate.

**Fixture coverage added (CHECK 2 mental walkthrough):**
- **Scenario 16** — legacy walk-in paid in full ($40 cash on $40 service, no appointment). Confirms `Paid in Full [v]` fires via the fallback.
- **Scenario 17** — legacy walk-in partial payment ($30 cash on $50 service, no appointment). Confirms `Balance Due: $20.00` renders, NOT Paid in Full.
- Voided/refunded behavior unchanged (existing scenarios 9, 10, 11 stay green).

## FIX 3 — Thermal middle-dot → CP437 byte 0xFA

**Audit findings:**
- Printer is Star TSP100III (confirmed in receipt-template.ts:1496 comment).
- Default character table is Star "Standard" ≈ CP437. CP437 byte **0xFA = middle dot (·)** — the printer CAN render it natively, no codepage switch needed.
- Phase 1A's `THERMAL_ASCII_SUBSTITUTIONS` mapped `'·' → '-'` (ASCII hyphen), losing the design intent.

**Fix:** refactor `THERMAL_ASCII_SUBSTITUTIONS` → `THERMAL_SUBSTITUTIONS` (renamed; type now `Record<string, number[]>`). Map values are byte arrays so each char emits one or more bytes:
- `'·' → [0xFA]` — middle dot renders as the actual character via CP437.
- ASCII degradations stay (e.g., `'…' → [0x2E, 0x2E, 0x2E]` for ellipsis).
- Iteration changes from "replace-then-encode" (string passes) to per-character lookup-then-emit. Simpler and faster.

**Exhaustiveness audit (EXHAUSTIVENESS CHECK):**

| Char | Codepoint | CP437 byte? | Action |
|---|---|---|---|
| `·` middle dot | U+00B7 | Yes (0xFA) | Emit 0xFA (preserves design) |
| `—` em dash | U+2014 | No | ASCII `-` (0x2D) |
| `–` en dash | U+2013 | No | ASCII `-` (0x2D) |
| `‘` `’` smart single quotes | U+2018/2019 | No | ASCII `'` (0x27) |
| `“` `”` smart double quotes | U+201C/201D | No | ASCII `"` (0x22) |
| `…` ellipsis | U+2026 | No | ASCII `...` |
| ` ` non-breaking space | U+00A0 | No | ASCII space (0x20) |
| `✓` check mark | U+2713 | No | ASCII `v` (0x76) — defense; PAID_IN_FULL_THERMAL uses `[v]` already |

No codepage switch command emitted. Star TSP100III's default character table covers the middle-dot via 0xFA without `ESC t` reconfiguration.

## ADDITIONAL CHECK 1 — Payments Report stale-closure audit

**Audited `src/app/admin/reports/payments/page.tsx`.** No stale-closure bug:
- `fetchData` is `useCallback([supabase])` — `supabase` client is stable.
- Function takes `(fromDate, toDate)` as parameters (not captured from closure).
- useEffect deps `[fetchData, from, to]` — when `from`/`to` change, the effect re-fires `fetchData(from, to)` and the function body uses the freshly passed values.

**No fix needed.** Pattern is correct as shipped in Phase 1A.5.

## ADDITIONAL CHECK 3 — SMS receipt independence

**Audited `src/app/api/pos/receipts/sms/route.ts`.** SMS receipt is a short summary line + shortlinked receipt URL — NOT a rendered receipt body:

- Format: `"<business_name>\n<summary_line>\nThank you! View receipt:\n<shortlink>"`
- `summary_line` is built via `buildSummaryLine()` — does NOT include payment rows, Paid in Full indicator, or middle-dot separators.
- Customer taps the link → public page renders the full receipt (which DOES use the composer's combined-label and the FIX 2 widened gate via the public-page edits in this session).

**FIX 2 and FIX 3 do NOT affect SMS.** No parallel changes needed.

## Test additions

`receipt-composer.test.ts` already covers all the relevant composer behaviors. The renderer-side FIX 2 logic is locked by fixture-equality regression (scenarios 16 + 17). FIX 3 substitution-map refactor is exercised by every existing fixture (all 34 thermal files re-rendered through the new `THERMAL_SUBSTITUTIONS` path; scenarios with `·` in payment labels now contain byte 0xFA instead of `-` when sent to escpos).

**Test count: 664 / 664 pass** (was 660; +4 covering scenarios 16/17 via the fixture-equality loop).

## Files touched

- `src/app/admin/transactions/page.tsx` — pass filter args through to fetchTransactions; clarify EXISTS-equivalent comment.
- `src/app/pos/lib/receipt-template.ts` — FIX 2 (thermal + HTML balance/Paid-in-Full gate widened, voided guard), FIX 3 (THERMAL_SUBSTITUTIONS refactor).
- `src/app/(public)/receipt/[token]/page.tsx` — FIX 2 (public page JSX gate widened, voided guard).
- `src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts` — scenarios 16 + 17.
- 34 fixture files regenerated (17 scenarios × HTML + thermal).
- `docs/sessions/receipt-unification-phase-1a-followup.md` (this file).

No schema changes, no migrations, no new dependencies.
