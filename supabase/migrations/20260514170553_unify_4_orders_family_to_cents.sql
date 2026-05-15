-- Phase Money-Unify-4 — Family E (Orders) migration
--
-- Migrates 11 money columns across the e-commerce subsystem
-- (orders, order_items, shipping_settings) to integer-cents canonical
-- naming, following the two-phase commit pattern established by
-- Unify-2 + Unify-3:
--
--   1. ADD new *_cents columns alongside the existing columns.
--   2. DROP NOT NULL on 8 legacy NOT NULL columns so app code can stop
--      writing to them without breaking new INSERTs (Decision A1 pattern).
--   3. Backfill new columns from existing data.
--   4. Add CHECK constraints (non-negative >= 0) on each new cents column.
--
-- KEY DIFFERENCE from Unify-2 / Unify-3:
--
--   Family E columns are NOT NUMERIC dollars — they were created as
--   INTEGER cents from Phase 9 onward (e-commerce launch). The 8 columns
--   on `orders` + `order_items`, plus 2 on `shipping_settings`, are
--   ALREADY integer cents. Only `shipping_settings.handling_fee_amount`
--   is NUMERIC(8,2) requiring a type migration.
--
--   For the 10 already-cents columns, backfill is a direct value copy
--   (`col_cents = col`) — no `ROUND(col * 100)` arithmetic needed and
--   no precision loss possible. The two-phase commit pattern still
--   applies: legacy columns linger nullable until Unify-Final, providing
--   a safe schema-apply → code-deploy window per v3 LOCKED-X.
--
--   For `shipping_settings.handling_fee_amount`, the standard
--   `ROUND(col * 100)::INTEGER` backfill is used (1 row in production).
--
-- No existing CHECK constraints on money columns to drop (verified
-- pre-flight: Family E tables have only enum-shape CHECKs on
-- fulfillment/payment status / handling_fee_type / shippo_mode / sort_rates_by).
--
-- No whole-dollar CHECKs are added — orders carry computed totals
-- (subtotal + tax + shipping − discount), tax (rate × price), and
-- discounts that naturally produce cent values. Whole-dollar discipline
-- would be incorrect for this domain. (See v3 Part 1 business-policy
-- CHECK table — products family also skips whole-dollar discipline for
-- the same reason; orders inherit the same rationale via the
-- products.retail_price_cents reads at checkout.)
--
-- No Postgres function rewrites — verified pre-flight that 0 functions
-- and 0 views reference Family E money columns.
--
-- The legacy columns are LEFT IN PLACE through the epic. They stop
-- receiving new writes from this commit forward, but their existing
-- values remain for read-only reconciliation. They are dropped entirely
-- at Phase Money-Unify-Final.
--
-- A companion DOWN migration is staged at
-- supabase/migrations/_rollback/20260514170553_unify_4_orders_family_to_cents_down.sql
-- (outside the active migrations path so `supabase db push` does not
-- auto-apply it). To roll back: copy the file into supabase/migrations/
-- with a fresh timestamp prefix, then run `supabase db push --linked`,
-- then `git reset --hard <pre-Unify-4-hash>`.
--
-- See docs/sessions/money-unify-0-migration-playbook-v3.md §Family E
-- and docs/sessions/money-unify-4-reconciliation.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1 — Add 11 cents columns (all INTEGER, all nullable initially)
-- ---------------------------------------------------------------------------

ALTER TABLE orders     ADD COLUMN subtotal_cents         INTEGER;
ALTER TABLE orders     ADD COLUMN discount_amount_cents  INTEGER;
ALTER TABLE orders     ADD COLUMN tax_amount_cents       INTEGER;
ALTER TABLE orders     ADD COLUMN shipping_amount_cents  INTEGER;
ALTER TABLE orders     ADD COLUMN total_cents            INTEGER;

ALTER TABLE order_items ADD COLUMN unit_price_cents       INTEGER;
ALTER TABLE order_items ADD COLUMN line_total_cents       INTEGER;
ALTER TABLE order_items ADD COLUMN discount_amount_cents  INTEGER;

ALTER TABLE shipping_settings ADD COLUMN flat_rate_amount_cents        INTEGER;
ALTER TABLE shipping_settings ADD COLUMN free_shipping_threshold_cents INTEGER;
ALTER TABLE shipping_settings ADD COLUMN handling_fee_amount_cents     INTEGER;

-- ---------------------------------------------------------------------------
-- Step 2 — Drop NOT NULL on 8 legacy columns
-- ---------------------------------------------------------------------------
-- Decision A1: app code cuts over to _cents columns in this phase. The
-- legacy columns become write-stale; new INSERTs need not populate them.
-- Without dropping NOT NULL, every new row INSERT that omits the legacy
-- columns would fail (DEFAULT 0 covers some cases, but explicit NULL
-- writes would still fail, and per A1 the cleanest path is to drop
-- NOT NULL uniformly).
--
-- shipping_settings columns are already nullable — no DROP NOT NULL
-- needed there.

ALTER TABLE orders ALTER COLUMN subtotal         DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN discount_amount  DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN tax_amount       DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN shipping_amount  DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN total            DROP NOT NULL;

ALTER TABLE order_items ALTER COLUMN unit_price       DROP NOT NULL;
ALTER TABLE order_items ALTER COLUMN line_total       DROP NOT NULL;
ALTER TABLE order_items ALTER COLUMN discount_amount  DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 3 — Backfill cents columns from existing data
-- ---------------------------------------------------------------------------
-- For the 10 already-cents columns: direct value copy — both columns
-- are INTEGER, no rounding possible, no precision loss.
--
-- For `shipping_settings.handling_fee_amount` (NUMERIC(8,2)): the
-- standard ROUND(col * 100)::INTEGER pattern.

UPDATE orders
SET
  subtotal_cents        = subtotal,
  discount_amount_cents = discount_amount,
  tax_amount_cents      = tax_amount,
  shipping_amount_cents = shipping_amount,
  total_cents           = total;

UPDATE order_items
SET
  unit_price_cents      = unit_price,
  line_total_cents      = line_total,
  discount_amount_cents = discount_amount;

UPDATE shipping_settings
SET
  flat_rate_amount_cents        = flat_rate_amount,
  free_shipping_threshold_cents = free_shipping_threshold,
  handling_fee_amount_cents     = CASE
    WHEN handling_fee_amount IS NOT NULL
      THEN ROUND(handling_fee_amount * 100)::INTEGER
      ELSE NULL
  END;

-- ---------------------------------------------------------------------------
-- Step 4 — (No existing CHECK constraints to drop)
-- ---------------------------------------------------------------------------
-- Verified pre-flight: 0 CHECK constraints reference money columns on
-- orders / order_items / shipping_settings. Only enum-shape CHECKs exist
-- on text columns (fulfillment_method, payment_status, etc.).

-- ---------------------------------------------------------------------------
-- Step 5 — Add CHECK constraints on cents columns (11 new non-negative)
-- ---------------------------------------------------------------------------
-- All nullable-aware: `IS NULL OR col >= 0`. No whole-dollar discipline
-- (orders compute cent-precise totals).

ALTER TABLE orders ADD CONSTRAINT chk_orders_subtotal_cents_non_negative
  CHECK (subtotal_cents IS NULL OR subtotal_cents >= 0);
ALTER TABLE orders ADD CONSTRAINT chk_orders_discount_amount_cents_non_negative
  CHECK (discount_amount_cents IS NULL OR discount_amount_cents >= 0);
ALTER TABLE orders ADD CONSTRAINT chk_orders_tax_amount_cents_non_negative
  CHECK (tax_amount_cents IS NULL OR tax_amount_cents >= 0);
ALTER TABLE orders ADD CONSTRAINT chk_orders_shipping_amount_cents_non_negative
  CHECK (shipping_amount_cents IS NULL OR shipping_amount_cents >= 0);
ALTER TABLE orders ADD CONSTRAINT chk_orders_total_cents_non_negative
  CHECK (total_cents IS NULL OR total_cents >= 0);

ALTER TABLE order_items ADD CONSTRAINT chk_order_items_unit_price_cents_non_negative
  CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0);
ALTER TABLE order_items ADD CONSTRAINT chk_order_items_line_total_cents_non_negative
  CHECK (line_total_cents IS NULL OR line_total_cents >= 0);
ALTER TABLE order_items ADD CONSTRAINT chk_order_items_discount_amount_cents_non_negative
  CHECK (discount_amount_cents IS NULL OR discount_amount_cents >= 0);

ALTER TABLE shipping_settings ADD CONSTRAINT chk_shipping_settings_flat_rate_amount_cents_non_negative
  CHECK (flat_rate_amount_cents IS NULL OR flat_rate_amount_cents >= 0);
ALTER TABLE shipping_settings ADD CONSTRAINT chk_shipping_settings_free_shipping_threshold_cents_non_negative
  CHECK (free_shipping_threshold_cents IS NULL OR free_shipping_threshold_cents >= 0);
ALTER TABLE shipping_settings ADD CONSTRAINT chk_shipping_settings_handling_fee_amount_cents_non_negative
  CHECK (handling_fee_amount_cents IS NULL OR handling_fee_amount_cents >= 0);

COMMIT;
