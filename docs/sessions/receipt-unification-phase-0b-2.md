# Phase 0b.2 — Public receipt page consolidation + byte-diff harness

## What changed

1. **`src/lib/data/receipt-data.ts`** — extracted a new exported sub-helper `fetchReceiptTransaction(supabase, transactionId)` that returns just the rendered `ReceiptTransaction` (no receipt config / QR / barcode). `fetchReceiptData` now delegates to it and layers config/context/images on top.

2. **`src/app/(public)/receipt/[token]/page.tsx`** — replaced the inline ~190-LOC `getTransaction(token)` with a tiny `resolveTokenToReceipt(token)` helper that does one `transactions.id` lookup by access_token, then calls `fetchReceiptTransaction(supabase, id)`. Deleted the local `TransactionWithRelations` interface and all the duplicated deposit detection / appointment-payment aggregation / refund-source enrichment code.

3. **`src/app/pos/lib/receipt-template.ts`** — widened `ReceiptPayment` with `id?: string` so React `key={p.id}` typechecks without a cast.

Net LOC: ~190 deleted from the public page, ~30 added to receipt-data.ts, +1 type widening.

## Byte-fidelity verification — `scripts/diff-receipt-renders.ts`

The harness captures three (optionally four) outputs per transaction, BEFORE and AFTER the consolidation, and reports any non-whitespace diff.

### Surfaces verified

| Surface | What it proves |
|---|---|
| `tx.json` | Composer-driven aggregation produces an identical `ReceiptTransaction` shape (root cause for any visual drift) |
| `html` | `generateReceiptHtml` output unchanged (browser print + email pipeline) |
| `thermal` | `generateReceiptLines` → `receiptToPlainText` output unchanged (printer pipeline) |
| `public` | Public receipt page HTML response from the dev server unchanged (the most critical artifact for this session — proves the page consolidation is byte-safe) |

### Picking the 10 transaction IDs

Cover the full matrix below. SQL hints below assume your dev DB mirrors production schema. Adjust filter dates to match what's available.

```sql
-- 1. Walk-in cash, single payment
SELECT t.id, t.receipt_number, t.transaction_date, t.total_amount
FROM transactions t
JOIN payments p ON p.transaction_id = t.id
WHERE t.status = 'completed'
  AND p.method = 'cash'
  AND t.notes IS NULL
  AND (SELECT COUNT(*) FROM payments WHERE transaction_id = t.id) = 1
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 2. Walk-in card
SELECT t.id, t.receipt_number, t.transaction_date, p.card_brand, p.card_last_four
FROM transactions t
JOIN payments p ON p.transaction_id = t.id
WHERE t.status = 'completed'
  AND p.method = 'card'
  AND t.notes IS NULL
  AND (SELECT COUNT(*) FROM payments WHERE transaction_id = t.id) = 1
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 3. Booking-deposit only (no close-out yet)
-- Deposit transaction whose appointment has NO sibling jobs.transaction_id.
SELECT t.id, t.receipt_number, t.notes
FROM transactions t
JOIN appointments a ON a.id = t.appointment_id
WHERE t.status = 'completed'
  AND t.notes LIKE 'Online booking deposit.%'
  AND a.status NOT IN ('completed', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.appointment_id = a.id AND j.transaction_id IS NOT NULL
  )
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 4. Booking-deposit + close-out paid in full
-- The CLOSE-OUT transaction (not the deposit). Has deposit_credit > 0.
SELECT t.id, t.receipt_number, t.deposit_credit, t.total_amount
FROM transactions t
WHERE t.status = 'completed'
  AND t.deposit_credit > 0
  AND t.total_amount > 0
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 5. Pay-link multi-event
-- An appointment with TWO+ pay-link transactions tied to it.
SELECT a.id AS appt_id, COUNT(*) AS pay_link_count, ARRAY_AGG(t.id) AS tx_ids
FROM appointments a
JOIN transactions t ON t.appointment_id = a.id
WHERE t.notes LIKE 'Online payment link.%'
  AND t.status = 'completed'
GROUP BY a.id
HAVING COUNT(*) >= 2
LIMIT 5;
-- Pick any one of the tx_ids returned; the others on the same appointment
-- will surface as additional payment rows on the rendered receipt.

-- 6. Close-out only (full payment at pickup, no prior deposit)
SELECT t.id, t.receipt_number, t.total_amount
FROM transactions t
JOIN appointments a ON a.id = t.appointment_id
WHERE t.status = 'completed'
  AND t.deposit_credit = 0
  AND t.total_amount > 0
  AND a.payment_type = 'pay_on_site'
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 7. $0 close-out (fully pre-paid)
SELECT t.id, t.receipt_number, t.deposit_credit, t.total_amount
FROM transactions t
WHERE t.status = 'completed'
  AND t.total_amount = 0
  AND t.deposit_credit > 0
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 8. Voided
SELECT t.id, t.receipt_number, t.transaction_date
FROM transactions t
WHERE t.status = 'voided'
ORDER BY t.transaction_date DESC
LIMIT 5;

-- 9. Full refund
SELECT t.id, t.receipt_number, r.amount, r.created_at
FROM transactions t
JOIN refunds r ON r.transaction_id = t.id
WHERE r.status = 'processed'
  AND r.amount = t.total_amount
ORDER BY r.created_at DESC
LIMIT 5;

-- 10. Partial refund
SELECT t.id, t.receipt_number, r.amount, t.total_amount, (t.total_amount - r.amount) AS net_kept
FROM transactions t
JOIN refunds r ON r.transaction_id = t.id
WHERE r.status = 'processed'
  AND r.amount > 0
  AND r.amount < t.total_amount
ORDER BY r.created_at DESC
LIMIT 5;
```

Pick one ID from each query and write them down — same ten IDs are used in BEFORE and AFTER captures.

### Run sequence

Three commands. Replace `<id1> ... <id10>` with the ten transaction UUIDs you picked.

```bash
# ---- BEFORE: capture at Phase 0b.1 head (commit 4d36eb46)
git checkout 4d36eb46
npm run dev                                            # leave running
# in another terminal:
npx tsx scripts/diff-receipt-renders.ts \
    --capture before \
    <id1> <id2> ... <id10>

# ---- AFTER: capture at the current Phase 0b.2 commit
git checkout main                                      # or whatever has 0b.2
# (rebuild dev server if needed: Ctrl-C and re-run `npm run dev`)
npx tsx scripts/diff-receipt-renders.ts \
    --capture after \
    <id1> <id2> ... <id10>

# ---- DIFF: compare every captured pair
npx tsx scripts/diff-receipt-renders.ts \
    --diff \
    <id1> <id2> ... <id10>
```

The `--diff` step writes `tmp/diff/SUMMARY.txt` with PASS/FAIL per ID per surface. Expected: every row PASS across `tx-json`, `html`, `thermal`, `public`. Any FAIL row prints a byte-delta count and the file path so you can drop directly into `diff` on the two captured files.

If the harness reports `MISSING`, that surface didn't capture (e.g., dev server wasn't reachable for `--capture` `public`). Re-run the missing capture step.

### Optional flags

- `--public-url <url>` — override the dev server base URL (default `http://localhost:3000`). Use if running on a non-standard port or behind ngrok.
- `--skip-public` — skip the public-page fetch entirely. Useful if the dev server isn't running and you just want HTML/thermal/tx-json verification.

### Env vars required

The harness opens its own Supabase client via service role:

```
SUPABASE_URL=<your dev DB url>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

(Falls back to `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_KEY` if those names aren't set.)

### Output layout

```
tmp/diff/
├── <id>.tx.before.json
├── <id>.tx.after.json
├── <id>.html.before.html
├── <id>.html.after.html
├── <id>.thermal.before.txt
├── <id>.thermal.after.txt
├── <id>.public.before.html         (when dev server reachable)
├── <id>.public.after.html
└── SUMMARY.txt
```

`tmp/` is `.gitignore`-d in this project; captures are not committed.

## What "PASS" proves

- `tx-json PASS` — composer-backed aggregation produces an identical data shape; the JSX rendering downstream is a deterministic function of this shape, so by transitivity the rendered output is identical.
- `html PASS` — `generateReceiptHtml` (which lives behind `fetchReceiptData → tx`) is byte-identical. Print + email surfaces unaffected.
- `thermal PASS` — same for the thermal pipeline.
- `public PASS` — direct end-to-end byte match of the public receipt page HTML response. Belt-and-suspenders alongside `tx-json`.

If `tx-json PASS` but `public FAIL`, that's a JSX rendering bug introduced by the consolidation (unlikely — JSX wasn't changed). If `tx-json FAIL`, the composer or the sub-helper extraction has a behavioral diff that needs investigating before deploy.

## Deploy gate

**Do not deploy Phase 0b.2 until the harness reports PASS for all three (or four) surfaces across at least 10 production-representative transaction IDs covering the matrix above.** If any FAIL, paste the SUMMARY plus the failing-surface diff to Claude for analysis.
