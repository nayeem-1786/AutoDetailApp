CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  tip_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  tip_net DECIMAL(10,2) NOT NULL DEFAULT 0, -- tip minus CC fee deduction
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  card_brand TEXT,
  card_last_four TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_transaction ON payments(transaction_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);
