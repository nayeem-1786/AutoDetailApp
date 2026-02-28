-- Add SEO / location keys to business_settings
-- These feed JSON-LD structured data and the Business Profile admin page.

INSERT INTO business_settings (key, value, updated_at)
VALUES
  ('business_description', '"Professional auto detailing, ceramic coatings, and car care supplies in Lomita, CA. Mobile detailing available in the South Bay area."', now()),
  ('business_latitude',    '33.7922', now()),
  ('business_longitude',   '-118.3151', now()),
  ('service_area_name',    '"South Bay, Los Angeles"', now()),
  ('service_area_radius',  '"5 mi"', now()),
  ('price_range',          '"$$"', now())
ON CONFLICT (key) DO NOTHING;
