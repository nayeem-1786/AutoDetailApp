-- Recreate phone unique as partial (only active customers)
-- Previously: WHERE phone IS NOT NULL AND phone <> ''
-- Now: WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone <> ''
DROP INDEX IF EXISTS idx_customers_phone_unique;
CREATE UNIQUE INDEX idx_customers_phone_unique ON customers (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone <> ''::text;

-- Recreate email unique as partial (only active customers)
-- Previously: WHERE email IS NOT NULL AND email <> ''
-- Now: WHERE deleted_at IS NULL AND email IS NOT NULL AND email <> ''
DROP INDEX IF EXISTS idx_customers_email_unique;
CREATE UNIQUE INDEX idx_customers_email_unique ON customers (lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL AND email <> ''::text;
