-- Per-slide color overrides for the hero carousel.
-- All nullable — NULL means "use theme default".
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT NULL;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS subtitle_color TEXT DEFAULT NULL;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT NULL;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS overlay_color TEXT DEFAULT NULL;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS cta_bg_color TEXT DEFAULT NULL;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS cta_text_color TEXT DEFAULT NULL;
