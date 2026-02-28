-- Homepage Settings Expansion + Booking & Quote Settings
-- Adds configurable hero tagline, CTA defaults, services descriptions,
-- deposit amount, and quote validity days to business_settings.

INSERT INTO business_settings (key, value) VALUES
  ('homepage_hero_tagline', '"Expert ceramic coatings, paint correction, and premium detailing. We bring showroom results directly to your doorstep."'),
  ('homepage_cta_title', '"Ready to Transform Your Vehicle?"'),
  ('homepage_cta_description', '"Book your appointment today and experience the difference professional detailing makes."'),
  ('homepage_cta_button_text', '"Book Your Detail"'),
  ('homepage_services_description', '"From express washes to multi-year ceramic coating packages, we offer comprehensive auto detailing tailored to your vehicle''s needs."'),
  ('services_page_description', '"From express washes to multi-year ceramic coating packages, our trained technicians deliver results you can see and feel."'),
  ('default_deposit_amount', '50'),
  ('quote_validity_days', '10')
ON CONFLICT (key) DO NOTHING;
