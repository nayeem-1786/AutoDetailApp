CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  pricing_model pricing_model NOT NULL,
  classification service_classification NOT NULL DEFAULT 'primary',
  base_duration_minutes INTEGER NOT NULL DEFAULT 60,
  flat_price DECIMAL(10,2), -- for pricing_model = 'flat'
  custom_starting_price DECIMAL(10,2), -- for pricing_model = 'custom'
  per_unit_price DECIMAL(10,2), -- for pricing_model = 'per_unit'
  per_unit_max INTEGER, -- max units for per_unit
  per_unit_label TEXT, -- e.g. 'panel', 'seat'
  mobile_eligible BOOLEAN NOT NULL DEFAULT false,
  online_bookable BOOLEAN NOT NULL DEFAULT true,
  staff_assessed BOOLEAN NOT NULL DEFAULT false,
  is_taxable BOOLEAN NOT NULL DEFAULT false, -- services generally not taxed
  vehicle_compatibility JSONB NOT NULL DEFAULT '["standard"]'::jsonb, -- array of vehicle_type values
  special_requirements TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_category ON services(category_id);
CREATE INDEX idx_services_pricing_model ON services(pricing_model);
CREATE INDEX idx_services_classification ON services(classification);
CREATE INDEX idx_services_active ON services(is_active);
