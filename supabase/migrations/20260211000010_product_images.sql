-- Product Images table: supports up to 5 images per product with ordering and primary selection
-- The DB trigger auto-syncs the primary image back to products.image_url so all existing
-- display locations (POS, public pages, admin list, SEO) continue working unchanged.

-- Create table
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one primary image per product
CREATE UNIQUE INDEX idx_product_images_one_primary
  ON product_images (product_id)
  WHERE is_primary = true;

-- Fast lookups by product, ordered by sort
CREATE INDEX idx_product_images_product_sort
  ON product_images (product_id, sort_order);

-- Trigger function: sync primary image to products.image_url
CREATE OR REPLACE FUNCTION sync_product_primary_image()
RETURNS TRIGGER AS $$
DECLARE
  target_product_id UUID;
  primary_url TEXT;
BEGIN
  -- Determine which product was affected
  IF TG_OP = 'DELETE' THEN
    target_product_id := OLD.product_id;
  ELSE
    target_product_id := NEW.product_id;
  END IF;

  -- Find the primary image URL (or NULL if none)
  SELECT image_url INTO primary_url
  FROM product_images
  WHERE product_id = target_product_id AND is_primary = true
  LIMIT 1;

  -- Update products.image_url
  UPDATE products
  SET image_url = primary_url, updated_at = now()
  WHERE id = target_product_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Wire the trigger
CREATE TRIGGER trg_sync_product_primary_image
  AFTER INSERT OR UPDATE OR DELETE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION sync_product_primary_image();

-- RLS
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product_images"
  ON product_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product_images"
  ON product_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product_images"
  ON product_images FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product_images"
  ON product_images FOR DELETE
  TO authenticated
  USING (true);

-- Data migration: copy existing products.image_url into product_images
-- Extract storage_path from the public URL pattern:
--   https://<project>.supabase.co/storage/v1/object/public/product-images/<path>
INSERT INTO product_images (product_id, image_url, storage_path, sort_order, is_primary)
SELECT
  id,
  image_url,
  CASE
    WHEN image_url LIKE '%/storage/v1/object/public/product-images/%'
    THEN substring(image_url FROM '/storage/v1/object/public/product-images/(.+)$')
    ELSE 'unknown/' || id
  END,
  0,
  true
FROM products
WHERE image_url IS NOT NULL AND image_url != '';
