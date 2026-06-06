-- Session 1.8 — Waitlist notification silent-drop fix: seed
-- `waitlist_slot_available` SMS template.
--
-- Surfaced by webhook receivers identity audit (f5e714a8) — Target D.4 found
-- that `src/app/api/appointments/[id]/cancel/route.ts:147-158` was the ONLY
-- location where `fireWebhook` was the SOLE dispatch channel for a customer-
-- facing notification. With no n8n receiver wired in prod, waitlisted customers
-- were marked `notified` in `waitlist_entries.status` but received NO SMS.
--
-- Companion code change (same commit) in the cancel route replaces the dead
-- webhook with a direct `sendSms` dispatch loop that renders this template.
-- The webhook fire is kept alongside the direct dispatch for forward-compat
-- if/when an external receiver is wired (per Session 1.8 prompt + lifecycle
-- architecture doc).
--
-- can_silence=false matches the existing `booking` category transactional
-- customer alerts (booking_confirmed, appointment_cancelled). Waitlist is
-- opt-in — the customer voluntarily joined the waitlist and expects this
-- notification, so the operator should not be able to silently disable it.
--
-- Idempotent via ON CONFLICT (slug) DO NOTHING — re-running is a no-op once
-- seeded.
--
-- After this migration applies, regenerate the typed contracts:
--   npx tsx scripts/regen-sms-contracts.ts
-- The source file src/lib/sms/sms-contracts.source.ts is hand-edited in the
-- same commit as this migration; the two generated files are codegen output.

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
) VALUES (
  'waitlist_slot_available',
  'Customer: Waitlist Slot Available',
  'booking',
  E'Hi {first_name}, good news — a spot just opened for {service_name} on {appointment_date}! Reply or call {business_phone} to book. - {business_name}',
  E'Hi {first_name}, good news — a spot just opened for {service_name} on {appointment_date}! Reply or call {business_phone} to book. - {business_name}',
  '["service_name","appointment_date"]'::jsonb,
  '["first_name","last_name","business_name","business_phone"]'::jsonb,
  true,
  false,
  'customer',
  -- Customer slug — recipient_phones is NULL because the recipient is the
  -- per-message customer phone passed by the route, not a fixed list.
  NULL
)
ON CONFLICT (slug) DO NOTHING;
