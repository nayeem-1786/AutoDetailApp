-- Session 42S: Plug silent inventory mutations on online orders.
--
-- 1. Extend stock_adjustments.reference_type CHECK to include 'order'.
--    Online order paid (Stripe webhook) and online order refund will both
--    use reference_type='order'. Direction is conveyed by adjustment_type
--    ('sold' for paid, 'returned' for refund). Per Session 42O Phase 8 Q4.
--
-- 2. Seed a non-loginable system employee for use as `created_by` on
--    audit rows written from contexts without an authenticated user
--    (Stripe webhook, future cron-driven inventory writes, etc.).
--
--    The employee has:
--      * auth_user_id = NULL  → cannot log in via Supabase Auth (no
--        auth.users row associated, so password reset / sign-in flows
--        do not apply).
--      * role = 'detailer'    → lowest-privilege built-in user_role.
--        We do not actually evaluate this employee's role permissions
--        (it never authenticates), but the column is NOT NULL so a
--        value is required.
--      * bookable_for_appointments = false  → never appears in detailer
--        scheduling pickers.
--      * Deterministic UUID ('00000000-0000-0000-0000-000000000001')
--        so application code can reference it as a compile-time constant.
--
--    Idempotent: ON CONFLICT (email) DO NOTHING. If a prior environment
--    already has a row at this email with a different UUID, the constant
--    in src/lib/utils/system-actors.ts must be updated to match — the
--    runtime sanity check in that file will log a warning if the lookup
--    fails.
--
-- Apply manually via Supabase SQL Editor.

-- =============================================================================
-- 1. Extend stock_adjustments.reference_type CHECK
-- =============================================================================

ALTER TABLE stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_reference_type_check;

ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_reference_type_check
  CHECK (reference_type IN (
    'purchase_order', 'transaction', 'refund', 'shop_use', 'stock_count', 'order'
  ));

-- =============================================================================
-- 2. Seed system employee for webhook-driven audit rows
-- =============================================================================

INSERT INTO employees (
  id,
  auth_user_id,
  first_name,
  last_name,
  email,
  role,
  status,
  bookable_for_appointments
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'System',
  'Webhook',
  'system@smartdetailsautospa.com',
  'detailer',
  'active',
  false
) ON CONFLICT (email) DO NOTHING;
