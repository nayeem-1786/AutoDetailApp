-- Email Verification System
-- Adds verification codes table and email_verified_at column to customers

-- New table: email_verification_codes
CREATE TABLE IF NOT EXISTS email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_verification_codes_customer_email
  ON email_verification_codes (customer_id, email);

CREATE INDEX idx_email_verification_codes_expires_at
  ON email_verification_codes (expires_at);

-- RLS — all access via service-role client
ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

-- New column on customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill: trust existing emails, do NOT change email_consent
UPDATE customers
SET email_verified_at = now()
WHERE email IS NOT NULL
  AND email <> ''
  AND email_verified_at IS NULL;
