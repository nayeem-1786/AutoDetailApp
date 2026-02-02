-- Migration #38: Add slugs to services/products + anon RLS policies for public SEO pages

-- Add slug columns to services and products
ALTER TABLE services ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE products ADD COLUMN slug TEXT UNIQUE;

-- Generate slugs from existing names (lowercase, hyphens, no special chars)
UPDATE services SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
UPDATE products SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));

-- Make NOT NULL after backfill
ALTER TABLE services ALTER COLUMN slug SET NOT NULL;
ALTER TABLE products ALTER COLUMN slug SET NOT NULL;

-- Anon SELECT policies (read-only for public visitors)
CREATE POLICY services_anon_select ON services FOR SELECT TO anon USING (is_active = true);
CREATE POLICY service_categories_anon_select ON service_categories FOR SELECT TO anon USING (is_active = true);
CREATE POLICY service_pricing_anon_select ON service_pricing FOR SELECT TO anon USING (true);
CREATE POLICY products_anon_select ON products FOR SELECT TO anon USING (is_active = true);
CREATE POLICY product_categories_anon_select ON product_categories FOR SELECT TO anon USING (is_active = true);
CREATE POLICY business_settings_anon_select ON business_settings FOR SELECT TO anon USING (true);
CREATE POLICY addon_suggestions_anon_select ON service_addon_suggestions FOR SELECT TO anon USING (true);
