-- Global OG image URL — custom social share image uploaded via admin
INSERT INTO business_settings (key, value) VALUES
  ('og_image_url', '""')
ON CONFLICT (key) DO NOTHING;
