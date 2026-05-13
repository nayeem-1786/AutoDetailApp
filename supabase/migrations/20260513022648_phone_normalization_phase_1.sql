-- Phase Normalization-1: phone format integrity.
--
-- Audit (see docs/sessions/normalization-1-phone-format-integrity.md) found
-- malformed phones in three unprotected places:
--   * 3 rows in employees.phone with display formatting "(XXX) XXX-XXXX"
--   * 1 row in business_settings.sms_test_phone_number missing the "+" prefix
--   * 38 rows in sms_delivery_log.to_phone in two malformed shapes
-- This migration backfills all three, then adds the missing valid_phone CHECK
-- to employees so the column matches customers.phone's existing protection.
--
-- Migration is wrapped in an implicit transaction (supabase db push runs each
-- file inside one). The DO $$ block raises before the ALTER if backfill leaves
-- any malformed rows, rolling the whole file back.

-- ──────────────────────────────────────────────────────────────────────────────
-- Backfill A: employees.phone (3 known rows)
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE employees SET phone = '+14243396994' WHERE phone = '(424) 339-6994';
UPDATE employees SET phone = '+13105551212' WHERE phone = '(310) 555-1212';
UPDATE employees SET phone = '+13237348411' WHERE phone = '(323) 734-8411';

-- ──────────────────────────────────────────────────────────────────────────────
-- Backfill B: business_settings.sms_test_phone_number
--
-- The value column is JSONB; the operator originally typed "13107564789" so it
-- stored as a JSON string. Normalize to "+13107564789".
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE business_settings
SET value = to_jsonb('+13107564789'::text)
WHERE key = 'sms_test_phone_number'
  AND value::text = '"13107564789"';

-- ──────────────────────────────────────────────────────────────────────────────
-- Backfill C: sms_delivery_log.to_phone (38 rows across 6 distinct numbers)
--
-- Two malformed shapes:
--   10-digit "(XXX) XXX-XXXX" → strip non-digits, prepend "+1"
--   11-digit "1XXXXXXXXXX" → strip non-digits, prepend "+"
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE sms_delivery_log
SET to_phone = '+1' || regexp_replace(to_phone, '[^0-9]', '', 'g')
WHERE to_phone !~ '^\+1\d{10}$'
  AND length(regexp_replace(to_phone, '[^0-9]', '', 'g')) = 10;

UPDATE sms_delivery_log
SET to_phone = '+' || regexp_replace(to_phone, '[^0-9]', '', 'g')
WHERE to_phone !~ '^\+1\d{10}$'
  AND length(regexp_replace(to_phone, '[^0-9]', '', 'g')) = 11
  AND regexp_replace(to_phone, '[^0-9]', '', 'g') LIKE '1%';

-- ──────────────────────────────────────────────────────────────────────────────
-- Verify employees is clean before adding the CHECK constraint
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM employees
  WHERE phone IS NOT NULL AND phone !~ '^\+1\d{10}$';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'employees.phone still has % malformed rows; aborting CHECK constraint add', bad_count;
  END IF;
END
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Add CHECK constraint to employees.phone (mirrors customers.valid_phone)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD CONSTRAINT valid_phone
  CHECK (phone ~ '^\+1\d{10}$' OR phone IS NULL);

-- Defense-in-depth on the other phone-bearing tables (conversations,
-- sms_delivery_log, sms_conversations, sms_consent_log, quote_communications)
-- is deferred to a follow-up migration. Adding CHECK to those columns requires
-- a backfill that resolves shadow conversations vs. their E.164 siblings,
-- which is operator-decided per-row.
