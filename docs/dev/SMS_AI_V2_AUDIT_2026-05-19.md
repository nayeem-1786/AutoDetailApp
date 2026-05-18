# SMS AI v2 — Design-Input Audit

**Date:** 2026-05-19
**Scope:** Catalog the voice-agent tool endpoints + current SMS handler architecture
so the v2 design (an Anthropic tool-using agent that replaces the single-shot
auto-responder) can be built on top of existing infrastructure rather than
parallel to it.
**Status:** Audit-only. **No code was modified.** Output is design input for the
follow-up SMS AI v2 design session.

---

## TL;DR

- Voice-agent ships **14 endpoints** (10 of which match the brief's named tool
  list, plus 4 the prompt didn't enumerate: `context`, `quotes`, `initiation`,
  `send-quote-sms`). All 14 are `Bearer` auth via `business_settings.voice_agent_api_key`,
  return JSON, and are independent of session identity — every call carries
  `phone` (or a quote ID) so they can be invoked by ANY caller, voice OR SMS,
  without modification. SMS AI v2 can reuse them as-is.
- Current SMS handler is a **single synchronous flow**: validate → load context →
  one `fetch` to Anthropic → optionally parse `[GENERATE_QUOTE]` block →
  send + log → ACK. No tool loop, no async, no return-early. The whole pipeline
  runs inside Twilio's webhook window.
- The **specialty-vehicle staff notification path IS wired** in the SMS
  handler at `route.ts:636-669` — it calls `renderSmsTemplate('staff_notification_inbound_specialty', …)`
  then `sendSms()` to recipients pulled from `sms_templates.recipient_phones`
  (or `business_phone` fallback). The path is reachable. **Most likely cause
  of the user not receiving the alert:** `staff_notification_inbound_specialty.recipient_phones`
  is still `NULL` post-seed (migration `20260427000006_seed_specialty_sub_slugs.sql`
  intentionally leaves it NULL so admins configure per-slug recipients in the
  UI). The fallback `[biz.phone]` writes to `business_settings.business_phone`
  — which is the storefront line, not the owner's mobile. **The voice-agent's
  `notify_staff` endpoint (`/api/voice-agent/notify-staff`) has the IDENTICAL
  fallback logic** — so the SMS handler's path is not architecturally broken;
  the failure is a config gap. Recommendation: SMS AI v2's tool-handler for
  `notify_staff` calls the existing voice-agent endpoint (or its underlying
  helper), inherits the same recipient_phones config, and reuses one canonical
  send path.
- **Twilio webhook timeout:** Twilio considers a webhook failed if it doesn't
  receive a 200 response within **15 seconds** (Twilio docs; the doc that
  governs Messaging webhooks is "Messaging webhooks > Connect overrides"). The
  current handler's worst-case is well under that — single Anthropic call
  ~1-3s. **An Anthropic tool-using agent with 3-5 tool round-trips will
  blow that budget on cold starts.** SMS AI v2 MUST adopt the return-early
  pattern the voice agent's `finalize-call` endpoint already uses
  (`finalize-call/route.ts:70-105`): ACK Twilio immediately with empty TwiML,
  then run the tool-loop in background. The customer's reply arrives via
  outbound `sendSms()` from the background task. This is a one-line architecture
  change but it's the most important constraint in the v2 design.

---

## 1. Tool Endpoint Catalog

All 14 voice-agent endpoints. Auth is uniform: `validateApiKey` reads
`Bearer <token>` from the `Authorization` header and compares against the
single `business_settings.voice_agent_api_key` row. There is **no per-tool
scoping** — possessing the key authorizes every endpoint. SMS AI v2 can use
the same key.

Common shape:

| Property | Value |
|---|---|
| Auth helper | `validateApiKey(request)` — `src/lib/auth/api-key.ts:1-43` |
| Auth header | `Authorization: Bearer <voice_agent_api_key>` |
| DB client | `createAdminClient()` (service role — bypasses RLS) |
| Content type | `application/json` for POST; query params for GET |
| Error shape | `{ error: string }` with appropriate HTTP status |
| Perf tracking | `createPerfTimer()` on every endpoint — emits a console log line per call |

### 1.1 Endpoint inventory

| # | Brief's name | Repo path | Method | Notes |
|---|---|---|---|---|
| 1 | `lookup_customer` | `src/app/api/voice-agent/customers/route.ts` | GET | Phone-based lookup. Returns customer + vehicles + upcoming-appt count. |
| 2 | `get_services` | `src/app/api/voice-agent/services/route.ts` | GET | Full service catalog with pricing tiers + addons + prerequisites. ~18KB. |
| 3 | `classify_vehicle` | `src/app/api/voice-agent/vehicle-classify/route.ts` | GET | Returns `size_class`, `vehicle_category`, `tier_name`, `needs_year_confirmation`. |
| 4 | `check_availability` | `src/app/api/voice-agent/availability/route.ts` | GET | Returns 30-min slots for a date, given service duration + business hours. Honors `expected_day` cross-check. |
| 5 | `create_appointment` | `src/app/api/voice-agent/appointments/route.ts` | POST | Two paths: direct service+vehicle booking OR quote_id conversion. Both write `appointments` + `appointment_services` rows, fire booking webhook, send `appointment_confirmed` SMS (if consent). Default status `pending`. |
| 6 | `send_info_sms` | `src/app/api/voice-agent/send-info-sms/route.ts` | POST | 6 info types: `store_info`, `product_link`, `category_link`, `service_page`, `booking_link`, `quote_link`. All return short-linked URLs. |
| 7 | `finalize_call` | `src/app/api/voice-agent/finalize-call/route.ts` | POST | **Voice-only.** Background-processes the transcript via `processVoiceCallEnd()`. Returns 200 immediately. SMS AI v2 skips this. |
| 8 | `get_products` | `src/app/api/voice-agent/products/route.ts` | GET | Lightweight catalog — dedupes variant groups to the cheapest member. ~38KB. |
| 9 | `get_product_details` | `src/app/api/voice-agent/products/details/route.ts` | GET | Detailed lookup by `search=` string. Max 5 results. ~1-6KB. |
| 10 | `notify_staff` | `src/app/api/voice-agent/notify-staff/route.ts` | POST | Renders `staff_notification` template + sends to `recipient_phones`. Six escalation reasons. **This is the path SMS AI v2 should reuse** — see §3. |
| —  | (not in brief) | `src/app/api/voice-agent/context/route.ts` | GET | Unified single-call snapshot — customer + vehicles + appointments + quotes + last 20 messages. Voice agent's primary context primer. Equally useful for SMS AI v2's initial prompt. |
| —  | (not in brief) | `src/app/api/voice-agent/quotes/route.ts` | POST | Creates a quote from a `services[]` array. Distinct from `send-quote-sms`: this one only creates; SMS variant creates AND texts the link. |
| —  | (not in brief) | `src/app/api/voice-agent/initiation/route.ts` | GET | ElevenLabs call-initiation handler. Voice-only — SMS AI v2 skips. |
| —  | (not in brief) | `src/app/api/voice-agent/send-quote-sms/route.ts` | POST | Resolves comma-separated service names → creates quote → renders `quote_sms_midcall` slug → texts the link. Useful primitive for SMS AI v2's "send me the quote" tool. |

### 1.2 Per-endpoint detail

For each endpoint: input shape, output shape, side effects, error modes.
All errors return `NextResponse.json({ error: string }, { status: HTTP_CODE })`
unless noted.

#### `customers` (GET) — lookup_customer

- **Input:** `?phone=<E.164 or formatted>`
- **Output:**
  ```ts
  { customer: {
      id, first_name, last_name, phone, email, loyalty_points_balance,
      vehicles: [{ id, vehicle_type, size_class, year, make, model, color }],
      upcoming_appointments: number  // count, not list
  }}
  ```
- **Side effects:** None — read-only.
- **Errors:**
  - 400 `Missing required parameter: phone`
  - 400 `Invalid phone number` (fails E.164 normalize)
  - 404 `Customer not found`
  - 500 `Internal server error`

#### `services` (GET) — get_services

- **Input:** None.
- **Output:** `{ services: [<formatted service>, …] }` where each service has
  `id, name, description, category, classification, duration_minutes,
  pricing_model, mobile_eligible, vehicle_compatibility, special_requirements,
  pricing: [{ tier_name, price, sale_price?, note? }], addon_suggestions,
  prerequisites`.
- **Side effects:** None — read-only.
- **Errors:** 500 on query failure.
- **Notable:** Pricing flows through `resolveServicePriceWithSale` (canonical
  engine per CLAUDE.md Rule 22) — `vehicle_size`, `scope`, `specialty`, `flat`,
  `per_unit`, `custom` each branch through the engine.

#### `vehicle-classify` (GET) — classify_vehicle

- **Input:** `?make=&model=&year=&color=` — only `make` is required.
- **Output:**
  ```ts
  { make, model, year, color,
    vehicle_category: 'automobile'|'motorcycle'|'rv'|'boat'|'aircraft',
    size_class: 'sedan'|'truck_suv_2row'|'suv_3row_van'|'exotic'|'classic'|null,
    specialty_tier: string|null,
    tier_name: string,           // human-friendly label
    seat_rows: number|null,
    needs_year_confirmation: boolean }
  ```
- **Side effects:** None — read-only.
- **Errors:** 400 if `make` missing.
- **Notable:** This is the right call to MITIGATE the specialty-vehicle pivot
  bug. SMS AI v2 can call `classify_vehicle` on the inbound vehicle (whatever
  the customer mentions in the body) before deciding whether to engage the
  specialty pivot — instead of blindly checking the customer's saved
  vehicles like the broken pivot does.

#### `availability` (GET) — check_availability

- **Input:** `?date=YYYY-MM-DD&service_id=<uuid>&expected_day=monday`
  (last two optional).
- **Output:** `{ date, slots: ['09:00', '09:30', …] }` OR `{ error: 'day_mismatch',
  message, requested_date, requested_day, actual_day, corrected_date,
  corrected_date_formatted }` when the agent's expected day doesn't match the
  actual day-of-week.
- **Side effects:** None — read-only.
- **Errors:** 400 on missing/invalid date.
- **Notable:** Uses `America/Los_Angeles` for day-of-week and slot math, per
  CLAUDE.md Critical Rule 1.

#### `appointments` (GET) — return upcoming appointments

- **Input:** `?phone=<E.164>`
- **Output:** `{ appointments: [{ id, date, start_time, end_time, status,
  channel, is_mobile, mobile_address, total_amount, notes, services: [{
  service_id, name, price, tier_name }] }] }`. Empty list if no customer.
- **Side effects:** None.

#### `appointments` (POST) — create_appointment

- **Input:**
  ```ts
  { customer_name, customer_phone,
    service_id?  OR  quote_id?,        // exactly one required
    date, time,
    vehicle_year?, vehicle_make?, vehicle_model?, vehicle_color?,
    notes? }
  ```
  Phone normalized to E.164. Time normalized from 12h or 24h.
- **Output:** `{ success: true, appointment: { id, date, start_time, end_time,
  status, channel, customer_id, service }}` (direct path) or `{ success: true,
  converted_from_quote, appointment: {…, services: '<joined names>' }}` (quote
  path). HTTP 201.
- **Side effects (direct path):**
  - INSERT customer if not found (`sms_consent: true` — implied via phone call).
  - INSERT/MATCH vehicle via `findOrCreateVehicle`.
  - INSERT `appointments` row (status `pending`, channel `phone`).
  - INSERT `appointment_services` row.
  - **SMS:** `appointment_confirmed` template via `buildAppointmentConfirmationSms`
    → `sendSms()` with `logToConversation: true`. Only fires if `sms_consent`.
  - INSERT system message into conversation thread (channel `voice` so it
    renders as a notification banner).
  - Fire `booking_created` webhook via `fireWebhook()`.
- **Side effects (quote path):**
  - Resolves `Q-XXXX` → UUID if quote_number is passed.
  - Delegates to `convertQuote()` from `src/lib/quotes/convert-service.ts` —
    creates appointment + appointment_services from quote items, updates quote
    status to `converted`.
  - SMS + system message + webhook fire identically to direct path.
- **Errors:**
  - 400 missing required fields
  - 400 invalid phone / unknown quote
  - 400 service not found
  - 404 `Quote ${quote_id} not found`
  - 409 `This time slot is no longer available` (overlap check)
  - 500 on DB failures

#### `send-info-sms` (POST) — send_info_sms

- **Input:**
  ```ts
  { phone, type: 'store_info'|'product_link'|'category_link'|'service_page'|'booking_link'|'quote_link',
    identifier?: string }  // required for non-store/booking types
  ```
- **Output:** `{ success: true, type }`.
- **Side effects:** Lookup customer (by phone), construct URL appropriate to
  the type (place-id-aware Maps URL for store_info), build short link via
  `createShortLink`, send SMS via `sendSms` with `logToConversation: true`,
  `notificationType: 'voice_info_<type>'`, `contextId` set to the relevant
  entity UUID. No DB writes other than what `sendSms` does (delivery log +
  conversation message).
- **Errors:** 400 invalid type, 400 missing identifier, 400 not found, 500
  on SMS failure.

#### `finalize-call` (POST) — finalize_call

- **Input:** `{ phone, customer_name, transcript_summary, services_discussed,
  appointment_booked, customer_interest, call_duration_seconds,
  elevenlabs_conversation_id, vehicle_year/make/model/color, customer_type }`
- **Output:** `{ success: true }` returned **immediately** (no await on
  background work).
- **Side effects (async):** `processVoiceCallEnd()` writes a voice-call summary,
  potentially creates a quote, sends a follow-up SMS, etc.
- **Notable:** **This is the return-early pattern SMS AI v2 should mirror.** The
  comment at `finalize-call/route.ts:70-77` explains it directly. The agent
  framework times out at ~3s, so the endpoint ACKs first and processes async;
  PM2 keeps the Node process alive long enough for the background work to
  finish.

#### `products` (GET) — get_products

- **Input:** None.
- **Output:** `{ products: [{ name, category, price, on_sale, in_stock,
  variants: 'Also in: …'|null }] }`.
- **Side effects:** None.
- **Notable:** Variant groups are deduped to the cheapest member — keeps
  response under ~38KB for 300 products.

#### `products/details` (GET) — get_product_details

- **Input:** `?search=<term>` — case-insensitive ILIKE on name + description.
- **Output:** `{ products: [{ name, category, retail_price, sale_price,
  in_stock, stock_qty, description, specs, vendor, product_url,
  variants: [{ label, price, sale_price, in_stock }]|null }] }`. Max 5.
- **Side effects:** None.

#### `notify-staff` (POST) — notify_staff

- **Input:**
  ```ts
  { customer_name, customer_phone, reason: 'appointment_change'|'custom_quote'
    |'beyond_scope'|'transfer_request'|'mobile_distance'|'other',
    details }
  ```
- **Output:** `{ success: true|false }` — note: errors return `status: 200` with
  `success: false` so the agent doesn't retry. (Compare against most other
  endpoints, which use proper 4xx/5xx.)
- **Side effects:**
  - Renders `staff_notification` template via `renderSmsTemplate`. Engine
    auto-injects `business_name/phone/address`; caller passes
    `customer_name, customer_phone, reason_label, details`. If template is
    inactive (admin toggled off), returns success without sending.
  - Recipients pulled from `sms_templates.recipient_phones` for the
    `staff_notification` row; falls back to `[biz.phone].filter(Boolean)`
    if NULL.
  - Sends SMS to each recipient via `sendSms()` — **NOT logged to a customer
    conversation** (these go to staff).
  - Inserts a system message into the customer's conversation thread for
    operator audit (channel `voice`).
- **Errors:** Returns `{ success: false }` with status 200 on missing fields
  or template-misconfig.
- **Notable:** Six reason values cover the voice-agent's escalation surface.
  SMS AI v2 may want to extend this (e.g., `inbound_specialty` to mirror the
  current SMS-handler path — see §3) OR pass the existing slug-specific
  reasons.

#### `context` (GET) — unified context primer (not in brief)

- **Input:** `?phone=<E.164>`
- **Output:**
  ```ts
  { customer: <full profile w/ vehicles, upcoming_appointments, recent_quotes>
              | null,
    conversation: { id, status, is_ai_enabled, summary, last_message_at,
                    last_channel, messages: [<last 20>] } | null,
    is_new_caller: boolean }
  ```
- **Side effects:** None.
- **Notable:** Most efficient single call to bootstrap an SMS AI v2 turn.
  **SMS AI v2 should call this at turn 1** rather than reissuing 5 separate
  queries (vehicles, appointments, quotes, messages, customer profile) as
  the current SMS handler does at `webhooks/twilio/inbound/route.ts:520-558`.

#### `quotes` (POST) — create a quote (not in brief)

- **Input:** `{ customer_name, customer_phone, services: [{ service_id, tier_name? }],
  vehicle_year/make/model/color, notes, send_sms: boolean }`
- **Output:** `{ success: true, quote: { id, quote_number, status, subtotal,
  total_amount, valid_until, sent_at, created_at, items: […] }}` HTTP 201.
- **Side effects:** Find-or-create customer, find-or-create vehicle, INSERT
  quotes row, INSERT quote_items rows, fire webhook (`quote_created` or
  `quote_sent`), insert system message in conversation.
- **Errors:** 400 missing fields, 400 service not found, 500 on DB error.

#### `send-quote-sms` (POST) — create + text a quote (not in brief)

- **Input:** `{ phone, customer_name?, services: 'comma,separated,names',
  vehicle_year/make/model/color }`
- **Output:** `{ success: true, quote_number, quote_link }`.
- **Side effects:** Find-or-create customer, find-or-create vehicle, resolve
  services by name (sedan tier default — no vehicle pricing context yet),
  create quote via `createQuote()`, mark `status: sent`, build short link,
  render `quote_sms_midcall` template, sendSms with `logToConversation: true`,
  insert `quote_communications` row.
- **Notable:** Has its own service-name resolver (`resolveServiceByName`) and
  uses `resolvePrice` (canonical engine). The "sedan default" comment at
  line 79-82 is honest — service resolution needs a size hint before vehicle
  classification has happened.

#### `initiation` (GET) — ElevenLabs call-start hook (not in brief)

- **Input:** Query params from ElevenLabs (call SID, caller phone, etc).
- **Output:** ElevenLabs-compatible JSON containing the agent's dynamic
  variables and initial system-prompt fragment.
- **Notable:** Voice-only. SMS AI v2 skips.

### 1.3 Cross-cutting observations

- **No request-level rate limiting.** Any endpoint can be hit as fast as the
  caller wants. SMS AI v2 inherits this — the existing
  `MAX_AI_REPLIES_PER_HOUR = 25` per-conversation cap in `webhooks/twilio/inbound/route.ts:45`
  is enforced at the SMS-handler layer, not at the tool-endpoint layer. That's
  still correct: per-conversation throttling belongs above the tool loop.
- **Phone is the join key.** Every customer-touching endpoint accepts `phone`
  as the primary lookup. SMS AI v2 already has the phone (from the Twilio
  `From` field) — the tool calls become straightforward parameter passes.
- **`logToConversation: true`** is opt-in via `sendSms()` options
  (`src/lib/utils/sms.ts:30-37`). All endpoints that text a customer (the
  appointment confirmation, send-info-sms, send-quote-sms) set it, so the
  customer's messaging thread accumulates a coherent record even when the
  texts originate from different tools.

---

## 2. Current SMS Handler Architecture

### 2.1 Request flow (Twilio inbound → response sent)

`src/app/api/webhooks/twilio/inbound/route.ts:223-948` — single `POST(request)`
function.

```
Twilio webhook POST
  │
  ├── 1. Parse multipart form (params.From, params.Body, MessageSid, MediaUrl0)
  │   Lines: 225-255
  │
  ├── 2. Validate `x-twilio-signature` (HMAC-SHA1 against TWILIO_AUTH_TOKEN)
  │   Lines: 234-243
  │   Skipped in NODE_ENV=development.
  │   Invalid signature → 403 + <Response/> + EXIT.
  │
  ├── 3. Customer lookup by `customers.phone = normalizePhone(From)`
  │   Lines: 263-272.  customerId may be null (unknown number).
  │
  ├── 4. STOP/START keyword handling (TCPA — ALWAYS runs, even with two_way_sms off)
  │   Lines: 279-364.
  │   Calls updateSmsConsent() → mutates customers.sms_consent + sms_consent_log.
  │   If two_way_sms enabled, also writes a system message to the conversation
  │   thread and sets `is_ai_enabled = isStartWord`.
  │   EXIT with empty TwiML after consent processed.
  │
  ├── 5. Feature flag gate: `two_way_sms`
  │   Lines: 371-375.  If off → ACK + EXIT. No conversation logging.
  │
  ├── 6. Find or create conversation
  │   Lines: 380-438.
  │   New conversation defaults: is_ai_enabled=true, status=open, unread_count=1.
  │   Existing conversation: bump last_message_at, last_message_preview, unread_count.
  │   Reopened conversations (was closed/archived) get a system message
  │   "Conversation reopened — customer re-engaged" (channel: voice).
  │
  ├── 7. Insert inbound message
  │   Lines: 443-452.  sender_type='customer', channel='sms', twilio_sid set.
  │
  ├── 8. Auto-reply decision
  │   Lines: 457-691.
  │   Pull `messaging_ai_unknown_enabled` + `messaging_ai_customers_enabled`.
  │   Compute shouldAiReply (line 482-487):
  │     conversation.is_ai_enabled
  │       && (unknown→aiEnabledForUnknown OR customer→aiEnabledForCustomers OR
  │           !duringBusinessHours)
  │   If true:
  │     8a. Rate limit: count AI messages in last hour, cap at 25.
  │     8b. Load history (last 100 messages, filter out voice-channel system msgs).
  │     8c. Load customer context (5 parallel queries: customer, transactions,
  │         vehicles, appointments, quotes) and shape into CustomerContext.
  │     8d. SPECIALTY PIVOT (lines 612-674):
  │         Re-queries vehicles for size_class IN ('exotic','classic').
  │         If match → builds hardcoded autoReply + fires staff_notification_inbound_specialty
  │                    → disables AI on conversation.
  │         Else → calls getAIResponse(history, body, ctx, …)
  │
  ├── 9. Auto-quote extraction
  │   Lines: 696-864.
  │   Parse [GENERATE_QUOTE]...[/GENERATE_QUOTE] from autoReply.
  │   If present: find-or-create customer + vehicle, resolve services, create
  │   quote via createQuote(), mark status=sent, build short link, append link
  │   to autoReply.
  │
  ├── 10. Addon authorization extraction
  │   Lines: 869-913.
  │   Parse [AUTHORIZE_ADDON:<id>] / [DECLINE_ADDON:<id>] blocks.
  │   Call approveAddon() / declineAddon() per ID.
  │   If addon expired, send 'addon_authorization_expired' template SMS.
  │
  ├── 11. Send + log outbound SMS chunks
  │   Lines: 916-941.
  │   splitSmsMessage(autoReply, 320) → loop sendSms(chunk) → insert message
  │   row per chunk (sender_type='ai', channel='sms') → update conversation
  │   last_message_at/preview.
  │
  └── Return <Response/> 200 (lines 943).
```

**No async path.** Every step is awaited in series. The synchronous total
defines the latency budget — see §4.

### 2.2 `conversations.is_ai_enabled` lifecycle (re-stated from prior audit)

Already documented in `docs/dev/SMS_AI_AUTOREPLY_AUDIT_2026-05-19.md:82-124`.
The seven write paths and their semantics are unchanged.

For SMS AI v2, the key invariant is: **the v2 agent must respect `is_ai_enabled`
the same way today's handler does.** When staff disables AI (manual reply,
specialty pivot, STOP keyword), the v2 agent does not fire.

### 2.3 Rate limiting (`MAX_AI_REPLIES_PER_HOUR = 25`)

`webhooks/twilio/inbound/route.ts:45, 491-500`. Counts outbound `sender_type='ai'`
messages in the last hour for the conversation. Both real AI replies AND
specialty-pivot canned replies count.

SMS AI v2 should keep this gate. If we move to tool-using mode where one "turn"
may involve multiple Anthropic API calls (tool round-trips), it still produces
exactly one outbound SMS per turn — the cap continues to make sense.

### 2.4 Business hours / audience-pill logic

`webhooks/twilio/inbound/route.ts:474-487`.

```ts
const aiEnabledForUnknown  = settings.messaging_ai_unknown_enabled  === 'true';
const aiEnabledForCustomers = settings.messaging_ai_customers_enabled === 'true';
const aiMasterEnabled       = aiEnabledForUnknown || aiEnabledForCustomers;
const duringBusinessHours   = isWithinBusinessHours(hours);

const shouldAiReply = conversation.is_ai_enabled && aiMasterEnabled &&
  (!duringBusinessHours
    || (isUnknown  && aiEnabledForUnknown)
    || (isCustomer && aiEnabledForCustomers));
```

Semantics: during hours, audience pills are enforced. After hours, AI handles
**all** audiences (matches the default-prompt's "AFTER HOURS" instructions
in `messaging-ai-prompt.ts:53-57`).

SMS AI v2 inherits this verbatim — no design choice needed.

### 2.5 Customer context loading

`webhooks/twilio/inbound/route.ts:520-558` — 5 parallel queries:

1. `customers` — profile + loyalty + engagement metrics
2. `transactions` (last 10) — transaction items joined
3. `vehicles` (all) — year/make/model/color/vehicle_type/size_class
4. `appointments` (upcoming, max 5) — with services joined
5. `quotes` (last 3, soft-delete filtered) — with quote_items joined

Result is shaped into `CustomerContext` (`messaging-ai.ts:284-321`) and
appended to the system prompt by `getAIResponse()`.

**v2 candidate refactor:** the voice-agent's `/api/voice-agent/context`
endpoint (§1.2) returns exactly this shape in one call. SMS AI v2 should call
that endpoint (or its underlying helper, once we extract one — see §5) instead
of duplicating the 5-query block.

### 2.6 Anthropic call shape (today)

`src/lib/services/messaging-ai.ts:482-495`:

```ts
fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt,
    messages,
  }),
});
```

- **Model:** `claude-sonnet-4-20250514` — Sonnet 4, NOT 4.6/4.7. Migration to
  4.6/4.7 is orthogonal to SMS AI v2 but should be paired with this work.
- **No prompt caching** — `cache_control` blocks are not used. For the v2
  tool-loop, prompt caching becomes high-value (system prompt is large and
  static across tool round-trips). The Anthropic SDK skill should be consulted
  when v2 is implemented.
- **System prompt:** built once per call by `buildSystemPrompt()`
  (`messaging-ai.ts:19-224`) — behavioral prompt + service catalog + business
  info + active coupons + optional product context + optional pending addon
  context.
- **Messages array:** last 100 history messages, system-channel-voice msgs
  filtered out, then push the inbound body as the final `{ role: 'user' }`.

### 2.7 Specialty-vehicle pivot mechanics

`webhooks/twilio/inbound/route.ts:612-674` — full repro in the prior audit
(`docs/dev/SMS_AI_AUTOREPLY_AUDIT_2026-05-19.md:200-254`).

For SMS AI v2 design purposes, the relevant takeaway is: **this pivot is dead
weight if v2 is implemented correctly.** Once the agent has `classify_vehicle`,
`notify_staff`, and the customer's saved vehicles in context, it can detect
the specialty case AND decide whether the current inbound is about that vehicle
(versus a different car the customer also owns) — the very gap that bug A
in the prior audit identified. The pivot block should be deleted as part of
the v2 cutover, not preserved.

### 2.8 Staff notification mechanics today

Two distinct staff-notification paths exist:

**Path A — voice agent escalation:** `src/app/api/voice-agent/notify-staff/route.ts`.
Slug: `staff_notification`. Recipients: `sms_templates.recipient_phones` for the
`staff_notification` row, fallback to `[biz.phone]`. Working — this is the
production-proven path.

**Path B — SMS handler specialty pivot:** `webhooks/twilio/inbound/route.ts:636-669`.
Slug: `staff_notification_inbound_specialty` (Session 2F sub-slug). Recipients:
`sms_templates.recipient_phones` for that sub-slug row, fallback to `[biz.phone]`.
**Architecturally identical** to Path A — same template engine, same fallback.

The user's observation that no staff SMS arrived during the Ferrari test is
investigated in §3 below.

---

## 3. Staff Notification Investigation

**Symptom:** User sent test inbound SMS from a Ferrari-owning customer.
Specialty pivot fired (canned Ferrari reply was sent). No staff notification
arrived at the user's phone.

### 3.1 Is the code path reachable?

**Yes.** Trace:

1. `route.ts:482-487` → `shouldAiReply` true (assuming AI master enabled,
   conversation flag true, business hours allow).
2. `route.ts:614-625` → vehicles query returns specialty match → `hasSpecialtyVehicle = true`.
3. `route.ts:633-669` → enters specialty branch:
   - Builds hardcoded `autoReply` (line 634).
   - Renders `staff_notification_inbound_specialty` template (lines 643-658).
   - Builds recipients (lines 660-662):
     ```ts
     const recipients = templateResult?.recipientPhones?.length
       ? templateResult.recipientPhones
       : [biz.phone].filter(Boolean);
     ```
   - Sends SMS to each recipient (lines 663-666).
4. `route.ts:672` → disables AI on conversation.

No early-return short-circuits this block. The path is reachable.

### 3.2 Is there a config gate?

**Yes — `sms_templates.recipient_phones` is the gate.**

The seed migration `supabase/migrations/20260427000006_seed_specialty_sub_slugs.sql:35-56`
explicitly leaves `recipient_phones` unset (defaults to NULL per column default):

> Both are `recipient_type='staff'` with `recipient_phones=NULL` (defaults to the
> business phone). Operators can later set per-slug recipient phones via the
> admin UI's recipient editor.

So in a clean install, `recipient_phones IS NULL` → fallback path is
`[biz.phone].filter(Boolean)` → SMS goes to `business_settings.business_phone`.

**Where does `business_phone` point?** `src/lib/data/business.ts:71` reads
`business_settings.business_phone`, falling back to `BUSINESS_DEFAULTS.phone =
'+14242370913'` (`src/lib/data/business-defaults.ts:12`).

That number is the **storefront line** — NOT the owner's mobile. If the user
isn't watching SMS to the storefront, the notification arrived but went to a
phone they don't monitor.

### 3.3 Other possible silent-failure modes

In rough order of likelihood:

1. **(Most likely)** `recipient_phones IS NULL` → fallback to a storefront/landline
   that doesn't receive SMS or that isn't routed to the user's monitoring device.
   **Fix:** Admin → SMS templates → `staff_notification_inbound_specialty` →
   add the owner's mobile to `recipient_phones`.
2. **Template is_active = false.** If the operator toggled the
   `staff_notification_inbound_specialty` row off in the admin UI,
   `renderSmsTemplate` returns `body=''` and `isActive=false`. The code at
   route.ts:659 does `templateResult?.body || staffMsg` so it falls through
   to the hand-built `staffMsg` (line 640) — meaning a body IS sent. But this
   is path-condition tangled with point 1: even with `staffMsg`, recipients
   still come from `recipientPhones || [biz.phone]`. **Same downstream
   destination problem.**
3. **Twilio outbound silently rejected.** `sendSms()` returns `{ success: false,
   error: '…' }` and the catch at route.ts:667-669 logs but doesn't surface.
   Possibilities: A2P 10DLC rejection (30034), unverified recipient (trial
   account), recipient opted out of marketing class (unlikely for staff
   numbers but possible). The `[SMS DEBUG]` log line at `sms.ts:95` would
   confirm the outbound was attempted. **Action:** check server logs for
   `[SMS DEBUG]` lines around the test's timestamp.
4. **Template not seeded.** If migration `20260427000006_seed_specialty_sub_slugs.sql`
   hasn't run on the user's local DB, the template row is absent. `renderSmsTemplate`
   returns `{ body: fallback, isActive: true, recipientPhones: null }` — so
   the hand-built `staffMsg` IS sent to `[biz.phone]`. **Same destination
   problem.** This is verifiable by querying `SELECT slug FROM sms_templates
   WHERE slug = 'staff_notification_inbound_specialty';`.
5. **`biz.phone` resolves to an empty string** (e.g., `business_settings.business_phone`
   was set to `''` rather than removed). Then `[biz.phone].filter(Boolean)` = `[]`,
   the for-loop iterates 0 times, no SMS is sent. Silent. Verifiable in admin.

### 3.4 Compare: does the voice-agent's `notify_staff` work?

Yes, per design. Same fallback logic — but the voice agent's
`staff_notification` slug is the original (pre-Session-2F) staff escalation
template. Operators were prompted to set its `recipient_phones` when it
shipped. The newer `staff_notification_inbound_specialty` sub-slug post-dates
that operator setup and may have never been configured.

### 3.5 Recommendation for SMS AI v2

**Reuse the voice-agent path.** Two options:

- **Option a (simpler):** SMS AI v2's `notify_staff` tool calls the existing
  `/api/voice-agent/notify-staff` endpoint (via `fetch` or direct function
  call). One slug (`staff_notification`), one recipient_phones config, one
  send path. No new sub-slugs.
- **Option b (cleaner):** Extract the `notify-staff` body into a helper
  (`src/lib/services/staff-notification.ts`) and have both the voice-agent
  endpoint and the SMS AI v2 tool call it directly. This is the "shared code"
  candidate in §5.

Either way, **delete `staff_notification_inbound_specialty`** as part of the
v2 cutover. The reason for the sub-slug (specialty vehicles need a different
recipient list and template body) no longer holds if the v2 agent is
context-aware — the agent passes `reason: 'custom_quote'` + `details:
'<vehicle info + customer message excerpt>'` and the staff member gets the
same actionable alert.

---

## 4. Anthropic Tool-Use Integration Plan

### 4.1 Twilio webhook timeout behavior

- **15-second timeout** is Twilio's documented maximum for SMS webhooks. After
  15s without a 200 response, Twilio considers the request failed and may
  retry (depending on the messaging-service config). For idempotency we'd
  rather not get retried — we can de-dup on `MessageSid` but the cost is
  duplicate processing partway through.
- Twilio does **not** wait for the webhook to do extra work after the 200 is
  received — the body of the 200 is the TwiML response. An empty `<Response/>`
  body means "ACK received, nothing to send back." This is the pattern the
  current SMS handler uses (`route.ts:943`).
- The current single-shot Anthropic call lands in ~1-3s; total handler
  latency rarely exceeds 5s. Well within budget.

### 4.2 Return-early pattern (recommended)

Mirror `voice-agent/finalize-call`:

```ts
// pseudocode
export async function POST(request: NextRequest) {
  // (steps 1-7 unchanged — validate, parse, log inbound)

  // Decide whether to engage AI (steps 8 — same shouldAiReply gate)
  if (!shouldAiReply) {
    return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
  }

  // FIRE AND FORGET the AI tool loop — PM2 keeps process alive
  runSmsAiAgent({ conversation, customerId, body, phone })
    .catch((err) => console.error('[SmsAi v2] background fail:', err));

  // ACK Twilio immediately
  return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
}
```

The agent's outbound message is sent via `sendSms()` from the background task
(not from a TwiML body) — exactly the pattern the current handler already uses
at `route.ts:920` for multi-chunk replies. So no infrastructure changes are
needed for outbound delivery; only the response timing changes.

### 4.3 Latency budget (background task)

No hard ceiling — PM2 will not kill a running Node task. Practical ceiling is
the customer's tolerance for delay between sending a text and getting a
reply. Voice agent equivalent is ~3-5s; SMS is more forgiving (~10-15s feels
natural; >30s feels broken).

Per tool-loop component:

| Component | Typical | Cold-start worst case |
|---|---|---|
| Initial Anthropic call (system+history+tools) | 1-2s | 4s |
| Per tool round-trip (tool_use → tool execution → tool_result → next inference) | 0.5-1s | 2-3s |
| Final inference (after last tool returns) | 1-2s | 3s |
| `sendSms()` (Twilio API) | 0.3-0.5s | 1s |

Realistic 3-tool-call turn: 1s + (3 × 0.8s) + 1.5s + 0.5s = ~5.4s. Five-tool
turn: ~8s. Both comfortable under the 15-30s customer expectation.

### 4.4 Tool execution patterns

- **Parallelize independent tools.** Anthropic's tool-use response can return
  multiple `tool_use` blocks in one turn. If the agent wants both
  `lookup_customer` AND `get_services` on the first turn, both calls fire in
  parallel. Implementation: `Promise.all([…])` over the tool_use blocks.
- **Per-tool timeouts.** Wrap each tool call in a `Promise.race([call,
  timeoutAfter(5000)])` — fail-fast a hung endpoint rather than block the
  whole turn. Return `{ error: 'tool_timeout' }` as the `tool_result` content
  so the agent can recover gracefully (e.g., "Sorry, I couldn't look that up
  — let me try a different approach").
- **Retry policy.** Default to NO automatic retries on tool failures inside
  the loop. The model can decide to retry or not based on the
  `{ is_error: true, content: '…' }` tool_result. Adding library-level retries
  causes double-execution surprises for endpoints that have side effects
  (e.g., `create_appointment` is not idempotent).
- **Cap tool iterations.** Hard-cap at e.g. 6 tool-use round-trips per turn
  to bound worst-case latency and prevent loops. If the model hits the cap,
  inject a `stop_sequence` or force a final inference.

### 4.5 Prompt caching opportunity

The system prompt for SMS AI v2 will be 5-10× larger than today's (tool
definitions + per-tool docstrings + service catalog). It's static across all
turns of a conversation. Anthropic's prompt caching (`cache_control` blocks)
amortizes the cost: first turn pays full prompt-tokens, subsequent turns pay
~10% of that. Highly recommended for v2.

(The `claude-api` skill in this workspace has the canonical guidance for
caching strategy. Consult it during v2 implementation, per the skill's
trigger criteria.)

### 4.6 Idempotency / dedup

If Twilio retries the webhook (15s timeout exceeded due to background task
crash before ACK), the same `MessageSid` arrives twice. Current handler has
**no explicit MessageSid dedup** — it does insert with `twilio_sid: messageSid`
on the `messages` table but there's no unique constraint enforcing
single-insert.

For SMS AI v2 with return-early: ACK happens fast enough (<100ms) that
Twilio retries should be rare. But adding a unique index on `messages.twilio_sid`
(inbound rows) would harden against any retry surprises. **Out-of-scope for
v2 design but worth filing as a follow-up.**

---

## 5. Shared Code Inventory

Code that SMS AI v2 should reuse rather than rebuild. Listed as: target
helper → current location → how to share.

### 5.1 Customer context loading

- **Today:**
  - SMS handler queries 5 tables inline at `webhooks/twilio/inbound/route.ts:520-558`.
  - Voice agent has a clean unified endpoint at `voice-agent/context/route.ts`
    that returns the same shape minus transactions (transactions are
    SMS-AI-only context).
- **Recommendation:** Extract the data-loading body of `voice-agent/context`
  into `src/lib/data/customer-context.ts`. Both the voice agent endpoint AND
  the new SMS AI v2 turn-bootstrapper call it. SMS handler version adds the
  `transactions` query as a 6th parallel call (or leaves transactions out —
  see open question 7.4).

### 5.2 Conversation history fetching

- **Today:** SMS handler at `webhooks/twilio/inbound/route.ts:502-513` does
  `SELECT * FROM messages WHERE conversation_id = … ORDER BY created_at LIMIT 100`,
  then filters out voice-channel system messages in code. Voice agent's
  `context` endpoint does `LIMIT 20`, no filtering.
- **Recommendation:** Add a `getConversationHistory(conversationId, { limit,
  filterVoiceSystem })` helper to `src/lib/services/messaging-ai.ts` (already
  the messaging-AI namespace; logical home).

### 5.3 Customer find-or-create flows

- **Today:** Duplicated in 5+ places — both SMS handler quote path
  (`route.ts:705-744`), voice-agent appointments path
  (`appointments/route.ts:422-476`), voice-agent quotes path
  (`quotes/route.ts:72-108`), voice-agent send-quote-sms path
  (`send-quote-sms/route.ts:117-189`). Each variant has slightly different
  SMS-consent defaulting, name-normalization rules, and consent-log behavior.
- **Recommendation:** Extract `findOrCreateCustomer({ phone, name?, smsConsent?,
  customerType?, ipForConsentLog? })` into `src/lib/data/customer-flows.ts`.
  Replace all 5 call sites in a single PR before v2 work begins. NOT IN SCOPE
  for the v2 implementation itself — this is its own cleanup phase.

### 5.4 Vehicle find-or-create

- **Today:** Already shared! `findOrCreateVehicle()` in
  `src/lib/utils/vehicle-helpers.ts`. All voice-agent endpoints AND the SMS
  handler quote path use it. SMS AI v2's tool wrapper for
  `create_appointment` and `create_quote` flows already inherits this.

### 5.5 SMS sending

- **Today:** `sendSms()` and `sendMarketingSms()` in `src/lib/utils/sms.ts`
  are the canonical single chokepoint. Every voice-agent endpoint, the SMS
  handler, all admin/POS code, all cron jobs go through them. CLAUDE.md
  Rule 9 makes this mandatory. **No work needed for v2.** SMS AI v2's
  final-reply send + tool-driven sends all funnel here.

### 5.6 Notification dispatching (staff alerts)

- **Today:**
  - Voice agent: `voice-agent/notify-staff/route.ts` — wraps `renderSmsTemplate('staff_notification', …)`
    + recipient resolution + sendSms loop + customer-thread audit log.
  - SMS handler specialty pivot: `route.ts:636-669` — does the same thing
    inline against the `staff_notification_inbound_specialty` sub-slug.
- **Recommendation:** Extract a single `notifyStaff({ reason, customerName,
  customerPhone, details })` helper to `src/lib/services/staff-notification.ts`.
  Both the voice-agent endpoint AND the SMS AI v2 `notify_staff` tool call
  it. **Delete the inline specialty-pivot block and the sub-slug** as part of
  the v2 cutover (see §3.5).

### 5.7 Quote creation

- **Today:** `createQuote()` in `src/lib/quotes/quote-service.ts` is the
  shared primitive. `convertQuote()` in `src/lib/quotes/convert-service.ts`
  is the quote → appointment converter. Both already shared across voice
  agent paths and SMS handler auto-quote path. **No work needed.**

### 5.8 Short-link generation

- **Today:** `createShortLink()` in `src/lib/utils/short-link.ts`. Shared.

### 5.9 Business info / hours / settings

- **Today:** `getBusinessInfo()`, `getBusinessHours()`,
  `formatBusinessHoursText()`, `isWithinBusinessHours()` — all in
  `src/lib/data/business.ts` and `src/lib/data/business-hours.ts`. Shared,
  cached. **No work needed.**

### 5.10 Service pricing / catalog

- **Today:** Canonical engine `resolveServicePrice` / `resolveServicePriceWithSale`
  in `src/lib/services/picker-engine.ts` (CLAUDE.md Rule 22). Voice agent's
  `services` endpoint already routes all 6 pricing models through the engine.
  SMS AI v2's tool wrapper for `get_services` calls the endpoint as-is.

---

## 6. Design Constraints Surfaced

Things discovered during the audit that affect how v2 should be designed —
NOT bugs, but invariants to respect.

### 6.1 `messages.channel` is a per-message attribute, not a conversation attribute

Today's `conversations` table has `last_channel` (which channel the LATEST
message came in over) but each `messages` row independently carries `channel`
('sms', 'voice', sometimes 'voice' for system messages logged from voice
context into an SMS conversation). The voice agent freely writes
`channel: 'voice'` system messages into an SMS conversation's history
(`voice-agent/appointments/route.ts:700-708`), and the SMS handler filters
those out from AI context at `route.ts:511-513`.

**v2 implication:** the SMS AI tool calls can write messages to the
conversation thread with `channel: 'sms'` or `channel: 'voice'` depending on
intent (an inbound SMS reply = sms; a "system action took place" notification
banner = voice). The current convention is to use `voice` channel for system
banners that should NOT round-trip back into the model's context. **v2
should preserve this convention** — i.e., its system messages (e.g. "Quote
created", "Staff notified") should be `channel: 'voice'` so they don't
contaminate future turns' history.

### 6.2 `sender_type: 'ai'` is overloaded today

Outbound chunks from BOTH real AI replies and the specialty-pivot hardcoded
string get `sender_type: 'ai'` (`route.ts:926`). With v2 there's an opportunity
to distinguish:

- `sender_type: 'ai'` → real model-generated reply
- `sender_type: 'ai_tool'` → tool-driven message (e.g., quote SMS sent by the
  `send_info_sms` tool)
- `sender_type: 'system'` → existing — banners

OR keep one `'ai'` value and add a `metadata.source: 'ai_reply'|'tool_send'|
'pivot_canned'` field. Lower-impact, easier to migrate. **Worth deciding
during v2 design — out of scope for this audit.**

### 6.3 `voice_agent_api_key` shared with SMS AI v2 is fine, but consider per-caller scoping later

The single shared API key is currently fine — both the voice agent and the
SMS AI v2 server-side runtime are first-party. But if a third-party agent
runtime is ever added (e.g., a marketing agent that uses the same tools to
draft campaigns), per-caller scoping (`Bearer <prefix>.<token>` parsed into
caller-id + secret) becomes valuable. **Filed as future improvement, not a
v2 blocker.**

### 6.4 Tool tools that have side effects are not idempotent

`create_appointment`, `create_quote`, `send_info_sms`, `notify_staff`,
`send_quote_sms` all have write-side effects. If the model loops and calls
`create_appointment` twice on a turn (rare but possible), two appointments
get created. Mitigations:

- The agent's system prompt should explicitly forbid duplicate calls to
  side-effecting tools within a turn.
- Endpoints could grow optional idempotency keys (`Idempotency-Key` header),
  but that's significant retrofit.
- For v2 launch, **prompt-level mitigation is sufficient** if combined with
  the 6-iteration cap from §4.4.

### 6.5 `conversations` table assumes single-channel

`conversations.phone_number` is a single E.164 — the conversation is keyed by
phone. SMS + voice from the same number land in the same conversation. This
already works today and v2 should preserve it. **No schema change needed.**

### 6.6 The specialty pivot's `is_ai_enabled = false` write is independent of v2

If v2 keeps the "specialty vehicle → disable AI" behavior (using the
`notify_staff` tool, not the canned pivot), the toggle still needs to flip
off. The tool itself doesn't currently write `is_ai_enabled = false` — that's
done inline in the SMS handler after the pivot. **v2 design decision:** does
`notify_staff` (or a parallel `escalate_to_human` tool) write
`is_ai_enabled = false` as a side effect? If yes, document it. If no, the
calling code in the v2 SMS handler does it after the tool returns.

### 6.7 Message-history token budget

Today's handler passes up to 100 history messages with no token-budget check.
With v2's tool round-trips, the message history grows *per turn* (every
`tool_use` + `tool_result` pair adds to context). 100 history × ~50 tokens
each = ~5,000 tokens; plus 5 tool round-trips × ~500 tokens each = ~2,500;
plus the (now bigger) system prompt = ~3,000 tokens. Total ~10,500 input
tokens per final inference. **Fine for Sonnet 4.6/4.7** but worth setting
an explicit `max_history_messages` config knob so we can dial down if
prompt-token costs spike.

---

## 7. Open Questions for Product Owner

Decisions that need user input before the v2 design session can lock down.

### 7.1 Which Anthropic model?

`claude-sonnet-4-20250514` today. v2 implementation lines up nicely with a
move to `claude-sonnet-4-6` (latest GA Sonnet) for the tool-using loop, and
optionally `claude-haiku-4-5-20251001` for cheap pre-classification calls
(e.g. "is this inbound about a specialty vehicle?"). **Recommendation:**
Sonnet 4.6 for the main loop, Haiku 4.5 for any helper classifications.
**Confirm with user.**

### 7.2 Does v2 replace OR coexist with the current AI?

Two paths:

- **Replace:** Delete the single-shot `getAIResponse` path entirely; all SMS
  AI traffic flows through the tool-using agent.
- **Coexist:** Keep `getAIResponse` for short / cheap replies, add a "router"
  step that picks tool-loop vs single-shot. Adds complexity without obvious
  value.

**Recommendation:** Replace. The tool-loop handles "short and cheap" naturally
— if the model needs no tools, it returns one inference with no tool_use
blocks and no extra latency.

### 7.3 Cutover plan for the specialty-vehicle pivot

Three options:

- (a) Delete the pivot block when v2 ships. v2 handles specialty via
  context + `notify_staff`.
- (b) Keep the pivot block but feature-flag it; v2 ships behind another
  flag, both coexist briefly.
- (c) Migrate pivot to use the v2 tool path immediately (Fix path 3 from the
  prior audit, but earlier).

**Recommendation:** (a) bundled with the v2 cutover. The pivot is broken
(prior audit bugs A + B); fixing it as part of v2 is more efficient than
fixing it in isolation now.

### 7.4 Should the v2 system prompt include transaction history?

Today's handler does (last 10 transactions). Voice agent's `context` endpoint
does NOT. Transaction history is high-signal for repeat customers but expensive
in tokens. **Recommendation:** include for known customers only, capped at
last 5. Confirm with user.

### 7.5 Which `notify_staff` reason codes does SMS AI v2 use?

Voice agent's six: `appointment_change`, `custom_quote`, `beyond_scope`,
`transfer_request`, `mobile_distance`, `other`. SMS context overlaps but
adds e.g. "STOP message arrived" or "explicit human handoff". **Confirm
which reason codes are in scope** — the answer affects the tool definition
the model sees.

### 7.6 Tool surface — start narrow or wide?

The brief lists 10 tool names. We could start v2 with a NARROWER set
(`lookup_customer`, `get_services`, `classify_vehicle`, `check_availability`,
`send_info_sms`, `notify_staff` — 6 tools) and add `create_appointment`,
`create_quote`, `get_products`, `get_product_details` in a follow-up phase.
**Recommendation:** start with the full 10. The voice agent has proven all
10 endpoints work; the v2 differentiation is the agent loop, not new tooling.

### 7.7 What's the test/rollout strategy?

Three options:

- (a) Feature-flag v2 per-customer (e.g., test on the owner's own phone
  number first).
- (b) Feature-flag v2 globally with kill-switch.
- (c) A/B by phone-number hash.

**Recommendation:** (a) → (b) → full rollout. Confirm. (a) lets the user
test end-to-end against real production data without exposing other
customers.

---

## 8. Files & Lines Cited

### Voice-agent endpoints
- `src/app/api/voice-agent/customers/route.ts:1-104`
- `src/app/api/voice-agent/services/route.ts:1-317`
- `src/app/api/voice-agent/vehicle-classify/route.ts:1-91`
- `src/app/api/voice-agent/availability/route.ts:1-200`
- `src/app/api/voice-agent/appointments/route.ts:1-720`
- `src/app/api/voice-agent/send-info-sms/route.ts:1-369`
- `src/app/api/voice-agent/finalize-call/route.ts:1-116`
- `src/app/api/voice-agent/products/route.ts:1-130`
- `src/app/api/voice-agent/products/details/route.ts:1-160`
- `src/app/api/voice-agent/notify-staff/route.ts:1-186`
- `src/app/api/voice-agent/context/route.ts:1-156`
- `src/app/api/voice-agent/quotes/route.ts:1-400`
- `src/app/api/voice-agent/send-quote-sms/route.ts:1-309`
- `src/app/api/voice-agent/initiation/route.ts:1-330` (not read in detail — voice-only)

### Auth + perf shared infra
- `src/lib/auth/api-key.ts:1-43`
- `src/lib/utils/voice-perf.ts` (referenced; not opened — no behavior in scope)

### Current SMS handler
- `src/app/api/webhooks/twilio/inbound/route.ts:1-948`
  - Specialty pivot + staff notification: 612-674
  - shouldAiReply predicate: 482-487
  - Customer context loading: 520-558
  - Outbound logging: 916-941
- `src/lib/services/messaging-ai.ts:1-511`
  - Anthropic call: 482-495
  - System prompt assembly: 19-224
  - Customer context block: 388-457
- `src/lib/services/messaging-ai-prompt.ts:1-114`
- `src/app/api/messaging/conversations/[id]/messages/route.ts:1-172`
  - Staff send disables AI: 160-161
- `src/app/api/messaging/conversations/[id]/route.ts:1-92`

### Shared helpers / dependencies
- `src/lib/utils/sms.ts:1-100` (sendSms + Messaging Service routing)
- `src/lib/sms/render-sms-template.ts:1-416` (template engine, contracts, cache)
- `src/lib/data/business.ts:1-87` (getBusinessInfo + 60s cache)
- `src/lib/data/business-defaults.ts:1-16` (BUSINESS_DEFAULTS.phone fallback)
- `supabase/migrations/20260427000006_seed_specialty_sub_slugs.sql:1-58`
- `src/lib/sms/generated-contracts.ts:49,89,358` (sub-slug contract registry)

### Prior audit reference
- `docs/dev/SMS_AI_AUTOREPLY_AUDIT_2026-05-19.md` — full prior analysis of
  specialty pivot bugs A, B, C and the conversation lifecycle.

---

## 9. Next Action

User reviews this audit and answers the 7 open questions in §7. Then we move
into the SMS AI v2 design session, where the deliverables are:

1. `docs/dev/SMS_AI_V2_DESIGN.md` — locked design with tool schemas,
   system prompt outline, conversation-state shape, return-early flow,
   cutover plan.
2. (Pending design approval) GSD phase plan for the implementation.

No code changes from this audit. The prior SMS AI auto-reply audit's
recommended Fix paths (specialty pivot cooldown / message-aware pivot) should
be HELD pending the v2 design — fixing the pivot in isolation creates work
that v2 will undo a session later.
