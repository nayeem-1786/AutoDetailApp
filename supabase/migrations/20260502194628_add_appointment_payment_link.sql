-- Foundation for the "Send Payment Link" feature on appointments.
-- Adds three columns + a partial unique index on the link token.
-- Subsequent sessions wire the public pay page, send route, POS UI,
-- SMS/email templates, and confirmation send.

ALTER TABLE appointments
  ADD COLUMN payment_link_token TEXT,
  ADD COLUMN payment_link_sent_at TIMESTAMPTZ,
  ADD COLUMN payment_link_paid_at TIMESTAMPTZ;

CREATE UNIQUE INDEX appointments_payment_link_token_unique
  ON appointments (payment_link_token)
  WHERE payment_link_token IS NOT NULL;
