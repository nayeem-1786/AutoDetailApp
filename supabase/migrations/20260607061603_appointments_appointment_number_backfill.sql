-- Phase 3 Theme A — AC-10. Migration 4 of 6: backfill appointment_number
-- for existing appointments and flip the column to NOT NULL.
--
-- Order: by created_at ASC so the oldest appointment receives A-10001,
-- the second-oldest A-10002, etc. After the loop completes, the
-- identifier_sequences.current_value is set to the last issued counter so
-- the NEXT call to next_identifier('appointment') returns the next value
-- in sequence with no gap.
--
-- This migration uses a single DO block so the backfill + reseed run in
-- one transaction; partial failure rolls back the column writes.

DO $$
DECLARE
  v_appointment RECORD;
  v_counter     BIGINT := 10000;  -- pre-increment seed; first issued = 10001
  v_formatted   TEXT;
BEGIN
  FOR v_appointment IN
    SELECT id
      FROM appointments
     WHERE appointment_number IS NULL
     ORDER BY created_at ASC, id ASC  -- id ASC as deterministic tiebreaker
  LOOP
    v_counter := v_counter + 1;
    v_formatted := 'A-' || LPAD(v_counter::TEXT, 5, '0');

    UPDATE appointments
       SET appointment_number = v_formatted
     WHERE id = v_appointment.id;
  END LOOP;

  -- Reseed the appointment row in identifier_sequences so the next call to
  -- next_identifier('appointment') returns A-(v_counter + 1).
  UPDATE identifier_sequences
     SET current_value = v_counter,
         updated_at    = NOW()
   WHERE entity_type = 'appointment';
END $$;

-- Lock the column to NOT NULL now that every existing row is populated.
ALTER TABLE appointments
  ALTER COLUMN appointment_number SET NOT NULL;
