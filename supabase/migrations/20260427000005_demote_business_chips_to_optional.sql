-- Session 2D.3 — Demote business identity chips from required to optional.
--
-- Operator-raised flexibility: business_name, business_phone, and business_address
-- (the 3 autoInject chips in SMS_PALETTE) move from required_variables to
-- optional_variables across the 8 chip-driven slugs where they appear in required.
-- Operators can now write SMS bodies without forced inclusion of business identity
-- placeholders (e.g. shortened "SD Auto Spa" instead of full business name; omit
-- office number when sender ID provides callback path; omit business address from
-- completion messages when not needed).
--
-- Runtime behavior unchanged: the engine auto-injects these chips from
-- getBusinessInfo() before the missing-required check, so when bodies DO include
-- the placeholders, substitution still happens identically. The contract change
-- only loosens admin save validation: bodies omitting these placeholders no longer
-- 400 reject.
--
-- Idempotency: each UPDATE is gated on the chip's presence in required_variables.
-- Re-running on a row that already had the chip removed is a no-op (WHERE filter
-- excludes it; no duplicate appends to optional_variables).
--
-- 9 UPDATEs across 8 slugs:
--   Group A (6 slugs, both business_name + business_phone):
--     appointment_cancelled, appointment_confirmed, appointment_confirmed_postcall,
--     booking_confirmed, booking_reminder, job_complete
--   Group B (2 slugs, business_name only):
--     loyalty_milestone, payment_receipt
--   Group C (1 slug, business_address):
--     job_complete (folded with the Group A run; business_address handled separately)

-- ─────── Group A — demote both business_name AND business_phone ───────

UPDATE sms_templates
SET required_variables = required_variables - 'business_name' - 'business_phone',
    optional_variables = optional_variables || '["business_name","business_phone"]'::jsonb,
    updated_at = now()
WHERE slug = 'appointment_cancelled' AND required_variables ? 'business_name';

UPDATE sms_templates
SET required_variables = required_variables - 'business_name' - 'business_phone',
    optional_variables = optional_variables || '["business_name","business_phone"]'::jsonb,
    updated_at = now()
WHERE slug = 'appointment_confirmed' AND required_variables ? 'business_name';

UPDATE sms_templates
SET required_variables = required_variables - 'business_name' - 'business_phone',
    optional_variables = optional_variables || '["business_name","business_phone"]'::jsonb,
    updated_at = now()
WHERE slug = 'appointment_confirmed_postcall' AND required_variables ? 'business_name';

UPDATE sms_templates
SET required_variables = required_variables - 'business_name' - 'business_phone',
    optional_variables = optional_variables || '["business_name","business_phone"]'::jsonb,
    updated_at = now()
WHERE slug = 'booking_confirmed' AND required_variables ? 'business_name';

UPDATE sms_templates
SET required_variables = required_variables - 'business_name' - 'business_phone',
    optional_variables = optional_variables || '["business_name","business_phone"]'::jsonb,
    updated_at = now()
WHERE slug = 'booking_reminder' AND required_variables ? 'business_name';

UPDATE sms_templates
SET required_variables = required_variables - 'business_name' - 'business_phone',
    optional_variables = optional_variables || '["business_name","business_phone"]'::jsonb,
    updated_at = now()
WHERE slug = 'job_complete' AND required_variables ? 'business_name';

-- ─────── Group B — demote business_name only ───────

UPDATE sms_templates
SET required_variables = required_variables - 'business_name',
    optional_variables = optional_variables || '["business_name"]'::jsonb,
    updated_at = now()
WHERE slug = 'loyalty_milestone' AND required_variables ? 'business_name';

UPDATE sms_templates
SET required_variables = required_variables - 'business_name',
    optional_variables = optional_variables || '["business_name"]'::jsonb,
    updated_at = now()
WHERE slug = 'payment_receipt' AND required_variables ? 'business_name';

-- ─────── Group C — demote business_address on job_complete ───────

UPDATE sms_templates
SET required_variables = required_variables - 'business_address',
    optional_variables = optional_variables || '["business_address"]'::jsonb,
    updated_at = now()
WHERE slug = 'job_complete' AND required_variables ? 'business_address';
