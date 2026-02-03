-- Add 'draft' to coupon_status enum
ALTER TYPE coupon_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'active';
