-- Add detailer_first_name to relevant templates
-- Add first_name to templates that were missing it
-- Part of Session 13N variable completeness audit

-- appointment_confirmed: add detailer_first_name
UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb
WHERE slug = 'appointment_confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'detailer_first_name'
  );

-- booking_confirmed: add first_name and detailer_first_name
UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"first_name","description":"Customer first name","required":false}]'::jsonb
WHERE slug = 'booking_confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'first_name'
  );

UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb
WHERE slug = 'booking_confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'detailer_first_name'
  );

-- job_complete: add detailer_first_name
UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb
WHERE slug = 'job_complete'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'detailer_first_name'
  );

-- detailer_job_assigned: add detailer_first_name
UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"detailer_first_name","description":"Assigned detailer first name","required":false}]'::jsonb
WHERE slug = 'detailer_job_assigned'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'detailer_first_name'
  );

-- booking_reminder: add first_name
UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"first_name","description":"Customer first name","required":false}]'::jsonb
WHERE slug = 'booking_reminder'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'first_name'
  );

-- addon_approved: add first_name
UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"first_name","description":"Customer first name","required":false}]'::jsonb
WHERE slug = 'addon_approved'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'first_name'
  );

-- addon_declined: add first_name
UPDATE sms_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '[{"key":"first_name","description":"Customer first name","required":false}]'::jsonb
WHERE slug = 'addon_declined'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(variables) v WHERE v->>'key' = 'first_name'
  );
