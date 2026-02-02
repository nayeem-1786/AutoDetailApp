CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  square_customer_id TEXT UNIQUE,
  square_reference_id TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birthday DATE,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  notes TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  sms_consent BOOLEAN NOT NULL DEFAULT false,
  email_consent BOOLEAN NOT NULL DEFAULT false,
  first_visit_date DATE,
  last_visit_date DATE,
  visit_count INTEGER NOT NULL DEFAULT 0,
  lifetime_spend DECIMAL(10,2) NOT NULL DEFAULT 0,
  loyalty_points_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_phone CHECK (phone ~ '^\+1\d{10}$' OR phone IS NULL)
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_name ON customers(last_name, first_name);
CREATE INDEX idx_customers_square_id ON customers(square_customer_id);
