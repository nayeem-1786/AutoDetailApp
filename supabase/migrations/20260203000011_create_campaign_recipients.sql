CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel campaign_channel NOT NULL,
  coupon_code TEXT,
  delivered BOOLEAN NOT NULL DEFAULT false,
  mailgun_message_id TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cr_customer ON campaign_recipients(customer_id);
CREATE INDEX IF NOT EXISTS idx_cr_mailgun_msg ON campaign_recipients(mailgun_message_id) WHERE mailgun_message_id IS NOT NULL;
