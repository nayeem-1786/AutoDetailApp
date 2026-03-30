-- Replace partial unique INDEX with a full unique CONSTRAINT.
-- Supabase JS .upsert({ onConflict: 'appointment_id' }) cannot match partial
-- indexes (PostgreSQL requires ON CONFLICT ... WHERE to match partials, but
-- the Supabase client doesn't support WHERE in onConflict).
--
-- A full UNIQUE constraint allows multiple NULLs by default in PostgreSQL,
-- so walk-in jobs (appointment_id = NULL) are unaffected.

-- Drop the partial index that doesn't work with .upsert()
DROP INDEX IF EXISTS idx_jobs_unique_appointment_id;

-- Clean up any duplicate appointment_id values (keep oldest job per appointment)
DELETE FROM jobs WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY appointment_id ORDER BY created_at ASC) as rn
    FROM jobs WHERE appointment_id IS NOT NULL
  ) sub WHERE rn > 1
);

-- Add full unique constraint
ALTER TABLE jobs ADD CONSTRAINT jobs_appointment_id_unique UNIQUE (appointment_id);
