-- Add message column to quote_communications for storing SMS/email body text.
-- Used by the quote reminder cron to check if a reminder was already sent.
ALTER TABLE quote_communications ADD COLUMN IF NOT EXISTS message TEXT;
