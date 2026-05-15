-- Phase Money-Unify-3 — Family D (Catalog) migration
--
-- Migrates 15 NUMERIC(10,2) dollar columns across the catalog source-of-truth
-- (services, service_pricing, products, packages) to INTEGER cents,
-- following the two-phase commit pattern established by Unify-2:
--
--   1. ADD new cents columns alongside the existing dollar columns.
--   2. DROP NOT NULL from 4 legacy columns so app code can stop writing
--      to them without breaking new INSERTs (Decision A1 pattern).
--   3. Backfill new columns from existing data (one-time ROUND × 100).
--   4. Drop sale-price-discipline CHECK constraints on dollar columns.
--   5. Add CHECK constraints on the new cents columns:
--      - Non-negative (>= 0) on all 15 cents columns.
--      - Whole-dollar (% 100 = 0) on 10 BASE PRICE cents columns only.
--        D-1 Lax interpretation: sale_price columns are excluded from
--        the whole-dollar policy so promotional pricing can land on
--        any cent. v3 playbook §Part 1 originally listed
--        service_pricing.sale_price_cents as whole-dollar; this is
--        overridden by D-1 Lax. See CHANGELOG entry for Unify-3.
--      - Sale-price discipline (sale < base) on services, service_pricing,
--        products — recreated against _cents columns. The new
--        chk_services_sale_price (D-2) brings services into parity with
--        service_pricing + products (previously services had only the
--        non-negative CHECK, no sale < flat enforcement).
--   6. Update void_transaction() to read products.cost_price_cents
--      directly (removes the Unify-2 ROUND(...)::INTEGER shim).
--
-- The legacy NUMERIC columns are LEFT IN PLACE through the epic. They
-- stop receiving new writes from this commit forward, but their existing
-- values remain for read-only reconciliation. They are dropped entirely
-- at Phase Money-Unify-Final.
--
-- A companion DOWN migration is staged at
-- supabase/migrations/_rollback/20260514071552_unify_3_catalog_family_to_cents_down.sql
-- (outside the active migrations path so `supabase db push` does not
-- auto-apply it). To roll back: copy the file into supabase/migrations/
-- with a fresh timestamp prefix, then run `supabase db push --linked`,
-- then `git reset --hard <pre-Unify-3-hash>`.
--
-- See docs/sessions/money-unify-0-migration-playbook-v3.md §Family D
-- and docs/sessions/money-unify-3-reconciliation.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1 — Add 15 cents columns
-- ---------------------------------------------------------------------------

ALTER TABLE services         ADD COLUMN flat_price_cents              INTEGER;
ALTER TABLE services         ADD COLUMN sale_price_cents              INTEGER;
ALTER TABLE services         ADD COLUMN custom_starting_price_cents   INTEGER;
ALTER TABLE services         ADD COLUMN per_unit_price_cents          INTEGER;

ALTER TABLE service_pricing  ADD COLUMN price_cents                       INTEGER;
ALTER TABLE service_pricing  ADD COLUMN sale_price_cents                  INTEGER;
ALTER TABLE service_pricing  ADD COLUMN vehicle_size_sedan_price_cents    INTEGER;
ALTER TABLE service_pricing  ADD COLUMN vehicle_size_truck_suv_price_cents INTEGER;
ALTER TABLE service_pricing  ADD COLUMN vehicle_size_suv_van_price_cents  INTEGER;
ALTER TABLE service_pricing  ADD COLUMN vehicle_size_exotic_price_cents   INTEGER;
ALTER TABLE service_pricing  ADD COLUMN vehicle_size_classic_price_cents  INTEGER;

ALTER TABLE products         ADD COLUMN cost_price_cents   INTEGER;
ALTER TABLE products         ADD COLUMN retail_price_cents INTEGER;
ALTER TABLE products         ADD COLUMN sale_price_cents   INTEGER;

ALTER TABLE packages         ADD COLUMN price_cents INTEGER;

-- ---------------------------------------------------------------------------
-- Step 2 — Drop NOT NULL on 4 legacy columns
-- ---------------------------------------------------------------------------
-- Decision A1: app code cuts over to _cents columns in this phase. The
-- legacy columns become write-stale; new INSERTs need not populate them.
-- Without dropping NOT NULL, every new row INSERT would fail.

ALTER TABLE service_pricing ALTER COLUMN price        DROP NOT NULL;
ALTER TABLE products        ALTER COLUMN cost_price   DROP NOT NULL;
ALTER TABLE products        ALTER COLUMN retail_price DROP NOT NULL;
ALTER TABLE packages        ALTER COLUMN price        DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 3 — Backfill cents columns from dollar columns
-- ---------------------------------------------------------------------------
-- Pre-flight verification confirmed:
--   - 0 negative values in any column.
--   - 0 sale-price-within-1-cent rows.
--   - 0 whole-dollar pre-violators under D-1 Lax (base price columns only).
--     The dirty `services.sale_price = 1.25` (Headlight Restoration) was
--     cleaned to NULL by user via admin UI before this migration.
--   - 3 service_pricing.sale_price rows have $X.50 values (Ceramic Shield
--     half-off tiers) — these are intentional business data; the Lax
--     interpretation explicitly allows them (no whole-dollar CHECK on
--     sale_price columns).
-- ROUND(col * 100)::INTEGER is exact for every existing row.

UPDATE services
   SET flat_price_cents            = CASE WHEN flat_price            IS NOT NULL THEN ROUND(flat_price            * 100)::INTEGER ELSE NULL END,
       sale_price_cents            = CASE WHEN sale_price            IS NOT NULL THEN ROUND(sale_price            * 100)::INTEGER ELSE NULL END,
       custom_starting_price_cents = CASE WHEN custom_starting_price IS NOT NULL THEN ROUND(custom_starting_price * 100)::INTEGER ELSE NULL END,
       per_unit_price_cents        = CASE WHEN per_unit_price        IS NOT NULL THEN ROUND(per_unit_price        * 100)::INTEGER ELSE NULL END;

UPDATE service_pricing
   SET price_cents                       = ROUND(price * 100)::INTEGER,
       sale_price_cents                  = CASE WHEN sale_price                  IS NOT NULL THEN ROUND(sale_price                  * 100)::INTEGER ELSE NULL END,
       vehicle_size_sedan_price_cents    = CASE WHEN vehicle_size_sedan_price    IS NOT NULL THEN ROUND(vehicle_size_sedan_price    * 100)::INTEGER ELSE NULL END,
       vehicle_size_truck_suv_price_cents= CASE WHEN vehicle_size_truck_suv_price IS NOT NULL THEN ROUND(vehicle_size_truck_suv_price * 100)::INTEGER ELSE NULL END,
       vehicle_size_suv_van_price_cents  = CASE WHEN vehicle_size_suv_van_price  IS NOT NULL THEN ROUND(vehicle_size_suv_van_price  * 100)::INTEGER ELSE NULL END,
       vehicle_size_exotic_price_cents   = CASE WHEN vehicle_size_exotic_price   IS NOT NULL THEN ROUND(vehicle_size_exotic_price   * 100)::INTEGER ELSE NULL END,
       vehicle_size_classic_price_cents  = CASE WHEN vehicle_size_classic_price  IS NOT NULL THEN ROUND(vehicle_size_classic_price  * 100)::INTEGER ELSE NULL END;

UPDATE products
   SET cost_price_cents   = ROUND(cost_price   * 100)::INTEGER,
       retail_price_cents = ROUND(retail_price * 100)::INTEGER,
       sale_price_cents   = CASE WHEN sale_price IS NOT NULL THEN ROUND(sale_price * 100)::INTEGER ELSE NULL END;

UPDATE packages
   SET price_cents = ROUND(price * 100)::INTEGER;

-- ---------------------------------------------------------------------------
-- Step 4 — Drop existing sale-price-discipline CHECK constraints
-- ---------------------------------------------------------------------------
-- These reference dollar columns and need recreation against _cents.
-- Note: chk_service_sale_price is on service_pricing (NOT services).
-- Pre-flight Verification 10 surfaced this — the v3 playbook §Family D
-- description had the wrong table.

ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_sale_price;
ALTER TABLE products        DROP CONSTRAINT IF EXISTS chk_product_sale_price;
ALTER TABLE services        DROP CONSTRAINT IF EXISTS services_sale_price_non_negative;

-- ---------------------------------------------------------------------------
-- Step 5a — Non-negative (>= 0) CHECK on all 15 cents columns
-- ---------------------------------------------------------------------------

ALTER TABLE services
  ADD CONSTRAINT services_flat_price_cents_check
  CHECK (flat_price_cents IS NULL OR flat_price_cents >= 0);

ALTER TABLE services
  ADD CONSTRAINT services_sale_price_cents_check
  CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0);

ALTER TABLE services
  ADD CONSTRAINT services_custom_starting_price_cents_check
  CHECK (custom_starting_price_cents IS NULL OR custom_starting_price_cents >= 0);

ALTER TABLE services
  ADD CONSTRAINT services_per_unit_price_cents_check
  CHECK (per_unit_price_cents IS NULL OR per_unit_price_cents >= 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT service_pricing_price_cents_check
  CHECK (price_cents IS NULL OR price_cents >= 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT service_pricing_sale_price_cents_check
  CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT service_pricing_vehicle_size_sedan_price_cents_check
  CHECK (vehicle_size_sedan_price_cents IS NULL OR vehicle_size_sedan_price_cents >= 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT service_pricing_vehicle_size_truck_suv_price_cents_check
  CHECK (vehicle_size_truck_suv_price_cents IS NULL OR vehicle_size_truck_suv_price_cents >= 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT service_pricing_vehicle_size_suv_van_price_cents_check
  CHECK (vehicle_size_suv_van_price_cents IS NULL OR vehicle_size_suv_van_price_cents >= 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT service_pricing_vehicle_size_exotic_price_cents_check
  CHECK (vehicle_size_exotic_price_cents IS NULL OR vehicle_size_exotic_price_cents >= 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT service_pricing_vehicle_size_classic_price_cents_check
  CHECK (vehicle_size_classic_price_cents IS NULL OR vehicle_size_classic_price_cents >= 0);

ALTER TABLE products
  ADD CONSTRAINT products_cost_price_cents_check
  CHECK (cost_price_cents IS NULL OR cost_price_cents >= 0);

ALTER TABLE products
  ADD CONSTRAINT products_retail_price_cents_check
  CHECK (retail_price_cents IS NULL OR retail_price_cents >= 0);

ALTER TABLE products
  ADD CONSTRAINT products_sale_price_cents_check
  CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0);

ALTER TABLE packages
  ADD CONSTRAINT packages_price_cents_check
  CHECK (price_cents IS NULL OR price_cents >= 0);

-- ---------------------------------------------------------------------------
-- Step 5b — Whole-dollar (% 100 = 0) CHECK on 10 BASE PRICE columns only
-- ---------------------------------------------------------------------------
-- D-1 Lax interpretation: sale_price columns are excluded. Promotional
-- pricing may land on any cent. Products columns are excluded entirely
-- (per existing v3 policy: products allow cents).

ALTER TABLE services
  ADD CONSTRAINT chk_services_flat_price_whole_dollar
  CHECK (flat_price_cents IS NULL OR flat_price_cents % 100 = 0);

ALTER TABLE services
  ADD CONSTRAINT chk_services_custom_starting_price_whole_dollar
  CHECK (custom_starting_price_cents IS NULL OR custom_starting_price_cents % 100 = 0);

ALTER TABLE services
  ADD CONSTRAINT chk_services_per_unit_price_whole_dollar
  CHECK (per_unit_price_cents IS NULL OR per_unit_price_cents % 100 = 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_pricing_price_whole_dollar
  CHECK (price_cents IS NULL OR price_cents % 100 = 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_pricing_vehicle_size_sedan_whole_dollar
  CHECK (vehicle_size_sedan_price_cents IS NULL OR vehicle_size_sedan_price_cents % 100 = 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_pricing_vehicle_size_truck_suv_whole_dollar
  CHECK (vehicle_size_truck_suv_price_cents IS NULL OR vehicle_size_truck_suv_price_cents % 100 = 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_pricing_vehicle_size_suv_van_whole_dollar
  CHECK (vehicle_size_suv_van_price_cents IS NULL OR vehicle_size_suv_van_price_cents % 100 = 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_pricing_vehicle_size_exotic_whole_dollar
  CHECK (vehicle_size_exotic_price_cents IS NULL OR vehicle_size_exotic_price_cents % 100 = 0);

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_pricing_vehicle_size_classic_whole_dollar
  CHECK (vehicle_size_classic_price_cents IS NULL OR vehicle_size_classic_price_cents % 100 = 0);

ALTER TABLE packages
  ADD CONSTRAINT chk_packages_price_whole_dollar
  CHECK (price_cents IS NULL OR price_cents % 100 = 0);

-- ---------------------------------------------------------------------------
-- Step 5c — Sale-price-discipline CHECK recreation (against _cents)
-- ---------------------------------------------------------------------------
-- The 3 existing CHECKs from Step 4 are recreated targeting cents columns.
-- D-2 adds a new chk_services_sale_price on services to bring services into
-- parity with service_pricing + products (previously services had only the
-- non-negative CHECK; no sale < flat enforcement).

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_pricing_sale_price
  CHECK (sale_price_cents IS NULL OR sale_price_cents < price_cents);

ALTER TABLE products
  ADD CONSTRAINT chk_product_sale_price
  CHECK (sale_price_cents IS NULL OR sale_price_cents < retail_price_cents);

ALTER TABLE services
  ADD CONSTRAINT chk_services_sale_price
  CHECK (sale_price_cents IS NULL OR sale_price_cents < flat_price_cents);

-- ---------------------------------------------------------------------------
-- Step 6 — Update void_transaction() to read products.cost_price_cents
-- ---------------------------------------------------------------------------
-- Removes the Unify-2 `ROUND(v_product.cost_price * 100)::INTEGER` shim.
-- After this migration, products.cost_price_cents is the canonical source.
--
-- The function also references transactions.total_amount (Family A) and
-- customers.lifetime_spend (Family G); those references stay unchanged
-- in this phase and are rewritten when their families migrate.
--
-- Behavior preserved 1:1; only the cost-price-cents read path changes.

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_product RECORD;
  v_items_restored INT := 0;
  v_units_restored INT := 0;
  v_loyalty_restored INT := 0;
  v_loyalty_clawed INT := 0;
  v_coupon_reversed BOOLEAN := false;
  v_campaign_reversed BOOLEAN := false;
  v_job_cancelled BOOLEAN := false;
  v_job_id UUID;
  v_customer_balance INT;
  v_coupon RECORD;
  v_cancellation_note TEXT;
BEGIN
  -- 1. Lock transaction row
  SELECT * INTO v_tx
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_tx IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error_code', 'NOT_FOUND'
    );
  END IF;

  -- 2. Status guard: completed only. Partial_refund cannot be voided
  --    (voiding would create ambiguity with already-restored inventory
  --    on refunded lines). Operator must complete the refund instead.
  IF v_tx.status <> 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error_code', 'NOT_VOIDABLE',
      'current_status', v_tx.status
    );
  END IF;

  -- 3. Lock all affected products upfront (mirror revert_stock_count v2
  --    pattern). Without this, a concurrent sale could squeeze between
  --    our reads and writes and produce inconsistent quantity_before /
  --    quantity_after audit rows.
  PERFORM 1
  FROM products p
  WHERE p.id IN (
    SELECT DISTINCT product_id
    FROM transaction_items
    WHERE transaction_id = p_transaction_id
      AND product_id IS NOT NULL
  )
  FOR UPDATE;

  -- 4. Inventory restoration: for each product line, increment
  --    quantity_on_hand and write a stock_adjustments audit row with
  --    adjustment_type='voided', reference_type='transaction'.
  FOR v_item IN
    SELECT id, product_id, quantity
    FROM transaction_items
    WHERE transaction_id = p_transaction_id
      AND product_id IS NOT NULL
  LOOP
    -- Unify-3: read cost_price_cents directly. The legacy cost_price
    -- column remains in the table for reconciliation but no longer
    -- participates in inventory writes.
    SELECT quantity_on_hand, cost_price_cents INTO v_product
    FROM products
    WHERE id = v_item.product_id;

    UPDATE products
    SET quantity_on_hand = v_product.quantity_on_hand + v_item.quantity
    WHERE id = v_item.product_id;

    INSERT INTO stock_adjustments (
      product_id,
      adjustment_type,
      quantity_change,
      quantity_before,
      quantity_after,
      reason,
      reference_type,
      reference_id,
      created_by,
      unit_cost_cents
    ) VALUES (
      v_item.product_id,
      'voided',
      v_item.quantity,
      v_product.quantity_on_hand,
      v_product.quantity_on_hand + v_item.quantity,
      'Void of ' || COALESCE(v_tx.receipt_number, v_tx.id::text),
      'transaction',
      p_transaction_id,
      p_user_id,
      v_product.cost_price_cents
    );

    v_items_restored := v_items_restored + 1;
    v_units_restored := v_units_restored + v_item.quantity;
  END LOOP;

  -- 5. Loyalty reversal — always full (void is never partial). Preserves
  --    behavior of the previous JS handler at
  --    src/app/api/pos/transactions/[id]/route.ts:124-167.
  IF v_tx.customer_id IS NOT NULL THEN
    SELECT loyalty_points_balance INTO v_customer_balance
    FROM customers
    WHERE id = v_tx.customer_id
    FOR UPDATE;

    IF v_customer_balance IS NULL THEN
      v_customer_balance := 0;
    END IF;

    -- 5a. Restore redeemed points
    IF v_tx.loyalty_points_redeemed > 0 THEN
      v_customer_balance := v_customer_balance + v_tx.loyalty_points_redeemed;

      INSERT INTO loyalty_ledger (
        customer_id,
        transaction_id,
        action,
        points_change,
        points_balance,
        description,
        created_by
      ) VALUES (
        v_tx.customer_id,
        p_transaction_id,
        'adjusted',
        v_tx.loyalty_points_redeemed,
        v_customer_balance,
        'Void: restored ' || v_tx.loyalty_points_redeemed || ' redeemed pts',
        p_user_id
      );

      v_loyalty_restored := v_tx.loyalty_points_redeemed;
    END IF;

    -- 5b. Claw back earned points (clamp at 0 to avoid negative balance)
    IF v_tx.loyalty_points_earned > 0 THEN
      v_customer_balance := GREATEST(0, v_customer_balance - v_tx.loyalty_points_earned);

      INSERT INTO loyalty_ledger (
        customer_id,
        transaction_id,
        action,
        points_change,
        points_balance,
        description,
        created_by
      ) VALUES (
        v_tx.customer_id,
        p_transaction_id,
        'adjusted',
        -v_tx.loyalty_points_earned,
        v_customer_balance,
        'Void: reversed ' || v_tx.loyalty_points_earned || ' earned pts',
        p_user_id
      );

      v_loyalty_clawed := v_tx.loyalty_points_earned;
    END IF;

    -- Single balance update at the end if either touched
    IF v_tx.loyalty_points_redeemed > 0 OR v_tx.loyalty_points_earned > 0 THEN
      UPDATE customers
      SET loyalty_points_balance = v_customer_balance
      WHERE id = v_tx.customer_id;
    END IF;
  END IF;

  -- 6. Coupon use_count + campaign metrics reversal. Unlike refund (which
  --    gates on full-vs-partial), void is always full so we always reverse.
  IF v_tx.coupon_id IS NOT NULL THEN
    SELECT use_count, campaign_id INTO v_coupon
    FROM coupons
    WHERE id = v_tx.coupon_id
    FOR UPDATE;

    IF v_coupon IS NOT NULL THEN
      IF v_coupon.use_count > 0 THEN
        UPDATE coupons
        SET use_count = v_coupon.use_count - 1
        WHERE id = v_tx.coupon_id;
      END IF;
      v_coupon_reversed := true;

      IF v_coupon.campaign_id IS NOT NULL THEN
        UPDATE campaigns
        SET
          redeemed_count = GREATEST(0, redeemed_count - 1),
          revenue_attributed = GREATEST(
            0,
            ROUND((revenue_attributed - v_tx.total_amount)::numeric, 2)
          )
        WHERE id = v_coupon.campaign_id;
        v_campaign_reversed := true;
      END IF;
    END IF;
  END IF;

  -- 7. Customer stats reversal (lifetime_spend + visit_count). The
  --    tr_update_customer_stats trigger only fires AFTER INSERT and never
  --    reverses on UPDATE — without this block, lifetime_spend remains
  --    inflated by every voided transaction's total.
  IF v_tx.customer_id IS NOT NULL THEN
    UPDATE customers
    SET
      lifetime_spend = GREATEST(0, lifetime_spend - v_tx.total_amount),
      visit_count = GREATEST(0, visit_count - 1)
    WHERE id = v_tx.customer_id;
  END IF;

  -- 8. Job cascade: cancel any non-cancelled job linked via
  --    jobs.transaction_id. Sets cancellation_reason, cancelled_at,
  --    cancelled_by to match the existing cancellation convention from
  --    20260212000006_jobs_cancellation_columns.sql.
  v_cancellation_note := 'Transaction voided';
  IF p_reason IS NOT NULL AND p_reason <> '' THEN
    v_cancellation_note := v_cancellation_note || ': ' || p_reason;
  END IF;

  UPDATE jobs
  SET
    status = 'cancelled',
    cancellation_reason = v_cancellation_note,
    cancelled_at = now(),
    cancelled_by = p_user_id
  WHERE transaction_id = p_transaction_id
    AND status <> 'cancelled'
  RETURNING id INTO v_job_id;

  IF v_job_id IS NOT NULL THEN
    v_job_cancelled := true;
  END IF;

  -- 9. Flip transaction status. Always last so a failure earlier rolls
  --    everything back via the implicit transaction wrapper.
  UPDATE transactions
  SET
    status = 'voided',
    updated_at = now()
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'items_restored', v_items_restored,
    'units_restored', v_units_restored,
    'loyalty_restored', v_loyalty_restored,
    'loyalty_clawed', v_loyalty_clawed,
    'coupon_reversed', v_coupon_reversed,
    'campaign_reversed', v_campaign_reversed,
    'job_cancelled', v_job_cancelled,
    'job_id', v_job_id,
    'customer_id', v_tx.customer_id
  );
END;
$function$;

COMMIT;
