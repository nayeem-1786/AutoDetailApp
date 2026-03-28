# Session 13F — Customer Journey Bug Fixes & Gap Closures

Read CLAUDE.md and docs/dev/FILE_TREE.md first.
Reference: `docs/planning/SESSION-13E-full-customer-journey.md` for full audit context.

## Context

Full customer journey audit identified 3 code bugs and 10 feature gaps across all paths (phone call, SMS, online booking, POS walk-in, admin quote). This session fixes all items prioritized as pre-launch or first-week.

---

## PART 1: CODE BUGS (3)

### Bug 1: Hardcoded Business Name in Voice Agent Appointment SMS

**Severity:** Low
**File:** `src/app/api/voice-agent/appointments/route.ts`, line 344

**Current code:**
```
`Your appointment at Smart Details Auto Spa is confirmed! ${service.name} on ${formattedDate} at ${formattedTime}. We look forward to seeing you! Reply STOP to opt out.`
```

**Problem:** Business name hardcoded as `"Smart Details Auto Spa"` instead of `getBusinessInfo()`. Violates CLAUDE.md Rule #8.

**Fix:** Import `getBusinessInfo` from `@/lib/data/business`, call it early in the function, replace hardcoded string with `biz.name`. Pattern: see `voice-post-call.ts:304`.

**Change size:** ~3 lines

---

### Bug 2: Email Template Variables — Undiscoverable in Admin UI

**Severity:** Medium
**File:** `src/lib/email/variables.ts`

**Root cause:** The email rendering pipeline works correctly (syntax is `{variable_name}`, rendered by `src/lib/utils/template.ts:80`). But 2 variables are passed by code and missing from the variable registry, so the admin template editor doesn't show them:

| Variable | Passed By | Missing From |
|----------|-----------|-------------|
| `cancellation_reason` | `src/lib/email/send-cancellation-email.ts:43` | `variables.ts` — not in any category |
| `amount_paid` | `src/app/api/cron/lifecycle-engine/route.ts:706` | `variables.ts` — not in marketing category |

(`customer_id` is also passed but is internal for dynamic photo blocks — do NOT expose in admin UI.)

**Fix:** Add to `src/lib/email/variables.ts`:
- `cancellation_reason` → `transactional` category, Appointments group (description: "Reason for cancellation")
- `amount_paid` → `marketing` category, Loyalty group (description: "Amount paid on last visit")

**Also verify:** Check the `email_templates` table row for `template_key = 'booking_reminder'`. If the template content uses wrong variable names (e.g., `{servicename}` instead of `{service_name}`), fix the template content in the DB seed migration. The cron passes: `first_name`, `customer_name`, `service_name`, `appointment_date`, `appointment_time`, `business_name`, `business_phone`, `booking_url`.

**Change size:** ~10 lines

---

### Bug 3: SMS AI Mishandles Appointment Questions

**Severity:** Medium
**File:** `src/lib/services/messaging-ai-prompt.ts`

**Root cause:** The AI CAN see appointments (data injected at `messaging-ai.ts:381-383,411` — up to 5 upcoming, with dates/times/services/status). But the default system prompt has no instructions for appointment-related requests, so the AI gives unhelpful responses like "I can't find any appointments."

The AI has zero tool-calling capability (`messaging-ai.ts:447-460` — no `tools` array in Anthropic API call). It cannot cancel, reschedule, or modify anything. This is by design for now.

**Fix:** Add an APPOINTMENT CHANGES section to the default prompt in `src/lib/services/messaging-ai-prompt.ts`:

```
APPOINTMENT CHANGES:
- You can SEE the customer's upcoming appointments (listed above) but you CANNOT cancel, reschedule, or modify them.
- If a customer asks to cancel or reschedule, acknowledge their appointment details and say: "I can see your upcoming appointment but I'm not able to make changes directly. Please call us at {business_phone} or visit your account online to manage your appointment."
- NEVER say "I can't find any appointments" if appointments are listed in the UPCOMING APPOINTMENTS section.
- If no appointments exist, say: "I don't see any upcoming appointments on file for your number."
```

Also update the "Apply Standard Template" default in the admin Settings > Messaging page (wherever `getDefaultSystemPrompt()` or similar is called) to include this section.

**Change size:** ~15 lines

---

## PART 2: JOURNEY GAPS (10)

### Gap 1 (HIGH): No Staff Notification When Quote Accepted

**File:** `src/app/api/quotes/[id]/accept/route.ts`

**Problem:** Customer accepts quote → told "our team will reach out shortly" → but staff gets no SMS, email, or in-app notification. Quote sits in "Accepted" status until someone manually checks the list.

**Fix:** After the customer SMS (line 91), add staff notification.

**Important:** This file currently has NO email or business info imports. Add these imports:
- `sendEmail` from `@/lib/utils/email`
- `getBusinessInfo` from `@/lib/data/business`
- `formatCurrency` from `@/lib/utils/format`

Then add:

1. Call `getBusinessInfo()` to get business phone + email
2. Send staff SMS via `sendSms(biz.phone, ...)`:
   ```
   Quote accepted! {customer.first_name} {customer.last_name} — Quote #{quote.quote_number} ({formatCurrency(quote.total_amount)}). Schedule appointment in POS.
   ```
3. Send staff email via `sendEmail(biz.email, ...)` (the simple text+HTML utility from `@/lib/utils/email`):
   - Subject: `Quote #{quote.quote_number} Accepted — {customer.first_name} {customer.last_name}`
   - Body: Quote details + direct link to admin quote page (`{appUrl}/admin/quotes/{quote.id}`)

**Pattern:** Follow `src/app/api/cron/stock-alerts/route.ts` for notification approach. Use `getBusinessInfo()` for v1 (simple), or query `notification_recipients` table for multi-recipient support.

**Change size:** ~40 lines

---

### Gap 2 (HIGH): No Booking Confirmation Sent to Customer

**File:** `src/app/api/book/route.ts`

**Problem:** Customer completes online booking, pays deposit, and receives NOTHING — no confirmation SMS, no confirmation email. Only new customers get a generic welcome email (not a booking confirmation). Returning customers get zero acknowledgment.

**Important:** This file currently has NO SMS, email, or business info imports. Add these imports:
- `sendSms` from `@/lib/utils/sms`
- `sendEmail` from `@/lib/utils/email`
- `sendTemplatedEmail` from `@/lib/email/send-templated-email`
- `getBusinessInfo` from `@/lib/data/business`
- `formatCurrency` from `@/lib/utils/format`

**Fix:** After appointment creation and all DB writes are committed (around line 378, AFTER the Stripe payment update but BEFORE webhooks), add:

1. **SMS confirmation** (if customer has phone) via `sendSms()`:
   ```
   {biz.name} — Booking Confirmed!

   {dateStr} at {timeStr}
   {serviceNames}
   Vehicle: {vehicleStr}
   Total: {formatCurrency(total)}

   Questions? Call {biz.phone}
   ```
   Pattern: Same format as POS appointment notify SMS at `pos/appointments/[id]/notify/route.ts:249`.

2. **Email confirmation** via `sendTemplatedEmail(customer.email, 'appointment_confirmed', {...})`:
   The template key is `appointment_confirmed` (NOT `booking_confirmation` — that key does not exist).
   Pass the same variables used in the POS appointment notify endpoint: `first_name`, `last_name`, `customer_name`, `appointment_date`, `appointment_time`, `appointment_total`, `vehicle_info`, `services_list`, `items_table`, `business_name`, `business_phone`, `business_email`, `business_address`, `business_website`.

The `appointment_confirmed` email template already exists and is used by the manual notify endpoints — reuse it here.

**Change size:** ~35 lines

---

### Gap 3 (HIGH): No Staff Notification on New Online Booking

**File:** `src/app/api/book/route.ts`

**Problem:** When a customer books online, webhook fires to n8n but there's no direct staff notification. Staff may not see the booking until they check the schedule.

**Fix:** Piggyback on Gap 2. After the customer confirmation (same location in `book/route.ts`), add staff notification:

1. Send staff SMS via `sendSms(biz.phone, ...)`:
   ```
   New online booking! {customer.first_name} {customer.last_name} — {serviceNames} on {dateStr} at {timeStr}. {paymentType === 'deposit' ? 'Deposit paid.' : 'Pay on site.'}
   ```
2. Send staff email via `sendEmail(biz.email, ...)`:
   - Subject: `New Booking — {customer.first_name} {customer.last_name} — {dateStr}`
   - Body: Appointment details + link to admin appointments page

**Change size:** ~25 lines (in same file as Gap 2)

---

### Gap 4 (MEDIUM): No Follow-Up After Quote Viewed But Not Accepted

**File:** `src/app/api/cron/quote-reminders/route.ts`

**Problem:** The 24h quote reminder at `quote-reminders/route.ts:75` only fires when `viewed_at IS NULL` (quote never opened). A customer who opens the quote, considers it, and doesn't accept gets ZERO follow-up.

**Fix:** Add a second reminder tier to the existing cron:

After the "never viewed" reminder loop, add a new query for quotes where:
- `status = 'viewed'` (opened but not accepted)
- `viewed_at` < 48 hours ago (give them 2 days to decide)
- No reminder already sent for this quote with `[viewed-reminder]` tag
- Customer has phone + SMS consent

Send via `sendMarketingSms()`:
```
Hi {firstName}! We noticed you checked out your estimate. Any questions? We're happy to help — just reply here or call us at {biz.phone}. {shortUrl}
```

Log with `[viewed-reminder]` tag in `quote_communications` for dedup.

**Change size:** ~30 lines

---

### Gap 5 (MEDIUM): Quote Expiry Is Silent

**File:** New logic needed — either in `src/app/api/cron/quote-reminders/route.ts` or a new cron

**Problem:** When `valid_until` passes, neither customer nor staff is notified. The quote silently expires.

**Fix:** Add to the quote reminders cron (same file, new section):

Query quotes where:
- `status IN ('sent', 'viewed')` (not yet accepted)
- `valid_until` between now and now + 24 hours (expiring tomorrow)
- No `[expiry-warning]` tagged communication exists

Send customer SMS via `sendMarketingSms()`:
```
Hi {firstName}, your estimate from {biz.name} expires tomorrow. View it here before it's gone: {shortUrl}
```

Also: Send staff SMS for accepted-but-not-converted quotes approaching expiry (status = `accepted`, `valid_until` within 48h):
```
Reminder: Quote #{quote_number} ({customer.first_name}) was accepted but not scheduled. Expires {valid_until_date}. Convert in POS.
```

**Change size:** ~40 lines

---

### Gap 6 (MEDIUM): Booking Reminder Is Email-Only

**File:** `src/app/api/cron/booking-reminders/route.ts`

**Problem:** Day-before appointment reminder sends email but no SMS. Many customers check SMS more reliably than email.

**Fix:** After the email send (around line 60), add SMS reminder if customer has phone:

```
Reminder: Your {service_name} appointment at {biz.name} is tomorrow, {appointment_date} at {appointment_time}. Questions? Call {biz.phone}
```

Use `sendSms()` (transactional, not marketing — appointment reminders are transactional under TCPA).

**Change size:** ~15 lines

---

### Gap 7 (LOW): Voice Agent Appointment SMS Uses Transactional Send with Manual STOP Footer

**File:** `src/app/api/voice-agent/appointments/route.ts`, line 344

**Problem:** Voice agent appointment confirmation uses `sendSms()` (transactional) but manually appends "Reply STOP to opt out." This is inconsistent — marketing-style footer on a transactional send. The STOP footer is handled automatically by `sendMarketingSms()`.

**Fix:** This is an edge case. The appointment confirmation IS transactional (doesn't require marketing consent). The manual STOP footer is harmless but unnecessary. Two options:
- **Option A (minimal):** Remove the manual "Reply STOP to opt out" text since it's transactional. Other transactional SMS (job complete, receipt, addon) don't include it.
- **Option B (leave it):** Extra opt-out text doesn't hurt. Just note the inconsistency.

**Recommendation:** Option A — remove the STOP footer to match other transactional SMS. This overlaps with Bug 1 (same file, same line), so fix both at once.

**Change size:** 0 additional lines (part of Bug 1 fix)

---

### Gap 8 (LOW): Appointment Confirmation Requires Manual Staff Action

**File:** `src/app/api/book/route.ts`, `src/lib/quotes/convert-service.ts`

**Problem:** After online booking or quote-to-appointment conversion, staff must explicitly click "Notify" to send confirmation. No auto-send.

**Fix:** This is fully addressed by Gap 2 (online booking auto-confirms) and partially by the quote conversion flow. For quote conversion:

In `src/lib/quotes/convert-service.ts`, after appointment creation (line ~115), add auto-notification:
- Reuse the same SMS template from `pos/appointments/[id]/notify/route.ts:249`
- Send confirmation SMS + email to customer automatically
- Skip if customer has no phone/email

**Change size:** ~25 lines

---

### Gap 9 (LOW): SMS AI Cannot Act on Appointments

**Status:** Addressed by Bug 3 (prompt update). Full tool-calling is a post-launch feature.

No additional work this session. The prompt fix in Bug 3 ensures the AI gives helpful responses instead of confusing ones.

**Change size:** 0 (covered by Bug 3)

---

### Gap 10 (LOW): Duplicate Appointment Confirmation SMS Templates

**Files:** 4 files with slightly different appointment confirmation wording:
1. `src/app/api/pos/appointments/[id]/notify/route.ts:249`
2. `src/app/api/appointments/[id]/notify/route.ts:263`
3. `src/app/api/voice-agent/appointments/route.ts:344`
4. `src/lib/services/voice-post-call.ts:304`

**Problem:** Each has a different message format. Customer experience varies depending on how the appointment was created.

**Fix:** Extract a shared function in `src/lib/utils/sms-templates.ts` (new file):

```typescript
export function buildAppointmentConfirmationSms(params: {
  businessName: string;
  businessPhone: string;
  date: string;
  time: string;
  total?: string;
  serviceNames?: string;
}): string {
  // Single canonical template used by all 4 callers
}
```

Then update all 4 callers to use it. This ensures consistent messaging regardless of entry path.

**Change size:** ~20 lines new file + ~4 lines per caller (16 lines across 4 files)

---

## PART 3: IMPLEMENTATION ORDER

Implement in dependency order — some gaps share the same file:

| Order | Item | File(s) | Lines |
|-------|------|---------|-------|
| 1 | Gap 10: Shared SMS template | New: `src/lib/utils/sms-templates.ts` | ~20 |
| 2 | Bug 1 + Gap 7: Voice agent biz name + STOP footer | `src/app/api/voice-agent/appointments/route.ts` | ~5 |
| 3 | Bug 3 + Gap 9: AI prompt for appointments | `src/lib/services/messaging-ai-prompt.ts` | ~15 |
| 4 | Bug 2: Email variable registry | `src/lib/email/variables.ts` | ~10 |
| 5 | Gap 1: Staff notification on quote accepted | `src/app/api/quotes/[id]/accept/route.ts` | ~40 |
| 6 | Gap 2 + Gap 3: Booking confirmation + staff notify | `src/app/api/book/route.ts` | ~60 |
| 7 | Gap 8: Auto-confirm on quote conversion | `src/lib/quotes/convert-service.ts` | ~25 |
| 8 | Gap 6: SMS booking reminder | `src/app/api/cron/booking-reminders/route.ts` | ~15 |
| 9 | Gap 4: Viewed-not-accepted follow-up | `src/app/api/cron/quote-reminders/route.ts` | ~30 |
| 10 | Gap 5: Quote expiry warning | `src/app/api/cron/quote-reminders/route.ts` | ~40 |
| 11 | Gap 10 callers: Update 4 files to use shared template | 4 files (notify routes + voice) | ~16 |

**Total estimated changes:** ~275 lines across 10 files (1 new)

---

## Verification Checklist

- [ ] Bug 1: Voice agent appointment SMS uses dynamic business name
- [ ] Bug 2: Admin email template editor shows `cancellation_reason` and `amount_paid` in correct categories
- [ ] Bug 3: AI acknowledges appointments and directs customer to call for changes
- [ ] Gap 1: Staff receives SMS + email when customer accepts quote
- [ ] Gap 2: Customer receives confirmation SMS + email immediately after online booking
- [ ] Gap 3: Staff receives SMS + email when new online booking arrives
- [ ] Gap 4: Viewed-but-not-accepted quotes get a 48h follow-up SMS
- [ ] Gap 5: Quotes expiring tomorrow trigger a warning SMS to customer
- [ ] Gap 5b: Accepted-but-not-converted quotes trigger a staff reminder
- [ ] Gap 6: Booking reminder cron sends SMS in addition to email
- [ ] Gap 7: Voice agent appointment SMS removes unnecessary STOP footer
- [ ] Gap 8: Quote-to-appointment conversion auto-sends confirmation to customer
- [ ] Gap 10: All 4 appointment confirmation SMS use the same shared template
- [ ] No regressions: existing `sendSms` and `sendMarketingSms` calls still work
- [ ] New file `src/lib/utils/sms-templates.ts` added to `docs/dev/FILE_TREE.md`

---

## Files to Modify

| Item | Files | Change Size |
|------|-------|-------------|
| Gap 10 | New: `src/lib/utils/sms-templates.ts` | ~20 lines |
| Bug 1 + Gap 7 | `src/app/api/voice-agent/appointments/route.ts` | ~5 lines |
| Bug 3 + Gap 9 | `src/lib/services/messaging-ai-prompt.ts` | ~15 lines |
| Bug 2 | `src/lib/email/variables.ts` | ~10 lines |
| Gap 1 | `src/app/api/quotes/[id]/accept/route.ts` | ~40 lines |
| Gap 2 + Gap 3 | `src/app/api/book/route.ts` | ~60 lines |
| Gap 8 | `src/lib/quotes/convert-service.ts` | ~25 lines |
| Gap 6 | `src/app/api/cron/booking-reminders/route.ts` | ~15 lines |
| Gap 4 + Gap 5 | `src/app/api/cron/quote-reminders/route.ts` | ~70 lines |
| Gap 10 callers | 4 notify/voice files | ~16 lines |

Update CHANGELOG.md, FILE_TREE.md, git add -A && git commit && git push && rm -rf .next
