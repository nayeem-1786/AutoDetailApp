CREATE TABLE lifecycle_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_service_id UUID REFERENCES services(id) ON DELETE CASCADE, -- NULL = any service
  trigger_condition TEXT NOT NULL DEFAULT 'after_service', -- 'after_service', 'no_visit', 'birthday'
  delay_days INTEGER NOT NULL DEFAULT 0,
  action lifecycle_action NOT NULL DEFAULT 'sms',
  sms_template TEXT,
  email_subject TEXT,
  email_template TEXT,
  coupon_type coupon_type,
  coupon_value DECIMAL(10,2),
  coupon_expiry_days INTEGER,
  chain_order INTEGER NOT NULL DEFAULT 1, -- for multi-step sequences
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_vehicle_aware BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lifecycle_rules_trigger ON lifecycle_rules(trigger_service_id);
CREATE INDEX idx_lifecycle_rules_active ON lifecycle_rules(is_active);
