-- Create credentials table (mirrors team_members pattern)
-- Stores business credentials, awards, and certifications

CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active credentials"
  ON credentials FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated full access credentials"
  ON credentials FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_credentials_sort_order ON credentials(sort_order);

-- Updated at trigger (reuse existing function)
CREATE TRIGGER set_credentials_updated_at
  BEFORE UPDATE ON credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Migrate existing credentials from page_content_blocks JSON into the new table
DO $$
DECLARE
  block_content TEXT;
  cred JSONB;
  i INTEGER := 0;
BEGIN
  -- Find the credentials block content
  SELECT content INTO block_content
  FROM page_content_blocks
  WHERE block_type = 'credentials'
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF block_content IS NOT NULL THEN
    -- Parse JSON array and insert each credential
    FOR cred IN SELECT * FROM jsonb_array_elements(block_content::jsonb)
    LOOP
      -- Only insert if title is non-empty
      IF cred->>'title' IS NOT NULL AND trim(cred->>'title') <> '' THEN
        INSERT INTO credentials (title, description, image_url, sort_order, is_active)
        VALUES (
          trim(cred->>'title'),
          NULLIF(trim(COALESCE(cred->>'description', '')), ''),
          NULLIF(trim(COALESCE(cred->>'image_url', '')), ''),
          COALESCE((cred->>'sort_order')::integer, i),
          true
        );
        i := i + 1;
      END IF;
    END LOOP;

    RAISE NOTICE 'Migrated % credentials from page_content_blocks', i;
  ELSE
    RAISE NOTICE 'No credentials block found to migrate';
  END IF;
END $$;

-- Add homepage heading settings
INSERT INTO business_settings (key, value)
VALUES
  ('homepage_team_heading', '"Meet the Team"'),
  ('homepage_credentials_heading', '"Credentials & Awards"')
ON CONFLICT (key) DO NOTHING;
