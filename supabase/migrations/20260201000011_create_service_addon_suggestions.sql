CREATE TABLE service_addon_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  addon_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  combo_price DECIMAL(10,2), -- optional discounted combo price
  display_order INTEGER NOT NULL DEFAULT 0,
  auto_suggest BOOLEAN NOT NULL DEFAULT true,
  is_seasonal BOOLEAN NOT NULL DEFAULT false,
  seasonal_start DATE,
  seasonal_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(primary_service_id, addon_service_id),
  CHECK (primary_service_id != addon_service_id)
);

CREATE INDEX idx_addon_suggestions_primary ON service_addon_suggestions(primary_service_id);
CREATE INDEX idx_addon_suggestions_addon ON service_addon_suggestions(addon_service_id);
