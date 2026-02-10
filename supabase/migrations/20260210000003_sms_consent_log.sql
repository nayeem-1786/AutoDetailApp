-- TCPA compliance: audit log for all SMS consent changes
CREATE TABLE sms_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  action text NOT NULL CHECK (action IN ('opt_out', 'opt_in')),
  keyword text NOT NULL,
  source text NOT NULL CHECK (source IN ('inbound_sms', 'admin_manual', 'unsubscribe_page', 'booking_form', 'system')),
  previous_value boolean,
  new_value boolean NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sms_consent_log_customer ON sms_consent_log(customer_id, created_at DESC);
CREATE INDEX idx_sms_consent_log_phone ON sms_consent_log(phone, created_at DESC);

-- RLS: allow authenticated users full access (admin/service role)
ALTER TABLE sms_consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY sms_consent_log_select ON sms_consent_log FOR SELECT TO authenticated USING (true);
CREATE POLICY sms_consent_log_write ON sms_consent_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
