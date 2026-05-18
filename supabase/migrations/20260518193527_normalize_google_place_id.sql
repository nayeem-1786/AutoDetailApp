-- Normalize double-encoded google_place_id in business_settings.
--
-- Root cause: a historical save path stored the Place ID as a double-encoded
-- JSON string (e.g. JSONB value `"\"ChIJ...\""`) — the inner JSON string
-- contains literal double-quote characters as part of the value. When the
-- google-reviews cron read this back, it constructed a request URL like
-- `?place_id=%22ChIJ...%22`, which Google's Place Details API rejected with
-- `INVALID_REQUEST: Invalid 'place_id' parameter.` causing the cron to 502
-- on every daily tick.
--
-- This migration unwraps the inner JSON encoding for the single known-bad
-- key (`google_place_id`). It is **idempotent**: rows whose JSONB value is
-- a JSON string without surrounding literal quote characters are not
-- matched by the WHERE clause, so re-running this migration on already-
-- clean data is a no-op.
--
-- Scope is intentionally narrow. The same drift could in principle affect
-- other text-valued business_settings rows, but production has only
-- confirmed `google_place_id`. Operators should run the diagnostic query
-- below against prod and report any additional affected keys before any
-- broader normalization migration is written:
--
--   SELECT key, value, length(value::text)
--   FROM business_settings
--   WHERE jsonb_typeof(value) = 'string'
--     AND value::text LIKE '"\"%\""';
--
-- The WHERE clause matches a JSONB string whose text representation begins
-- with `"\"` and ends with `\""` — i.e. an inner string with embedded
-- escaped quote characters. A clean JSON string `"ChIJ..."` has text
-- representation `"ChIJ..."` (no backslash) and is not matched.

UPDATE business_settings
SET value = to_jsonb(
      -- Strip exactly one matched pair of leading/trailing double-quote
      -- characters from the inner string. We use trim() with the quote
      -- character set because the bad data has the form `"\"ChIJ...\""`
      -- which decodes to the JS/Postgres string `"ChIJ..."` (literal quotes
      -- around the actual ID).
      trim(both '"' from (value #>> '{}'))
    ),
    updated_at = now()
WHERE key = 'google_place_id'
  AND jsonb_typeof(value) = 'string'
  AND value::text LIKE '"\"%\""';
