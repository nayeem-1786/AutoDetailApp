-- Enrichment Batches — tracks Anthropic Message Batches API submissions
CREATE TABLE IF NOT EXISTS enrichment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthropic_batch_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'processing', 'completed', 'failed', 'canceled')),
  total_requests INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  errored INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE enrichment_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read enrichment batches"
  ON enrichment_batches FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_enrichment_batches_status ON enrichment_batches (status);
CREATE INDEX idx_enrichment_batches_created ON enrichment_batches (created_at DESC);
