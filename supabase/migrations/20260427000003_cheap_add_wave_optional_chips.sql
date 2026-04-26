-- ---------------------------------------------------------------------------
-- Session 2D: cheap-add wave — optional chips added to 18 chip-driven slug
-- contracts; legacy `variables` JSONB column cleanly rebuilt for each slug.
--
-- Adds the following optional chips per the audience-based rule (customer
-- slugs gain last_name + vehicle_description where applicable; staff slugs
-- gain customer_email + customer_phone + last_name + vehicle_description
-- where applicable):
--   • last_name           → 18 slugs
--   • vehicle_description → 12 slugs (excludes job_complete which already
--                                     had it; excludes composite-redundant
--                                     and semantically-mismatched slugs)
--   • first_name          → 4 slugs (only where currently absent)
--   • customer_email      → 4 slugs
--   • customer_phone      → 2 slugs
-- Total: 40 contract chip-add UPDATEs.
--
-- Bodies are NOT rewritten in this migration. Operators decide via admin UI
-- whether to use the new chips in body text. The cheap-adds are dead chips
-- in render output today (placeholders don't exist in the body) — they
-- become observable when operators add them to body via admin UI in 2E or
-- earlier ad-hoc edits.
--
-- ────────────────────────────────────────────────────────────────────────
-- Legacy `variables` JSONB clean rebuild (Section B below) — 18 slugs.
--
-- Per CLAUDE.md rule 9, the admin UI continues to read the legacy
-- `variables` JSONB column during the 2-source-of-truth window (Sessions 2A
-- → 2E). Without aligning legacy `variables` to the new contract shape,
-- admin save would reject any body edit that introduces one of the new
-- cheap-add chips (admin save validates body against `variables` and treats
-- every entry as required). Aligning here makes the cheap-add chips
-- immediately usable in admin UI — operators can add `{last_name}`,
-- `{vehicle_description}`, etc. to body text without waiting for 2E.
--
-- The "clean rebuild" approach REPLACES the existing `variables` array with
-- a freshly-computed array sourced from the post-update required_variables
-- ∪ optional_variables. This both adds the new chips AND fixes pre-existing
-- drift in production rows:
--   • loyalty_milestone had `[null,null,null,null,null]` — entirely broken,
--     admin UI would have failed body validation against any chip key.
--   • addon_approved / addon_declined / booking_reminder had duplicate
--     "first_name" entries (length 3, 2 of which identical).
--   • appointment_confirmed had duplicate "detailer_first_name" entries.
--   • booking_confirmed had duplicate "first_name" + duplicate
--     "detailer_first_name" entries.
--   • job_complete had duplicate "detailer_first_name" entries.
--   • staff_notification had a stray "business_name" entry that wasn't in
--     the contract (legacy carryover from a removed body chip).
-- All of these are resolved by the clean rebuild.
--
-- ────────────────────────────────────────────────────────────────────────
-- Algorithm (deterministic):
--   variables = required_variables.map(key => {key, description, required: true})
--             .concat(optional_variables.map(key => {key, description, required: false}))
-- Ordering choice: required chips first (alphabetical within group), then
-- optional chips (alphabetical within group). Engine doesn't care about
-- order; admin UI may render in array order — required-first is the
-- intuitive presentation for operators reading the variable picker.
-- Descriptions sourced verbatim from sms-contracts.source.ts chip metadata
-- (the post-2A.5 source-of-truth); composite chips retain their "Composite:"
-- prefix so operators understand they're caller-built strings.
-- ---------------------------------------------------------------------------

BEGIN;

-- ============================================================================
-- Section A: Contract chip-add UPDATEs (40 statements, idempotent via NOT ?)
-- ============================================================================

-- ── last_name (18 slugs) ──────────────────────────────────────────────────
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'addon_approved' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'addon_declined' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'appointment_cancelled' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'appointment_confirmed' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'appointment_confirmed_postcall' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'booking_confirmed' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'booking_reminder' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'booking_staff_notify' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'detailer_job_assigned' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'job_complete' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'loyalty_milestone' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'payment_receipt' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'quote_accepted_multi' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'quote_accepted_single' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'quote_accepted_staff_notify' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'quote_reminder' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'quote_viewed_followup' AND NOT (optional_variables ? 'last_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"last_name"'::jsonb, updated_at = now()
  WHERE slug = 'staff_notification' AND NOT (optional_variables ? 'last_name');

-- ── vehicle_description (12 slugs) ────────────────────────────────────────
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'addon_approved' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'addon_declined' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'appointment_cancelled' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'appointment_confirmed' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'booking_confirmed' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'booking_reminder' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'booking_staff_notify' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'quote_accepted_single' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'quote_accepted_staff_notify' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'quote_reminder' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'quote_viewed_followup' AND NOT (optional_variables ? 'vehicle_description');
UPDATE sms_templates SET optional_variables = optional_variables || '"vehicle_description"'::jsonb, updated_at = now()
  WHERE slug = 'staff_notification' AND NOT (optional_variables ? 'vehicle_description');

-- ── first_name (4 slugs — only where currently absent) ────────────────────
UPDATE sms_templates SET optional_variables = optional_variables || '"first_name"'::jsonb, updated_at = now()
  WHERE slug = 'addon_approved' AND NOT (optional_variables ? 'first_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"first_name"'::jsonb, updated_at = now()
  WHERE slug = 'addon_declined' AND NOT (optional_variables ? 'first_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"first_name"'::jsonb, updated_at = now()
  WHERE slug = 'booking_confirmed' AND NOT (optional_variables ? 'first_name');
UPDATE sms_templates SET optional_variables = optional_variables || '"first_name"'::jsonb, updated_at = now()
  WHERE slug = 'booking_reminder' AND NOT (optional_variables ? 'first_name');

-- ── customer_email (4 slugs) ──────────────────────────────────────────────
UPDATE sms_templates SET optional_variables = optional_variables || '"customer_email"'::jsonb, updated_at = now()
  WHERE slug = 'booking_staff_notify' AND NOT (optional_variables ? 'customer_email');
UPDATE sms_templates SET optional_variables = optional_variables || '"customer_email"'::jsonb, updated_at = now()
  WHERE slug = 'detailer_job_assigned' AND NOT (optional_variables ? 'customer_email');
UPDATE sms_templates SET optional_variables = optional_variables || '"customer_email"'::jsonb, updated_at = now()
  WHERE slug = 'quote_accepted_staff_notify' AND NOT (optional_variables ? 'customer_email');
UPDATE sms_templates SET optional_variables = optional_variables || '"customer_email"'::jsonb, updated_at = now()
  WHERE slug = 'staff_notification' AND NOT (optional_variables ? 'customer_email');

-- ── customer_phone (2 slugs) ──────────────────────────────────────────────
UPDATE sms_templates SET optional_variables = optional_variables || '"customer_phone"'::jsonb, updated_at = now()
  WHERE slug = 'booking_staff_notify' AND NOT (optional_variables ? 'customer_phone');
UPDATE sms_templates SET optional_variables = optional_variables || '"customer_phone"'::jsonb, updated_at = now()
  WHERE slug = 'detailer_job_assigned' AND NOT (optional_variables ? 'customer_phone');

-- ============================================================================
-- Section B: Legacy `variables` JSONB clean rebuild (18 slugs)
-- Required-first alphabetical, then optional alphabetical. Descriptions
-- sourced from sms-contracts.source.ts. Replaces existing array entirely.
-- ============================================================================

UPDATE sms_templates SET variables = '[
  {"key":"service_name","description":"Single service name","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'addon_approved';

UPDATE sms_templates SET variables = '[
  {"key":"service_name","description":"Single service name","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'addon_declined';

UPDATE sms_templates SET variables = '[
  {"key":"business_name","description":"Business name","required":true},
  {"key":"business_phone","description":"Business phone number","required":true},
  {"key":"appointment_date","description":"Appointment date","required":false},
  {"key":"appointment_time","description":"Appointment time","required":false},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"services","description":"Comma-joined list of service names","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'appointment_cancelled';

UPDATE sms_templates SET variables = '[
  {"key":"appointment_date","description":"Appointment date","required":true},
  {"key":"appointment_time","description":"Appointment time","required":true},
  {"key":"business_name","description":"Business name","required":true},
  {"key":"business_phone","description":"Business phone number","required":true},
  {"key":"service_name","description":"Single service name","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"service_total","description":"Service / appointment total amount","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'appointment_confirmed';

UPDATE sms_templates SET variables = '[
  {"key":"business_name","description":"Business name","required":true},
  {"key":"business_phone","description":"Business phone number","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'appointment_confirmed_postcall';

UPDATE sms_templates SET variables = '[
  {"key":"appointment_date","description":"Appointment date","required":true},
  {"key":"appointment_time","description":"Appointment time","required":true},
  {"key":"business_name","description":"Business name","required":true},
  {"key":"business_phone","description":"Business phone number","required":true},
  {"key":"service_total","description":"Service / appointment total amount","required":true},
  {"key":"services","description":"Comma-joined list of service names","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'booking_confirmed';

UPDATE sms_templates SET variables = '[
  {"key":"appointment_time","description":"Appointment time","required":true},
  {"key":"business_name","description":"Business name","required":true},
  {"key":"business_phone","description":"Business phone number","required":true},
  {"key":"service_name","description":"Single service name","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'booking_reminder';

UPDATE sms_templates SET variables = '[
  {"key":"appointment_date","description":"Appointment date","required":true},
  {"key":"appointment_time","description":"Appointment time","required":true},
  {"key":"customer_name","description":"Customer full name","required":true},
  {"key":"deposit_info","description":"Composite: short deposit status for staff prose","required":true},
  {"key":"services","description":"Comma-joined list of service names","required":true},
  {"key":"customer_email","description":"Customer email address","required":false},
  {"key":"customer_phone","description":"Customer phone (formatted)","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'booking_staff_notify';

UPDATE sms_templates SET variables = '[
  {"key":"appointment_date","description":"Appointment date","required":true},
  {"key":"appointment_time","description":"Appointment time","required":true},
  {"key":"job_summary","description":"Composite: services and optional vehicle, dash-joined","required":true},
  {"key":"service_total","description":"Service / appointment total amount","required":true},
  {"key":"customer_email","description":"Customer email address","required":false},
  {"key":"customer_phone","description":"Customer phone (formatted)","required":false},
  {"key":"detailer_first_name","description":"Assigned detailer''s first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"mobile_service_address","description":"Mobile service address (where the detailer goes)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'detailer_job_assigned';

UPDATE sms_templates SET variables = '[
  {"key":"business_address","description":"Business address","required":true},
  {"key":"business_name","description":"Business name","required":true},
  {"key":"business_phone","description":"Business phone number","required":true},
  {"key":"gallery_link","description":"Photo gallery link for this job","required":true},
  {"key":"hours_line","description":"Composite: business hours prose (today-only OR full-week, varies by caller)","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'job_complete';

UPDATE sms_templates SET variables = '[
  {"key":"booking_link","description":"Booking page URL","required":true},
  {"key":"business_name","description":"Business name","required":true},
  {"key":"loyalty_cash_value","description":"Cash equivalent of loyalty points","required":true},
  {"key":"loyalty_points_balance","description":"Customer loyalty points balance","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'loyalty_milestone';

UPDATE sms_templates SET variables = '[
  {"key":"business_name","description":"Business name","required":true},
  {"key":"receipt_link","description":"Customer-facing receipt URL","required":true},
  {"key":"transaction_greeting","description":"Composite: receipt prose for services-with-vehicle vs other","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'payment_receipt';

UPDATE sms_templates SET variables = '[
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'quote_accepted_multi';

UPDATE sms_templates SET variables = '[
  {"key":"item_name","description":"Single quote item name","required":true},
  {"key":"first_name","description":"Customer first name","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'quote_accepted_single';

UPDATE sms_templates SET variables = '[
  {"key":"customer_name","description":"Customer full name","required":true},
  {"key":"quote_number","description":"Quote number","required":true},
  {"key":"service_total","description":"Service / appointment total amount","required":true},
  {"key":"services","description":"Comma-joined list of service names","required":true},
  {"key":"customer_email","description":"Customer email address","required":false},
  {"key":"customer_phone","description":"Customer phone (formatted)","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'quote_accepted_staff_notify';

UPDATE sms_templates SET variables = '[
  {"key":"first_name","description":"Customer first name","required":true},
  {"key":"short_url","description":"Short link to a quote / page","required":true},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'quote_reminder';

UPDATE sms_templates SET variables = '[
  {"key":"first_name","description":"Customer first name","required":true},
  {"key":"short_url","description":"Short link to a quote / page","required":true},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'quote_viewed_followup';

UPDATE sms_templates SET variables = '[
  {"key":"customer_name","description":"Customer full name","required":true},
  {"key":"customer_phone","description":"Customer phone (formatted)","required":true},
  {"key":"details","description":"Free-text details from agent","required":true},
  {"key":"reason_label","description":"Escalation reason (humanized)","required":true},
  {"key":"customer_email","description":"Customer email address","required":false},
  {"key":"last_name","description":"Customer last name","required":false},
  {"key":"vehicle_description","description":"Cleaned vehicle description (year/make/model)","required":false}
]'::jsonb, updated_at = now() WHERE slug = 'staff_notification';

COMMIT;
