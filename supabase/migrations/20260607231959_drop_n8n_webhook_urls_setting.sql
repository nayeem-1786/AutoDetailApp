-- Phase 3 Theme G — drop dormant n8n_webhook_urls business_settings row.
--
-- `n8n_webhook_urls` is NOT a column on `business_settings` — that table is a
-- typed key/value store, and `n8n_webhook_urls` is one of its rows (value =
-- JSONB map of event-name → URL, all values `null` in production). Seeded
-- by `20260201000040_booking_setup.sql:36-45`; extended with additional
-- event keys by `20260203000006_expand_webhook_events.sql`. Both seeds
-- supplied placeholders; no admin UI or admin endpoint ever populated them.
--
-- Per the Webhook Receivers Identity Audit (`f5e714a8`, 2026-06-05):
--   "There is no webhook receiver in production. `business_settings.
--   n8n_webhook_urls` is seeded with all-`null` values at install ...
--   Operator has confirmed Smart Details does not run n8n."
--
-- Theme G removes the `fireWebhook` infrastructure that read this row at
-- request time (23 fire sites across 18 prod files + the `WebhookEvent`
-- union type + the helper function itself), then closes the loop by
-- deleting the now-orphaned row so no future code can ambiguously look
-- it up. Customer-facing dispatch for every lifecycle event the webhook
-- previously routed (booking_created / appointment_confirmed / cancelled
-- / rescheduled / completed / quote_created / sent / accepted /
-- campaign_send) is handled inline via sendSms + sendEmail + audit_log +
-- supabase realtime channels.

DELETE FROM business_settings WHERE key = 'n8n_webhook_urls';

-- Defensive verification: the row must be gone after this migration.
-- Idempotent — re-running the migration succeeds (DELETE of zero rows is
-- not an error; the verification block only fails if the row reappears,
-- which would imply a stray INSERT was added between this migration and
-- the next run).
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM business_settings
  WHERE key = 'n8n_webhook_urls';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'n8n_webhook_urls business_settings row still present (count=%) after Theme G drop', v_remaining;
  END IF;
END $$;
