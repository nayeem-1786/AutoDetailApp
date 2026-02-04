-- Migration: Add customer_type column, coupon target_customer_type, and enforcement setting
-- Phase 1 of POS Promotions Tab + Customer Type System

-- 1. Add customer_type column to customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type text
  CHECK (customer_type IN ('enthusiast', 'detailer'));

-- 2. Add target_customer_type column to coupons
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS target_customer_type text
  CHECK (target_customer_type IN ('enthusiast', 'detailer'));

-- 3. Seed coupon_type_enforcement business setting
INSERT INTO business_settings (key, value, description)
VALUES (
  'coupon_type_enforcement',
  '"soft"',
  'Controls how customer type restrictions on coupons are enforced. "soft" shows a warning but allows the coupon. "hard" blocks the coupon entirely.'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Backfill customer_type from tags (JSONB) array
-- Detailer wins if customer has both tags
UPDATE customers
SET customer_type = 'detailer'
WHERE tags @> '"detailer"'::jsonb
  AND customer_type IS NULL;

UPDATE customers
SET customer_type = 'enthusiast'
WHERE tags @> '"enthusiast"'::jsonb
  AND customer_type IS NULL
  AND (customer_type IS DISTINCT FROM 'detailer');

-- 5. Remove type tags from JSONB tags array after backfill
UPDATE customers
SET tags = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(tags) AS elem
  WHERE elem != '"detailer"'::jsonb AND elem != '"enthusiast"'::jsonb
)
WHERE tags @> '"detailer"'::jsonb OR tags @> '"enthusiast"'::jsonb;
