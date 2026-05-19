-- Backfill double-encoded JSONB values in business_settings for homepage keys.
--
-- Root cause: the PUT route at /api/admin/cms/homepage-settings called
-- JSON.stringify() on values before passing them to Supabase upsert into a
-- JSONB column. The Supabase JS client serializes for JSONB itself, so
-- pre-stringifying caused immediate double-encoding on every Save. A clean
-- Place ID `ChIJf7qNDhW1woAROX-FX8CScGE` stored as JSONB value::text length
-- 29 (`"ChIJf7qNDhW1woAROX-FX8CScGE"`); the double-encoded form stored at
-- length 33 (`"\"ChIJf7qNDhW1woAROX-FX8CScGE\""`).
--
-- Code fix: drop JSON.stringify in the PUT route handler (commit ships
-- alongside this migration).
--
-- This migration cleans up existing corrupted rows for the 11 PLAIN-STRING
-- homepage keys. The `value #>> '{}'` operator extracts the JSONB value as
-- text, stripping ONE level of JSON encoding. Casting back to jsonb
-- re-serializes the inner text cleanly.
--
-- Scope decisions:
--   1. Only the 11 plain-string homepage keys. `homepage_differentiators`
--      (the 12th key, array-typed) is INTENTIONALLY EXCLUDED — its
--      double-encoded form is a JSONB string containing JSON-array text
--      that does not match the strict `"\"...\""` pattern below. Including
--      it would require a separate WHERE branch (`'"[%]"'`) and was held
--      pending operator confirmation. After this code fix deploys,
--      `homepage_differentiators` self-heals on the next operator Save in
--      Admin > Website > Homepage (the fixed PUT writes a real JSONB array,
--      and the GET handler's defensive JSON.parse continues to deserialize
--      the legacy double-encoded form correctly until that Save happens).
--   2. Only rows whose JSONB type is `string` AND whose text representation
--      matches the double-encoded pattern `"\"...\""` (a JSONB string with
--      literal backslash-quote characters surrounding the inner value).
--      A cleanly-stored plain string has text representation `"X"` (no
--      backslash) and is NOT matched.
--
-- Idempotent: re-running on already-clean rows is a no-op (the WHERE clause
-- excludes them).
--
-- Mirror migration: 20260518193527_normalize_google_place_id.sql was the
-- narrow per-key version of this same fix shipped earlier today.
-- google_place_id is included again in the IN clause below for completeness
-- and idempotency (running both migrations is safe; the WHERE clause
-- excludes already-cleaned rows).

UPDATE business_settings
SET value = (value #>> '{}')::jsonb,
    updated_at = now()
WHERE key IN (
    'google_place_id',
    'homepage_cta_before_image',
    'homepage_cta_after_image',
    'homepage_team_heading',
    'homepage_credentials_heading',
    'homepage_hero_tagline',
    'homepage_cta_title',
    'homepage_cta_description',
    'homepage_cta_button_text',
    'homepage_services_description',
    'services_page_description'
  )
  AND jsonb_typeof(value) = 'string'
  AND value::text LIKE '"\"%\""';

-- Post-deploy diagnostic — operators can run to confirm the cleanup landed
-- and to surface any homepage_differentiators rows still requiring a Save:
--
--   SELECT key, jsonb_typeof(value) AS type, length(value::text) AS text_len,
--          left(value::text, 60) AS preview
--   FROM business_settings
--   WHERE key IN (
--     'homepage_differentiators',
--     'google_place_id',
--     'homepage_cta_before_image',
--     'homepage_cta_after_image',
--     'homepage_team_heading',
--     'homepage_credentials_heading',
--     'homepage_hero_tagline',
--     'homepage_cta_title',
--     'homepage_cta_description',
--     'homepage_cta_button_text',
--     'homepage_services_description',
--     'services_page_description'
--   )
--   ORDER BY key;
--
-- Expected post-migration: homepage_differentiators may still show
-- type='string' (legacy double-encoded array). Any other key showing
-- type='string' AND text_len significantly larger than its inner value's
-- length+2 has further drift requiring investigation.
