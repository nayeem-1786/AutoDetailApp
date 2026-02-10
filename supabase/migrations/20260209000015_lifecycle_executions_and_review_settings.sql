-- Migration: Add lifecycle execution tracking and review URL settings
-- Part of Google Review Request automation feature

-- 1a. Add delay_minutes column to lifecycle_rules
ALTER TABLE lifecycle_rules ADD COLUMN delay_minutes integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN lifecycle_rules.delay_minutes IS 'Additional delay in minutes on top of delay_days. Total delay = (delay_days * 1440) + delay_minutes';

-- 1b. Create lifecycle_executions tracking table
CREATE TABLE lifecycle_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_rule_id uuid NOT NULL REFERENCES lifecycle_rules(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  trigger_event text NOT NULL, -- 'appointment_completed' or 'transaction_completed'
  triggered_at timestamptz NOT NULL, -- when the source event happened
  scheduled_for timestamptz NOT NULL, -- when the SMS should fire
  executed_at timestamptz, -- when it actually sent (null = pending)
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped'
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for the cron engine to find pending executions efficiently
CREATE INDEX idx_lifecycle_executions_pending ON lifecycle_executions (status, scheduled_for) WHERE status = 'pending';

-- Index for 30-day dedup: one review request per customer per rule within 30 days
CREATE INDEX idx_lifecycle_executions_dedup ON lifecycle_executions (lifecycle_rule_id, customer_id, created_at);

-- Prevent duplicate execution for same trigger event
CREATE UNIQUE INDEX idx_lifecycle_executions_unique_trigger ON lifecycle_executions (lifecycle_rule_id, COALESCE(appointment_id, '00000000-0000-0000-0000-000000000000'), COALESCE(transaction_id, '00000000-0000-0000-0000-000000000000'));

-- 1c. Insert review URL settings into business_settings
INSERT INTO business_settings (key, value, description) VALUES
  ('google_review_url', '"https://search.google.com/local/writereview?placeid=ChIJf7qNDhW1woAROX-FX8CScGE"', 'Direct Google review link sent to customers'),
  ('yelp_review_url', '"https://www.yelp.com/writeareview/biz/N0pumxDDdjbCk2-_jPxDSw?review_origin=review-feed-war-widget"', 'Direct Yelp review link sent to customers')
ON CONFLICT (key) DO NOTHING;
