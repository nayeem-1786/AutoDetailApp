-- Change access_token from UUID to TEXT to support short alphanumeric tokens
ALTER TABLE quotes ALTER COLUMN access_token TYPE TEXT USING access_token::TEXT;
ALTER TABLE quotes ALTER COLUMN access_token SET DEFAULT NULL;
