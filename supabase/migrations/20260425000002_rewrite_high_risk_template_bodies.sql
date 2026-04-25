-- Session 42AB Phase 2: Rewrite HIGH-risk seeded template bodies using composite
-- caller-built chips. Driven by Session 42X-1's empty-fallback line-removal +
-- required-variable hard-skip changes — bodies that previously relied on the
-- engine fabricating noun-phrase fallbacks ("your vehicle", "your scheduled
-- date", etc.) now need either:
--   (a) a composite chip that the caller assembles with full prose context, OR
--   (b) every listed variable marked required so the engine hard-skips a
--       malformed send rather than producing orphan punctuation.
--
-- Per locked Phase 0 decisions:
--   - appointment_confirmed       — body REWRITTEN to use {appointment_summary}.
--   - appointment_confirmed_postcall — NO body change. Documented audit only:
--       all 3 vars marked required so the engine hard-skips on missing data
--       (orphan-comma-after-name was the HIGH-risk concern per 42X-1 CHANGELOG).
--   - detailer_job_assigned       — body REWRITTEN to use {job_summary}.
--   - MEDIUM-risk templates (booking_confirmed, staff_notification): NOT touched
--     here per Phase 0 Q4 — 42X-1 CHANGELOG verdict "Clean drop on missing"
--     is authoritative.
--
-- All UPDATEs use CASE-preserve-user-edits on body_template. If the production
-- body matches the original seed text (from 20260327000001), it is upgraded.
-- If an operator has edited it via the admin SlideOver, the edit is preserved
-- and the operator must reconcile against the new variables contract on next
-- save (42X-1's C4 PUT validator will reject a body that references variables
-- not in the new list).
--
-- The variables JSONB column is always overwritten — it IS the contract per
-- 42X-1's hard-skip pre-check. Operators editing the body cannot edit the
-- variables array (admin UI does not expose it). The new array shape lists
-- only the truly required keys for the new (or, for postcall, unchanged) body.
--
-- Cross-references:
--   docs/audits/SMS_TEMPLATE_ROOT_CAUSE_SESSION42W.md (Phase 6 step 7)
--   docs/audits/SMS_COMPLETE_INVENTORY_SESSION42Z.md
--   Session 42X-1 (commit b4696619) — engine + PUT validator
--   Session 42X-1-followup (commit afc0e2fb) — caller-side literal cleanup

-- =============================================================================
-- appointment_confirmed
-- =============================================================================
--
-- Original seed body (from 20260327000001:38) embeds 5 chips in possessive prose:
--   "{business_name} — Appointment Confirmed\n\nHi {first_name}, your
--    appointment is scheduled:\n{service_name}\n{appointment_date} at
--    {appointment_time}\nTotal: {service_total}\n\nQuestions? Call {business_phone}"
--
-- HIGH-risk failure modes under 42X-1's empty-fallback line removal:
--   - first_name missing → entire "Hi {first_name}, your appointment is..." line
--     drops, losing the "your appointment is scheduled:" framing context.
--   - service_name missing → standalone-line, MEDIUM (clean drop) — but the
--     overall structure is fragile with 4 optional standalone lines.
--
-- New body delegates all dynamic prose to the caller-built {appointment_summary}
-- composite. Caller (src/lib/utils/sms.ts buildAppointmentConfirmationSms) owns
-- assembling "Your appointment is scheduled:\n{service_name}\n{date} at {time}
-- \nTotal: ${total}" with conditional line inclusion in Phase 3.

UPDATE sms_templates
SET
  body_template = CASE
    WHEN body_template = E'{business_name} — Appointment Confirmed\n\nHi {first_name}, your appointment is scheduled:\n{service_name}\n{appointment_date} at {appointment_time}\nTotal: {service_total}\n\nQuestions? Call {business_phone}'
      THEN E'{business_name} — Appointment Confirmed\n\nHi {first_name}!\n{appointment_summary}\n\nQuestions? Call {business_phone}'
    ELSE body_template
  END,
  default_body = E'{business_name} — Appointment Confirmed\n\nHi {first_name}!\n{appointment_summary}\n\nQuestions? Call {business_phone}',
  variables = '[
    {"key":"business_name","description":"Business name from settings (auto-injected if omitted)","required":true},
    {"key":"first_name","description":"Customer first name","required":true},
    {"key":"appointment_summary","description":"Caller-built block: ''Your appointment is scheduled:'' + service line + date/time line + optional total line","required":true},
    {"key":"business_phone","description":"Business phone number from settings (auto-injected if omitted)","required":true}
  ]'::jsonb
WHERE slug = 'appointment_confirmed';

-- =============================================================================
-- appointment_confirmed_postcall
-- =============================================================================
--
-- Original seed body (from 20260327000001:49):
--   "Thanks for calling {business_name}, {first_name}! Your appointment is
--    confirmed. Questions? Call {business_phone}"
--
-- NO BODY REWRITE. The HIGH-risk concern (orphan ", " when first_name is
-- missing) is resolved by marking all 3 vars required — 42X-1's hard-skip
-- aborts the send rather than producing a malformed message. The CASE clause
-- below is documentary review per Phase 0 Q5: if production matches the seed,
-- the overwrite is a no-op (same value); if operator-edited, preserved.

UPDATE sms_templates
SET
  body_template = CASE
    WHEN body_template = E'Thanks for calling {business_name}, {first_name}! Your appointment is confirmed. Questions? Call {business_phone}'
      THEN body_template  -- no-op: seeded text matches new intent
    ELSE body_template     -- preserve operator edits
  END,
  default_body = E'Thanks for calling {business_name}, {first_name}! Your appointment is confirmed. Questions? Call {business_phone}',
  variables = '[
    {"key":"business_name","description":"Business name from settings (auto-injected if omitted)","required":true},
    {"key":"first_name","description":"Customer first name — required so the engine hard-skips a malformed greeting rather than sending ''Thanks for calling X, ! Your...''","required":true},
    {"key":"business_phone","description":"Business phone number from settings (auto-injected if omitted)","required":true}
  ]'::jsonb
WHERE slug = 'appointment_confirmed_postcall';

-- =============================================================================
-- detailer_job_assigned
-- =============================================================================
--
-- Original seed body (from 20260327000001:204) embeds two chips in dash-joined
-- prose:
--   "New job assigned: {services} – {vehicle_description}\n{appointment_date}
--    at {appointment_time}\n{address}\nTotal: {service_total}"
--
-- HIGH-risk failure mode: vehicle_description missing → " – {vehicle_description}"
-- becomes " – " orphan dash (under the original engine, was "your vehicle"
-- fallback noise; under 42X-1's empty-fallback line-removal, the entire line
-- drops, taking {services} with it — operator loses BOTH service and vehicle).
--
-- New body delegates the services+vehicle prose to caller-built {job_summary}.
-- Caller (notify routes) owns: services + (vehicle ? ` – ${vehicle}` : "").
-- detailer_first_name (added optional by 20260329000001) is dropped from the
-- variables array — body never referenced it; 42X-1's PUT validator would
-- reject any future operator edit that re-introduces it without adding a
-- placeholder.

UPDATE sms_templates
SET
  body_template = CASE
    WHEN body_template = E'New job assigned: {services} – {vehicle_description}\n{appointment_date} at {appointment_time}\n{address}\nTotal: {service_total}'
      THEN E'New job assigned: {job_summary}\n{appointment_date} at {appointment_time}\n{address}\nTotal: {service_total}'
    ELSE body_template
  END,
  default_body = E'New job assigned: {job_summary}\n{appointment_date} at {appointment_time}\n{address}\nTotal: {service_total}',
  variables = '[
    {"key":"job_summary","description":"Caller-built: services list, optionally with `` – vehicle_description`` suffix when a vehicle is attached","required":true},
    {"key":"appointment_date","description":"Appointment date","required":true},
    {"key":"appointment_time","description":"Appointment time","required":true},
    {"key":"address","description":"Mobile service address","required":true},
    {"key":"service_total","description":"Total amount, formatted","required":true}
  ]'::jsonb
WHERE slug = 'detailer_job_assigned';
