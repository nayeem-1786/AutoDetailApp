-- Idempotent backfill for coupon_type_enforcement JSONB double-encoding.
--
-- Bug: src/app/admin/settings/coupon-enforcement/page.tsx save handler
-- called JSON.stringify(mode) before Supabase upsert into the JSONB column
-- business_settings.value, causing immediate double-encoding on every save.
-- Cross-consumer drift compounded the issue:
--   * pos/coupons/validate/route.ts compensated with replace(/"/g, '') and
--     behaved correctly (hard-restricted coupons hard-blocked at apply time).
--   * pos/promotions/available/route.ts had NO compensation and silently
--     treated the deserialized `'"hard"'` shape (literal quote chars) as
--     a no-op enum value — `'"hard"' === 'hard'` is false, so the helper
--     fell through to soft-mode behavior and hard-restricted coupons
--     appeared as eligible in the promotions list under hard mode.
--
-- Additionally, the admin form's own LOAD logic short-circuited any value
-- that wasn't exactly `'hard'` (including the corrupt `'"hard"'`) back to
-- `'soft'`, causing every operator save of hard mode to auto-revert on
-- the next page reload — operators could not persistently set hard mode.
--
-- Code fix lands alongside this migration: the admin form passes the value
-- RAW (no JSON.stringify) and both POS consumers + the form's LOAD route
-- through a new canonical helper at src/lib/utils/coupon-enforcement.ts
-- with defensive double-encoding unwrap.
--
-- Production state at fix-time (verified via audit): the row was seeded
-- clean by 20260204000001_customer_type_and_promotions.sql with the JSON
-- literal `'"soft"'` (Postgres parses as JSONB string "soft"; Supabase
-- reads as JS string 'soft'). The corruption only manifested AFTER an
-- operator saved through the admin form. This migration is defensive —
-- normalizes any double-encoded form if present, idempotent if not.
--
-- Idempotent: re-running on already-clean rows is a no-op. The WHERE
-- clause matches only JSONB strings whose text representation has the
-- exact double-encoded shape `"\"...\""` (a JSONB string with literal
-- backslash-quote characters surrounding the inner value).
--
-- Mirror migration: 20260518225000_normalize_homepage_settings_double_encoding.sql.
-- Audit: docs/dev/AUDIT_VOICE_POLL_AND_COUPON_ENFORCEMENT_2026-05-19.md.

UPDATE business_settings
SET value = (value #>> '{}')::jsonb,
    updated_at = now()
WHERE key = 'coupon_type_enforcement'
  AND jsonb_typeof(value) = 'string'
  AND value::text LIKE '"\"%\""';

-- Post-deploy diagnostic — confirm the row is clean:
--
--   SELECT key, jsonb_typeof(value) AS type, length(value::text) AS text_len,
--          value::text AS preview
--   FROM business_settings
--   WHERE key = 'coupon_type_enforcement';
--
-- Expected post-migration:
--   * preview is exactly `"soft"` (6 chars) or `"hard"` (6 chars), NOT
--     `"\"soft\""` (10 chars) or `"\"hard\""` (10 chars).
--   * type = 'string' (clean JSONB string with the inner enum value).
