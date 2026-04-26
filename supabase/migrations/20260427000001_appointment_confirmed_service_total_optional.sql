-- ---------------------------------------------------------------------------
-- Session 2B: appointment_confirmed — demote service_total from required to
-- optional, and split appointment_time / service_total onto separate body
-- lines so REMOVE_LINE strips only the total line when service_total is absent.
--
-- Why: voice-agent ad-hoc bookings (route handler at
-- src/app/api/voice-agent/appointments/route.ts:520, "DIRECT BOOKING PATH")
-- create appointments with total_amount=0 by design — staff prices the job
-- later. Pre-2B, the helper buildAppointmentConfirmationSms early-returned
-- null for these (engine would have hard-skipped on missing service_total
-- post-2A.5). After 2B, the caller passes total only when total_amount > 0;
-- when undefined, the engine substitutes '' from DEFAULT_VARIABLE_FALLBACKS
-- and REMOVE_LINE strips the '{service_total}' line cleanly.
--
-- Body line split rationale: the prior body had 'at {appointment_time} -
-- {service_total}' on one line. REMOVE_LINE would have stripped both the
-- time AND the total when total was absent — UX regression. Splitting into
-- two lines isolates the removal to just the total.
--
-- Operator-edit safety: this migration only proceeds when body_template
-- equals default_body (slug is in "default" state). Per Session 2A's Phase
-- 0.5 finding, the prior operator edit applied to both columns together,
-- so they remain in sync. After this migration, both columns reflect the
-- new split-line format; the slug remains "default" for future migrations.
--
-- Idempotency: contract update guarded on `required_variables ? 'service_total'`;
-- body rewrite guarded on body_template = default_body. Safe to re-run.
--
-- variables JSONB alignment (CLAUDE.md rule 9): NOT needed. service_total
-- is already in `variables`; we are not adding/removing chips, only
-- demoting required→optional in the new contract columns and rearranging
-- body lines. Admin save still validates against the unchanged `variables`
-- column.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Contract: move service_total from required_variables to optional_variables.
UPDATE sms_templates
SET
  required_variables = required_variables - 'service_total',
  optional_variables = optional_variables || '"service_total"'::jsonb,
  updated_at = now()
WHERE slug = 'appointment_confirmed'
  AND required_variables ? 'service_total';

-- 2. Body rewrite: split {appointment_time} and {service_total} onto separate lines.
--    Operator-edit guard: only proceed if body_template = default_body.
UPDATE sms_templates
SET
  body_template = E'{business_name} — Appointment Confirmed:\n\n{service_name}\n{appointment_date}\nat {appointment_time}\n{service_total}\n\nNeed to make a change?\nCall {business_phone}\n\n\n',
  default_body  = E'{business_name} — Appointment Confirmed:\n\n{service_name}\n{appointment_date}\nat {appointment_time}\n{service_total}\n\nNeed to make a change?\nCall {business_phone}\n\n\n',
  updated_at = now()
WHERE slug = 'appointment_confirmed'
  AND body_template = default_body;

COMMIT;
