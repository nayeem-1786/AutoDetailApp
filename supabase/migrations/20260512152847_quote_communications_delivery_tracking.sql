-- Phase Messaging-1+2: send pipeline overhaul + Twilio delivery tracking
--
-- Adds twilio_sid for JOIN to sms_delivery_log (delivery status via webhook).
-- Relaxes status CHECK to include 'blocked' (pre-flight failures: no email,
-- no phone, localhost SMS, template inactive). Drops sent_to NOT NULL so we
-- can record blocked attempts when the customer is missing contact info.

ALTER TABLE public.quote_communications
  ADD COLUMN IF NOT EXISTS twilio_sid TEXT;

CREATE INDEX IF NOT EXISTS idx_quote_communications_twilio_sid
  ON public.quote_communications USING btree (twilio_sid)
  WHERE twilio_sid IS NOT NULL;

ALTER TABLE public.quote_communications
  DROP CONSTRAINT IF EXISTS quote_communications_status_check;

ALTER TABLE public.quote_communications
  ADD CONSTRAINT quote_communications_status_check
  CHECK (status = ANY (ARRAY['sent'::text, 'failed'::text, 'blocked'::text]));

ALTER TABLE public.quote_communications
  ALTER COLUMN sent_to DROP NOT NULL;
