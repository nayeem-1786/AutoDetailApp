-- Add offline_id column to transactions for idempotent offline sync
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS offline_id text;

-- Unique constraint to prevent duplicate syncs
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_offline_id
  ON transactions (offline_id)
  WHERE offline_id IS NOT NULL;
