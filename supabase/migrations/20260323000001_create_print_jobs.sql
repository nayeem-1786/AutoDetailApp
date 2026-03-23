-- Print job queue for remote VPS → store LAN printer communication.
-- The VPS inserts jobs; the OptiPlex polling agent picks them up and sends to the local printer.

CREATE TABLE print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('thermal_receipt', 'cash_drawer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload TEXT,                    -- base64-encoded ESC/POS binary data
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Fast lookup for polling agent: pending jobs ordered by creation time
CREATE INDEX idx_print_jobs_pending ON print_jobs(status, created_at) WHERE status = 'pending';

-- RLS: service role only (polling agent + API routes use service role)
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on print_jobs"
  ON print_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- Allow authenticated users to read their own jobs (for POS status polling)
CREATE POLICY "Authenticated users can read print_jobs"
  ON print_jobs FOR SELECT
  TO authenticated
  USING (true);
