-- Product AI Enrichment System
-- 1. Seed vendor websites for targeted web search
-- 2. Create product_enrichment_drafts table for review pipeline

-- ============================================================
-- Part 1: Seed vendor websites
-- ============================================================

UPDATE vendors SET website = 'https://detailerstop.com' WHERE LOWER(name) = 'detailer stop' AND website IS NULL;
UPDATE vendors SET website = 'https://psdetailproducts.com' WHERE LOWER(name) = 'p & s' AND website IS NULL;
UPDATE vendors SET website = 'https://maxshineusa.com' WHERE LOWER(name) = 'maxshine' AND website IS NULL;
UPDATE vendors SET website = 'https://buffandshine.com' WHERE LOWER(name) = 'buff & shine' AND website IS NULL;
UPDATE vendors SET website = 'https://autofiber.com' WHERE LOWER(name) = 'autofiber' AND website IS NULL;
UPDATE vendors SET website = 'https://gtechniq.com' WHERE LOWER(name) = 'gtechniq' AND website IS NULL;
UPDATE vendors SET website = 'https://renegadeproducts.com' WHERE LOWER(name) = 'renegade' AND website IS NULL;
UPDATE vendors SET website = 'https://iksprayers.com' WHERE LOWER(name) = 'ik' AND website IS NULL;
UPDATE vendors SET website = 'https://drillbrush.com' WHERE LOWER(name) = 'drillbrush.com' AND website IS NULL;
UPDATE vendors SET website = 'https://sonax.com' WHERE LOWER(name) = 'sonax' AND website IS NULL;
UPDATE vendors SET website = 'https://nanoskinusa.com' WHERE LOWER(name) = 'nano' AND website IS NULL;
UPDATE vendors SET website = 'https://milwaukeetool.com' WHERE LOWER(name) = 'milwaukee' AND website IS NULL;
UPDATE vendors SET website = 'https://dewalt.com' WHERE LOWER(name) = 'dewalt' AND website IS NULL;
UPDATE vendors SET website = 'https://alloygator.com' WHERE LOWER(name) = 'alloygator' AND website IS NULL;

-- ============================================================
-- Part 2: Enrichment drafts table
-- ============================================================

CREATE TABLE IF NOT EXISTS product_enrichment_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  short_description TEXT,
  specs JSONB,
  source_url TEXT,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_drafts_product_status ON product_enrichment_drafts (product_id, status);
CREATE INDEX IF NOT EXISTS idx_enrichment_drafts_status ON product_enrichment_drafts (status);

ALTER TABLE product_enrichment_drafts ENABLE ROW LEVEL SECURITY;
