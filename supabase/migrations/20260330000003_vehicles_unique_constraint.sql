-- Prevent duplicate vehicles for the same customer.
-- Dedup key: customer_id + LOWER(make) + LOWER(model) + vehicle_category
-- Only applies when make and model are non-null (incomplete vehicles are excluded).
-- Run the duplicate cleanup SQL BEFORE this migration or it will fail.

CREATE UNIQUE INDEX idx_vehicles_customer_make_model
ON vehicles (customer_id, LOWER(make), LOWER(model), vehicle_category)
WHERE make IS NOT NULL AND model IS NOT NULL;
