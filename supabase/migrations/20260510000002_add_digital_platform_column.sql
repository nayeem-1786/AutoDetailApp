-- Phase 1A.5 Part A — payments.digital_platform column + biconditional CHECK.
--
-- digital_platform stores the canonical platform identifier (lowercase) for
-- payment rows whose method = 'digital':
--   - 'zelle' | 'venmo' | 'apple_cash' for the 3 fixed options
--   - free-text lowercase otherwise (e.g., 'cash app', 'wise transfer')
--
-- The CHECK constraint enforces a strict biconditional:
--   method = 'digital'  ⇔  digital_platform IS NOT NULL
-- This prevents method='card'/'cash'/'check'/'split' rows from carrying a
-- stale platform value, and prevents method='digital' rows from being
-- inserted without a platform identifier.
--
-- The partial index covers reporting queries that group/filter by platform —
-- excludes non-digital rows from the index to keep it small.

ALTER TABLE payments
  ADD COLUMN digital_platform TEXT NULL;

ALTER TABLE payments
  ADD CONSTRAINT payments_digital_platform_check CHECK (
    (method = 'digital' AND digital_platform IS NOT NULL)
    OR
    (method <> 'digital' AND digital_platform IS NULL)
  );

CREATE INDEX idx_payments_digital_platform
  ON payments (digital_platform)
  WHERE method = 'digital';
