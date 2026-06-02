-- Session #139 — Quote-request SMS bundle: seed two new sms_templates rows
--
-- Pattern B (audit follow-on from #137/#138):
-- (1) booking_staff_notify_quote_request — staff template for the
--     staff_assessed_service request_type at /api/public/specialty-callback.
--     #137 generalized the route but left this template unseeded, which made
--     the staff-recipient fallback collapse to [biz.phone] = the business's
--     own Twilio number (self-send). Seeded with the SAME two staff phones
--     as booking_staff_notify_specialty so admin doesn't have to manually
--     reconcile two slugs on day one; operators can split routing later via
--     the admin UI without code changes.
--
-- (2) quote_request_received_customer — universal customer-acknowledgment
--     template fired for BOTH the specialty_vehicle and staff_assessed_service
--     variants (and forward-compatible with F2 RV/Boat/Aircraft). Explicit
--     behavior change: specialty_vehicle previously sent NO customer SMS;
--     after this seed + the route change in the same session, both variants
--     send a customer ack.
--
-- Both templates are idempotent via ON CONFLICT (slug) DO NOTHING — re-running
-- the migration is a no-op once seeded.
--
-- After this migration applies, regenerate the typed contracts:
--   npx tsx scripts/regen-sms-contracts.ts
-- (the source file src/lib/sms/sms-contracts.source.ts is hand-edited in the
-- same commit as this migration).

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
  recipient_type,
  recipient_phones
) VALUES
(
  'booking_staff_notify_quote_request',
  'Staff: Quote Request from Public Booking',
  'system',
  E'\U0001F514 Quote request from public booking\n{customer_name} ({customer_phone}) wants a quote for {service_name}.\nVehicle: {vehicle_description}\nEmail: {customer_email}\nBest time: {preferred_time}\n\nFrom online booking Step 2 (staff_assessed service).',
  E'\U0001F514 Quote request from public booking\n{customer_name} ({customer_phone}) wants a quote for {service_name}.\nVehicle: {vehicle_description}\nEmail: {customer_email}\nBest time: {preferred_time}\n\nFrom online booking Step 2 (staff_assessed service).',
  '["customer_name","customer_phone","service_name"]'::jsonb,
  '["vehicle_description","customer_email","preferred_time"]'::jsonb,
  true,
  true,
  'staff',
  -- Seed with the same two staff phones currently on
  -- booking_staff_notify_specialty. Operator can edit per-slug recipients
  -- in the admin SMS Templates UI without touching code.
  ARRAY['+14242370913', '+14243637450']
),
(
  'quote_request_received_customer',
  'Customer: Quote Request Received (Universal)',
  'quote',
  -- Universal customer-acknowledgment used across all quote-request flows.
  -- `request_subject` is variant-specific and resolved by the route:
  --   staff_assessed_service → service_name (e.g., "Ceramic Coating")
  --   specialty_vehicle      → "specialty vehicle"
  --   future F2 variants     → variant-defined
  E'Hi {first_name}, thanks for your {request_subject} request! We received your details and will reach out shortly. Questions? Call {business_phone}.',
  E'Hi {first_name}, thanks for your {request_subject} request! We received your details and will reach out shortly. Questions? Call {business_phone}.',
  '["first_name","request_subject"]'::jsonb,
  '["business_name","business_phone"]'::jsonb,
  true,
  true,
  'customer',
  -- Customer slug — recipient_phones is NULL because the recipient is the
  -- per-message customer phone passed by the route, not a fixed list.
  NULL
)
ON CONFLICT (slug) DO NOTHING;
