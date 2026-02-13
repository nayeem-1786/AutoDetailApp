-- Add cancellation tracking columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Add permission for cancelling jobs
INSERT INTO permission_definitions (key, name, description, category, sort_order) VALUES
  ('pos.jobs.cancel', 'Cancel Jobs', 'Cancel scheduled or intake jobs in POS', 'POS Operations', 118)
ON CONFLICT (key) DO NOTHING;

-- Admin/detailer can cancel scheduled/intake jobs; cashier denied by default; API enforces admin-only for in_progress+
INSERT INTO permissions (permission_key, role, granted) VALUES
  ('pos.jobs.cancel', 'super_admin', true),
  ('pos.jobs.cancel', 'admin', true),
  ('pos.jobs.cancel', 'cashier', false),
  ('pos.jobs.cancel', 'detailer', true)
ON CONFLICT DO NOTHING;

-- Backfill role_id
UPDATE permissions p
SET role_id = r.id
FROM roles r
WHERE r.name = p.role::text
  AND p.role IS NOT NULL
  AND p.role_id IS NULL
  AND p.permission_key = 'pos.jobs.cancel';
