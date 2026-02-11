-- Phase 6 Session 1: Inventory merge + view_cost_data permission + min order fields

-- Min order qty per product (how many units must be ordered minimum)
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_order_qty INT DEFAULT NULL;

-- Min order amount per vendor (dollar minimum for placing an order)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT NULL;

-- view_cost_data permission (super_admin and admin can see cost/margin by default)
INSERT INTO permissions (permission_key, role, granted) VALUES
  ('inventory.view_cost_data', 'super_admin', true),
  ('inventory.view_cost_data', 'admin', true),
  ('inventory.view_cost_data', 'cashier', false),
  ('inventory.view_cost_data', 'detailer', false)
ON CONFLICT DO NOTHING;
