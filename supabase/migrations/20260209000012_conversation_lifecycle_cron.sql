-- Conversation lifecycle automation: auto-close and auto-archive
-- Settings are configurable via Admin > Settings > Messaging

-- Seed default settings
INSERT INTO business_settings (key, value) VALUES
  ('messaging_auto_close_hours', '"48"'),
  ('messaging_auto_archive_days', '"30"')
ON CONFLICT (key) DO NOTHING;

-- Enable pg_cron extension (must be enabled by Supabase support or via dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to auto-close stale open conversations and auto-archive old closed ones
CREATE OR REPLACE FUNCTION auto_close_and_archive_conversations()
RETURNS void AS $$
DECLARE
  close_hours integer;
  archive_days integer;
  closed_conv RECORD;
  archived_conv RECORD;
BEGIN
  -- Read settings (values stored as JSON strings, e.g. "48")
  SELECT COALESCE(NULLIF(TRIM(BOTH '"' FROM value::text), ''), '0')::integer
    INTO close_hours
    FROM business_settings WHERE key = 'messaging_auto_close_hours';

  SELECT COALESCE(NULLIF(TRIM(BOTH '"' FROM value::text), ''), '0')::integer
    INTO archive_days
    FROM business_settings WHERE key = 'messaging_auto_archive_days';

  -- Default fallbacks if settings missing
  close_hours := COALESCE(close_hours, 48);
  archive_days := COALESCE(archive_days, 30);

  -- Auto-close (skip if 0 = never)
  IF close_hours > 0 THEN
    FOR closed_conv IN
      UPDATE conversations
      SET status = 'closed', updated_at = now()
      WHERE status = 'open'
        AND last_message_at < now() - make_interval(hours => close_hours)
      RETURNING id
    LOOP
      INSERT INTO messages (conversation_id, direction, body, sender_type, status)
      VALUES (closed_conv.id, 'outbound',
        'Conversation closed — no activity for ' || close_hours || ' hours',
        'system', 'delivered');
    END LOOP;
  END IF;

  -- Auto-archive (skip if 0 = never)
  IF archive_days > 0 THEN
    FOR archived_conv IN
      UPDATE conversations
      SET status = 'archived', updated_at = now()
      WHERE status = 'closed'
        AND updated_at < now() - make_interval(days => archive_days)
      RETURNING id
    LOOP
      INSERT INTO messages (conversation_id, direction, body, sender_type, status)
      VALUES (archived_conv.id, 'outbound',
        'Conversation archived after ' || archive_days || ' days',
        'system', 'delivered');
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule to run every hour
SELECT cron.schedule(
  'conversation-lifecycle',
  '0 * * * *',
  $$SELECT auto_close_and_archive_conversations()$$
);
