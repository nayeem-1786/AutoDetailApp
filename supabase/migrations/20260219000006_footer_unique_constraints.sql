-- Deduplicate footer links before adding unique constraints
-- Keep the row with the lowest id for each (footer_column_id, label, url) combo
DELETE FROM website_navigation a
USING website_navigation b
WHERE a.footer_column_id IS NOT NULL
  AND b.footer_column_id IS NOT NULL
  AND a.footer_column_id = b.footer_column_id
  AND a.label = b.label AND a.url = b.url
  AND a.id > b.id;

-- Deduplicate bottom links
DELETE FROM footer_bottom_links a
USING footer_bottom_links b
WHERE a.label = b.label AND a.url = b.url
  AND a.id > b.id;

-- Partial unique index: only enforced for footer links (not header nav items)
CREATE UNIQUE INDEX IF NOT EXISTS unique_footer_link_per_column
  ON website_navigation (footer_column_id, label, url)
  WHERE footer_column_id IS NOT NULL;

-- Unique constraint on bottom bar links
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_bottom_link'
  ) THEN
    ALTER TABLE footer_bottom_links
      ADD CONSTRAINT unique_bottom_link UNIQUE (label, url);
  END IF;
END $$;
