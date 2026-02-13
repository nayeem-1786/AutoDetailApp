-- Consolidate pos.jobs.create_walkin into pos.jobs.manage
-- Remove the separate create_walkin permission; walk-in creation is now gated by pos.jobs.manage

-- 1. Delete all permission rows for pos.jobs.create_walkin (role defaults + employee overrides)
DELETE FROM permissions WHERE permission_key = 'pos.jobs.create_walkin';

-- 2. Delete the permission definition
DELETE FROM permission_definitions WHERE key = 'pos.jobs.create_walkin';

-- 3. Update pos.jobs.manage description to include walk-in creation
UPDATE permission_definitions
SET description = 'Create walk-in jobs, start intake, begin work, complete jobs, reassign detailer'
WHERE key = 'pos.jobs.manage';

-- 4. Fix pos.jobs.cancel defaults: detailer should be false (only super_admin and admin get cancel)
UPDATE permissions
SET granted = false
WHERE permission_key = 'pos.jobs.cancel'
  AND role = 'detailer'
  AND employee_id IS NULL;
