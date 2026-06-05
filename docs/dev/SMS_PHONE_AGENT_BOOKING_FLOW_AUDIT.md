# SMS / Phone Agent Booking Flow — Architecture Audit

**Type:** Component Behavior (current-state) — descriptive, not prescriptive
**Scope:** Phase 0.1 of the locked QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE plan (v1.0, 2026-06-04) — gate for AC-11 (Pending vs Confirmed semantic enforcement across the three booking paths)
**Audit date:** 2026-06-05
**Read-only:** No source / migration / test changes
**Memory #11:** Every architectural claim cites `file:line`
**Memory #29 type 3:** No fix recommendations; no operator-decision pre-resolution

---

## Executive summary

Smart Details has **four** appointment-creation paths in production, not three: online booking (`/api/book`), legacy SMS AI v1 (the `[GENERATE_QUOTE]`-block path in the Twilio inbound webhook), SMS AI v2 (the tool-use agent dispatched fire-and-forget from the same Twilio webhook), and the Phone agent (Tom on ElevenLabs). The SMS AI v2 and Phone agent share the same backing tool surface (`/api/voice-agent/*`, 13 endpoints) — the two agents are configured separately at the LLM layer but converge on the same server-side primitives. Online booking is the **only** path that ties `appointments.status` to payment commitment per AC-11; every agent-initiated appointment is **hardcoded `'pending'`** at the voice-agent endpoint (`src/app/api/voice-agent/appointments/route.ts:516` direct branch, `:290` quote-conversion branch) regardless of any payment signal — and no agent has any tool to collect or reference a Stripe payment intent / payment link. AC-11 alignment work therefore reduces to two questions: (1) should agents be given a payment-link tool (currently no such infrastructure), and (2) what semantic does `appointment_confirmed` carry when fired from `convertQuote` (`src/lib/quotes/convert-service.ts:240`) on a row whose `status='pending'`? The `convertQuote` helper fires `appointment_confirmed` **unconditionally** post-create, divorced from the actual status — which directly hits the AC-5 / Session 1.5 n8n-idempotency gate.

---

## Table of contents

1. [Target A — Online booking reference pattern](#target-a--online-booking-reference-pattern)
2. [Target B — SMS agent flow](#target-b--sms-agent-flow)
3. [Target C — Phone agent (Tom) flow](#target-c--phone-agent-tom-flow)
4. [Target D — Cross-path comparison matrix](#target-d--cross-path-comparison-matrix)
5. [Target E — AC-11 gap analysis + n8n idempotency verdict](#target-e--ac-11-gap-analysis--n8n-idempotency-verdict)
6. [Target F — Open operator decisions surfaced](#target-f--open-operator-decisions-surfaced)
7. [File:line reference index](#fileline-reference-index)

---

## Target A — Online booking reference pattern

This is the reference path AC-11 derives from. Every other path is compared against it.

### A.1 — Entity creation flow

Entry: `POST /api/book` — handler at `src/app/api/book/route.ts:46`.

Sequential phases:

1. **Validation gates** (in this order) — Zod schema (`:49`) → phone normalize (`:71`) → primary service fetch (`:80`) → W1 classification (`:105`) → addon row prefetch (`:134`) → W3 staff_assessed (`:165`) → W5 prereq vehicle-compat (`:207-228`) → W7 addon vehicle-compat (`:257`) → price match (`:272`) → W2 mobile eligibility (`:496`) → mobile zone surcharge match (`:521-540`) → slot overlap (`:286-300`). Each step rejects with a typed 400/409 message.
2. **Find-or-create customer** — match by `phone` first, fallback to `email IS NOT NULL` (`:306-422`). Consent upgrades applied (`:327-328`); welcome email fires on insert (`:406`).
3. **Find-or-create vehicle** — `findOrCreateVehicle` shared helper (`:444`); category mismatch rejects with 400 (`:462-467`).
4. **Appointment INSERT** — `:567-597`. Single row written with `subtotal`, `tax_amount=0` (booking-time), `discount_amount`, `total_amount` (post-discount), `payment_type` (`pay_on_site` or `deposit`), `deposit_amount` (nullable), `mobile_*` snapshots.
5. **Appointment_services rows** — primary + addons inserted in one batch (`:608-625`).
6. **(If `data.payment_intent_id` present) Deposit transaction** — `:632-861`. Writes `transactions` row (`status='completed'`, `total_amount=depositAmount`), W4-aware `transaction_items` (per-row `is_taxable`), Stripe PI retrieve for card brand/last4, `payments` row.
7. **n8n webhook** — fires `booking_created` always (`:917`); fires **`appointment_confirmed` only when `initialStatus === 'confirmed'`** (`:921-929`).
8. **Customer SMS** — `booking_confirmed` template (`:988-1014`); customer email — `appointment_confirmed` template via `sendTemplatedEmail` (`:1026-1046`).
9. **Staff SMS + email** — `booking_staff_notify` template (`:1053-1073`); staff fallback email (`:1077-1114`).
10. **Audit log** — `logAudit({source: 'customer_portal'})` (`:1119-1132`).
11. **Save-action helpers** — `resolveMobileAddressAction` (`:1138`) + `resolveVehicleSaveAction` (`:1161`) for the silent-save transparency pattern (CLAUDE.md Rule 22 reference).
12. **Response** — `201` with `appointment.id/date/start_time/end_time/total`, plus the two `*_action` discriminators.

### A.2 — Status assignment logic

**The single-line rule** at `src/app/api/book/route.ts:559`:

```typescript
const initialStatus = data.payment_intent_id ? 'confirmed' : 'pending';
```

Translated to operator-facing branches:

- **Pay on site** (operator selected `pay_on_site`, no `payment_intent_id` on submit) → `status='pending'`.
- **Deposit** (Stripe collected partial pre-booking) → `payment_intent_id` is present → `status='confirmed'`.
- **Pay in full** (Stripe collected total pre-booking) → `payment_intent_id` is present → `status='confirmed'`.

No other input dimension influences initial status. `payment_status` writes are separate: rows start with the column's default (`'pending'` per the schema), then are upgraded post-create to `'paid'` only when `depositAmount >= totalAfterDiscount` (`:642`).

### A.3 — Payment collection mechanism

Three options are encoded in `data.payment_option`: `pay_on_site` / `deposit` / `pay_in_full` (mapped at `:589`). The Stripe payment intent is collected by the **client** before `POST /api/book` fires (the deposit-payment client flow lives in `src/app/(public)/book/` and is out-of-scope for this audit per Memory #29). `POST /api/book` receives the already-created `payment_intent_id` and reconciles:

- No `payment_intent_id` → status pending; no transaction row; no `payments` row.
- `payment_intent_id` + `deposit_amount > 0` → status confirmed; transaction row inserted (`status='completed'`, `total_amount=depositAmount`); `payments` row inserted with `stripe_payment_intent_id` (`:851`).

For "pay onsite," the only payment record at booking time is `appointments.payment_type='pay_on_site'` — no transaction row exists until POS finalizes the job at completion.

### A.4 — Customer notifications

| Event | Template / endpoint | Fire condition |
|---|---|---|
| Customer SMS confirmation | `booking_confirmed` (`renderSmsTemplate`) | `e164Phone` truthy AND template `isActive` (`:1003`); `notificationType='booking_confirmed'` |
| Customer email confirmation | `appointment_confirmed` (`sendTemplatedEmail`) | `data.customer.email` truthy (`:1017`) |
| Staff SMS | `booking_staff_notify` | always attempted (`:1053`); skipped silently if no recipient phones |
| Staff email | sendEmail (HTML hand-built) | `biz.email` truthy (`:1077`) |
| Booking reminders (cron) | `/api/cron/booking-reminders` (CLAUDE.md cron table, daily 8 AM PST) — out-of-scope for current-state audit; not inspected this session |

The customer is **NOT** told "your appointment is pending — staff will contact you to confirm" anywhere on the booking-success path. The `booking_confirmed` SMS template is used for both pending and confirmed appointments. Operator-facing semantic divergence between these two states is not surfaced to the customer at SMS time.

---

## Target B — SMS agent flow

### B.1 — Discovery: SMS agent code surface

Entry point: `POST /api/webhooks/twilio/inbound` at `src/app/api/webhooks/twilio/inbound/route.ts:194`. **One** entry handler, but **two** AI execution paths gated by `loadSmsAiV2Flags()` + `shouldUseSmsAiV2(phone)` (`:502-504`):

| Path | When | Implementation |
|---|---|---|
| **SMS AI v2** (tool-use Anthropic agent) | `shouldUseSmsAiV2()` returns true (allowlist OR global toggle) | `runV2AgentInBackground` (fire-and-forget) → `runSmsAiV2Agent` (`src/lib/sms-ai/agent-runner.ts:1`) |
| **Legacy v1** (`[GENERATE_QUOTE]`-block parser) | shouldUseSmsAiV2 returns false OR throws | `getAIResponse` (`src/lib/services/messaging-ai.ts:1`) → text block parsed by `extractQuoteRequest` (`:85-140`) |

Both share these always-on gates (in order, lines `:202-444`):
1. Twilio HMAC signature validation (`:209-214`)
2. STOP/START keyword TCPA enforcement (`:267-355`) — runs **before** the `two_way_sms` feature flag check, so consent transitions always land even when messaging is off
3. `two_way_sms` feature flag check (`:362-366`) — disables conversation create + AI reply + auto-quote
4. Find-or-create conversation (`:371-429`)
5. Inbound message INSERT (`:434-443`)
6. Audience gating: `messaging_ai_unknown_enabled` / `messaging_ai_customers_enabled` settings + per-conversation `is_ai_enabled` toggle + business-hours rule (`:448-478`)
7. Specialty-vehicle gate — if customer has any `size_class IN ('exotic', 'classic')`, hard-pivot to `notify_staff` + `is_ai_enabled=false` (`:646-702`)
8. Rate limit: 25 AI replies per conversation per hour (`MAX_AI_REPLIES_PER_HOUR = 67`, applied `:491`)

The v2 path returns immediately with TWiML at `:520` (background processing continues); the legacy path runs synchronously through the same response.

### B.2 — Entity creation paths

#### B.2.a — Legacy v1 (`[GENERATE_QUOTE]` parser)

Tools available to the legacy AI: **none** — it returns a text string that may contain a single inline directive `[GENERATE_QUOTE]…[/GENERATE_QUOTE]`. The webhook handler parses this with `extractQuoteRequest` (`:85`) and then performs server-side work directly:

- **Customer find-or-create** at `:735-774`. New customers get `sms_consent: true` (implied consent — initiated SMS) and `customer_type='enthusiast'`.
- **Vehicle find-or-create** via `findOrCreateVehicle` (`:779-788`).
- **Service resolution** via `resolveServiceByName` + `resolvePrice` (sale-aware) (`:801-817`).
- **Combo pricing** via `applyCombosToQuoteItems` (`:820`).
- **Quote creation** via `createQuote(supabase, {…}, 'twilio_legacy')` at `:840` — source tagged `'twilio_legacy'`.
- Quote immediately moved to `status='sent'` (`:849-852`) and a short link generated (`:855-862`).
- `quote_communications` row INSERT (`:865-870`).
- Outbound SMS appends the link to the AI's clean message (`:874`).

**Legacy v1 does NOT create appointments.** It creates **quotes** (status `sent`). The customer must accept via the link (`POST /api/quotes/[id]/accept` at `src/app/api/quotes/[id]/accept/route.ts:14`) — and acceptance does NOT auto-create an appointment either: the SMS the customer receives reads *"Our team will reach out shortly to schedule your appointment"* (`:97` / `:101`). An operator manually converts later via `POST /api/quotes/[id]/convert` (`src/app/api/quotes/[id]/convert/route.ts:33`) which calls `convertQuote` with **default options** → `appointmentStatus = 'confirmed'` (`src/lib/quotes/convert-service.ts:134`).

#### B.2.b — SMS AI v2 (Anthropic tool-use loop)

Tools available to the v2 LLM are declared in `src/lib/sms-ai/tools.ts:64-332` — **13 tools total**:

| # | Tool | Side effect | Endpoint |
|---|---|---|---|
| 1 | `lookup_customer` | read | `GET /api/voice-agent/customers` |
| 2 | `get_services` | read | `GET /api/voice-agent/services` |
| 3 | `classify_vehicle` | read | `GET /api/voice-agent/vehicle-classify` |
| 4 | `check_availability` | read | `GET /api/voice-agent/availability` |
| 5 | `create_appointment` | **write** — appointment row | `POST /api/voice-agent/appointments` |
| 6 | `send_info_sms` | write — outbound SMS | `POST /api/voice-agent/send-info-sms` |
| 7 | `get_products` | read | `GET /api/voice-agent/products` |
| 8 | `get_product_details` | read | `GET /api/voice-agent/products/details` |
| 9 | `notify_staff` | write — staff SMS | in-process `notifyStaff()` (no HTTP) |
| 10 | `send_quote_sms` | **write** — quote row + outbound SMS | `POST /api/voice-agent/send-quote-sms` |
| 11 | `approve_addon` | write — addon authorization | in-process `approveAddon()` |
| 12 | `decline_addon` | write — addon authorization | in-process `declineAddon()` |
| 13 | `upsert_customer` | write — customer row | `POST /api/voice-agent/customers` |

Routing: `dispatchTool` in `src/lib/sms-ai/tool-dispatcher.ts:689-779`. HTTP dispatchers receive Bearer auth from `business_settings.voice_agent_api_key` (`:169-196`). Runtime context (phone + conversation_id) is injected by the dispatcher into every phone-bearing call, overriding any LLM-supplied value (`:108-167`, design rationale at file header).

**v2 can create appointments directly** via `create_appointment` (tool 5). The tool description (`tools.ts:136-155`) advertises *"Default status is 'pending' — staff confirms after review. Server sends an appointment_confirmed SMS to the customer automatically when sms_consent is true."* — the **endpoint hardcodes pending** (see C.3 below) and the SMS template name does not match the row's actual status semantic.

The `send_quote_sms` tool (tool 10) creates a quote (status `'sent'`) via the same server-side `createQuote` path used by the voice agent (see C.5).

### B.3 — Status assignment

- **Legacy v1 — no appointments created.** Customer acceptance via `/api/quotes/[id]/accept` sets `quotes.status='accepted'` (`accept/route.ts:64`), nothing more. The only appointment-creation path for an accepted SMS-agent quote is a manual operator-initiated `/api/quotes/[id]/convert` call → `convertQuote` default options → **status `'confirmed'`** (`convert-service.ts:134`), regardless of any payment state.
- **v2 direct (`create_appointment` without `quote_id`)** → the dispatcher (`tool-dispatcher.ts:434-451`) POSTs to `/api/voice-agent/appointments`. The endpoint's direct-booking branch (`src/app/api/voice-agent/appointments/route.ts:506-540`) writes **`status: 'pending'`** at `:516` (hardcoded literal). The accompanying comment at `:507-509` makes the intent explicit: *"Voice agent appointments default to 'pending' — staff must manually confirm after reviewing details."*
- **v2 quote-conversion (`create_appointment` with `quote_id`)** → routes through `convertQuote(supabase, resolvedQuoteId, …, { appointmentStatus: 'pending', channel: 'phone' })` at `:286-291`. So the agent-driven quote-conversion path **overrides** the default-confirmed semantic and lands at pending.

### B.4 — Payment integration

**None.** Searching `src/lib/sms-ai/**` and `src/app/api/voice-agent/**` for `payment_intent`, `payment_link`, `stripe_payment_intent_id` returns no results. The direct-booking branch writes `subtotal: 0, tax_amount: 0, discount_amount: 0, total_amount: 0` at `:522-525` (appointment row carries no monetary value at all — pricing is deferred to POS finalization). The quote-conversion branch carries the quote's totals onto the appointment via `convertQuote` (`convert-service.ts:145-148`), but no payment intent / link is attached.

There is no tool for the v2 LLM to send a payment link. There is no endpoint under `/api/voice-agent/*` for payment-link creation. The agent cannot reference a Stripe PI even if one were created out-of-band — the `appointments` INSERT doesn't carry `stripe_payment_intent_id` on either branch.

The loop `agent SMS → customer pays → status update` does not exist. The only existing tie between payment and appointment status is the one in `/api/book/route.ts:559`.

### B.5 — Tool inventory

See B.2.b above for the 13-tool list. Per-tool detail of side-effecting writes:

- `create_appointment` — see B.3 + C.3.
- `send_quote_sms` — see C.5 (server-side `send-quote-sms` route is shared with the Phone agent; idempotency guards live there).
- `upsert_customer` — phone + conversation_id are injected at dispatch (`tool-dispatcher.ts:553-572`), endpoint at `/api/voice-agent/customers` POST. Customers are written / updated as soon as the LLM learns a first name (tool description at `tools.ts:289-331`).
- `notify_staff` — in-process call to `notifyStaff()` (`tool-dispatcher.ts:642-685`); reason enum: `appointment_change | custom_quote | beyond_scope | transfer_request | mobile_distance | human_handoff | other`. Skips the HTTP wrapper entirely (file header rationale).
- `approve_addon` / `decline_addon` — in-process `approveAddon` / `declineAddon` from `@/lib/services/job-addons` (`tool-dispatcher.ts:584-635`). Both send a confirmation SMS to the customer as side effect.

### B.6 — Conversation continuity

- Per-conversation state lives in `conversations` (phone-keyed) + `messages` (conversation_id-keyed) — the legacy + v2 paths both read history from these tables.
- v2 builds a runtime context (`RuntimeContext` at `tool-dispatcher.ts:116-147`) containing `phone`, `conversationId`, and a `size_class` cache captured from `classify_vehicle` for downstream auto-injection into `get_services` calls.
- For known customers, both paths build a full `CustomerContext` bundle (`messaging-ai.ts` for legacy via the webhook prep at `:549-639`; `getCustomerContext` for v2 via `agent-runner.ts`) — includes transactions, vehicles, **upcoming appointments**, quotes, loyalty, notes, tags.
- v2 LOOKUP_CUSTOMER is the **single source of truth** for who's on the line per the tool description (`tools.ts:67-79`). The agent knows about upcoming appointments via the customer-context bundle and avoids creating duplicate appointments by inspecting that list.
- 60-second idempotency guard on `send_quote_sms` at `src/app/api/voice-agent/send-quote-sms/route.ts:420-518` — compares `(customer_id, vehicle_id, [(service_id, tier_name, quantity)…])` triple against rows created in the last 60 seconds; on hit, returns the existing quote without a new SMS send.
- The `create_appointment` endpoint has **no** equivalent idempotency guard — a double-tool-call by the LLM produces two appointment rows (the dispatcher's no-retry policy at `tool-dispatcher.ts:23-29` is the only protection).

---

## Target C — Phone agent (Tom) flow

### C.1 — Discovery: Phone agent code surface

Tom is the ElevenLabs voice agent persona. The agent ID is supplied via the `ELEVENLABS_AGENT_ID` env var (`src/app/api/cron/voice-calls-poll/route.ts:8`), not hardcoded — verified the codebase contains no literal occurrence of `agent_2801kmgybk7rebrsvndpv3bv6dqn` (Memory #30 boundary preserved; the ID lives only in the deployment env). The "Tom" persona is hardcoded in two places:

- Voice greeting: *"This is Tom"* in `src/app/api/voice-agent/initiation/route.ts:314`.
- SMS persona: *"You are Tom, the SMS assistant for ${businessName}"* in `src/lib/sms-ai/system-prompt.ts:41`. Same Tom across voice + SMS (`:290`).

**Memory #30 boundary check:** no references to "Ashley" or "Retell AI" (Lomita Notary's voice agent) appear anywhere in `src/`. Cross-contamination not detected.

Phone agent code surface (file:line cited per Memory #11):

| Component | Path | Purpose |
|---|---|---|
| Conversation initiation webhook | `src/app/api/voice-agent/initiation/route.ts:22-330` | ElevenLabs calls during ring; returns `dynamic_variables` + personalized `first_message`. 5-second SLA. |
| Mid-call tools (Bearer auth) | `src/app/api/voice-agent/*/route.ts` (13 endpoints) | LLM tool calls during the conversation |
| End-of-call tool | `src/app/api/voice-agent/finalize-call/route.ts:13-116` | LLM calls before hanging up; returns 200 immediately; runs `processVoiceCallEnd` fire-and-forget |
| After-call webhook (HMAC) | `src/app/api/webhooks/elevenlabs/call-complete/route.ts:19-120` | Safety net for missed `finalize_call`; HMAC via `elevenlabs-signature` header |
| Polling cron | `src/app/api/cron/voice-calls-poll/route.ts:55-295` | CLAUDE.md cron schedule: every 5 min. Two-step: process awaiting_data retries → sweep timeouts → process new conversations (cursor-driven) |
| Post-call shared handler | `src/lib/services/voice-post-call.ts:45-474` | `processVoiceCallEnd` — invoked by all three terminal paths above |
| API key auth helper | `validateApiKey` (Bearer matching `business_settings.voice_agent_api_key`) | Shared with SMS AI v2 dispatcher |
| Tom's tool config | LLM-side on ElevenLabs (not in repo) | Mapped 1:1 onto the 13 `/api/voice-agent/*` endpoints |

### C.2 — Entity creation paths

Tom's tools (mapped 1:1 to the 13 `/api/voice-agent/*` endpoints) are the **same surface** SMS AI v2 dispatches to — both agents converge on identical server primitives. The only LLM-layer differences are tool description wording and the agent persona; the endpoint behavior is identical.

For each agent action that creates entities:

- **Quote creation** — `POST /api/voice-agent/send-quote-sms` (`src/app/api/voice-agent/send-quote-sms/route.ts:53`). Creates quote via shared `createQuote` (`:541`), source tagged `'sms_agent'` when `body.source === 'sms_agent'` (SMS dispatcher injects this at `tool-dispatcher.ts:532`); otherwise tagged `'voice_agent'` (the ElevenLabs caller omits `source`). Quote immediately moved to `status='sent'` (`:553-557`). `notificationType` on the outbound SMS is `'sms_agent_quote_sent'` (SMS path) or `'voice_quote_sent'` (voice path) — channel-aware via the same `source` discriminator (`:624`).
- **Appointment creation** — `POST /api/voice-agent/appointments` (`src/app/api/voice-agent/appointments/route.ts:142`). Two branches: with `quote_id` → `convertQuote` (forced `appointmentStatus: 'pending'`) at `:286-291`; without → direct INSERT with hardcoded `status: 'pending'` at `:516`.
- **Customer record** — `POST /api/voice-agent/customers` (the `upsert_customer` tool endpoint).
- **Vehicle record** — `findOrCreateVehicle` shared helper, invoked by both `appointments` POST (`:484`) and `send-quote-sms` POST (`:241`).

Phone agent NEVER routes through `POST /api/book` — the public booking endpoint and the voice-agent endpoint are independent. They share NO validation logic (e.g., the public-booking W1/W2/W3/W5/W7 gates do not run on agent-created appointments — `vehicle_compatibility` is a soft `console.warn` + `mismatchWarning` annotation on the appointment's `job_notes` at `voice-agent/appointments/route.ts:495-503`, not a hard reject).

### C.3 — Status assignment

Identical to SMS AI v2 (B.3) because they share the endpoint. **Both branches hardcode `'pending'`:**

- **Direct branch:** `src/app/api/voice-agent/appointments/route.ts:516` — `status: 'pending'`. In-source comment at `:507-509`: *"Voice agent appointments default to 'pending' — staff must manually confirm after reviewing details. This differs from POS/admin conversion which sets 'confirmed' because a staff member initiated it."*
- **Quote-conversion branch:** `:286-291` — `convertQuote(…, { appointmentStatus: 'pending', channel: 'phone' })` overrides the helper's default (`'confirmed'`).

There is **no condition** under which the voice-agent endpoint produces a `'confirmed'` appointment.

### C.4 — Payment integration

**None.** Same finding as B.4 — applies to both the SMS AI v2 dispatcher and Tom's call path. Tom has no tool for payment-link creation; no `/api/voice-agent/*` endpoint accepts a `payment_intent_id`; no row inserted by the voice-agent path carries `stripe_payment_intent_id`. Voice card collection is not implemented (no transcription-to-Stripe primitive anywhere in `src/`).

The loop `Tom books → post-call SMS payment link → customer pays → status update` does not exist. The closest existing primitive is `processVoiceCallEnd`'s post-call SMS send (`voice-post-call.ts:371-400`), which renders the `appointment_confirmed_postcall` template — but its body is *"Thanks for calling…! Your appointment is confirmed."* (`:380`), which is a content-vs-status mismatch when the underlying row is `status='pending'`.

### C.5 — Tool inventory

The 13 tools listed in B.2.b are the same surface Tom calls — see that table. Per Memory context references:

- The "10 tools mapped to voice-agent endpoints" remembered count is **outdated by 3** — the current production surface is 13. `upsert_customer`, `approve_addon`, and `decline_addon` are post-Workstream-J additions per source comments (`tool-dispatcher.ts:546-551`, `:574-583`).
- The `appointments` POST endpoint is the only `create_appointment` write path; both branches (direct + quote) live in one route (`voice-agent/appointments/route.ts:142-665`).
- `finalize-call` is **not** in the SMS-AI-v2 tool list (tools 1-13 enumerated above) — it is voice-agent-exclusive because there's no symmetric end-of-conversation moment in SMS (the SMS thread is unbounded by design).

### C.6 — Post-call processing

`processVoiceCallEnd` in `src/lib/services/voice-post-call.ts:45-474` is invoked from three terminal seams:

1. `finalize_call` LLM tool (returns 200 immediately, runs `processVoiceCallEnd` fire-and-forget — `voice-agent/finalize-call/route.ts:96-105`).
2. ElevenLabs `call-complete` HMAC webhook (`webhooks/elevenlabs/call-complete/route.ts:89-98`).
3. Voice-calls-poll cron retry path (`cron/voice-calls-poll/route.ts:115` for awaiting_data retries; `:231` for new conversations).

Dedup is via the `voice_call_log` table — unique on `elevenlabs_conversation_id` (referenced at `voice-post-call.ts:62-63` and the cron's awaiting_data state machine at `voice-calls-poll/route.ts:74-117`). Statuses: `awaiting_data` (retry), `processing`, `completed`, `failed_no_phone` (terminal after 5-min timeout — RETRY_WINDOW_MS at `:14`). 30-day prune for failed rows (`:239-249`).

When `appointmentBooked === true` (read from `data_collection_results['appointment_booked']` or transcript scan of `tool_requests` for `create_appointment` at `voice-calls-poll/route.ts:417-435`), the handler:

- Skips auto-quote (`voice-post-call.ts:371-373`).
- Sends customer SMS via `appointment_confirmed_postcall` template (`:382`), with notificationType `'voice_followup'`.

When `appointmentBooked === false` and services were discussed, the handler runs `autoGenerateQuote` (`:420` / `:435`), which calls `createQuote` directly with source `'voice_post_call'` (`:619` — referenced in `processVoiceCallEnd`'s caller block).

`processVoiceCallEnd` can **backfill** the `conversations.customer_id` when an upsert during the call lagged behind conversation-row creation (`:450-457`). It can also overwrite a `Phone Caller` placeholder name with a real one (similar pattern in `send-quote-sms/route.ts:171-187`). It does **not** correct appointment status — there's no path back to mutate an already-created `pending` row to `confirmed` post-call.

The polling cron's `extractPhone` (`voice-calls-poll/route.ts:318-326`) is the only authority for tying a conversation to a customer when the webhook arrives without phone — ElevenLabs sometimes populates the field late, hence the 5-minute retry budget.

---

## Target D — Cross-path comparison matrix

| Dimension | Online Booking | SMS Agent — Legacy v1 | SMS Agent — v2 | Phone Agent (Tom) |
|---|---|---|---|---|
| **Entry endpoint** | `POST /api/book` | `POST /api/webhooks/twilio/inbound` (legacy branch) | `POST /api/webhooks/twilio/inbound` → fire-and-forget `runV2AgentInBackground` | ElevenLabs SaaS → various `/api/voice-agent/*` calls |
| **AI authoring layer** | None — server-side schema validation only | `messaging-ai.ts` Anthropic completion → text + `[GENERATE_QUOTE]` block | `runSmsAiV2Agent` Anthropic tool-use loop (13 tools, 6-iteration cap) | ElevenLabs LLM (Tom) using mapped tools |
| **Creates Quote first?** | No | **Yes** (the only entity it creates) | Conditionally — `send_quote_sms` is one of 13 tools | Conditionally — same |
| **Creates Appointment directly?** | Yes (this is the route's purpose) | **Never** — no path in this code can write an appointment row | Yes — `create_appointment` tool (1 of 13) | Yes — same endpoint |
| **Routes through `/api/book`?** | (it IS `/api/book`) | No | No | No |
| **Default appointment status** | `pending` OR `confirmed`, payment-driven | N/A (no appointment created) | **`pending` (hardcoded)** | **`pending` (hardcoded)** |
| **Can produce `confirmed`?** | Yes (when `payment_intent_id` present) | No path | **No** | **No** |
| **Payment collection capability** | Stripe PI collected client-side; deposit/full both write transaction row + payments row at booking | None | None | None |
| **Sends payment link?** | N/A — collects deposit before route fires | No | No (no tool) | No (no tool) |
| **Customer SMS template fired** | `booking_confirmed` (status-agnostic copy) | None automatic (only auto-quote link via `splitSmsMessage` + outbound) | `appointment_confirmed` template (semantic mismatch: row is `pending`) | `appointment_confirmed` during call + `appointment_confirmed_postcall` after call |
| **n8n webhooks fired** | `booking_created` always; `appointment_confirmed` only when `initialStatus === 'confirmed'` | `quote_created` / `quote_sent` (via `createQuote` internals) | Direct branch fires `booking_created` from `voice-agent/appointments/route.ts:610`; quote-conversion branch fires `appointment_confirmed` **unconditionally** via `convertQuote` (`convert-service.ts:240`) regardless of actual `status='pending'` | Same as v2 (shared endpoints) |
| **n8n idempotency at source** | None (re-firing produces duplicate downstream actions if receiver isn't idempotent) | None (lifecycle-engine-driven re-fires possible) | None | None |
| **Quote idempotency** | N/A | None (legacy path doesn't have the 60s window) | 60s `(customer, vehicle, [service_id, tier, qty]…)` triple guard at `send-quote-sms/route.ts:420-518` | Same (shared endpoint) |
| **Appointment idempotency** | None app-side (relies on slot-overlap reject at `:286-300` to surface collisions) | N/A | None — double LLM tool-call produces duplicates | Same |
| **Post-event verification / backfill** | Audit log row | None | None | `voice_call_log` retry state machine (`awaiting_data` → `completed` / `failed_no_phone`); 5-min timeout; can backfill `conversations.customer_id` but not appointment status |
| **Vehicle compatibility enforcement** | Hard reject (400) at `book/route.ts:462-467` | Implicit (no service validation on AI text block) | Soft warn — `mismatchWarning` annotated on `job_notes`, no reject (`voice-agent/appointments/route.ts:495-503`) | Same as v2 |
| **Specialty vehicle handling** | Public booking redirects to `<RequestQuoteCard>` / `staff_assessed_service` request type | Hard pivot in webhook (`:646-702`) — `notify_staff` SMS + `is_ai_enabled=false` | Same hard pivot (legacy gate runs before v2 dispatch fork) | LLM-level escalation via `notify_staff` tool with `reason='custom_quote'` |
| **`channel` column value** | `data.channel \|\| 'online'` (`book/route.ts:574`) | N/A | `'phone'` (hardcoded at `voice-agent/appointments/route.ts:517`) — **misleading**: a v2-SMS-created appointment is tagged `channel='phone'` because the endpoint was designed for Tom first | `'phone'` (correct) |
| **`payment_status` initial** | `'pending'` default, upgraded to `'paid'` post-create if deposit covers full | N/A | `'pending'` default | `'pending'` default (direct branch); `'pending'` explicitly at convertQuote (`convert-service.ts:144`) |
| **`subtotal` / `total_amount` populated** | Yes (pricing validated server-side) | N/A | **Zeros** at direct branch (`voice-agent/appointments/route.ts:522-525`) — pricing deferred to POS finalization | Same |

---

## Target E — AC-11 gap analysis + n8n idempotency verdict

### E.1 — Path-by-path AC-11 alignment

AC-11 commitment (per `QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:451-465`): *"Appointment `status='pending'` vs `status='confirmed'` is semantically defined by payment commitment. … All three booking paths (online, SMS agent, phone agent) align on this rule."*

| Path | AC-11 status | Evidence |
|---|---|---|
| **Online booking** | **ALIGNED** | `book/route.ts:559` — `initialStatus = data.payment_intent_id ? 'confirmed' : 'pending'` ties status to payment commitment exactly as AC-11 requires |
| **SMS agent — legacy v1** | **UNDEFINED at agent layer; MISALIGNED at downstream conversion** | Legacy creates only quotes (no appointment row). The downstream `convertQuote` (operator-initiated via `/api/quotes/[id]/convert`) defaults to `status='confirmed'` regardless of payment commitment — a customer who accepts a quote and is then converted by staff to an appointment without any payment lands at `confirmed`, contradicting AC-11. The `accept` endpoint (`accept/route.ts:14`) does not auto-create the appointment, so the gap manifests at the operator-conversion seam, not the agent seam |
| **SMS agent — v2** | **MISALIGNED** | `voice-agent/appointments/route.ts:516` hardcodes `'pending'` on the direct branch and forces `'pending'` on the quote branch (`:290`). No condition can produce `'confirmed'`. Payment commitment is never inspected because no payment infrastructure exists for the agent to invoke |
| **Phone agent (Tom)** | **MISALIGNED** | Same evidence as v2 — shared endpoint |

The two MISALIGNED paths (v2 + Tom) are MISALIGNED in **the same direction**: status is pinned to `'pending'` regardless of payment, when AC-11 would require it to escalate to `'confirmed'` on payment receipt.

The legacy SMS path is structurally different — it cannot produce an appointment at all without an operator-initiated conversion step. The AC-11 gap there is a deferred-conversion problem, not an agent-write problem.

### E.2 — What's needed for alignment (scope, not recommendation)

Per Memory #29 type 3 this is descriptive scope-sizing, NOT a recommendation. Operator decisions in Target F.

For each MISALIGNED path:

**Phone agent (Tom) + SMS AI v2 (direct branch):**

- Infrastructure missing: a payment-link tool for Tom + v2. There is no `payment_link` / `payment_intent` write primitive anywhere in `/api/voice-agent/*` today.
- Infrastructure existing: Stripe SDK is initialized in `book/route.ts:830`; `extractCardDetailsFromCharge` helper exists; `payments` + `transactions` tables already support agent-deferred payment recording.
- Per-line change estimate for status-pinning fix alone (without payment-link tool): swap `'pending'` literal at `voice-agent/appointments/route.ts:516` and `:290` with a `data.payment_intent_id ? 'confirmed' : 'pending'` mirror of the public route — **~2 lines + matching test updates**. But this alone does nothing because no caller passes `payment_intent_id`.
- Full alignment requires: (a) new payment-link primitive at `/api/voice-agent/send-payment-link` (or `send_info_sms` extension); (b) post-payment webhook tie-in (Stripe `payment_intent.succeeded`) that mutates `appointments.status` from `'pending'` to `'confirmed'`; (c) the status-pinning swap above. Estimated scope is meaningful (multi-session work), not a 2-line patch.

**SMS agent (legacy v1) operator-conversion seam:**

- Infrastructure existing: the `convertQuote` helper accepts `appointmentStatus` override (`convert-service.ts:24-29`).
- Per-line change estimate for AC-11 alignment at the operator-conversion seam: the `/api/quotes/[id]/convert` POST passes `parsed.data` without options at `convert/route.ts:33`. Adding an operator-confirmed payment check at this seam is **~10-20 lines** but requires an operator-decision (what counts as "payment commitment received" at conversion time — see F.4).

### E.3 — n8n receiver idempotency check

**Verdict: BLOCKED — operator must verify n8n flow before Session 1.5 can proceed.**

What is knowable from Smart Details code:

- **The webhook source has zero deduplication tokens.** `fireWebhook` in `src/lib/utils/webhook.ts:20-52` POSTs a JSON payload to the n8n URL with `Content-Type: application/json` and a 10-second AbortSignal timeout. The payload carries `appointment.id` (a UUID) but no `webhook_id`, `idempotency_key`, `attempt_count`, or similar dedup field.
- **Re-firing is structurally possible from at least four sites.** Per the audit's evidence:
  1. `convertQuote` fires `appointment_confirmed` on every quote-conversion call, regardless of the resulting status (`convert-service.ts:240`). A customer who accepts and is converted twice (e.g., after a un-convert + re-convert operator workflow) fires twice.
  2. `book/route.ts:921-929` fires `appointment_confirmed` only when `initialStatus === 'confirmed'` — but lacks a guard against retry of a flapping route.
  3. The lifecycle-engine cron (`/api/cron/lifecycle-engine`, every 10 min per CLAUDE.md) was not inspected in this audit (out of scope) but is a known source of webhook re-fires; Phase 0.1's session prompt called this out as a knowable-only-from-n8n question.
  4. Future Session 1.5 work would add a fifth source by wiring the un-materialize cascade into PATCH for backward reverts — confirmed → pending → confirmed sequences become real, and each `pending → confirmed` writeback would fire `appointment_confirmed` again.
- **The source has no observability for receiver behavior** — `fireWebhook` logs the URL and HTTP status (`webhook.ts:49-51`) but cannot tell whether the receiver deduped or processed redundantly.
- **The same payload shape is sent for `booking_created` and `appointment_confirmed`** for an online-booking confirmed appointment — webhook receivers that listen on both events without a `appointment_id`-keyed dedup will fire SMS twice.

What requires operator inspection (not knowable from Smart Details code):

- The 13 events in the `WebhookEvent` union (`webhook.ts:3-13`) each map to a configured n8n URL via the `n8n_webhook_urls` JSONB in `business_settings`. The receiver flow at each URL is operator-authored and lives in n8n, not in this repo.
- The specific receiver workflows for `appointment_confirmed` and `appointment_completed` need direct inspection in n8n to verify: (a) presence of a "Dedup by appointment_id within last X minutes" gate, (b) presence of any "already sent customer SMS for this transition" check, (c) idempotency behavior on re-execution of the same workflow.

**Until the operator verifies these flows in n8n, Session 1.5 (wiring un-materialize cascade into PATCH for backward reverts — per `QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:833-879`) cannot safely proceed.** The 2 SAFE state-machine openings in Session 1.4 (`pending → in_progress` and `in_progress → no_show`) are unaffected by the n8n question per consequence map d3671c82 Target D.1, D.3.

Independently of Session 1.5, the `convertQuote` unconditional fire at `convert-service.ts:240` is a finding worth surfacing on its own: the helper fires `appointment_confirmed` **regardless** of the row's actual status. When called from the voice-agent endpoint with `appointmentStatus: 'pending'`, the receiver sees an `appointment_confirmed` event for a row whose `status` is `'pending'`. This is a semantic ambiguity at the wire layer that an idempotent receiver would still dedupe correctly, but a status-driven receiver would misinterpret.

---

## Target F — Open operator decisions surfaced

Per Memory #29 type 3 — surfaced honestly, not pre-resolved.

### F.1 — SMS agent v2 appointment-creation philosophy

The v2 LLM has both `send_quote_sms` and `create_appointment` tools, with no enforced ordering between them. The tool descriptions encourage a "quote → conversion" flow but do not constrain the LLM to it. Should v2's `create_appointment` tool be:

- **Removed** — force v2 to always create a quote first (matches legacy v1 behavior), and require an operator step (or a customer accept-link → operator convert) before any appointment row exists?
- **Status-pinned to pending forever** (current behavior) — leaving the operator manual-confirm step as the only path to `confirmed`?
- **Wired into a future payment-link tool** — agent can produce a `confirmed` appointment by issuing a payment link + waiting for the Stripe webhook to flip the row?

### F.2 — Phone agent payment-link timing

If Tom is given a payment-link capability, when does it fire?

- **During the call** — Tom sends a payment link via SMS while the customer is still on the line, customer pays before hanging up?
- **Post-call** — Tom finishes the call with `status='pending'`, the `appointment_confirmed_postcall` template carries a payment link, customer pays asynchronously?
- **Never** — Tom always books pending, staff manually collects payment off-platform and confirms in POS?

Voice card collection is out per the prompt's assumption (high-risk); the open question is link timing.

### F.3 — Operator-facing pending→confirmed workflow

Per AC-11 *"Operator manual transitions: Operator pressing 'Confirm' on a pending appointment should ideally tie to a payment-collected event. Phase 2 session decides whether to enforce this strictly or allow operator override with audit log."* This audit surfaces a specific case the AC-11 wording didn't pre-resolve:

- Quote acceptance via `/api/quotes/[id]/accept` → customer is notified *"Our team will reach out shortly to schedule"* (`accept/route.ts:97/101`). When the operator subsequently calls `POST /api/quotes/[id]/convert`, the convert payload accepts no payment indicator and `convertQuote` defaults to `'confirmed'` (`convert-service.ts:134`) regardless of whether payment was collected. Should this seam:
  - (a) Default to pending (mirror agent endpoints), require operator to confirm separately after payment?
  - (b) Surface a "Was payment collected?" prompt at convert time, gate `'confirmed'` on operator answer?
  - (c) Stay as-is, with audit log entry capturing the operator's `'confirmed'` write as an implicit payment-deferred decision?

### F.4 — `appointment_confirmed` webhook fire-condition

The current state has two webhook-fire patterns for `appointment_confirmed`:

- `book/route.ts:921-929` — fires **only when status starts confirmed** (status-tied).
- `convert-service.ts:240` — fires **unconditionally**, regardless of resulting status (status-decoupled).

This is internal inconsistency. Should `appointment_confirmed` fire:

- (a) Only on the **transition into** `confirmed` (status-tied for all sources)?
- (b) On every operator-confirmed convert action, regardless of actual `status`?
- (c) Be split into two distinct events (`appointment.created.confirmed` vs `appointment.converted_from_quote`) with separate downstream behaviors?

### F.5 — `channel='phone'` write for v2-SMS-created appointments

`voice-agent/appointments/route.ts:517` hardcodes `channel: 'phone'`. When SMS AI v2 dispatches `create_appointment` via the same endpoint, the resulting row is tagged `channel='phone'` despite the customer interaction being SMS-only. Should:

- The endpoint accept a caller-supplied `channel` parameter (like `/api/book` does at `book/route.ts:574`)?
- The dispatcher inject `channel: 'sms'` for v2 calls (mirror the `source: 'sms_agent'` pattern from `send-quote-sms` at `tool-dispatcher.ts:532`)?
- Stay as-is (operator inspecting the row by `channel` cannot distinguish v2 SMS bookings from Tom bookings — both look like `'phone'`)?

### F.6 — Quote acceptance auto-creates appointment?

Currently `POST /api/quotes/[id]/accept` writes `quotes.status='accepted'` and notifies staff (`accept/route.ts:14-225`) but does **not** create an appointment row. The customer is told *"Our team will reach out shortly to schedule"*. Should:

- (a) Stay as-is (operator-mediated schedule step is intentional friction)?
- (b) Auto-create a `status='pending'` appointment on acceptance with the quote's services + a TBD `scheduled_date` placeholder, prompting operator to fill in a slot?
- (c) Auto-create with a Calendly-style slot picker presented on the quote page itself, where the customer also picks the time?

Each path implies different webhook semantics + customer comms.

---

## File:line reference index

### Online booking (`/api/book`)

- `src/app/api/book/route.ts:46` — POST handler entry
- `src/app/api/book/route.ts:559` — **Status assignment rule (AC-11 anchor)**
- `src/app/api/book/route.ts:567-597` — Appointment INSERT
- `src/app/api/book/route.ts:632-861` — Deposit transaction + payments rows (only when `payment_intent_id` present)
- `src/app/api/book/route.ts:917-929` — Webhook fires (`booking_created` always; `appointment_confirmed` only when confirmed)
- `src/app/api/book/route.ts:988-1014` — Customer `booking_confirmed` SMS
- `src/app/api/book/route.ts:1026-1046` — Customer `appointment_confirmed` email

### SMS agent legacy v1

- `src/app/api/webhooks/twilio/inbound/route.ts:194` — Entry
- `src/app/api/webhooks/twilio/inbound/route.ts:209-214` — Twilio HMAC validation
- `src/app/api/webhooks/twilio/inbound/route.ts:267-355` — TCPA STOP/START (pre-flag)
- `src/app/api/webhooks/twilio/inbound/route.ts:362-366` — `two_way_sms` feature flag gate
- `src/app/api/webhooks/twilio/inbound/route.ts:502-528` — v2 routing fork
- `src/app/api/webhooks/twilio/inbound/route.ts:646-702` — Specialty-vehicle hard pivot
- `src/app/api/webhooks/twilio/inbound/route.ts:704-712` — `getAIResponse` legacy call
- `src/app/api/webhooks/twilio/inbound/route.ts:725-895` — Auto-quote processing (parse + createQuote + short link)
- `src/app/api/webhooks/twilio/inbound/route.ts:840` — `createQuote` source `'twilio_legacy'`
- `src/app/api/webhooks/twilio/inbound/route.ts:849-852` — Quote status `'sent'` after creation

### SMS AI v2

- `src/lib/sms-ai/agent-runner.ts:66` — `MAX_ITERATIONS = 6`
- `src/lib/sms-ai/tools.ts:64-332` — 13-tool declaration
- `src/lib/sms-ai/tools.ts:136-155` — `create_appointment` tool spec (advertises default pending)
- `src/lib/sms-ai/tool-dispatcher.ts:89-103` — Per-tool timeout budgets
- `src/lib/sms-ai/tool-dispatcher.ts:116-167` — RuntimeContext (phone injection)
- `src/lib/sms-ai/tool-dispatcher.ts:434-451` — `create_appointment` dispatch (POST /api/voice-agent/appointments)
- `src/lib/sms-ai/tool-dispatcher.ts:492-543` — `send_quote_sms` dispatch (with `source: 'sms_agent'` injection at `:532`)
- `src/lib/sms-ai/tool-dispatcher.ts:689-779` — Public `dispatchTool` switch
- `src/lib/sms-ai/feature-flag.ts:1-152` — `loadSmsAiV2Flags` + `shouldUseSmsAiV2`
- `src/lib/sms-ai/background-dispatch.ts:1-216` — `runV2AgentInBackground` (fire-and-forget wrapper)

### Phone agent (Tom / ElevenLabs)

- `src/app/api/voice-agent/initiation/route.ts:22-330` — Initiation webhook (5s SLA)
- `src/app/api/voice-agent/initiation/route.ts:314` — "This is Tom" greeting
- `src/app/api/voice-agent/appointments/route.ts:142` — POST handler
- `src/app/api/voice-agent/appointments/route.ts:210-373` — Quote-conversion branch (`appointmentStatus: 'pending'` at `:290`)
- `src/app/api/voice-agent/appointments/route.ts:495-503` — Vehicle/service compat (soft warn)
- `src/app/api/voice-agent/appointments/route.ts:506-540` — Direct branch INSERT
- `src/app/api/voice-agent/appointments/route.ts:516` — **`status: 'pending'` hardcoded**
- `src/app/api/voice-agent/appointments/route.ts:517` — `channel: 'phone'` hardcoded
- `src/app/api/voice-agent/appointments/route.ts:522-525` — Zero subtotal / total_amount
- `src/app/api/voice-agent/appointments/route.ts:610-638` — `booking_created` webhook fire
- `src/app/api/voice-agent/send-quote-sms/route.ts:53` — POST handler
- `src/app/api/voice-agent/send-quote-sms/route.ts:420-518` — 60s idempotency guard (triple-key)
- `src/app/api/voice-agent/send-quote-sms/route.ts:541` — `createQuote` source `'sms_agent'`
- `src/app/api/voice-agent/send-quote-sms/route.ts:624` — Channel-aware notificationType
- `src/app/api/voice-agent/finalize-call/route.ts:13-116` — End-of-call tool
- `src/app/api/webhooks/elevenlabs/call-complete/route.ts:19-120` — HMAC after-call webhook
- `src/app/api/webhooks/elevenlabs/call-complete/route.ts:127-171` — `verifyElevenLabsSignature`
- `src/app/api/cron/voice-calls-poll/route.ts:55-295` — Polling cron handler
- `src/app/api/cron/voice-calls-poll/route.ts:8` — `ELEVENLABS_AGENT_ID` env var (Tom)
- `src/app/api/cron/voice-calls-poll/route.ts:14` — `RETRY_WINDOW_MS = 5 * 60 * 1000`
- `src/lib/services/voice-post-call.ts:45-474` — `processVoiceCallEnd` shared handler
- `src/lib/services/voice-post-call.ts:371-400` — Post-call appointment-booked SMS branch
- `src/lib/services/voice-post-call.ts:382` — `appointment_confirmed_postcall` template render

### Quote → Appointment conversion shared helper

- `src/lib/quotes/convert-service.ts:24-29` — `ConvertQuoteOptions` interface
- `src/lib/quotes/convert-service.ts:31-243` — `convertQuote` function
- `src/lib/quotes/convert-service.ts:134` — `status: options?.appointmentStatus ?? 'confirmed'` (default confirmed)
- `src/lib/quotes/convert-service.ts:144` — `payment_status: 'pending'` hardcoded
- `src/lib/quotes/convert-service.ts:240` — **Unconditional `appointment_confirmed` webhook fire**

### Quote customer-acceptance

- `src/app/api/quotes/[id]/accept/route.ts:14-225` — POST handler
- `src/app/api/quotes/[id]/accept/route.ts:64-70` — Status → `'accepted'`
- `src/app/api/quotes/[id]/accept/route.ts:77-78` — `quote_accepted` webhook fire
- `src/app/api/quotes/[id]/accept/route.ts:91-101` — Customer SMS ("our team will reach out shortly to schedule")

### Quote operator-conversion

- `src/app/api/quotes/[id]/convert/route.ts:8-47` — POST handler
- `src/app/api/quotes/[id]/convert/route.ts:18` — `quotes.convert` permission gate
- `src/app/api/quotes/[id]/convert/route.ts:33` — `convertQuote(supabase, id, parsed.data)` — **no options** → status defaults to `'confirmed'`

### Webhook infrastructure

- `src/lib/utils/webhook.ts:3-13` — `WebhookEvent` union (`appointment_confirmed` at `:8`)
- `src/lib/utils/webhook.ts:20-52` — `fireWebhook` (no idempotency tokens; 10s AbortSignal timeout)

### State machine (relevant context)

- `src/lib/appointments/status-transitions.ts:15-22` — `STATUS_TRANSITIONS` map (pending → [confirmed, cancelled, no_show])
- `src/app/api/pos/appointments/[id]/route.ts:236-251` — Server-side enforcement (POS)

### Memory #30 boundary verification

- No code reference to literal `agent_2801kmgybk7rebrsvndpv3bv6dqn` — verified via grep
- No code reference to "Ashley" / "Retell AI" / "retell" — verified via grep
- `ELEVENLABS_AGENT_ID` is supplied entirely via env (`voice-calls-poll/route.ts:8`); the Tom persona name appears in `initiation/route.ts:314` (greeting) and `system-prompt.ts:41` (SMS persona) — both Smart Details surfaces, no cross-contamination

---

**END OF DOCUMENT — Phase 0.1 audit deliverable**

*Next action: operator reviews findings, locks F.1–F.6 decisions where applicable, verifies E.3 n8n receiver idempotency. Once E.3 verdict is non-BLOCKED, Session 1.5 may fire. Phase 3 AC-11 enforcement scope estimate depends on F.1–F.5 lockings.*
