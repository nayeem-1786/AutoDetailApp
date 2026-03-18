-- Sale history: archive past sales when ended or overwritten
CREATE TABLE sale_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was on sale (one of these will be set)
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,

  -- Sale identity
  sale_name TEXT,

  -- Pricing snapshot (JSONB to handle all pricing models)
  pricing_snapshot JSONB NOT NULL,

  -- The pricing model at time of sale (for display purposes)
  pricing_model TEXT,

  -- Sale window
  sale_starts_at TIMESTAMPTZ,
  sale_ends_at TIMESTAMPTZ,

  -- How the sale ended
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_reason TEXT NOT NULL DEFAULT 'manual',

  -- Audit
  ended_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sale_history_service ON sale_history(service_id)
  WHERE service_id IS NOT NULL;
CREATE INDEX idx_sale_history_product ON sale_history(product_id)
  WHERE product_id IS NOT NULL;
CREATE INDEX idx_sale_history_ended_at ON sale_history(ended_at DESC);

-- CHECK: exactly one of service_id or product_id must be set
ALTER TABLE sale_history ADD CONSTRAINT chk_sale_history_item
  CHECK (
    (service_id IS NOT NULL AND product_id IS NULL) OR
    (service_id IS NULL AND product_id IS NOT NULL)
  );
