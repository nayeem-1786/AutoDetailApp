# SMS AI v2 Emergency Rollback

## Symptom: v2 is broken — customers receiving wrong/no replies on +14244010094

> **⚠ Post-Phase-C semantics (2026-06-18 onward):** the legacy v1 single-shot responder has been deleted from the codebase. `kill_switch=true` no longer routes to v1 — it routes to **no AI reply at all**. The customer's inbound is stored in `messages` (operator sees it in the admin inbox) but no automated response is sent. Manual inbox response is the fallback. See "Phase C update — kill_switch behavior change" below before using kill_switch as a rollback strategy.

## Immediate rollback (one query, instant)

Run in Supabase SQL Editor against Smart Details DB (`zwvahzymzardmxixyfim`):

```sql
UPDATE public.business_settings
SET value = 'true'::jsonb, updated_at = NOW()
WHERE key = 'sms_ai_v2_kill_switch';
```

Effect (post-Phase-C): `shouldUseSmsAiV2()` short-circuits to `false` for ALL phones immediately on next inbound (kill_switch wins everything in `src/lib/sms-ai/feature-flag.ts:62`). The webhook's `if (shouldUseSmsAiV2(...))` branch does NOT enter; the v2Err catch path returns the same way; the route returns TwiML 200 without dispatching the v2 agent. **No AI reply is generated.** v1 was deleted in Phase C — there is no longer a fallback path in code. Customer's inbound is still INSERTed into `messages` (operator sees it in admin Messaging inbox); the operator must respond manually until the underlying v2 issue is fixed.

## Verify rollback worked

```sql
SELECT key, value::text
FROM public.business_settings
WHERE key = 'sms_ai_v2_kill_switch';
```

Expected: `true`.

Then send a test SMS from a non-allowlisted phone. Post-Phase-C, the expected behavior is **no AI reply** — verify the customer's inbound was stored (admin Messaging inbox shows the new conversation) and that no `messages` row with `sender_type='ai'` was inserted in the past few minutes for that conversation. PM2 logs should show that `[SmsAiV2] event=routing decision=v2` did NOT emit (kill_switch short-circuited the routing decision before the v2 dispatch fire). Layer 6 (Session #154) — pre-Layer-6 this line was `[SmsAiV2 routing] conv=... phone=... → v2`; same semantics, new structured shape. Grep target for verification: `grep -E '\[SmsAiV2\] event=routing'` on the PM2 tail.

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

Effect (post-Phase-C): v2 only routes for phones in `sms_ai_v2_enabled_phones` (allowlist). Other phones receive no AI reply (no v1 fallback exists). Useful if v2 is broken for most traffic but a specific allowlisted phone still needs to test fixes.

## Phase C update — kill_switch behavior change (2026-06-18)

**Pre-Phase-C:** `kill_switch=true` routed all phones to the v1 legacy `getAIResponse()` responder. Rollback was instant + transparent — customers got SMS replies from v1's older prompt.

**Post-Phase-C:** v1 has been deleted from the codebase. `kill_switch=true` routes all phones to **no AI reply at all**. Customers' inbounds are stored (admin Messaging inbox shows them) but the operator must respond manually. This is worse than pre-Phase-C from a customer-experience perspective, so kill_switch should only be used for genuine "v2 is producing wrong replies and any reply is worse than no reply" emergencies, NOT for routine v2-issue investigation.

If a v2 problem surfaces post-Phase-C, the preferred rollback path is now:

### True rollback (v2 has shipped a regression)

1. **Identify the offending commit.** Most v2 regressions ship via prompt changes (DB row at `business_settings.messaging_ai_instructions`) or system-prompt code in `src/lib/sms-ai/system-prompt.ts`.
2. **For prompt-only regressions** (operator edited the textarea in admin > Settings > Messaging and broke v2): revert by clicking "Apply Standard Template" in the admin UI + Save. This restores `messaging_ai_instructions` to `getStandardTemplate()` from code. Instant. No deploy.
3. **For code regressions in the v2 system prompt or runner:** `git revert <offending commit>` + `time deploy-smartdetails`. After deploy, optionally SQL-restore `messaging_ai_instructions` to a known-good snapshot if the operator had previously customized the prompt:
   ```sql
   UPDATE public.business_settings
   SET value = '<known-good JSONB string>'::jsonb,
       updated_at = NOW()
   WHERE key = 'messaging_ai_instructions';
   ```
   The snapshot of the v1-default body (6,549 bytes) is preserved in git history at the Phase C migration `supabase/migrations/20260618190500_seed_messaging_ai_instructions_v2.sql` (its diff replaces v1's bytes with v2's). Snapshots of operator customizations should be captured BEFORE running any prompt-overwriting migration (Phase C's migration logs a warning about this in its header).
4. **For Anthropic API outages or transient v2 errors:** kill_switch is still the right tool. The "no AI reply" outcome is worse than legacy v1 was, but the operator manual-inbox surface is functional and Anthropic outages are typically <1 hour.

## Layer 5 phase timeline (context for rollback decisions)

- **Phase A (2026-06-17)** — flipped `sms_ai_v2_globally_enabled` to `true`. All inbound SMS routes through v2. v1 code path remained in source as fallback (unreachable on live traffic unless kill_switch fires).
- **Phase B (2026-06-17 → 2026-06-18, ~13 hours)** — operator-driven post-deploy monitoring. 10 AI replies validated on non-allowlisted traffic, zero anomalies. Green-lit Phase C.
- **Phase C (2026-06-18)** — deleted v1 code (`getAIResponse()`, `messaging-ai.ts`, `messaging-ai-prompt.ts`, legacy specialty-pivot block, `extractAddonActions` markup-block parser, legacy 5-query customer-context block, send-auto-reply chunking). Soft-deleted `sms_templates.staff_notification_inbound_specialty` (Concern E). Wired admin textarea to v2 runtime via DB-first `buildV2SystemPrompt`. **Kill_switch semantics changed**: now means "no AI reply" rather than "fall back to v1" — see Phase C update above.
- **Phase D (folded into Phase C)** — `staff_notification_inbound_specialty` removed from sms-contracts source + generated palette + soft-deleted at DB.

Post-Phase-C, the kill_switch remains the fastest rollback for "v2 is broken and any reply is worse than no reply" cases. For "v2 made a wrong decision" cases, the operator's manual inbox in admin > Messaging is the canonical recovery surface.
