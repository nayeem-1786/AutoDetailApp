-- CMS Permissions: 7 new permission keys in "Website" category

-- Get the max sort_order to place Website permissions after existing ones
DO $$
DECLARE
  max_sort INTEGER;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) INTO max_sort FROM permission_definitions;

  -- Insert 7 CMS permission definitions
  INSERT INTO permission_definitions (permission_key, name, description, category, sort_order)
  VALUES
    ('cms.hero.manage', 'Manage Hero', 'Create, edit, reorder, and delete hero slides', 'Website', max_sort + 1),
    ('cms.tickers.manage', 'Manage Tickers', 'Create, edit, and delete announcement tickers', 'Website', max_sort + 2),
    ('cms.ads.manage', 'Manage Ads', 'Create, edit, and delete ad creatives and placements', 'Website', max_sort + 3),
    ('cms.themes.manage', 'Manage Themes', 'Create, edit, activate, and deactivate seasonal themes', 'Website', max_sort + 4),
    ('cms.about.manage', 'Manage About & Team', 'Edit team members, credentials, and about content', 'Website', max_sort + 5),
    ('cms.catalog_display.manage', 'Manage Catalog Display', 'Toggle show_on_website, featured, and sort order for services/products', 'Website', max_sort + 6),
    ('cms.seo.manage', 'Manage SEO', 'Edit per-page SEO config, meta tags, alt tags, city pages', 'Website', max_sort + 7)
  ON CONFLICT (permission_key) DO NOTHING;
END $$;

-- Insert role defaults for all 4 system roles (7 keys x 4 roles = 28 rows)
-- super_admin and admin get all CMS permissions, cashier and detailer get none
INSERT INTO permissions (role_id, permission_key, granted)
SELECT r.id, p.permission_key,
  CASE WHEN r.name IN ('super_admin', 'admin') THEN true ELSE false END
FROM roles r
CROSS JOIN (
  VALUES
    ('cms.hero.manage'),
    ('cms.tickers.manage'),
    ('cms.ads.manage'),
    ('cms.themes.manage'),
    ('cms.about.manage'),
    ('cms.catalog_display.manage'),
    ('cms.seo.manage')
) AS p(permission_key)
WHERE r.name IN ('super_admin', 'admin', 'cashier', 'detailer')
ON CONFLICT (permission_key, role_id) DO NOTHING;
