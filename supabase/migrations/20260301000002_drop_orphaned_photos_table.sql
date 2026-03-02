-- Drop orphaned `photos` table and `photo_type` enum
-- The modern photo system uses `job_photos` table (created in 20260212000003_phase8_jobs_schema.sql).
-- The old `photos` table (from 20260201000027_create_photos.sql) is unused by any code.

DROP TABLE IF EXISTS photos;
DROP TYPE IF EXISTS photo_type;
