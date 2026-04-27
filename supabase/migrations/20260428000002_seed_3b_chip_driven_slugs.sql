-- Session 3B — Second hardcoded slug migration. Two POS-driven addon
-- authorization slugs migrated from hardcoded sendSms calls to chip-driven
-- renderSmsTemplate. Caller continues to generate the random-UUID
-- authorization token (crypto.randomUUID() — palette description says
-- "HMAC-token-bearing" but actual implementation is random-UUID validated
-- by DB lookup; functionally equivalent, palette correction deferred).
--
--   addon_authorization        — was: hardcoded at
--                                src/app/api/pos/jobs/[id]/addons/route.ts.
--                                Sent to customer when detailer identifies
--                                additional work and proposes an addon with
--                                pricing + authorize URL.
--                                5-line body, 7 chips referenced.
--                                first_name OPTIONAL: rare empty case strips
--                                line 1 (loses vehicle_description +
--                                issue_text from output) but lines 2-5 still
--                                render (offer + URL + signature actionable);
--                                hard-skip alternative would mean "no SMS
--                                sent," operationally worse.
--                                detailer_name OPTIONAL: signature-only.
--                                business_name auto-injected.
--
--   addon_authorization_resend — was: hardcoded at
--                                src/app/api/pos/jobs/[id]/addons/[addonId]/
--                                resend/route.ts. Sent when staff resends an
--                                authorization request, optionally with an
--                                attached photo (MMS via mediaUrl, stays
--                                caller-side; no chip for MMS URL).
--                                Composite-chip {message_to_customer} carries
--                                operator-typed prose verbatim.
--                                When operator left blank on the original
--                                addon, today's body literally said "null" at
--                                the top (JS template-literal coercion of
--                                NULL); REMOVE_LINE on optional+missing fixes
--                                this incidentally.
--
-- Both are recipient_type='customer' with recipient_phones=NULL. category=
-- 'transactional' matches addon_approved/addon_declined/addon_authorization_
-- expired precedent. can_silence=true (silencing the SMS still leaves the
-- email channel intact, so workflow not broken).
--
-- final_price chip: body uses literal "$" before the placeholder
-- ("$${final_price}"). Caller passes numeric "XX.XX" without the dollar
-- sign; the literal "$" in the template provides the prefix. Cleaner pattern
-- that lets the chip's format: 'currency' palette metadata carry semantic
-- meaning, consistent with future currency formatting work.
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
  'addon_authorization',
  'Add-on Authorization Request',
  'transactional',
  E'Hi {first_name}, while working on your {vehicle_description} we noticed {issue_text}.\nWe recommend {friendly_name} for an additional ${final_price} — shall we go ahead?\nView pictures and approve or decline here: {authorize_url}\n{detailer_name}\n{business_name}',
  E'Hi {first_name}, while working on your {vehicle_description} we noticed {issue_text}.\nWe recommend {friendly_name} for an additional ${final_price} — shall we go ahead?\nView pictures and approve or decline here: {authorize_url}\n{detailer_name}\n{business_name}',
  '["vehicle_description","issue_text","friendly_name","final_price","authorize_url"]'::jsonb,
  '["first_name","detailer_name"]'::jsonb,
  true,
  true,
  'customer'
),
(
  'addon_authorization_resend',
  'Add-on Authorization Resend',
  'transactional',
  E'{message_to_customer}\n\nApprove or decline here: {authorize_url}\n\n— {business_name}',
  E'{message_to_customer}\n\nApprove or decline here: {authorize_url}\n\n— {business_name}',
  '["authorize_url"]'::jsonb,
  '["message_to_customer"]'::jsonb,
  true,
  true,
  'customer'
)
ON CONFLICT (slug) DO NOTHING;
