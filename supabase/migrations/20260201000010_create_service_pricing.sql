-- Stores tier-based pricing for vehicle_size, scope, and specialty pricing models
CREATE TABLE service_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  tier_name TEXT NOT NULL, -- e.g. 'sedan', 'truck_suv_2row', 'suv_3row_van' for vehicle_size; named tiers for scope; vehicle-type tiers for specialty
  tier_label TEXT, -- display label e.g. 'Floor Mats Only', 'Per Row'
  price DECIMAL(10,2) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  -- For scope tiers that are also vehicle-size-aware (e.g., Hot Shampoo "Complete Interior" tier)
  is_vehicle_size_aware BOOLEAN NOT NULL DEFAULT false,
  vehicle_size_sedan_price DECIMAL(10,2),
  vehicle_size_truck_suv_price DECIMAL(10,2),
  vehicle_size_suv_van_price DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id, tier_name)
);

CREATE INDEX idx_service_pricing_service ON service_pricing(service_id);
