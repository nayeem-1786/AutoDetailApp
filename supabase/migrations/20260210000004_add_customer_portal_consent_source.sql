-- Add 'customer_portal' to sms_consent_log source CHECK constraint
ALTER TABLE sms_consent_log DROP CONSTRAINT IF EXISTS sms_consent_log_source_check;
ALTER TABLE sms_consent_log ADD CONSTRAINT sms_consent_log_source_check
  CHECK (source IN ('inbound_sms', 'admin_manual', 'unsubscribe_page', 'booking_form', 'customer_portal', 'system'));
