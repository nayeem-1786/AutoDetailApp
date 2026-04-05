-- Backfill og_image_url for page_seo rows where it is NULL or empty.
-- Uses product image for product_detail pages, global OG image for everything else.
-- Wraps in DO block for conditional logic and RAISE NOTICE.

DO $$
DECLARE
  v_global_og TEXT;
  v_updated_global INT := 0;
  v_updated_product INT := 0;
BEGIN
  -- Extract global OG image from business_settings (value is stored as JSONB)
  SELECT value #>> '{}' INTO v_global_og
  FROM business_settings
  WHERE key = 'og_image_url';

  -- Trim empty strings
  IF v_global_og IS NOT NULL AND length(trim(v_global_og)) = 0 THEN
    v_global_og := NULL;
  END IF;

  IF v_global_og IS NULL THEN
    RAISE NOTICE 'No global OG image found in business_settings (key: og_image_url). Skipping non-product pages.';
  END IF;

  -- Step 1: Backfill product_detail pages using products.image_url
  -- Parse the product slug from page_path (last segment of /products/{cat}/{slug})
  WITH product_matches AS (
    SELECT
      ps.id AS seo_id,
      COALESCE(p.image_url, v_global_og) AS resolved_image
    FROM page_seo ps
    JOIN products p ON p.slug = split_part(ps.page_path, '/', 4)
      AND p.is_active = true
      AND p.show_on_website = true
    WHERE ps.page_type = 'product_detail'
      AND (ps.og_image_url IS NULL OR trim(ps.og_image_url) = '')
      AND split_part(ps.page_path, '/', 4) != ''
  )
  UPDATE page_seo
  SET og_image_url = pm.resolved_image,
      updated_at = now()
  FROM product_matches pm
  WHERE page_seo.id = pm.seo_id
    AND pm.resolved_image IS NOT NULL;

  GET DIAGNOSTICS v_updated_product = ROW_COUNT;
  RAISE NOTICE 'Updated % product_detail pages with OG images', v_updated_product;

  -- Step 2: Backfill all other pages with the global OG image
  IF v_global_og IS NOT NULL THEN
    UPDATE page_seo
    SET og_image_url = v_global_og,
        updated_at = now()
    WHERE (og_image_url IS NULL OR trim(og_image_url) = '')
      AND (page_type IS DISTINCT FROM 'product_detail');

    GET DIAGNOSTICS v_updated_global = ROW_COUNT;
    RAISE NOTICE 'Updated % non-product pages with global OG image', v_updated_global;
  END IF;

  RAISE NOTICE 'OG image backfill complete: % product pages, % other pages', v_updated_product, v_updated_global;
END $$;
