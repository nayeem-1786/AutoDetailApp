-- Add prerequisite_note column to transaction_items
-- Stores prerequisite satisfaction context:
--   "Prereq met: Single-Stage Polish (3/1/26)"
--   "Prereq overridden by John Smith"
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS prerequisite_note TEXT DEFAULT NULL;
