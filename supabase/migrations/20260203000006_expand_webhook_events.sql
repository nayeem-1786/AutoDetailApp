UPDATE business_settings
SET value = value || '{"quote_created":null,"quote_sent":null,"quote_accepted":null,"appointment_confirmed":null,"appointment_cancelled":null,"appointment_rescheduled":null,"appointment_completed":null}'::jsonb
WHERE key = 'n8n_webhook_urls';
