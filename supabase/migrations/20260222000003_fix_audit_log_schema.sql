-- Fix audit_log schema: migration 20260201000033 created old schema,
-- migration 20260222000002 was IF NOT EXISTS (no-op).
-- Drop and recreate with the correct schema.

-- Drop old table, indexes, and policies
DROP TABLE IF EXISTS audit_log CASCADE;

-- Recreate with correct schema
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  employee_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  details JSONB,
  ip_address TEXT,
  source TEXT DEFAULT 'admin' NOT NULL
);

-- Indexes
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_type_action ON audit_log(entity_type, action, created_at DESC);

-- Enable RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read (super_admin enforced at app level)
CREATE POLICY "Authenticated users can read audit_log"
  ON audit_log FOR SELECT TO authenticated USING (true);

-- Only service role can insert (app inserts via admin client)
CREATE POLICY "Service role can insert audit_log"
  ON audit_log FOR INSERT TO service_role WITH CHECK (true);

-- Service role can delete (for retention cleanup cron)
CREATE POLICY "Service role can delete audit_log"
  ON audit_log FOR DELETE TO service_role USING (true);

-- No UPDATE policies — audit logs are immutable
