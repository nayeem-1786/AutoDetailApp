-- Migration #40: Booking system setup
-- Seeds business_hours and booking_config into business_settings,
-- adds anon SELECT policy on mobile_zones for public booking page.

-- Seed default business hours (Mon-Sat 8am-6pm, Sunday closed)
INSERT INTO business_settings (key, value, description)
VALUES (
  'business_hours',
  '{
    "monday":    {"open": "08:00", "close": "18:00"},
    "tuesday":   {"open": "08:00", "close": "18:00"},
    "wednesday": {"open": "08:00", "close": "18:00"},
    "thursday":  {"open": "08:00", "close": "18:00"},
    "friday":    {"open": "08:00", "close": "18:00"},
    "saturday":  {"open": "08:00", "close": "18:00"},
    "sunday":    null
  }'::jsonb,
  'Business operating hours per day of week. null = closed.'
)
ON CONFLICT (key) DO NOTHING;

-- Seed default booking configuration
INSERT INTO business_settings (key, value, description)
VALUES (
  'booking_config',
  '{
    "advance_days_min": 1,
    "advance_days_max": 30,
    "slot_interval_minutes": 30
  }'::jsonb,
  'Online booking configuration: min/max advance days and slot interval.'
)
ON CONFLICT (key) DO NOTHING;

-- Seed n8n webhook URL placeholder (admin sets the real URL)
INSERT INTO business_settings (key, value, description)
VALUES (
  'n8n_webhook_urls',
  '{
    "booking_created": null,
    "booking_status_changed": null
  }'::jsonb,
  'n8n webhook URLs for workflow automation. Set via admin or directly in DB.'
)
ON CONFLICT (key) DO NOTHING;

-- Allow anonymous users to read mobile zones (for booking page zone selector)
CREATE POLICY mobile_zones_anon_select ON mobile_zones
  FOR SELECT TO anon USING (is_available = true);
