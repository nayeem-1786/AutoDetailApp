# SMS AI v2 Emergency Rollback

## Symptom: v2 is broken — customers receiving wrong/no replies on +14244010094

## Immediate rollback (one query, instant)

Run in Supabase SQL Editor against Smart Details DB (`zwvahzymzardmxixyfim`):

```sql
UPDATE public.business_settings
SET value = 'true'::jsonb, updated_at = NOW()
WHERE key = 'sms_ai_v2_kill_switch';
```

Effect: `shouldUseSmsAiV2()` short-circuits to `false` for ALL phones immediately on next inbound (kill_switch wins everything in `src/lib/sms-ai/feature-flag.ts:62`). Falls back to legacy v1 path at `src/app/api/webhooks/twilio/inbound/route.ts:536+`. No restart, no deploy needed.

## Verify rollback worked

```sql
SELECT key, value::text
FROM public.business_settings
WHERE key = 'sms_ai_v2_kill_switch';
```

Expected: `true`.

Then send a test SMS from a non-allowlisted phone. Should route to v1 (legacy behavior). Confirm in PM2 logs that `[SmsAiV2 routing]` does NOT fire and the legacy `getAIResponse()` path executes instead.

## Re-enable v2 after fix

```sql
UPDATE public.business_settings
SET value = 'false'::jsonb, updated_at = NOW()
WHERE key = 'sms_ai_v2_kill_switch';
```

## Alternative: revert the global flag without kill_switch

If kill_switch use feels heavy and the goal is just to re-restrict v2 back to the allowlist (rather than fully kill it), flip `sms_ai_v2_globally_enabled` back to `false`:

```sql
UPDATE public.business_settings
SET value = 'false'::jsonb, updated_at = NOW()
WHERE key = 'sms_ai_v2_globally_enabled';
```

Effect: v2 only routes for phones in `sms_ai_v2_enabled_phones` (allowlist). Other phones fall back to legacy v1. Useful if v2 is fine for the operator's own phone but broken for a specific edge case.

## Layer 5 phase timeline (context for rollback decisions)

- **Phase A (2026-06-17)** — flipped `sms_ai_v2_globally_enabled` to `true`. All inbound SMS routes through v2. v1 code path remains in source as fallback (unreachable on live traffic unless kill_switch fires).
- **Phase B (post-deploy monitoring)** — operator validates v2 behavior on non-allowlisted traffic. If anomaly: rollback per this runbook.
- **Phase C (pending)** — delete v1 code (`getAIResponse()`, `messaging-ai.ts`, legacy specialty-pivot block, `[AUTHORIZE_ADDON]` parse block, legacy 5-query customer-context block). After this, kill_switch still works but legacy code is gone — kill_switch becomes a no-op safety net. If a v2 issue surfaces post-Phase C, the rollback path narrows to "fix v2 and redeploy" (no more legacy fallback to flip to).
- **Phase D (pending)** — delete `staff_notification_inbound_specialty` SMS template (becomes orphaned after Phase C).

During Phase A/B, the kill_switch is the preferred rollback path because v1 is still in code and operational.
