CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_type vehicle_type NOT NULL DEFAULT 'standard',
  size_class vehicle_size_class, -- NULL for specialty vehicles which use their own tiers
  year INTEGER,
  make TEXT,
  model TEXT,
  color TEXT,
  vin TEXT,
  license_plate TEXT,
  notes TEXT,
  is_incomplete BOOLEAN NOT NULL DEFAULT false, -- flagged when inferred from transactions
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX idx_vehicles_type ON vehicles(vehicle_type);
