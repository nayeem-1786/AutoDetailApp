-- A/B Testing: Campaign Variants
CREATE TABLE campaign_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_label TEXT NOT NULL DEFAULT 'A', -- 'A', 'B', 'C'
  message_body TEXT NOT NULL,
  email_subject TEXT, -- for email campaigns
  split_percentage INTEGER NOT NULL DEFAULT 50, -- 0-100
  is_winner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_campaign_variants_campaign ON campaign_variants(campaign_id);

-- Add variant tracking to campaign_recipients
ALTER TABLE campaign_recipients ADD COLUMN variant_id UUID REFERENCES campaign_variants(id);

-- RLS
ALTER TABLE campaign_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on campaign_variants"
  ON campaign_variants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
