-- SMS AI v2 — feature-flag settings (Layer 1+2 foundation).
--
-- Adds three keys to business_settings that the v2 SMS routing layer (Layer 4)
-- will consult to decide whether an inbound SMS goes to the legacy single-shot
-- responder (current default) or the new tool-using Anthropic agent.
--
--   sms_ai_v2_kill_switch       BOOLEAN — when true, ALWAYS route to legacy
--                                regardless of other flags. Wins everything.
--   sms_ai_v2_enabled_phones    TEXT[]  — E.164 allowlist of customer phones.
--                                Inbound from these numbers routes to v2 even
--                                when globally_enabled is false.
--   sms_ai_v2_globally_enabled  BOOLEAN — when true, all inbound (except those
--                                gated by kill_switch) routes to v2.
--
-- Safe default state on a fresh install: all three are absent / falsy, so
-- shouldUseSmsAiV2() in src/lib/sms-ai/feature-flag.ts returns false. Legacy
-- behavior preserved.
--
-- This migration is idempotent — ON CONFLICT (key) DO NOTHING guarantees that
-- re-running it on an environment that already has these keys is a no-op,
-- preserving any operator-configured allowlist between deploys.

INSERT INTO business_settings (key, value, description, updated_at)
VALUES
  (
    'sms_ai_v2_kill_switch',
    'false'::jsonb,
    'SMS AI v2 emergency kill switch. When true, all inbound SMS routes to the legacy single-shot responder regardless of allowlist or global toggle. Use to instantly disable v2 in case of agent-loop incident.',
    now()
  ),
  (
    'sms_ai_v2_enabled_phones',
    '[]'::jsonb,
    'SMS AI v2 per-phone allowlist (E.164). Phones in this array route to v2 even when sms_ai_v2_globally_enabled is false. Used for staged rollout (e.g., owner-only testing before global enable).',
    now()
  ),
  (
    'sms_ai_v2_globally_enabled',
    'false'::jsonb,
    'SMS AI v2 global toggle. When true, all inbound SMS routes to v2 (subject to kill_switch). When false, only allowlisted phones route to v2.',
    now()
  )
ON CONFLICT (key) DO NOTHING;
