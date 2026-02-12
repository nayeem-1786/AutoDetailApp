-- =============================================================================
-- Migration: Route Access Table
-- Stores route → role mappings in database instead of hardcoded ROUTE_ACCESS.
-- Supports wildcard patterns (e.g., '/admin/catalog/*') and custom roles.
-- =============================================================================

-- 1. Create route_access table
-- =============================================================================

CREATE TABLE route_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  route_pattern TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, route_pattern)
);

ALTER TABLE route_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY route_access_select ON route_access
  FOR SELECT TO authenticated USING (true);

CREATE POLICY route_access_write ON route_access
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'super_admin')
  );

CREATE INDEX idx_route_access_role_id ON route_access(role_id);


-- 2. Seed route access data from current ROUTE_ACCESS map
-- =============================================================================

-- Super Admin: all routes
INSERT INTO route_access (role_id, route_pattern)
SELECT r.id, v.pattern
FROM roles r, (VALUES
  ('/admin'),
  ('/admin/appointments'),
  ('/admin/customers'),
  ('/admin/messaging'),
  ('/admin/transactions'),
  ('/admin/quotes'),
  ('/admin/catalog/*'),
  ('/admin/inventory/*'),
  ('/admin/marketing/*'),
  ('/admin/staff'),
  ('/admin/staff/roles'),
  ('/admin/settings/*'),
  ('/admin/migration'),
  ('/pos')
) AS v(pattern)
WHERE r.name = 'super_admin';

-- Admin: dashboard, appointments, customers, messaging, transactions, quotes, catalog, inventory, marketing, POS
INSERT INTO route_access (role_id, route_pattern)
SELECT r.id, v.pattern
FROM roles r, (VALUES
  ('/admin'),
  ('/admin/appointments'),
  ('/admin/customers'),
  ('/admin/messaging'),
  ('/admin/transactions'),
  ('/admin/quotes'),
  ('/admin/catalog/*'),
  ('/admin/inventory/*'),
  ('/admin/marketing/*'),
  ('/pos')
) AS v(pattern)
WHERE r.name = 'admin';

-- Cashier: dashboard, appointments, customers, messaging, POS
INSERT INTO route_access (role_id, route_pattern)
SELECT r.id, v.pattern
FROM roles r, (VALUES
  ('/admin'),
  ('/admin/appointments'),
  ('/admin/customers'),
  ('/admin/messaging'),
  ('/pos')
) AS v(pattern)
WHERE r.name = 'cashier';

-- Detailer: dashboard, appointments, messaging
INSERT INTO route_access (role_id, route_pattern)
SELECT r.id, v.pattern
FROM roles r, (VALUES
  ('/admin'),
  ('/admin/appointments'),
  ('/admin/messaging')
) AS v(pattern)
WHERE r.name = 'detailer';
