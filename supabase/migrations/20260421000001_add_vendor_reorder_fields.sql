-- Session 42B: Add vendor reorder metadata fields to products.
--
-- Context: ~90% of products are vendor-branded where products.sku
-- holds the vendor UPC used for POS scanning. For reordering, some
-- vendors use their internal part numbers (not UPC), and their
-- product names often differ from user's display names. These two
-- new columns capture that reorder-time metadata.
--
-- Both columns are nullable. Existing rows are unaffected.
-- No backfill — fields populate manually over time during PO prep.

ALTER TABLE products
  ADD COLUMN vendor_sku TEXT,
  ADD COLUMN vendor_product_name TEXT;

COMMENT ON COLUMN products.vendor_sku IS
  'Vendor''s internal part number or SKU used for reordering. May differ from products.sku (which is the scan code / UPC).';
COMMENT ON COLUMN products.vendor_product_name IS
  'Vendor''s name for the product as it appears on their invoices / POs. May differ from products.name (user-facing display name).';
