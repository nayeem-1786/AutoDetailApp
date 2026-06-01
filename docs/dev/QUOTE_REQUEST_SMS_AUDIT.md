# Audit — Quote-Request SMS Notification Failure (#137 regression)

> **Status:** Conclusive. Bug identified at config layer; no escalation to PII queries needed.
> **Scope:** Targeted audit (Memory #29 type 1). Single finding, single fix recommended.
> **Audit date:** 2026-06-01
> **Branch:** `audit/quote-request-sms-failure`
> **Related session:** U-B.3 / #137 (c2aca5db) — generalized specialty-callback endpoint with `request_type` discriminator + added `RequestQuoteCard` for staff_assessed services.

---

## Context

Operator tested the new W3 flow on production: filled out the inline `RequestQuoteForm` on Step 2 for a `staff_assessed` service, submitted, but neither the staff member nor the (test) customer received any notification.

Two competing possibilities were proposed:
- **(a)** Form failed to POST silently — no audit_log row written.
- **(b)** POST succeeded + row written, but the downstream SMS path is broken for the new variant.

**Verdict: possibility (b).** The POST path is intact; the regression is structural in the SMS-recipient defaulting for the new branch.

---

## Target A — Did the POST succeed?

**Conclusive without audit_log inspection.** The route's structure makes POST success vs. failure deterministic from the code:

- `src/app/api/public/specialty-callback/route.ts:75-77` — top-level `try` wraps the whole handler; any unexpected throw returns 500.
- `:93-101` — required-field guards: `name` + `phone` required; `request_type` validation; `service_name` required when `request_type='staff_assessed_service'`. All three guards return clean 400s.
- `:111-152` — vehicle description build + `logAudit({...})` call. `logAudit` is fire-and-forget (`src/lib/services/audit.ts:21-42`) and writes to `audit_log` regardless of SMS success.
- The form client (`src/components/booking/quote-request-form.tsx:108-118`) builds a well-formed payload from `RequestQuoteCard`'s `payloadBase` (`src/components/booking/request-quote-card.tsx:77-88`): `request_type: 'staff_assessed_service'`, `service_name`, `service_id`, vehicle fields. All required fields satisfied.

**Conclusion:** if the operator's form submission completed the network round-trip (no client-side throw before `fetch`), `logAudit` ran and the `audit_log` table holds a row with `details.event='staff_assessed_quote_requested'`. The PII-restricted query would only confirm this; the code makes the answer determinate.

Possibility (a) **ruled out** — the POST path is not silently failing on the new variant.

---

## Target B — Regression check on existing specialty-vehicle flow

**Config-only confirmation: specialty_vehicle SMS path is structurally intact.**

Queried `sms_templates` for `booking_staff_notify_specialty`:

```json
{
  "slug": "booking_staff_notify_specialty",
  "is_active": true,
  "recipient_type": "staff",
  "recipient_phones": ["+14242370913", "+14243637450"],
  "required_variables": ["customer_name", "customer_phone", "vehicle_description"],
  "optional_variables": ["customer_email", "size_class", "preferred_time"],
  "body_template": "🔔 Specialty vehicle callback request\n..."
}
```

The two `recipient_phones` are real staff cell numbers (operator's two staff members, per the same pair appearing across all 5 staff-recipient templates in the DB).

Trace in `src/app/api/public/specialty-callback/route.ts:187-210`:

```ts
if (request_type === 'specialty_vehicle') {
  const templateResult = await renderSmsTemplate('booking_staff_notify_specialty', {...}, staffMessage);
  smsBody = templateResult?.body || staffMessage;
  recipients = templateResult?.recipientPhones?.length
    ? templateResult.recipientPhones
    : [biz.phone];
}
```

For `specialty_vehicle`: `templateResult.recipientPhones = ["+14242370913", "+14243637450"]` (the two staff phones) → `recipients` becomes the two staff phones → `sendSms` delivers to staff. **Works.**

**Regression scope: NEW BRANCH ONLY.** The bug is specific to the `staff_assessed_service` discriminator path. The shared SMS dispatcher is not broken — the new branch never reaches the recipient-lookup code that the specialty branch uses.

---

## Target C — Exact failure point

### File:line

**`src/app/api/public/specialty-callback/route.ts:184-186`** — the recipient default:

```ts
let smsBody = staffMessage;
let recipients: (string | null | undefined)[] = [biz.phone];
```

**`src/app/api/public/specialty-callback/route.ts:187`** — the gate that only the specialty branch crosses:

```ts
if (request_type === 'specialty_vehicle') {
  // ...recipient_phones resolution from sms_templates...
}
```

For `request_type === 'staff_assessed_service'`, the `if` body never runs. `recipients` stays at its initialized value of `[biz.phone]`. The for-loop at `:212-216` then sends `staffMessage` to `biz.phone`.

### What `biz.phone` resolves to

`getBusinessInfo()` (`src/lib/data/business.ts:48-86`) reads `business_settings.business_phone`. Queried:

```json
{ "key": "business_phone", "value": "(424) 401-0094" }
```

Per `CLAUDE.md` line 32 (`Twilio | SMS (+14244010094)`), `(424) 401-0094` IS **the business's own Twilio sending number** — the same line that `TWILIO_PHONE_NUMBER` env var refers to, attached to the messaging service in `TWILIO_MESSAGING_SERVICE_SID`.

### What actually happens when `sendSms('+14244010094', ...)` runs

`sendSms` (`src/lib/utils/sms.ts:45-185`) normalizes `(424) 401-0094` → `+14244010094` (E.164) and POSTs to Twilio with:
- `MessagingServiceSid` = the business's A2P messaging service (which OWNS `+14244010094`)
- `To` = `+14244010094`

Twilio receives a request to send from a messaging service whose attached sender number is the same as the recipient. Two outcomes are possible (both result in zero staff visibility):

1. **Twilio rejects** with error 21266 / 21610 ("To and From cannot be the same" / blacklist) — `sendSms` returns `{ success: false, error: 'Failed to send SMS' }` and the route's `catch (smsErr)` at `:217-220` swallows it (`'best-effort — don't fail the response'`). No staff phone ever receives anything.
2. **Twilio accepts** and routes the SMS back into the business's own inbound webhook (`/api/twilio/inbound` or equivalent) where it's processed as an inbound customer message — possibly even triggering the AI auto-responder. Still no staff cellphone gets the message; the staff notification disappears into the inbound-message pipeline.

Either way: **the staff member's personal cell receives nothing.** The operator's reported symptom is fully explained.

### Failure category

Per the audit's enumeration: this is **C.2(i) + C.2(iii) combined** — a conditional gated on `request_type` excludes the new variant from the recipient-phone lookup (i), AND no separate dispatcher (template + recipient_phones row) was wired for `staff_assessed_service` (iii). The route's own header comment at `:23-32` is honest about (iii) (`"There is no per-slug SMS template for this request type yet — the staff SMS uses the endpoint's existing raw-prose fallback path"`) but the design oversight is that the **recipient list** was not handled in parallel with the body — `staffMessage` is correct prose for the new variant, but `[biz.phone]` is the wrong destination for ANY staff SMS, specialty or otherwise (it would also have failed if the specialty branch's `recipient_phones` were null — see `:207-209` `?? [biz.phone]` fallback).

---

## Target D — Recommended minimal fix

### Two acceptable fix shapes

**Pattern A — code-only (recommended for immediate fix; ~5 lines):**

Reuse `booking_staff_notify_specialty.recipient_phones` as the recipient list for `staff_assessed_service` as well, since the DB already shows ALL 5 staff templates share the same 2-phone recipient list (no role-based separation). The `staff_assessed_service` branch keeps its raw-prose `staffMessage` body (matching the route header comment's intent) but pulls recipients from the existing template row.

```ts
// Resolve staff recipients ONCE — reuse the specialty template's
// recipient_phones for both branches until a dedicated slug is seeded.
// Falls back to biz.phone only if the specialty template row has no
// configured recipients (which would be a separate config bug).
const specialtyTmpl = await renderSmsTemplate(
  'booking_staff_notify_specialty',
  {
    customer_name: name,
    customer_phone: phone,
    vehicle_description: vehicleDesc,
    customer_email: customerEmail,
    size_class: size_class || undefined,
    preferred_time: preferred_time || undefined,
  },
  staffMessage
);

let smsBody: string;
const recipients = specialtyTmpl?.recipientPhones?.length
  ? specialtyTmpl.recipientPhones
  : [biz.phone];

if (request_type === 'specialty_vehicle') {
  smsBody = specialtyTmpl?.body || staffMessage;
} else {
  // staff_assessed_service — raw prose until dedicated slug exists
  smsBody = staffMessage;
}
```

Fix size: ~5 added lines + 1 deleted line in `route.ts`. No migration. No new template. Reuses existing staff phone config.

**Pattern B — proper follow-up (matches route's stated intent; ~1 migration + ~3 lines):**

Seed `booking_staff_notify_quote_request` slug via migration mirroring `20260427000006_seed_specialty_sub_slugs.sql`, with:
- `recipient_type='staff'`
- `recipient_phones=['+14242370913', '+14243637450']` (same two phones)
- A body template referencing `service_name` + `customer_name` + `customer_phone` + optional `vehicle_description` + `customer_email` + `preferred_time`
- `is_active=true`, `can_silence=true`

Then update `route.ts:187` to branch on slug per `request_type`:

```ts
const tmplSlug = request_type === 'specialty_vehicle'
  ? 'booking_staff_notify_specialty'
  : 'booking_staff_notify_quote_request';
const templateResult = await renderSmsTemplate(tmplSlug, {...}, staffMessage);
```

(Plus matching `RenderVarsBySlug` entry in `src/lib/sms/sms-contracts.source.ts` + regen.)

Fix size: 1 migration, ~3 source lines, run `npx tsx scripts/regen-sms-contracts.ts`.

### Recommendation

**Pattern A first** (unblocks operator immediately, no migration to deploy), **then Pattern B as the proper follow-up** when the operator wants a customizable per-variant body template. Pattern B is what the route header comment at `:23-32` already promises — Pattern A is the bridge that should have shipped alongside #137 but didn't because the recipient list was conflated with the body template.

### Related concerns surfaced

- The route's `[biz.phone]` fallback at line 185 is dangerous as a generic default for ANY staff SMS path — it would trigger the same Twilio self-send failure mode if `booking_staff_notify_specialty.recipient_phones` were ever set to `null` or `[]` via admin UI. This is not currently exploitable (config is correct today), but it's a latent footgun. **Out of Targeted scope** — flagging only.
- No customer-facing SMS confirmation is sent on quote-request submission (either variant). The form's success state (UI-only) is the customer's only acknowledgment. See Target E.

---

## Target E — Customer SMS expectation

**Answer: customer SMS was never wired. The form's UI success state is the only customer acknowledgment.**

- `QuoteRequestForm.handleSubmit` (`src/components/booking/quote-request-form.tsx:100-129`) posts the payload and on completion sets `submitted=true`, rendering a green success card with `successHeadline` + `successBody` (`:157-162`).
- The route's POST handler (`route.ts:75-227`) writes only ONE outbound SMS — to staff recipients — and never enqueues a customer-facing SMS. This is true for BOTH `specialty_vehicle` (existing, Session 29 vintage) AND `staff_assessed_service` (new in #137). The pattern is consistent with the rest of the public booking flow's "callback request" intent — the customer expects a phone call back, not an SMS.

If the operator was testing using their own phone for both staff-line and customer-side, the "customer didn't receive anything" observation reflects **that no customer SMS was ever supposed to be sent**, NOT a regression. The only intended SMS is the staff notification — which is the one that's broken (Target C/D).

**Operator decision needed:**
- If a customer SMS confirmation IS desired for quote requests (consistency with the success-state copy "One of our specialists will reach out soon"), that's a SEPARATE feature, not a fix. Recommended to scope as a follow-up (would need a customer-recipient SMS template, slug `quote_request_confirmation` or similar, mirroring `appointment_confirmed`'s shape).
- If only staff SMS was intended, no further fix needed beyond Target D.

---

## Summary

| Question | Answer |
|----------|--------|
| Possibility (a) or (b)? | **(b)** — POST succeeded, downstream SMS path broken for new variant |
| Regression on specialty_vehicle? | **No** — config + code path intact; specialty branch still delivers to staff |
| Failure point | `src/app/api/public/specialty-callback/route.ts:184-186` (`recipients = [biz.phone]` default) + `:187` (`if (request_type === 'specialty_vehicle')` gate excludes new branch from recipient lookup) |
| Root cause | `staff_assessed_service` branch sends staff SMS to `biz.phone = '(424) 401-0094'` = the business's OWN Twilio sending line. Twilio either rejects (To==From) or routes the message into the inbound-message pipeline. Either outcome: zero staff phones receive it. |
| Recommended fix | Pattern A (code-only, ~5 lines): reuse `booking_staff_notify_specialty.recipient_phones` for both branches. Pattern B (migration + ~3 lines): seed dedicated `booking_staff_notify_quote_request` slug as the route comment already promised. |
| Customer SMS expectation | Not wired for either variant. UI success state is the only customer acknowledgment. Out of fix scope unless operator wants customer SMS as a NEW feature. |

---

## Open operator questions

1. **Fix pattern:** Pattern A (immediate code-only) or Pattern B (proper migration)? Or both — A now, B as scheduled follow-up?
2. **Customer SMS confirmation:** desired as a follow-up, or is the UI success state sufficient?
3. **Latent fallback footgun:** worth tightening `recipients = [biz.phone]` to `recipients = []` (drop instead of self-send) as a defense-in-depth follow-up, with a runtime warn log?
