-- =============================================================================
-- Phase 8: Job Management & Photo Documentation — Foundation Schema
-- Creates jobs, job_photos, job_addons tables + indexes + RLS
-- Seeds business_settings, feature flags, permission definitions, and permissions
-- =============================================================================

-- 1. Create jobs table
-- =============================================================================

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  assigned_staff_id UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'intake', 'in_progress', 'pending_approval', 'completed', 'closed', 'cancelled')),

  -- Services (JSON array of service IDs + names + prices for the job)
  services JSONB NOT NULL DEFAULT '[]',

  -- Timer
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,
  timer_seconds INTEGER NOT NULL DEFAULT 0,
  timer_paused_at TIMESTAMPTZ,

  -- Intake
  intake_started_at TIMESTAMPTZ,
  intake_completed_at TIMESTAMPTZ,
  intake_notes TEXT,

  -- Pickup
  estimated_pickup_at TIMESTAMPTZ,
  actual_pickup_at TIMESTAMPTZ,
  pickup_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_appointment ON jobs(appointment_id);
CREATE INDEX idx_jobs_assigned_staff ON jobs(assigned_staff_id);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_date_status ON jobs(created_at, status);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_select ON jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY jobs_insert ON jobs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY jobs_update ON jobs
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY jobs_delete ON jobs
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

-- 2. Create job_photos table
-- =============================================================================

CREATE TABLE job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Classification
  zone TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('intake', 'progress', 'completion')),

  -- Storage
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  storage_path TEXT NOT NULL,

  -- Metadata
  notes TEXT,
  annotation_data JSONB,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_photos_job ON job_photos(job_id);
CREATE INDEX idx_job_photos_job_phase ON job_photos(job_id, phase);
CREATE INDEX idx_job_photos_featured ON job_photos(is_featured) WHERE is_featured = true;
CREATE INDEX idx_job_photos_zone ON job_photos(job_id, zone, phase);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_photos_select ON job_photos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY job_photos_insert ON job_photos
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY job_photos_update ON job_photos
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY job_photos_delete ON job_photos
  FOR DELETE TO authenticated
  USING (true);

-- 3. Create job_addons table
-- =============================================================================

CREATE TABLE job_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- What's being proposed
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  custom_description TEXT,
  price DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Authorization
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  authorization_token TEXT NOT NULL UNIQUE,
  message_to_customer TEXT,

  -- Timing
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  pickup_delay_minutes INTEGER DEFAULT 0,

  -- Photos attached to this addon request
  photo_ids UUID[] DEFAULT '{}',

  -- Tracking
  customer_notified_via TEXT[],
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_addons_job ON job_addons(job_id);
CREATE INDEX idx_job_addons_status ON job_addons(status);
CREATE INDEX idx_job_addons_token ON job_addons(authorization_token);
CREATE INDEX idx_job_addons_pending ON job_addons(status, expires_at) WHERE status = 'pending';

ALTER TABLE job_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_addons_select ON job_addons
  FOR SELECT TO authenticated USING (true);

CREATE POLICY job_addons_insert ON job_addons
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY job_addons_update ON job_addons
  FOR UPDATE TO authenticated
  USING (true);

-- 4. Business settings seeds
-- =============================================================================

INSERT INTO business_settings (key, value)
VALUES ('addon_auth_expiration_minutes', '"30"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO business_settings (key, value)
VALUES ('min_intake_photos_exterior', '"4"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO business_settings (key, value)
VALUES ('min_intake_photos_interior', '"2"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO business_settings (key, value)
VALUES ('min_completion_photos_exterior', '"4"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO business_settings (key, value)
VALUES ('min_completion_photos_interior', '"2"')
ON CONFLICT (key) DO NOTHING;

-- 5. Feature flags
-- =============================================================================

-- photo_documentation already exists in seed data — ensure it's in the DB
INSERT INTO feature_flags (key, name, description, category, enabled)
VALUES (
  'photo_documentation',
  'Photo Documentation',
  'Enable job management, photo documentation, and intake/completion photo workflows in POS. Gates the Jobs tab and admin photo gallery.',
  'Core POS',
  true
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO feature_flags (key, name, description, category, enabled)
VALUES (
  'photo_gallery',
  'Public Photo Gallery',
  'Enable the public-facing /gallery page showcasing before/after photos. Requires Photo Documentation to be enabled first.',
  'Future',
  false
)
ON CONFLICT (key) DO NOTHING;

-- 6. Permission definitions
-- =============================================================================

INSERT INTO permission_definitions (key, name, description, category, sort_order) VALUES
  ('pos.jobs.view', 'View Jobs Tab', 'View the Jobs tab and job queue in POS', 'POS Operations', 114),
  ('pos.jobs.manage', 'Manage Jobs', 'Start intake, begin work, complete jobs', 'POS Operations', 115),
  ('pos.jobs.flag_issue', 'Flag Issues', 'Create mid-service upsell requests', 'POS Operations', 116),
  ('pos.jobs.create_walkin', 'Create Walk-in Jobs', 'Create walk-in jobs from Jobs tab', 'POS Operations', 117),
  ('admin.photos.view', 'View Photo Gallery', 'View admin photo gallery', 'Photos', 800),
  ('admin.photos.manage', 'Manage Photos', 'Toggle featured/internal, bulk actions on photos', 'Photos', 801)
ON CONFLICT (key) DO NOTHING;

-- 7. Permission defaults (6 keys x 4 roles = 24 rows)
-- =============================================================================

INSERT INTO permissions (permission_key, role, granted) VALUES
  -- pos.jobs.view — all POS roles
  ('pos.jobs.view', 'super_admin', true),
  ('pos.jobs.view', 'admin', true),
  ('pos.jobs.view', 'cashier', true),
  ('pos.jobs.view', 'detailer', true),

  -- pos.jobs.manage — Detailer, Manager, Owner
  ('pos.jobs.manage', 'super_admin', true),
  ('pos.jobs.manage', 'admin', true),
  ('pos.jobs.manage', 'cashier', false),
  ('pos.jobs.manage', 'detailer', true),

  -- pos.jobs.flag_issue — Detailer, Manager, Owner
  ('pos.jobs.flag_issue', 'super_admin', true),
  ('pos.jobs.flag_issue', 'admin', true),
  ('pos.jobs.flag_issue', 'cashier', false),
  ('pos.jobs.flag_issue', 'detailer', true),

  -- pos.jobs.create_walkin — Manager, Owner only
  ('pos.jobs.create_walkin', 'super_admin', true),
  ('pos.jobs.create_walkin', 'admin', true),
  ('pos.jobs.create_walkin', 'cashier', false),
  ('pos.jobs.create_walkin', 'detailer', false),

  -- admin.photos.view — Manager, Admin, Owner
  ('admin.photos.view', 'super_admin', true),
  ('admin.photos.view', 'admin', true),
  ('admin.photos.view', 'cashier', false),
  ('admin.photos.view', 'detailer', false),

  -- admin.photos.manage — Admin, Owner
  ('admin.photos.manage', 'super_admin', true),
  ('admin.photos.manage', 'admin', false),
  ('admin.photos.manage', 'cashier', false),
  ('admin.photos.manage', 'detailer', false)
ON CONFLICT DO NOTHING;

-- Backfill role_id on new permission rows
UPDATE permissions p
SET role_id = r.id
FROM roles r
WHERE r.name = p.role::text
  AND p.role IS NOT NULL
  AND p.role_id IS NULL;
