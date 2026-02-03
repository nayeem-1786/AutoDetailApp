ALTER TABLE quotes ADD COLUMN access_token UUID DEFAULT gen_random_uuid();
CREATE INDEX idx_quotes_access_token ON quotes(access_token);
