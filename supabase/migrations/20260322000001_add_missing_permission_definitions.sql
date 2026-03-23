-- Add missing permission_definitions rows for keys that are enforced in code
-- but were never added to the permission_definitions table.
-- Also seeds role default permissions for these keys.

-- 1. customers.merge
INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES (
  'customers.merge',
  'Merge Customers',
  'Merge duplicate customer records into one',
  'Customer Management',
  208
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT 'customers.merge', r.name::user_role, r.id,
  CASE WHEN r.name = 'super_admin' THEN true ELSE false END
FROM roles r
WHERE r.name IN ('super_admin', 'admin', 'cashier', 'detailer')
ON CONFLICT (permission_key, role) DO NOTHING;

-- 2. reports.view
INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES (
  'reports.view',
  'View Reports',
  'Access the reports and analytics dashboard',
  'Reports',
  899
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT 'reports.view', r.name::user_role, r.id,
  CASE WHEN r.name IN ('super_admin', 'admin') THEN true ELSE false END
FROM roles r
WHERE r.name IN ('super_admin', 'admin', 'cashier', 'detailer')
ON CONFLICT (permission_key, role) DO NOTHING;
