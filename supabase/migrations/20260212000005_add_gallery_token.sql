-- =============================================================================
-- Phase 8 Session 4: Add gallery_token to jobs table
-- Used for public customer photo gallery access
-- =============================================================================

ALTER TABLE jobs ADD COLUMN gallery_token TEXT UNIQUE;
CREATE INDEX idx_jobs_gallery_token ON jobs(gallery_token);
