CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  type photo_type NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  thumbnail_url TEXT,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  uploaded_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_photos_customer ON photos(customer_id);
CREATE INDEX idx_photos_vehicle ON photos(vehicle_id);
CREATE INDEX idx_photos_appointment ON photos(appointment_id);
CREATE INDEX idx_photos_type ON photos(type);
