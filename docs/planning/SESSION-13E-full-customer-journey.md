# Full Customer Journey Audit: First Contact → Completed Job

> **Date:** 2026-03-27
> **Scope:** Every path a lead can take to become a job in POS, traced end-to-end
> **Status:** Read-only audit — no code changes

---

## Table of Contents

1. [Journey Overview Map](#1-journey-overview-map)
2. [Path A: Phone Call → Quote → Job](#2-path-a-phone-call--quote--job)
3. [Path B: Inbound SMS → Quote → Job](#3-path-b-inbound-sms--quote--job)
4. [Path C: Online Booking → Appointment → Job](#4-path-c-online-booking--appointment--job)
5. [Path D: POS Walk-In → Job](#5-path-d-pos-walk-in--job)
6. [Path E: Admin/POS Quote → Job](#6-path-e-adminpos-quote--job)
7. [POS Job Lifecycle (All Paths Converge Here)](#7-pos-job-lifecycle-all-paths-converge-here)
8. [Automated Follow-Up Timeline](#8-automated-follow-up-timeline)
9. [Bugs, Gaps & Missing Pieces](#9-bugs-gaps--missing-pieces)
10. [File Reference Index](#10-file-reference-index)

---

## 1. Journey Overview Map

```
ENTRY POINTS                    INTERMEDIATE STATE              POS JOB
─────────────                   ──────────────────              ───────

Phone Call ──→ Auto-Quote ─────→ Quote (sent) ──→ Quote (accepted) ──→ Staff converts ──→ Appointment ──→ Job populates
          └──→ Appointment ────────────────────────────────────────────────────────────────────────────→ Job populates

Inbound SMS ─→ AI Auto-Quote ──→ Quote (sent) ──→ Quote (accepted) ──→ Staff converts ──→ Appointment ──→ Job populates

Online Booking ────────────────→ Appointment (confirmed) ──────────────────────────────────────────────→ Job populates

POS Walk-In ───────────────────────────────────────────────────────────────────────────────────────────→ Job created directly

Admin/POS Quote ───────────────→ Quote (sent) ──→ Quote (accepted) ──→ Staff converts ──→ Appointment ──→ Job populates
                                              └──→ "Create Job" button ────────────────────────────────→ Job created directly
```

**Three conversion mechanisms exist:**
1. **Appointment → Job** — auto-populates when staff opens POS Jobs page (`/api/pos/jobs/populate`)
2. **Quote → Appointment → Job** — staff manually converts accepted quote to appointment in POS, then #1
3. **Quote/Walk-in → Job** — staff creates job directly in POS (no appointment needed)

---

## 2. Path A: Phone Call → Quote → Job

### Step 1: Call Starts — Customer Lookup

| Detail | Value |
|--------|-------|
| **Trigger** | Inbound call to ElevenLabs voice agent |
| **Endpoint** | `POST /api/voice-agent/initiation` |
| **File** | `src/app/api/voice-agent/initiation/route.ts` |
| **What happens** | Normalizes caller phone, looks up customer by phone. For returning customers: loads vehicles, visit history, upcoming appointments, recent quotes, loyalty points, conversation summary. Returns dynamic greeting variables to ElevenLabs. |
| **DB reads** | `customers`, `vehicles`, `appointments`, `quotes`, `quote_items`, `transactions`, `conversations`, `messages` |
| **DB writes** | None |
| **SMS/Email** | None |
| **Admin visibility** | None yet |

### Step 2: During Call — Agent Tools

The voice agent has these tools available during the call:

| Tool | Endpoint | What It Does |
|------|----------|-------------|
| Look up customer | `GET /api/voice-agent/customers?phone=` | Returns customer profile, vehicles, appointment count |
| Get services | `GET /api/voice-agent/services` | Returns all active services with pricing tiers |
| Check availability | `GET /api/voice-agent/availability?date=&service_id=` | Returns available time slots for a date |
| Get context | `GET /api/voice-agent/context?phone=` | Full customer context (vehicles, appointments, quotes, conversation) |
| Book appointment | `POST /api/voice-agent/appointments` | Creates appointment immediately (see Step 2a) |
| Send quote SMS | `POST /api/voice-agent/send-quote-sms` | Creates quote + sends SMS link mid-call (see Step 2b) |
| Create quote | `POST /api/voice-agent/quotes` | Creates quote without sending SMS |
| Finalize call | `POST /api/voice-agent/finalize-call` | Signals call end, triggers post-call processing |

### Step 2a: (Branch) Appointment Booked During Call

| Detail | Value |
|--------|-------|
| **Endpoint** | `POST /api/voice-agent/appointments` |
| **File** | `src/app/api/voice-agent/appointments/route.ts` |
| **DB writes** | Creates `appointments` (status=`pending`, channel=`phone`), `appointment_services`, finds/creates `customers` + `vehicles` |
| **SMS sent** | `"Your appointment at Smart Details Auto Spa is confirmed! {service} on {date} at {time}. We look forward to seeing you! Reply STOP to opt out."` (line 344) |
| **Webhook** | `booking_created` fired |
| **Admin visibility** | Appointment appears in Admin > Appointments |
| **BUG** | Business name hardcoded as "Smart Details Auto Spa" — should use `getBusinessInfo()` |
| **What skips** | Auto-quote generation is skipped at post-call (appointment already booked) |
| **Continues to** | Step 7 (POS Job Lifecycle) — job auto-populates on scheduled date |

### Step 2b: (Branch) Quote Sent Mid-Call

| Detail | Value |
|--------|-------|
| **Endpoint** | `POST /api/voice-agent/send-quote-sms` |
| **File** | `src/app/api/voice-agent/send-quote-sms/route.ts` |
| **DB writes** | Creates `quotes` (status=`sent`), `quote_items`, finds/creates `customers` + `vehicles`, `quote_communications`, `messages` |
| **SMS sent** | `"Here's your quote from {biz.name} for {serviceList}: {link}\n\nReply STOP to opt out."` (line 246) |
| **Admin visibility** | Quote appears in Admin > Quotes (status: Sent) |
| **What skips** | Sets `skipAutoQuote=true` flag so post-call doesn't generate duplicate quote |
| **Continues to** | Step 4 (Customer Views Quote) |

### Step 3: Call Ends — Post-Call Processing

| Detail | Value |
|--------|-------|
| **Trigger** | ElevenLabs calls `finalize_call` endpoint OR polling cron catches it |
| **File** | `src/lib/services/voice-post-call.ts` (main logic), `src/app/api/voice-agent/finalize-call/route.ts` (endpoint), `src/app/api/cron/voice-calls-poll/route.ts` (safety net) |
| **Dedup** | Checks `voice_call_log` by `elevenlabs_conversation_id` — skips if already processed |
| **DB writes** | Finds/creates/upgrades customer, finds/creates vehicle (from transcript extraction), creates/updates conversation, inserts system message with call summary, logs `voice_call_log` |

**Decision tree at post-call:**

| Condition | Result |
|-----------|--------|
| Appointment booked during call | Sends confirmation SMS, done |
| `skipAutoQuote` flag set (mid-call quote sent) | Done — quote already sent |
| Recent quote exists (< 10 min old for this customer) | Done — dedup |
| No services discussed | Done — nothing to quote |
| Customer explicitly not interested | Done |
| **Services discussed + interested** | **Auto-generates quote** (see below) |

### Step 3a: Auto-Quote Generated

| Detail | Value |
|--------|-------|
| **Function** | `autoGenerateQuote()` in `voice-post-call.ts` (line 400) |
| **DB writes** | Creates `quotes` (status=`sent`, notes="Auto-generated after phone call"), `quote_items`, `quote_communications`, updates conversation |
| **SMS sent** | `"Thanks for calling {biz.name}! Here's a quote for what we discussed: {link}\n\nReply STOP to opt out."` (line 552) |
| **Quote validity** | From `business_settings.quote_validity_days` (default: 10 days) |
| **Admin visibility** | Quote appears in Admin > Quotes (status: Sent) and in Messaging > Conversations (system message) |

### Step 4: Customer Views Quote

| Detail | Value |
|--------|-------|
| **Trigger** | Customer clicks short link in SMS |
| **URL** | `/quote/[access_token]` |
| **File** | `src/app/(public)/quote/[token]/page.tsx` |
| **DB writes** | If status=`sent`: auto-transitions to `viewed`, sets `viewed_at` |
| **SMS/Email** | None — silent tracking |
| **Admin visibility** | Quote status changes to "Viewed" in admin/POS |

### Step 5: Customer Accepts Quote

| Detail | Value |
|--------|-------|
| **Trigger** | Customer clicks "Accept Quote" button on public page |
| **Endpoint** | `POST /api/quotes/[id]/accept` |
| **File** | `src/app/api/quotes/[id]/accept/route.ts` |
| **Validation** | Quote must be `sent` or `viewed`. Requires valid `access_token` |
| **DB writes** | Updates quote: `status=accepted`, `accepted_at=now`. Logs `quote_communications` |
| **SMS to customer** | Single item: `"Thanks {first_name}! Your quote for {item_name} has been accepted. Our team will reach out shortly to schedule your appointment."` Multi: `"Thanks {first_name}! Your quote has been accepted. Our team will reach out shortly to schedule."` (lines 78-80) |
| **Webhook** | `quote_accepted` fired to n8n |
| **GAP** | **No staff notification.** No SMS, email, or in-app alert to admin. Staff must check Quotes list manually or have n8n automation configured. Customer told "our team will reach out" but nothing ensures team knows. |
| **What does NOT happen** | No appointment created. No job created. Quote sits in "Accepted" status until staff acts. |

### Step 6: Staff Converts Quote to Appointment

| Detail | Value |
|--------|-------|
| **Where** | POS > Quote Detail > "Convert to Appointment" button |
| **File** | `src/lib/quotes/convert-service.ts`, `src/components/quotes/quote-book-dialog.tsx` |
| **Staff picks** | Date, time, duration, detailer assignment |
| **DB writes** | Creates `appointments` (status=`confirmed`, channel=`phone`), `appointment_services`. Updates quote: `status=converted`, `converted_appointment_id` set |
| **Webhook** | `appointment_confirmed` fired |
| **Admin visibility** | Appointment appears in schedule. Quote status = "Converted" |
| **Continues to** | Step 7 (POS Job Lifecycle) — job auto-populates on scheduled date |

**Alternative:** Staff can click "Create Job" directly from quote detail, bypassing appointment (see Path E, Step 3).

---

## 3. Path B: Inbound SMS → Quote → Job

### Step 1: Customer Sends Text

| Detail | Value |
|--------|-------|
| **Trigger** | Customer texts the business Twilio number |
| **Endpoint** | `POST /api/webhooks/twilio/inbound` |
| **File** | `src/app/api/webhooks/twilio/inbound/route.ts` |
| **TCPA first** | STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT → immediate opt-out via `updateSmsConsent()`. START/YES/UNSTOP → opt-in. This runs BEFORE any feature flag checks (TCPA compliance requirement) |
| **DB writes** | Creates/updates `conversations` (status=`open`), inserts `messages` (direction=`inbound`), marks unread |
| **Admin visibility** | Message appears in Admin > Messaging inbox |

### Step 2: AI Generates Response

| Detail | Value |
|--------|-------|
| **Trigger** | Inbound message + `two_way_sms` feature flag enabled + AI enabled for customer type |
| **File** | `src/lib/services/messaging-ai.ts` (context assembly), `src/lib/services/messaging-ai-prompt.ts` (default prompt) |
| **AI context includes** | Service catalog with pricing, active promotions/coupons, business hours, customer history (if returning), up to 5 upcoming appointments, conversation summary, pending addon authorizations |
| **AI model** | Anthropic Claude (text-only, no tool-calling) |
| **Rate limit** | Max 25 AI replies per hour per conversation |
| **SMS sent** | AI-generated response, split into 320-char chunks (line 849) |
| **GAP** | AI can SEE appointments but CANNOT cancel/reschedule them. No tool-calling infrastructure exists. AI should say "call us to cancel" but default prompt doesn't include this guidance |

### Step 3: AI Generates Quote (via GENERATE_QUOTE block)

| Detail | Value |
|--------|-------|
| **Trigger** | AI response contains `[GENERATE_QUOTE]...[/GENERATE_QUOTE]` block with service names, vehicle info, customer name |
| **File** | `src/app/api/webhooks/twilio/inbound/route.ts` (lines 616-805) |
| **DB writes** | Creates `quotes` (status=`sent`), `quote_items`, finds/creates customer + vehicle, `quote_communications` |
| **SMS sent** | Quote link SMS to customer |
| **Admin visibility** | Quote appears in Admin > Quotes and conversation thread |
| **Continues to** | Same as Path A Steps 4-6 (customer views → accepts → staff converts) |

---

## 4. Path C: Online Booking → Appointment → Job

### Step 1: Customer Completes Booking Wizard

| Detail | Value |
|--------|-------|
| **Trigger** | Customer submits online booking form at `/book` |
| **Endpoint** | `POST /api/book` |
| **File** | `src/app/api/book/route.ts` (482 lines) |
| **DB writes** | |

**Records created:**

| Table | What | Notes |
|-------|------|-------|
| `customers` | Find or create by phone (E.164) | Fallback match by email. Soft-delete aware. New customers get `type='enthusiast'` |
| `vehicles` | Find or create by (customer, type, make, model, year, color) | Size class + specialty tier captured |
| `appointments` | Created with full scheduling data | Status = `confirmed` (if deposit paid) or `pending` (if pay-on-site) |
| `appointment_services` | Junction rows for each service | `price_at_booking` + `tier_name` preserved |
| `sms_consent_log` | Consent audit trail | Only if customer checked SMS consent box. Uses `updateSmsConsent()` |

**Notifications:**

| What | Recipient | Condition | Method |
|------|-----------|-----------|--------|
| Welcome email | Customer | New customers only | `sendWelcomeEmail()` → template `welcome_email` |
| `booking_created` webhook | n8n | Always | `fireWebhook()` |
| `appointment_confirmed` webhook | n8n | Only if payment made (status=confirmed) | `fireWebhook()` |

**GAP: No booking confirmation SMS or email to customer.** The welcome email is not a booking confirmation — it's a generic "welcome to our business" message for first-time customers only. Returning customers who book online get NO immediate confirmation. Staff must manually send confirmation via `/appointments/[id]/notify`.

**GAP: No staff notification when new online booking arrives.** Admin must check the appointments list or rely on n8n webhook automation.

### Step 2: Booking Reminder (Day Before)

| Detail | Value |
|--------|-------|
| **Trigger** | Daily cron at 8 AM PST |
| **Endpoint** | `GET /api/cron/booking-reminders` |
| **File** | `src/app/api/cron/booking-reminders/route.ts` |
| **Conditions** | Appointment scheduled for tomorrow, status `pending` or `confirmed`, `reminder_sent_at` is null |
| **Email sent** | Template: `booking_reminder`. Variables: `first_name`, `customer_name`, `service_name`, `appointment_date`, `appointment_time`, `business_name`, `business_phone`, `booking_url` |
| **SMS sent** | None — email only |
| **DB writes** | Sets `reminder_sent_at = now()` on appointment (prevents re-send) |

### Step 3: Job Auto-Populates

| Detail | Value |
|--------|-------|
| **Trigger** | Staff opens POS Jobs page on appointment day |
| **Endpoint** | `POST /api/pos/jobs/populate` |
| **File** | `src/app/api/pos/jobs/populate/route.ts` |
| **Conditions** | Today's appointments with status `confirmed` or `in_progress` that don't already have a job record |
| **DB writes** | Creates `jobs` with `appointment_id` FK, copies customer/vehicle/staff/services. Status = `scheduled`. Uses upsert to prevent duplicates |
| **Continues to** | Step 7 (POS Job Lifecycle) |

---

## 5. Path D: POS Walk-In → Job

### Step 1: Staff Creates Job Directly

| Detail | Value |
|--------|-------|
| **Where** | POS > Jobs > "New Job" or "Walk-In" button |
| **Endpoint** | `POST /api/pos/jobs` |
| **File** | `src/app/api/pos/jobs/route.ts` (lines 74-210) |
| **Permission** | `pos.jobs.manage` |
| **Required fields** | `customer_id`, `services` (array of `{id, name, price}`) |
| **Optional fields** | `vehicle_id`, `assigned_staff_id`, `estimated_pickup_at`, `quote_id`, `notes` |
| **DB writes** | Creates `jobs` (status=`scheduled`, no `appointment_id`). Auto-assigns detailer if none provided via `findAvailableDetailer()` |
| **SMS/Email** | None |
| **Continues to** | Step 7 (POS Job Lifecycle) |

---

## 6. Path E: Admin/POS Quote → Job

### Step 1: Staff Creates Quote in POS

| Detail | Value |
|--------|-------|
| **Where** | POS > Quotes > "New Quote" button (opens quote builder) |
| **File** | `src/app/pos/components/quotes/quote-ticket-panel.tsx` |
| **DB writes** | Creates `quotes` (status=`draft`), `quote_items` with services + products |

### Step 2: Staff Sends Quote

| Detail | Value |
|--------|-------|
| **Where** | POS > Quote Detail > "Send" button |
| **File** | `src/lib/quotes/send-service.ts` |
| **DB writes** | Updates quote: `status=sent`, `sent_at=now`. Logs `quote_communications` |
| **SMS sent** | `"Estimate {quote_number} from {biz.name}\nTotal: {total}\n\nView Your Estimate: {shortLink}"` + optional PDF MMS |
| **Email sent** | Template: `quote_sent` with full quote details, or hardcoded HTML fallback |
| **Webhook** | `quote_sent` fired |
| **Continues to** | Path A Steps 4-6 (customer views → accepts → staff converts) |

### Step 3: (Alternative) Staff Creates Job Directly from Quote

| Detail | Value |
|--------|-------|
| **Where** | POS > Quote Detail > "Create Job" button (available on draft/sent/viewed/accepted quotes) |
| **File** | `src/app/pos/components/quotes/quote-ticket-panel.tsx` (lines 373-503) |
| **Endpoint** | `POST /api/pos/jobs` with `quote_id` parameter |
| **What happens** | Quote status → `converted`. Service items become job services. Products + coupons preserved via `quote_id` bridge (loaded at checkout). Navigates to POS Jobs queue |
| **Bypasses** | Skips appointment creation entirely — goes straight to job |
| **Continues to** | Step 7 (POS Job Lifecycle) |

---

## 7. POS Job Lifecycle (All Paths Converge Here)

### Status Flow

```
scheduled ──→ intake ──→ in_progress ──→ completed ──→ closed
                                ↑              ↓
                           (addons)      (pickup → checkout)

[Any non-terminal] ──→ cancelled
```

### Step-by-Step

| Status | Action | Endpoint | What Happens | Customer Notified? |
|--------|--------|----------|-------------|-------------------|
| **scheduled** | Staff taps "Start Intake" | `PATCH /api/pos/jobs/[id]` | Sets `intake_started_at`, status → `intake`. Opens zone picker for intake photos (if photo feature enabled) | No |
| **intake** | Staff completes intake photos/notes | `PATCH /api/pos/jobs/[id]` | Sets `intake_completed_at` | No |
| **intake** | Staff taps "Start Work" | `POST /api/pos/jobs/[id]/start-work` | Validates `intake_completed_at` is set. Status → `in_progress`, sets `work_started_at`. Timer starts | No |
| **in_progress** | (Optional) Detailer flags issue | `POST /api/pos/jobs/[id]/addons` | Creates addon with authorization link. **SMS to customer:** conversational message with issue description + approve/decline link (crypto token URL) | Yes — addon auth SMS |
| **in_progress** | (Optional) Customer responds to addon | `approveAddon()` / `declineAddon()` in `job-addons.ts` | Updates addon status. **SMS confirmation:** "Great! Your add-on has been approved..." or "No problem! We've noted it..." | Yes — confirmation SMS |
| **in_progress** | Staff taps "Complete" | `POST /api/pos/jobs/[id]/complete` | Finalizes timer. Auto-selects featured photos. Generates `gallery_token`. Status → `completed` | Yes — **SMS:** ready for pickup + gallery link + business hours. **Email:** templated with before/after photos |
| **completed** | (Optional) Staff marks pickup | `POST /api/pos/jobs/[id]/pickup` | Sets `actual_pickup_at` + notes | No |
| **completed** | Staff taps "Checkout" | `GET /api/pos/jobs/[id]/checkout-items` → POS payment flow | Loads services + approved addons + quote-bridge products into POS ticket. Staff processes payment | No (receipt SMS available after payment) |
| **closed** | (Automatic after payment) | `POST /api/pos/jobs/[id]/link-transaction` | Sets `transaction_id`, status → `closed`. Fire-and-forget after payment success | No (receipt SMS is separate action) |

### Cancellation

| From Status | Permission Required | What Happens |
|-------------|-------------------|-------------|
| `scheduled`, `intake` | `pos.jobs.cancel` | Status → `cancelled`. If linked appointment: also cancels appointment. Optional customer notification (SMS + email with reschedule CTA) |
| `in_progress`, `pending_approval` | Admin role only | Same as above |
| `completed`, `closed`, `cancelled` | Cannot cancel | Terminal statuses |

---

## 8. Automated Follow-Up Timeline

### After Quote Sent (Paths A, B, E)

| When | What | Condition | File |
|------|------|-----------|------|
| Immediately | SMS + Email with quote link | Always (on send) | `send-service.ts` |
| +24 hours | SMS reminder: "Just checking if you had a chance to look at your quote" | Only if `viewed_at` is null (never opened). Fires once per quote. Uses `sendMarketingSms()` (consent + frequency checked) | `cron/quote-reminders/route.ts` |
| After view | Nothing | Quote viewed → status changes to `viewed` silently. No further automated follow-up | `quote/[token]/page.tsx` |
| After acceptance | SMS confirmation to customer. Webhook to n8n | No staff notification (see Bug #4) | `quotes/[id]/accept/route.ts` |
| After expiry | Nothing | Quote valid_until passes. No automated expiry notification to customer or staff | — |

**GAP: After a customer VIEWS a quote but doesn't accept, there is ZERO follow-up.** The 24h reminder only fires if the quote was never viewed. A viewed-but-not-accepted quote gets no further nudge.

**GAP: Quote expiry is silent.** No notification to customer ("your quote is about to expire") or staff.

### After Online Booking (Path C)

| When | What | Condition | File |
|------|------|-----------|------|
| Immediately | Welcome email (new customers only) | First-time customer | `book/route.ts` |
| Immediately | Webhook: `booking_created` | Always | `book/route.ts` |
| Immediately | Webhook: `appointment_confirmed` | Only if deposit paid | `book/route.ts` |
| Day before | Email reminder: appointment details | `pending` or `confirmed`, never reminded | `cron/booking-reminders/route.ts` |
| Day of | Job auto-populates in POS | Staff opens Jobs page | `pos/jobs/populate/route.ts` |

**GAP: No confirmation SMS/email sent to customer at booking time.** They complete the form, pay a deposit, and get... nothing. Only a welcome email if they're new. Returning customers get zero confirmation.

### After Job Completion (All Paths)

| When | What | Condition | File |
|------|------|-----------|------|
| Immediately | SMS + Email: ready for pickup + photo gallery | Customer has phone/email | `pos/jobs/[id]/complete/route.ts` |
| After checkout | Receipt SMS available | Staff triggers from POS | `pos/receipts/sms/route.ts` |
| Post-service | Lifecycle automations trigger | Based on configured lifecycle rules (e.g., review request 3 days after, rebooking reminder 30 days after) | `cron/lifecycle-engine/route.ts` |

---

## 9. Bugs, Gaps & Missing Pieces

### Confirmed Bugs

| # | Severity | Description | File | Line |
|---|----------|-------------|------|------|
| B1 | Low | **Hardcoded business name** in voice agent appointment SMS. Uses `"Smart Details Auto Spa"` instead of `getBusinessInfo()`. Violates CLAUDE.md Rule #8 | `api/voice-agent/appointments/route.ts` | 344 |
| B2 | Medium | **Email template variables undiscoverable.** `cancellation_reason` and `amount_paid` passed by code but missing from `src/lib/email/variables.ts` registry. Admin can't see or use these in the template editor | `src/lib/email/variables.ts` | — |
| B3 | Medium | **SMS AI says "can't find appointments"** when asked to cancel. AI CAN see appointments (data is injected into context) but default prompt doesn't instruct it to acknowledge them or direct customer to call for changes | `src/lib/services/messaging-ai-prompt.ts` | — |

### Journey Gaps (No Code Bug — Missing Features)

| # | Severity | Gap | Impact |
|---|----------|-----|--------|
| G1 | **High** | **No staff notification when quote accepted.** Customer told "our team will reach out shortly" but no SMS, email, or in-app alert goes to staff. Relies entirely on staff manually checking quotes list or having n8n configured | Customer waits indefinitely. Revenue lost |
| G2 | **High** | **No booking confirmation to customer.** Online booking creates appointment + takes deposit but sends NO confirmation SMS or email (only welcome email for new customers). Customer has no record of what they booked | Customer anxiety, no-shows, support calls |
| G3 | **High** | **No staff notification on new online booking.** Webhook fires to n8n but no in-app or direct notification. Staff may not see new bookings until checking the schedule | Missed appointments, late preparation |
| G4 | **Medium** | **No follow-up after quote viewed but not accepted.** The 24h reminder only fires if quote is NEVER viewed. A customer who opens the quote, considers it, and doesn't accept gets zero follow-up | Lost conversions |
| G5 | **Medium** | **No quote expiry notification.** When `valid_until` passes, neither customer nor staff is notified. Quote silently expires | Missed re-engagement opportunity |
| G6 | **Medium** | **Booking reminder is email-only.** No SMS reminder for tomorrow's appointment. Many customers check SMS more than email | Higher no-show rate |
| G7 | **Low** | **No SMS confirmation for voice-agent booked appointments.** Voice agent appointment SMS has correct info but uses `sendSms()` (transactional) with manual STOP footer, instead of being a proper marketing-consent-aware send | TCPA compliance edge case |
| G8 | **Low** | **Appointment confirmation requires manual staff action.** After online booking or quote conversion, staff must explicitly click "Notify" to send confirmation. Should auto-send | Extra staff clicks on every booking |
| G9 | **Low** | **SMS AI cannot act on appointments.** No tool-calling infrastructure. Customer must call to cancel/reschedule. AI should at minimum clearly direct them | Customer frustration |
| G10 | **Low** | **Duplicate appointment confirmation templates.** Same SMS exists in 4 places with slightly different wording: `pos/appointments/[id]/notify`, `appointments/[id]/notify`, `voice-agent/appointments`, `voice-post-call.ts` | Inconsistent customer experience |

### Priority Ranking for Fixes

**Fix immediately (pre-launch):**
1. G1 — Staff notification on quote acceptance (~40 lines)
2. G2 — Auto-send booking confirmation SMS+email after online booking (~30 lines in `book/route.ts`)
3. G3 — Staff notification on new booking (can piggyback on G2)
4. B1 — Hardcoded business name (~3 lines)
5. B3 — AI prompt update for appointment handling (~10 lines)

**Fix soon (first week post-launch):**
6. G6 — Add SMS to booking reminders (~15 lines in `booking-reminders/route.ts`)
7. G8 — Auto-send confirmation on appointment creation (move notify logic into create flow)
8. B2 — Add missing email variables to registry (~10 lines)
9. G10 — Unify appointment confirmation SMS template into shared function

**Post-launch backlog:**
10. G4 — Viewed-but-not-accepted quote follow-up (new lifecycle rule trigger)
11. G5 — Quote expiry notifications (new cron job)
12. G9 — SMS AI tool-calling for appointment actions (significant feature)

---

## 10. File Reference Index

### Entry Points (Customer-Facing)

| Path | File |
|------|------|
| Online booking form | `src/app/api/book/route.ts` |
| Public quote page | `src/app/(public)/quote/[token]/page.tsx` |
| Quote accept button | `src/app/(public)/quote/[token]/accept-button.tsx` |
| Quote accept API | `src/app/api/quotes/[id]/accept/route.ts` |

### Voice Agent

| Purpose | File |
|---------|------|
| Call initiation (ElevenLabs webhook) | `src/app/api/voice-agent/initiation/route.ts` |
| Customer lookup | `src/app/api/voice-agent/customers/route.ts` |
| Service catalog | `src/app/api/voice-agent/services/route.ts` |
| Availability check | `src/app/api/voice-agent/availability/route.ts` |
| Full context | `src/app/api/voice-agent/context/route.ts` |
| Book appointment | `src/app/api/voice-agent/appointments/route.ts` |
| Send quote SMS | `src/app/api/voice-agent/send-quote-sms/route.ts` |
| Create quote | `src/app/api/voice-agent/quotes/route.ts` |
| Finalize call | `src/app/api/voice-agent/finalize-call/route.ts` |
| Post-call processing | `src/lib/services/voice-post-call.ts` |
| Polling safety net | `src/app/api/cron/voice-calls-poll/route.ts` |

### SMS / AI

| Purpose | File |
|---------|------|
| SMS send utility | `src/lib/utils/sms.ts` |
| SMS consent management | `src/lib/utils/sms-consent.ts` |
| Twilio inbound webhook | `src/app/api/webhooks/twilio/inbound/route.ts` |
| Twilio status webhook | `src/app/api/webhooks/twilio/status/route.ts` |
| AI context assembly | `src/lib/services/messaging-ai.ts` |
| AI default prompt | `src/lib/services/messaging-ai-prompt.ts` |

### Quotes

| Purpose | File |
|---------|------|
| Quote creation | `src/lib/quotes/quote-service.ts` |
| Quote send (SMS + email) | `src/lib/quotes/send-service.ts` |
| Quote → appointment conversion | `src/lib/quotes/convert-service.ts` |
| Quote reminder cron | `src/app/api/cron/quote-reminders/route.ts` |
| POS quote detail | `src/app/pos/components/quotes/quote-detail.tsx` |
| POS quote ticket panel | `src/app/pos/components/quotes/quote-ticket-panel.tsx` |
| Quote book dialog | `src/components/quotes/quote-book-dialog.tsx` |
| Admin quotes list | `src/app/admin/quotes/page.tsx` |
| Admin quote detail | `src/app/admin/quotes/[id]/page.tsx` |

### Appointments

| Purpose | File |
|---------|------|
| Admin notify (SMS+email) | `src/app/api/appointments/[id]/notify/route.ts` |
| POS notify (SMS+email) | `src/app/api/pos/appointments/[id]/notify/route.ts` |
| Booking reminder cron | `src/app/api/cron/booking-reminders/route.ts` |

### POS Jobs

| Purpose | File |
|---------|------|
| Auto-populate from appointments | `src/app/api/pos/jobs/populate/route.ts` |
| Create walk-in job | `src/app/api/pos/jobs/route.ts` |
| Job CRUD / status updates | `src/app/api/pos/jobs/[id]/route.ts` |
| Start work | `src/app/api/pos/jobs/[id]/start-work/route.ts` |
| Complete job | `src/app/api/pos/jobs/[id]/complete/route.ts` |
| Mark pickup | `src/app/api/pos/jobs/[id]/pickup/route.ts` |
| Load checkout items | `src/app/api/pos/jobs/[id]/checkout-items/route.ts` |
| Link transaction (close) | `src/app/api/pos/jobs/[id]/link-transaction/route.ts` |
| Cancel job | `src/app/api/pos/jobs/[id]/cancel/route.ts` |
| Job addons | `src/app/api/pos/jobs/[id]/addons/route.ts` |
| Addon approve/decline | `src/lib/services/job-addons.ts` |
| POS job queue UI | `src/app/pos/jobs/components/job-queue.tsx` |
| POS job detail UI | `src/app/pos/jobs/components/job-detail.tsx` |

### Email

| Purpose | File |
|---------|------|
| Template rendering pipeline | `src/lib/email/send-templated-email.ts` |
| Variable definitions | `src/lib/email/variables.ts` |
| Template resolver | `src/lib/email/template-resolver.ts` |
| Layout renderer | `src/lib/email/layout-renderer.ts` |
| Template utility | `src/lib/utils/template.ts` |
| Welcome email | `src/lib/email/send-welcome-email.ts` |
| Cancellation email | `src/lib/email/send-cancellation-email.ts` |
| Order emails | `src/lib/utils/order-emails.ts` |

### Marketing / Lifecycle

| Purpose | File |
|---------|------|
| Campaign send | `src/app/api/marketing/campaigns/[id]/send/route.ts` |
| Scheduled campaign process | `src/app/api/marketing/campaigns/process-scheduled/route.ts` |
| Lifecycle engine cron | `src/app/api/cron/lifecycle-engine/route.ts` |
| Drip engine | `src/lib/email/drip-engine.ts` |

### Infrastructure

| Purpose | File |
|---------|------|
| Webhook utility | `src/lib/utils/webhook.ts` |
| Short link creation | `src/lib/utils/short-link.ts` |
| Business info | `src/lib/data/business.ts` |
| Business hours | `src/lib/data/business-hours.ts` |
