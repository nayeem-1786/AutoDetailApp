-- Phase 3 Theme A — AC-10. Migration 3 of 6: add appointments.appointment_number column.
--
-- Column added as NULLABLE first so existing rows can be backfilled
-- in Migration 4 before the NOT NULL constraint is applied.
--
-- The UNIQUE index is created with WHERE appointment_number IS NOT NULL so
-- the index is valid during the backfill window. Migration 4 finishes by
-- flipping the column to NOT NULL.

ALTER TABLE appointments
  ADD COLUMN appointment_number TEXT;

CREATE UNIQUE INDEX appointments_appointment_number_key
  ON appointments(appointment_number)
  WHERE appointment_number IS NOT NULL;

COMMENT ON COLUMN appointments.appointment_number IS
  'Human-readable identifier in A-XXXXX format (5-digit, per AC-10 v1.4). '
  'Generated atomically via next_identifier(''appointment''). Required for all '
  'new rows; populated via Migration 20260607061603 for existing rows.';
