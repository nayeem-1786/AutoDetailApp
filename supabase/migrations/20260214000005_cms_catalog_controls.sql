-- CMS Catalog Display Controls: add website visibility columns to products and services

-- Products: show_on_website, is_featured, website_sort_order
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_products_website ON products (show_on_website, is_featured, website_sort_order)
  WHERE show_on_website = true;

-- Services: show_on_website, is_featured (display_order already exists)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_services_website ON services (show_on_website, is_featured, display_order)
  WHERE show_on_website = true;
