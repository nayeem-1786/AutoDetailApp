-- Add shipping-related columns to orders for label/tracking
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_carrier TEXT,
  ADD COLUMN IF NOT EXISTS shipping_service TEXT,
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS label_url TEXT,
  ADD COLUMN IF NOT EXISTS shippo_rate_id TEXT,
  ADD COLUMN IF NOT EXISTS shipping_label_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'US';
