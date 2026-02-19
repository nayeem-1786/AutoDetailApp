-- ============================================================================
-- Configurable Footer System
-- Creates footer_sections, footer_columns, footer_bottom_links tables.
-- Adds footer_column_id FK to website_navigation.
-- Migrates existing footer data into the new structure.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. footer_sections — Controls the 3 footer sections and their visibility
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS footer_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT UNIQUE NOT NULL,   -- 'main', 'service_areas', 'bottom_bar'
  label TEXT NOT NULL,                -- Display name in admin
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',          -- Section-specific config (e.g. prefix_text for service areas)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the 3 sections
INSERT INTO footer_sections (section_key, label, sort_order, config) VALUES
  ('main', 'Main Footer', 0, '{}'),
  ('service_areas', 'Service Areas', 1, '{"prefix_text": "Mobile Detailing in", "show_dividers": true}'),
  ('bottom_bar', 'Bottom Bar', 2, '{}');

-- ---------------------------------------------------------------------------
-- 2. footer_columns — Configurable columns for the Main Footer section
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS footer_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES footer_sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'links'
    CHECK (content_type IN ('links', 'html')),
  html_content TEXT DEFAULT '',       -- Used when content_type = 'html'
  sort_order INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_footer_columns_section_sort
  ON footer_columns(section_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. Add footer_column_id to website_navigation
-- ---------------------------------------------------------------------------
ALTER TABLE website_navigation
  ADD COLUMN IF NOT EXISTS footer_column_id UUID REFERENCES footer_columns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_website_navigation_footer_column
  ON website_navigation(footer_column_id) WHERE footer_column_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. footer_bottom_links — Legal/utility links in the bottom bar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS footer_bottom_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  open_in_new_tab BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed with Terms & Conditions only (Unsubscribe was a dead 404 link — removed)
INSERT INTO footer_bottom_links (label, url, sort_order) VALUES
  ('Terms & Conditions', '/terms', 0);

-- ---------------------------------------------------------------------------
-- 5. RLS Policies
-- ---------------------------------------------------------------------------

-- footer_sections
ALTER TABLE footer_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read footer_sections"
  ON footer_sections FOR SELECT
  USING (true);

CREATE POLICY "Authenticated manage footer_sections"
  ON footer_sections FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- footer_columns
ALTER TABLE footer_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read footer_columns"
  ON footer_columns FOR SELECT
  USING (true);

CREATE POLICY "Authenticated manage footer_columns"
  ON footer_columns FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- footer_bottom_links
ALTER TABLE footer_bottom_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read footer_bottom_links"
  ON footer_bottom_links FOR SELECT
  USING (true);

CREATE POLICY "Authenticated manage footer_bottom_links"
  ON footer_bottom_links FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. Data Migration — Move existing footer data into new structure
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  main_section_id UUID;
  col1_id UUID;
  col2_id UUID;
BEGIN
  SELECT id INTO main_section_id FROM footer_sections WHERE section_key = 'main';

  -- Column 1: Quick Links (from website_navigation with placement='footer_quick_links')
  INSERT INTO footer_columns (section_id, title, content_type, sort_order)
  VALUES (main_section_id, 'Quick Links', 'links', 0)
  RETURNING id INTO col1_id;

  -- Column 2: Contact (currently hardcoded HTML in the footer component)
  INSERT INTO footer_columns (section_id, title, content_type, html_content, sort_order)
  VALUES (main_section_id, 'Contact', 'html', '', 1)
  RETURNING id INTO col2_id;

  -- Migrate existing footer_quick_links nav items to column 1
  UPDATE website_navigation
  SET footer_column_id = col1_id
  WHERE placement = 'footer_quick_links';
END $$;

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER set_updated_at_footer_sections
  BEFORE UPDATE ON footer_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_footer_columns
  BEFORE UPDATE ON footer_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_footer_bottom_links
  BEFORE UPDATE ON footer_bottom_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
