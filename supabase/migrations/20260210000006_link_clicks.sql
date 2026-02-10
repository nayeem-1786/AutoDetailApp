-- Link Click Tracking
CREATE TABLE tracked_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  campaign_id UUID REFERENCES campaigns(id),
  lifecycle_execution_id UUID REFERENCES lifecycle_executions(id),
  source TEXT NOT NULL, -- 'campaign', 'lifecycle', 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracked_links_short_code ON tracked_links(short_code);

CREATE TABLE link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT NOT NULL,
  original_url TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  campaign_id UUID REFERENCES campaigns(id),
  lifecycle_execution_id UUID REFERENCES lifecycle_executions(id),
  source TEXT NOT NULL, -- 'campaign', 'lifecycle', 'manual'
  clicked_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX idx_link_clicks_short_code ON link_clicks(short_code, clicked_at);
CREATE INDEX idx_link_clicks_campaign ON link_clicks(campaign_id, clicked_at);
CREATE INDEX idx_link_clicks_customer ON link_clicks(customer_id, clicked_at);

-- RLS
ALTER TABLE tracked_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tracked_links"
  ON tracked_links FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on link_clicks"
  ON link_clicks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
