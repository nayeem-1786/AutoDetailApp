-- Issue 42 — appointment_services.quantity schema gap.
-- Adds the column that mirrors quote_items.quantity + transaction_items.quantity
-- so per_row × N quotes preserve the qty signal through quote → appointment
-- conversion. Existing rows default to 1 (operator-locked backfill strategy:
-- no retroactive UPDATE from quote_items.quantity; the rare multi-quantity
-- historical appointment is corrected manually via Admin UI if needed).

ALTER TABLE appointment_services
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1
  CHECK (quantity > 0);

COMMENT ON COLUMN appointment_services.quantity IS
  'Per-line quantity (e.g., per_row × 2 = quantity=2). Mirrors quote_items.quantity. '
  'Default 1 for non-tiered or single-unit services. Added 2026-05-27 to close Issue 42 '
  '(multi-quantity quote → appointment flattening) — see '
  'docs/dev/ISSUE_42_APPOINTMENT_QUANTITY_AUDIT.md.';
