# Webhook Receivers Identity Audit (post-Phase-0)

**Type:** Targeted audit (Memory #29 type 1) — descriptive, not prescriptive
**Scope:** Resolve the BLOCKED verdict from Phase 0.1 audit (`69b15b0f`) Target E.3 — identify what consumes `appointment_confirmed` / `appointment_completed` (and the rest of the `WebhookEvent` union) in production, and determine AC-5 / Session 1.5 unblock disposition.
**Audit date:** 2026-06-05
**Read-only:** No source / migration / test changes
**Memory #11:** Every architectural claim cites `file:line`

---

## Executive summary

**There is no webhook receiver in production.** `business_settings.n8n_webhook_urls` is seeded with all-`null` values at install (`supabase/migrations/20260201000040_booking_setup.sql`, `:expand` migration `20260203000006`). No admin UI exists to populate it — the only configuration path is direct DB write. Operator has confirmed Smart Details does not run n8n. Every `fireWebhook(event, payload, …)` call in the codebase therefore returns early at `src/lib/utils/webhook.ts:40` (`if (!url) return;`) because the JSONB lookup yields `null` for every event key. The 25 `fireWebhook` call sites across the codebase are effectively no-ops in current production state.

Customer-facing SMS notifications — including the operator-described "end job → SMS" flow — are fired **directly** via `sendSms()` from inline server handlers, not via the webhook chain. The webhook system is a parallel-dispatch layer that goes nowhere; the SMS chain operates independently and bypasses it entirely.

**Two real implications:**

1. **AC-5 / Session 1.5 verdict: UNBLOCKED.** The Phase 0.1 BLOCKED disposition assumed an external receiver existed and might be non-idempotent. With no receiver wired, re-firing `appointment_confirmed` (or any event) on a `confirmed → pending → confirmed` PATCH round-trip dispatches to `/dev/null`. The customer-duplicate-SMS scenario that gated Session 1.5 cannot occur via the webhook path. Session 1.5 (un-materialize cascade in PATCH for backward reverts) can proceed without source-side idempotency work.
2. **One feature silently dropped: waitlist notifications.** `src/app/api/appointments/[id]/cancel/route.ts:147-158` uses `fireWebhook('appointment_cancelled', { waitlist_notified: […] })` as the SOLE dispatch channel for notifying waitlisted customers when a slot opens — with no parallel direct `sendSms`. The in-source comment at `:147` literally says *"Webhook for n8n to handle actual SMS sending"*. With no n8n: notifications are written to `waitlist_entries.notified_at` (the row is marked notified) but no SMS reaches the customer. This is a behavioral gap distinct from the AC-5 question and is surfaced as a finding, NOT as a recommendation.

Session 1.7's conditional gate on `convertQuote`'s `appointment_confirmed` fire (`f87aca58`) remains correct — it prevents misleading events under any future receiver configuration, even if today's dispatch goes nowhere.

---

## Table of contents

1. [Target A — Fire site inventory](#target-a--fire-site-inventory)
2. [Target B — The webhook destination](#target-b--the-webhook-destination)
3. [Target C — End-job SMS flow trace](#target-c--end-job-sms-flow-trace)
4. [Target D — Idempotency at the receiver](#target-d--idempotency-at-the-receiver)
5. [Target E — Event consumer matrix](#target-e--event-consumer-matrix)
6. [Target F — AC-5 / Session 1.5 verdict](#target-f--ac-5--session-15-verdict)
7. [File:line reference index](#fileline-reference-index)

---

## Target A — Fire site inventory

Every non-test `fireWebhook()` call in the codebase, with event name, file:line, and trigger condition. 25 call sites total across 14 files.

| # | File:line | Event | Trigger condition |
|---|---|---|---|
| 1 | `src/app/api/book/route.ts:917` | `booking_created` | Always (post-INSERT, public booking) |
| 2 | `src/app/api/book/route.ts:923` | `appointment_confirmed` | Conditional — only when `initialStatus === 'confirmed'` (i.e. `data.payment_intent_id` present); the AC-11 anchor (`:559`) |
| 3 | `src/app/api/appointments/[id]/route.ts:141` | `appointment_confirmed` | Conditional — admin PATCH; only when status transitions to `'confirmed'` (`:140`) |
| 4 | `src/app/api/appointments/[id]/route.ts:145` | `appointment_completed` | Conditional — admin PATCH; only when status transitions to `'completed'` (`:144`) |
| 5 | `src/app/api/appointments/[id]/route.ts:153` | `appointment_rescheduled` | Conditional — admin PATCH; only on date or time change (`:152`) |
| 6 | `src/app/api/appointments/[id]/cancel/route.ts:100` | `appointment_cancelled` | Always (admin cancel) — paired with direct `sendCancellationNotifications` at `:95` |
| 7 | `src/app/api/appointments/[id]/cancel/route.ts:148` | `appointment_cancelled` | Conditional — only when waitlist feature flag enabled AND waitlist matches exist (`:114-159`); **sole dispatch channel** for waitlist customer SMS (no parallel direct `sendSms`) |
| 8 | `src/app/api/appointments/[id]/notify/route.ts:360` | `appointment_confirmed` | Always at function end — admin "Send confirmation" button; paired with inline SMS/email dispatch |
| 9 | `src/app/api/pos/appointments/[id]/route.ts:341-345` | `appointment_confirmed` | Conditional — POS PATCH; status transition to `'confirmed'` (`:340`) |
| 10 | `src/app/api/pos/appointments/[id]/route.ts:347-351` | `appointment_completed` | Conditional — POS PATCH; status transition to `'completed'` (`:346`) |
| 11 | `src/app/api/pos/appointments/[id]/route.ts:356-370` | `appointment_rescheduled` | Conditional — POS PATCH; date or time change (`:355`) |
| 12 | `src/app/api/pos/appointments/[id]/cancel/route.ts:132-143` | `appointment_cancelled` | Conditional — only when operator checks `notify_customer=true` (`:127`); paired with direct `sendCancellationNotifications` at `:128` |
| 13 | `src/app/api/pos/appointments/[id]/notify/route.ts:345` | `appointment_confirmed` | Always at function end — POS "Send confirmation"; paired with inline SMS dispatch |
| 14 | `src/app/api/waitlist/[id]/route.ts:80` | `appointment_cancelled` | Conditional — only on waitlist status transition to `'notified'` |
| 15 | `src/app/api/quotes/[id]/accept/route.ts:78` | `quote_accepted` | Always (post-status-update on customer accept) |
| 16 | `src/app/api/customer/appointments/[id]/cancel/route.ts:95` | `appointment_cancelled` | Always (customer-portal cancel); paired with direct `sendCancellationNotifications` at `:90` |
| 17 | `src/app/api/marketing/campaigns/[id]/send/route.ts:476` | `campaign_send` | Always (manual campaign-send dispatch) |
| 18 | `src/app/api/marketing/campaigns/process-scheduled/route.ts:321` | `campaign_send` | Always (cron-scheduled campaign-send dispatch) |
| 19 | `src/app/api/voice-agent/appointments/route.ts:610-638` | `booking_created` | Always (post-INSERT, voice-agent direct branch); payload tagged `source: 'voice_agent'` |
| 20 | `src/app/api/voice-agent/quotes/route.ts:303` | `quote_created` | Conditional — only when SMS-send branch fires (verified below; see C.3) |
| 21 | `src/lib/quotes/quote-service.ts:233` | `quote_created` | Always (shared quote-creation primitive used by POS, voice-agent, SMS agent) |
| 22 | `src/lib/quotes/send-service.ts:439` | `quote_sent` | Always (post quote-send) |
| 23 | `src/lib/quotes/convert-service.ts:256` | `appointment_confirmed` | **Conditional (post-Session 1.7, `f87aca58`)** — gated on `appointment.status === 'confirmed'` (`:255`). Pre-1.7 was unconditional |

Plus 2 internal/utility lines:
- `src/lib/utils/webhook.ts:20` (the helper definition itself)
- `src/app/api/pos/appointments/[id]/cancel/route.ts:39` (docstring reference, not a fire site)

**Notable absences (events declared but never fired):**

- `lifecycle_rule_trigger` (declared at `src/lib/utils/webhook.ts:12`) has no call site in the codebase — declared-but-unused.
- `appointment_completed` is **never** fired from `POST /api/pos/jobs/[id]/complete` (the operator-described "End Job" path) — see Target C.

---

## Target B — The webhook destination

### B.1 — URL resolution

`fireWebhook` resolves the destination URL via Supabase query at `src/lib/utils/webhook.ts:27-31`:

```typescript
const { data: setting } = await client
  .from('business_settings')
  .select('value')
  .eq('key', 'n8n_webhook_urls')
  .single();
```

Then at `:35-40`:

```typescript
const urls = (typeof setting.value === 'string'
  ? JSON.parse(setting.value)
  : setting.value) as Record<string, string | null>;

const url = urls[event];
if (!url) return;
```

**No environment variable.** No `WEBHOOK_URL`, no `N8N_WEBHOOK_URL`, no `WEBHOOK_ENDPOINT` exists in the env reads anywhere in the codebase (verified via `grep -rln "WEBHOOK_URL\|webhook_url\|WEBHOOK_ENDPOINT" src/ .env.example` — only matches are the three webhook handler files for Twilio and the `webhook.ts` helper itself).

**No config file fallback.** The function is DB-driven only; no `process.env` reference for URL anywhere in `webhook.ts`.

### B.2 — What's at the URL?

**Production state: no destination is configured.** Two pieces of evidence:

1. **Seed migration `supabase/migrations/20260201000040_booking_setup.sql`** writes the initial row with all-null URL values:
   ```sql
   INSERT INTO business_settings (key, value, description)
   VALUES (
     'n8n_webhook_urls',
     '{
       "booking_created": null,
       "booking_status_changed": null
     }'::jsonb,
     'n8n webhook URLs for workflow automation. Set via admin or directly in DB.'
   )
   ON CONFLICT (key) DO NOTHING;
   ```

2. **Expansion migration `supabase/migrations/20260203000006_expand_webhook_events.sql`** merges additional event keys via `value || '{"quote_created":null, …, "appointment_completed":null}'::jsonb` — also all-`null`:
   ```sql
   SET value = value || '{"quote_created":null,"quote_sent":null,"quote_accepted":null,
                           "appointment_confirmed":null,"appointment_cancelled":null,
                           "appointment_rescheduled":null,"appointment_completed":null}'::jsonb
   WHERE key = 'n8n_webhook_urls';
   ```

3. **No admin UI surfaces this setting.** Searched `src/app/admin/**` for any `n8n` or `webhook_url` reference (`grep -rln "n8n\|webhook_url\|fireWebhook" src/app/admin`) — zero matches. The settings sidebar pages (`src/app/admin/settings/*/page.tsx`, 15 surfaces) contain no webhook configuration UI. The setting can only be populated by direct SQL.

4. **Operator confirmation:** Smart Details does NOT use n8n. The setting remains at its seeded all-null state.

**Consequence:** for every `fireWebhook(event, …)` call, `urls[event]` is `null`, and `webhook.ts:40` returns immediately. **No HTTP request is ever made.** The 25 fire sites are silently no-op in production.

The setting's `description` field (`'Set via admin or directly in DB.'`) was written with admin-UI intent that was never implemented — a known gap.

### B.3 — Authentication on the (non-existent) destination

The `fetch` call at `webhook.ts:42-47` sends `Content-Type: application/json` only — **no Authorization header**, no HMAC signature header, no API key, no Bearer token. The payload is sent as raw POST body with no source-side authentication.

```typescript
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(10_000),
});
```

Were a destination ever wired, the recipient would need to either: (a) accept unauthenticated POSTs (and rely on URL obscurity), or (b) be augmented at the source side to add auth — neither is in place today.

The 10-second `AbortSignal.timeout` is the only client-side guard.

---

## Target C — End-job SMS flow trace

The operator-described workflow: *"while the detailer is working on the vehicle and finishes the service and clicks end job or whatever button to end the service, then a SMS notification is triggered and sent to the customer."*

### C.1 — Button → endpoint trace

**Button site:** `src/app/pos/jobs/components/job-detail.tsx` ("Mark Complete" button — full UI not inspected; the audit traces the server-side handler).

**Endpoint:** `POST /api/pos/jobs/[id]/complete` at `src/app/api/pos/jobs/[id]/complete/route.ts:20-133`.

**Server-side actions in order:**

1. POS HMAC auth check (`:26-29`) via `authenticatePosRequest`.
2. Fetch job with customer + vehicle + assigned employee (`:35-44`).
3. Refuse if `job.status !== 'in_progress'` (`:50-55`).
4. Compute final timer seconds, accumulating any running elapsed (`:57-65`).
5. Generate `gallery_token` (UUID v4) for the customer photo-gallery link (`:68`).
6. Auto-select or apply featured photos (`:71-82`).
7. **`UPDATE jobs SET status = 'completed', work_completed_at, timer_seconds, gallery_token` (`:85-103`).** Critical: this writes ONLY to `jobs.status`. `appointments.status` is **NOT** modified.
8. Audit log row (`:110-121`).
9. Fire-and-forget `sendCompletionNotifications(supabase, updatedJob, galleryToken)` (`:124`).
10. Return 200 with updated job.

**`fireWebhook` is NOT called.** No event from the `WebhookEvent` union is dispatched. The `appointment_completed` event in particular is never fired from this path (the lifecycle gap noted in Target A's "Notable absences").

### C.2 — The SMS the customer receives

The SMS is dispatched by `sendCompletionNotifications` at `:207-263` in the same file:

1. Build vehicle display strings (`:232-237`).
2. Build customer-facing gallery link (`createShortLink` at `:226`, fallback to full URL).
3. **Render SMS template** at `:243-253` via `renderSmsTemplate('job_complete', { first_name, vehicle_description, gallery_link, hours_line, last_name }, smsFallback)`.
4. **Send SMS directly** at `:256-262` via `sendSms(customer.phone, smsResult.body, { logToConversation: true, customerId, notificationType: 'job_complete', contextId: job.id })`.

The template `job_complete` is stored as a row in the `sms_templates` DB table (template engine architecture per CLAUDE.md Rule 9 / Session 2A). The render fallback at `:241` provides a hardcoded prose string if the template is disabled (e.g., template_isActive=false).

The `sendSms` helper (per CLAUDE.md Rule 9) is the canonical Twilio dispatcher; it normalizes the recipient phone to E.164 and refuses self-sends (Session #139 chokepoint).

### C.3 — Webhook vs direct dispatch

**Verdict: (b) Direct — button → server handler → SMS template → Twilio (no webhook).**

Evidence:
- `POST /api/pos/jobs/[id]/complete` does not import `fireWebhook` (verified — no import line in `route.ts:1-13`).
- `sendCompletionNotifications` calls `sendSms` directly (`:256-262`); no webhook dispatch.
- The webhook event `appointment_completed` (the closest semantic match in the union) is fired by `POST /api/pos/appointments/[id]` PATCH at `:347` and `POST /api/appointments/[id]` PATCH at `:145` — both only when the operator explicitly transitions `appointment.status='completed'` via an appointment-status PATCH. Per the Phase 0 lifecycle audit (`2293fb3d`), job completion does NOT cascade to appointment status (Target D.3, AC-1 status independence). So in practice the `appointment_completed` event is only fired when the operator manually changes appointment status, which is divorced from the job-completion workflow.

**Conclusion:** the "end job → customer SMS" flow operates entirely through the direct `sendSms` path. Even if a webhook receiver were wired today, it would not receive any signal corresponding to this workflow.

The same direct-dispatch pattern applies to every other customer-facing SMS in the codebase:
- Booking confirmation: `book/route.ts:1003` (`sendSms` via `renderSmsTemplate('booking_confirmed', …)`)
- Appointment cancellation: `src/lib/email/send-cancellation-email.ts:200` (`sendSms`, called from cancel routes)
- Voice-agent appointment confirmation: `voice-agent/appointments/route.ts:346` (inline `sendSms`)
- Job-addon authorizations: `src/lib/services/job-addons.ts` (canonical `sendSms`)
- All transactional templates per CLAUDE.md Rule 9's SMS template engine

The webhook system is a **parallel-dispatch broadcast layer**, not a customer-comms channel. Every customer-facing message bypasses it.

---

## Target D — Idempotency at the receiver

The Phase 0.1 audit's BLOCKED verdict assumed a receiver existed that might (a) re-process the same payload non-idempotently and (b) cascade to customer-facing duplicates. With B.2's finding that no receiver is configured:

### D.1 — Idempotency at the (non-existent) receiver

**Not applicable.** No receiver is wired; no payload is processed; idempotency-at-receiver is a vacuous property. Re-firing the same `appointment_confirmed` payload N times has the same downstream effect as firing it once: zero HTTP requests, zero downstream side effects, zero customer impact.

### D.2 — Idempotency at the source side

For completeness, the source-side has **no** deduplication infrastructure:

- `fireWebhook` payload at `webhook.ts:42-47` carries the original `payload` object plus whatever the caller injected (`event` literal, `timestamp`, `appointment.id`).
- No `webhook_id`, `idempotency_key`, `attempt_count`, or stable cross-call deduplication token is added by the helper or any of the 25 callers.
- Each fire site composes its own payload shape ad-hoc; there is no shared envelope schema.

This is unchanged by Session 1.7 — the gate at `convert-service.ts:255` does not add deduplication; it adds a status-conditional that prevents semantic-mismatch firing.

### D.3 — Re-fire scenarios that were "BLOCKED" in Phase 0.1

The four re-fire sources enumerated in Phase 0.1 Target E.3 are confirmed (file:line stable):

1. `convertQuote` (pre-1.7 unconditional; post-1.7 conditional at `convert-service.ts:255`)
2. `book/route.ts:921-929` (already conditional pre-Session 1.7)
3. Lifecycle-engine cron (`/api/cron/lifecycle-engine`) — not re-inspected in this audit, but per the cron table in CLAUDE.md it runs every 10 minutes and is a known re-fire source
4. Future Session 1.5 `confirmed → pending → confirmed` PATCH round-trips

All four route their (non-existent) re-fires to /dev/null via the all-null URL configuration. **None can produce duplicate customer SMS through the webhook chain** because the chain terminates at `webhook.ts:40` with `if (!url) return;`.

### D.4 — The waitlist-notification exception

`src/app/api/appointments/[id]/cancel/route.ts:147-158` is the ONLY case where the webhook fire is the SOLE dispatch channel for a customer-facing message:

```typescript
// Webhook for n8n to handle actual SMS sending
fireWebhook('appointment_cancelled', {
  appointment_id: id,
  date: apptDetail.scheduled_date,
  waitlist_notified: waitlistMatches.map((w) => ({ … })),
}, supabase).catch((err) => …)
```

The in-source comment makes the intent explicit — the receiver was designed to send the actual SMS. Adjacent (`:140-145`) the code does write `waitlist_entries.status='notified'` and `notified_at=now()`, marking the entry as notified from the DB perspective. But no parallel `sendSms` is called.

**Behavioral consequence:** with no n8n configured, waitlisted customers are marked notified in the DB but receive no SMS. The next admin/operator surface that reads `waitlist_entries.status='notified'` will see "notified" rows that were never actually contacted.

This is distinct from the AC-5 question (the re-fire concern). The waitlist gap is a **silent-feature-failure** finding surfaced here per Memory #29 type 1 (targeted-scope; document don't fix). The lifecycle audits and Phase 0 work did not catch this because they focused on appointment-status flows.

---

## Target E — Event consumer matrix

| Event | Fire sites (file:line) | Configured URL? | Receiver | Downstream effect | Idempotent? |
|---|---|---|---|---|---|
| `booking_created` | `book/route.ts:917`, `voice-agent/appointments/route.ts:610` | No (`urls['booking_created'] = null`) | None | Zero | N/A (no receiver) |
| `quote_created` | `quote-service.ts:233`, `voice-agent/quotes/route.ts:303` | No | None | Zero | N/A |
| `quote_sent` | `send-service.ts:439` | No | None | Zero | N/A |
| `quote_accepted` | `quotes/[id]/accept/route.ts:78` | No | None | Zero | N/A |
| `appointment_confirmed` | `book/route.ts:923`, `appointments/[id]/route.ts:141`, `appointments/[id]/notify/route.ts:360`, `pos/appointments/[id]/route.ts:341-345`, `pos/appointments/[id]/notify/route.ts:345`, `convert-service.ts:256` (gated) | No | None | Zero | N/A |
| `appointment_cancelled` | `appointments/[id]/cancel/route.ts:100`, `appointments/[id]/cancel/route.ts:148` (waitlist), `pos/appointments/[id]/cancel/route.ts:132-143`, `waitlist/[id]/route.ts:80`, `customer/appointments/[id]/cancel/route.ts:95` | No | None | Zero (customer cancel SMS comes from direct `sendCancellationNotifications`; waitlist SMS does NOT — D.4 gap) | N/A |
| `appointment_rescheduled` | `appointments/[id]/route.ts:153`, `pos/appointments/[id]/route.ts:356-370` | No | None | Zero | N/A |
| `appointment_completed` | `appointments/[id]/route.ts:145`, `pos/appointments/[id]/route.ts:347-351` | No | None | Zero (and the actual job-complete flow doesn't fire this anyway — C.3) | N/A |
| `campaign_send` | `marketing/campaigns/[id]/send/route.ts:476`, `marketing/campaigns/process-scheduled/route.ts:321` | No | None | Zero | N/A |
| `lifecycle_rule_trigger` | (declared but never fired — Target A "Notable absences") | No | None | Zero | N/A |

**Cross-event observation:** every customer-facing notification path identified in the codebase has a parallel direct-dispatch (`sendSms` / `sendCancellationNotifications` / `sendTemplatedEmail`) that operates independently of `fireWebhook`. The single exception is the waitlist case in D.4.

---

## Target F — AC-5 / Session 1.5 verdict

**Verdict: UNBLOCKED.**

Restating the AC-5 / Session 1.5 gate from `QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:355`: *"Phase 0.1 audit verifies n8n receiver idempotency for `appointment_confirmed` and `appointment_completed` webhooks. If receiver is not idempotent, opening MEDIUM transitions (currently 8 per consequence map) requires source-side idempotency guards added before loosening proceeds."*

The gate was conditional on a receiver existing. **No receiver exists**, so:

- Opening `confirmed → pending` (Session 1.5 transition #1) and `in_progress → pending` (Session 1.5 transition #2) cannot cause customer-facing duplicate SMS via the webhook chain, because the webhook chain terminates with no HTTP request at `webhook.ts:40`.
- A `confirmed → pending → confirmed` operator round-trip will fire `appointment_confirmed` twice (once per `confirmed` arrival). Both fires dispatch to nowhere. No customer impact.
- Session 1.5's PATCH-side `executeUnMaterialize` cascade (the actual structural change) is unaffected by the webhook question — it operates on the `jobs` table directly per `lifecycle-sync.ts:208-368` (per Phase 0 materialization audit).

**Session 1.5 may proceed without source-side idempotency work** for the webhook concern specifically. (Other Session 1.5 considerations — DB integrity of the un-materialize cascade, dialog UX, audit log entries — are not addressed here and remain in scope of the session itself.)

**Forward-looking caveat (NOT a recommendation):** if Smart Details ever wires a receiver (n8n or any other automation platform), the source side will lack deduplication tokens (D.2) and Session 1.5's re-fires would then become real. At that point a paired source-side idempotency-key insertion + receiver-side dedup gate would need to be designed. This audit does NOT prescribe that work; it surfaces the dependency for the future operator decision.

---

## File:line reference index

### Webhook infrastructure

- `src/lib/utils/webhook.ts:3-13` — `WebhookEvent` union (10 events)
- `src/lib/utils/webhook.ts:20-52` — `fireWebhook` implementation
- `src/lib/utils/webhook.ts:27-31` — DB URL lookup via `business_settings.n8n_webhook_urls`
- `src/lib/utils/webhook.ts:40` — early-return when URL is `null` (the production-state no-op gate)
- `src/lib/utils/webhook.ts:42-47` — fetch dispatch (Content-Type only, no auth header)

### Seed + expansion migrations

- `supabase/migrations/20260201000040_booking_setup.sql` — initial seed `n8n_webhook_urls` with `booking_created: null`, `booking_status_changed: null`
- `supabase/migrations/20260203000006_expand_webhook_events.sql` — expansion adding 7 more event keys, all `null`

### Operator-described "End Job" flow

- `src/app/api/pos/jobs/[id]/complete/route.ts:20-133` — POST handler
- `src/app/api/pos/jobs/[id]/complete/route.ts:88` — `UPDATE jobs SET status = 'completed'` (jobs only, no appointment cascade)
- `src/app/api/pos/jobs/[id]/complete/route.ts:124` — `sendCompletionNotifications` invocation (fire-and-forget)
- `src/app/api/pos/jobs/[id]/complete/route.ts:207-263` — `sendCompletionNotifications` body
- `src/app/api/pos/jobs/[id]/complete/route.ts:243-253` — `renderSmsTemplate('job_complete', …)` render
- `src/app/api/pos/jobs/[id]/complete/route.ts:256-262` — direct `sendSms` dispatch (Twilio)
- `src/app/api/pos/jobs/[id]/complete/route.ts:1-13` — imports — NO `fireWebhook` import; webhook chain is not involved

### Direct dispatch helpers (canonical SMS path)

- `src/lib/utils/sms.ts` — `sendSms` canonical helper (per CLAUDE.md Rule 9)
- `src/lib/email/send-cancellation-email.ts:200` — direct `sendSms` for cancellations
- `src/lib/email/send-templated-email.ts` — email render+send canonical helper
- `src/lib/sms/render-sms-template.ts` — template render
- `src/app/api/book/route.ts:1003` — direct `sendSms` for booking confirmation
- `src/app/api/voice-agent/appointments/route.ts:346` — direct `sendSms` for voice-agent confirmation

### Waitlist silent-failure gap (D.4)

- `src/app/api/appointments/[id]/cancel/route.ts:110-161` — waitlist notification block
- `src/app/api/appointments/[id]/cancel/route.ts:140-145` — `waitlist_entries.status='notified'`, `notified_at=now()` DB writes
- `src/app/api/appointments/[id]/cancel/route.ts:147-158` — `fireWebhook('appointment_cancelled', { waitlist_notified: […] })` — sole dispatch channel
- `src/app/api/appointments/[id]/cancel/route.ts:147` — in-source comment: *"Webhook for n8n to handle actual SMS sending"*
- No parallel `sendSms` for waitlist customers in this block (verified by reading `:110-161` in full)

### AC-5 / Session 1.5 anchors

- `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:336-360` — AC-5 commitment
- `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:355` — pre-task: "Phase 0.1 audit verifies n8n receiver idempotency"
- `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:833-879` — Session 1.5 (un-materialize cascade in PATCH)
- `src/lib/appointments/lifecycle-sync.ts:208-368` — `executeUnMaterialize` (the structural primitive Session 1.5 wires)
- `src/lib/appointments/status-transitions.ts:15-22` — `STATUS_TRANSITIONS` map (Session 1.5 adds `confirmed → pending` and `in_progress → pending`)

### Phase 0 audits this resolves

- `docs/dev/SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md` (Phase 0.1, `69b15b0f`) Target E.3 — BLOCKED verdict that this audit unblocks
- `docs/dev/APPOINTMENT_STATUS_PER_TRANSITION_CONSEQUENCE_MAP.md` (`d3671c82`) — Target E: state-machine transitions classified as SAFE/MEDIUM/HIGH; MEDIUM tier required the receiver-idempotency answer

---

**END OF DOCUMENT — Webhook Receivers Identity audit**

*Next action: operator reviews findings. AC-5 / Session 1.5 unblocked. Waitlist gap (D.4) is a surfaced finding, not a recommendation — operator decides whether to fix (e.g., add a parallel direct `sendSms` to the waitlist block) or leave deferred until the broader webhook-receiver architecture decision lands.*
