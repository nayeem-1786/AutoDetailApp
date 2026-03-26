-- Voice call deduplication log
-- Prevents duplicate processing across three paths: agent tool, polling cron, webhook
CREATE TABLE voice_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elevenlabs_conversation_id TEXT UNIQUE NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'processed',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('tool', 'poll', 'webhook'))
);

-- Index for polling cron lookups
CREATE INDEX idx_voice_call_log_processed_at ON voice_call_log (processed_at DESC);
