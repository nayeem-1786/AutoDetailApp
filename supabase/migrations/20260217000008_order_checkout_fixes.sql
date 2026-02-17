-- Fix: Allow order_number to be NULL (assigned after payment, not at checkout)
-- This prevents order number waste from abandoned checkouts.
ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL;

-- Add 'cancelled' to payment_status CHECK constraint (for abandoned order cleanup)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled'));
