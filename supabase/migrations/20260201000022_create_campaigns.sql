CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  channel campaign_channel NOT NULL DEFAULT 'sms',
  status campaign_status NOT NULL DEFAULT 'draft',
  audience_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sms_template TEXT,
  email_subject TEXT,
  email_template TEXT,
  coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  revenue_attributed DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Now add the FK from coupons to campaigns
ALTER TABLE coupons ADD CONSTRAINT fk_coupons_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_scheduled ON campaigns(scheduled_at);
