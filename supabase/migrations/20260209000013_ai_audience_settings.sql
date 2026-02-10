-- Replace single AI toggle with per-audience AI settings
INSERT INTO business_settings (key, value) VALUES
  ('messaging_ai_unknown_enabled', '"true"'),
  ('messaging_ai_customers_enabled', '"false"')
ON CONFLICT (key) DO NOTHING;

-- Remove old keys (replaced by the two new keys above)
DELETE FROM business_settings WHERE key IN ('messaging_ai_enabled', 'messaging_ai_auto_reply');
