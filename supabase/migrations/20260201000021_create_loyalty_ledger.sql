CREATE TABLE loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  action loyalty_action NOT NULL,
  points_change INTEGER NOT NULL, -- positive for earn, negative for redeem
  points_balance INTEGER NOT NULL, -- running balance after this entry
  description TEXT,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_ledger_customer ON loyalty_ledger(customer_id);
CREATE INDEX idx_loyalty_ledger_transaction ON loyalty_ledger(transaction_id);
CREATE INDEX idx_loyalty_ledger_action ON loyalty_ledger(action);
