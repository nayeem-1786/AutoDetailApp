-- Add metadata JSONB to messages for notification context
-- Stores: { "notificationType": "job_complete", "contextId": "<entity-uuid>" }
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Add last notification tracking to conversations for AI reply context
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_notification_type TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMPTZ;

-- Index for notification type lookups
CREATE INDEX IF NOT EXISTS idx_messages_metadata_notification_type
  ON messages ((metadata->>'notificationType'))
  WHERE metadata IS NOT NULL;
