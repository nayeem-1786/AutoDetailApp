-- Fix section_position column: change from INTEGER to TEXT
-- The column was created as INTEGER but the app stores string position identifiers
-- (after_hero, after_services, after_reviews, before_cta, before_footer)

ALTER TABLE announcement_tickers
  ALTER COLUMN section_position TYPE TEXT USING section_position::TEXT;

ALTER TABLE announcement_tickers
  ADD CONSTRAINT announcement_tickers_section_position_check
  CHECK (section_position IS NULL OR section_position IN (
    'after_hero', 'after_services', 'after_reviews', 'before_cta', 'before_footer'
  ));
