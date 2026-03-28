# Audit: Centralized SMS Template Management from Admin Panel

## Context

The app sends ~16 different SMS messages from 10+ files across voice agent, cron jobs, POS, quotes, booking, and webhook flows. Most messages are hardcoded string literals. The question: can all these be managed from an admin UI so messages can be edited without code changes? Where should it live, how complex is it, and what are the risks?

---

## Complete SMS Message Inventory

### Hardcoded Messages (12) — would need to be made configurable

| # | Source | Trigger | Current Message | File |
|---|--------|---------|-----------------|------|
| 1 | Voice — appointment confirmed | finalize_call + booked=true | `Thanks for calling {biz}! Your appointment is confirmed...` | `voice-post-call.ts:304` |
| 2 | Voice — auto-quote sent | finalize_call + services discussed | `Thanks for calling {biz}! Here's a quote: {link}` | `voice-post-call.ts:552` |
| 3 | Voice — mid-call quote | send_quote_sms tool | `Here's your quote from {biz} for {services}: {link}` | `send-quote-sms/route.ts:246` |
| 4 | Voice — appointment booked | voice agent books appt | `Your appointment at Smart Details is confirmed! {service} on {date}...` | `voice-agent/appointments/route.ts:344` |
| 5 | Quote reminder | Cron: 24h after sent, not viewed | `Hey {name}! Just checking if you had a chance to look at your quote: {link}` | `cron/quote-reminders/route.ts:75` |
| 6 | Quote sent (POS/manual) | Staff sends quote | `Estimate {number} from {biz}\nTotal: {amount}\nView: {link}` | `quotes/send-service.ts:210` |
| 7 | Quote accepted | Customer accepts via link | `Thanks {name}! Your quote for {service} has been accepted...` | `quotes/[id]/accept/route.ts:78` |
| 8 | Job complete | POS marks job done | `Hi {name}, your {vehicle} is looking great! View photos: {link}` | `pos/jobs/[id]/complete/route.ts:239` |
| 9 | Job cancelled | Staff cancels job | `Hi {name}, your {service} appointment on {date} has been cancelled...` | `pos/jobs/[id]/cancel/route.ts:209` |
| 10 | Appointment notify (POS) | Staff sends confirmation | `{biz} — Appointment Confirmed\n{date}\n{time}\nTotal: {amount}` | `pos/appointments/[id]/notify/route.ts:249` |
| 11 | Addon authorization | Detailer flags issue | Multi-line: issue description + price + authorize link | `pos/jobs/[id]/addons/route.ts:227` |
| 12 | Addon expired | Customer replies to expired addon | `That authorization has expired. Would you like us to send a new one?` | `webhooks/twilio/inbound/route.ts:819` |

### Already Configurable (4) — no changes needed

| # | Source | How Configured | File |
|---|--------|---------------|------|
| 13 | Lifecycle engine | `lifecycle_rules.sms_template` with 20+ variables | `cron/lifecycle-engine/route.ts` |
| 14 | Drip campaigns | `drip_steps.sms_template` with variables | `lib/email/drip-engine.ts` |
| 15 | Marketing campaigns | `campaigns.sms_template` with variables | `marketing/campaigns/[id]/send/route.ts` |
| 16 | AI auto-reply | AI-generated per message (Claude Sonnet) | `webhooks/twilio/inbound/route.ts` |

---

## Where Should It Live?

### Option A: Admin > Settings > Messaging (Recommended)

**Pros:**
- Already manages messaging-related settings (AI instructions, auto-close, auto-archive)
- Natural extension — "System SMS Templates" tab alongside existing "AI Assistant" and "Conversation Lifecycle" tabs
- Settings page pattern is simple: key-value pairs in `business_settings` table
- Staff who manage messaging already go here

**Cons:**
- Page would grow large with 12 templates + the existing settings
- Mixes operational settings with message content

### Option B: Admin > Marketing > System SMS Messages (New page)

**Pros:**
- Keeps message content management separate from operational settings
- Parallels the email templates page at `/admin/marketing/email-templates`
- More room for future growth (preview, test send, variable reference)

**Cons:**
- Marketing section implies promotional messages — these are transactional/operational
- Staff might not think to look in Marketing for system messages

### Recommendation: **Option A — Admin > Settings > Messaging**

Add a third tab "SMS Templates" alongside "AI Assistant" and "Conversation Lifecycle". The messages are operational (confirmations, reminders, notifications), not marketing campaigns. Keeping them in Settings makes them discoverable and keeps the page focused on messaging configuration.

---

## How Complex Is This?

### Complexity Assessment: MEDIUM — 2-3 session effort

**What's needed:**

1. **Storage (simple):** 12 new rows in `business_settings` table, keyed like `sms_template_quote_reminder`, `sms_template_voice_appointment_confirmed`, etc. Each value is a TEXT template with `{variable}` placeholders. No new tables needed.

2. **Admin UI (moderate):** New tab on the messaging settings page. For each template: label, description, editable textarea, variable reference chips, "Reset to Default" button, preview. This is the bulk of the work.

3. **Template resolution (simple):** A helper function `getSmsTemplate(key: string, variables: Record<string, string>): string` that reads from `business_settings`, falls back to hardcoded default if not customized, and replaces `{variable}` placeholders. The lifecycle engine already has this pattern with `renderTemplate()` from `src/lib/utils/template.ts`.

4. **Refactoring 12 callsites (moderate but tedious):** Each hardcoded message string needs to be replaced with a call to the template resolver. The variables are already computed at each callsite — they just need to be passed to the resolver instead of interpolated inline.

### Breakdown

| Task | Effort | Risk |
|------|--------|------|
| Define 12 template keys + defaults | Low | None |
| `getSmsTemplate()` resolver function | Low | None — reuses existing `renderTemplate()` |
| Admin UI — SMS Templates tab | Medium | Low — follows existing settings page pattern |
| Refactor 12 callsites to use resolver | Medium | **Medium — touches 10 files across critical paths** |
| Testing all 12 SMS flows | Medium | Required — each flow must be verified |

---

## Risk Assessment

### What could break?

**Risk 1 (Medium): Touching 10 files in critical paths**
The 12 SMS messages are in voice agent, POS, quotes, booking, and cron flows. Each refactor point is a one-line change (replace template literal with function call), but any typo or missing variable could break that SMS flow silently — the message would send but with `{first_name}` literally in the text instead of the actual name.

**Mitigation:** Each template has a hardcoded default fallback. If the `business_settings` row doesn't exist or is empty, the original hardcoded message is used. This means the refactor is non-destructive — if something goes wrong, it falls back to current behavior.

**Risk 2 (Low): Variable mismatch**
If an admin edits a template and removes a required variable (e.g., removes `{link}` from the quote reminder), the SMS sends without the quote link — defeating its purpose.

**Mitigation:** Show available variables as chips/tags in the UI. Add a warning if the admin removes a variable that was in the default template. Don't prevent saving — just warn.

**Risk 3 (Low): Template injection**
If an admin puts malicious content in a template, it gets sent as SMS. But this is an admin-only page behind auth + permission checks, so the trust boundary is appropriate.

**Risk 4 (None): Database migration**
No new tables needed. Uses existing `business_settings` with new keys. No schema changes.

### Will it break existing functionality?

**No, if implemented with fallbacks.** The key design principle: every `getSmsTemplate()` call includes the default template as a fallback parameter. If the business_settings row doesn't exist (hasn't been customized), the original hardcoded message is used verbatim. The system works identically to today until an admin explicitly edits a template.

---

## What Existing Patterns to Reuse

| Pattern | Source | Reuse For |
|---------|--------|-----------|
| `renderTemplate()` | `src/lib/utils/template.ts` | Variable substitution (`{first_name}` → `Nayeem`) |
| `business_settings` key-value store | Existing table | Store template strings |
| Messaging settings page UI | `src/app/admin/settings/messaging/page.tsx` | Tab structure, save/load pattern |
| Email template variable reference | `src/lib/email/variables.ts` | Document available SMS variables per template |
| Lifecycle engine template rendering | `src/app/api/cron/lifecycle-engine/route.ts` | Pattern for loading + rendering DB-stored SMS templates |

---

## Template Key Catalog (Proposed)

| Key | Default Message | Variables Available |
|-----|----------------|-------------------|
| `sms_voice_appointment_confirmed` | Thanks for calling {business_name}...confirmed... | `{business_name}`, `{first_name}` |
| `sms_voice_auto_quote` | Thanks for calling {business_name}! Here's a quote: {link} | `{business_name}`, `{link}` |
| `sms_voice_mid_call_quote` | Here's your quote from {business_name} for {services}: {link} | `{business_name}`, `{services}`, `{link}` |
| `sms_voice_appointment_booked` | Your appointment at {business_name} is confirmed! {service}... | `{business_name}`, `{service}`, `{date}`, `{time}` |
| `sms_quote_reminder` | Hey {first_name}! Just checking... | `{first_name}`, `{link}` |
| `sms_quote_sent` | Estimate {quote_number} from {business_name}... | `{quote_number}`, `{business_name}`, `{amount}`, `{link}` |
| `sms_quote_accepted` | Thanks {first_name}! Your quote for {service}... | `{first_name}`, `{service}` |
| `sms_job_complete` | Hi {first_name}, your {vehicle} is looking great! | `{first_name}`, `{vehicle}`, `{link}`, `{business_name}`, `{business_address}`, `{business_phone}` |
| `sms_job_cancelled` | Hi {first_name}, your {service} appointment... | `{first_name}`, `{service}`, `{date}`, `{time}`, `{business_name}`, `{business_phone}` |
| `sms_appointment_confirmed` | {business_name} — Appointment Confirmed... | `{business_name}`, `{date}`, `{time}`, `{amount}`, `{business_phone}` |
| `sms_addon_authorization` | Hi {first_name}, while working on your {vehicle}... | `{first_name}`, `{vehicle}`, `{issue}`, `{service}`, `{price}`, `{link}`, `{detailer}`, `{business_name}` |
| `sms_addon_expired` | That authorization has expired... | (none — static message) |

---

## Other Considerations

1. **"Reply STOP" opt-out:** Some messages include `Reply STOP to opt out.` and others don't. The admin UI should show which messages are transactional (no opt-out needed) vs. marketing (opt-out required by TCPA). Marketing templates should have the opt-out footer locked/non-removable.

2. **Message length:** SMS has a 160-char single segment limit (320 for concatenated). The UI should show a character count and warn when the template exceeds 320 chars.

3. **Preview with sample data:** The UI should show a live preview with sample variable substitution so the admin can see what the message looks like.

4. **Detailer notification SMS (appointment notify):** Line 282-287 in `appointments/[id]/notify/route.ts` sends an SMS to the assigned detailer (staff), not the customer. This is an internal notification and probably should NOT be admin-editable. Exclude from the template system.

5. **Receipt SMS:** The POS receipt SMS (`pos/receipts/sms/route.ts`) is a minimal transaction summary. It could be templated but the value is low — receipts are structured data, not conversational messages.

6. **Multi-variant quote acceptance:** The quote acceptance SMS has two variants (single service vs. multiple services). The template system would need to handle this — either two separate templates or conditional logic in one template.

---

## Summary

| Question | Answer |
|----------|--------|
| Is this viable? | **Yes** — medium complexity, well-established patterns to reuse |
| Where should it live? | **Admin > Settings > Messaging** — new "SMS Templates" tab |
| How many sessions? | **2-3 sessions** (storage + UI + refactor callsites) |
| Risk of breaking things? | **Low with fallbacks** — hardcoded defaults used when no customization exists |
| New tables needed? | **None** — uses existing `business_settings` |
| New migrations needed? | **None** |
| Files touched | ~12 files (10 callsites + resolver function + admin UI) |
| Blocking for launch? | **No** — can be done post-launch. Current hardcoded messages work fine. |
