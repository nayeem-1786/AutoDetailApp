-- Add coupon_id FK to lifecycle_rules, replacing inline coupon fields.
-- Existing coupon_type/coupon_value/coupon_expiry_days columns are kept for backward compat
-- but the form now uses coupon_id exclusively.

ALTER TABLE lifecycle_rules
ADD COLUMN coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL;

CREATE INDEX idx_lifecycle_rules_coupon_id ON lifecycle_rules (coupon_id) WHERE coupon_id IS NOT NULL;
