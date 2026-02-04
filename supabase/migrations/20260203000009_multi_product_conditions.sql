-- Migration: Convert singular coupon condition columns to arrays
-- This allows coupons to require ANY ONE of multiple products/services/categories (OR within each array)

-- Step 1: Add new array columns
ALTER TABLE coupons ADD COLUMN requires_product_ids UUID[];
ALTER TABLE coupons ADD COLUMN requires_service_ids UUID[];
ALTER TABLE coupons ADD COLUMN requires_product_category_ids UUID[];
ALTER TABLE coupons ADD COLUMN requires_service_category_ids UUID[];

-- Step 2: Migrate existing data from singular columns to arrays
UPDATE coupons SET requires_product_ids = ARRAY[requires_product_id]
  WHERE requires_product_id IS NOT NULL;
UPDATE coupons SET requires_service_ids = ARRAY[requires_service_id]
  WHERE requires_service_id IS NOT NULL;
UPDATE coupons SET requires_product_category_ids = ARRAY[requires_product_category_id]
  WHERE requires_product_category_id IS NOT NULL;
UPDATE coupons SET requires_service_category_ids = ARRAY[requires_service_category_id]
  WHERE requires_service_category_id IS NOT NULL;

-- Step 3: Drop old singular columns
ALTER TABLE coupons DROP COLUMN IF EXISTS requires_product_id;
ALTER TABLE coupons DROP COLUMN IF EXISTS requires_service_id;
ALTER TABLE coupons DROP COLUMN IF EXISTS requires_product_category_id;
ALTER TABLE coupons DROP COLUMN IF EXISTS requires_service_category_id;

-- Step 4: Add GIN indexes for efficient array queries
CREATE INDEX IF NOT EXISTS idx_coupons_requires_product_ids
  ON coupons USING gin(requires_product_ids) WHERE requires_product_ids IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_requires_service_ids
  ON coupons USING gin(requires_service_ids) WHERE requires_service_ids IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_requires_product_category_ids
  ON coupons USING gin(requires_product_category_ids) WHERE requires_product_category_ids IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_requires_service_category_ids
  ON coupons USING gin(requires_service_category_ids) WHERE requires_service_category_ids IS NOT NULL;
