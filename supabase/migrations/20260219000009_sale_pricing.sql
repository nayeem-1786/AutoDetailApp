-- Sale pricing: per-tier sale prices on service_pricing, shared date range on services,
-- single sale price + dates on products, coupon combinability flag.

-- ========== SERVICE PRICING: sale_price per tier ==========
ALTER TABLE service_pricing
  ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2) DEFAULT NULL;

-- Constraint: sale_price must be less than standard price
ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_sale_price
  CHECK (sale_price IS NULL OR sale_price < price);

-- ========== SERVICES: shared sale date range ==========
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ DEFAULT NULL;

-- ========== PRODUCTS: sale price + date range ==========
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE products
  ADD CONSTRAINT chk_product_sale_price
  CHECK (sale_price IS NULL OR sale_price < retail_price);

-- ========== COUPONS: combinable_with_sales flag ==========
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS combinable_with_sales BOOLEAN NOT NULL DEFAULT true;
