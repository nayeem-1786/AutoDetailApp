-- Homepage settings: move hardcoded values to business_settings
-- so they can be edited from the admin UI.

INSERT INTO business_settings (key, value, description) VALUES
  ('homepage_differentiators', '[{"icon":"Truck","title":"Mobile Service","description":"We come to your home or office throughout the South Bay area."},{"icon":"Shield","title":"Ceramic Pro Certified","description":"Professional-grade coatings for lasting protection."},{"icon":"Leaf","title":"Eco-Friendly Products","description":"Premium products that are safe for your vehicle and the environment."}]', 'Homepage "Why Choose Us" differentiators (JSON array of {icon, title, description})'),
  ('google_place_id', '"ChIJf7qNDhW1woAROX-FX8CScGE"', 'Google Place ID for reviews widget'),
  ('homepage_cta_before_image', '"/images/before-after-old.webp"', 'Before image URL for homepage CTA before/after slider'),
  ('homepage_cta_after_image', '"/images/before-after-new.webp"', 'After image URL for homepage CTA before/after slider')
ON CONFLICT (key) DO NOTHING;
