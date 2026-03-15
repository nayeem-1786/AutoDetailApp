-- Add pos.override_prerequisites permission
INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES (
  'pos.override_prerequisites',
  'Override Service Prerequisites',
  'Add services even when prerequisites are not met',
  'POS Operations',
  113
)
ON CONFLICT (key) DO NOTHING;

-- Default role permissions: only super_admin can override
INSERT INTO permissions (permission_key, role, granted)
VALUES
  ('pos.override_prerequisites', 'super_admin', true),
  ('pos.override_prerequisites', 'admin', false),
  ('pos.override_prerequisites', 'cashier', false),
  ('pos.override_prerequisites', 'detailer', false)
ON CONFLICT (permission_key, role) DO NOTHING;
