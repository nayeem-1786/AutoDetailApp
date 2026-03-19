-- Add soft delete column
ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index: all queries filtering active customers benefit from this
CREATE INDEX idx_customers_active ON customers (id) WHERE deleted_at IS NULL;

-- Partial index on phone for duplicate detection (only active customers)
CREATE INDEX idx_customers_active_phone ON customers (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN customers.deleted_at IS 'Soft delete timestamp. NULL = active. Set = archived.';
