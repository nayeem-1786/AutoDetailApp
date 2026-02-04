-- Migration: Rename 'detailer' to 'professional' in customer_type and target_customer_type
-- Updates check constraints and existing data to use 'professional' instead of 'detailer'

-- 1. Drop existing check constraints (auto-named from ADD COLUMN IF NOT EXISTS)
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_type_check;
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_target_customer_type_check;

-- 2. Update existing data before adding new constraints
UPDATE customers SET customer_type = 'professional' WHERE customer_type = 'detailer';
UPDATE coupons SET target_customer_type = 'professional' WHERE target_customer_type = 'detailer';

-- 3. Re-add check constraints with updated values
ALTER TABLE customers
  ADD CONSTRAINT customers_customer_type_check
  CHECK (customer_type IN ('enthusiast', 'professional'));

ALTER TABLE coupons
  ADD CONSTRAINT coupons_target_customer_type_check
  CHECK (target_customer_type IN ('enthusiast', 'professional'));
