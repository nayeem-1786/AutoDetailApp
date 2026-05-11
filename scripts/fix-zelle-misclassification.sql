-- Phase 1A.5 Part A — surgical fix for the one Zelle-mismarked transaction.
--
-- Context: during an internet outage, a customer paid via Zelle but the
-- cashier marked the payment as Cash because the Digital button didn't
-- exist yet. After Phase 1A.5 deploys, this script reclassifies the row.
--
-- HOW TO USE:
--   1. Identify the affected transaction id (TX_ID below). Cross-reference
--      with the receipt #, customer name, and approximate timestamp.
--   2. Verify the current state with the SELECT below FIRST.
--   3. Run the UPDATE only if the SELECT returns exactly one row matching
--      what you expect.
--   4. Run the SELECT a second time to confirm.
--   5. Receipt re-renders next time the page is opened — no cache bust needed.
--
-- DO NOT execute as part of any migration / supabase db push. This is a
-- one-time manual cleanup. The CHECK constraint
-- payments_digital_platform_check enforces the post-update invariant
-- (method='digital' ⇒ digital_platform NOT NULL).

-- Step 1 — VERIFY (paste the affected transaction id here):
SELECT
  p.id        AS payment_id,
  p.transaction_id,
  p.method,
  p.digital_platform,
  p.amount,
  p.created_at,
  t.receipt_number,
  t.notes
FROM payments p
JOIN transactions t ON t.id = p.transaction_id
WHERE p.transaction_id = '<TX_ID_HERE>'::uuid;

-- Step 2 — UPDATE (uncomment after the SELECT above confirms the row):
--
-- UPDATE payments
-- SET method = 'digital',
--     digital_platform = 'zelle'
-- WHERE transaction_id = '<TX_ID_HERE>'::uuid
--   AND method = 'cash';
--
-- -- Also flip the transaction-level summary so admin filtering finds it.
-- UPDATE transactions
-- SET payment_method = 'digital'
-- WHERE id = '<TX_ID_HERE>'::uuid
--   AND payment_method = 'cash';

-- Step 3 — VERIFY post-update (paste the same transaction id):
-- (re-run Step 1 SELECT to confirm method='digital' and digital_platform='zelle')
