-- Session 2A — Corrective migration to align sms_templates.variables for
-- detailer_job_assigned with its new body (rewritten by 20260425000003 Phase 5).
--
-- Why: 20260425000003 rewrote the body to use {job_summary} and {mobile_service_address}
-- but left the legacy `variables` column (still read by admin PUT validation
-- and admin chip-picker UI) populated with the OLD chip set [services,
-- vehicle_description, appointment_date, appointment_time, address, service_total].
-- Result: admin save of the row is rejected on both unknown-placeholder
-- ({job_summary}, {mobile_service_address}) and missing-required (services,
-- vehicle_description, address) checks.
--
-- This migration brings `variables` back into agreement with the new body for
-- this one slug. Other 17 slugs are unaffected (their bodies didn't change).
--
-- The variables column shape stays object[] with {key, description, required}
-- entries — matches the legacy admin-side reader format. The required flags
-- mirror the engine's new required_variables / optional_variables split set in
-- 20260425000003.
--
-- Idempotency: WHERE clause checks for the old shape (presence of "services"
-- key in variables). After this migration applies, the predicate is false and
-- re-running is a no-op.

BEGIN;

UPDATE sms_templates SET
  variables = '[
    {"key":"job_summary","description":"Composite: services with optional vehicle suffix","required":true},
    {"key":"appointment_date","description":"Formatted appointment date","required":true},
    {"key":"appointment_time","description":"Formatted appointment time","required":true},
    {"key":"service_total","description":"Formatted total amount","required":true},
    {"key":"mobile_service_address","description":"Customer''s mobile service address","required":false},
    {"key":"detailer_first_name","description":"Assigned detailer''s first name","required":false}
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'detailer_job_assigned'
  AND variables @> '[{"key":"services"}]'::jsonb;

COMMIT;
