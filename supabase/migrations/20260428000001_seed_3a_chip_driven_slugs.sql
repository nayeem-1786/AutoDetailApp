-- Session 3A — First hardcoded slug migration. Two new chip-driven sms_templates
-- rows seeded; corresponding hardcoded sendSms callsites switched to
-- renderSmsTemplate in the same session.
--
--   addon_authorization_expired — was: hardcoded at
--                                 src/app/api/webhooks/twilio/inbound/route.ts
--                                 (the two expiry-reply sites).
--                                 Zero chips. Static body.
--
--   quote_sms_postcall          — was: hardcoded at
--                                 src/lib/services/voice-post-call.ts:647
--                                 (post-call SMS when voice agent generates a
--                                 quote during a call). Mirrors the
--                                 appointment_confirmed_postcall precedent:
--                                 first_name is optional with REMOVE_LINE
--                                 semantics; when missing, line strips and the
--                                 caller's fallback (which uses
--                                 buildFirstNameGreeting) renders cleanly.
--                                 short_url is the only required chip.
--                                 last_name + vehicle_description are
--                                 cheap-adds (already in caller scope post-2B,
--                                 not referenced by today's body, available to
--                                 operators via admin UI without further
--                                 engineering).
--
-- Both are recipient_type='customer' with recipient_phones=NULL (sent to the
-- per-customer phone via caller data). business_name auto-injected by engine
-- — not listed in either contract.
--
-- Categories follow precedent:
--   addon_approved/addon_declined → 'transactional' → addon_authorization_expired
--   quote_accepted_*/quote_reminder → 'quote'        → quote_sms_postcall
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
  'addon_authorization_expired',
  'Add-on Authorization Expired',
  'transactional',
  E'That authorization has expired. Would you like us to send a new one?',
  E'That authorization has expired. Would you like us to send a new one?',
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  true,
  'customer'
),
(
  'quote_sms_postcall',
  'Quote — Voice Agent Post-Call',
  'quote',
  E'Thanks for calling {business_name}, {first_name}! Here\'s a quote for what we discussed: {short_url}',
  E'Thanks for calling {business_name}, {first_name}! Here\'s a quote for what we discussed: {short_url}',
  '["short_url"]'::jsonb,
  '["first_name","last_name","vehicle_description"]'::jsonb,
  true,
  true,
  'customer'
)
ON CONFLICT (slug) DO NOTHING;
