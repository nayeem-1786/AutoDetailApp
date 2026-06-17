-- 2026-06-17 — SMS AI v2 Layer 5 Phase A — flip global flag to true.
--
-- Pre-flip state (verified 2026-06-17 ~22:00 PST via operator SQL):
--   sms_ai_v2_kill_switch       = false  (unchanged)
--   sms_ai_v2_enabled_phones    = ["+13107564789","+14243396994","+13103101445"]  (unchanged; now redundant, harmless)
--   sms_ai_v2_globally_enabled  = false  → true  (this migration)
--
-- After this UPDATE, shouldUseSmsAiV2() returns true for every phone (except
-- when the kill_switch is later flipped). The legacy v1 path in
-- src/app/api/webhooks/twilio/inbound/route.ts:536+ becomes unreachable on
-- live traffic; v1 code deletion is deferred to Layer 5 Phase C.
--
-- Rollback (instant, no deploy required — see docs/dev/SMS_AI_V2_ROLLBACK.md):
--   UPDATE public.business_settings
--   SET value = 'true'::jsonb, updated_at = NOW()
--   WHERE key = 'sms_ai_v2_kill_switch';
-- OR:
--   UPDATE public.business_settings
--   SET value = 'false'::jsonb, updated_at = NOW()
--   WHERE key = 'sms_ai_v2_globally_enabled';
--
-- Idempotent: WHERE clause only matches when value is still 'false', so
-- re-running this migration on an environment that already flipped (e.g., a
-- Phase B-running env that's been re-seeded) is a no-op.

UPDATE public.business_settings
SET value = 'true'::jsonb,
    updated_at = NOW()
WHERE key = 'sms_ai_v2_globally_enabled'
  AND value = 'false'::jsonb;
