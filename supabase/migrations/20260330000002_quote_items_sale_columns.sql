-- Add sale pricing columns to quote_items
-- Mirrors the transaction_items pattern: standard_price stores pre-sale price,
-- pricing_type indicates whether the item was priced at standard or sale rate.
-- unit_price remains the actual price charged (sale price if applicable).

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS standard_price DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT NULL;

COMMENT ON COLUMN quote_items.standard_price IS 'Original pre-sale price when item was quoted at a sale rate. NULL when no sale was active.';
COMMENT ON COLUMN quote_items.pricing_type IS 'Pricing context: standard, sale, combo. NULL for legacy items.';
