# Voice Agent — ElevenLabs Integration Guide

> Setup guide for the Smart Details Auto Spa voice agent. The app provides REST API endpoints that the ElevenLabs voice agent calls as tools during phone conversations.

## Architecture

```
Customer calls business phone (+14244010094)
    ↓
Twilio forwards to ElevenLabs voice agent (SIP/webhook)
    ↓
ElevenLabs agent converses with customer using TTS/STT
    ↓ (tool calls during conversation)
GET /api/voice-agent/context?phone=X      → full customer context
GET /api/voice-agent/services             → service catalog with pricing
GET /api/voice-agent/availability?date=X  → open time slots
POST /api/voice-agent/appointments        → book an appointment
POST /api/voice-agent/quotes              → generate a priced quote
POST /api/voice-agent/send-quote-sms      → SMS quote link mid-call
    ↓ (end of call — agent tool)
POST /api/voice-agent/finalize-call       → log call + trigger follow-ups
    ↓ (fallback — passive webhook)
POST /api/webhooks/elevenlabs/call-complete → log call (if webhook fires)
    ↓ (safety net — polling cron)
GET /api/cron/voice-calls-poll            → catch missed calls every 5 min
```

### Post-Call Data Ingestion — Three Layers

The post-call webhook from ElevenLabs (`call-complete`) is unreliable. Three layers ensure every call gets processed:

1. **Agent tool (`finalize_call`):** The agent calls this at end of every conversation. Most reliable path.
2. **Passive webhook (`call-complete`):** Kept as-is — if ElevenLabs fixes delivery, it works automatically.
3. **Polling cron (`voice-calls-poll`):** Every 5 minutes, polls ElevenLabs API for unprocessed calls.

All three paths use the shared `processVoiceCallEnd()` function from `src/lib/services/voice-post-call.ts`. The `voice_call_log` table deduplicates across all three sources.

## API Endpoints

All endpoints require `Authorization: Bearer <api_key>` where the key matches `business_settings.voice_agent_api_key`.

### POST /api/voice-agent/initiation

**Conversation initiation webhook.** ElevenLabs calls this during the ring period before the call connects. Returns `conversation_initiation_client_data` with dynamic variables and a personalized first message.

For returning customers, includes a `customer_summary` string with vehicle, visits, loyalty, tags, appointments, and quotes. For unknown callers, returns generic greeting.

Must respond within **5 seconds** (ElevenLabs timeout during ring period).

### GET /api/voice-agent/context?phone=+1XXXXXXXXXX

**Use during call.** Returns everything the agent needs in one request:
- Customer profile (name, email, type, loyalty points, notes, tags, engagement metrics)
- Vehicles on file
- Upcoming appointments with services
- Recent quotes with status
- Conversation history (SMS + voice messages)
- AI conversation summary

Returns `{ is_new_caller: true }` if the phone number is unknown.

### GET /api/voice-agent/customers?phone=+1XXXXXXXXXX

Lighter customer lookup. Returns customer profile + vehicles + upcoming appointment count.

### GET /api/voice-agent/services

Full service catalog with pricing tiers, duration, mobile eligibility.

### GET /api/voice-agent/availability?date=YYYY-MM-DD&service_id=UUID

Available time slots for a specific date and service.

### POST /api/voice-agent/appointments

Create a booking. Required fields: `customer_name`, `customer_phone`, `service_id`, `date`, `time`. Optional: `vehicle_year`, `vehicle_make`, `vehicle_model`, `vehicle_color`, `notes`.

Automatically creates/finds customer, creates vehicle if info provided, checks for overlapping slots. Logs a system message to the conversation thread.

### POST /api/voice-agent/quotes

Generate a priced quote. Required: `customer_name`, `customer_phone`, `services` (array of `{ service_id, tier_name? }`). Optional: vehicle info, `notes`, `send_sms` (boolean).

Logs a system message to the conversation thread.

### POST /api/voice-agent/send-quote-sms

**Mid-call tool.** Send the customer an SMS with a quote link for services discussed. Called when the customer asks "text me the pricing" or "send me a quote."

**All string parameters — `services` is comma-separated, not an array.** ElevenLabs has proven unreliable with JSON array formatting.

Request body:
```json
{
  "phone": "+13107564789",
  "customer_name": "Nayeem Ahmed",
  "services": "Ceramic Coating, Interior Detail",
  "vehicle_year": 2020,
  "vehicle_make": "Tesla",
  "vehicle_model": "Model 3",
  "vehicle_color": "White"
}
```

Response: `{ success: true, quote_number: "Q-00042", quote_link: "https://..." }`

### POST /api/voice-agent/finalize-call

**End-of-call tool.** The agent MUST call this before ending every conversation. Logs the call summary, triggers auto-quote or confirmation SMS based on what was discussed.

**All string parameters — `services_discussed` is comma-separated, not an array.**

Request body:
```json
{
  "phone": "+13107564789",
  "transcript_summary": "Customer asked about ceramic coating for their 2020 Tesla...",
  "services_discussed": "Ceramic Coating, Interior Detail",
  "appointment_booked": false,
  "customer_interest": "interested",
  "call_duration_seconds": 180,
  "elevenlabs_conversation_id": "conv_abc123"
}
```

Response: `{ success: true, conversation_id: "uuid", skipped: false }`

Processing logic:
1. Dedup check via `voice_call_log` (skip if already processed by polling/webhook)
2. Find/create conversation by phone, insert voice message
3. If `services_discussed` + interested + no appointment → auto-generate quote + SMS (skipped if `send_quote_sms` was called in the last 10 minutes)
4. If `appointment_booked` → send SMS confirmation
5. Trigger conversation summary regeneration
6. Insert into `voice_call_log` (source: 'tool')

### POST /api/webhooks/elevenlabs/call-complete

After-call webhook (passive). ElevenLabs sends: `phone`, `transcript`, `summary`, `duration_seconds`, `call_id`, `outcome`. Uses shared `processVoiceCallEnd()` with dedup via `voice_call_log`.

Auth: HMAC signature via `ElevenLabs-Signature` header (primary), falls back to Bearer token.

### GET /api/cron/voice-calls-poll

**Polling cron (safety net).** Runs every 5 minutes. Polls ElevenLabs Conversational AI API for recently completed calls that weren't processed by the agent tool or webhook.

Auth: `x-api-key` (CRON_API_KEY)

Requires env vars: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`

## Deduplication

The `voice_call_log` table prevents duplicate processing:

```sql
CREATE TABLE voice_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elevenlabs_conversation_id TEXT UNIQUE NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'processed',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('tool', 'poll', 'webhook'))
);
```

All three paths (tool, poll, webhook) check this table before processing and insert after completion.

## ElevenLabs Agent Setup

### 1. Create Agent

In the ElevenLabs dashboard:
- **Name**: Smart Details Auto Spa
- **Voice**: Choose a friendly, professional voice
- **First message**: "Hi! Thanks for calling Smart Details Auto Spa. How can I help you today?"

### 2. System Prompt

```
You are a friendly phone assistant for Smart Details Auto Spa, a professional auto detailing business in Lomita, California.

BEHAVIOR:
- Be warm, conversational, and professional
- Keep responses concise — this is a phone call, not an essay
- If the caller is a known customer, greet them by name and reference their vehicle
- If they have an upcoming appointment, mention it
- If a recent quote is pending, ask if they'd like to proceed

CAPABILITIES:
- Look up customer accounts by phone number
- Provide service information and pricing
- Check appointment availability
- Book appointments
- Generate quotes
- Text quotes/pricing to customers on request

FLOW:
1. At call start, use get_context with the caller's phone to load their profile
2. If known customer: greet by name, reference their vehicle and any pending items
3. If new caller: warmly welcome them and ask how you can help
4. For service inquiries: use get_services to provide accurate pricing
5. For booking: use check_availability then create_appointment
6. For quotes: collect vehicle info + desired services, then use create_quote

TOOLS — SMS & Call Logging:
- If the customer asks you to text them pricing, a quote, or a link, call send_quote_sms immediately with the services and vehicle info discussed.
- Before ending ANY call, you MUST call finalize_call with a summary. Include the customer's phone, what was discussed, services mentioned (comma-separated), whether they booked, and their interest level.

RULES:
- Never make up pricing — always use get_services for accurate data
- Always confirm details before booking: "So that's a [service] for your [vehicle] on [date] at [time], correct?"
- If you can't help with something, offer to have a team member call back
- Business hours and status will be in the context response
- IMPORTANT: For services and services_discussed parameters, use comma-separated strings (e.g., "Ceramic Coating, Interior Detail"), NOT JSON arrays
```

### 3. Configure Tools

| Tool Name | Method | Endpoint | When to Use |
|-----------|--------|----------|-------------|
| `get_context` | GET | `/api/voice-agent/context?phone={caller_phone}` | At call start — load full customer context |
| `get_services` | GET | `/api/voice-agent/services` | When customer asks about services or pricing |
| `check_availability` | GET | `/api/voice-agent/availability?date={date}&service_id={id}` | When customer wants to book |
| `create_appointment` | POST | `/api/voice-agent/appointments` | After confirming booking details |
| `create_quote` | POST | `/api/voice-agent/quotes` | After collecting vehicle + service info |
| `send_quote_sms` | POST | `/api/voice-agent/send-quote-sms` | When customer asks to be texted pricing/quote |
| `finalize_call` | POST | `/api/voice-agent/finalize-call` | At end of EVERY call — MUST be called |

Set the API key header on all tools: `Authorization: Bearer <key>`

#### send_quote_sms Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phone` | string | Yes | Customer phone number |
| `customer_name` | string | No | Customer's full name |
| `services` | string | Yes | Comma-separated service names |
| `vehicle_year` | number | No | Vehicle year |
| `vehicle_make` | string | No | Vehicle make |
| `vehicle_model` | string | No | Vehicle model |
| `vehicle_color` | string | No | Vehicle color |

#### finalize_call Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phone` | string | Yes | Customer phone number |
| `customer_name` | string | No | Customer's full name (upgrades generic names) |
| `transcript_summary` | string | Yes | Brief summary of the conversation |
| `services_discussed` | string | No | Comma-separated service names |
| `appointment_booked` | boolean | Yes | Whether an appointment was confirmed |
| `customer_interest` | string | Yes | `interested`, `maybe`, or `not_interested` |
| `call_duration_seconds` | number | No | Duration of the call in seconds |
| `elevenlabs_conversation_id` | string | No | ElevenLabs conversation ID for dedup |
| `vehicle_year` | number | No | Vehicle year |
| `vehicle_make` | string | No | Vehicle make |
| `vehicle_model` | string | No | Vehicle model |
| `vehicle_color` | string | No | Vehicle color |
| `customer_type` | string | No | `enthusiast` or `professional` — only sets if currently unclassified |

### 4. Configure After-Call Webhook (Passive)

- **URL**: `https://<your-domain>/api/webhooks/elevenlabs/call-complete`
- **Method**: POST
- **Auth**: HMAC signature via `ELEVENLABS_WEBHOOK_SECRET`
- **Payload**: `{ phone, transcript, summary, duration_seconds, call_id, outcome }`
- **Note**: This webhook may not fire reliably. The `finalize_call` tool + polling cron are the primary paths.

### 5. Configure Twilio Voice Routing

In Twilio Console → Phone Numbers → +14244010094 → Voice Configuration:
- **A Call Comes In**: Set to the ElevenLabs SIP endpoint or webhook URL
- **Fallback URL** (optional): Set to a TwiML route that plays a voicemail greeting

### 6. Set API Key

In the app: Admin → Settings → look up `voice_agent_api_key` in `business_settings` table. Set it to a secure random string and use the same key in the ElevenLabs agent configuration.

### 7. Env Vars

Required for polling cron:
```
ELEVENLABS_API_KEY=<your_elevenlabs_api_key>
ELEVENLABS_AGENT_ID=agent_2801kmgybk7rebrsvndpv3bv6dqn
```

Already set:
- `ELEVENLABS_WEBHOOK_SECRET` — for passive webhook HMAC verification

## Cross-Channel Context

Voice and SMS share a unified conversation thread per phone number. When a customer texts about ceramic coating and then calls 3 days later:

1. The voice agent calls `GET /api/voice-agent/context?phone=X`
2. The response includes SMS conversation history and an AI-generated summary
3. The agent can say: "I see you were texting about a ceramic coating for your 2020 Tesla — would you like to go ahead and book that?"

After the call ends, the ElevenLabs webhook logs the call summary into the same conversation. The next time the customer texts, the SMS AI sees the voice call in its history.

## Reference: Existing 121 Media Agents

The following ElevenLabs agents are configured for 121 Media (parent company) and can be referenced for patterns:
- **Sarah** — Inbound call handler
- **Elizabeth** — Discovery/qualification
- **Isabella** — Appointment confirmation

These use the same tool-calling pattern but different API endpoints.
