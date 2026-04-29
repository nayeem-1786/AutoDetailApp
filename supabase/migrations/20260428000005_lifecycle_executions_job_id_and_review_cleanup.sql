-- Session RFB-1 — Review Followup Bug fix
--
-- Reshapes the lifecycle review-SMS trigger so reviews fire only when the
-- service is fully done: work completed AND vehicle picked up AND fully paid.
-- The data-model gate is `jobs.status='closed' AND jobs.actual_pickup_at IS NOT NULL`.
--
-- This migration:
--   1. Adds lifecycle_executions.job_id (FK to jobs) so the cron's new
--      "schedule from completed jobs" path can dedup per job.
--   2. Updates the unique-trigger index to include job_id (was: rule_id +
--      appointment_id + transaction_id; now also + job_id, all COALESCE'd
--      against a sentinel so NULLs participate in the uniqueness).
--   3. Adds an index on job_id for FK lookup speed and the schedule scan.
--   4. One-time cleanup of in-flight pending executions tied to either:
--        (a) deposit/prepayment transactions for not-yet-completed services
--            (transaction.appointment_id IS NOT NULL but no closed+picked job),
--        (b) appointment-driven executions where the linked appointment
--            doesn't have a corresponding closed+picked job.
--      Production check at fix time reported 0 pending rows, but the cleanup
--      is defense-in-depth — covers any rows enqueued between the check and
--      this deploy.

ALTER TABLE lifecycle_executions
  ADD COLUMN job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

-- FK lookup + schedule-scan support
CREATE INDEX idx_lifecycle_executions_job_id
  ON lifecycle_executions (job_id)
  WHERE job_id IS NOT NULL;

-- Replace the unique-trigger index to include job_id. The original keys on
-- (rule_id, appointment_id, transaction_id) — adding job_id widens the dedup
-- key so a job-driven execution doesn't collide with a transaction-driven
-- execution that happens to share the same appointment_id.
DROP INDEX IF EXISTS idx_lifecycle_executions_unique_trigger;

CREATE UNIQUE INDEX idx_lifecycle_executions_unique_trigger
  ON lifecycle_executions (
    lifecycle_rule_id,
    COALESCE(appointment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(transaction_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(job_id,         '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- One-time cleanup of in-flight bad executions.
-- ---------------------------------------------------------------------------

-- (a) Deposit / prepayment transactions: any pending execution tied to a
-- transaction whose appointment is not backed by a closed+picked job.
DELETE FROM lifecycle_executions le
 WHERE le.status = 'pending'
   AND le.transaction_id IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM transactions t
      WHERE t.id = le.transaction_id
        AND t.appointment_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM jobs j
           WHERE j.appointment_id = t.appointment_id
             AND j.status = 'closed'
             AND j.actual_pickup_at IS NOT NULL
        )
   );

-- (b) Appointment-driven executions where the appointment doesn't have a
-- closed+picked job. Matches the new gate semantics retroactively.
DELETE FROM lifecycle_executions le
 WHERE le.status = 'pending'
   AND le.appointment_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM jobs j
      WHERE j.appointment_id = le.appointment_id
        AND j.status = 'closed'
        AND j.actual_pickup_at IS NOT NULL
   );
