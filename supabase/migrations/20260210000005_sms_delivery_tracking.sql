-- SMS Delivery Tracking
CREATE TABLE sms_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid TEXT NOT NULL UNIQUE,
  to_phone TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  status TEXT NOT NULL, -- queued, sent, delivered, undelivered, failed
  error_code TEXT,
  error_message TEXT,
  customer_id UUID REFERENCES customers(id),
  campaign_id UUID REFERENCES campaigns(id),
  lifecycle_execution_id UUID REFERENCES lifecycle_executions(id),
  source TEXT NOT NULL, -- 'campaign', 'lifecycle', 'transactional', 'manual'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sms_delivery_log_message_sid ON sms_delivery_log(message_sid);
CREATE INDEX idx_sms_delivery_log_campaign_status ON sms_delivery_log(campaign_id, status);
CREATE INDEX idx_sms_delivery_log_lifecycle_status ON sms_delivery_log(lifecycle_execution_id, status);
CREATE INDEX idx_sms_delivery_log_customer ON sms_delivery_log(customer_id, created_at);
CREATE INDEX idx_sms_delivery_log_created ON sms_delivery_log(created_at);

-- RLS
ALTER TABLE sms_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sms_delivery_log"
  ON sms_delivery_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
