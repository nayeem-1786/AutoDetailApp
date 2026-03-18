-- Add loyalty point tracking columns to refunds table
ALTER TABLE refunds
  ADD COLUMN points_clawed_back INTEGER DEFAULT 0,
  ADD COLUMN points_restored INTEGER DEFAULT 0;

COMMENT ON COLUMN refunds.points_clawed_back IS 'Earned points reversed (customer loses these)';
COMMENT ON COLUMN refunds.points_restored IS 'Redeemed points given back (customer gets these)';
