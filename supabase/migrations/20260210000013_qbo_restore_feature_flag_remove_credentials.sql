-- ============================================
-- Restore qbo_enabled feature flag as master toggle
-- Remove credentials and qbo_enabled from business_settings
-- Credentials now live in .env.local (QBO_CLIENT_ID, QBO_CLIENT_SECRET)
-- ============================================

-- Ensure feature flag exists (may have been removed)
INSERT INTO feature_flags (key, name, description, enabled)
VALUES (
  'qbo_enabled',
  'QuickBooks Online Integration',
  'Sync transactions, customers, and catalog items to QuickBooks Online for accounting.',
  false
)
ON CONFLICT (key) DO NOTHING;

-- Remove credentials from business_settings (now in env vars)
DELETE FROM business_settings WHERE key IN ('qbo_client_id', 'qbo_client_secret');

-- Remove qbo_enabled from business_settings (feature_flags is source of truth)
DELETE FROM business_settings WHERE key = 'qbo_enabled';
