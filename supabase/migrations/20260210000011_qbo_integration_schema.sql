-- ============================================
-- QuickBooks Online Integration Schema
-- Phase 7.1: Database columns, sync log table,
-- business_settings seeds, and feature flag
-- ============================================

-- ============================================
-- Add QBO columns to existing tables
-- ============================================

-- Customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_customers_qbo_id ON customers(qbo_id) WHERE qbo_id IS NOT NULL;

-- Services
ALTER TABLE services ADD COLUMN IF NOT EXISTS qbo_id TEXT;

-- Products
ALTER TABLE products ADD COLUMN IF NOT EXISTS qbo_id TEXT;

-- Transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qbo_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qbo_sync_status TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qbo_sync_error TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_transactions_qbo_sync_status ON transactions(qbo_sync_status) WHERE qbo_sync_status IS NOT NULL;

-- ============================================
-- QBO Sync Log table
-- ============================================

CREATE TABLE IF NOT EXISTS qbo_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  qbo_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER
);

CREATE INDEX idx_qbo_sync_log_entity ON qbo_sync_log(entity_type, entity_id);
CREATE INDEX idx_qbo_sync_log_status ON qbo_sync_log(status);
CREATE INDEX idx_qbo_sync_log_created ON qbo_sync_log(created_at DESC);

-- ============================================
-- RLS for qbo_sync_log
-- ============================================

ALTER TABLE qbo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync log"
  ON qbo_sync_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage sync log"
  ON qbo_sync_log FOR ALL TO service_role USING (true);

-- ============================================
-- Seed business_settings for QBO config
-- ============================================

INSERT INTO business_settings (key, value) VALUES
  ('qbo_client_id', '""'),
  ('qbo_client_secret', '""'),
  ('qbo_access_token', '""'),
  ('qbo_refresh_token', '""'),
  ('qbo_realm_id', '""'),
  ('qbo_token_expires_at', '""'),
  ('qbo_enabled', '"false"'),
  ('qbo_auto_sync_transactions', '"true"'),
  ('qbo_auto_sync_customers', '"true"'),
  ('qbo_auto_sync_catalog', '"true"'),
  ('qbo_environment', '"sandbox"'),
  ('qbo_last_sync_at', '""'),
  ('qbo_income_account_id', '""'),
  ('qbo_default_payment_method_id', '""')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Feature flag for QBO integration
-- ============================================

INSERT INTO feature_flags (key, name, description, enabled) VALUES
  ('qbo_enabled', 'QuickBooks Online Integration', 'Sync transactions, customers, and catalog items to QuickBooks Online for accounting.', false)
ON CONFLICT (key) DO NOTHING;
