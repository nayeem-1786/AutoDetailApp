-- Phase E.2: Global Reusable Blocks
-- Adds is_global + global_name columns to page_content_blocks
-- Creates page_block_placements junction table for shared blocks

-- Add columns to page_content_blocks
ALTER TABLE page_content_blocks ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE page_content_blocks ADD COLUMN global_name TEXT;

-- Junction table for placing global blocks on pages
CREATE TABLE page_block_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'page',
  block_id UUID NOT NULL REFERENCES page_content_blocks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_page_block_unique ON page_block_placements(page_path, block_id);
CREATE INDEX idx_page_block_path ON page_block_placements(page_path, sort_order);

-- RLS
ALTER TABLE page_block_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access page_block_placements"
  ON page_block_placements FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read page_block_placements"
  ON page_block_placements FOR SELECT
  USING (true);
