-- Fix: RLS policy for product_enrichment_drafts
-- Table has RLS enabled but no policies — browser client returns 0 rows.
-- Only SELECT needed: all writes go through API routes with createAdminClient().

CREATE POLICY "Authenticated users can read enrichment drafts"
  ON product_enrichment_drafts FOR SELECT
  TO authenticated
  USING (true);

-- Clean up existing drafts with citation tags in specs
DELETE FROM product_enrichment_drafts WHERE specs::text LIKE '%<cite%';
