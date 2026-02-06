-- Add payment options and coupon tracking to appointments
-- Supports deposit vs pay-on-site booking flow

-- Add payment_type column for tracking how customer chose to pay
ALTER TABLE appointments ADD COLUMN payment_type TEXT
  CHECK (payment_type IN ('deposit', 'pay_on_site', 'full'));

-- Add deposit amount tracking (separate from total_amount)
ALTER TABLE appointments ADD COLUMN deposit_amount DECIMAL(10,2);

-- Add coupon tracking for bookings
ALTER TABLE appointments ADD COLUMN coupon_code TEXT;
ALTER TABLE appointments ADD COLUMN coupon_discount DECIMAL(10,2);

-- Comment the columns for documentation
COMMENT ON COLUMN appointments.payment_type IS 'Payment method selected at booking: deposit ($50), pay_on_site (existing customers only), or full';
COMMENT ON COLUMN appointments.deposit_amount IS 'Amount paid as deposit during online booking';
COMMENT ON COLUMN appointments.coupon_code IS 'Coupon code applied during booking';
COMMENT ON COLUMN appointments.coupon_discount IS 'Discount amount from applied coupon';
