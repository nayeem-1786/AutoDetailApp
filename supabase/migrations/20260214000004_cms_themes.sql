-- CMS Seasonal Themes

CREATE TABLE IF NOT EXISTS seasonal_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color_overrides JSONB DEFAULT '{}'::jsonb,
  gradient_overrides JSONB DEFAULT '{}'::jsonb,
  particle_effect TEXT CHECK (particle_effect IN (
    'snowfall', 'fireworks', 'confetti', 'hearts', 'leaves', 'stars', 'sparkles'
  )),
  particle_intensity INTEGER DEFAULT 50 CHECK (particle_intensity >= 0 AND particle_intensity <= 100),
  particle_color TEXT,
  ticker_message TEXT,
  ticker_bg_color TEXT,
  ticker_text_color TEXT,
  themed_ad_creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  hero_bg_image_url TEXT,
  body_bg_color TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  auto_activate BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_themes_active ON seasonal_themes (is_active) WHERE is_active = true;
CREATE INDEX idx_themes_auto ON seasonal_themes (auto_activate, starts_at, ends_at)
  WHERE auto_activate = true;

-- RLS
ALTER TABLE seasonal_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "themes_public_read" ON seasonal_themes
  FOR SELECT USING (is_active = true);

CREATE POLICY "themes_authenticated_all" ON seasonal_themes
  FOR ALL USING (auth.role() = 'authenticated');
