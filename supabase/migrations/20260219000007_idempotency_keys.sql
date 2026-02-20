-- Idempotency keys for preventing duplicate POST mutations
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  response JSONB NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 201,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup cron
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at
  ON idempotency_keys (created_at);

-- RLS: service role only (admin client)
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
