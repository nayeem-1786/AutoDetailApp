-- Clean up any existing duplicate jobs for the same appointment (keep oldest, delete newer)
DELETE FROM jobs WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY appointment_id ORDER BY created_at ASC) as rn
    FROM jobs WHERE appointment_id IS NOT NULL
  ) sub WHERE rn > 1
);

-- Prevent duplicate jobs from being created for the same appointment.
-- Walk-in jobs have NULL appointment_id and are not affected by this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique_appointment_id
  ON jobs (appointment_id)
  WHERE appointment_id IS NOT NULL;
