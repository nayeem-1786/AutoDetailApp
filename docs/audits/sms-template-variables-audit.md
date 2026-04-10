# SMS Template Variables — Complete Audit

> Date: 2026-04-10
> Scope: All 16 admin-editable SMS templates
> Status: Audit-only (no code changes)

---

## Auto-Injected Variables

`renderSmsTemplate()` in `src/lib/sms/render-sms-template.ts` (lines 203-217) auto-injects these from `getBusinessInfo()`:

| Variable | Source | Condition |
|----------|--------|-----------|
| `business_name` | `biz.name` | Only if not already passed by caller |
| `business_address` | `biz.address` | Only if not already passed by caller |
| `business_phone` | Override setting OR `biz.phone` | Only if not already passed by caller |

Callers do NOT need to pass these — they are injected automatically. No callers redundantly pass them.

---

## Template-by-Template Analysis

### 1. `appointment_confirmed` — Appointment Confirmed

**Callers:**
- `src/lib/utils/sms.ts:319` (`buildAppointmentConfirmationSms`)

**Variables passed:** `first_name`, `service_name`, `appointment_date`, `appointment_time`, `service_total`, `detailer_first_name`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| business_name | Y | Y | Y | N | Y | Y | None |
| business_phone | Y | Y | Y | N | Y | Y | None |
| appointment_date | Y | Y | Y | Y | N | Y | None |
| appointment_time | Y | Y | Y | Y | N | Y | None |
| service_name | Y | Y | Y | Y | N | N | None |
| first_name | Y | Y | Y | Y | N | N | None |
| service_total | Y | Y | Y | Y | N | N | None |
| detailer_first_name | N | Y | **N** | Y | N | - | **MISMATCH: In chips + passed by caller, but NOT in DB JSONB and NOT in default body. Available for admin to add but DB doesn't declare it.** |

---

### 2. `appointment_confirmed_postcall` — Post-Call Confirmation

**Callers:**
- `src/lib/services/voice-post-call.ts:347`

**Variables passed:** `first_name`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| business_name | Y | Y | Y | N | Y | Y | None |
| business_phone | Y | Y | Y | N | Y | Y | None |
| first_name | Y | Y | Y | Y | N | N | None |

No issues.

---

### 3. `booking_confirmed` — Online Booking Confirmed

**Callers:**
- `src/app/api/book/route.ts:469`

**Variables passed:** `first_name`, `appointment_date`, `appointment_time`, `services`, `vehicle_description`, `service_total`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| business_name | Y | Y | Y | N | Y | Y | None |
| business_phone | Y | Y | Y | N | Y | Y | None |
| appointment_date | Y | Y | Y | Y | N | Y | None |
| appointment_time | Y | Y | Y | Y | N | Y | None |
| services | Y | Y | Y | Y | N | Y | None |
| vehicle_description | Y | Y | Y | Y | N | N | None |
| service_total | Y | Y | Y | Y | N | Y | None |
| first_name | N | Y | **N** | Y | N | - | **MISMATCH: In chips + passed by caller, but NOT in DB JSONB and NOT in default body. Admin can insert it but DB doesn't declare it.** |
| detailer_first_name | N | Y | **N** | N | N | - | **MISMATCH: In chips but not in DB JSONB, not passed, not in body. Harmless — just available for admin to optionally add.** |

---

### 4. `appointment_cancelled` — Appointment Cancelled

**Callers:**
- `src/lib/email/send-cancellation-email.ts:187`
- `src/app/api/pos/jobs/[id]/cancel/route.ts:214`

**Variables passed:** `first_name`, `services`, `appointment_date`, `appointment_time`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| first_name | Y | Y | Y | Y | N | Y | None |
| services | Y | Y | Y | Y | N | Y | None |
| appointment_date | Y | Y | Y | Y | N | Y | None |
| appointment_time | Y | Y | Y | Y | N | Y | None |
| business_name | Y | Y | Y | N | Y | Y | None |
| business_phone | Y | Y | Y | N | Y | Y | None |

No issues. Perfectly aligned.

---

### 5. `quote_accepted_single` — Quote Accepted (Single Item)

**Callers:**
- `src/app/api/quotes/[id]/accept/route.ts:85` (conditional on items.length === 1)

**Variables passed:** `first_name`, `item_name`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| first_name | Y | Y | Y | Y | N | Y | None |
| item_name | Y | Y | Y | Y | N | Y | None |

No issues.

---

### 6. `quote_accepted_multi` — Quote Accepted (Multiple Items)

**Callers:**
- `src/app/api/quotes/[id]/accept/route.ts:85` (conditional on items.length > 1)

**Variables passed:** `first_name`, `item_name` (item_name passed but unused in this template)

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| first_name | Y | Y | Y | Y | N | Y | None |
| item_name | N | N | N | Y* | N | - | **Minor: `item_name` is passed (`items[0]?.item_name`) because the same variables object serves both single/multi slugs. Harmless — ignored by template.** |

---

### 7. `quote_accepted_staff_notify` — Staff: Quote Accepted

**Callers:**
- `src/app/api/quotes/[id]/accept/route.ts:119`

**Variables passed:** `customer_name`, `quote_number`, `service_total`, `services`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| customer_name | Y | Y | Y | Y | N | Y | None |
| quote_number | Y | Y | Y | Y | N | Y | None |
| service_total | Y | Y | Y | Y | N | Y | None |
| services | Y | Y | Y | Y | N | Y | None |

No issues. Perfectly aligned.

---

### 8. `booking_reminder` — Booking Reminder

**Callers:**
- `src/app/api/cron/booking-reminders/route.ts:76`

**Variables passed:** `first_name`, `service_name`, `appointment_time`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| service_name | Y | Y | Y | Y | N | Y | None |
| business_name | Y | Y | Y | N | Y | Y | None |
| appointment_time | Y | Y | Y | Y | N | Y | None |
| business_phone | Y | Y | Y | N | Y | Y | None |
| first_name | N | Y | **N** | Y | N | - | **MISMATCH: In chips + passed by caller, but NOT in DB JSONB and NOT in default body. Admin can insert `{first_name}` but DB doesn't declare it.** |

---

### 9. `quote_reminder` — Quote Reminder (Unviewed)

**Callers:**
- `src/app/api/cron/quote-reminders/route.ts:78`

**Variables passed:** `first_name`, `short_url`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| first_name | Y | Y | Y | Y | N | Y | None |
| short_url | Y | Y | Y | Y | N | Y | None |

No issues.

---

### 10. `quote_viewed_followup` — Quote Follow-Up (Viewed)

**Callers:**
- `src/app/api/cron/quote-reminders/route.ts:182`

**Variables passed:** `first_name`, `short_url`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| first_name | Y | Y | Y | Y | N | Y | None |
| short_url | Y | Y | Y | Y | N | Y | None |

No issues.

---

### 11. `job_complete` — Job Complete

**Callers:**
- `src/app/api/pos/jobs/[id]/complete/route.ts:244`

**Variables passed:** `first_name`, `vehicle_description`, `gallery_link`, `hours_line`, `detailer_first_name`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| first_name | Y | Y | Y | Y | N | Y | None |
| vehicle_description | Y | Y | Y | Y | N | Y | None |
| gallery_link | Y | Y | Y | Y | N | Y | None |
| business_name | Y | Y | Y | N | Y | Y | None |
| business_address | Y | Y | Y | N | Y | N | None |
| business_phone | Y | Y | Y | N | Y | N | None |
| hours_line | Y | Y | Y | Y | N | N | None |
| detailer_first_name | N | Y | **N** | Y | N | - | **MISMATCH: In chips + passed by caller, but NOT in DB JSONB and NOT in default body. Available for admin to add.** |

---

### 12. `addon_approved` — Add-on Approved

**Callers:**
- `src/lib/services/job-addons.ts:146`

**Variables passed:** `service_name`, `first_name`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| service_name | Y | Y | Y | Y | N | Y | None |
| first_name | N | Y | **N** | Y | N | - | **MISMATCH: In chips + passed by caller, but NOT in DB JSONB and NOT in default body. Admin can insert `{first_name}` but DB doesn't declare it.** |

---

### 13. `addon_declined` — Add-on Declined

**Callers:**
- `src/lib/services/job-addons.ts:218`

**Variables passed:** `service_name`, `first_name`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| service_name | Y | Y | Y | Y | N | Y | None |
| first_name | N | Y | **N** | Y | N | - | **MISMATCH: In chips + passed by caller, but NOT in DB JSONB and NOT in default body. Admin can insert `{first_name}` but DB doesn't declare it.** |

---

### 14. `booking_staff_notify` — Staff: New Booking

**Callers:**
- `src/app/api/book/route.ts:524`

**Variables passed:** `customer_name`, `services`, `appointment_date`, `appointment_time`, `deposit_info`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| customer_name | Y | Y | Y | Y | N | Y | None |
| services | Y | Y | Y | Y | N | Y | None |
| appointment_date | Y | Y | Y | Y | N | Y | None |
| appointment_time | Y | Y | Y | Y | N | Y | None |
| deposit_info | Y | Y | Y | Y | N | Y | None |

No issues. Perfectly aligned.

---

### 15. `detailer_job_assigned` — Detailer Job Assignment

**Callers:**
- `src/app/api/appointments/[id]/notify/route.ts:301`
- `src/app/api/pos/appointments/[id]/notify/route.ts:293`

**Variables passed:** `services`, `vehicle_description`, `appointment_date`, `appointment_time`, `address`, `service_total`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| services | Y | Y | Y | Y | N | Y | None |
| vehicle_description | Y | Y | Y | Y | N | N | None |
| appointment_date | Y | Y | Y | Y | N | Y | None |
| appointment_time | Y | Y | Y | Y | N | Y | None |
| address | Y | Y | Y | Y | N | N | None |
| service_total | Y | Y | Y | Y | N | N | None |
| detailer_first_name | N | Y | **N** | N | N | - | **MISMATCH: In chips but not in DB JSONB, not passed, not in body. Harmless — available for admin to optionally add.** |

---

### 16. `staff_notification` — Staff: Voice Agent Escalation

**Callers:**
- `src/app/api/voice-agent/notify-staff/route.ts:89`

**Variables passed:** `customer_name`, `customer_phone`, `reason_label`, `reason_code`, `details`

| Variable | In Body? | In Chips? | In DB JSONB? | Passed? | Auto-injected? | Required (DB)? | Issue |
|----------|----------|-----------|--------------|---------|----------------|----------------|-------|
| customer_name | Y | Y | Y | Y | N | N | None |
| customer_phone | Y | Y | Y | Y | N | N | None |
| reason_label | Y | Y | Y | Y | N | Y | None |
| reason_code | N | Y | Y | Y | N | N | None — available for admin to add |
| details | Y | Y | Y | Y | N | Y | None |
| business_name | N | Y | Y | N | Y | N | None — auto-injected, available for admin |

No issues. Perfectly aligned.

---

## Summary of All Mismatches

| # | Template | Variable | Issue |
|---|----------|----------|-------|
| 1 | `appointment_confirmed` | `detailer_first_name` | In chips + passed by caller, but missing from DB JSONB |
| 2 | `booking_confirmed` | `first_name` | In chips + passed by caller, but missing from DB JSONB |
| 3 | `booking_confirmed` | `detailer_first_name` | In chips but missing from DB JSONB (not passed, not in body) |
| 4 | `booking_reminder` | `first_name` | In chips + passed by caller, but missing from DB JSONB |
| 5 | `job_complete` | `detailer_first_name` | In chips + passed by caller, but missing from DB JSONB |
| 6 | `addon_approved` | `first_name` | In chips + passed by caller, but missing from DB JSONB |
| 7 | `addon_declined` | `first_name` | In chips + passed by caller, but missing from DB JSONB |
| 8 | `detailer_job_assigned` | `detailer_first_name` | In chips but missing from DB JSONB (not passed, not in body) |

**Pattern:** The DB JSONB `variables` column was seeded based on what the default body actually uses. When variables were added later (chips + caller) for optional admin use, the DB JSONB wasn't updated to match. The DB JSONB serves only as metadata for the required-check warning system and doesn't affect rendering.

---

## Required Flag Audit

### Current behavior
`required: true` in DB JSONB triggers a **console.warn** (line 248-251 of render-sms-template.ts) when the variable is missing. It does NOT block sending.

### Required variables assessment

| Template | Variable | Required? | Always passed? | Appropriate? |
|----------|----------|-----------|----------------|--------------|
| appointment_confirmed | business_name | Y | Y (auto) | Y — message nonsensical without it |
| appointment_confirmed | business_phone | Y | Y (auto) | Y — contact number essential |
| appointment_confirmed | appointment_date | Y | Y | Y |
| appointment_confirmed | appointment_time | Y | Y | Y |
| appointment_confirmed_postcall | business_name | Y | Y (auto) | Y |
| appointment_confirmed_postcall | business_phone | Y | Y (auto) | Y |
| booking_confirmed | business_name | Y | Y (auto) | Y |
| booking_confirmed | business_phone | Y | Y (auto) | Y |
| booking_confirmed | appointment_date | Y | Y | Y |
| booking_confirmed | appointment_time | Y | Y | Y |
| booking_confirmed | services | Y | Y | Y |
| booking_confirmed | service_total | Y | Y | Y |
| appointment_cancelled | all 6 vars | Y | Y | Y — all essential for context |
| quote_accepted_single | first_name | Y | Y | Y |
| quote_accepted_single | item_name | Y | Y | Y |
| quote_accepted_multi | first_name | Y | Y | Y |
| quote_accepted_staff_notify | all 4 vars | Y | Y | Y |
| booking_reminder | service_name | Y | Y | Y |
| booking_reminder | business_name | Y | Y (auto) | Y |
| booking_reminder | appointment_time | Y | Y | Y |
| booking_reminder | business_phone | Y | Y (auto) | Y |
| quote_reminder | first_name | Y | Y | Y |
| quote_reminder | short_url | Y | Y | Y |
| quote_viewed_followup | first_name | Y | Y | Y |
| quote_viewed_followup | short_url | Y | Y | Y |
| job_complete | first_name | Y | Y | Y |
| job_complete | vehicle_description | Y | Y | Y |
| job_complete | gallery_link | Y | Y | Y |
| job_complete | business_name | Y | Y (auto) | Y |
| booking_staff_notify | all 5 vars | Y | Y | Y |
| detailer_job_assigned | services | Y | Y | Y |
| detailer_job_assigned | appointment_date | Y | Y | Y |
| detailer_job_assigned | appointment_time | Y | Y | Y |
| staff_notification | reason_label | Y | Y | Y |
| staff_notification | details | Y | Y | Y |

**Verdict:** All required flags are appropriate. All required variables are always passed by their callers. No false-positive warnings occurring.

**Recommendation:** Keep required as warning-only. The fallback system (`DEFAULT_VARIABLE_FALLBACKS`) already gracefully handles missing variables, so a hard block would risk silencing important messages over a missing optional variable. Warning-only gives visibility without downtime risk.

---

## Admin UI Chips Completeness

Variables available for auto-injection (`business_name`, `business_phone`, `business_address`) are listed in chips for templates where they appear in the default body. For templates where they don't appear in the default body but ARE auto-injected:

| Template | Missing chip for auto-injected var? |
|----------|-------------------------------------|
| `quote_accepted_single` | `business_name`, `business_phone` available but not in chips — admin can't insert them |
| `quote_accepted_multi` | Same |
| `quote_accepted_staff_notify` | `business_name`, `business_phone` not in chips (staff template, less critical) |
| `addon_approved` | `business_name`, `business_phone` available but not in chips |
| `addon_declined` | Same |
| `booking_staff_notify` | `business_name`, `business_phone` not in chips |
| `detailer_job_assigned` | `business_name`, `business_phone` not in chips |
| `booking_reminder` | All auto-injected vars already in chips |

**Impact:** Low. These are auto-injected, so they work if admin types `{business_name}` manually. The chip UI just doesn't surface them as insertable. For customer-facing templates this could be improved; for staff/detailer templates it's trivial.

---

## Recommended Fixes

### Priority 1 — DB JSONB alignment (migration)

Add missing variables to the DB JSONB `variables` column. This enables the required-check system to warn if these are ever not passed:

```sql
-- appointment_confirmed: add detailer_first_name
UPDATE sms_templates SET variables = variables || '[{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb WHERE slug = 'appointment_confirmed';

-- booking_confirmed: add first_name, detailer_first_name
UPDATE sms_templates SET variables = variables || '[{"key":"first_name","description":"Customer first name","required":false},{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb WHERE slug = 'booking_confirmed';

-- booking_reminder: add first_name
UPDATE sms_templates SET variables = variables || '[{"key":"first_name","description":"Customer first name","required":false}]'::jsonb WHERE slug = 'booking_reminder';

-- job_complete: add detailer_first_name
UPDATE sms_templates SET variables = variables || '[{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb WHERE slug = 'job_complete';

-- addon_approved: add first_name
UPDATE sms_templates SET variables = variables || '[{"key":"first_name","description":"Customer first name","required":false}]'::jsonb WHERE slug = 'addon_approved';

-- addon_declined: add first_name
UPDATE sms_templates SET variables = variables || '[{"key":"first_name","description":"Customer first name","required":false}]'::jsonb WHERE slug = 'addon_declined';

-- detailer_job_assigned: add detailer_first_name
UPDATE sms_templates SET variables = variables || '[{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb WHERE slug = 'detailer_job_assigned';
```

### Priority 2 — Chips for auto-injected variables (optional)

In `src/lib/sms/sms-template-variables.ts`, add `business_name` and `business_phone` chips to templates that don't have them but where the admin might want to use them:
- `quote_accepted_single` (line 43-46)
- `quote_accepted_multi` (line 47-49)
- `addon_approved` (line 81-84)
- `addon_declined` (line 85-88)

### Priority 3 — Detailer first name pass-through (optional)

`detailer_job_assigned` has a chip for `detailer_first_name` but callers don't pass it. If the admin adds `{detailer_first_name}` to the template body, it would render as the fallback "your detailer". To fix:
- `src/app/api/appointments/[id]/notify/route.ts:301` — add `detailer_first_name: employee?.first_name`
- `src/app/api/pos/appointments/[id]/notify/route.ts:293` — same

---

## Conclusion

The SMS template system is well-architected with proper fallbacks. The mismatches found are all low-severity (DB JSONB metadata gaps, not rendering failures). The fallback system ensures no customer ever sees raw `{variable}` text. All required flags are correctly calibrated. Warning-only enforcement is the right choice.
