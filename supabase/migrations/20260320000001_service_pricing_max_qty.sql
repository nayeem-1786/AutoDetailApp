-- Add optional per-tier quantity cap and label to scope/specialty pricing
ALTER TABLE service_pricing ADD COLUMN max_qty INTEGER DEFAULT NULL;
ALTER TABLE service_pricing ADD COLUMN qty_label TEXT DEFAULT NULL;

-- max_qty: NULL = single quantity (qty 1 only, current behavior). 2+ = shows qty stepper in POS.
-- qty_label: Short unit label for display (e.g., "row", "panel"). NULL = falls back to tier_label.

COMMENT ON COLUMN service_pricing.max_qty IS 'Max quantity per tier. NULL or 1 = single qty (no stepper). 2+ = shows qty stepper in POS, capped at this value.';
COMMENT ON COLUMN service_pricing.qty_label IS 'Short unit label for qty display (e.g. row, panel). Falls back to tier_label if null.';

-- Set Hot Shampoo "Per Seat Row" to max 3, label "row"
UPDATE service_pricing
SET max_qty = 3, qty_label = 'row'
WHERE tier_name = 'per_row'
  AND service_id = (SELECT id FROM services WHERE name = 'Hot Shampoo Extraction');
