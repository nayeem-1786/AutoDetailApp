-- ============================================================================
-- Footer Brand Column & Per-Column Width Config
-- Adds 'brand' content type, config JSONB column, seeds brand column,
-- and sets default col_span values for the 12-unit grid system.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add config JSONB column to footer_columns
-- ---------------------------------------------------------------------------
ALTER TABLE footer_columns ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 2. Expand content_type CHECK to include 'brand'
-- ---------------------------------------------------------------------------
ALTER TABLE footer_columns DROP CONSTRAINT IF EXISTS footer_columns_content_type_check;
ALTER TABLE footer_columns ADD CONSTRAINT footer_columns_content_type_check
  CHECK (content_type IN ('links', 'html', 'business_info', 'brand'));

-- ---------------------------------------------------------------------------
-- 3. Shift existing columns' sort_order up by 1 and insert brand column first
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  main_section_id UUID;
  col_count INTEGER;
  default_span INTEGER;
BEGIN
  SELECT id INTO main_section_id FROM footer_sections WHERE section_key = 'main';

  -- Shift existing columns forward
  UPDATE footer_columns
  SET sort_order = sort_order + 1
  WHERE section_id = main_section_id;

  -- Insert brand column at position 0
  INSERT INTO footer_columns (section_id, title, content_type, sort_order, is_enabled, config)
  VALUES (
    main_section_id,
    '',
    'brand',
    0,
    true,
    '{"logo_width": 160, "show_phone": true, "show_email": true, "show_address": true, "show_reviews": true, "tagline": "Professional auto detailing and ceramic coating specialists serving the South Bay area. We bring premium car care directly to you.", "col_span": 4}'
  );

  -- Count total enabled columns now (including brand)
  SELECT COUNT(*) INTO col_count
  FROM footer_columns
  WHERE section_id = main_section_id;

  -- Set default col_span for existing columns (distribute 12 evenly)
  -- Brand gets 4, remaining columns split the rest (8)
  IF col_count > 1 THEN
    default_span := 8 / (col_count - 1);
    -- Give remaining span to ensure total = 12
    UPDATE footer_columns
    SET config = jsonb_set(COALESCE(config, '{}'), '{col_span}', to_jsonb(default_span))
    WHERE section_id = main_section_id
      AND content_type != 'brand';
  END IF;
END $$;
