-- Item 15f Phase 1 Layer 8e — one-time backfill: normalize
-- `appointments.scheduled_start_time` and `appointments.scheduled_end_time`
-- to minute precision (zero seconds) on existing rows.
--
-- Driver: walk-in path (`/api/pos/jobs/route.ts`) shipped HH:MM:SS values
-- pre-Layer-8e, which broke the Admin Appointment dialog's HTML5
-- `<input type="time">` step=60 validator on those rows. The application
-- fix in Layer 8e normalizes both the WRITE path (walk-in creator now
-- writes HH:MM:00) and the READ path (Admin dialog truncates to HH:MM on
-- load). This migration cleans up the rows already in the DB.
--
-- Intentionally narrow scope: only `appointments` table, only the two
-- `scheduled_*_time` columns. The audit log timestamps, `actual_start_time`
-- / `actual_end_time` (intake start/stop), transaction timestamps, and
-- receipt timestamps all KEEP seconds — operational precision matters for
-- those domains.
--
-- Idempotent: WHERE clause filters to rows that actually need the update.
-- Affected row count expected ~5-10 per pre-session UAT data.

UPDATE appointments
SET
  scheduled_start_time = date_trunc('minute', scheduled_start_time::time)::time,
  scheduled_end_time = date_trunc('minute', scheduled_end_time::time)::time
WHERE
  EXTRACT(SECOND FROM scheduled_start_time::time) <> 0
  OR EXTRACT(SECOND FROM scheduled_end_time::time) <> 0;
