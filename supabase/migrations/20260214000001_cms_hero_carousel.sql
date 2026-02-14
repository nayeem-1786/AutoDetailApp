-- CMS Hero Carousel: hero_slides table + business_settings config

CREATE TABLE IF NOT EXISTS hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  subtitle TEXT,
  cta_text TEXT,
  cta_url TEXT,
  content_type TEXT NOT NULL DEFAULT 'image' CHECK (content_type IN ('image', 'video', 'before_after')),
  image_url TEXT,
  image_url_mobile TEXT,
  image_alt TEXT,
  video_url TEXT,
  video_thumbnail_url TEXT,
  before_image_url TEXT,
  after_image_url TEXT,
  before_label TEXT DEFAULT 'Before',
  after_label TEXT DEFAULT 'After',
  overlay_opacity INTEGER DEFAULT 40 CHECK (overlay_opacity >= 0 AND overlay_opacity <= 100),
  text_alignment TEXT DEFAULT 'left' CHECK (text_alignment IN ('left', 'center', 'right')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hero_slides_active_sort ON hero_slides (is_active, sort_order) WHERE is_active = true;

-- RLS
ALTER TABLE hero_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hero_slides_public_read" ON hero_slides
  FOR SELECT USING (is_active = true);

CREATE POLICY "hero_slides_authenticated_all" ON hero_slides
  FOR ALL USING (auth.role() = 'authenticated');

-- Hero carousel config in business_settings
INSERT INTO business_settings (key, value)
VALUES ('hero_carousel_config', '{"mode": "single", "interval_ms": 5000, "transition": "fade", "pause_on_hover": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
