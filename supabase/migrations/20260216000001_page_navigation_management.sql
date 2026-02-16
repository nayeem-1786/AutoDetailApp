-- ============================================================================
-- Page & Navigation Management System
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. website_pages — Custom admin-created pages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS website_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  page_template TEXT NOT NULL DEFAULT 'content'
    CHECK (page_template IN ('content', 'landing', 'blank')),
  parent_id UUID REFERENCES website_pages(id) ON DELETE SET NULL,
  content TEXT DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  show_in_nav BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_pages_slug ON website_pages(slug);
CREATE INDEX IF NOT EXISTS idx_website_pages_parent ON website_pages(parent_id);
CREATE INDEX IF NOT EXISTS idx_website_pages_published ON website_pages(is_published, sort_order);

-- RLS
ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published pages"
  ON website_pages FOR SELECT
  USING (is_published = true);

CREATE POLICY "Authenticated can manage all pages"
  ON website_pages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. website_navigation — Admin-managed nav menus
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS website_navigation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement TEXT NOT NULL
    CHECK (placement IN ('header', 'footer_quick_links', 'footer_services')),
  label TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '#',
  page_id UUID REFERENCES website_pages(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES website_navigation(id) ON DELETE CASCADE,
  target TEXT NOT NULL DEFAULT '_self'
    CHECK (target IN ('_self', '_blank')),
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_navigation_placement_sort
  ON website_navigation(placement, sort_order);
CREATE INDEX IF NOT EXISTS idx_website_navigation_parent
  ON website_navigation(parent_id);

-- RLS
ALTER TABLE website_navigation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active nav items"
  ON website_navigation FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated can manage all nav items"
  ON website_navigation FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Seed default navigation — header
-- ---------------------------------------------------------------------------
INSERT INTO website_navigation (placement, label, url, sort_order) VALUES
  ('header', 'Services', '/services', 0),
  ('header', 'Products', '/products', 1),
  ('header', 'Gallery', '/gallery', 2);

-- ---------------------------------------------------------------------------
-- 4. Seed default navigation — footer quick links
-- ---------------------------------------------------------------------------
INSERT INTO website_navigation (placement, label, url, sort_order) VALUES
  ('footer_quick_links', 'All Services', '/services', 0),
  ('footer_quick_links', 'Shop Products', '/products', 1),
  ('footer_quick_links', 'Our Work', '/gallery', 2),
  ('footer_quick_links', 'Book Appointment', '/book', 3),
  ('footer_quick_links', 'Customer Login', '/signin', 4),
  ('footer_quick_links', 'My Account', '/account', 5);

-- ---------------------------------------------------------------------------
-- 5. Permission: cms.pages.manage
-- ---------------------------------------------------------------------------
INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES ('cms.pages.manage', 'Manage Pages & Navigation', 'Create, edit, and delete custom pages and navigation links', 'CMS', 97)
ON CONFLICT DO NOTHING;

-- Insert role defaults for the new permission
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
