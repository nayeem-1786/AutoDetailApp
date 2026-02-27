-- ---------------------------------------------------------------------------
-- Remove migrated business_settings keys
-- These keys were migrated to the team_members table and page_content_blocks
-- in Phase D.1 of the CMS Overhaul.
-- ---------------------------------------------------------------------------

DELETE FROM business_settings
WHERE key IN (
  'team_members',
  'credentials',
  'about_text',
  'terms_and_conditions',
  'terms_effective_date'
);
