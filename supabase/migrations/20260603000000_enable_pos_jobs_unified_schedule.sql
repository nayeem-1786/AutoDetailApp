-- Item 15e Phase 3 — enable the POS Jobs unified-schedule feature flag.
--
-- Companion to 20260527000000_pos_jobs_unified_schedule_flag.sql (the seed,
-- which inserted the row with enabled=false ON CONFLICT DO NOTHING). Phase
-- 1A/1B/2A/2B shipped 2026-05-27 (sessions #103-#109) with the flag OFF
-- awaiting operator rollout. Pre-flight audit (Session #146,
-- docs/dev/POS_JOBS_UNIFIED_SCHEDULE_FLAG_FLIP_PREFLIGHT.md): 2869/2869 tests
-- pass, no drift on gated code paths since #109, single defensive improvement
-- (#110) on a dialog-mount endpoint actively used by the flag-ON path. Risk
-- verdict: Clean.
--
-- Idempotent: re-running this migration sets enabled=true again, no change.
-- The seed migration's ON CONFLICT DO NOTHING means a hypothetical re-seed
-- of the prior file would NOT downgrade this value back to false (the row
-- already exists; ON CONFLICT no-ops the entire VALUES clause).
--
-- Rollback: UPDATE feature_flags SET enabled = false WHERE key = '...';
-- The OFF code path is byte-identical to pre-15e per the pre-flight audit's
-- Target B summary.

UPDATE feature_flags
SET enabled = true,
    updated_at = NOW()
WHERE key = 'pos_jobs_unified_schedule';
