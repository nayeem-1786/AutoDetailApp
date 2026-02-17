-- Shipping settings table (singleton)
CREATE TABLE IF NOT EXISTS shipping_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Shippo API
  shippo_api_key_live TEXT,
  shippo_api_key_test TEXT,
  shippo_mode TEXT NOT NULL DEFAULT 'test'
    CHECK (shippo_mode IN ('test', 'live')),

  -- Ship-from address (business address)
  ship_from_name TEXT NOT NULL DEFAULT '',
  ship_from_company TEXT,
  ship_from_street1 TEXT NOT NULL DEFAULT '',
  ship_from_street2 TEXT,
  ship_from_city TEXT NOT NULL DEFAULT '',
  ship_from_state TEXT NOT NULL DEFAULT 'CA',
  ship_from_zip TEXT NOT NULL DEFAULT '',
  ship_from_country TEXT NOT NULL DEFAULT 'US',
  ship_from_phone TEXT,
  ship_from_email TEXT,

  -- Default package dimensions (fallback when product doesn't specify)
  default_parcel_length DECIMAL(8,2) DEFAULT 10,
  default_parcel_width DECIMAL(8,2) DEFAULT 8,
  default_parcel_height DECIMAL(8,2) DEFAULT 4,
  default_parcel_distance_unit TEXT DEFAULT 'in',
  default_parcel_weight DECIMAL(8,2) DEFAULT 1,
  default_parcel_mass_unit TEXT DEFAULT 'lb',

  -- Shipping options
  offer_free_shipping BOOLEAN DEFAULT false,
  free_shipping_threshold INTEGER DEFAULT 0,       -- in cents, 0 = no free shipping
  flat_rate_enabled BOOLEAN DEFAULT false,
  flat_rate_amount INTEGER DEFAULT 0,              -- in cents

  -- Carrier preferences
  enabled_carriers JSONB DEFAULT '[]'::jsonb,      -- e.g. ["usps", "ups", "fedex"]
  enabled_service_levels JSONB DEFAULT '[]'::jsonb, -- empty = show all

  -- Handling fee
  handling_fee_type TEXT DEFAULT 'none'
    CHECK (handling_fee_type IN ('none', 'flat', 'percent')),
  handling_fee_amount DECIMAL(8,2) DEFAULT 0,

  -- Display preferences
  show_estimated_delivery BOOLEAN DEFAULT true,
  show_carrier_logo BOOLEAN DEFAULT true,
  sort_rates_by TEXT DEFAULT 'price'
    CHECK (sort_rates_by IN ('price', 'speed')),

  -- Local pickup
  local_pickup_enabled BOOLEAN DEFAULT true,
  local_pickup_address TEXT,
  local_pickup_instructions TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed singleton row
INSERT INTO shipping_settings (id) VALUES (gen_random_uuid());

-- updated_at trigger
CREATE TRIGGER tr_shipping_settings_updated_at
  BEFORE UPDATE ON shipping_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE shipping_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_shipping_settings" ON shipping_settings
  FOR ALL USING (auth.role() = 'service_role');

-- Admin/super_admin can read via RLS (settings pages use createClient)
CREATE POLICY "admin_read_shipping_settings" ON shipping_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.auth_user_id = auth.uid()
      AND employees.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "admin_write_shipping_settings" ON shipping_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.auth_user_id = auth.uid()
      AND employees.role IN ('super_admin', 'admin')
    )
  );
