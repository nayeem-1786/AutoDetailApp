-- Add quote_id to jobs table for audit trail (walk-in mode + quote-to-job conversion)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id);
CREATE INDEX IF NOT EXISTS idx_jobs_quote_id ON jobs(quote_id) WHERE quote_id IS NOT NULL;
