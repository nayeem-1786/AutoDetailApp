-- =============================================================================
-- Migration: Fix RLS on permissions table
-- Enable RLS and restrict write access to super_admin only.
-- Previously RLS was not enabled, allowing any authenticated user to write.
-- =============================================================================

-- Enable RLS
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate to ensure clean state
DROP POLICY IF EXISTS permissions_select ON permissions;
DROP POLICY IF EXISTS permissions_write ON permissions;
DROP POLICY IF EXISTS permissions_update ON permissions;
DROP POLICY IF EXISTS permissions_delete ON permissions;

-- All authenticated users can read permissions (needed for UI permission checks)
CREATE POLICY permissions_select ON permissions
  FOR SELECT TO authenticated USING (true);

-- Only super_admin can write (insert, update, delete)
CREATE POLICY permissions_write ON permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY permissions_update ON permissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY permissions_delete ON permissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Also fix permission_definitions — read-only for all, only super_admin can write
ALTER TABLE permission_definitions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate to ensure clean state (select policy already exists from session 1)
DROP POLICY IF EXISTS permission_definitions_select ON permission_definitions;

CREATE POLICY permission_definitions_select ON permission_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY permission_definitions_write ON permission_definitions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY permission_definitions_update ON permission_definitions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY permission_definitions_delete ON permission_definitions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );
