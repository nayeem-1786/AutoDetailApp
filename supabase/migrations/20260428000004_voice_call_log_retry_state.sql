-- Session VPC-1 — voice-calls-poll retry state machine
--
-- Replaces the "insert null-phone tracking row that blocks retries" pattern
-- with an explicit retry state machine. When ElevenLabs has not yet finalized
-- a conversation's data (typically the first 30-60 seconds after a call ends),
-- the cron now tracks the conversation in `status='awaiting_data'` and retries
-- on each subsequent poll until phone extraction succeeds (`status='completed'`)
-- or the 5-minute hard timeout is reached (`status='failed_no_phone'`).
--
-- Status column is unconstrained TEXT; new values do not require a CHECK update.
-- Existing values: 'processed' (legacy default), 'processing', 'completed'.
-- New values:      'awaiting_data' (retrying), 'failed_no_phone' (terminal).

ALTER TABLE voice_call_log
  ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN first_attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN last_attempted_at TIMESTAMPTZ,
  ADD COLUMN skip_reason TEXT;

-- Partial index supports the retry scan: only awaiting_data rows are queried by
-- first_attempted_at to find both retry candidates and timeout sweep targets.
CREATE INDEX idx_voice_call_log_awaiting_retry
  ON voice_call_log (first_attempted_at)
  WHERE status = 'awaiting_data';

-- Legacy cleanup: pre-fix, the cron inserted null-phone rows with the default
-- status='processed' to block re-processing. Those rows are now obsolete and
-- the 1-hour cleanup that removed them has been deleted from the cron. Strip
-- any remaining legacy rows here so they do not linger as a confusing artifact.
-- The status filter ensures we never touch rows that are already in the new
-- state machine (defense-in-depth — none should exist at this point in time,
-- but the guard protects against migration ordering surprises).
DELETE FROM voice_call_log
 WHERE phone IS NULL
   AND source = 'poll'
   AND status NOT IN ('awaiting_data', 'failed_no_phone');
