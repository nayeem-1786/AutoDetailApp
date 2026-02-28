-- Page revision history for CMS pages
-- Auto-saved on every page save, supports view + restore

CREATE TABLE page_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_revisions_page_id ON page_revisions(page_id, revision_number DESC);

ALTER TABLE page_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read page revisions"
  ON page_revisions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert page revisions"
  ON page_revisions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated delete page revisions"
  ON page_revisions FOR DELETE
  TO authenticated
  USING (true);
