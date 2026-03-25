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
    ↓ (after call ends)
POST /api/webhooks/elevenlabs/call-complete → log call to conversation thread
```

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

### POST /api/webhooks/elevenlabs/call-complete

After-call webhook. ElevenLabs sends: `phone`, `transcript`, `summary`, `duration_seconds`, `call_id`, `outcome`. The endpoint:
1. Finds or creates the conversation by phone number
2. Inserts the call summary as a voice message (`channel: 'voice'`)
3. Links customer if found by phone
4. Triggers AI conversation summary regeneration

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

FLOW:
1. At call start, use get_context with the caller's phone to load their profile
2. If known customer: greet by name, reference their vehicle and any pending items
3. If new caller: warmly welcome them and ask how you can help
4. For service inquiries: use get_services to provide accurate pricing
5. For booking: use check_availability then create_appointment
6. For quotes: collect vehicle info + desired services, then use create_quote

RULES:
- Never make up pricing — always use get_services for accurate data
- Always confirm details before booking: "So that's a [service] for your [vehicle] on [date] at [time], correct?"
- If you can't help with something, offer to have a team member call back
- Business hours and status will be in the context response
```

### 3. Configure Tools

| Tool Name | Method | Endpoint | When to Use |
|-----------|--------|----------|-------------|
| `get_context` | GET | `/api/voice-agent/context?phone={caller_phone}` | At call start — load full customer context |
| `get_services` | GET | `/api/voice-agent/services` | When customer asks about services or pricing |
| `check_availability` | GET | `/api/voice-agent/availability?date={date}&service_id={id}` | When customer wants to book |
| `create_appointment` | POST | `/api/voice-agent/appointments` | After confirming booking details |
| `create_quote` | POST | `/api/voice-agent/quotes` | After collecting vehicle + service info |

Set the API key header on all tools: `Authorization: Bearer <key>`

### 4. Configure After-Call Webhook

- **URL**: `https://<your-domain>/api/webhooks/elevenlabs/call-complete`
- **Method**: POST
- **Headers**: `Authorization: Bearer <same-api-key>`
- **Payload**: `{ phone, transcript, summary, duration_seconds, call_id, outcome }`

### 5. Configure Twilio Voice Routing

In Twilio Console → Phone Numbers → +14244010094 → Voice Configuration:
- **A Call Comes In**: Set to the ElevenLabs SIP endpoint or webhook URL
- **Fallback URL** (optional): Set to a TwiML route that plays a voicemail greeting

### 6. Set API Key

In the app: Admin → Settings → look up `voice_agent_api_key` in `business_settings` table. Set it to a secure random string and use the same key in the ElevenLabs agent configuration.

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
