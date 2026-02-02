CREATE TABLE marketing_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel consent_channel NOT NULL,
  action consent_action NOT NULL,
  source consent_source NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  recorded_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_log_customer ON marketing_consent_log(customer_id);
CREATE INDEX idx_consent_log_channel ON marketing_consent_log(channel);
