-- Short links table for self-hosted URL shortening (SMS-friendly)

CREATE TABLE short_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  click_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Index for fast code lookups
CREATE INDEX idx_short_links_code ON short_links (code);

-- Atomic click counter
CREATE OR REPLACE FUNCTION increment_short_link_click(p_code TEXT)
RETURNS TABLE(target_url TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql
AS $$
  UPDATE short_links
  SET click_count = click_count + 1
  WHERE code = p_code
  RETURNING target_url, expires_at;
$$;
