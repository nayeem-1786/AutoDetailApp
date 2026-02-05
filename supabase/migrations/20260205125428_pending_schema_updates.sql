-- Add coupon_code to transactions (for receipt display)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- Backfill existing transactions with coupon codes
UPDATE transactions t
SET coupon_code = c.code
FROM coupons c
WHERE t.coupon_id = c.id AND t.coupon_code IS NULL;

-- Add notification preferences to customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS notify_promotions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_loyalty BOOLEAN NOT NULL DEFAULT true;

-- Add deactivated_auth_user_id for portal access toggle
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deactivated_auth_user_id UUID;
