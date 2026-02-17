-- Fix: Insert order permission rows that failed in previous migration
-- The order_events table, RLS, and permission_definitions were created,
-- but the permissions INSERT failed due to missing role column.

INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT p.pkey, r.name::user_role, r.id,
  CASE
    WHEN p.pkey = 'orders.view' THEN true
    WHEN p.pkey = 'orders.manage' AND r.name IN ('super_admin', 'admin') THEN true
    ELSE false
  END
FROM roles r
CROSS JOIN (
  VALUES ('orders.view'), ('orders.manage')
) AS p(pkey)
WHERE r.name IN ('super_admin', 'admin', 'cashier', 'detailer')
ON CONFLICT (permission_key, role) DO NOTHING;
