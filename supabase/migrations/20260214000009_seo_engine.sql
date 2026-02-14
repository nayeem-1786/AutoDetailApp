-- SEO Engine: page_seo, city_landing_pages tables + image alt columns

-- Per-page SEO overrides
CREATE TABLE IF NOT EXISTS page_seo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT UNIQUE NOT NULL,
  page_type TEXT CHECK (page_type IN (
    'homepage', 'service_category', 'service_detail',
    'product_category', 'product_detail', 'gallery',
    'booking', 'city_landing', 'custom'
  )),
  seo_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  canonical_url TEXT,
  robots_directive TEXT DEFAULT 'index,follow',
  structured_data_overrides JSONB,
  focus_keyword TEXT,
  internal_links JSONB,
  is_auto_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_seo_path ON page_seo (page_path);
CREATE INDEX idx_page_seo_type ON page_seo (page_type);

-- RLS
ALTER TABLE page_seo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_seo_public_read" ON page_seo
  FOR SELECT USING (true);

CREATE POLICY "page_seo_authenticated_all" ON page_seo
  FOR ALL USING (auth.role() = 'authenticated');

-- City landing pages
CREATE TABLE IF NOT EXISTS city_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL DEFAULT 'CA',
  distance_miles DECIMAL,
  heading TEXT,
  intro_text TEXT,
  service_highlights JSONB,
  local_landmarks TEXT,
  meta_title TEXT,
  meta_description TEXT,
  focus_keywords TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_city_pages_active ON city_landing_pages (is_active, sort_order)
  WHERE is_active = true;

-- RLS
ALTER TABLE city_landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "city_pages_public_read" ON city_landing_pages
  FOR SELECT USING (is_active = true);

CREATE POLICY "city_pages_authenticated_all" ON city_landing_pages
  FOR ALL USING (auth.role() = 'authenticated');

-- Image alt text columns
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_alt TEXT;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS image_alt TEXT;

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS alt_text TEXT;

-- Seed city landing pages
INSERT INTO city_landing_pages (city_name, slug, state, distance_miles, heading, intro_text, focus_keywords, sort_order)
VALUES
  ('Lomita', 'lomita', 'CA', 0, 'Premium Auto Detailing in Lomita, CA', 'Smart Details Auto Spa is proudly based in Lomita, offering professional mobile auto detailing services right at your doorstep.', 'auto detailing lomita, ceramic coating lomita, car detailing lomita', 1),
  ('Torrance', 'torrance', 'CA', 1.5, 'Mobile Auto Detailing in Torrance, CA', 'We bring premium detailing services directly to you in Torrance. From ceramic coatings to full interior details, our mobile service covers all of Torrance.', 'auto detailing torrance, ceramic coating torrance, car detailing torrance', 2),
  ('Harbor City', 'harbor-city', 'CA', 1.2, 'Mobile Auto Detailing in Harbor City, CA', 'Serving Harbor City with professional mobile detailing. Our technicians come to your home or office with everything needed for a showroom finish.', 'auto detailing harbor city, ceramic coating harbor city', 3),
  ('Carson', 'carson', 'CA', 2.5, 'Mobile Auto Detailing in Carson, CA', 'Professional auto detailing services available throughout Carson. Book a mobile detail and we will come to you.', 'auto detailing carson, car wash carson, car detailing carson', 4),
  ('Gardena', 'gardena', 'CA', 2.8, 'Mobile Auto Detailing in Gardena, CA', 'Gardena residents trust Smart Details for premium mobile detailing. Ceramic coatings, paint correction, and interior restoration.', 'auto detailing gardena, ceramic coating gardena', 5),
  ('Wilmington', 'wilmington', 'CA', 2.5, 'Mobile Auto Detailing in Wilmington, CA', 'Serving the Wilmington community with professional mobile detailing services. Convenient, high-quality auto care at your location.', 'auto detailing wilmington', 6),
  ('San Pedro', 'san-pedro', 'CA', 3.0, 'Mobile Auto Detailing in San Pedro, CA', 'San Pedro vehicle owners enjoy convenient mobile detailing from Smart Details. Professional ceramic coatings and detailing services delivered to you.', 'auto detailing san pedro, ceramic coating san pedro', 7),
  ('Redondo Beach', 'redondo-beach', 'CA', 2.5, 'Mobile Auto Detailing in Redondo Beach, CA', 'Premium mobile detailing for Redondo Beach. Protect your vehicle with our ceramic coating packages or refresh it with a full detail.', 'auto detailing redondo beach, ceramic coating redondo beach', 8),
  ('Palos Verdes Estates', 'palos-verdes-estates', 'CA', 2.8, 'Mobile Auto Detailing in Palos Verdes Estates, CA', 'Luxury mobile detailing for Palos Verdes Estates residents. We specialize in high-end vehicles and premium ceramic coating protection.', 'auto detailing palos verdes, ceramic coating palos verdes', 9),
  ('Rolling Hills', 'rolling-hills', 'CA', 2.0, 'Mobile Auto Detailing in Rolling Hills, CA', 'Exclusive mobile detailing services for Rolling Hills. Our team brings professional-grade equipment and products to your estate.', 'auto detailing rolling hills', 10),
  ('Rancho Palos Verdes', 'rancho-palos-verdes', 'CA', 3.0, 'Mobile Auto Detailing in Rancho Palos Verdes, CA', 'Rancho Palos Verdes residents enjoy premium mobile detailing. Ceramic coatings, paint correction, and full interior restoration at your home.', 'auto detailing rancho palos verdes', 11)
ON CONFLICT (slug) DO NOTHING;

-- ai.txt content stored in business_settings
INSERT INTO business_settings (key, value)
VALUES ('ai_txt_content', '"User-agent: GPTBot\nAllow: /\nAllow: /services/\nAllow: /products/\nAllow: /areas/\nDisallow: /admin/\nDisallow: /api/\nDisallow: /pos/\nDisallow: /account/\nDisallow: /login\n\nUser-agent: Google-Extended\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nUser-agent: CCBot\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nUser-agent: anthropic-ai\nAllow: /\nDisallow: /admin/\nDisallow: /api/"'::jsonb)
ON CONFLICT (key) DO NOTHING;
