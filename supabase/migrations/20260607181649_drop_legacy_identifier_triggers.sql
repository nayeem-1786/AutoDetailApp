-- Phase 3 Theme A.1 — drop legacy receipt + PO identifier triggers.
-- Sibling to Theme A's Migration 6 (20260607061605, dormant quote trigger),
-- intentionally deferred until post-Theme-A code is verified in production.
--
-- Safe to drop now: Theme A merged 133d4ee8; operator-confirmed (2026-06-07)
-- that production has issued >=1 SD-XXXXX receipt and >=1 PO-XXXXX via
-- next_identifier() since the merge. All 5 receipt-INSERT sites call
-- generateReceiptNumber(); the single PO-INSERT site calls generatePoNumber().
-- The triggers' WHEN clauses (NEW.<col> IS NULL) are now shadowed and the
-- triggers no longer fire — dropping them retires a stale safety net.
--
-- Names verified against current main per Memory #11:
--   tr_transaction_receipt_number on transactions
--     (20260201000037_create_functions_triggers.sql:50-54)
--   tr_po_number on purchase_orders
--     (latest definition: 20260211000005_purchase_orders_stock_adjustments.sql:138-142)
--
-- Rollback: recreate from 20260201000037 lines 35-76 if needed — those
-- definitions still work (6-digit format) but collide with the unified
-- 5-digit namespace and re-introduce the race window Theme A closed.

DROP TRIGGER IF EXISTS tr_transaction_receipt_number ON transactions;
DROP FUNCTION IF EXISTS generate_receipt_number();

DROP TRIGGER IF EXISTS tr_po_number ON purchase_orders;
DROP FUNCTION IF EXISTS generate_po_number();
