-- Email Delivery Tracking
CREATE TABLE email_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailgun_message_id TEXT,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT,
  event TEXT NOT NULL, -- 'delivered', 'failed', 'bounced', 'clicked', 'complained', 'unsubscribed'
  campaign_id UUID REFERENCES campaigns(id),
  customer_id UUID REFERENCES customers(id),
  error_code TEXT,
  error_message TEXT,
  click_url TEXT, -- only for 'clicked' events
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_delivery_log_campaign_event ON email_delivery_log(campaign_id, event);
CREATE INDEX idx_email_delivery_log_customer ON email_delivery_log(customer_id, created_at);
CREATE INDEX idx_email_delivery_log_message_id ON email_delivery_log(mailgun_message_id);
CREATE INDEX idx_email_delivery_log_created ON email_delivery_log(created_at);

-- RLS
ALTER TABLE email_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on email_delivery_log"
  ON email_delivery_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
