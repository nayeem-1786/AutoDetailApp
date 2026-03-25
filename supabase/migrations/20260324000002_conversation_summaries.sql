-- Add AI-generated conversation summaries for cross-session memory
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;
