-- Add shipping dimensions to products for accurate rate calculation
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS length DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS width DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS height DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS dimension_unit TEXT DEFAULT 'in';
