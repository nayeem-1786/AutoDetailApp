-- Vehicle Category Expansion
-- Adds vehicle_category and specialty_tier to vehicles table,
-- adds category to vehicle_makes table, and seeds specialty vehicle makes.

-- ═══════════════════════════════════════════════════════════════
-- 1. Add vehicle_category to vehicles table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vehicles ADD COLUMN vehicle_category TEXT NOT NULL DEFAULT 'automobile';

ALTER TABLE vehicles ADD CONSTRAINT vehicles_vehicle_category_check
  CHECK (vehicle_category IN ('automobile', 'motorcycle', 'rv', 'boat', 'aircraft'));

CREATE INDEX idx_vehicles_vehicle_category ON vehicles(vehicle_category);

-- ═══════════════════════════════════════════════════════════════
-- 2. Add specialty_tier to vehicles table
-- ═══════════════════════════════════════════════════════════════

-- Stores the pricing tier key for specialty vehicles.
-- Maps directly to service_pricing.tier_name values.
-- NULL for automobiles (they use vehicle_type for pricing resolution).
ALTER TABLE vehicles ADD COLUMN specialty_tier TEXT;

ALTER TABLE vehicles ADD CONSTRAINT vehicles_specialty_tier_check
  CHECK (specialty_tier IS NULL OR specialty_tier IN (
    -- Motorcycle tiers
    'standard_cruiser', 'touring_bagger',
    -- RV tiers
    'rv_up_to_24', 'rv_25_35', 'rv_36_plus',
    -- Boat tiers
    'boat_up_to_20', 'boat_21_26', 'boat_27_32',
    -- Aircraft tiers
    'aircraft_2_4', 'aircraft_6_8', 'aircraft_turboprop'
  ));

-- ═══════════════════════════════════════════════════════════════
-- 3. Add category to vehicle_makes table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vehicle_makes ADD COLUMN category TEXT NOT NULL DEFAULT 'automobile';

ALTER TABLE vehicle_makes ADD CONSTRAINT vehicle_makes_category_check
  CHECK (category IN ('automobile', 'motorcycle', 'rv', 'boat', 'aircraft'));

-- Drop existing unique constraint on name (Honda can be both automobile and motorcycle)
ALTER TABLE vehicle_makes DROP CONSTRAINT IF EXISTS vehicle_makes_name_key;

-- Replace with composite unique (name + category)
ALTER TABLE vehicle_makes ADD CONSTRAINT vehicle_makes_name_category_key UNIQUE(name, category);

CREATE INDEX idx_vehicle_makes_category ON vehicle_makes(category);

-- ═══════════════════════════════════════════════════════════════
-- 4. Seed specialty vehicle makes
-- ═══════════════════════════════════════════════════════════════

-- Motorcycle makes (sort_order 100+)
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Harley-Davidson', 'motorcycle', 101),
  ('Honda', 'motorcycle', 102),
  ('Yamaha', 'motorcycle', 103),
  ('Kawasaki', 'motorcycle', 104),
  ('Ducati', 'motorcycle', 105),
  ('BMW', 'motorcycle', 106),
  ('Triumph', 'motorcycle', 107),
  ('Indian', 'motorcycle', 108),
  ('Suzuki', 'motorcycle', 109),
  ('KTM', 'motorcycle', 110),
  ('Aprilia', 'motorcycle', 111),
  ('Royal Enfield', 'motorcycle', 112);

-- RV makes (sort_order 200+)
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Winnebago', 'rv', 201),
  ('Airstream', 'rv', 202),
  ('Thor', 'rv', 203),
  ('Jayco', 'rv', 204),
  ('Coachmen', 'rv', 205),
  ('Fleetwood', 'rv', 206),
  ('Forest River', 'rv', 207),
  ('Tiffin', 'rv', 208),
  ('Newmar', 'rv', 209),
  ('Entegra', 'rv', 210);

-- Boat makes (sort_order 300+)
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Boston Whaler', 'boat', 301),
  ('Sea Ray', 'boat', 302),
  ('Bayliner', 'boat', 303),
  ('Yamaha', 'boat', 304),
  ('MasterCraft', 'boat', 305),
  ('Malibu', 'boat', 306),
  ('Chaparral', 'boat', 307),
  ('Grady-White', 'boat', 308),
  ('Tracker', 'boat', 309),
  ('Ranger', 'boat', 310);

-- Aircraft makes (sort_order 400+)
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Cessna', 'aircraft', 401),
  ('Piper', 'aircraft', 402),
  ('Beechcraft', 'aircraft', 403),
  ('Cirrus', 'aircraft', 404),
  ('Mooney', 'aircraft', 405),
  ('Diamond', 'aircraft', 406),
  ('Bombardier', 'aircraft', 407),
  ('Gulfstream', 'aircraft', 408),
  ('Pilatus', 'aircraft', 409),
  ('Embraer', 'aircraft', 410);
