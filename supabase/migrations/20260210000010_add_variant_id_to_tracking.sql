-- Add variant_id to tracked_links and link_clicks for A/B test click attribution
ALTER TABLE tracked_links ADD COLUMN variant_id UUID REFERENCES campaign_variants(id);
ALTER TABLE link_clicks ADD COLUMN variant_id UUID REFERENCES campaign_variants(id);

-- Index for querying clicks per variant
CREATE INDEX idx_link_clicks_variant ON link_clicks(variant_id, clicked_at) WHERE variant_id IS NOT NULL;
CREATE INDEX idx_tracked_links_variant ON tracked_links(variant_id) WHERE variant_id IS NOT NULL;
