-- Add manual tags column to job_photos for gallery categorization
-- Tags are freeform text (e.g., "Paint Correction", "Premium Detail")
-- Auto-derived tags (zone group, service names) are computed at query time from existing fields.

ALTER TABLE job_photos ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_job_photos_tags ON job_photos USING GIN (tags);
