-- Page content blocks: rich content sections for any page
CREATE TABLE page_content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL,
  page_type TEXT NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'rich_text',
  title TEXT,
  content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_block_type CHECK (block_type IN ('rich_text', 'faq', 'features_list', 'cta', 'testimonial_highlight'))
);

-- Fast lookup by page path + ordering
CREATE INDEX idx_page_content_blocks_path ON page_content_blocks(page_path, sort_order);
CREATE INDEX idx_page_content_blocks_active ON page_content_blocks(page_path, is_active, sort_order);

-- RLS
ALTER TABLE page_content_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active blocks"
  ON page_content_blocks FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated can manage blocks"
  ON page_content_blocks FOR ALL
  USING (auth.role() = 'authenticated');

-- Add body_content column to city_landing_pages for backward compat
ALTER TABLE city_landing_pages ADD COLUMN IF NOT EXISTS body_content TEXT;
