-- Session 2A — Universal SMS chip palette + per-slug contract columns.
--
-- ADDITIVE migration (no DROP). Adds required_variables and optional_variables
-- JSONB columns to sms_templates. The variables column is RETAINED for admin
-- UI / PUT-validation compatibility (Decision 1 from Session 2A intro — drop
-- deferred to Session 2E when admin code is migrated to read new columns).
--
-- Populates contracts for all 18 chip-driven templates per the Phase 0.5
-- four-way caller verification approved in Session 2A.
--
-- Phase 5 atomic body rewrite included: detailer_job_assigned migrates from
-- chip-by-chip body to a {job_summary} composite + {address} → {mobile_service_address}.
-- Operator-edit guard: aborts if body_template != default_body for that slug.
--
-- Idempotency: each per-slug UPDATE is gated on required_variables = '[]'::jsonb
-- (the column default). Re-running the migration after a contract edit won't clobber.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

ALTER TABLE sms_templates
  ADD COLUMN IF NOT EXISTS required_variables jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE sms_templates
  ADD COLUMN IF NOT EXISTS optional_variables jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sms_templates.required_variables IS
  'Chips the SMS engine treats as required: hard-skip on missing/empty value. JSONB array of chip keys. Validated by src/lib/sms/contract.ts against SMS_PALETTE.';
COMMENT ON COLUMN sms_templates.optional_variables IS
  'Chips the SMS engine treats as optional: REMOVE_LINE strips the line referencing a missing/empty value. JSONB array of chip keys. Validated by src/lib/sms/contract.ts against SMS_PALETTE.';
COMMENT ON COLUMN sms_templates.variables IS
  'DEPRECATED. Read by admin UI / PUT validation only. Engine reads required_variables + optional_variables. Drop scheduled for Session 2E when admin code is migrated.';

-- ---------------------------------------------------------------------------
-- 2. Phase 5 operator-edit guard
--    Aborts the migration (rolls back BEGIN) if detailer_job_assigned has
--    been operator-edited away from its default body. Prevents the body rewrite
--    below from clobbering local changes.
-- ---------------------------------------------------------------------------

DO $guard$
DECLARE
  cur_body text;
  def_body text;
BEGIN
  SELECT body_template, default_body INTO cur_body, def_body
  FROM sms_templates WHERE slug = 'detailer_job_assigned';
  IF cur_body IS NULL THEN
    RAISE EXCEPTION 'detailer_job_assigned row not found — cannot apply Phase 5 body rewrite';
  END IF;
  IF cur_body IS DISTINCT FROM def_body THEN
    RAISE EXCEPTION 'detailer_job_assigned body_template is operator-edited (body != default). Aborting Phase 5 atomic body rewrite. Restore the row to its default body or surface this for explicit handling.';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 3. Per-slug contract population (17 standard + 1 combined Phase 5)
--    Each UPDATE uses WHERE required_variables = '[]'::jsonb for idempotency.
-- ---------------------------------------------------------------------------

UPDATE sms_templates SET
  required_variables = '["service_name","appointment_date","appointment_time","service_total","business_name","business_phone"]'::jsonb,
  optional_variables = '["first_name"]'::jsonb,
  updated_at = now()
WHERE slug = 'appointment_confirmed' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["business_name","business_phone"]'::jsonb,
  optional_variables = '["first_name"]'::jsonb,
  updated_at = now()
WHERE slug = 'appointment_confirmed_postcall' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["business_name","business_phone"]'::jsonb,
  optional_variables = '["first_name","services","appointment_date","appointment_time"]'::jsonb,
  updated_at = now()
WHERE slug = 'appointment_cancelled' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["services","appointment_date","appointment_time","service_total","business_name","business_phone"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'booking_confirmed' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["service_name","appointment_time","business_name","business_phone"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'booking_reminder' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["customer_name","services","appointment_date","appointment_time","deposit_info"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'booking_staff_notify' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["item_name"]'::jsonb,
  optional_variables = '["first_name"]'::jsonb,
  updated_at = now()
WHERE slug = 'quote_accepted_single' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '[]'::jsonb,
  optional_variables = '["first_name"]'::jsonb,
  updated_at = now()
WHERE slug = 'quote_accepted_multi' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["customer_name","quote_number","services","service_total"]'::jsonb,
  optional_variables = '["customer_phone"]'::jsonb,
  updated_at = now()
WHERE slug = 'quote_accepted_staff_notify' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["first_name","short_url"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'quote_reminder' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["first_name","short_url"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'quote_viewed_followup' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["gallery_link","business_name","business_address","business_phone","hours_line"]'::jsonb,
  optional_variables = '["first_name","vehicle_description"]'::jsonb,
  updated_at = now()
WHERE slug = 'job_complete' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["service_name"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'addon_approved' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["service_name"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'addon_declined' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["transaction_greeting","receipt_link","business_name"]'::jsonb,
  optional_variables = '["first_name"]'::jsonb,
  updated_at = now()
WHERE slug = 'payment_receipt' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["loyalty_points_balance","loyalty_cash_value","booking_link","business_name"]'::jsonb,
  optional_variables = '["first_name"]'::jsonb,
  updated_at = now()
WHERE slug = 'loyalty_milestone' AND required_variables = '[]'::jsonb;

UPDATE sms_templates SET
  required_variables = '["reason_label","customer_name","details","customer_phone"]'::jsonb,
  optional_variables = '[]'::jsonb,
  updated_at = now()
WHERE slug = 'staff_notification' AND required_variables = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4. Phase 5 — detailer_job_assigned atomic body + contract migration
--    (resolves Bug 3 deferred from Session 1A)
--    Uses E'\n' for explicit newlines (standard_conforming_strings is ON by
--    default in modern Postgres; plain '...\n...' would be the literal 2-char
--    sequence, not a line break).
-- ---------------------------------------------------------------------------

UPDATE sms_templates SET
  body_template = E'New job assigned: {job_summary}\n{appointment_date} at {appointment_time}\n{mobile_service_address}\nTotal: {service_total}',
  default_body  = E'New job assigned: {job_summary}\n{appointment_date} at {appointment_time}\n{mobile_service_address}\nTotal: {service_total}',
  required_variables = '["job_summary","appointment_date","appointment_time","service_total"]'::jsonb,
  optional_variables = '["mobile_service_address","detailer_first_name"]'::jsonb,
  updated_at = now()
WHERE slug = 'detailer_job_assigned' AND required_variables = '[]'::jsonb;

COMMIT;
