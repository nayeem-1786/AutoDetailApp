-- Add pricing provenance fields to transaction_items for sale/combo tracking
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS standard_price DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT 'standard';

-- Add comment for documentation
COMMENT ON COLUMN transaction_items.standard_price IS 'Catalog price before any sale/combo discount';
COMMENT ON COLUMN transaction_items.pricing_type IS 'standard, sale, or combo — tracks which pricing was applied';
