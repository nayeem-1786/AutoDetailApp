CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_item_id TEXT UNIQUE,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  retail_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  reorder_threshold INTEGER,
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  is_loyalty_eligible BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  barcode TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_name ON products(name);
