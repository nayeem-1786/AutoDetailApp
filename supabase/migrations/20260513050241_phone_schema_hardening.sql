-- Phase Schema-Hardening-1: phone-format CHECK constraints across the
-- remaining phone-bearing tables, plus retroactive capture of the
-- channel-aware constraint already live on quote_communications.sent_to.
--
-- Defense-in-depth context:
--   - Storage:   THIS migration (DB-level CHECK)
--   - Wire:      sendSms() / findOrCreateConversation() normalize at chokepoint (Phase Normalization-1)
--   - Display:   formatPhone() canonical helper (Phase Phone-UX-1)
--   - Input:     formatPhoneInput() + normalizePhone() on submit (Phase Phone-UX-1)
--   - Lint:      phone/no-raw-display ESLint rule flags new leaks (Phase Lint-Hardening-1)
--
-- Pre-flight audit ran against the linked DB before this file was written
-- and confirmed 0 malformed rows across all 4 target columns:
--   conversations.phone_number       — 0 bad
--   sms_delivery_log.to_phone        — 0 bad
--   sms_conversations.phone_number   — 0 bad
--   sms_consent_log.phone            — 0 bad
-- See docs/sessions/schema-hardening-1-phone-checks.md for the full audit
-- trail.
--
-- Each ADD CONSTRAINT is preceded by a defensive DO block that re-runs the
-- same audit at apply time. If anything drifted between audit and apply
-- (concurrent write, environment skew), the DO block raises and the entire
-- migration rolls back — supabase db push runs each file inside one
-- transaction, so partial state is impossible.

-- ──────────────────────────────────────────────────────────────────────────────
-- Retroactive: quote_communications.valid_sent_to (channel-aware, Option B)
--
-- This constraint was applied directly via Supabase SQL editor before being
-- captured in source control. Idempotent DROP + ADD ensures fresh
-- environments (dev, future projects) match production. On production this
-- replaces the identical constraint with itself — no data impact.
--
-- Channel-aware shape:
--   - sent_to IS NULL                                  (e.g., status-only rows)
--   - channel = 'sms'   AND sent_to ~ '^\+1\d{10}$'    (E.164)
--   - channel = 'email' AND sent_to ~ basic-email shape
--
-- Adding a new channel value (voice, push, etc.) requires extending this
-- constraint BEFORE app code writes the value, or the INSERT will be
-- rejected. See src/lib/quotes/send-service.ts for the canonical writer
-- and a contract comment.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE quote_communications
  DROP CONSTRAINT IF EXISTS valid_sent_to;

ALTER TABLE quote_communications
  ADD CONSTRAINT valid_sent_to
  CHECK (
    sent_to IS NULL
    OR (channel = 'sms' AND sent_to ~ '^\+1\d{10}$')
    OR (channel = 'email' AND sent_to ~ '^[^@]+@[^@]+\.[^@]+$')
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- New: conversations.phone_number (NOT NULL — no OR-NULL clause)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM conversations
  WHERE phone_number !~ '^\+1\d{10}$';

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'conversations.phone_number has % malformed rows; backfill required before constraint', bad_count;
  END IF;
END
$$;

ALTER TABLE conversations
  ADD CONSTRAINT valid_phone_number
  CHECK (phone_number ~ '^\+1\d{10}$');

-- ──────────────────────────────────────────────────────────────────────────────
-- New: sms_delivery_log.to_phone (NOT NULL)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM sms_delivery_log
  WHERE to_phone !~ '^\+1\d{10}$';

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'sms_delivery_log.to_phone has % malformed rows; backfill required before constraint', bad_count;
  END IF;
END
$$;

ALTER TABLE sms_delivery_log
  ADD CONSTRAINT valid_to_phone
  CHECK (to_phone ~ '^\+1\d{10}$');

-- ──────────────────────────────────────────────────────────────────────────────
-- New: sms_conversations.phone_number (NOT NULL)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM sms_conversations
  WHERE phone_number !~ '^\+1\d{10}$';

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'sms_conversations.phone_number has % malformed rows; backfill required before constraint', bad_count;
  END IF;
END
$$;

ALTER TABLE sms_conversations
  ADD CONSTRAINT valid_phone_number
  CHECK (phone_number ~ '^\+1\d{10}$');

-- ──────────────────────────────────────────────────────────────────────────────
-- New: sms_consent_log.phone (NOT NULL)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM sms_consent_log
  WHERE phone !~ '^\+1\d{10}$';

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'sms_consent_log.phone has % malformed rows; backfill required before constraint', bad_count;
  END IF;
END
$$;

ALTER TABLE sms_consent_log
  ADD CONSTRAINT valid_phone
  CHECK (phone ~ '^\+1\d{10}$');

-- ──────────────────────────────────────────────────────────────────────────────
-- Post-apply verification: confirm all 5 constraints are present.
-- Raises (and rolls back) if any expected constraint is missing — defends
-- against partial application or DDL the migration thought it ran but
-- didn't.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(expected.table_name || '.' || expected.constraint_name, ', ') INTO missing
  FROM (VALUES
    ('quote_communications', 'valid_sent_to'),
    ('conversations',        'valid_phone_number'),
    ('sms_delivery_log',     'valid_to_phone'),
    ('sms_conversations',    'valid_phone_number'),
    ('sms_consent_log',      'valid_phone')
  ) AS expected(table_name, constraint_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = expected.table_name::regclass
      AND conname  = expected.constraint_name
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Phase Schema-Hardening-1 missing constraints: %', missing;
  END IF;
END
$$;
