-- Add is_addon flag to transaction_items
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS is_addon BOOLEAN DEFAULT false;

-- Backfill: items with pricing_type='combo' are likely add-ons
UPDATE transaction_items SET is_addon = true WHERE pricing_type = 'combo';
