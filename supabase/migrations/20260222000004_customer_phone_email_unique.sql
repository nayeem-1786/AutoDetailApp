-- Add unique constraints on customer phone and email
-- Prevents duplicate customers with same contact info

-- Clean up known test duplicate (John Doe, $0 spend, created 2026-02-22)
DELETE FROM customers
WHERE first_name = 'John' AND last_name = 'Doe'
  AND lifetime_spend = 0
  AND phone = '+14243637450'
  AND created_at >= '2026-02-22'::date;

-- Partial unique index on phone (allows multiple NULLs and empty strings)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
  ON customers (phone)
  WHERE phone IS NOT NULL AND phone != '';

-- Partial unique index on email (case-insensitive, allows multiple NULLs and empty strings)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
  ON customers (LOWER(email))
  WHERE email IS NOT NULL AND email != '';
