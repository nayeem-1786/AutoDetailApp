-- Add access_token to transactions for public receipt links
ALTER TABLE transactions ADD COLUMN access_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX idx_transactions_access_token ON transactions(access_token);

-- Backfill existing transactions
UPDATE transactions SET access_token = gen_random_uuid() WHERE access_token IS NULL;

-- Now enforce NOT NULL
ALTER TABLE transactions ALTER COLUMN access_token SET NOT NULL;
