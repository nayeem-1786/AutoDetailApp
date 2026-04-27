-- Session 2F — Seed specialty sub-slugs to close the two @ts-expect-error
-- markers introduced in Sessions 2A/2C.
--
-- Two new chip-driven sms_templates rows mirror their parent slugs in category
-- and recipient_type but carry contracts that match the data each call site
-- actually has in scope:
--
--   booking_staff_notify_specialty       — fired by /api/public/specialty-callback
--                                          (parent: booking_staff_notify)
--   staff_notification_inbound_specialty — fired by /api/webhooks/twilio/inbound
--                                          when an inbound SMS comes from a
--                                          customer with an exotic/classic vehicle
--                                          (parent: staff_notification)
--
-- Both are recipient_type='staff' with recipient_phones=NULL (defaults to the
-- business phone). Operators can later set per-slug recipient phones via the
-- admin UI's recipient editor.
--
-- ON CONFLICT (slug) DO NOTHING makes this migration idempotent.

INSERT INTO sms_templates (
  slug,
  name,
  category,
  body_template,
  default_body,
  required_variables,
  optional_variables,
  is_active,
  can_silence,
  recipient_type
) VALUES
(
  'booking_staff_notify_specialty',
  'Staff: Specialty Vehicle Callback Request',
  'system',
  E'\U0001F514 Specialty vehicle callback request\n{customer_name} ({customer_phone})\nVehicle: {vehicle_description}\nType: {size_class}\nEmail: {customer_email}\nBest time: {preferred_time}\n\nFrom online booking.',
  E'\U0001F514 Specialty vehicle callback request\n{customer_name} ({customer_phone})\nVehicle: {vehicle_description}\nType: {size_class}\nEmail: {customer_email}\nBest time: {preferred_time}\n\nFrom online booking.',
  '["customer_name","customer_phone","vehicle_description"]'::jsonb,
  '["customer_email","size_class","preferred_time"]'::jsonb,
  true,
  true,
  'staff'
),
(
  'staff_notification_inbound_specialty',
  'Staff: Specialty Vehicle SMS Inquiry',
  'system',
  E'\U0001F514 Specialty vehicle SMS inquiry\n{customer_name} ({customer_phone})\nVehicle: {vehicle_description}\nType: {size_class}\nEmail: {customer_email}\nLast message: "{customer_message_excerpt}"\n\nRequires custom quote — please follow up.',
  E'\U0001F514 Specialty vehicle SMS inquiry\n{customer_name} ({customer_phone})\nVehicle: {vehicle_description}\nType: {size_class}\nEmail: {customer_email}\nLast message: "{customer_message_excerpt}"\n\nRequires custom quote — please follow up.',
  '["customer_name","customer_phone","vehicle_description"]'::jsonb,
  '["customer_email","size_class","customer_message_excerpt"]'::jsonb,
  true,
  true,
  'staff'
)
ON CONFLICT (slug) DO NOTHING;
