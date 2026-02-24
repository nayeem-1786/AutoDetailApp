-- Vehicle Makes reference table
CREATE TABLE vehicle_makes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with common makes
INSERT INTO vehicle_makes (name, sort_order) VALUES
  ('Acura', 1),
  ('Alfa Romeo', 2),
  ('Aston Martin', 3),
  ('Audi', 4),
  ('Bentley', 5),
  ('BMW', 6),
  ('Buick', 7),
  ('Cadillac', 8),
  ('Chevrolet', 9),
  ('Chrysler', 10),
  ('Dodge', 11),
  ('Ferrari', 12),
  ('Fiat', 13),
  ('Ford', 14),
  ('Genesis', 15),
  ('GMC', 16),
  ('Honda', 17),
  ('Hyundai', 18),
  ('Infiniti', 19),
  ('Jaguar', 20),
  ('Jeep', 21),
  ('Kia', 22),
  ('Lamborghini', 23),
  ('Land Rover', 24),
  ('Lexus', 25),
  ('Lincoln', 26),
  ('Lotus', 27),
  ('Lucid', 28),
  ('Maserati', 29),
  ('Mazda', 30),
  ('McLaren', 31),
  ('Mercedes-Benz', 32),
  ('Mini', 33),
  ('Mitsubishi', 34),
  ('Nissan', 35),
  ('Polestar', 36),
  ('Porsche', 37),
  ('RAM', 38),
  ('Rivian', 39),
  ('Rolls-Royce', 40),
  ('Subaru', 41),
  ('Tesla', 42),
  ('Toyota', 43),
  ('Volkswagen', 44),
  ('Volvo', 45);

-- Enable RLS
ALTER TABLE vehicle_makes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "vehicle_makes_read" ON vehicle_makes
  FOR SELECT TO authenticated USING (true);

-- Only admins can write (matches existing admin policy pattern)
CREATE POLICY "vehicle_makes_admin_write" ON vehicle_makes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.auth_user_id = auth.uid()
      AND employees.role_id IN (
        SELECT id FROM roles WHERE name IN ('owner', 'admin')
      )
    )
  );
