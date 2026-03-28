# SMS Audit Report — Smart Details Auto Spa

> **Date:** 2026-03-27
> **Scope:** Every outbound SMS message sent by the application
> **Status:** Read-only audit — no code changes

---

## SMS Sending Utilities

| Utility | Location | Guardrails |
|---------|----------|------------|
| `sendSms()` | `src/lib/utils/sms.ts:36` | Twilio HTTP API (no SDK), delivery tracking via `sms_delivery_log`, status callbacks. **No consent check** (by design — transactional) |
| `sendMarketingSms()` | `src/lib/utils/sms.ts:125` | Consent check (`customers.sms_consent`), daily frequency cap (default 5/day from `business_settings`), auto-appends "Reply STOP to unsubscribe", URL click tracking |
| `updateSmsConsent()` | `src/lib/utils/sms-consent.ts:12` | Full audit trail in `sms_consent_log` (source, keyword, action, timestamps) |

**Direct Twilio bypasses: NONE** — All SMS goes through shared utilities via HTTP fetch (no npm Twilio SDK).

---

## Complete SMS Template Catalog

| # | File | Line | Trigger | Category | Message Template (first 80 chars) | Variables | Configurable? | Safe to Edit? | Risk Notes |
|---|------|------|---------|----------|-----------------------------------|-----------|---------------|---------------|------------|
| 1 | `api/pos/appointments/[id]/notify/route.ts` | 249 | POS: admin sends appt confirmation | booking | `{biz.name} — Appointment Confirmed\n\n{date}\n{time}\nTotal: {total}\n\nQues...` | biz.name, date, time, total, biz.phone | No | Yes | Simple text, no URLs/tokens |
| 2 | `api/appointments/[id]/notify/route.ts` | 263 | Admin: send appt confirmation | booking | `{biz.name} — Appointment Confirmed\n\n{date}\n{time}\nTotal: {total}\n\nQues...` | biz.name, date, time, total, biz.phone | No | Yes | Same template as #1 (duplicate endpoint) |
| 3 | `api/appointments/[id]/notify/route.ts` | 282 | Admin: notify assigned detailer | system | `New job assigned: {services} – {vehicle}\n{date} at {time}\n{address}\nTotal...` | services, vehicle, date, time, address, total | No | Yes | Internal staff notification |
| 4 | `api/voice-agent/appointments/route.ts` | 344 | Voice agent books appointment | booking | `Your appointment at Smart Details Auto Spa is confirmed! {service} on {date}...` | service.name, date, time | No | Yes | **BUG: hardcodes business name** instead of `getBusinessInfo()`. Has STOP footer |
| 5 | `lib/services/voice-post-call.ts` | 304 | Post-call: appointment booked | booking | `Thanks for calling {biz.name}{name}! Your appointment is confirmed. We look...` | biz.name, customer name | No | Yes | Has STOP footer |
| 6 | `lib/services/voice-post-call.ts` | 552 | Post-call: auto-generate quote | quote | `Thanks for calling {biz.name}! Here's a quote for what we discussed: {link}...` | biz.name, linkUrl | No | Caution | Contains short link. Has STOP footer |
| 7 | `api/voice-agent/send-quote-sms/route.ts` | 246 | Mid-call: voice agent sends quote | quote | `Here's your quote from {biz.name} for {serviceList}: {link}\n\nReply STOP...` | biz.name, serviceList, linkUrl | No | Caution | Contains short link + service list. Has STOP footer |
| 8 | `lib/quotes/send-service.ts` | 210 | Admin sends quote from POS/admin | quote | `Estimate {quote_number} from {biz.name}\nTotal: {total}\n\nView Your Estima...` | quote_number, biz.name, total, shortLink | No | Caution | Contains short link. Optional MMS PDF attachment |
| 9 | `api/quotes/[id]/accept/route.ts` | 78 | Customer accepts quote (1 item) | quote | `Thanks {first_name}! Your quote for {item_name} has been accepted. Our team...` | first_name, item_name | No | Yes | Simple confirmation |
| 10 | `api/quotes/[id]/accept/route.ts` | 80 | Customer accepts quote (multi) | quote | `Thanks {first_name}! Your quote has been accepted. Our team will reach out s...` | first_name | No | Yes | Simple confirmation |
| 11 | `api/cron/quote-reminders/route.ts` | 75 | Cron: 24h after unviewed quote | reminder | `Hey {firstName}! Just checking if you had a chance to look at your quote: {u...` | firstName, shortUrl | No | Yes | Uses `sendMarketingSms()`. Contains short link. Deduped per quote |
| 12 | `api/pos/jobs/[id]/complete/route.ts` | 239 | POS: job marked complete | transactional | `Hi {first_name}, your {vehicle} is looking great and ready for pickup! 🎉\nV...` | first_name, vehicle, galleryLink, biz.name, biz.address, biz.phone, hoursLine | No | Caution | Contains emoji + short link to photo gallery + business hours logic |
| 13 | `api/pos/jobs/[id]/cancel/route.ts` | 210 | POS: job/appt cancelled | transactional | `Hi {first_name}, your {services} appointment on {date} at {time} has been ca...` | first_name, services, date, time, biz.name, biz.phone | No | Yes | Simple cancellation notice |
| 14 | `api/pos/receipts/sms/route.ts` | 76 | POS: customer requests SMS receipt | transactional | `{biz.name}\n{vehicle — total}\nThank you! View receipt:\n{shortUrl}` | biz.name, vehicle/total, shortUrl | No | Caution | Contains short link. 160-char limit enforced with truncation |
| 15 | `api/pos/jobs/[id]/addons/route.ts` | 227 | POS: detailer flags addon issue | transactional | `Hi {first_name}, while working on your {vehicle} we noticed {issue}. We reco...` | first_name, vehicle, issue, service, price, authorizeUrl, detailer, biz.name | No | No | Contains authorization URL with crypto token. Breaking format = broken auth flow |
| 16 | `api/pos/jobs/[id]/addons/[addonId]/resend/route.ts` | 126 | POS: resend expired addon auth | transactional | `{original_message}\n\nApprove or decline here: {authorizeUrl}\n\n— {biz.name}` | original_message, authorizeUrl, biz.name | No | No | Contains authorization URL with crypto token |
| 17 | `lib/services/job-addons.ts` | 143 | Customer approves addon (via link/SMS) | transactional | `Great! Your add-on ({serviceName}) has been approved. We'll get started righ...` | serviceName | No | Yes | Simple confirmation |
| 18 | `lib/services/job-addons.ts` | 205 | Customer declines addon (via link/SMS) | transactional | `No problem! We've noted {serviceName} as a recommendation for your next visi...` | serviceName | No | Yes | Simple confirmation |
| 19 | `api/webhooks/twilio/inbound/route.ts` | 819 | Inbound SMS: expired addon AUTHORIZE | system | `That authorization has expired. Would you like us to send a new one?` | (none) | No | Yes | Static message |
| 20 | `api/webhooks/twilio/inbound/route.ts` | 831 | Inbound SMS: expired addon DECLINE | system | `That authorization has expired. Would you like us to send a new one?` | (none) | No | Yes | Static message (same as #19) |
| 21 | `api/webhooks/twilio/inbound/route.ts` | 849 | Inbound SMS: AI auto-reply | voice-agent | (AI-generated, split into 320-char chunks) | Full AI context (services, pricing, customer history) | Partial | No | AI-generated content. Prompt is editable in admin. Output is unpredictable — cannot be templated |
| 22 | `api/messaging/send/route.ts` | 55 | Admin: staff sends manual SMS | transactional | (user-provided body) | (none — freeform) | N/A | N/A | Staff-composed. Not a template |
| 23 | `api/messaging/conversations/[id]/messages/route.ts` | 122 | Admin: staff replies in conversation | transactional | (user-provided body) | (none — freeform) | N/A | N/A | Staff-composed. Not a template |
| 24 | `api/marketing/campaigns/[id]/send/route.ts` | 368 | Admin: send marketing campaign | marketing | (rendered from `campaigns.sms_body` via `renderTemplate()`) | first_name, coupon_code, loyalty_points, lifetime_spend, etc. | Yes | Yes | Template-driven from DB. A/B testing support |
| 25 | `api/marketing/campaigns/process-scheduled/route.ts` | — | Cron: process scheduled campaigns | marketing | (same as #24, deferred execution) | (same as #24) | Yes | Yes | Same template system |
| 26 | `api/cron/lifecycle-engine/route.ts` | 684 | Cron: lifecycle rule triggers | marketing | (rendered from `lifecycle_rules.sms_template` via `renderTemplate()`) | first_name, coupon_code, booking_url, google_review_link, etc. | Yes | Yes | Template-driven from DB. Stop conditions |
| 27 | `lib/email/drip-engine.ts` | — | Cron: drip campaign step | marketing | (rendered from drip step `sms_body` via `renderTemplate()`) | (same variable set as #26) | Yes | Yes | Template-driven from DB |

---

## Summary Counts

| Metric | Count |
|--------|-------|
| **Total unique SMS templates** | **21** (excluding 2 staff freeform + 4 template-driven marketing) |
| **Already configurable (DB-driven templates)** | **4** (#24-27: campaigns, lifecycle, drip) |
| **Partially configurable** | **1** (#21: AI prompt editable, output not) |
| **Hardcoded in code** | **20** (#1-20) |
| **Safe to make admin-editable** | **14** (#1-5, #9-11, #13, #17-20) |
| **Risky / should NOT be editable** | **6** (#6-8, #14-16) — contain short links, auth tokens, or char limits |
| **Staff freeform (not templates)** | **2** (#22-23) |
| **Files that would need refactoring** | **13** unique files |

---

## Recommended Admin UI Groupings

### Settings > Messaging > SMS Templates (safe to edit)

| Group | Templates | Notes |
|-------|-----------|-------|
| Appointment Confirmations | #1, #2, #4, #5 | Merge into 1 shared template. Fix #4 hardcoded biz name |
| Appointment Cancellation | #13 | Single template |
| Job Completion | #12 | Has gallery link — mark `{gallery_link}` as required variable |
| Quote Accepted | #9, #10 | Could merge with conditional `{item_name}` |
| Quote Reminder | #11 | Currently cron-driven. `{short_url}` required |
| Add-on Approved/Declined | #17, #18 | Simple confirmations |
| Expired Authorization | #19, #20 | Static — could be one template |
| Detailer Job Assignment | #3 | Internal staff SMS |

### Marketing > Automations (already configurable)

- #24-27: Campaign and lifecycle templates — already editable in admin

### NEVER make admin-editable (structurally dependent)

| # | Template | Reason |
|---|----------|--------|
| 15 | Addon authorization request | Contains `{authorizeUrl}` with HMAC crypto token. Breaking format = customers can't approve/decline work |
| 16 | Addon auth resend | Same — crypto token URL |
| 6, 7, 8 | Quote SMS (voice + admin) | Contains short links and optional MMS PDF attachment. URL structure is code-dependent |
| 14 | Receipt SMS | 160-char limit with truncation logic. Short link required |
| 21 | AI auto-reply | AI-generated — output cannot be templated. Prompt IS already editable |

---

## Identified Issues

1. **BUG — Hardcoded business name** at `voice-agent/appointments/route.ts:344`: Uses `"Smart Details Auto Spa"` instead of `getBusinessInfo()`. Violates CLAUDE.md Rule #8.

2. **Duplicate templates**: Appointment confirmation exists in 4 places (#1, #2, #4, #5) with slightly different wording. Should be unified.

3. **Inconsistent STOP footers**: Voice-agent messages (#4, #5, #6, #7) include "Reply STOP to opt out" but use `sendSms()` (transactional), not `sendMarketingSms()`. Quote reminder (#11) correctly uses `sendMarketingSms()` which auto-appends the footer.

4. **No consent check on transactional SMS**: By design per TCPA (transactional SMS doesn't require consent), but job completion (#12) and appointment confirmations (#1, #2) send to customers who may have opted out of all SMS.

---

## Current Configurability

| SMS Content | Where Configured | Configurable | Method |
|---|---|---|---|
| AI auto-responder behavior | `/admin/settings/messaging` | Yes | Custom prompt text editor + standard template button |
| Lifecycle rule SMS templates | `/admin/marketing/automations` | Yes | Text editor with variable insertion UI |
| Campaign SMS templates | `/admin/marketing/campaigns` | Yes | Template editor with A/B testing |
| Drip campaign step SMS | `/admin/marketing/automations` | Yes | Template editor per drip step |
| Quote reminder message | `api/cron/quote-reminders` | No | Hardcoded in route.ts line 75 |
| Receipt SMS text | POS receipt system | No | Hardcoded in route.ts line 76 |
| SMS frequency caps | `src/lib/utils/sms.ts` | Partial | `sms_daily_cap_per_customer` in business_settings (default 5) |
| Review links in SMS | Business profile settings | Yes | via `google_review_url`, `yelp_review_url` in business_settings |

### business_settings keys related to SMS

- `messaging_ai_unknown_enabled` — AI responses for unknown customers
- `messaging_ai_customers_enabled` — AI responses for known customers
- `messaging_ai_instructions` — Custom AI behavioral prompt
- `messaging_auto_close_hours` — Auto-close idle conversations
- `messaging_auto_archive_days` — Auto-archive closed conversations
- `sms_daily_cap_per_customer` — Daily marketing SMS limit per customer (default: 5)
- `google_review_url` — Used in lifecycle templates as `{google_review_link}`
- `yelp_review_url` — Used in lifecycle templates as `{yelp_review_link}`

---

### Post-Audit Changes (Session 13F–13H, 2026-03-27)

- **Appointment confirmation SMS unified:** Templates #1, #2, #3, #4 now use shared `buildAppointmentConfirmationSms()` from `src/lib/utils/sms.ts`. Single canonical template with optional `serviceName`, `customerFirstName`, `total` fields.
- **STOP footers removed from transactional SMS:** Templates #4 (voice-agent appointment), #6 (voice post-call auto-quote), #7 (mid-call send-quote-sms) no longer include "Reply STOP to opt out." These use `sendSms()` (transactional) — only `sendMarketingSms()` should have STOP footers.
- **Quote-to-appointment conversion auto-notifies:** `QuoteBookDialog` now auto-sends confirmation via `/notify` endpoint after conversion. No longer requires manual staff "Notify" click.
- **New SMS sends added:** Staff notification on quote acceptance (G1), booking confirmation to customer (G2), staff notification on new booking (G3), SMS booking reminder (G6), viewed-quote follow-up (G4).
