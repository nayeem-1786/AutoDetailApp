-- Add sale_price to services table for flat/per_unit pricing models
-- Tiered models (vehicle_size, scope, specialty) use service_pricing.sale_price instead
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2) DEFAULT NULL;

-- Looser constraint than products.sale_price (which enforces sale_price < retail_price)
-- because the "base price" varies by pricing model (flat_price vs per_unit_price).
-- Cross-column CHECK would be fragile. Validation at the application layer instead.
ALTER TABLE services
  ADD CONSTRAINT services_sale_price_non_negative
  CHECK (sale_price IS NULL OR sale_price >= 0);
