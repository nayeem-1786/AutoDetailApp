-- =============================================================================
-- Phase 0b.1 receipt-test seed transactions
--
-- DO NOT execute in production. For dev/staging DB testing only.
-- Used by Phase 0b.2 byte-diff harness to render real DB-backed receipts
-- through the (composer-backed) /lib/data/receipt-data.ts pipeline and the
-- public /receipt/[token] page.
--
-- All inserted rows are tagged with notes='[receipt-test scenario N: ...]'
-- so the cleanup block at the top of this file can purge them in one shot.
--
-- Deterministic UUIDs (00000000-0000-0000-0000-00000000000N) make scenarios
-- referenceable from harness scripts without an extra round-trip.
--
-- Mirrors the 12 scenarios in:
--   src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts
--
-- Foreign-key dependencies:
--   - customers, vehicles, employees, services must already exist OR this
--     script must be extended to insert the referenced parents first.
--   - The placeholder UUIDs below assume seed data; substitute with real
--     IDs from your dev DB before executing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CLEANUP (commented out by default — uncomment to purge prior test runs)
-- ---------------------------------------------------------------------------
-- DELETE FROM payments WHERE transaction_id IN (
--   SELECT id FROM transactions WHERE notes LIKE '[receipt-test%'
-- );
-- DELETE FROM refund_items WHERE refund_id IN (
--   SELECT id FROM refunds WHERE transaction_id IN (
--     SELECT id FROM transactions WHERE notes LIKE '[receipt-test%'
--   )
-- );
-- DELETE FROM refunds WHERE transaction_id IN (
--   SELECT id FROM transactions WHERE notes LIKE '[receipt-test%'
-- );
-- DELETE FROM transaction_items WHERE transaction_id IN (
--   SELECT id FROM transactions WHERE notes LIKE '[receipt-test%'
-- );
-- DELETE FROM transactions WHERE notes LIKE '[receipt-test%';
-- DELETE FROM appointment_services WHERE appointment_id IN (
--   SELECT id FROM appointments WHERE internal_notes LIKE '[receipt-test%'
-- );
-- DELETE FROM appointments WHERE internal_notes LIKE '[receipt-test%';

-- ---------------------------------------------------------------------------
-- Placeholders — set these to real IDs from your dev DB
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_customer_id UUID := '00000000-0000-0000-0000-0000c0000001';  -- dev customer
  v_vehicle_id  UUID := '00000000-0000-0000-0000-0000ce000001';  -- dev vehicle
  v_employee_id UUID := '00000000-0000-0000-0000-0000e000e001';  -- dev employee
  v_service_id  UUID := '00000000-0000-0000-0000-0000beef0001';  -- dev service (Full Detail)
BEGIN

-- ===========================================================================
-- Scenario 1 — Walk-in cash, single payment, $25
-- ===========================================================================
-- (left as INSERT skeletons; harness implementer fills in column lists per
--  current schema. Deterministic IDs documented for cross-reference.)
--
-- INSERT INTO appointments (id, customer_id, vehicle_id, status, channel,
--   scheduled_date, scheduled_start_time, scheduled_end_time,
--   subtotal, tax_amount, discount_amount, total_amount,
--   payment_status, payment_type, internal_notes, ...)
-- VALUES ('00000000-0000-0000-0000-00000000a001', v_customer_id, v_vehicle_id,
--   'completed', 'walk_in', '2026-05-06', '20:00:00', '21:00:00',
--   25, 0, 0, 25, 'paid', 'pay_on_site',
--   '[receipt-test scenario 1: Walk-in cash, single payment, $25]', ...);
-- INSERT INTO transactions (id, customer_id, vehicle_id, employee_id, appointment_id,
--   status, subtotal, tax_amount, discount_amount, total_amount, payment_method,
--   transaction_date, receipt_number, notes, access_token, ...)
-- VALUES ('00000000-0000-0000-0000-000000000001', v_customer_id, v_vehicle_id, v_employee_id,
--   '00000000-0000-0000-0000-00000000a001', 'completed', 25, 0, 0, 25, 'cash',
--   '2026-05-06T20:05:00-07:00', 'R-0001',
--   '[receipt-test scenario 1: Walk-in cash, single payment, $25]', 'tok_test_01', ...);
-- INSERT INTO payments (transaction_id, method, amount, cash_tendered, change_given, created_at, ...)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'cash', 25, 30, 5, '2026-05-06T20:05:00-07:00', ...);

-- ===========================================================================
-- Scenarios 2-12 — see inputs.ts for the full data shape; INSERT skeletons
-- following the same structure as Scenario 1. Each scenario uses the
-- corresponding deterministic UUID:
--   Scenario  2 → 00000000-0000-0000-0000-000000000002
--   Scenario  3 → 00000000-0000-0000-0000-000000000003
--   Scenario  4 → 00000000-0000-0000-0000-000000000004  (deposit-only running)
--   Scenario  5 → 00000000-0000-0000-0000-000000000005  (final close-out paid)
--   Scenario  6 → 00000000-0000-0000-0000-000000000006  (pay-link multi-event)
--   Scenario  7 → 00000000-0000-0000-0000-000000000007  (close-out only)
--   Scenario  8 → 00000000-0000-0000-0000-000000000008  ($0 close-out, prepaid)
--   Scenario  9 → 00000000-0000-0000-0000-000000000009  (voided)
--   Scenario 10 → 00000000-0000-0000-0000-000000000010  (full refund)
--   Scenario 11 → 00000000-0000-0000-0000-000000000011  (partial refund)
--   Scenario 12 → 00000000-0000-0000-0000-000000000012  (deposit + interim + split-final)
--
-- For deposit + close-out scenarios (5, 8, 12), insert TWO transactions per
-- scenario sharing the same appointment_id:
--   - The deposit transaction (status='completed', smaller total) — receives
--     the booking_deposit-prefixed notes
--   - The close-out transaction (status='completed', larger or zero total)
--
-- For pay-link scenarios (6, 8), the pay-link payment inserts use
-- notes='Online payment link. PI: pi_test_xxx.' on the parent transaction
-- so derivePaymentSourceLabel resolves the row to "Online (pay link)".
--
-- For the synthetic-future scenario 12, the "$0 card stub" final tender
-- requires payments.amount=0 which currently violates the NOT-NULL+CHECK
-- constraints — that scenario stays test-only via inputs.ts until Phase 1
-- adds the schema affordance for true split-final-with-zero-stub.
-- ===========================================================================

  RAISE NOTICE 'Receipt-test seed scaffolding loaded. Fill in real IDs + INSERTs before executing.';

END $$;
