# SMS Template System — Root Cause Investigation

**Session:** 42W-audit
**Date:** 2026-04-24
**Status:** READ-ONLY audit. No code changes. Single commit.
**Driving incident:** Customer received an SMS reading
> "Thank you Nayeem! Your your vehicle is all set. You earned 23 loyalty points today..."
> after a void on transaction SD-006223.

---

## TL;DR

The user's reported "void/refund fires the wrong template" is a **misattribution of cause**. The void path uses a hardcoded, vehicle-free SMS body. The refund path sends **no SMS at all** (POS or admin). The "your your vehicle" SMS the user received was the **30-second-delayed auto-receipt SMS from the original sale**, fired by a `setTimeout` scheduled when the transaction was created — not by the void.

There are three real defects beneath the misattribution:

1. **Auto-receipt setTimeout has no void/refund interlock.** A receipt SMS scheduled at sale-time still fires after the operator voids in the 30-second window. (`src/app/api/pos/transactions/route.ts:448`, no status check before send at line 519)
2. **The "your your vehicle" string is double-injected.** Both the calling code (line 506) and the engine's `DEFAULT_VARIABLE_FALLBACKS` (line 148) substitute the literal string `"your vehicle"` for missing `vehicle_description`. When the template body says "Your {vehicle_description} is all set," the result is "Your your vehicle is all set." (`src/lib/sms/render-sms-template.ts:140-158`)
3. **`payment_receipt` and `loyalty_milestone` slugs are referenced by code but not seeded.** The user authored their own bodies via direct DB insert; the engine has no template-existence verification, so any template the operator authors with prose like "Your {vehicle_description}" will collide with the engine fallback.

The architectural debt: the engine treats variable substitution as both a real-data path (caller-provided values) and a "never show raw {x} to a customer" safety net (predefined fallbacks). The two purposes leak into each other. Templates aren't aware of which variables are required-with-data vs. optional-with-graceful-omission.

---

## Phase 1 — Map the SMS template system architecture

### Storage

`sms_templates` table — created in `supabase/migrations/20260327000001_sms_template_system.sql:5-19`:

```sql
CREATE TABLE sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('booking', 'quote', 'transactional', 'reminder', 'system')),
  body_template TEXT NOT NULL,
  default_body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  can_silence BOOLEAN NOT NULL DEFAULT true,
  recipient_type TEXT NOT NULL DEFAULT 'customer' CHECK (recipient_type IN ('customer', 'staff', 'detailer')),
  recipient_phones TEXT[] DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```

The `variables` column is a JSONB array of `{key, description, required}` objects. RLS is enabled with no policies — server-only access via service role.

### Seeded templates

Three migrations seed templates:

| Migration | Templates seeded |
|---|---|
| `20260327000001_sms_template_system.sql` | 13: appointment_confirmed, appointment_confirmed_postcall, booking_confirmed, appointment_cancelled, quote_accepted_single, quote_accepted_multi, quote_accepted_staff_notify, booking_reminder, quote_reminder, quote_viewed_followup, job_complete, addon_approved, addon_declined, booking_staff_notify, detailer_job_assigned (15 actually — recount: 4 booking + 3 quote + 3 reminder + 3 transactional + 2 system = 15) |
| `20260329000001_sms_template_variable_audit.sql` | UPDATE-only — adds `first_name` / `detailer_first_name` to existing templates |
| `20260410000001_staff_notification_sms_template.sql` | 1: staff_notification |

**Total seeded: 16.** User reports admin UI shows 18: BOOKING (4), QUOTE (2), REMINDER (3), TRANSACTIONAL (5), SYSTEM (4). The TRANSACTIONAL count is 5 vs. seeded 3. The two extras: `payment_receipt` and `loyalty_milestone` — referenced by calling code but **not seeded by any migration** (`grep -rn "payment_receipt\|loyalty_milestone" supabase/` returns zero hits). The user must have inserted these rows directly via Supabase SQL editor.

The admin route `/api/admin/sms-templates/[slug]/route.ts` exposes only `GET` and `PUT` — no `POST`. The admin UI at `src/app/admin/settings/messaging/sms-templates/page.tsx` cannot create new templates. So the user authored the two missing template bodies out-of-band.

### Resolver — `src/lib/sms/render-sms-template.ts`

`renderSmsTemplate(slug, variables, fallback)` is the single entrypoint for every SMS that uses the DB template system. The flow (lines 172-276):

1. Read from a 60-second module-level cache (lines 42-44, 54-97).
2. **Template not found** → return `fallback` string verbatim, log warning. (lines 181-190)
3. **Template inactive** → return empty body with `isActive: false`. Caller is expected to skip sending. (lines 193-201)
4. Auto-inject `business_name`, `business_address`, `business_phone` (with override) if not already in `variables`. (lines 204-217)
5. **First substitution pass**: `renderTemplate()` from `src/lib/utils/template.ts:81-88`:
   ```ts
   return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
   ```
   Replaces `{key}` with `vars[key]` if defined; otherwise leaves the literal `{key}` intact.
6. **Post-render fallback pass** (lines 226-238): scans for any remaining `{key}` placeholder and substitutes from `DEFAULT_VARIABLE_FALLBACKS`:
   ```ts
   const DEFAULT_VARIABLE_FALLBACKS: Record<string, string> = {
     first_name: 'there',
     customer_name: 'Valued Customer',
     appointment_date: 'your scheduled date',
     appointment_time: 'your scheduled time',
     service_name: 'your service',
     services: 'your scheduled services',
     service_total: '',
     vehicle_description: 'your vehicle',     // ← the smoking gun
     vehicle_type: 'your vehicle',
     gallery_link: '',
     short_url: '',
     hours_line: '',
     address: '',
     deposit_info: '',
     item_name: 'your selected service',
     quote_number: 'your quote',
     detailer_first_name: 'your detailer',
   };
   ```
   - Empty-string fallbacks mark the line for full deletion (lines 233-245). Avoids "Total: " with nothing after.
   - **Unknown variables (no fallback entry) get stripped silently and a warning logged** — line 230. So a typo `{vehicl_description}` becomes empty text.
7. Required-variable warnings logged (lines 248-252) but **don't block sending**.
8. If render produced empty string (e.g. all lines stripped), fall back to the caller-provided `fallback`. (lines 258-267)

### Admin UI — `src/app/admin/settings/messaging/sms-templates/page.tsx` (590 lines)

Loads via `GET /api/admin/sms-templates`, edits a single template via `PUT /api/admin/sms-templates/[slug]`. The variable-inserter chips are sourced from a separate static registry at `src/lib/sms/sms-template-variables.ts` (the `SMS_TEMPLATE_VARIABLES` map). **`payment_receipt` and `loyalty_milestone` are absent from this registry** — when the user opens those rows in the admin UI, the variable inserter shows no chips. The user authored those bodies blind to the available variables.

The admin PUT route validates that any variable marked `required: true` in the template's `variables` JSONB column is referenced in the body via `{key}` (lines 71-85). It does **not** validate that the body's `{key}` placeholders exist in any registry — the user can write `{vehicle_description}` even when no calling code passes it.

`UNSAFE_SMS_TEMPLATES` (lines 134-142 of sms-template-variables.ts) lists 7 slugs that are intentionally not in the DB at all — addon_authorization, quote_sms_admin, etc. — because they have crypto tokens, MMS attachments, or 160-char strict limits that don't fit the template UX.

---

## Phase 2 — Master event → template mapping

The 22 customer/staff/detailer-facing SMS callsites in the project, grouped by category:

### Customer-facing (use DB templates with admin-editable bodies)

| Event | File:line | Template slug | Variable payload | Notes |
|---|---|---|---|---|
| Online booking confirmed | `src/app/api/book/route.ts:597` | `booking_confirmed` | first_name, business_name, business_phone, appointment_date, appointment_time, services, vehicle_description, service_total | Bug-prone: vehicle_description optional |
| Manual appt notify | `src/app/api/appointments/[id]/notify/route.ts:294` (re-import dynamic) | (resolves through `sendAppointmentSmsViaTemplate`) | — | See `src/lib/utils/sms.ts:319` — uses `appointment_confirmed` |
| POS appt notify (customer) | `src/app/api/pos/appointments/[id]/notify/route.ts:286` | (same as above) | — | Mirror of admin route |
| Voice agent appt confirm | `src/lib/utils/sms.ts:319` (`sendAppointmentSms` helper) | `appointment_confirmed` | first_name, business_name, business_phone, appointment_date, appointment_time, service_name, service_total, detailer_first_name | |
| Voice post-call confirm | `src/lib/services/voice-post-call.ts:347` | `appointment_confirmed_postcall` | first_name, business_name, business_phone | |
| POS job cancel | `src/app/api/pos/jobs/[id]/cancel/route.ts:214` | `appointment_cancelled` | first_name, services, appointment_date, appointment_time, business_name, business_phone | |
| Email-system cancel (admin reschedule etc.) | `src/lib/email/send-cancellation-email.ts:187` | `appointment_cancelled` | (same) | Companion to email |
| Quote accepted (single) | `src/app/api/quotes/[id]/accept/route.ts:85` | `quote_accepted_single` *or* `quote_accepted_multi` (slug computed) | first_name, item_name, business_name, business_phone | |
| Quote reminder (cron) | `src/app/api/cron/quote-reminders/route.ts:78` | `quote_reminder` | first_name, short_url | |
| Quote viewed follow-up | `src/app/api/cron/quote-reminders/route.ts:182` | `quote_viewed_followup` | first_name, short_url | |
| Booking reminder (cron) | `src/app/api/cron/booking-reminders/route.ts:76` | `booking_reminder` | first_name, service_name, business_name, appointment_time, business_phone | |
| Job complete | `src/app/api/pos/jobs/[id]/complete/route.ts:244` | `job_complete` | first_name, vehicle_description, gallery_link, business_name, business_address, business_phone, hours_line, detailer_first_name | Bug-prone: vehicle_description optional |
| Add-on approved | `src/lib/services/job-addons.ts:146` | `addon_approved` | first_name, service_name, business_name, business_phone | |
| Add-on declined | `src/lib/services/job-addons.ts:218` | `addon_declined` | first_name, service_name, business_name, business_phone | |
| Auto-receipt (sale completed) | `src/app/api/pos/transactions/route.ts:516` | **`payment_receipt`** *(USER-AUTHORED, NOT SEEDED)* | first_name, vehicle_description, transaction_greeting, loyalty_points_earned, receipt_link, business_name | **The bug origin.** 30-sec delayed setTimeout. |
| Loyalty milestone crossed | `src/app/api/pos/transactions/route.ts:329` | **`loyalty_milestone`** *(USER-AUTHORED, NOT SEEDED)* | first_name, loyalty_points_balance, loyalty_cash_value, booking_link, business_name | Same risk class as payment_receipt |

### Staff/detailer-facing (DB templates)

| Event | File:line | Template slug |
|---|---|---|
| Quote accepted → staff | `src/app/api/quotes/[id]/accept/route.ts:119` | `quote_accepted_staff_notify` |
| Online booking → staff | `src/app/api/book/route.ts:658` | `booking_staff_notify` |
| Specialty callback request → staff | `src/app/api/public/specialty-callback/route.ts:67` | `booking_staff_notify` |
| Detailer job assigned | `src/app/api/appointments/[id]/notify/route.ts:301`, `src/app/api/pos/appointments/[id]/notify/route.ts:293` | `detailer_job_assigned` |
| Voice escalation → staff | `src/app/api/voice-agent/notify-staff/route.ts:89`, `src/app/api/webhooks/twilio/inbound/route.ts:642` | `staff_notification` |

### Hardcoded SMS bodies (no DB template, listed in `UNSAFE_SMS_TEMPLATES`)

| Event | File:line | Why hardcoded |
|---|---|---|
| Add-on authorization request | `src/app/api/pos/jobs/[id]/addons/route.ts:236` | HMAC token URL — security-sensitive prose |
| Add-on authorization resend | `src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts:127` | Fresh HMAC token + MMS photo |
| Add-on auth expired | `src/app/api/webhooks/twilio/inbound/route.ts:864,876` | Static reply, zero variables |
| Quote SMS (admin send) | `src/lib/quotes/send-service.ts:222` | Short link + optional MMS PDF |
| Quote SMS (post-call) | `src/lib/services/voice-post-call.ts:609` | Short link |
| Quote SMS (mid-call) | `src/app/api/voice-agent/send-quote-sms/route.ts:258` | Short link + dynamic service list |
| POS receipt (manual) | `src/app/api/pos/receipts/sms/route.ts:79` | 160-char strict limit + truncation logic |
| Voice agent info SMS | `src/app/api/voice-agent/send-info-sms/route.ts:341` | Free-text agent-composed |
| Two-way conversation outbound | `src/app/api/messaging/conversations/[id]/messages/route.ts:122`, `src/app/api/messaging/send/route.ts:55`, `src/app/api/webhooks/twilio/inbound/route.ts:894` | Operator/AI free-text |
| **Transaction voided (when job cancelled)** | `src/lib/email/send-void-notification.ts:142-144` | **Hardcoded**: `"Hi {first_name}, transaction #{receipt} at {business_name} has been voided.{jobLine} Questions? Call {business_phone}."` Comment at line 26: "Uses hardcoded copy rather than DB templates because void notifications don't justify the template-management overhead." |

### Sites that fire NO SMS

| Event | Path | Notes |
|---|---|---|
| **POS refund (any)** | `src/app/api/pos/refunds/route.ts` | `grep "sendSms\|renderSmsTemplate" → zero hits`. Customer is **not notified** of any refund. |
| **Admin order refund** | `src/app/api/admin/orders/[id]/refund/route.ts` | Same — no SMS, no email. |
| **Transaction voided (when no job, no customer, or job already cancelled)** | `src/app/api/pos/transactions/[id]/route.ts:167` | The void notification is gated on `result.customer_id && result.job_cancelled`. Product-only voids = silent. |

---

## Phase 3 — Trace the void SMS path for SD-006223

### POS void handler — `src/app/api/pos/transactions/[id]/route.ts:107-176`

```ts
if (action === 'void') {
  // … permission + RPC call …
  // Fire-and-forget customer notification when a job was cancelled
  // by the cascade. Walk-in / no-customer voids skip this.
  if (result.customer_id && result.job_cancelled) {
    notifyTransactionVoided({
      customerId: result.customer_id,
      transactionId: id,
      jobCancelled: true,
      reason,
    }).catch((err) => console.error('[void notification] failed:', err));
  }
  // … audit log …
}
```

### `notifyTransactionVoided` — `src/lib/email/send-void-notification.ts:142-151`

```ts
const jobLine = input.jobCancelled
  ? ' Your scheduled service has been cancelled.'
  : '';
const smsBody =
  `Hi ${customer.first_name}, transaction #${receiptNumber} at ${business.name} has been voided.${jobLine}` +
  ` Questions? Call ${business.phone}.`;

const smsResult = await sendSms(customer.phone, smsBody, {
  logToConversation: true,
  customerId: customer.id,
  notificationType: 'transaction_voided',
  contextId: input.transactionId,
});
```

The void SMS body **does not contain `vehicle_description`, `loyalty_points`, or any phrase like "is all set"**. It cannot produce the user-reported message. Furthermore, it uses `notificationType: 'transaction_voided'` — different from `'receipt_sent'` (auto-receipt) and `'loyalty_milestone'`.

### POS refund handler — `src/app/api/pos/refunds/route.ts`

`grep "sendSms\|renderSmsTemplate\|notify" → zero hits`. **No SMS or email is sent on refund.** This is silently no-op for the customer's notification surface. The refund SMS the user perceived **does not exist** in the codebase.

### What the user actually received

The "Thank you Nayeem! Your your vehicle is all set. You earned 23 loyalty points today" message is fired by:

`src/app/api/pos/transactions/route.ts:440-530` — the **auto-receipt setTimeout**:

```ts
// Auto-send receipt SMS — 30s delay so staff can manually send first, then dedup check
if (data.customer_id) {
  const autoReceiptCustomerId = data.customer_id;
  const autoReceiptVehicleId = data.vehicle_id || null;
  const autoReceiptTxId = transaction.id;
  // …
  setTimeout(async () => {
    try {
      // … dedup check on metadata.notificationType='receipt_sent' …
      // … fetch vehicle description …
      const vars: Record<string, string> = {
        first_name: cust.first_name || '',
        vehicle_description: vehicleDesc || 'your vehicle',  // ← line 506
        transaction_greeting: greeting,
        loyalty_points_earned: String(pointsEarned),
        receipt_link: receiptLink,
        business_name: businessInfo.name,
      };
      // … fallback string …
      const rendered = await renderSmsTemplate('payment_receipt', vars, fallback);
      if (!rendered.isActive) return;
      await sendSms(cust.phone, rendered.body, {
        // …
        notificationType: 'receipt_sent',
        contextId: autoReceiptTxId,
      });
    }
  }, 30_000);  // ← line 530
}
```

**Defect:** the setTimeout has a dedup check (does a `receipt_sent` row already exist?) but no **status check** — it does not re-read the transaction's status before sending. If the operator voids in the 30-second window, the auto-receipt fires anyway, producing a "thank you for your purchase" SMS for a now-voided sale.

The chronology for SD-006223 was almost certainly:

1. T+0s: operator created the transaction. setTimeout scheduled for T+30s.
2. T+0–30s: operator voided the transaction. `notifyTransactionVoided` either fired (if a job was cancelled — sending the hardcoded "transaction has been voided" SMS) or no-opped.
3. T+30s: setTimeout fired the auto-receipt SMS using the **user-authored** `payment_receipt` template body, which contains "Your {vehicle_description} is all set" (or similar) and "You earned {loyalty_points_earned} loyalty points today".
4. Customer received both SMSes back-to-back. The user attributed the second one to the void.

The user may have seen one SMS or two depending on whether the transaction had a linked job. Either way, the "your your vehicle" SMS is the auto-receipt path, not a void/refund path.

---

## Phase 4 — Trace the `{vehicle_description}` substitution bug

**Hypothesis (a) — engine has a context-blind fallback that substitutes a literal phrase.**

**Confirmed.** Two layers cooperate to produce "your your vehicle":

### Layer 1 — caller-side fallback at line 506

```ts
const vars: Record<string, string> = {
  first_name: cust.first_name || '',
  vehicle_description: vehicleDesc || 'your vehicle',  // ← THE LITERAL
  // …
};
```

When `vehicleDesc` is empty (product-only sale, vehicle missing from transaction, etc.), the calling code substitutes the **literal string** `"your vehicle"` for `vehicle_description`. This is then passed into the template via `vars`.

### Layer 2 — engine fallback at line 148

```ts
const DEFAULT_VARIABLE_FALLBACKS: Record<string, string> = {
  // …
  vehicle_description: 'your vehicle',
  // …
};
```

If the calling code had passed *nothing* for `vehicle_description` (i.e., `vars.vehicle_description = undefined`), `renderTemplate` would leave `{vehicle_description}` literal in the output. The post-render scan at line 226-238 then substitutes the engine's `'your vehicle'` fallback. **Same outcome.**

### Why the doubled "Your your"

The user-authored `payment_receipt` body almost certainly reads something like:

> "Thank you {first_name}! Your {vehicle_description} is all set. You earned {loyalty_points_earned} loyalty points today..."

Substitution: `{vehicle_description}` → `'your vehicle'` → final text reads "Your your vehicle is all set." The capitalization mismatch (template's "Your" + fallback's lowercase "your") makes the bug visually obvious; the underlying defect is the engine's assumption that a fallback string can stand in for any prose context.

### Architectural diagnosis

The substitution engine has **two distinct purposes mashed into one**:

1. *Real-data substitution.* `vars[key]` holds caller-provided dynamic data: a customer name, an appointment time, a service total. These are required for the message to make sense.
2. *Graceful-degradation safety net.* `DEFAULT_VARIABLE_FALLBACKS` is meant to prevent customers ever seeing a raw `{vehicle_description}` placeholder. The fallback values are noun phrases the engine guesses might fit any context.

Purpose 1 is correct and necessary. Purpose 2 is the architectural debt:

- **Context-blind**: the engine doesn't know the surrounding prose. "Your {x}" + fallback "your vehicle" = "Your your vehicle". "Vehicle: {x}" + same fallback = "Vehicle: your vehicle" (fine). Same fallback, opposite outcomes.
- **Forces template authors to write defensively**: the template body must avoid prefixing `{vehicle_description}` with words like "Your" or "The". This is undocumented in the admin UI and unenforceable by validation.
- **Hides genuine missing-data bugs**: an operator who forgot to attach a vehicle to a job sees their template "work" with the fallback noun, instead of getting a warning. The required-variable check at line 248-252 logs to console only — never surfaces to the operator or skips the send.

Hypothesis (a) confirmed. Affects every template that uses `vehicle_description`, `vehicle_type`, `service_name`, `services`, `appointment_date`, `appointment_time`, `customer_name`, `first_name`, `item_name`, `quote_number`, or `detailer_first_name` (every key with a non-empty fallback in `DEFAULT_VARIABLE_FALLBACKS`).

---

## Phase 5 — Master event-vs-template catalog with verdicts

| # | Event | Code path | Currently fires | Should fire | Verdict |
|---|---|---|---|---|---|
| 1 | Sale completed (auto-receipt, 30s delayed) | transactions/route.ts:516 | `payment_receipt` (user-authored, not seeded) | `payment_receipt` (seeded with safe body) | **Body needs rewrite + status interlock; template should be seeded by migration to make it source-of-truth.** |
| 2 | Sale completed → loyalty threshold crossed | transactions/route.ts:329 | `loyalty_milestone` (user-authored, not seeded) | `loyalty_milestone` (seeded) | Same as above — seed the template, document the variables. |
| 3 | Transaction voided (with job cascade) | send-void-notification.ts:142 | Hardcoded body | NEW DB template `transaction_voided` | Move to DB so admin can edit copy + tone. |
| 4 | Transaction voided (no job, no customer) | none | nothing | DECIDE: nothing, or `transaction_voided` (gentler tone)? | **Open question.** |
| 5 | Refund full | none | **nothing** | NEW DB template `refund_full` | Customer should know money is coming back. Currently silent. |
| 6 | Refund partial | none | **nothing** | NEW DB template `refund_partial` | Customer should know what was refunded vs. kept. Currently silent. |
| 7 | Online order refund (admin) | admin/orders/[id]/refund/route.ts | **nothing** | NEW DB template `order_refund` (or share `refund_*`) | Same as 5/6 for ecommerce path. |
| 8 | Online booking confirmed | book/route.ts:597 | `booking_confirmed` ✓ | (same) | OK |
| 9 | POS appointment confirmed | sms.ts:319 (helper) | `appointment_confirmed` ✓ | (same) | OK |
| 10 | Post-call appointment confirmed | voice-post-call.ts:347 | `appointment_confirmed_postcall` ✓ | (same) | OK |
| 11 | Appointment cancelled | jobs/[id]/cancel/route.ts:214 | `appointment_cancelled` ✓ | (same) | OK |
| 12 | Booking reminder (cron) | cron/booking-reminders/route.ts:76 | `booking_reminder` ✓ | (same) | OK |
| 13 | Job complete | jobs/[id]/complete/route.ts:244 | `job_complete` ✓ | (same) | **Has same `vehicle_description` fallback risk as #1 — body must avoid "Your {vehicle_description}" prose.** |
| 14 | Add-on approved | job-addons.ts:146 | `addon_approved` ✓ | (same) | OK |
| 15 | Add-on declined | job-addons.ts:218 | `addon_declined` ✓ | (same) | OK |
| 16 | Quote accepted (single) | quotes/[id]/accept/route.ts:85 | `quote_accepted_single` ✓ | (same) | OK |
| 17 | Quote accepted (multi) | quotes/[id]/accept/route.ts:85 (slug switch) | `quote_accepted_multi` ✓ | (same) | OK |
| 18 | Quote reminder unviewed (cron) | cron/quote-reminders/route.ts:78 | `quote_reminder` ✓ | (same) | OK |
| 19 | Quote follow-up viewed (cron) | cron/quote-reminders/route.ts:182 | `quote_viewed_followup` ✓ | (same) | OK |
| 20 | Booking → staff notify | book/route.ts:658, public/specialty-callback/route.ts:67 | `booking_staff_notify` ✓ | (same) | OK |
| 21 | Quote accepted → staff notify | quotes/[id]/accept/route.ts:119 | `quote_accepted_staff_notify` ✓ | (same) | OK |
| 22 | Detailer job assigned | appointments + pos/appointments notify routes | `detailer_job_assigned` ✓ | (same) | **Has `vehicle_description` fallback risk** |
| 23 | Voice escalation → staff | voice-agent/notify-staff/route.ts:89 | `staff_notification` ✓ | (same) | OK |

### Templates that exist in the DB but the codebase does NOT use

`grep -rn "renderSmsTemplate\('` returns 14 distinct slugs in code. The DB has at minimum 16 from migrations. Templates seeded but never called: none found that I can identify with certainty — every seeded slug has a code consumer. (`payment_receipt` and `loyalty_milestone` are the inverse case — called but not seeded.)

---

## Phase 6 — Recommended fix scope

### OPTION A — Enum-driven event-to-template registry

Create `src/lib/sms/event-registry.ts` with a single source of truth:

```ts
export const SMS_EVENT_TEMPLATE_MAP = {
  sale_completed: 'payment_receipt',
  loyalty_threshold_crossed: 'loyalty_milestone',
  transaction_voided: 'transaction_voided',
  refund_full: 'refund_full',
  refund_partial: 'refund_partial',
  order_refund: 'order_refund',
  // … etc, ~22 entries
} as const;

export type SmsEvent = keyof typeof SMS_EVENT_TEMPLATE_MAP;
```

Refactor every callsite to call `sendEventSms(event: SmsEvent, vars, fallback)` instead of `renderSmsTemplate(slug, vars, fallback)`. Adding a new event = add an enum entry + a registry row + (probably) a seed migration.

**Pros:**
- Single audit surface: "What can fire SMS?" answered by reading one file.
- Compile-time guarantee that every site uses a known event.
- Refactoring template slugs becomes safe (rename in registry, not in 22 grep'd sites).

**Cons:**
- ~22 callsites to refactor — touches files in `src/app/api/`, `src/lib/`, `src/lib/services/`, `src/app/api/cron/`. Large blast radius.
- Doesn't fix Bug 1 (the substitution issue) on its own.

**Estimated effort:** 22 callsites + 1 new registry file + 1 helper function. ~250 LOC change. No new tables. Test surface: every existing SMS unit test needs a one-line update; ~6-8 test files.

### OPTION B — Status quo (current architecture)

Keep slug-based callsites. Each callsite knows its template key. Lower abstraction, higher per-callsite responsibility. Risks: typos (e.g. `payment_recipt`), slug drift, hard to audit "what fires where" without grep.

The current state has 22 callsites and at least 2 of them (`payment_receipt`, `loyalty_milestone`) reference slugs that aren't in the seed migrations. Those would have surfaced at code-review time with Option A's enum check.

### OPTION C — Engine rework (the deeper fix)

The Bug 1 substitution-fallback architecture (Phase 4) is independent of A vs. B. Recommended changes regardless of A/B:

1. **Drop string fallbacks for "noun-substitute" variables.** Replace `vehicle_description: 'your vehicle'` etc. with `vehicle_description: ''` and rely on the existing empty-fallback line-removal logic. Templates that need "your vehicle" prose must include it explicitly:
   - Bad: `"Hi {first_name}! Your {vehicle_description} is ready."`
   - Good: `"Hi {first_name}! Your vehicle is ready."` (don't take the variable when no real data)
   - Or: `"Hi {first_name}! Your {vehicle_description} is ready."` with caller required to provide a real value or template skipped entirely.
2. **Add a `required` mode that hard-skips the send.** Today `required: true` only logs a console warning. Make it a hard skip: if any required variable is missing, return `{ body: '', isActive: false }` and the caller will skip sending. Better than sending nonsense.
3. **Audit every template body for "Your {x}" / "The {x}" prefix patterns.** These are the prose anti-patterns that collide with the noun-phrase fallbacks.
4. **Validate placeholders against the variables registry on PUT.** Today the admin route only validates that `required: true` variables appear in the body. It should also reject unknown placeholders — `{vehicl_description}` typos should 400, not silently strip at render time.

**Estimated effort:** ~40 LOC in `render-sms-template.ts` + ~30 LOC in admin PUT validation + body audit (one-pass review of seeded + user-authored templates) + ~3 new tests. Small.

### OPTION D — Auto-receipt void/refund interlock (the bug-source-direct fix)

Independent of A/B/C: fix the `setTimeout` in `transactions/route.ts:448-530` so the auto-receipt:

1. Re-fetches the transaction status before sending.
2. Skips the send if status is `voided`, `refunded`, or `partial_refund`.
3. (Optional, harder) Also short-circuits if `notificationType: 'transaction_voided'` exists for this contextId.

**Estimated effort:** ~10 LOC + 1 test. Smallest fix that resolves the user-reported incident, but doesn't address the broader architectural issues.

### Recommended composite

**Do C + D + the new templates from Phase 7, in that order.** A is a nice-to-have for long-term hygiene but not load-bearing on the bug; defer to a future hygiene pass once C is in place.

| Step | Fix | Lines | Risk | Resolves |
|---|---|---|---|---|
| 1 | D: Auto-receipt status interlock | ~10 | Low | The user's specific incident |
| 2 | C1: Drop noun-phrase fallbacks; rely on line-removal | ~15 | Medium — affects every template that uses removed keys | "Your your vehicle" class of bugs |
| 3 | C2: Required-variable hard skip | ~10 | Low | Silent malformed sends |
| 4 | C4: Admin PUT placeholder validation | ~30 | Low | Future operator-authored typos |
| 5 | Seed `payment_receipt`, `loyalty_milestone` via migration | ~50 (migration text) | None | Source-of-truth for two templates that are currently DB-as-source |
| 6 | Add new templates: `transaction_voided`, `refund_full`, `refund_partial`, `order_refund` | ~80 (migration) + 4 callsite changes | Medium | Phase 5 gaps |
| 7 | C3: Audit every template body for "Your {x}" pattern | Read-only review | None | Prevention |
| 8 | A: Enum-driven event registry | ~250 | Medium-high | Long-term audit surface |

Steps 1–7 form a tight bug-fix session. Step 8 is a separate hygiene session.

---

## Phase 7 — Recommended new templates

### `transaction_voided`

- **Slug:** `transaction_voided`
- **Category:** `transactional`
- **Recipient:** `customer`
- **can_silence:** `true` (admins might want to suppress for compliance reasons; not legally required)
- **Variables:** `first_name` (req), `receipt_number` (req), `business_name` (req, auto-injected), `business_phone` (req, auto-injected), `job_cancelled_line` (optional), `reason_line` (optional)
- **Default body:**
  > Hi {first_name}, transaction #{receipt_number} at {business_name} has been voided.{job_cancelled_line}{reason_line} Questions? Call {business_phone}.
- **Notes:** `{job_cancelled_line}` resolves to either `" Your scheduled service has been cancelled."` or empty — done caller-side, not via DB toggle. Keep the existing fire-condition (`customer_id && job_cancelled`) for now; widening to all voids is the Phase 8 open question.

### `refund_full`

- **Slug:** `refund_full`
- **Category:** `transactional`
- **Recipient:** `customer`
- **can_silence:** `true`
- **Variables:** `first_name` (req), `receipt_number` (req), `refund_amount` (req — formatted "$X.YZ"), `business_name` (req), `business_phone` (req)
- **Default body:**
  > Hi {first_name}, we've processed a full refund of {refund_amount} for transaction #{receipt_number}. Refund will appear on your card in 5–10 business days. Questions? Call {business_phone}.
- **Notes:** "5–10 business days" is Stripe's typical CC settlement window. For cash refunds where the operator handed money back at the counter, the message reads weirdly — Phase 8 open question on whether to differentiate by payment method.

### `refund_partial`

- **Slug:** `refund_partial`
- **Category:** `transactional`
- **Recipient:** `customer`
- **can_silence:** `true`
- **Variables:** `first_name` (req), `receipt_number` (req), `refund_amount` (req), `total_amount` (req), `business_name` (req), `business_phone` (req)
- **Default body:**
  > Hi {first_name}, we've processed a partial refund of {refund_amount} for transaction #{receipt_number} (original total {total_amount}). Refund will appear on your card in 5–10 business days. Questions? Call {business_phone}.

### `order_refund`

- **Slug:** `order_refund`
- **Category:** `transactional`
- **Recipient:** `customer`
- **can_silence:** `true`
- **Variables:** `first_name` (req), `order_number` (req), `refund_amount` (req), `business_name` (req), `business_phone` (req)
- **Default body:**
  > Hi {first_name}, your refund of {refund_amount} for order #{order_number} has been processed. Refund will appear on your card in 5–10 business days. Questions? Call {business_phone}.

### Two existing templates that must be migrated to seeded state

`payment_receipt` and `loyalty_milestone` are currently DB-as-source-of-truth (user-authored via SQL editor). The fix session should write them as INSERT-ON-CONFLICT migrations using the user's current bodies as the canonical text. This makes git the source of truth and removes the "where did this template come from?" hazard. **Before doing so, the user-authored bodies must be re-written to avoid the "Your {vehicle_description}" anti-pattern from Phase 4.**

Suggested rewrites (subject to user approval):

- **`payment_receipt`** (current likely body has "Your {vehicle_description} is all set"):
  > Thank you {first_name}! {transaction_greeting} View your receipt: {receipt_link}{loyalty_line}\n\n{business_name}
  Where `{transaction_greeting}` is the caller-built phrase (already in vars at line 507) and `{loyalty_line}` is similarly caller-built. Move all noun-phrase wrapping prose into the caller; the template owns only the structural skeleton. This sidesteps the fallback collision entirely.

- **`loyalty_milestone`** (no current bug evidence, but same risk class):
  > Great news {first_name}! You now have {loyalty_points_balance} loyalty points — that's {loyalty_cash_value} off your next visit! Book now: {booking_link}\n\n{business_name}
  Already in good shape based on the fallback at line 327. Just needs to be seeded.

---

## Phase 8 — Open questions for reviewer

1. **Should void notifications send by default for product-only voids (no job cascade)?** Today the SMS only fires when a job was cancelled. A pure inventory void (e.g. correcting a checkout error) sends nothing. Argument for sending: customer's card was charged then voided, they should know. Argument against: receipts the operator never sent in the first place don't need a "void" follow-up, and pre-completion voids (within 30s) would now fire after the auto-receipt also fires. Decision affects the new `transaction_voided` template's fire condition and whether we need the auto-receipt interlock from C+D more urgently.

2. **For partial refunds with `restock` disposition, send the refund SMS or stay silent?** A partial refund where the customer kept the goods is a different conversation than a partial refund where they returned items. The current refund route doesn't fire any SMS so this is greenfield — but the new template needs a clear policy.

3. **Cash refunds vs. card refunds — separate templates or one?** "Refund will appear on your card in 5–10 business days" reads strangely if the operator handed cash back at the counter. Either: (a) one template that conditionally varies by payment method (callers branch on `payment_method` and pass different vars), (b) two templates `refund_full_card` / `refund_full_cash`, (c) one neutral template ("Refund of $X processed for transaction #Y") that works for both. Option (c) is simplest.

4. **The "your your vehicle" double-word — fix at the engine or at the template?** Engine fix (drop noun-phrase fallbacks) is one-and-done but changes behavior for every existing template that relies on the fallback (`job_complete`, `booking_confirmed`, `detailer_job_assigned`). Template fix (rewrite each body to avoid prefixing `{vehicle_description}` with "Your") is per-template work but more targeted. Recommend engine fix because the safety net is doing more harm than good and the fallback noun is rarely contextually correct prose.

5. **Should the auto-receipt setTimeout be replaced entirely?** The 30-second delay is fragile — operators who void within 30s get the receipt anyway (the bug). Alternatives: (a) write the auto-receipt intent to a `pending_notifications` table and let a 1-minute cron fire it (gives a longer interlock window and a paper trail), (b) drop the delay and send immediately (operators must void within an even shorter window), (c) drop the auto-receipt entirely (manual receipts only). The interlock fix (D) is a band-aid for choice (a)-shaped scope.

6. **Should the system send the operator a notification when their void/refund triggers a customer SMS?** Today the operator gets visual feedback only via the toast in the POS UI. For audit-grade traceability (e.g. customer disputes "I never got a refund notification"), an internal log or staff-side notification would close that gap.

7. **Should `payment_receipt` and `loyalty_milestone` migrations preserve the user's current authored bodies, or rewrite to safer defaults?** Preserving means the bug stays until step 7 of Phase 6 lands. Rewriting means the user loses their authored copy unless we capture it first. Recommendation: dump current bodies to a backup file before the fix session and re-author with the user before the migration runs.

8. **Should `UNSAFE_SMS_TEMPLATES` (the 7 hardcoded slugs) ever be moved to DB?** The current convention is to keep them hardcoded because of crypto tokens, MMS attachments, or strict char limits. But several entries (e.g. `addon_authorization_expired` — 2 identical static sends with zero variables) could safely move to DB. Worth a separate audit on its own.

---

## Appendix — Divergence from the projected design

The user mentioned an earlier audit (`sms-template-management-system.md`) that projected an SMS template system based on the `business_settings` table. The live system **does not match that projection**:

| Aspect | Projection (assumed) | Live system (verified) |
|---|---|---|
| Storage | `business_settings` JSONB | Dedicated `sms_templates` table (`20260327000001`) |
| Resolution | Read from settings → substitute | Read from DB (60s cache) → first-pass substitution → fallback substitution → empty-line cleanup |
| Variable validation | Likely none | `required: true` on PUT; logs warning at render time only |
| Admin UI | Single settings page | Dedicated `/admin/settings/messaging/sms-templates` SlideOver editor with variable-inserter chips |
| Caching | None projected | Module-level Map with 60s TTL + invalidate on PUT |

The live system is meaningfully more sophisticated than the projection. The architectural debt this audit identifies is **specific to the live implementation**, not inherited from the projection.

The projection-vs-reality gap is itself a finding: the team may want to keep the projected docs in sync with what was actually built, or mark them clearly as "historical / pre-build". Otherwise future audits will keep starting from the wrong premise.

---

## Files quoted in this audit

- `supabase/migrations/20260327000001_sms_template_system.sql` (210 lines, full schema + 15 seeded templates)
- `supabase/migrations/20260329000001_sms_template_variable_audit.sql` (variable additions, not new templates)
- `supabase/migrations/20260330000001_system_sms_logging.sql` (messages.metadata column for notification context)
- `supabase/migrations/20260410000001_staff_notification_sms_template.sql` (1 added template)
- `src/lib/sms/render-sms-template.ts` (276 lines, the resolver + fallback engine)
- `src/lib/sms/sms-template-variables.ts` (142 lines, admin UI variable registry + UNSAFE list)
- `src/lib/utils/template.ts` (the 8-line `renderTemplate` substitution function)
- `src/app/admin/settings/messaging/sms-templates/page.tsx` (590 lines, admin SlideOver editor)
- `src/app/api/admin/sms-templates/route.ts`, `[slug]/route.ts` (GET + PUT only; no POST)
- `src/app/api/pos/transactions/route.ts:300-339, 440-530` (loyalty milestone + auto-receipt setTimeout)
- `src/app/api/pos/transactions/[id]/route.ts:107-198` (void handler + notification call)
- `src/app/api/pos/refunds/route.ts` (no SMS or email — verified by zero-hit grep)
- `src/app/api/admin/orders/[id]/refund/route.ts` (no SMS or email — verified by zero-hit grep)
- `src/lib/email/send-void-notification.ts` (160 lines, hardcoded SMS body for void path)
