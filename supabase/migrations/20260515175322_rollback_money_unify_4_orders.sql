-- Phase Money-Unify-4 — Family E (Orders) ROLLBACK migration
--
-- Reverses 20260514170553_unify_4_orders_family_to_cents.sql.
--
-- This file is staged OUTSIDE supabase/migrations/ so that the active
-- `supabase db push` command does not auto-apply it. To execute a
-- rollback:
--
--   1. Copy this file into supabase/migrations/ with a fresh
--      timestamp prefix (e.g. cp supabase/migrations/_rollback/...down.sql
--      supabase/migrations/<new_timestamp>_unify_4_rollback.sql)
--   2. Run `npx supabase db push --linked`
--   3. Verify pre-Unify-4 baseline via Verification 2 (no _cents columns
--      should remain on orders / order_items / shipping_settings)
--   4. `git reset --hard <pre-Unify-4-commit-hash>` to discard local
--      commits (PRE-DEPLOY ONLY; post-deploy uses git revert instead).
--
-- See docs/sessions/money-unify-0-migration-playbook-v3.md §Part 7
-- §General rollback patterns ("Order matters: apply DOWN BEFORE reset").
--
-- This DOWN migration is symmetric to UP: every step in UP is reversed
-- in inverse order. The legacy columns still contain their pre-Unify-4
-- values (Unify-4 never wrote to them — the 10 already-cents columns
-- are byte-identical to their _cents twins; the 1 NUMERIC
-- `handling_fee_amount` retained its dollar value). No data restoration
-- is required — only constraint and column removal.

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 5 (inverse) — Drop 11 non-negative CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_subtotal_cents_non_negative;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_discount_amount_cents_non_negative;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_tax_amount_cents_non_negative;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_shipping_amount_cents_non_negative;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_total_cents_non_negative;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS chk_order_items_unit_price_cents_non_negative;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS chk_order_items_line_total_cents_non_negative;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS chk_order_items_discount_amount_cents_non_negative;

ALTER TABLE shipping_settings DROP CONSTRAINT IF EXISTS chk_shipping_settings_flat_rate_amount_cents_non_negative;
-- Note: free_shipping_threshold constraint name was truncated to 63 chars
-- (Postgres identifier limit). Postgres emitted a NOTICE at UP-apply time:
--   "identifier ... will be truncated to chk_shipping_settings_free_shipping_threshold_cents_non_negativ"
-- (trailing 'e' dropped). DOWN must use the same truncated name or the
-- IF EXISTS clause silently no-ops.
ALTER TABLE shipping_settings DROP CONSTRAINT IF EXISTS chk_shipping_settings_free_shipping_threshold_cents_non_negativ;
ALTER TABLE shipping_settings DROP CONSTRAINT IF EXISTS chk_shipping_settings_handling_fee_amount_cents_non_negative;

-- ---------------------------------------------------------------------------
-- Step 4 (inverse) — N/A (no CHECKs were dropped in UP)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Step 3 (inverse) — N/A (no data restoration needed)
-- ---------------------------------------------------------------------------
-- The 10 already-cents legacy columns retain their original values
-- byte-for-byte (UP never wrote to them). For the NUMERIC
-- `handling_fee_amount`, the legacy column retained its dollar value
-- because UP never wrote to it; the `_cents` twin was a one-way
-- backfill. No restoration math required.

-- ---------------------------------------------------------------------------
-- Step 2 (inverse) — Restore NOT NULL on 8 legacy columns
-- ---------------------------------------------------------------------------
-- Safe to re-add because the columns were never set to NULL between UP
-- and DOWN — they retained their pre-Unify-4 NOT NULL values.

ALTER TABLE orders ALTER COLUMN subtotal         SET NOT NULL;
ALTER TABLE orders ALTER COLUMN discount_amount  SET NOT NULL;
ALTER TABLE orders ALTER COLUMN tax_amount       SET NOT NULL;
ALTER TABLE orders ALTER COLUMN shipping_amount  SET NOT NULL;
ALTER TABLE orders ALTER COLUMN total            SET NOT NULL;

ALTER TABLE order_items ALTER COLUMN unit_price       SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN line_total       SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN discount_amount  SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 1 (inverse) — Drop 11 cents columns
-- ---------------------------------------------------------------------------

ALTER TABLE orders DROP COLUMN IF EXISTS subtotal_cents;
ALTER TABLE orders DROP COLUMN IF EXISTS discount_amount_cents;
ALTER TABLE orders DROP COLUMN IF EXISTS tax_amount_cents;
ALTER TABLE orders DROP COLUMN IF EXISTS shipping_amount_cents;
ALTER TABLE orders DROP COLUMN IF EXISTS total_cents;

ALTER TABLE order_items DROP COLUMN IF EXISTS unit_price_cents;
ALTER TABLE order_items DROP COLUMN IF EXISTS line_total_cents;
ALTER TABLE order_items DROP COLUMN IF EXISTS discount_amount_cents;

ALTER TABLE shipping_settings DROP COLUMN IF EXISTS flat_rate_amount_cents;
ALTER TABLE shipping_settings DROP COLUMN IF EXISTS free_shipping_threshold_cents;
ALTER TABLE shipping_settings DROP COLUMN IF EXISTS handling_fee_amount_cents;

COMMIT;
