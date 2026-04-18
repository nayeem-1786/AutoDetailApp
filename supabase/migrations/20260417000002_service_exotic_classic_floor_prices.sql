-- Session 27: Add exotic/classic floor price columns to services table
--
-- These are optional suggested starting prices for the POS custom pricing modal.
-- When a staff member adds a service to an exotic/classic vehicle ticket,
-- the modal pre-fills with these values if set. NULL means no suggestion.

ALTER TABLE services ADD COLUMN exotic_floor_price NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE services ADD COLUMN classic_floor_price NUMERIC(10,2) DEFAULT NULL;
