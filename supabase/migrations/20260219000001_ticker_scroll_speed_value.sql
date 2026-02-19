-- Add numeric scroll speed value for continuous slider control (1=slowest, 100=fastest)
-- Falls back to scroll_speed enum if null (backward compatible)
ALTER TABLE announcement_tickers
  ADD COLUMN IF NOT EXISTS scroll_speed_value INTEGER DEFAULT 50;

-- Backfill from existing enum values
UPDATE announcement_tickers SET scroll_speed_value = 25 WHERE scroll_speed = 'slow' AND scroll_speed_value = 50;
UPDATE announcement_tickers SET scroll_speed_value = 50 WHERE scroll_speed = 'normal' AND scroll_speed_value = 50;
UPDATE announcement_tickers SET scroll_speed_value = 75 WHERE scroll_speed = 'fast' AND scroll_speed_value = 50;
