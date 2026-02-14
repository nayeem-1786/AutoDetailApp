-- CMS Announcement Tickers

CREATE TABLE IF NOT EXISTS announcement_tickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  link_url TEXT,
  link_text TEXT,
  placement TEXT NOT NULL DEFAULT 'top_bar' CHECK (placement IN ('top_bar', 'section')),
  section_position INTEGER,
  bg_color TEXT DEFAULT '#1e3a5f',
  text_color TEXT DEFAULT '#ffffff',
  scroll_speed TEXT DEFAULT 'normal' CHECK (scroll_speed IN ('slow', 'normal', 'fast')),
  font_size TEXT DEFAULT 'sm' CHECK (font_size IN ('xs', 'sm', 'base', 'lg')),
  target_pages JSONB DEFAULT '["all"]'::jsonb,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickers_active ON announcement_tickers (is_active, placement, sort_order)
  WHERE is_active = true;

-- RLS
ALTER TABLE announcement_tickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickers_public_read" ON announcement_tickers
  FOR SELECT USING (is_active = true);

CREATE POLICY "tickers_authenticated_all" ON announcement_tickers
  FOR ALL USING (auth.role() = 'authenticated');

-- Master toggle
INSERT INTO business_settings (key, value)
VALUES ('ticker_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
