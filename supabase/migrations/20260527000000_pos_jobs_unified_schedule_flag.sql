-- Item 15e Phase 1B — seed the POS Jobs unified-schedule feature flag.
--
-- Gates the POS Jobs "Today / Schedule" scope toggle (client wiring shipped in
-- Phase 1B). Default DISABLED — flag OFF must produce byte-identical pre-15e
-- behavior. Operators flip it on during the unified-operations rollout
-- (Item 15e Phase 3+). DATA seed only — no schema change.
--
-- ON CONFLICT DO NOTHING so re-running never clobbers an operator's toggle
-- (mirrors the qbo_enabled seed pattern).

INSERT INTO feature_flags (key, name, description, category, enabled)
VALUES (
  'pos_jobs_unified_schedule',
  'POS Jobs — Unified Schedule Scope',
  'Adds a Today / Schedule scope toggle to the POS Jobs queue. The Schedule scope lists upcoming appointments (read-only in Phase 1) without materializing them into jobs. Part of the Item 15e retire arc (POS Appointments tab → unified POS Jobs).',
  'Core POS',
  false
)
ON CONFLICT (key) DO NOTHING;
