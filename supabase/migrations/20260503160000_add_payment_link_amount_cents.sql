-- Pay-Link custom amount feature.
-- Stores the chargeable amount (in integer cents) for the *current* outstanding
-- payment link on an appointment. Reset to NULL by the webhook after a
-- successful payment, signalling "no link is currently active." NULL on a
-- live link means "use full remaining balance" (legacy/backward-compat for
-- any link sent before this column existed).
--
-- The 50-cent floor matches STRIPE_MIN_AMOUNT_CENTS in
-- src/app/api/pay/[token]/intent/route.ts — sending a sub-minimum link would
-- guarantee a Stripe rejection on the customer's pay page.

ALTER TABLE appointments
  ADD COLUMN payment_link_amount_cents INTEGER,
  ADD CONSTRAINT payment_link_amount_cents_check
    CHECK (payment_link_amount_cents IS NULL OR payment_link_amount_cents >= 50);
