-- Quote Communications Log
-- Tracks every SMS and Email sent for quotes

CREATE TABLE IF NOT EXISTS quote_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  sent_to TEXT NOT NULL, -- email address or phone number
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT, -- only populated if status = 'failed'
  sent_by UUID REFERENCES employees(id) ON DELETE SET NULL, -- employee who triggered the send
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching communication history by quote
CREATE INDEX idx_quote_communications_quote_id ON quote_communications(quote_id);
CREATE INDEX idx_quote_communications_created_at ON quote_communications(created_at DESC);

-- RLS Policies
ALTER TABLE quote_communications ENABLE ROW LEVEL SECURITY;

-- Employees can view all quote communications
CREATE POLICY "Employees can view quote communications"
  ON quote_communications FOR SELECT
  TO authenticated
  USING (is_employee());

-- Only service role can insert (via API routes)
CREATE POLICY "Service role can insert quote communications"
  ON quote_communications FOR INSERT
  TO service_role
  WITH CHECK (true);
