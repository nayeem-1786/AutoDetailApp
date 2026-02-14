-- CMS Ad Placement System: ad_creatives + ad_placements + ad_events

CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_url_mobile TEXT,
  link_url TEXT,
  alt_text TEXT,
  ad_size TEXT NOT NULL CHECK (ad_size IN (
    '728x90', '300x250', '336x280', '160x600', '300x600',
    '320x50', '320x100', '970x90', '970x250', '250x250'
  )),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  impression_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_creatives_active ON ad_creatives (is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS ad_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_creative_id UUID NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
  page_path TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT 'all' CHECK (device IN ('all', 'desktop', 'mobile')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_placements_lookup ON ad_placements (page_path, zone_id, is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS ad_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_creative_id UUID NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
  ad_placement_id UUID REFERENCES ad_placements(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  page_path TEXT,
  zone_id TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_events_creative ON ad_events (ad_creative_id, event_type, created_at);
CREATE INDEX idx_ad_events_dedup ON ad_events (ip_hash, ad_creative_id, created_at)
  WHERE event_type = 'impression';

-- RLS
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_creatives_public_read" ON ad_creatives
  FOR SELECT USING (is_active = true);
CREATE POLICY "ad_creatives_authenticated_all" ON ad_creatives
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "ad_placements_public_read" ON ad_placements
  FOR SELECT USING (is_active = true);
CREATE POLICY "ad_placements_authenticated_all" ON ad_placements
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "ad_events_public_insert" ON ad_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "ad_events_authenticated_all" ON ad_events
  FOR ALL USING (auth.role() = 'authenticated');

-- Master toggle
INSERT INTO business_settings (key, value)
VALUES ('ads_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
