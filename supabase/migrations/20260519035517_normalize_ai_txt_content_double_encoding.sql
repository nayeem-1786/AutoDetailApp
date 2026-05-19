-- Defensive backfill for ai_txt_content JSONB double-encoding.
--
-- Bug: src/app/api/admin/cms/seo/ai-txt/route.ts PATCH handler called
-- JSON.stringify(content) before Supabase upsert into the JSONB column
-- business_settings.value, causing immediate double-encoding on every Save.
-- The Supabase JS client serializes for JSONB itself; pre-stringifying
-- produced a JSONB string whose deserialized form had literal `"` characters
-- at both ends and the original multi-line body's `\n` sequences as escape
-- pairs. The public /ai.txt endpoint reads the row raw and serves as
-- text/plain, so a corrupted row would expose JSON-encoded garbage to AI
-- crawlers (GPTBot, Google-Extended, CCBot, anthropic-ai).
--
-- Code fix lands alongside this migration: PATCH now passes the value raw,
-- the GET admin route and the public /ai.txt route both unwrap any legacy
-- double-encoded form defensively.
--
-- Production state at fix-time (verified 2026-05-19):
--   curl https://smartdetailsautospa.com/ai.txt
-- returned valid directives. The admin form has never been used to Save
-- these settings since the bug shipped, so the row sat in its seeded form
-- and the bug was latent, not active. This migration is defensive — it
-- normalizes ANY double-encoded form if present, and is a no-op if the row
-- is already clean.
--
-- Idempotent: re-running on already-clean rows is a no-op. The WHERE clause
-- matches only JSONB strings whose text representation has the exact double-
-- encoded shape `"\"...\""` (a JSONB string with literal backslash-quote
-- characters surrounding the inner value).
--
-- Mirror migration: 20260518225000_normalize_homepage_settings_double_encoding.sql.
-- Audit: docs/dev/AUDIT_ADMIN_PUT_JSONB_2026-05-19.md.

UPDATE business_settings
SET value = (value #>> '{}')::jsonb,
    updated_at = now()
WHERE key = 'ai_txt_content'
  AND jsonb_typeof(value) = 'string'
  AND value::text LIKE '"\"%\""';

-- Post-deploy diagnostic — confirm the row is clean and ai.txt serves the
-- expected directives to crawlers:
--
--   SELECT key, jsonb_typeof(value) AS type, length(value::text) AS text_len,
--          left(value::text, 80) AS preview
--   FROM business_settings
--   WHERE key = 'ai_txt_content';
--
-- Expected post-migration on a previously-corrupted row: type='string',
-- text_len drops, preview no longer starts with `"\"` (only one leading `"`).
-- Expected on a never-saved row: unchanged (the row either doesn't exist
-- yet, or was seeded clean and the WHERE clause excludes it).
