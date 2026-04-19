-- Session 28: Drop dead exotic/classic floor price columns from services
-- These were added in Session 27 but the correct pattern is service_pricing rows.
-- No data loss — columns were never populated in production.

ALTER TABLE services DROP COLUMN IF EXISTS exotic_floor_price;
ALTER TABLE services DROP COLUMN IF EXISTS classic_floor_price;
