-- Expand page_content_blocks block_type CHECK constraint
-- Adds: team_grid, credentials, terms_sections, gallery
-- Required for CMS Overhaul Phase C (new block type editors)

ALTER TABLE page_content_blocks DROP CONSTRAINT IF EXISTS chk_block_type;

ALTER TABLE page_content_blocks ADD CONSTRAINT chk_block_type
  CHECK (block_type IN (
    'rich_text',
    'faq',
    'features_list',
    'cta',
    'testimonial_highlight',
    'team_grid',
    'credentials',
    'terms_sections',
    'gallery'
  ));
