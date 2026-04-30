# Universal SMS Variable Inventory — Per-Slug Caller Analysis

**Status:** READ-ONLY investigation snapshot.
**Verified against:** branch `main`, HEAD `4b3fd219` (working tree clean at audit time).
**Source of truth:** production DB body_template values queried via Supabase REST during the audit; caller code paths read directly from `src/`.
**Predecessors:** `SMS_TEMPLATE_ROOT_CAUSE_SESSION42W.md` (root cause), `SMS_COMPLETE_INVENTORY_SESSION42Z.md` (population), and the Session 42AB+ hardcoded-sites inventory captured in the prior turn of this session.

This document is the third in the SMS audit chain. 42W diagnosed *why* the chip system exists; 42Z enumerated *every* customer-facing SMS surface; this audit catalogs *every variable each caller passes (or could trivially pass)* so a universal palette can be designed before any callsite migrations begin.

---

## Scope

For each of 32 customer/staff/detailer-facing SMS slugs (18 existing chip-driven templates + 14 hardcoded sites), this document captures:

- **Caller files** — every file/line that builds the variables object for the slug
- **Body references** — every `{placeholder}` in the production body_template (existing slugs only)
- **Variables passed today** — value source, presence guarantee, classification (required / optional / composite)
- **Variables in caller scope but NOT currently passed** — fields on objects already in scope at the sendSms callsite that *could* be promoted to chips for free
- **Cross-caller note** — divergence flags when the same slug has multiple callers with different variable shapes

Marketing/lifecycle/drip and free-text two-way SMS are out of scope (covered by 42Z exemption classes).

**Helper note:** The earlier prompt mentions `buildTransactionGreetingComposite` and `buildJobSummaryComposite`. **Neither exists.** Only `buildAppointmentConfirmationSms` is a real helper (`src/lib/utils/sms.ts:295-335`). The transaction-greeting composite is built inline at `src/app/api/pos/transactions/route.ts:534-544`; the job-summary composite is built inline at both `src/app/api/appointments/[id]/notify/route.ts:299` and `src/app/api/pos/appointments/[id]/notify/route.ts:291` (identical 1-line ternary). No shared helper today.

---

## Existing chip-driven slugs (1–18)

### 1. appointment_confirmed

  Slug: appointment_confirmed
  Status: existing-chip-driven
  Caller files:
    - src/lib/utils/sms.ts:327 (helper buildAppointmentConfirmationSms — 4 caller invocations)
    - src/app/api/appointments/[id]/notify/route.ts:264 (helper invocation)
    - src/app/api/pos/appointments/[id]/notify/route.ts:256 (helper invocation)
    - src/app/api/voice-agent/appointments/route.ts:293 (helper invocation, quote-conversion path)
    - src/app/api/voice-agent/appointments/route.ts:520 (helper invocation, ad-hoc booking path)
  Body references: `{business_name}`, `{first_name}`, `{appointment_summary}`, `{business_phone}` — but production body has been operator-edited away from this; current production body is `'{business_name} — Appointment Confirmed:\n\n{service_name}\n{appointment_date}\nat {appointment_time} - {service_total}\n\nNeed to make a change?\nCall {business_phone}\n\n\n'` which does NOT reference `{first_name}` or `{appointment_summary}` and reintroduces 4 chips the helper does not pass after Session 42AB.

  Variables passed today by caller (helper at sms.ts:327-332):
    business_name:
      value source: `params.businessName` (from each caller's `biz.name` / `business.name`)
      always present: yes
      classification: required (auto-injected by engine if omitted)
    first_name:
      value source: `params.customerFirstName || 'there'`
      always present: yes (defaults to literal 'there')
      classification: required
    appointment_summary:
      value source: composite — `'Your appointment is scheduled:'` + optional `serviceName` + `${date} at ${time}` + optional `Total: ${total}`, joined by `\n`
      always present: yes (always at least 2 lines)
      classification: composite (caller pre-builds)
    business_phone:
      value source: `params.businessPhone`
      always present: yes
      classification: required (auto-injected if omitted)

  Variables in caller scope but NOT currently passed:
    • via helper params: `detailer_first_name` is in params (`detailerFirstName`) but never forwarded into the renderSmsTemplate vars object — caller-side dead data.
    Per-caller scope (objects in scope at helper invocation):
    - `appointments/[id]/notify/route.ts` scope at :264:
      `customer.last_name` (always), `customer.email` (sometimes), `customer.phone` (used as recipient), `vehicle.year/make/model/color` (sometimes — vehicleStr already cleaned), `employee.last_name` (sometimes), `appointment.id`, `appointment.scheduled_date`, `appointment.scheduled_end_time`, `appointment.mobile_address` (sometimes), `appointment.total_amount`, `services[]` with `tier_name`/`price_at_booking`.
    - `pos/appointments/[id]/notify/route.ts` scope at :256: identical shape to above.
    - `voice-agent/appointments/route.ts` scope at :293 (quote-conversion path): `serviceNames` is set, no vehicle in scope at this site, `appointment.total_amount` not loaded into scope here, `customerId` (sometimes).
    - `voice-agent/appointments/route.ts` scope at :520 (ad-hoc path): `service.name`, `appointment.id`, `customerId` (sometimes), `e164Phone` (always).
    Potential chips:
      vehicle_description:
        source: `cleanVehicleDescription({year, make, model})` from `appointment.vehicle` in 2 of 4 callers
        always present at this callsite: sometimes (2 of 4 callers; absent in voice-agent paths)
      vehicle_color:
        source: `appointment.vehicle.color` in 2 of 4 callers
        always present at this callsite: sometimes
      address / mobile_address:
        source: `appointment.mobile_address`
        always present at this callsite: sometimes (only when mobile_service)
      detailer_first_name:
        source: `appointment.employee.first_name` (already passed into helper as `detailerFirstName` but discarded inside helper)
        always present at this callsite: sometimes
      detailer_name:
        source: `\`${employee.first_name} ${employee.last_name}\``
        always present at this callsite: sometimes
      service_total:
        source: `formatCurrency(appointment.total_amount)` — currently absorbed into `appointment_summary` composite
        always present at this callsite: 2 of 4 callers (admin + POS notify); voice-agent paths do not load `total_amount`
      services (multi-list):
        source: `serviceNames` — currently absorbed into composite
        always present at this callsite: yes in all 4 (helper takes only single `serviceName`)

  Cross-caller note: 4 callers, all funnel through the helper at `sms.ts:327`. The helper's `serviceName` param is single-string; admin and POS notify routes already build `serviceNames` (comma-joined multi) but the helper signature accepts only one. Voice-agent quote-conversion path at :293 passes `serviceNames` (multi) into the helper's single-string param — works only because the composite line just concatenates — but would mis-render if the template body ever referenced individual service items. The composite hides this divergence: under a future flat palette, callers would pass `services` (multi) consistently.

### 2. appointment_confirmed_postcall

  Slug: appointment_confirmed_postcall
  Status: existing-chip-driven
  Caller files:
    - src/lib/services/voice-post-call.ts:347
  Body references: `{business_name}`, `{first_name}`, `{business_phone}` — production body matches seed: `'Thanks for calling {business_name}, {first_name}! Your appointment is confirmed. Questions? Call {business_phone}'`.

  Variables passed today by caller:
    first_name:
      value source: `customer.first_name || undefined`
      always present: sometimes empty (caller pulls from `customer` object via `phone` lookup; new voice callers may have generic name "Phone Caller" as `first_name`)
      classification: required (engine hard-skips if undefined or empty per render-sms-template.ts:262-281; with seed body's possessive ", " comma after greeting, hard-skip is the only safe path)

  Variables in caller scope but NOT currently passed:
    Scope at line 347: `customer.id`, `customer.first_name`, `customer.sms_consent`, `customer.customer_type`, `normalizedPhone`, `conversation.id`, plus from `params`: `params.transcriptSummary`, `params.servicesDiscussed`, `params.appointmentBooked`, `params.customerName`, `params.vehicleYear/Make/Model/Color`, `params.durationSeconds`, `params.elevenlabsConversationId`. `biz` (full business info) is fetched at :343 but not all fields passed.
    Potential chips:
      customer_id:
        source: `customer.id`
        always present at this callsite: yes (when this branch executes)
      customer_phone (full):
        source: `normalizedPhone`
        always present at this callsite: yes
      vehicle_year, vehicle_make, vehicle_model, vehicle_color:
        source: `params.vehicleYear/Make/Model/Color`
        always present at this callsite: sometimes (depends on what the agent captured)
      vehicle_description:
        source: caller could compose from `params.vehicleYear/Make/Model`
        always present at this callsite: sometimes
      transcript_summary:
        source: `params.transcriptSummary`
        always present at this callsite: sometimes
      services_discussed:
        source: `params.servicesDiscussed?.join(', ')`
        always present at this callsite: sometimes

  Cross-caller note: single caller. No divergence. The seed body's `, {first_name}` comma makes `first_name` HIGH-risk for orphan-comma — caller must pass non-empty or hard-skip fires. Today caller passes `customer.first_name || undefined` which produces `undefined` for new "Phone Caller" customers, triggering hard-skip; this is intentional (`render-sms-template.ts:262-281`) but means brand-new callers receive zero post-call confirmation.

### 3. appointment_cancelled

  Slug: appointment_cancelled
  Status: existing-chip-driven
  Caller files:
    - src/app/api/pos/jobs/[id]/cancel/route.ts:214
    - src/lib/email/send-cancellation-email.ts:187
  Body references: `{first_name}`, `{services}`, `{appointment_date}`, `{appointment_time}`, `{business_name}`, `{business_phone}` — production matches seed: `'Hi {first_name}, your {services} appointment on {appointment_date} at {appointment_time} has been cancelled. Please contact us to reschedule. - {business_name} {business_phone}'`.

  Variables passed today by caller (both callers — same shape):
    first_name:
      value source: `customer.first_name`
      always present: yes (DB column NOT NULL on `customers`)
      classification: required
    services:
      value source: cancel-route — `services.map(s => s.service?.name || 'Service').join(', ')`; cancellation-email — `serviceRows.map(s => s.service?.name).filter(Boolean).join(', ') || 'Your service'`
      always present: yes
      classification: required
    appointment_date:
      value source: `dateStr` from `new Date(appointment.scheduled_date + 'T00:00:00').toLocaleDateString(...)`
      always present: yes
      classification: required
    appointment_time:
      value source: `displayTime` (12-hr formatted from `scheduled_start_time`)
      always present: cancel-route — yes; cancellation-email — sometimes empty (line 73-83 explicitly handles null/invalid `scheduled_start_time` → empty string)
      classification: required (cross-caller contract risk — see below)

  Variables in caller scope but NOT currently passed:
    Scope at cancel-route :214: `customer.email`, `customer.phone`, `customer.id`, `appointment.scheduled_end_time`, `services[].service_id`, `notify_method` (sms/email/both), `id` (appointment id), `business.address`, `business.website`, `business.email`.
    Scope at cancellation-email :187: `customer.last_name`, `customer.email`, `bookingUrl`, `cancellationReason` (from `reason` param), `serviceRows[].service_id`, `appointment.id`.
    Potential chips:
      cancellation_reason:
        source: `reason` parameter (currently used in email only at :86, :97)
        always present at this callsite: sometimes (caller-supplied)
      booking_url:
        source: `${process.env.NEXT_PUBLIC_APP_URL}/book` (already constructed at email-helper line 85)
        always present at this callsite: yes
      customer_phone, customer_email:
        source: `customer.phone`, `customer.email`
        always present at this callsite: sometimes (phone yes for SMS branch, email may be null)

  Cross-caller note: 2 callers. `appointment_time` is "always present" in cancel-route (no null guard, would crash earlier if null) but "sometimes empty" in cancellation-email (explicit empty fallback at line 81). Under the engine's hard-skip rule, the cancellation-email caller would silently skip the SMS for any appointment with null `scheduled_start_time` — which may be an in-progress data hygiene issue, not a feature. Contract risk.

### 4. booking_confirmed

  Slug: booking_confirmed
  Status: existing-chip-driven
  Caller files:
    - src/app/api/book/route.ts:597
  Body references: production body has been operator-edited: `'{business_name} — Online Booking Confirmed:\n\n{services}\n{appointment_date}\nat {appointment_time} - {service_total}\n\nNeed to make a change?\nCall {business_phone}'` — references 6 chips. Seed body referenced 7 (added `{vehicle_description}` and `{first_name}`); operator removed both.

  Variables passed today by caller (book/route.ts:597-606):
    first_name:
      value source: `data.customer.first_name || undefined`
      always present: yes (booking validates customer.first_name as required at form layer)
      classification: required-by-validator, optional in body (operator removed; engine hard-skip would still fire if seed re-added)
    appointment_date:
      value source: `dateStr` (formatted)
      always present: yes
      classification: required
    appointment_time:
      value source: `timeStr` (12-hr formatted)
      always present: yes
      classification: required
    services:
      value source: `[serviceRow.name, ...data.addons.map(a => a.name)].join(', ')`
      always present: yes
      classification: required
    vehicle_description:
      value source: form-data first (`cleanVehicleDescription({year, make, model})`), fallback to `vehicles` table lookup by `vehicleId`; `vehicleStr || undefined` passed as chip
      always present: sometimes empty (no vehicle attached at all)
      classification: optional (operator-removed from body)
    service_total:
      value source: `formatCurrency(Number(appointment.total_amount))`
      always present: yes
      classification: required
    deposit_amount:
      value source: `depositAmountFormatted || undefined` (caller-conditional on `hasDeposit`)
      always present: sometimes empty
      classification: optional
    balance_due:
      value source: `balanceDueFormatted || undefined`
      always present: sometimes empty
      classification: optional
    payment_info:
      value source: caller-built composite — `${depositAmountFormatted}. Balance due: ${balanceDueFormatted}.` OR `'Payment due at time of service.'`
      always present: yes
      classification: composite (caller pre-builds)

  Variables in caller scope but NOT currently passed:
    Scope at :597: `data.customer.last_name`, `data.customer.email`, `data.customer.id`, `data.vehicle.color`, `vehRecord.color` (DB lookup includes color), `data.payment_intent_id`, `data.deposit_amount` (raw), `appointment.id`, `appointment.total_amount`, `data.addons[].price`, `appUrl`.
    Potential chips:
      customer_name (full):
        source: `\`${data.customer.first_name} ${data.customer.last_name}\`.trim()` (already in scope at :574)
        always present at this callsite: yes
      vehicle_color:
        source: `data.vehicle?.color` or `vehRecord.color`
        always present at this callsite: sometimes
      services_count:
        source: `allServices.length`
        always present at this callsite: yes
      booking_url / portal_url:
        source: customer-portal manage-appointment URL (would need new construction)
        always present at this callsite: would require new construction

  Cross-caller note: single caller. The 9 chips are all passed; `payment_info` is a fully-built sentence the caller assembles — composite. Operator's body edit dropped 3 of the 9 chips (`first_name`, `vehicle_description`, plus removed Vehicle line + Hi greeting altogether). The body-template/passed-vars contract is now slack — hard-skip won't fire because the body doesn't reference the missing chips.

### 5. booking_reminder

  Slug: booking_reminder
  Status: existing-chip-driven
  Caller files:
    - src/app/api/cron/booking-reminders/route.ts:76
  Body references: production matches seed: `'Reminder: Your {service_name} appointment at {business_name} is tomorrow at {appointment_time}. Need to reschedule? Call us at {business_phone}'` — 4 chips.

  Variables passed today by caller:
    first_name:
      value source: `customer.first_name || undefined`
      always present: yes (DB inner-join select forces non-null; could be empty string — coerced to undefined via `||`)
      classification: optional (NOT in current body — caller still passes for legacy)
    service_name:
      value source: `primaryService?.service?.name || 'Your service'`
      always present: yes (always defaults)
      classification: required
    appointment_time:
      value source: `displayTime` (12-hr formatted)
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :76: `customer.id`, `customer.last_name`, `customer.email`, `customer.sms_consent`, `appt.id`, `appt.scheduled_date` (used to build `dateStr` but `dateStr` not passed into chip — it's used only for the email reminder), `appt.total_amount`, `appt.services[]` with `service_id`, `services[i].service.name` for index > 0 (multi-service appointments).
    Potential chips:
      appointment_date:
        source: `dateStr` (already built at line 44-46)
        always present at this callsite: yes
      services (full multi-list):
        source: `services.map(s => s.service?.name || 'Service').join(', ')` — caller currently uses only `primaryService` (first item)
        always present at this callsite: yes (would require minor build)
      service_total:
        source: `formatCurrency(appt.total_amount)`
        always present at this callsite: yes
      customer_name:
        source: `\`${customer.first_name} ${customer.last_name || ''}\`.trim()` (already in scope for email at :59)
        always present at this callsite: yes

  Cross-caller note: single caller. `first_name` is passed but unused by current body; harmless.

### 6. booking_staff_notify

  Slug: booking_staff_notify
  Status: existing-chip-driven
  Caller files:
    - src/app/api/book/route.ts:658
    - src/app/api/public/specialty-callback/route.ts:67
  Body references: production matches seed: `'New online booking! {customer_name} — {services} on {appointment_date} at {appointment_time}. {deposit_info}'` — 5 chips.

  Variables passed today by caller (book/route.ts:658-664):
    customer_name:
      value source: `\`${data.customer.first_name} ${data.customer.last_name}\`.trim()`
      always present: yes
      classification: required
    services:
      value source: `serviceNames` (combined)
      always present: yes
      classification: required
    appointment_date:
      value source: `dateStr`
      always present: yes
      classification: required
    appointment_time:
      value source: `timeStr`
      always present: yes
      classification: required
    deposit_info:
      value source: `data.payment_intent_id ? 'Deposit paid.' : 'Pay on site.'`
      always present: yes
      classification: composite (caller pre-builds binary)

  Specialty-callback caller (specialty-callback/route.ts:67-70) — DIVERGENT shape:
    customer_name:
      value source: `name` (from request body)
      always present: yes (validated at :36)
      classification: required
    services:
      value source: caller-built composite — `${vehicleWord.charAt(0).toUpperCase() + vehicleWord.slice(1)} vehicle quote — ${vehicleDesc}` (e.g. "Exotic vehicle quote — 2024 Lamborghini Huracán")
      always present: yes
      classification: composite (overloaded — uses the `services` slot to carry vehicle prose)
    NOT PASSED: appointment_date, appointment_time, deposit_info — all 3 missing
    fallback string covers the gap

  Variables in caller scope but NOT currently passed:
    book/route.ts scope: `data.customer.email`, `data.customer.phone`, `data.vehicle.{year/make/model/color}` (`vehicleStr` built but not passed), `data.deposit_amount`, `appointment.id`, `appointment.total_amount`, `customerId`, `e164Phone`.
    specialty-callback scope: `phone`, `preferred_time`, `vehicle_year/make/model`, `size_class`, `vehicleWord`.
    Potential chips:
      customer_phone:
        source: `data.customer.phone` / `phone` (raw input)
        always present at this callsite: yes
      vehicle_description:
        source: `vehicleStr` (already built in book/route.ts:561-572) / `vehicleDesc` (already built in specialty-callback:40)
        always present at this callsite: book yes, specialty yes
      service_total:
        source: `formatCurrency(appointment.total_amount)`
        always present at this callsite: book yes, specialty no (no appointment yet)
      preferred_time:
        source: specialty-callback `preferred_time`
        always present at this callsite: specialty sometimes (optional input)

  Cross-caller note: 2 callers, **major contract divergence**. Specialty-callback omits 3 of 5 required chips and overloads `{services}` with vehicle prose. Today this works because the booking_staff_notify body is staff-facing and the caller-built fallback string is also viable — but under hard-skip strictness, specialty-callback would skip every send (3 missing required vars). The fact that staff still receive specialty notifications means the engine is silently serving the fallback (template-not-found path? or fallback path? — actually the engine renders template, hard-skip fires, returns isActive:false; caller checks `templateResult?.body || staffMessage` at line 74, so the **fallback string** is sent. Specialty callbacks therefore use the slug only as a phone-lookup mechanism, not as a body-render.)

### 7. quote_accepted_single

  Slug: quote_accepted_single
  Status: existing-chip-driven
  Caller files:
    - src/app/api/quotes/[id]/accept/route.ts:85 (slug-switched at :80 based on `items.length === 1`)
  Body references: production matches seed: `'Thanks {first_name}! Your quote for {item_name} has been accepted. Our team will reach out shortly to schedule your appointment.'` — 2 chips.

  Variables passed today by caller (vars object is shared across single/multi at :85-88):
    first_name:
      value source: `customer.first_name`
      always present: yes
      classification: required
    item_name:
      value source: `items[0]?.item_name` (sent for both single and multi — multi body doesn't reference it but still passed)
      always present: single yes, multi yes (always passed even when unused)
      classification: required for single, dead-passed for multi

  Variables in caller scope but NOT currently passed:
    Scope at :85: `customer.id`, `customer.last_name`, `customer.phone`, `customer.email`, `quote.quote_number`, `quote.total_amount`, `quote.access_token`, `quote.id`, `items[]` (with `item_name`, `total_price` etc. — only `items[0].item_name` used), `id` (quote_id).
    Potential chips:
      quote_number:
        source: `quote.quote_number`
        always present at this callsite: yes
      service_total / quote_total:
        source: `formatCurrency(Number(quote.total_amount))`
        always present at this callsite: yes
      services (multi):
        source: `items.map(i => i.item_name).join(', ')` (already built at :112 for staff notify)
        always present at this callsite: yes
      access_token / quote_url:
        source: `${appUrl}/quote/${quote.access_token}` (built at :110+ for email)
        always present at this callsite: yes

  Cross-caller note: single caller, but the slug is one of two switched on (`quote_accepted_single` vs `quote_accepted_multi`). `item_name` is HARD-required when `single` (template body references it); CALLER ALWAYS passes it, even for multi (where it's unused). No contract risk under current body, but if `quote_accepted_multi` body ever added `{item_name}`, the chip would become a "first item only" leak.

### 8. quote_accepted_multi

  Slug: quote_accepted_multi
  Status: existing-chip-driven
  Caller files:
    - src/app/api/quotes/[id]/accept/route.ts:85 (same callsite as #7, slug-switched)
  Body references: production matches seed: `'Thanks {first_name}! Your quote has been accepted. Our team will reach out shortly to schedule.'` — 1 chip.

  Variables passed today by caller (same vars object as #7):
    first_name:
      always present: yes
      classification: required
    (item_name is also passed but body doesn't reference it)

  Variables in caller scope but NOT currently passed: same as #7.

  Cross-caller note: same caller as #7; the only divergence is whether `items.length === 1`. Body references only `{first_name}` — engine's chip registry at sms-template-variables.ts:46-49 reflects this (1 chip); DB variables column also lists 1.

### 9. quote_accepted_staff_notify

  Slug: quote_accepted_staff_notify
  Status: existing-chip-driven
  Caller files:
    - src/app/api/quotes/[id]/accept/route.ts:119
  Body references: production OPERATOR-EDITED: `'🎉 Quote Accepted 🎉 \n\n{customer_name} ({quote_number}) wants a {services} - {service_total}.\n\nCall customer ASAP to schedule appointment date & time in POS. {customer_phone}'` — references 5 chips. Seed body referenced 4 (`customer_name`, `quote_number`, `service_total`, `services`); operator added `{customer_phone}` which the caller does NOT pass.

  Variables passed today by caller (:119-124):
    customer_name:
      value source: `\`${customer.first_name} ${customer.last_name}\`.trim()` or `'Customer'` if customer is null
      always present: yes
      classification: required
    quote_number:
      value source: `quote.quote_number`
      always present: yes
      classification: required
    service_total:
      value source: `formatCurrency(Number(quote.total_amount))`
      always present: yes
      classification: required
    services:
      value source: `items.map(i => i.item_name).join(', ') || 'Services'`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :119: `customer.id`, `customer.phone`, `customer.email`, `quote.access_token`, `quote.id`, `appUrl` (used for adminUrl on email branch), all `items[]` data.
    Potential chips:
      customer_phone:
        source: `customer.phone` (operator's body references this; caller does NOT pass)
        always present at this callsite: sometimes (some quote customers have no phone)
      customer_email:
        source: `customer.email`
        always present at this callsite: sometimes
      admin_url:
        source: `${appUrl}/admin/quotes/${id}` (built at email branch :137)
        always present at this callsite: yes
      quote_url:
        source: `${appUrl}/quote/${quote.access_token}`
        always present at this callsite: yes

  Cross-caller note: single caller. **Live contract bug**: operator-edited body references `{customer_phone}` but caller never passes it. Engine post-render fallback strips silently (no entry in `DEFAULT_VARIABLE_FALLBACKS` for `customer_phone`). Result: production staff SMS has empty space where `{customer_phone}` was. Hard-skip pre-check passes because the DB `variables` column doesn't list `customer_phone` either — silently malformed.

### 10. quote_reminder

  Slug: quote_reminder
  Status: existing-chip-driven
  Caller files:
    - src/app/api/cron/quote-reminders/route.ts:78
  Body references: production matches seed: `'Hey {first_name}! Just checking if you had a chance to look at your quote: {short_url}'` — 2 chips.

  Variables passed today by caller (:78-81):
    first_name:
      value source: `customer.first_name || 'there'`
      always present: yes (always defaults to literal 'there')
      classification: required
    short_url:
      value source: `await createShortLink(\`${appUrl}/quote/${quote.access_token}\`)` (falls back to full URL on failure)
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :78: `customer.phone`, `customer.sms_consent`, `quote.id`, `quote.customer_id`, `quote.access_token` (raw), `appUrl`.
    Potential chips:
      quote_number:
        source: would require additional column on the quotes select (currently `id, access_token, customer_id` selected at :32)
        always present at this callsite: would require new query (or trivial select column add)
      quote_total:
        source: same — needs select column add
        always present at this callsite: would require new query

  Cross-caller note: single caller. Marketing-frequency-capped via `sendMarketingSms`.

### 11. quote_viewed_followup

  Slug: quote_viewed_followup
  Status: existing-chip-driven
  Caller files:
    - src/app/api/cron/quote-reminders/route.ts:182
  Body references: production matches seed: `'Hi {first_name}! You checked out your estimate — ready to book? Any questions, just reply here or call us. {short_url}'` — 2 chips.

  Variables passed today by caller: identical shape to #10 (`first_name`, `short_url`).

  Variables in caller scope but NOT currently passed: identical to #10. Additionally `quote.viewed_at` is in scope (used for the 48h gate), but not particularly useful for body composition.

  Cross-caller note: single caller. Sibling of #10 — same shape, different copy.

### 12. job_complete

  Slug: job_complete
  Status: existing-chip-driven
  Caller files:
    - src/app/api/pos/jobs/[id]/complete/route.ts:244
  Body references: production matches seed: `'Hi {first_name}, your {vehicle_description} is looking great and ready for pickup! 🎉\nView your before & after photos: {gallery_link}\n{business_name}\n{business_address}\n{business_phone}\n{hours_line}'` — 7 chips. **Has the prose-collision risk** flagged by 42W: `your {vehicle_description}` produces orphan-empty when caller passes empty.

  Variables passed today by caller (:244-253):
    first_name:
      value source: `customer.first_name`
      always present: yes
      classification: required
    vehicle_description:
      value source: `vehicleMakeModel || ''` (where `vehicleMakeModel = [job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(' ')`; year intentionally NOT included — see line 232 comment)
      always present: sometimes empty (no vehicle attached)
      classification: required (engine hard-skips on empty per Session 42X-1-followup; line 246-249 comment notes the design)
    gallery_link:
      value source: short link from `${appUrl}/jobs/${galleryToken}/photos`, falls back to full URL
      always present: yes
      classification: required
    hours_line:
      value source: `closingTime ? \`Open today until ${closingTime}\` : 'See our hours online'`
      always present: yes
      classification: composite (caller pre-builds)
    detailer_first_name:
      value source: `assignedEmp?.first_name || undefined`
      always present: sometimes (job may have no assigned staff)
      classification: optional (registry lists as optional; not in body)

  Variables in caller scope but NOT currently passed:
    Scope at :244: `customer.last_name`, `customer.email`, `customer.id`, `job.vehicle.year` (intentionally suppressed), `job.vehicle.color`, `job.id`, `job.timer_seconds` (just calculated), `job.work_completed_at`, `job.assigned_staff.last_name`, `job.gallery_token`, `business.address`, `business.phone`.
    Potential chips:
      vehicle_year:
        source: `job.vehicle?.year`
        always present at this callsite: sometimes (vehicle.year may be null)
      vehicle_color:
        source: `job.vehicle?.color`
        always present at this callsite: sometimes
      detailer_name:
        source: `\`${assigned_staff.first_name} ${assigned_staff.last_name}\``
        always present at this callsite: sometimes
      job_duration:
        source: `finalTimerSeconds` (just calculated)
        always present at this callsite: yes (numeric; would need format helper)
      gallery_url (full):
        source: `galleryUrl` (already built at :222 — pre-shorten)
        always present at this callsite: yes

  Cross-caller note: single caller.

### 13. addon_approved

  Slug: addon_approved
  Status: existing-chip-driven
  Caller files:
    - src/lib/services/job-addons.ts:146
  Body references: production matches seed: `'Great! Your add-on ({service_name}) has been approved. We\'ll get started right away!'` — 1 chip referenced (registry also lists `first_name`, `business_name`, `business_phone` as available but body doesn't use them).

  Variables passed today by caller (:146):
    service_name:
      value source: `getAddonName(addon)` (from service/product/custom_description)
      always present: yes (always returns a string)
      classification: required
    first_name:
      value source: `job?.customer?.first_name || undefined`
      always present: sometimes (passed but not in body)
      classification: optional (defensive add)

  Variables in caller scope but NOT currently passed:
    Scope at :146: `addon.{id, price, discount_amount, expires_at, status}`, `job.id`, `job.customer.id`, `job.customer.last_name`, `job.customer.phone` (recipient), `serviceName` (already passed).
    Potential chips:
      addon_price:
        source: `addon.price - addon.discount_amount`
        always present at this callsite: yes (always defined)
      customer_name:
        source: `\`${customer.first_name} ${customer.last_name}\``
        always present at this callsite: yes

  Cross-caller note: single caller (helper). `first_name` is dead-passed (body doesn't reference it).

### 14. addon_declined

  Slug: addon_declined
  Status: existing-chip-driven
  Caller files:
    - src/lib/services/job-addons.ts:218
  Body references: production matches seed: `'No problem! We\'ve noted {service_name} as a recommendation for your next visit.'` — 1 chip.

  Variables passed today by caller: same as #13 (`service_name`, `first_name`).

  Variables in caller scope but NOT currently passed: same as #13.

  Cross-caller note: single caller, sibling of #13 — same shape.

### 15. payment_receipt

  Slug: payment_receipt
  Status: existing-chip-driven (production body still pre-42AB; rewrite migration pending — see prior turn section A/B/D)
  Caller files:
    - src/app/api/pos/transactions/route.ts:557 (inside 30-second `setTimeout` at :448)
  Body references: production CURRENT: `'Thank you {first_name}! Your {vehicle_description} is all set. You earned {loyalty_points_earned} loyalty points today. View your receipt: {receipt_link}\n\n{business_name}'` — 5 chips. Caller passes only 4 (the new 42AB contract: `first_name`, `transaction_greeting`, `receipt_link`, `business_name`); caller does NOT pass `vehicle_description` or `loyalty_points_earned`. Engine post-render fallback strips both lines silently.

  Variables passed today by caller (:548-553):
    first_name:
      value source: `cust.first_name || 'there'`
      always present: yes (always defaults)
      classification: required
    transaction_greeting:
      value source: composite — caller-built at :534-544; 3-branch ternary depending on (services + vehicle), (services no vehicle), (product-only); appended `+= ' You earned X loyalty points today.'` if pointsEarned > 0
      always present: yes
      classification: composite (caller pre-builds)
    receipt_link:
      value source: `await createShortLink(\`${appUrl}/receipt/${access_token}\`)`
      always present: yes
      classification: required
    business_name:
      value source: `businessInfo.name`
      always present: yes (auto-injected if omitted, but caller passes explicitly)
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :557: `cust.phone` (recipient), `autoReceiptVehicleId`, `vehicleDesc` (already cleaned at :511-520), `txRefresh.loyalty_points_earned`, `txRefresh.status`, `pointsEarned`, `autoReceiptHasServices`, `autoReceiptTxId`, `autoReceiptAccessToken` (used to build link), `data.items[]` (transaction line items, only consumed for `autoReceiptHasServices` boolean; not loaded into the setTimeout closure though).
    Potential chips:
      vehicle_description:
        source: `vehicleDesc` (already cleaned and in scope)
        always present at this callsite: sometimes (empty for product-only sales)
      loyalty_points_earned:
        source: `pointsEarned` (in scope, but ZERO when no points earned)
        always present at this callsite: sometimes (zero or empty)
      transaction_total:
        source: would require column on `txRefresh` select (currently `status, loyalty_points_earned`)
        always present at this callsite: would require new query
      receipt_number:
        source: would require column add to txRefresh select (`transaction.receipt_number`)
        always present at this callsite: would require new query
      transaction_id (short):
        source: `autoReceiptTxId.slice(0, 8)`
        always present at this callsite: yes

  Cross-caller note: single caller. The composite `transaction_greeting` is THE design pattern for chip-by-default — caller owns conditional prose, template owns skeleton. Production DB body has not been rewritten; runtime behavior is as described above.

### 16. loyalty_milestone

  Slug: loyalty_milestone
  Status: existing-chip-driven
  Caller files:
    - src/app/api/pos/transactions/route.ts:329
  Body references: production matches seed: `"Great news {first_name}! You now have {loyalty_points_balance} loyalty points — that's {loyalty_cash_value} off your next visit! Book now: {booking_link}\n\n{business_name}"` — 5 chips.

  Variables passed today by caller (:319-325):
    first_name:
      value source: `custMilestone.first_name || ''`
      always present: yes (default empty would hard-skip)
      classification: required
    loyalty_points_balance:
      value source: `String(currentBalance)`
      always present: yes (numeric, always > REDEEM_MINIMUM at this branch)
      classification: required
    loyalty_cash_value:
      value source: `\`$${(currentBalance * LOYALTY.REDEEM_RATE).toFixed(2)}\``
      always present: yes
      classification: required
    booking_link:
      value source: `await createShortLink(\`${appUrl}/book\`)`
      always present: yes (falls back to full URL)
      classification: required
    business_name:
      value source: `bizInfo.name`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :329: `custMilestone.phone`, `data.customer_id`, `currentBalance` (raw int — already used), `pointsEarned`, `transaction.id`, `transaction.receipt_number`, `prevBalance`.
    Potential chips:
      points_just_earned:
        source: `pointsEarned`
        always present at this callsite: yes
      points_to_milestone:
        source: caller would need to compute `LOYALTY.REDEEM_MINIMUM - prevBalance` (already in scope)
        always present at this callsite: yes
      receipt_number / transaction_id:
        source: `transaction.id` / `transaction.receipt_number`
        always present at this callsite: yes (transaction always exists in this branch)

  Cross-caller note: single caller. Body fires only on threshold-crossing — caller's `(prevBalance < REDEEM_MINIMUM && currentBalance >= REDEEM_MINIMUM)` gate at :304.

### 17. detailer_job_assigned

  Slug: detailer_job_assigned
  Status: existing-chip-driven
  Caller files:
    - src/app/api/appointments/[id]/notify/route.ts:305
    - src/app/api/pos/appointments/[id]/notify/route.ts:297
  Body references: production OLD body (42AB rewrite pending): `'New job assigned: {services} – {vehicle_description}\n{appointment_date} at {appointment_time}\n{address}\nTotal: {service_total}'` — 5 chips. Both callers already pass the NEW 42AB contract (`job_summary` instead of `services` + `vehicle_description`). Until 42AB applies, engine post-render fallback strips `{services}` and `{vehicle_description}` lines, leaving `New job assigned: \n…`.

  Variables passed today by caller (BOTH callers — identical shape):
    job_summary:
      value source: composite — `vehicle ? \`${serviceNames} – ${vehicleStr}\` : serviceNames` (built inline at :299 / :291)
      always present: yes
      classification: composite (caller pre-builds)
    appointment_date:
      value source: `dateStr`
      always present: yes
      classification: required
    appointment_time:
      value source: `displayTime`
      always present: yes
      classification: required
    address:
      value source: `appointment.mobile_address || ''`
      always present: sometimes empty (non-mobile jobs)
      classification: optional (line removed if empty per REMOVE_LINE)
    service_total:
      value source: `formatCurrency(appointment.total_amount)`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at both callsites (identical): `customer.{id, first_name, last_name, phone, email}`, `vehicle.{id, year, make, model}`, `employee.{id, first_name, last_name, phone}` (recipient), `services[]` with `tier_name` and `price_at_booking`, `appointment.id`, `appointment.scheduled_end_time`.
    Potential chips:
      customer_name:
        source: `\`${customer.first_name} ${customer.last_name}\``
        always present at this callsite: yes
      customer_phone:
        source: `customer.phone`
        always present at this callsite: sometimes
      vehicle_color:
        source: `vehicle.color` (NOT in select today — would require column add to `vehicles` selection)
        always present at this callsite: would require new query (column not selected — though was selected at job_complete fetch)
      detailer_first_name:
        source: `employee.first_name`
        always present at this callsite: yes
      services_count:
        source: `services.length`
        always present at this callsite: yes
      service_durations:
        source: caller would need to load `services.base_duration_minutes` (not currently selected)
        always present at this callsite: would require new query

  Cross-caller note: 2 callers, identical shape; the inline `job_summary` build is duplicated word-for-word at line 299 and line 291. Composite-build helper would deduplicate ~3 LOC.

### 18. staff_notification

  Slug: staff_notification
  Status: existing-chip-driven
  Caller files:
    - src/app/api/voice-agent/notify-staff/route.ts:89
    - src/app/api/webhooks/twilio/inbound/route.ts:642 (specialty-vehicle SMS escalation, dynamic import)
  Body references: production OPERATOR-EDITED: `'🔔 {reason_label} 🔔\n\n{customer_name} - {details}\n{customer_phone}\n\n'` — 4 chips. Seed body referenced 4 different ones (`customer_name`, `customer_phone`, `reason_label`, `details`); operator restructured but kept same chip set.

  Variables passed today by caller (notify-staff/route.ts:89-95):
    customer_name:
      value source: `displayName = customer_name?.trim() || 'Unknown'`
      always present: yes (defaults)
      classification: required
    customer_phone:
      value source: `displayPhone = normalizedPhone ? formatPhone(normalizedPhone) : 'Unknown'`
      always present: yes (defaults)
      classification: required
    reason_label:
      value source: `REASON_LABELS[reason]` (mapped from enum)
      always present: yes
      classification: required
    reason_code:
      value source: `reason` (raw — passed but body doesn't reference)
      always present: yes
      classification: optional (dead-passed)
    details:
      value source: `details.trim()` (validated non-empty at :61)
      always present: yes
      classification: required

  Variables passed today by caller (webhooks/twilio/inbound/route.ts:642 — DIVERGENT, only 2 chips):
    customer_name:
      value source: `custName = customerCtx?.name || 'Unknown customer'`
      always present: yes
      classification: required
    customer_phone:
      value source: `normalizedPhone`
      always present: yes
      classification: required
    NOT PASSED: `reason_label`, `details` — both required by body but caller does not pass

  Variables in caller scope but NOT currently passed:
    notify-staff scope: `customer_phone` (raw input), `body` (request body), `business_name`/`business_phone` (auto-injected via biz fetch).
    inbound webhook scope at :642: `body` (inbound message body), `specialtyVehicleDesc` (built at :627), `specialtyVehicleWord` (`'classic'` or `'exotic'`), `conversation.id`, `customerCtx`, the inbound message itself.
    Potential chips:
      customer_message_excerpt:
        source: `body.slice(0, 100)` (already used in fallback at :638)
        always present at this callsite: inbound yes; notify-staff no (different context)
      vehicle_description:
        source: `specialtyVehicleDesc` (inbound-only)
        always present at this callsite: sometimes (only specialty-vehicle path)
      conversation_id:
        source: `conversation.id` (inbound-only)
        always present at this callsite: sometimes

  Cross-caller note: 2 callers, **major contract divergence**. Inbound webhook passes only 2 of 4 required chips (missing `reason_label` and `details`). Engine hard-skip fires; caller falls back to the inline `staffMsg` string at :638. So inbound specialty-notify uses the slug only as a routing/recipient-phone mechanism, not for body rendering — same pattern as #6 (booking_staff_notify specialty-callback caller).

---

## Hardcoded slugs (19–32)

### 19. addon_authorization

  Slug: addon_authorization
  Status: hardcoded
  Caller files:
    - src/app/api/pos/jobs/[id]/addons/route.ts:228-246 (string built at :228-234, sent at :236)

  Variables passed today by caller (would-be chips, currently inline interpolation):
    first_name:
      value source: `customer.first_name`
      always present: yes (DB customer non-null first_name)
      classification: required
    vehicle_description:
      value source: `vehicleDesc` — `cleanVehicleDescription({make, model})` w/ caller-side fallback `'your vehicle'` at :194
      always present: yes (always non-empty thanks to caller-side fallback literal)
      classification: required
    issue_text:
      value source: `getIssueHumanReadable(issue_type, issue_description)`
      always present: yes (helper always returns string)
      classification: required
    friendly_name:
      value source: `friendlyServiceName(catalogItemName)` if catalog, else `custom_description || 'an additional service'`
      always present: yes
      classification: required (composite — caller resolves from service/product/custom path)
    final_price:
      value source: `finalPrice = price - discount_amount` formatted via `.toFixed(2)`
      always present: yes
      classification: required
    authorize_url:
      value source: `\`${appUrl}/authorize/${authToken}\`` (HMAC token)
      always present: yes
      classification: required (per-send opaque token)
    detailer_name:
      value source: `detailerEmployee?.first_name || 'Your detailer'`
      always present: yes (defaults to literal)
      classification: required
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :228: `customer.last_name`, `customer.email`, `customer.id` (recipient), `customer.phone`, `vehicle.year`, `vehicle.color`, `job.id`, `job.estimated_pickup_at`, `pickup_delay_minutes`, `addon.id` (just created), `addon.expires_at`, `expirationMinutes`, `photoUrl` (annotated), `posEmployee.{first_name, last_name, employee_id, role, email, auth_user_id}`, `body.message_to_customer`, `body.photo_ids`, `discount_amount` (raw).
    Potential chips:
      pickup_delay_minutes:
        source: `pickup_delay_minutes` (request body) — adds X minutes to ETA
        always present at this callsite: yes (defaults to 0)
      authorization_expires_at:
        source: `expiresAt.toISOString()` or `expirationMinutes`
        always present at this callsite: yes
      expiration_minutes:
        source: `expirationMinutes`
        always present at this callsite: yes
      addon_id:
        source: `addon.id` (already used as contextId)
        always present at this callsite: yes
      original_price:
        source: `price` (pre-discount)
        always present at this callsite: yes
      discount_amount:
        source: `discount_amount` (formatted)
        always present at this callsite: yes (often 0)
      message_to_customer:
        source: `body.message_to_customer` (operator's prose at addon-creation — currently NOT in initial-send body, only in resend body; could be repurposed)
        always present at this callsite: sometimes
      photo_count:
        source: `photo_ids.length`
        always present at this callsite: yes
      detailer_first_name:
        source: same as `detailer_name` — could split first_name only
        always present at this callsite: yes

  Cross-caller note: single caller. New chips for palette: `issue_text`, `friendly_name`, `final_price`, `authorize_url`, `detailer_name` (full) — see prior turn.

### 20. addon_authorization_resend

  Slug: addon_authorization_resend
  Status: hardcoded
  Caller files:
    - src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts:126

  Variables passed today by caller (would-be chips):
    message_to_customer:
      value source: `original.message_to_customer` (persisted from prior addon row)
      always present: yes (column required at addon creation)
      classification: required (operator-typed prose)
    authorize_url:
      value source: `\`${appUrl}/authorize/${authToken}\`` (fresh HMAC)
      always present: yes
      classification: required
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :126: `customer.{id, first_name, last_name, phone, email}`, `original.{price, discount_amount, photo_ids}`, `addonId` (current), `newAddon.id` (resent), `photoUrl` (MMS attachment), `id` (job_id), `appUrl`, `authToken` (raw).
    Potential chips:
      first_name:
        source: `customer.first_name`
        always present at this callsite: yes
      vehicle_description:
        source: would require new query (vehicle not selected in this route's job select)
        always present at this callsite: would require new query
      final_price:
        source: `original.price - original.discount_amount` (already computed at :139)
        always present at this callsite: yes
      detailer_name:
        source: would require new query (employees not selected)
        always present at this callsite: would require new query

  Cross-caller note: single caller. The operator's `message_to_customer` chip carries arbitrary prose, so this is technically a *partial-free-text* template — the prose IS partially the variable. Migrating still buys editable wrapping copy ("Approve or decline here:" framing), but loses if operator wants to edit `message_to_customer` mid-flow.

### 21. addon_authorization_expired

  Slug: addon_authorization_expired
  Status: hardcoded
  Caller files:
    - src/app/api/webhooks/twilio/inbound/route.ts:864
    - src/app/api/webhooks/twilio/inbound/route.ts:876
  Both callsites use the identical literal `'That authorization has expired. Would you like us to send a new one?'`.

  Variables passed today by caller: NONE — zero-variable static string.

  Variables in caller scope but NOT currently passed:
    Scope at both callsites: `normalizedPhone` (recipient), `addonId` (the expired addon's UUID), `conversation.id`, `customerCtx.name` (sometimes).
    Potential chips:
      first_name:
        source: would require lookup via `addonId → addon.job.customer.first_name` — currently not done
        always present at this callsite: would require new query
      addon_service_name:
        source: would require lookup — not done
        always present at this callsite: would require new query

  Cross-caller note: 2 callers, identical shape. Zero-variable migration.

### 22. quote_sms_admin

  Slug: quote_sms_admin
  Status: hardcoded
  Caller files:
    - src/lib/quotes/send-service.ts:211-228

  Variables passed today by caller:
    quote_number:
      value source: `quote.quote_number`
      always present: yes
      classification: required
    business_name:
      value source: `business.name`
      always present: yes
      classification: required
    service_total:
      value source: `formatCurrency(quote.total_amount)`
      always present: yes
      classification: required
    short_url:
      value source: `shortLink` from `createShortLink(\`${appUrl}/quote/${quote.access_token}\`)`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :211: `customer.{id, first_name, last_name, phone, email}`, `quote.{id, access_token, status, customer_id, vehicle_id}`, `quote.items[]` with `item_name`/`tier_name`/`unit_price`/`total_price`/`quantity`, `quote.vehicle.{year, make, model}`, `validityDays`, `appUrl`, `mediaUrl` (MMS PDF) — orthogonal.
    Potential chips:
      first_name:
        source: `customer?.first_name`
        always present at this callsite: sometimes (customer null possible)
      services:
        source: `items.map(i => i.item_name).join(', ')`
        always present at this callsite: yes
      vehicle_description:
        source: `cleanVehicleDescription(quote.vehicle)` (vehicle in scope per select :67)
        always present at this callsite: sometimes (no vehicle attached)
      validity_days:
        source: `validityDays` (already fetched)
        always present at this callsite: yes
      valid_until:
        source: would compose from `validityDays + sent_at`
        always present at this callsite: yes (computable in scope)

  Cross-caller note: single caller. MMS PDF attachment (`mediaUrl`) is body-orthogonal.

### 23. quote_sms_postcall

  Slug: quote_sms_postcall
  Status: hardcoded
  Caller files:
    - src/lib/services/voice-post-call.ts:608

  Variables passed today by caller:
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required
    first_name_greeting:
      value source: composite — `firstName ? \`, ${firstName}\` : ''` (caller-built leading-comma greeting at :607)
      always present: yes (always one of two states)
      classification: composite (caller pre-builds)
    short_url:
      value source: `linkUrl` from `createShortLink(quoteUrl)` falling back to full URL
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :608: `phone` (recipient), `custId` (sometimes), `customerName` (raw — used to derive firstName), `quoteRecord.{id, quote_number, access_token}`, `serviceNames` (built at :622 — comma-joined), `appUrl`, `quoteUrl` (full).
    Potential chips:
      first_name (raw):
        source: `firstName` — extracted via split
        always present at this callsite: sometimes (may be undefined for "Phone Caller")
      services:
        source: `serviceNames` (built later at :622, available in scope)
        always present at this callsite: yes
      quote_number:
        source: `quoteRecord.quote_number`
        always present at this callsite: yes
      service_total:
        source: would need to sum `quoteItems[].unit_price` — already in scope
        always present at this callsite: yes (computable)

  Cross-caller note: single caller. The leading-comma `nameGreeting` at :607 is the same conditional as #2 (`appointment_confirmed_postcall` — caller has `customer.first_name || undefined`); under hard-skip with `first_name` chip the pattern doesn't fit (orphan-comma edge needs caller to elide the comma); the composite chip form (`first_name_greeting`) sidesteps this.

### 24. quote_sms_midcall

  Slug: quote_sms_midcall
  Status: hardcoded
  Caller files:
    - src/app/api/voice-agent/send-quote-sms/route.ts:256

  Variables passed today by caller:
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required
    services:
      value source: `serviceList = quoteItems.map(i => i.item_name).join(', ')`
      always present: yes (validated at :103-108 — call returns 400 if empty)
      classification: required
    short_url:
      value source: `linkUrl` from `createShortLink(quoteUrl)`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :256: `normalizedPhone` (recipient), `customerId`, `customer_name` (request body input), `existingCustomer.first_name` (sometimes), `vehicle_year/make/model/color` (request body), `vehicleId` (sometimes), `quoteRecord.{id, quote_number, access_token}`, `quoteValidityDays`, `quoteItems[]`.
    Potential chips:
      first_name:
        source: `existingCustomer.first_name` or `customer_name?.split(/\s+/)[0]`
        always present at this callsite: sometimes (may be defaulted to "Phone Caller")
      vehicle_description:
        source: would require composing from `vehicle_year/make/model` (in scope)
        always present at this callsite: sometimes (only when agent captured vehicle)
      quote_number:
        source: `quoteRecord.quote_number`
        always present at this callsite: yes
      service_total:
        source: `quoteItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)` formatted
        always present at this callsite: yes (computable)
      validity_days:
        source: `quoteValidityDays`
        always present at this callsite: yes

  Cross-caller note: single caller.

### 25. receipt_sms

  Slug: receipt_sms
  Status: hardcoded
  Caller files:
    - src/app/api/pos/receipts/sms/route.ts:62-83 (build at :62-77, send at :79)

  Variables passed today by caller:
    business_name:
      value source: `businessInfo.name`
      always present: yes
      classification: required
    summary_line:
      value source: 2-branch composite — `\`${vehicleStr} — ${total}\`` (with optional truncation to fit 160-char) OR `\`Your total — ${total}\``
      always present: yes
      classification: composite (caller pre-builds, length-aware)
    short_url:
      value source: `shortUrl` from `createShortLink`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :79: `transaction.access_token`, `transaction.total_amount`, `transaction.tip_amount`, `vehicle.{year, make, model}`, `transaction_id` (request body input), `phone` (request input — recipient), `posEmployee` (POS auth) or `user` (admin auth), `appUrl`, `receiptUrl` (full URL pre-shorten).
    Potential chips:
      transaction_total:
        source: `total` ($X.XX formatted) — currently absorbed into composite
        always present at this callsite: yes
      tip_amount:
        source: `transaction.tip_amount` (already used)
        always present at this callsite: sometimes (may be 0)
      vehicle_description:
        source: `vehicleStr` (already cleaned and in scope)
        always present at this callsite: sometimes (composite already encodes this)
      receipt_number:
        source: would require column on transaction select (not currently selected)
        always present at this callsite: would require new query
      transaction_id_short:
        source: `transaction_id.slice(0, 8)`
        always present at this callsite: yes

  Cross-caller note: single caller. The 160-char strict truncation is the only true engine-gap exemption. Composite chip `summary_line` would absorb truncation logic caller-side.

### 26. transaction_voided

  Slug: transaction_voided
  Status: hardcoded
  Caller files:
    - src/lib/email/send-void-notification.ts:142-151

  Variables passed today by caller:
    first_name:
      value source: `customer.first_name`
      always present: yes (DB non-null)
      classification: required
    receipt_number:
      value source: `transaction?.receipt_number ?? input.transactionId.slice(0, 8)`
      always present: yes (always defaults to short ID)
      classification: required
    business_name:
      value source: `business.name`
      always present: yes
      classification: required
    business_phone:
      value source: `business.phone`
      always present: yes
      classification: required
    job_cancelled_line:
      value source: composite — `input.jobCancelled ? ' Your scheduled service has been cancelled.' : ''`
      always present: yes (always one of two states)
      classification: composite (caller pre-builds, conditional)

  Variables in caller scope but NOT currently passed:
    Scope at :142: `customer.{id, last_name, email}`, `customer.phone` (recipient), `transaction.total_amount`, `input.transactionId` (full), `input.reason`, `reasonSuffix` (composite at :55), `business.address`.
    Potential chips:
      reason_line:
        source: `reasonSuffix` — already built at :55: `\` Reason: ${reason}.\`` or empty (currently used by EMAIL only at :69)
        always present at this callsite: yes (composite — empty if no reason)
      transaction_total:
        source: `transaction.total_amount` formatted
        always present at this callsite: yes
      customer_name:
        source: `\`${customer.first_name} ${customer.last_name}\``
        always present at this callsite: yes

  Cross-caller note: single caller. File mixes email + SMS (lines 1-134 email HTML, 137-156 SMS) but the responsibilities are independent — no actual coupling.

### 27. voice_info_store_info

  Slug: voice_info_store_info
  Status: hardcoded
  Caller files:
    - src/app/api/voice-agent/send-info-sms/route.ts:75-108 (smsBody at :106; sent at :341 via the shared switch dispatch)

  Variables passed today by caller:
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required (auto-injected if omitted)
    business_address:
      value source: `biz.address`
      always present: yes
      classification: required (auto-injected if omitted)
    hours_line:
      value source: composite — `formatBusinessHoursText(hours)` or fallback `'Call for hours'`
      always present: yes
      classification: composite (caller pre-builds)
    short_url:
      value source: `shortMapsUrl` from `createShortLink(mapsUrl)` — Maps URL preferring `google_place_id` setting
      always present: yes
      classification: required (slug-overloaded — name `short_url` carries Maps URL here)

  Variables in caller scope but NOT currently passed:
    Scope at :106: `customer.id` (sometimes), `normalizedPhone` (recipient), `placeId` (raw setting), `mapsUrl` (full URL pre-shorten), `customerId` (sometimes).
    Potential chips:
      place_id:
        source: `placeId` (Google Place ID)
        always present at this callsite: sometimes
      maps_url_full:
        source: `mapsUrl` (pre-shorten)
        always present at this callsite: yes
      business_phone, business_email:
        source: `biz.phone`, `biz.email`
        always present at this callsite: yes (auto-injected)

  Cross-caller note: single route, 6 sub-slugs share the `sendSms` invocation at :341 — see #28-32.

### 28. voice_info_product_link

  Slug: voice_info_product_link
  Status: hardcoded
  Caller files:
    - src/app/api/voice-agent/send-info-sms/route.ts:110-163 (smsBody at :160)

  Variables passed today by caller:
    product_name:
      value source: `product.name` (resolved via slug-then-ILIKE)
      always present: yes (404 if not resolved)
      classification: required
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required
    short_url:
      value source: `shortProductUrl` from `${SITE_URL}/products/${catSlug}/${product.slug}`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :160: `product.id` (used as `contextId`), `product.slug`, `category.slug`, `customerId` (sometimes), `normalizedPhone` (recipient), `productUrl` (full URL pre-shorten).
    Potential chips:
      product_slug:
        source: `product.slug`
        always present at this callsite: yes
      category_name:
        source: would require additional select column on product_categories (currently selects only `slug`)
        always present at this callsite: would require new query (column add)
      product_id:
        source: `product.id`
        always present at this callsite: yes
      product_url_full:
        source: `productUrl`
        always present at this callsite: yes

  Cross-caller note: single sub-route, shares dispatch at :341.

### 29. voice_info_category_link

  Slug: voice_info_category_link
  Status: hardcoded
  Caller files:
    - src/app/api/voice-agent/send-info-sms/route.ts:165-208 (smsBody at :205)

  Variables passed today by caller:
    category_name:
      value source: `category.name`
      always present: yes (404 if not resolved)
      classification: required
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required
    short_url:
      value source: `shortCategoryUrl` from `${SITE_URL}/products/${category.slug}`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :205: `category.id` (used as `contextId`), `category.slug`, `customerId` (sometimes), `categoryUrl` (full).
    Potential chips:
      category_slug:
        source: `category.slug`
        always present at this callsite: yes
      category_url_full:
        source: `categoryUrl`
        always present at this callsite: yes

  Cross-caller note: single sub-route. Body shape mirrors #28; merge candidate.

### 30. voice_info_service_page

  Slug: voice_info_service_page
  Status: hardcoded
  Caller files:
    - src/app/api/voice-agent/send-info-sms/route.ts:210-262 (smsBody at :259)

  Variables passed today by caller:
    service_name:
      value source: `service.name`
      always present: yes (404 if not resolved)
      classification: required
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required
    short_url:
      value source: `shortServiceUrl` — `${SITE_URL}/services/${serviceCatSlug}/${service.slug}` OR `${SITE_URL}/book` if service/category has no slug
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :259: `service.id` (used as `contextId`), `service.slug`, `service.category.slug`, `customerId` (sometimes), `serviceUrl` (full).
    Potential chips: same as #29 shape.

  Cross-caller note: single sub-route. Body identical to #29 word-for-word ("Browse our X" / "Learn more about X").

### 31. voice_info_booking_link

  Slug: voice_info_booking_link
  Status: hardcoded
  Caller files:
    - src/app/api/voice-agent/send-info-sms/route.ts:264-277 (smsBody at :275)

  Variables passed today by caller:
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required
    short_url:
      value source: `shortBookingUrl` from `${SITE_URL}/book` or `${SITE_URL}/book?service=${identifier}`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :275: `identifier` (request body input — pre-filling service param), `customerId` (sometimes), `bookingUrl` (full), `normalizedPhone`.
    Potential chips:
      service_filter:
        source: `identifier` (when present)
        always present at this callsite: sometimes
      booking_url_full:
        source: `bookingUrl`
        always present at this callsite: yes

  Cross-caller note: single sub-route.

### 32. voice_info_quote_link

  Slug: voice_info_quote_link
  Status: hardcoded
  Caller files:
    - src/app/api/voice-agent/send-info-sms/route.ts:279-333 (smsBody at :330)

  Variables passed today by caller:
    business_name:
      value source: `biz.name`
      always present: yes
      classification: required
    short_url:
      value source: `shortQuoteUrl` from `${SITE_URL}/quote/${quoteRecord.access_token}`
      always present: yes
      classification: required

  Variables in caller scope but NOT currently passed:
    Scope at :330: `quoteRecord.{id, quote_number, access_token, customer_id}`, `customerId` (sometimes), `customer?.id`, `quoteUrl` (full), `normalizedPhone`.
    Potential chips:
      quote_number:
        source: `quoteRecord.quote_number`
        always present at this callsite: yes
      first_name:
        source: would require additional select on customers (not selected)
        always present at this callsite: would require new query

  Cross-caller note: single sub-route. Slug-name `voice_info_quote_link` ALREADY overlaps with `quote_sms_admin` (#22), `quote_sms_postcall` (#23), `quote_sms_midcall` (#24) and chip-driven `quote_reminder` (#10), `quote_viewed_followup` (#11) — 6 different slugs all "send the customer a link to their quote." The variable shape is the simplest of the six.

---

## A. Universal chip palette — flat union

Counted across all 32 slugs (passed-today vs scope-available-but-not-passed). "Slugs" below counts unique slugs that pass each chip today; "scope-available" counts slugs whose caller has the data in scope but doesn't pass it.

### Customer

  first_name — passed today by 18 slugs; scope-available at 4 additional slugs (#11, 21, 24, 32); 0 require new query
  last_name — passed today by 0 slugs; scope-available at 14 additional slugs (#1, 3, 4, 6, 8, 9, 10, 12, 13, 14, 17, 19, 20, 22); 0 require new query
  customer_name — passed today by 5 slugs (#6, 9, 18 ×2 callers, 22 implicitly via #9 caller); scope-available at 9 additional slugs; 0 require new query
  customer_phone — passed today by 1 slug (#18); scope-available at 14 additional slugs (already in scope as recipient); 0 require new query
  customer_email — passed today by 0 slugs; scope-available at 16 additional slugs; 0 require new query

### Vehicle

  vehicle_description — passed today by 2 slugs (#4 booking_confirmed (operator-removed from body but caller still passes), #12 job_complete (composite-built make-model only)); scope-available at 9 additional slugs (#1, 3, 6, 11, 17 in scope; #18 inbound, #20, 22, 25 in scope, #26 sometimes); 1 requires new query (#19 already does)
  vehicle_year — passed today by 0; scope-available at 6 (#1 ×2 callers, 4, 12, 17, 19, 24 input); 0 new queries
  vehicle_make — passed today by 0; scope-available at 6; 0 new queries
  vehicle_model — passed today by 0; scope-available at 6; 0 new queries
  vehicle_color — passed today by 0; scope-available at 5 (#1 admin/POS notify, 4 sometimes, 12, 19, 24 input); 1 new query (#17 — would need column add)
  size_class — passed today by 0; scope-available at 4 (#6 specialty-callback input, #18 inbound query at :622, #24 voice midcall, indirect); 0 new queries
  license_plate — passed today by 0; scope-available at 0; 32 would require new query (column not currently selected anywhere)

### Business (auto-injected by engine when caller omits)

  business_name — passed today by 16 slugs (almost all customer-facing); scope-available at every other slug (auto-injected); 0 new queries
  business_phone — passed today by 11 slugs (auto-injected at the rest); scope-available everywhere
  business_address — passed today by 1 slug (#27 voice store_info); auto-injected; 0 new queries
  business_email — passed today by 0; scope-available everywhere; 0 new queries
  business_website — passed today by 0; scope-available at 4 (book route, send-cancellation-email, addons routes); 0 new queries
  business_hours — passed today by 0 (composite `hours_line` is what's passed); scope-available at 2 (#12 job_complete, #27 voice store_info)

### Transaction / Order

  receipt_number — passed today by 0 chip slugs (#26 transaction_voided passes it but is hardcoded); scope-available at #15 payment_receipt with column add; #16 loyalty_milestone yes; ~5 require new query
  service_total — passed today by 7 slugs (#4, 6 book caller, 7-9, 17, 22); scope-available at 5 additional (#5 booking_reminder yes, #10/11 cron quote-reminders no, #15 yes with column add, #16 yes); some require new query
  total_amount (raw) — passed today by 0; scope-available at all transaction/quote/appointment paths
  tax_total — passed today by 0; scope-available at 1 (#15 payment_receipt with column add); else not selected
  subtotal — passed today by 0; scope-available at 0 currently; would require new query everywhere
  tip_amount — passed today by 0; scope-available at #25 receipt_sms; else would require new query
  payment_method — passed today by 0; scope-available at 0 (column not selected anywhere); would require new query
  discount_amount — passed today by 0; scope-available at #15 (with column add), #19 addon_authorization (already loaded); else new query
  loyalty_points_earned — passed today by 0 chip slugs (caller-built into `transaction_greeting` composite at #15); scope-available at #15 directly; #16 yes; else would require new query
  loyalty_points_balance — passed today by 1 (#16); scope-available at #15
  loyalty_cash_value — passed today by 1 (#16); scope-available at #15 (computable from balance)

### Appointment

  appointment_date — passed today by 9 slugs (#1 via composite, 3, 4, 5, 6 book caller, 17 ×2, 18 indirectly); scope-available everywhere appointment is loaded
  appointment_time — passed today by 9 slugs (same set as date); scope-available
  appointment_summary (composite) — passed today by 1 slug (#1); composite — built per-caller in helper
  appointment_id — passed today by 0 (used as `contextId` in `sendSms` options, not as chip); scope-available at all appointment paths
  estimated_duration — passed today by 0; scope-available at 0 currently selected (only at :238-244 of voice-agent/appointments specifically for total_duration); would require column add
  scheduled_end_time — passed today by 0; scope-available at #1 (admin/POS notify), #3, #5; else not selected
  channel — passed today by 0; scope-available at #6 booking_staff_notify (always 'online'), #18 (always 'voice')

### Job

  job_summary (composite) — passed today by 1 slug (#17, 2 callers); composite — duplicated build inline in both callers
  job_id — passed today by 0 (used as contextId); scope-available at all job paths
  job_status — passed today by 0; scope-available at #12, 13, 14, 19, 20, 21
  detailer_first_name — passed today by 1 slug (#12 job_complete; passed as undefined when no assignee); scope-available at #1 (already in helper but discarded), #17 (employee.first_name in scope), #19 (composite-built into `detailer_name`), #20 would require new query
  detailer_name (full) — passed today by 0; scope-available at #19 (built as `detailerName`), #1, #17 (employee.last_name in scope)
  gallery_link — passed today by 1 (#12); scope-available at 0 elsewhere; would require build (job-specific gallery_token)
  finalTimerSeconds / job_duration — passed today by 0; scope-available at #12 directly

### Quote

  quote_number — passed today by 2 slugs (#9, 22); scope-available at 5 additional (#10, 11, 23, 24, 32); some require column add
  quote_total / service_total (re-keyed for quotes) — passed today by 1 (#9); scope-available at all quote paths
  quote_url / access_token — passed today by 0 (composed into `short_url`); scope-available at all quote paths
  valid_until / quote_expiration — passed today by 0; scope-available at #22 (computable), #24 (computable); else would require column add
  validity_days — passed today by 0; scope-available at #22, #24 directly
  item_name (single) — passed today by 1 (#7); scope-available at all quote paths
  services (multi) — passed today by 6 slugs (#3, 4 indirectly, 5 indirectly, 6 ×2 callers, 9, 22); scope-available everywhere services in scope

### Loyalty (covered above under Transaction)

### URLs / Links

  short_url — passed today by 8 slugs (#10, 11, 22, 23 via `linkUrl`, 24, 27, 28, 29, 30, 31, 32 — repeatedly aliased); scope-available everywhere a URL exists
  receipt_link — passed today by 1 (#15); scope-available at #25 (computed)
  booking_link — passed today by 1 (#16); scope-available at #5 (could be computed), elsewhere requires construction
  gallery_link — passed today by 1 (#12); see Job
  authorize_url — passed today by 0 (currently inline-interpolated in #19, #20); scope-available at #19, #20 directly; would NOT be reusable elsewhere (HMAC token specific to addon flow)
  admin_url — passed today by 0; scope-available at #9 (built at email branch), elsewhere not built
  portal_url / customer_account_url — passed today by 0; scope-available at 0 currently; would require new construction

### Caller-built composites

  appointment_summary — used by 1 slug (#1); built in helper `buildAppointmentConfirmationSms` at sms.ts:313-317
  transaction_greeting — used by 1 slug (#15); built inline at transactions/route.ts:534-544 (3-branch ternary + loyalty append)
  job_summary — used by 1 slug (#17); built inline at appointments/[id]/notify/route.ts:299 and pos/appointments/[id]/notify/route.ts:291 (identical 1-line ternary, duplicated)
  payment_info — used by 1 slug (#4); built inline at book/route.ts:583-585 (binary)
  hours_line — used by 1 slug (#12), and would be used by #27; composite at jobs/complete/route.ts:218-219 and send-info-sms/route.ts:81 (different shapes — `'Open today until X'` vs `formatBusinessHoursText`)
  deposit_info — used by 1 slug (#6); built inline at book/route.ts:656 (binary)
  summary_line (proposed) — used by 0 currently, would be #25 receipt_sms
  first_name_greeting (proposed) — used by 0 currently, would be #2, #23 (both have inline `, ${firstName}` build)
  job_cancelled_line (proposed) — used by 0 currently, would be #26 transaction_voided (inline at line 139-141)
  reason_line (proposed) — used by 0 currently, would be #26 transaction_voided (already built at line 55 — currently used in EMAIL only)
  message_to_customer — used by 0 currently, would be #20 (operator-typed prose passed verbatim)

### Other

  issue_text — passed today by 0; would be #19; built via `getIssueHumanReadable()`
  issue_type / issue_description — passed today by 0; scope-available at #19 directly
  friendly_name — passed today by 0; would be #19; built via `friendlyServiceName()`
  reason_label — passed today by 1 (#18); composite from `REASON_LABELS` enum map
  reason_code — passed today by 1 (#18, dead-passed); scope-available at #18
  details — passed today by 1 (#18); operator/agent-typed
  cancellation_reason — passed today by 0; scope-available at #3 send-cancellation-email branch
  preferred_time — passed today by 0; scope-available at #6 specialty-callback (sometimes)
  customer_message_excerpt — passed today by 0; scope-available at #18 inbound (sometimes)
  transcript_summary — passed today by 0; scope-available at #2 (sometimes)
  inferred_customer_type — passed today by 0; scope-available at #2, #15, others where customer.customer_type loaded
  expiration_minutes — passed today by 0; scope-available at #19 directly
  pickup_delay_minutes — passed today by 0; scope-available at #19 directly
  product_name — would be #28; passed there
  category_name — would be #29
  service_name — passed today by 5 chip slugs; scope-available everywhere services in scope
  product_slug, category_slug — scope-available at #28-30 directly

---

## B. Contract recommendation per slug

For each of the 32 slugs, the recommended `required` chips (engine hard-skips on missing) versus `optional` chips (REMOVE_LINE if empty). Based on body references (existing) or proposed body shape (hardcoded), and the "always present" classification per caller.

### Existing chip-driven (1–18) — recommendation reflects current production body

  1. appointment_confirmed — required: `business_name`, `first_name`, `appointment_summary`, `business_phone` | optional: none. Note: production body must be reconciled with this contract on next operator save (currently references `service_name`, `service_total` — neither passed).

  2. appointment_confirmed_postcall — required: `business_name`, `first_name`, `business_phone` | optional: none. Caller gates on `customer.first_name || undefined`; the gate IS the hard-skip trigger and is intentional (no orphan-comma greeting).

  3. appointment_cancelled — required: `first_name`, `services`, `appointment_date`, `appointment_time`, `business_name`, `business_phone` | optional: none. Note: cancellation-email caller's `appointment_time` may be empty if `scheduled_start_time` is null — would hard-skip; verify whether that's desired.

  4. booking_confirmed — required: `services`, `appointment_date`, `appointment_time`, `business_name`, `service_total`, `business_phone` | optional: `first_name`, `vehicle_description`, `deposit_amount`, `balance_due`, `payment_info`. Required set reflects operator-edited body (which dropped first_name/vehicle).

  5. booking_reminder — required: `service_name`, `business_name`, `appointment_time`, `business_phone` | optional: `first_name` (passed but unused).

  6. booking_staff_notify — required: `customer_name`, `services`, `appointment_date`, `appointment_time`, `deposit_info`, `business_name` | optional: none. Note: specialty-callback caller fails 3 of 6 — needs distinct slug or registration as a separate `specialty_callback_staff_notify` slug.

  7. quote_accepted_single — required: `first_name`, `item_name` | optional: none.

  8. quote_accepted_multi — required: `first_name` | optional: none.

  9. quote_accepted_staff_notify — required: `customer_name`, `quote_number`, `service_total`, `services` | optional: `customer_phone` (operator-added; should be promoted to required and caller updated to pass it). Live contract bug today.

  10. quote_reminder — required: `first_name`, `short_url` | optional: none.

  11. quote_viewed_followup — required: `first_name`, `short_url` | optional: none.

  12. job_complete — required: `first_name`, `vehicle_description`, `gallery_link`, `business_name`, `business_address`, `business_phone`, `hours_line` | optional: `detailer_first_name` (not in body).

  13. addon_approved — required: `service_name` | optional: `first_name` (passed-but-unused).

  14. addon_declined — required: `service_name` | optional: `first_name`.

  15. payment_receipt — required: `first_name`, `transaction_greeting`, `receipt_link`, `business_name` | optional: none. Note: production body has not been migrated to this contract; references 2 chips caller doesn't pass.

  16. loyalty_milestone — required: `first_name`, `loyalty_points_balance`, `loyalty_cash_value`, `booking_link`, `business_name` | optional: none.

  17. detailer_job_assigned — required: `job_summary`, `appointment_date`, `appointment_time`, `service_total` | optional: `address` (sometimes empty for non-mobile). Note: production body has not been migrated; still references `services`/`vehicle_description`.

  18. staff_notification — required: `customer_name`, `customer_phone`, `reason_label`, `details` | optional: `reason_code` (passed but unused). Note: inbound webhook caller fails 2 of 4 — same fallback-string pattern as #6 specialty.

### Hardcoded — recommendation reflects PROPOSED body shape

  19. addon_authorization — required: `first_name`, `vehicle_description`, `issue_text`, `friendly_name`, `final_price`, `authorize_url`, `detailer_name`, `business_name` | optional: none. (Caller-side `vehicleDesc` defaults to `'your vehicle'` literal at line 194 — under chip-by-default rule the literal should move to template body, not into the chip.)

  20. addon_authorization_resend — required: `message_to_customer`, `authorize_url`, `business_name` | optional: none.

  21. addon_authorization_expired — required: none (zero-variable static body) | optional: none.

  22. quote_sms_admin — required: `quote_number`, `business_name`, `service_total`, `short_url` | optional: `first_name` (would need to be promoted with body change), `services`, `vehicle_description`.

  23. quote_sms_postcall — required: `business_name`, `short_url` | optional: `first_name_greeting` (composite, always non-empty so effectively required).

  24. quote_sms_midcall — required: `business_name`, `services`, `short_url` | optional: `first_name`, `vehicle_description`, `quote_number`.

  25. receipt_sms — required: `business_name`, `summary_line`, `short_url` | optional: none. Composite carries the conditional vehicle/total prose.

  26. transaction_voided — required: `first_name`, `receipt_number`, `business_name`, `business_phone`, `job_cancelled_line` (composite, always at-least-empty) | optional: `reason_line`.

  27. voice_info_store_info — required: `business_name`, `business_address`, `hours_line`, `short_url` | optional: none.

  28. voice_info_product_link — required: `product_name`, `business_name`, `short_url` | optional: none.

  29. voice_info_category_link — required: `category_name`, `business_name`, `short_url` | optional: none.

  30. voice_info_service_page — required: `service_name`, `business_name`, `short_url` | optional: none.

  31. voice_info_booking_link — required: `business_name`, `short_url` | optional: `service_filter` (sometimes pre-fills booking).

  32. voice_info_quote_link — required: `business_name`, `short_url` | optional: `quote_number`, `first_name`.

---

## C. Cheap-to-add chip recommendations

Chips in scope at ≥1 caller, not currently passed by any caller, plausibly useful in future template bodies. Ordered by total `<5 LOC` add cost across callers.

  1. **`customer_name` (full)** — already built or trivially built (`first_name + ' ' + last_name`) at every caller. Add cost: 1 LOC each at ~14 callers. Useful in: any "Hi {first_name}, {last_name}" → "Hi {customer_name}" rewrite, formal staff messages.
  2. **`last_name`** — DB column always selected alongside first_name; simply not passed. Add cost: 1 LOC each at ~14 callers. Useful in: address blocks, formal correspondence.
  3. **`customer_phone` (formatted)** — already in scope as recipient or via `customer.phone`. Add cost: 1 LOC each at ~14 callers; note `formatPhone` from `format.ts` for display formatting. Useful in: staff notifications, receipts, recovery flows.
  4. **`vehicle_description`** — already cleaned and in scope at #1 (admin/POS notify), #4 (book), #6 (book), #11 (cron quote-reminders has access_token; would need vehicle column add), #15 (in `vehicleDesc`), #17 (built inline into `job_summary`), #18 inbound (`specialtyVehicleDesc`), #19 (`vehicleDesc`), #25 (`vehicleStr`). Add cost: 1 LOC at 7 callers; medium at 2 callers (column add or new query). Useful in: every non-product flow.
  5. **`vehicle_year`, `vehicle_make`, `vehicle_model`** — separate fields useful for templates that want to format the vehicle differently than `cleanVehicleDescription`. Same callers as #4. Add cost: 3 LOC each at 7 callers.
  6. **`receipt_number`** — selected at #15 (with column add to `txRefresh` select), #16 (already loaded in `transaction.receipt_number`), #25 (column add). Add cost: 1 LOC at 1 caller, 5-LOC at 2 callers (column add). Useful in: transaction-related templates.
  7. **`appointment_id`** — currently used as `contextId` in sendSms options but not as chip. Add cost: 1 LOC at every appointment caller. Useful in: customer portal links ("Manage your appointment: portal/appt/{id}").
  8. **`detailer_first_name`, `detailer_name` (full)** — `employee.first_name`/`last_name` in scope at #1 (helper has `detailerFirstName` param but discards it inside helper), #17 (both callers have full employee). Add cost: 1 LOC at #17, 0 LOC at helper (just stop discarding). Useful in: friendlier completion messages, before/after job notifications.
  9. **`services_count`** — `appointment.services.length` at every appointment caller. Add cost: 1 LOC each. Useful in: "X services scheduled" framing.
  10. **`reason_line`** — already built at #26 (but used only in email branch). Add cost: 0 LOC at #26. Useful at #26 transaction_voided once migrated.
  11. **`payment_info`** — already built at #4 (only used in `booking_confirmed`). Add cost: 0 LOC, just promote to chip. Useful in: any deposit-aware message.
  12. **`hours_line`** — already built at #12 and #27 (different shapes — would need standardized helper). Add cost: 1-2 LOC if shared helper, 0 LOC if accepted as caller-built. Useful in: any "we're open" framing.
  13. **`gallery_link`** — built at #12 only. Other callers don't have job context. Add cost: 0 LOC at #12; would require new construction at non-job callers. Limited reuse.
  14. **`quote_url` / `access_token`** — selected at #7-9, #10-11, #22, #23, #24, #32. Add cost: 1 LOC each at ~7 callers. Useful in: any quote-link flow (currently composed into `short_url`).
  15. **`vehicle_color`** — `vehicle.color` selected at #4 (book), #12 (job_complete), #19 (addons). NOT selected at #17 detailer_job_assigned (would require column add). Add cost: 1 LOC at 3 callers; 5-LOC at 1 caller. Useful in: vehicle-specific framing ("your red Civic is ready").

---

## D. Caller refactor cost per slug

For each of the 14 hardcoded slugs (#19–32). LOC counts the diff between today's inline-interpolation block and a `renderSmsTemplate(slug, vars, fallback)` invocation with vars-object construction.

  19. addon_authorization — small (~12 LOC: replace 7-line `.join('\n')` block with renderSmsTemplate + 8-key vars object + isActive check; sendSms call already exists)
  20. addon_authorization_resend — small (~6 LOC: 1-line literal → 3-key vars + render call)
  21. addon_authorization_expired — small (~3 LOC at each of 2 callsites = 6 LOC total: replace literal with `renderSmsTemplate('addon_authorization_expired', {}, fallback)` + result.body extraction; identical replacement at both lines 864 and 876)
  22. quote_sms_admin — small (~8 LOC: 3-segment concat → 4-key vars + render call; preserve `mediaUrl` branch on `isProductionUrl`)
  23. quote_sms_postcall — small (~6 LOC: 1-line literal + caller-built `nameGreeting` → 3-key vars + render call)
  24. quote_sms_midcall — small (~5 LOC: 1-line literal → 3-key vars + render call)
  25. receipt_sms — small (~12 LOC: keep the 160-char truncation logic at lines 62-72 unchanged; replace lines 73-77 (literal assembly) with 3-key vars object + render call; sendSms call at :79 unchanged. The truncation is the body of the work, not the migration.)
  26. transaction_voided — small (~10 LOC: lines 139-156 replace inline `smsBody` build with 5-key vars + render call; preserve email branch above)
  27–32. voice_info_* (6 sub-slugs in single route) — medium (~40-50 LOC total): cannot migrate piecemeal because the `switch (infoType)` at line 74 currently builds `smsBody` per-case and shares one `sendSms` invocation at :341. Migration requires (a) define `INFO_TYPE_TO_SLUG` map, (b) per-case build vars object instead of `smsBody` string, (c) replace `sendSms(normalizedPhone, smsBody, ...)` at :341 with a `renderSmsTemplate(slug, vars, fallback) → sendSms(...)` chain. Each sub-slug individually is ~5-6 LOC of body change; the route-shape change is ~10-15 LOC; total is medium.

**Aggregate:** 13 of 14 slugs are individually small (<20 LOC). One cluster (voice-info, 6 sub-slugs) is medium when migrated as a unit (~40-50 LOC across the whole route). Zero hardcoded slugs are large.

---

## E. Composite chip catalog

Caller-pre-builds-a-string patterns currently in the codebase OR proposed by the prior turn's hardcoded inventory:

| Composite chip | Slug | Build location | Build pattern | Reused across callers? |
|---|---|---|---|---|
| `appointment_summary` | #1 appointment_confirmed | `src/lib/utils/sms.ts:313-317` (helper `buildAppointmentConfirmationSms`) | `'Your appointment is scheduled:' + optional serviceName + '${date} at ${time}' + optional 'Total: ${total}'` joined `\n` | YES — single helper used by 4 callers (#1's 4 callers). Behavior consistent. |
| `transaction_greeting` | #15 payment_receipt | `src/app/api/pos/transactions/route.ts:534-544` | 3-branch ternary on (services + vehicle), (services no vehicle), (product-only); appended `'You earned X loyalty points today.'` if `pointsEarned > 0` | NO — single inline build; not shared. |
| `job_summary` | #17 detailer_job_assigned | `src/app/api/appointments/[id]/notify/route.ts:299` AND `src/app/api/pos/appointments/[id]/notify/route.ts:291` | 1-line ternary: `vehicle ? \`${serviceNames} – ${vehicleStr}\` : serviceNames` | YES — duplicated word-for-word in 2 callers. No shared helper today. |
| `payment_info` | #4 booking_confirmed | `src/app/api/book/route.ts:583-585` | Binary: `hasDeposit ? \`Deposit paid: ${deposit}. Balance due at service: ${balance}.\` : 'Payment due at time of service.'` | NO — single inline build. |
| `deposit_info` | #6 booking_staff_notify | `src/app/api/book/route.ts:656` | Binary: `data.payment_intent_id ? 'Deposit paid.' : 'Pay on site.'` | NO — single inline build. Distinct from `payment_info` (different audience: customer vs staff). |
| `hours_line` | #12 job_complete | `src/app/api/pos/jobs/[id]/complete/route.ts:218-219` | Conditional: `closingTime ? \`Open today until ${closingTime}\` : 'See our hours online'` | NO at this site, but **#27 voice_info_store_info builds a different shape** at `src/app/api/voice-agent/send-info-sms/route.ts:81`: `formatBusinessHoursText(hours)` (full week schedule) or `'Call for hours'`. Two callers, two divergent shapes — consolidation candidate. |
| `reason_label` | #18 staff_notification | `src/app/api/voice-agent/notify-staff/route.ts:21-28, 68` | Map lookup: `REASON_LABELS[reason as EscalationReason]` | NO at #18; the inbound webhook caller at :642 doesn't pass it (uses fallback string). |
| `services` (multi-list) | #3, 4, 5, 6, 9, 22 | various — `services.map(s => s.service?.name).join(', ')` | comma-join over services array | YES — same pattern at ~6 callers, never extracted into helper. |
| `customer_name` (full) | #6, 9, 18 ×2, 22 | various — `\`${first_name} ${last_name}\`.trim()` or `\`${first_name} ${last_name}\`` | concatenation | YES — same pattern at ~5 callers, never extracted. |
| `summary_line` (proposed) | #25 receipt_sms | `src/app/api/pos/receipts/sms/route.ts:62-77` (today's inline build) | 2-branch: vehicle line with optional 160-char truncation OR `\`Your total — ${total}\`` | NO. **Length-aware** — only place in the codebase that does fit-then-substitute; would have to remain caller-side under any chip migration since engine has no length budget. |
| `first_name_greeting` (proposed) | #2, #23 | `voice-post-call.ts:344` AND `voice-post-call.ts:607` | `firstName ? \`, ${firstName}\` : ''` | YES — duplicated identical pattern at 2 callsites in same file; no helper. |
| `job_cancelled_line` (proposed) | #26 transaction_voided | `src/lib/email/send-void-notification.ts:139-141` | `input.jobCancelled ? ' Your scheduled service has been cancelled.' : ''` | NO. |
| `reason_line` (proposed) | #26 transaction_voided | `src/lib/email/send-void-notification.ts:55` | `input.reason ? \` Reason: ${input.reason}.\` : ''` | NO; built once but used only by email today. |
| `message_to_customer` | #20 addon_authorization_resend | request-body-passed; persisted on `job_addons.message_to_customer` | operator-typed prose | NO — the chip IS the operator's free text. |

**Composite design observations:**
- 4 of 14 composites currently exist as **inline duplicates across callers** (`job_summary` ×2, `first_name_greeting` ×2, `services` ×6, `customer_name` ×5). Each is a candidate for extraction into a tiny helper in `src/lib/utils/sms.ts` alongside `buildAppointmentConfirmationSms`.
- `hours_line` at #12 and #27 has **divergent shapes** (today-only vs. full-schedule). A single chip can't carry both unless callers agree.
- All composites that depend on conditional data (`job_summary`, `transaction_greeting`, `appointment_summary`, `job_cancelled_line`, `reason_line`, `payment_info`, `deposit_info`, `first_name_greeting`) are the chip-by-default escape hatch from the engine's lack of conditional rendering — every conditional template body lives instead in caller code that always emits a non-empty string.

---

TOTALS: 30 unique chips passed today, 27 unique chips in scope but not passed, 15 chips recommended to add proactively, 21 caller files touched across all 32 slugs.
