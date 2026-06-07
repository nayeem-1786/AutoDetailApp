-- Phase 3 Theme A — AC-10. Migration 6 of 6: drop the DORMANT quote-number
-- BEFORE INSERT trigger (and its function).
--
-- The receipt-number + po-number triggers stay ALIVE in this session and are
-- removed in a separate Theme A.1 follow-up session AFTER the application
-- code that supplies these columns explicitly has landed in production.
-- Dropping them in this same push would create a production outage window
-- between (migration applied) and (app code deployed) — every transaction +
-- PO INSERT would suddenly fail to auto-fill its identifier.
--
-- The dormant quote trigger is safe to drop in this session because:
--   1. Every existing quote-creating callsite supplies quote_number in the
--      INSERT payload (verified in Phase 3.0.1 audit, file:line index).
--   2. The trigger's WHEN clause (NEW.quote_number IS NULL) is shadowed by
--      every caller — it has never fired in production.
--   3. Its 6-digit format conflicts with the active 4-digit γ generator and
--      with the new 5-digit unified format, making it a maintenance hazard.
--
-- Receipt + PO trigger drops scheduled for Theme A.1 (next session in the
-- Phase 3 wave).
--
-- Trigger + function names verified against
-- supabase/migrations/20260201000037_create_functions_triggers.sql:79-98
-- against current main (Memory #11).

DROP TRIGGER IF EXISTS tr_quote_number ON quotes;
DROP FUNCTION IF EXISTS generate_quote_number();
