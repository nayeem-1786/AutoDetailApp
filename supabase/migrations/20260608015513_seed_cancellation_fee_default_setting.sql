-- Phase 3 Theme D.2 — Seed default cancellation fee in business_settings.
--
-- Per AC-14 commitment (QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md §AC-14):
--   "Default cancellation fee value stored in business_settings (initial
--    value: $50)"
--
-- The orchestrator (`src/lib/appointments/cancel-orchestration.ts`) reads
-- this key when the caller omits `cancellation_fee_cents` from the
-- orchestrator input (= "use the configured default"). Callers that pass
-- an explicit number (including 0 for waiver) or explicit null bypass
-- this read.
--
-- Naming + units (Memory #11 + Memory #20):
--
--   The pre-existing `default_deposit_amount` row stores DOLLARS as a JSON
--   number (read at `src/lib/data/booking.ts:308-318` with a permissive
--   JSON.parse for legacy double-serialization). The Money-Unify epic
--   (Rule #20) requires NEW money-handling code to be cents-native; the
--   D.1 orchestrator + cancel dialogs already use `cancellation_fee_cents`
--   everywhere. To keep the read path cents-native and avoid a per-read
--   dollars→cents conversion in the hot orchestration path, the row's
--   value column stores CENTS as a JSON number. The key name carries the
--   `_cents` suffix so its unit is explicit at the row level (mirrors
--   Memory #20's variable-naming convention).
--
--   The architecture doc's AC-14 prose references
--   `cancellation_fee_default_amount` (dollars-style naming to mirror
--   `default_deposit_amount`). Theme D.2 deliberately diverges to
--   `cancellation_fee_default_cents` because: (a) the canonical
--   orchestration contract is cents-typed; (b) dollars-vs-cents
--   misinterpretation at every read site is a real risk that an explicit
--   suffix prevents; (c) the architecture entry's prose was a
--   pre-implementation sketch — the row name is a Theme D.2 detail
--   reserved for implementation per Memory #29.
--
-- Idempotent via ON CONFLICT DO NOTHING: re-running this migration on a
-- database where an operator has already customized the value via the
-- admin UI will NOT clobber their setting. Same pattern as the recent
-- `seed_pending_appointment_sla_alert_template.sql`
-- (`20260607202560_…`).

INSERT INTO business_settings (key, value, description, updated_at)
VALUES (
  'cancellation_fee_default_cents',
  '5000'::jsonb,
  'Default cancellation fee in integer cents (e.g. 5000 = $50). Read by the cancel orchestrator (src/lib/appointments/cancel-orchestration.ts) when the caller omits cancellation_fee_cents; admin/POS cancel dialogs pre-fill their fee input from this value. Operators adjust via Admin > Settings > Business Profile.',
  NOW()
)
ON CONFLICT (key) DO NOTHING;
