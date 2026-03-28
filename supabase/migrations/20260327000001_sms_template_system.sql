-- SMS Template System
-- Admin-editable SMS templates with per-template toggle, recipient routing, and variable definitions.

-- 1. Create sms_templates table
CREATE TABLE sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('booking', 'quote', 'transactional', 'reminder', 'system')),
  body_template TEXT NOT NULL,
  default_body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  can_silence BOOLEAN NOT NULL DEFAULT true,
  recipient_type TEXT NOT NULL DEFAULT 'customer' CHECK (recipient_type IN ('customer', 'staff', 'detailer')),
  recipient_phones TEXT[] DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sms_templates_slug ON sms_templates(slug);

-- Auto-update updated_at (reuse existing trigger function)
CREATE TRIGGER set_updated_at_sms_templates
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS enabled, no policies (server-only, service role access)
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- 2. Seed 15 templates
-- BOOKING category (4)
INSERT INTO sms_templates (slug, name, category, body_template, default_body, variables, is_active, can_silence, recipient_type) VALUES
(
  'appointment_confirmed',
  'Appointment Confirmed',
  'booking',
  E'{business_name} — Appointment Confirmed\n\nHi {first_name}, your appointment is scheduled:\n{service_name}\n{appointment_date} at {appointment_time}\nTotal: {service_total}\n\nQuestions? Call {business_phone}',
  E'{business_name} — Appointment Confirmed\n\nHi {first_name}, your appointment is scheduled:\n{service_name}\n{appointment_date} at {appointment_time}\nTotal: {service_total}\n\nQuestions? Call {business_phone}',
  '[{"key":"business_name","description":"Business name","required":true},{"key":"business_phone","description":"Business phone number","required":true},{"key":"appointment_date","description":"Appointment date (e.g. Monday, March 28, 2026)","required":true},{"key":"appointment_time","description":"Appointment time (e.g. 10:30 AM)","required":true},{"key":"service_name","description":"Service name","required":false},{"key":"first_name","description":"Customer first name","required":false},{"key":"service_total","description":"Service total amount","required":false}]'::jsonb,
  true,
  false,
  'customer'
),
(
  'appointment_confirmed_postcall',
  'Post-Call Confirmation',
  'booking',
  E'Thanks for calling {business_name}, {first_name}! Your appointment is confirmed. Questions? Call {business_phone}',
  E'Thanks for calling {business_name}, {first_name}! Your appointment is confirmed. Questions? Call {business_phone}',
  '[{"key":"business_name","description":"Business name","required":true},{"key":"business_phone","description":"Business phone number","required":true},{"key":"first_name","description":"Customer first name","required":false}]'::jsonb,
  true,
  false,
  'customer'
),
(
  'booking_confirmed',
  'Online Booking Confirmed',
  'booking',
  E'{business_name} — Booking Confirmed!\n\n{appointment_date}\n{appointment_time}\n{services}\nVehicle: {vehicle_description}\nTotal: {service_total}\n\nQuestions? Call {business_phone}',
  E'{business_name} — Booking Confirmed!\n\n{appointment_date}\n{appointment_time}\n{services}\nVehicle: {vehicle_description}\nTotal: {service_total}\n\nQuestions? Call {business_phone}',
  '[{"key":"business_name","description":"Business name","required":true},{"key":"business_phone","description":"Business phone number","required":true},{"key":"appointment_date","description":"Appointment date","required":true},{"key":"appointment_time","description":"Appointment time","required":true},{"key":"services","description":"Comma-separated service names","required":true},{"key":"vehicle_description","description":"Vehicle year/make/model","required":false},{"key":"service_total","description":"Total amount","required":true}]'::jsonb,
  true,
  false,
  'customer'
),
(
  'appointment_cancelled',
  'Appointment Cancelled',
  'booking',
  E'Hi {first_name}, your {services} appointment on {appointment_date} at {appointment_time} has been cancelled. Please contact us to reschedule. - {business_name} {business_phone}',
  E'Hi {first_name}, your {services} appointment on {appointment_date} at {appointment_time} has been cancelled. Please contact us to reschedule. - {business_name} {business_phone}',
  '[{"key":"first_name","description":"Customer first name","required":true},{"key":"services","description":"Service names","required":true},{"key":"appointment_date","description":"Appointment date","required":true},{"key":"appointment_time","description":"Appointment time","required":true},{"key":"business_name","description":"Business name","required":true},{"key":"business_phone","description":"Business phone number","required":true}]'::jsonb,
  true,
  false,
  'customer'
);

-- QUOTE category (3)
INSERT INTO sms_templates (slug, name, category, body_template, default_body, variables, is_active, can_silence, recipient_type) VALUES
(
  'quote_accepted_single',
  'Quote Accepted (Single Item)',
  'quote',
  E'Thanks {first_name}! Your quote for {item_name} has been accepted. Our team will reach out shortly to schedule your appointment.',
  E'Thanks {first_name}! Your quote for {item_name} has been accepted. Our team will reach out shortly to schedule your appointment.',
  '[{"key":"first_name","description":"Customer first name","required":true},{"key":"item_name","description":"Service/item name","required":true}]'::jsonb,
  true,
  false,
  'customer'
),
(
  'quote_accepted_multi',
  'Quote Accepted (Multiple Items)',
  'quote',
  E'Thanks {first_name}! Your quote has been accepted. Our team will reach out shortly to schedule.',
  E'Thanks {first_name}! Your quote has been accepted. Our team will reach out shortly to schedule.',
  '[{"key":"first_name","description":"Customer first name","required":true}]'::jsonb,
  true,
  false,
  'customer'
),
(
  'quote_accepted_staff_notify',
  'Staff: Quote Accepted',
  'system',
  E'Quote accepted! {customer_name} — Q-{quote_number} for {service_total}. Services: {services}. Schedule in POS.',
  E'Quote accepted! {customer_name} — Q-{quote_number} for {service_total}. Services: {services}. Schedule in POS.',
  '[{"key":"customer_name","description":"Customer full name","required":true},{"key":"quote_number","description":"Quote number","required":true},{"key":"service_total","description":"Quote total amount","required":true},{"key":"services","description":"Service names","required":true}]'::jsonb,
  true,
  true,
  'staff'
);

-- REMINDER category (3)
INSERT INTO sms_templates (slug, name, category, body_template, default_body, variables, is_active, can_silence, recipient_type) VALUES
(
  'booking_reminder',
  'Booking Reminder',
  'reminder',
  E'Reminder: Your {service_name} appointment at {business_name} is tomorrow at {appointment_time}. Need to reschedule? Call us at {business_phone}',
  E'Reminder: Your {service_name} appointment at {business_name} is tomorrow at {appointment_time}. Need to reschedule? Call us at {business_phone}',
  '[{"key":"service_name","description":"Primary service name","required":true},{"key":"business_name","description":"Business name","required":true},{"key":"appointment_time","description":"Appointment time","required":true},{"key":"business_phone","description":"Business phone number","required":true}]'::jsonb,
  true,
  true,
  'customer'
),
(
  'quote_reminder',
  'Quote Reminder (Unviewed)',
  'reminder',
  E'Hey {first_name}! Just checking if you had a chance to look at your quote: {short_url}',
  E'Hey {first_name}! Just checking if you had a chance to look at your quote: {short_url}',
  '[{"key":"first_name","description":"Customer first name","required":true},{"key":"short_url","description":"Short link to quote","required":true}]'::jsonb,
  true,
  true,
  'customer'
),
(
  'quote_viewed_followup',
  'Quote Follow-Up (Viewed)',
  'reminder',
  E'Hi {first_name}! You checked out your estimate — ready to book? Any questions, just reply here or call us. {short_url}',
  E'Hi {first_name}! You checked out your estimate — ready to book? Any questions, just reply here or call us. {short_url}',
  '[{"key":"first_name","description":"Customer first name","required":true},{"key":"short_url","description":"Short link to quote","required":true}]'::jsonb,
  true,
  true,
  'customer'
);

-- TRANSACTIONAL category (3)
INSERT INTO sms_templates (slug, name, category, body_template, default_body, variables, is_active, can_silence, recipient_type) VALUES
(
  'job_complete',
  'Job Complete',
  'transactional',
  E'Hi {first_name}, your {vehicle_description} is looking great and ready for pickup! 🎉\nView your before & after photos: {gallery_link}\n{business_name}\n{business_address}\n{business_phone}\n{hours_line}',
  E'Hi {first_name}, your {vehicle_description} is looking great and ready for pickup! 🎉\nView your before & after photos: {gallery_link}\n{business_name}\n{business_address}\n{business_phone}\n{hours_line}',
  '[{"key":"first_name","description":"Customer first name","required":true},{"key":"vehicle_description","description":"Vehicle make/model","required":true},{"key":"gallery_link","description":"Photo gallery link","required":true},{"key":"business_name","description":"Business name","required":true},{"key":"business_address","description":"Business address","required":false},{"key":"business_phone","description":"Business phone number","required":false},{"key":"hours_line","description":"Today''s business hours","required":false}]'::jsonb,
  true,
  false,
  'customer'
),
(
  'addon_approved',
  'Add-on Approved',
  'transactional',
  E'Great! Your add-on ({service_name}) has been approved. We''ll get started right away!',
  E'Great! Your add-on ({service_name}) has been approved. We''ll get started right away!',
  '[{"key":"service_name","description":"Add-on service/product name","required":true}]'::jsonb,
  true,
  true,
  'customer'
),
(
  'addon_declined',
  'Add-on Declined',
  'transactional',
  E'No problem! We''ve noted {service_name} as a recommendation for your next visit.',
  E'No problem! We''ve noted {service_name} as a recommendation for your next visit.',
  '[{"key":"service_name","description":"Add-on service/product name","required":true}]'::jsonb,
  true,
  true,
  'customer'
);

-- SYSTEM category (2)
INSERT INTO sms_templates (slug, name, category, body_template, default_body, variables, is_active, can_silence, recipient_type) VALUES
(
  'booking_staff_notify',
  'Staff: New Booking',
  'system',
  E'New online booking! {customer_name} — {services} on {appointment_date} at {appointment_time}. {deposit_info}',
  E'New online booking! {customer_name} — {services} on {appointment_date} at {appointment_time}. {deposit_info}',
  '[{"key":"customer_name","description":"Customer full name","required":true},{"key":"services","description":"Service names","required":true},{"key":"appointment_date","description":"Appointment date","required":true},{"key":"appointment_time","description":"Appointment time","required":true},{"key":"deposit_info","description":"Deposit status (e.g. Deposit paid. or Pay on site.)","required":true}]'::jsonb,
  true,
  true,
  'staff'
),
(
  'detailer_job_assigned',
  'Detailer Job Assignment',
  'system',
  E'New job assigned: {services} – {vehicle_description}\n{appointment_date} at {appointment_time}\n{address}\nTotal: {service_total}',
  E'New job assigned: {services} – {vehicle_description}\n{appointment_date} at {appointment_time}\n{address}\nTotal: {service_total}',
  '[{"key":"services","description":"Service names","required":true},{"key":"vehicle_description","description":"Vehicle year/make/model","required":false},{"key":"appointment_date","description":"Appointment date","required":true},{"key":"appointment_time","description":"Appointment time","required":true},{"key":"address","description":"Mobile service address","required":false},{"key":"service_total","description":"Total amount","required":false}]'::jsonb,
  true,
  true,
  'detailer'
);
