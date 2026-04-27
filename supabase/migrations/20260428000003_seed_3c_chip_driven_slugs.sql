-- Session 3C — Third hardcoded slug migration. Two quote-delivery SMS slugs
-- migrated from hardcoded sendSms calls to chip-driven renderSmsTemplate.
-- After 3C, only 1 hardcoded slug remains (receipt_sms, scheduled for 3D).
--
--   quote_sms_admin    — was: hardcoded at src/lib/quotes/send-service.ts.
--                        Sent when a quote is delivered to the customer from
--                        the admin Quotes page; includes the quote PDF as an
--                        MMS attachment when isProductionUrl (excludes
--                        localhost/ngrok). PDF mediaUrl flow stays
--                        caller-side; no chip for the PDF URL itself.
--                        4-line body, 3 chips referenced.
--                        All chips REQUIRED (quote_number, total_amount,
--                        short_url): essential to message identity, value,
--                        and action. business_name auto-injected.
--
--   quote_sms_midcall  — was: hardcoded at
--                        src/app/api/voice-agent/send-quote-sms/route.ts.
--                        Sent mid-call when the voice agent generates a
--                        quote during a conversation with the customer.
--                        Single-line body, 3 chips. services + short_url
--                        REQUIRED; business_name auto-injected.
--                        `services` chip is composite-style (caller pre-
--                        builds comma-joined string from quoteItems).
--
-- Currency rendering convention (Path B, matches existing chip-driven
-- precedent in 4 slugs: appointment_confirmed, booking_confirmed,
-- quote_accepted_staff_notify, detailer_job_assigned). Caller passes the
-- formatted-with-$ string (e.g., "$175.00" via formatCurrency()); template
-- body has NO literal $ before the {total_amount} placeholder. This matches
-- the chip's documented sample ($329.45) and the established convention for
-- service_total/total_amount/etc. chips. (3B's `final_price` body uses a
-- literal-$ pattern with caller passing numeric "25.00" — internally
-- inconsistent with chip metadata but works correctly; deferred for cleanup
-- until SMS template editor has chip-format-aware UI.)
--
-- Both are recipient_type='customer', recipient_phones=NULL, category='quote'
-- (matches quote_accepted_*/quote_reminder/quote_viewed_followup/
-- quote_sms_postcall precedent). can_silence=true: silencing leaves email
-- channel intact for quote_sms_admin (admin can pick 'email' or 'both'
-- methods) and the postcall SMS as a follow-up for quote_sms_midcall.
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
  'quote_sms_admin',
  'Quote — Sent from Admin',
  'quote',
  E'Estimate {quote_number} from {business_name}\nTotal: {total_amount}\n\nView Your Estimate: {short_url}',
  E'Estimate {quote_number} from {business_name}\nTotal: {total_amount}\n\nView Your Estimate: {short_url}',
  '["quote_number","total_amount","short_url"]'::jsonb,
  '[]'::jsonb,
  true,
  true,
  'customer'
),
(
  'quote_sms_midcall',
  'Quote — Voice Agent Mid-Call',
  'quote',
  E'Here\'s your quote from {business_name} for {services}: {short_url}',
  E'Here\'s your quote from {business_name} for {services}: {short_url}',
  '["services","short_url"]'::jsonb,
  '[]'::jsonb,
  true,
  true,
  'customer'
)
ON CONFLICT (slug) DO NOTHING;
