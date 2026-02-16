-- Repair migration: insert cms.pages.manage permission defaults
-- The original migration (20260216000001) failed on this INSERT due to
-- missing `role` enum column (valid_permission_target check constraint).

-- Ensure permission definition exists
INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES ('cms.pages.manage', 'Manage Pages & Navigation', 'Create, edit, and delete custom pages and navigation links', 'CMS', 97)
ON CONFLICT DO NOTHING;

-- Insert role defaults with both role enum and role_id
INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT
  'cms.pages.manage',
  r.name::user_role,
  r.id,
  CASE
    WHEN r.name IN ('super_admin', 'admin') THEN true
    ELSE false
  END
FROM roles r
WHERE r.name IN ('super_admin', 'admin', 'cashier', 'detailer')
ON CONFLICT (permission_key, role_id) DO NOTHING;
