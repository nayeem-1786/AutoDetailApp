-- Team members table for CMS About/Team page
-- Replaces team_members JSON in business_settings with proper relational table

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  years_of_service INTEGER,
  certifications JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_team_members_active ON team_members(is_active, sort_order);
CREATE INDEX idx_team_members_slug ON team_members(slug);

-- RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active team members"
  ON team_members FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated can manage team members"
  ON team_members FOR ALL
  USING (auth.role() = 'authenticated');

-- updated_at trigger (reuses existing function from 20260201000037)
CREATE TRIGGER tr_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
