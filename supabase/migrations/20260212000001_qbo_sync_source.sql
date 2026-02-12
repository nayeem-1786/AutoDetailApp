-- Add source column to qbo_sync_log for tracking auto vs manual vs pos_hook syncs
ALTER TABLE qbo_sync_log ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Seed the auto-sync interval business setting
INSERT INTO business_settings (key, value)
VALUES ('qbo_auto_sync_interval', '"30"')
ON CONFLICT (key) DO NOTHING;
