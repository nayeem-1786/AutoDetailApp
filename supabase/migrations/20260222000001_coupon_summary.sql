-- Add AI-generated summary to coupons
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS summary TEXT;
