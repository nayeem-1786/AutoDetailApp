-- Realtime sync toggle (default: enabled)
-- When OFF, POS hooks skip immediate QBO sync — transactions only sync at EOD close or via background cron.
INSERT INTO business_settings (key, value)
VALUES ('qbo_realtime_sync', '"true"')
ON CONFLICT (key) DO NOTHING;
