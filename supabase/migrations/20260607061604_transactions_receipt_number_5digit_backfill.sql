-- Phase 3 Theme A — AC-10. Migration 5 of 6: backfill existing SD-XXXXXX
-- receipts to the new 5-digit SD-XXXXX format (v1.4 revision).
--
-- Operator-queried production data (2026-06-06): 6,309 transactions with
-- receipt_number matching `^SD-\d+$`, MAX numeric value = 6,365.
-- Existing format: SD-006365 (6 digits, zero-padded).
-- Target format:   SD-06365  (5 digits, zero-padded).
--
-- The numeric value is preserved (6,365 stays 6,365) — only the rendered
-- width changes. The UNIQUE constraint on receipt_number is satisfied
-- because trimming one leading zero from SD-00XXXX cannot collide with any
-- other row's renormalized value (all source rows share the same
-- leading-zero pattern; numeric uniqueness in the source set carries
-- through).
--
-- Separate migration from the schema-creation migration so the backfill
-- can be rolled back independently if a production observation surfaces
-- a problem.

UPDATE transactions
   SET receipt_number = 'SD-' || LPAD(
         SUBSTRING(receipt_number FROM 4)::INTEGER::TEXT,
         5,
         '0'
       )
 WHERE receipt_number ~ '^SD-\d+$';

-- Verification — fail the migration if format isn't uniform 5-digit
-- (SD- + 5 chars = 8 total) or if any duplicate slipped through.
DO $$
DECLARE
  v_max_len    INTEGER;
  v_dup_count  INTEGER;
BEGIN
  SELECT MAX(LENGTH(receipt_number))
    INTO v_max_len
    FROM transactions
   WHERE receipt_number ~ '^SD-\d+$';

  IF v_max_len IS NOT NULL AND v_max_len <> 8 THEN
    RAISE EXCEPTION 'SD backfill verification failed: max length=% (expected 8 for SD-XXXXX)', v_max_len;
  END IF;

  SELECT COUNT(*) - COUNT(DISTINCT receipt_number)
    INTO v_dup_count
    FROM transactions
   WHERE receipt_number IS NOT NULL;

  IF v_dup_count <> 0 THEN
    RAISE EXCEPTION 'SD backfill produced duplicates: % duplicate receipt_numbers', v_dup_count;
  END IF;
END $$;
