-- =============================================================================
-- Coupon System v2: IF/THEN model with separate rewards table
-- Replaces the old type-based coupon model (flat/percentage/free_addon/free_product)
-- =============================================================================

-- 1. Create coupon_rewards table (the THEN — what discount the customer gets)
CREATE TABLE coupon_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('order', 'product', 'service')),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'flat', 'free')),
  discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(10,2),
  target_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  target_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  target_product_category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  target_service_category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupon_rewards_coupon ON coupon_rewards(coupon_id);

-- 2. Migrate existing coupon data into coupon_rewards
--    Each existing coupon gets one reward row based on its type/value
INSERT INTO coupon_rewards (coupon_id, applies_to, discount_type, discount_value, max_discount, target_product_id, target_service_id)
SELECT
  id,
  CASE type
    WHEN 'free_product' THEN 'product'
    WHEN 'free_addon' THEN 'service'
    ELSE 'order'
  END,
  CASE type
    WHEN 'flat' THEN 'flat'
    WHEN 'percentage' THEN 'percentage'
    WHEN 'free_addon' THEN 'free'
    WHEN 'free_product' THEN 'free'
  END,
  COALESCE(value, 0),
  max_discount,
  CASE WHEN type = 'free_product' THEN free_item_id ELSE NULL END,
  CASE WHEN type = 'free_addon' THEN free_item_id ELSE NULL END
FROM coupons;

-- 3. Add new columns to coupons table (WHO + IF)
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE coupons ADD COLUMN auto_apply BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coupons ADD COLUMN customer_tags TEXT[];
ALTER TABLE coupons ADD COLUMN tag_match_mode TEXT NOT NULL DEFAULT 'any' CHECK (tag_match_mode IN ('any', 'all'));
ALTER TABLE coupons ADD COLUMN condition_logic TEXT NOT NULL DEFAULT 'and' CHECK (condition_logic IN ('and', 'or'));
ALTER TABLE coupons ADD COLUMN requires_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE coupons ADD COLUMN requires_service_id UUID REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE coupons ADD COLUMN requires_product_category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;
ALTER TABLE coupons ADD COLUMN requires_service_category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL;

-- 4. Drop old columns that moved to coupon_rewards or are no longer needed
ALTER TABLE coupons DROP COLUMN IF EXISTS type;
ALTER TABLE coupons DROP COLUMN IF EXISTS value;
ALTER TABLE coupons DROP COLUMN IF EXISTS max_discount;
ALTER TABLE coupons DROP COLUMN IF EXISTS free_item_id;
ALTER TABLE coupons DROP COLUMN IF EXISTS free_item_type;

-- 5. Handle lifecycle_rules.coupon_type — change from enum to TEXT for flexibility
ALTER TABLE lifecycle_rules ALTER COLUMN coupon_type TYPE TEXT USING coupon_type::TEXT;

-- 6. Drop the old coupon_type enum (no longer used anywhere)
DROP TYPE IF EXISTS coupon_type;

-- 7. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_coupons_name ON coupons(name) WHERE name IS NOT NULL;
CREATE INDEX idx_coupons_auto_apply ON coupons(auto_apply) WHERE auto_apply = true;
CREATE INDEX idx_coupons_customer_tags ON coupons USING gin(customer_tags) WHERE customer_tags IS NOT NULL;
