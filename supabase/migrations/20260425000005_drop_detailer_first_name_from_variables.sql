-- Session 2A — Second corrective migration to fully restore admin PUT for
-- detailer_job_assigned.
--
-- Why this is needed:
-- 20260425000004 brought the variables column into agreement with the new body
-- BUT the admin PUT validation at src/app/api/admin/sms-templates/[slug]/route.ts:140-148
-- treats every entry in `variables` as "must appear in body" — it ignores the
-- per-entry `required: false` flag. Since `detailer_first_name` is in the new
-- contract's optional_variables (not in body today, but kept for operator
-- flexibility), its presence in `variables` causes the admin PUT to reject
-- "Missing required variables: detailer_first_name" on every save attempt.
--
-- Fix: remove the detailer_first_name entry from `variables` for this slug.
-- The chip is still in optional_variables (engine still REMOVE_LINEs it if
-- referenced) — admin chip-picker just won't surface it as an insertable chip
-- until Session 2E rebuilds the admin UI to read optional_variables.
--
-- This is the cost of Decision 1's two-source-of-truth window: when a body
-- changes in 2A, both the engine contract (required + optional) AND the
-- admin-side variables registry need updating to keep admin save functional.
-- Future body rewrites in 2B–2F should plan for this from the start.
--
-- Idempotency: only updates if detailer_first_name is still present.

BEGIN;

UPDATE sms_templates
SET variables = (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(variables) elem
      WHERE elem->>'key' != 'detailer_first_name'
    ),
    updated_at = now()
WHERE slug = 'detailer_job_assigned'
  AND variables @> '[{"key":"detailer_first_name"}]'::jsonb;

COMMIT;
