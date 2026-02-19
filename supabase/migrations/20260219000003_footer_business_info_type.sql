-- ============================================================================
-- Add 'business_info' content type to footer_columns
-- ============================================================================

-- Drop and recreate the CHECK constraint to include 'business_info'
ALTER TABLE footer_columns DROP CONSTRAINT IF EXISTS footer_columns_content_type_check;
ALTER TABLE footer_columns ADD CONSTRAINT footer_columns_content_type_check
  CHECK (content_type IN ('links', 'html', 'business_info'));

-- Update the existing Contact column to use the new type
UPDATE footer_columns
SET content_type = 'business_info'
WHERE title = 'Contact' AND content_type = 'html';
