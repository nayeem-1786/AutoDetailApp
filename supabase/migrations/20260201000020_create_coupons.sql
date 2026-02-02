CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  type coupon_type NOT NULL,
  value DECIMAL(10,2) NOT NULL, -- dollar amount or percentage
  min_purchase DECIMAL(10,2),
  max_discount DECIMAL(10,2), -- cap for percentage coupons
  is_single_use BOOLEAN NOT NULL DEFAULT true,
  use_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER, -- NULL = unlimited (for multi-use)
  status coupon_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  campaign_id UUID, -- will reference campaigns table
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, -- if customer-specific
  free_item_id UUID, -- references service or product for free_addon/free_product type
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Now add the FK from transactions to coupons
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;

CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_status ON coupons(status);
CREATE INDEX idx_coupons_customer ON coupons(customer_id);
CREATE INDEX idx_coupons_campaign ON coupons(campaign_id);
