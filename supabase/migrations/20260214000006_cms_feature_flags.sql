-- CMS Feature Flags: 4 new flags for CMS features

INSERT INTO feature_flags (key, name, description, category, enabled)
VALUES
  ('hero_carousel', 'Hero Carousel', 'Enable admin-managed hero carousel on the homepage. When disabled, the static hero section is shown.', 'Website', true),
  ('announcement_tickers', 'Announcement Tickers', 'Enable scrolling announcement tickers on public pages. When disabled, no ticker bars are shown.', 'Website', false),
  ('ad_placements', 'Ad Placements', 'Enable ad placement zones on public pages. When disabled, no ads are shown.', 'Website', false),
  ('seasonal_themes', 'Seasonal Themes', 'Enable seasonal theme engine with color overrides and particle effects. When disabled, default theme is used.', 'Website', false)
ON CONFLICT (key) DO NOTHING;
