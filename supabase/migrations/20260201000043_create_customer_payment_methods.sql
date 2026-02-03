-- Card-to-customer mapping for auto-recognition
CREATE TABLE customer_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  card_fingerprint TEXT NOT NULL UNIQUE,
  card_brand TEXT,
  card_last_four TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cpm_customer ON customer_payment_methods(customer_id);
CREATE INDEX idx_cpm_fingerprint ON customer_payment_methods(card_fingerprint);

-- Also store fingerprint on individual payments for audit trail
ALTER TABLE payments ADD COLUMN card_fingerprint TEXT;
