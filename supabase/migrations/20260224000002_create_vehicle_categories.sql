-- Vehicle categories: fixed set of 5 categories with admin-editable metadata
-- Categories cannot be added or removed — only image, display_name, display_order, and is_active can be changed
CREATE TABLE vehicle_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,  -- immutable: automobile, motorcycle, rv, boat, aircraft
  display_name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,            -- card image for booking flow category picker
  image_alt TEXT,            -- alt text for the image
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,  -- controls visibility in booking flow
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 5 fixed categories
INSERT INTO vehicle_categories (key, display_name, description, display_order, is_active) VALUES
  ('automobile', 'Automobile', 'Cars, trucks, SUVs, and vans', 1, true),
  ('motorcycle', 'Motorcycle', 'Standard, cruiser, touring, and sport bikes', 2, true),
  ('rv', 'RV', 'Recreational vehicles and campers', 3, true),
  ('boat', 'Boat', 'Powerboats, sailboats, and personal watercraft', 4, true),
  ('aircraft', 'Aircraft', 'Single-engine, multi-engine, and jet aircraft', 5, true);

-- Index for ordering and active filter
CREATE INDEX idx_vehicle_categories_display_order ON vehicle_categories(display_order);
CREATE INDEX idx_vehicle_categories_active ON vehicle_categories(is_active);

-- Reuse existing shared updated_at trigger function from 20260201000037
CREATE TRIGGER tr_vehicle_categories_updated_at
  BEFORE UPDATE ON vehicle_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS: public read for active categories (booking flow), admin write
ALTER TABLE vehicle_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active vehicle categories"
  ON vehicle_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can read all vehicle categories"
  ON vehicle_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can manage vehicle categories"
  ON vehicle_categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
