-- Phase Money-Unify-3 — Family D (Catalog) ROLLBACK migration
--
-- Reverses 20260514071552_unify_3_catalog_family_to_cents.sql.
--
-- This file is staged OUTSIDE supabase/migrations/ so that the active
-- `supabase db push` command does not auto-apply it. To execute a
-- rollback:
--
--   1. Copy this file into supabase/migrations/ with a fresh
--      timestamp prefix (e.g. cp supabase/migrations/_rollback/...down.sql
--      supabase/migrations/<new_timestamp>_unify_3_rollback.sql)
--   2. Run `npx supabase db push --linked`
--   3. Verify pre-Unify-3 baseline via the Verification 1 SELECT
--      (no _cents columns should remain)
--   4. `git reset --hard <pre-Unify-3-commit-hash>` to discard local
--      commits (PRE-DEPLOY ONLY; post-deploy uses git revert instead).
--
-- See docs/sessions/money-unify-0-migration-playbook-v3.md §Part 7
-- §General rollback patterns ("Order matters: apply DOWN BEFORE reset").
--
-- This DOWN migration is symmetric to UP: every step in UP is reversed
-- in inverse order. The legacy NUMERIC columns still contain their
-- pre-Unify-3 values (Unify-3 never wrote to them), so no data
-- restoration is required — only constraint + function + column removal.

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 6 (inverse) — Restore void_transaction() to its Unify-2 body
-- ---------------------------------------------------------------------------
-- Reads quantity_on_hand + cost_price (dollars) and writes
-- ROUND(cost_price * 100)::INTEGER into unit_cost_cents (the Unify-2
-- form, with the // TODO Unify-D shim comment preserved).

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
  SELECT * INTO v_tx
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_tx IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error_code', 'NOT_FOUND');
  END IF;

  IF v_tx.status <> 'completed' THEN
    RETURN jsonb_build_object('status', 'error', 'error_code', 'NOT_VOIDABLE', 'current_status', v_tx.status);
  END IF;

  PERFORM 1
  FROM products p
  WHERE p.id IN (
    SELECT DISTINCT product_id
    FROM transaction_items
    WHERE transaction_id = p_transaction_id
      AND product_id IS NOT NULL
  )
  FOR UPDATE;

  FOR v_item IN
    SELECT id, product_id, quantity
    FROM transaction_items
    WHERE transaction_id = p_transaction_id
      AND product_id IS NOT NULL
  LOOP
    SELECT quantity_on_hand, cost_price INTO v_product
    FROM products
    WHERE id = v_item.product_id;

    UPDATE products
    SET quantity_on_hand = v_product.quantity_on_hand + v_item.quantity
    WHERE id = v_item.product_id;

    -- TODO Unify-D: when Family D migrates products.cost_price to
    -- cents, remove ROUND(...)::INTEGER and use v_product.cost_price_cents
    -- directly. See docs/sessions/money-unify-0-migration-playbook-v2.md
    -- §Family D.
    INSERT INTO stock_adjustments (
      product_id, adjustment_type, quantity_change, quantity_before,
      quantity_after, reason, reference_type, reference_id, created_by,
      unit_cost_cents
    ) VALUES (
      v_item.product_id, 'voided', v_item.quantity,
      v_product.quantity_on_hand,
      v_product.quantity_on_hand + v_item.quantity,
      'Void of ' || COALESCE(v_tx.receipt_number, v_tx.id::text),
      'transaction', p_transaction_id, p_user_id,
      CASE
        WHEN v_product.cost_price IS NOT NULL
          THEN ROUND(v_product.cost_price * 100)::INTEGER
        ELSE NULL
      END
    );

    v_items_restored := v_items_restored + 1;
    v_units_restored := v_units_restored + v_item.quantity;
  END LOOP;

  IF v_tx.customer_id IS NOT NULL THEN
    SELECT loyalty_points_balance INTO v_customer_balance
    FROM customers
    WHERE id = v_tx.customer_id
    FOR UPDATE;

    IF v_customer_balance IS NULL THEN
      v_customer_balance := 0;
    END IF;

    IF v_tx.loyalty_points_redeemed > 0 THEN
      v_customer_balance := v_customer_balance + v_tx.loyalty_points_redeemed;
      INSERT INTO loyalty_ledger (
        customer_id, transaction_id, action, points_change, points_balance,
        description, created_by
      ) VALUES (
        v_tx.customer_id, p_transaction_id, 'adjusted',
        v_tx.loyalty_points_redeemed, v_customer_balance,
        'Void: restored ' || v_tx.loyalty_points_redeemed || ' redeemed pts',
        p_user_id
      );
      v_loyalty_restored := v_tx.loyalty_points_redeemed;
    END IF;

    IF v_tx.loyalty_points_earned > 0 THEN
      v_customer_balance := GREATEST(0, v_customer_balance - v_tx.loyalty_points_earned);
      INSERT INTO loyalty_ledger (
        customer_id, transaction_id, action, points_change, points_balance,
        description, created_by
      ) VALUES (
        v_tx.customer_id, p_transaction_id, 'adjusted',
        -v_tx.loyalty_points_earned, v_customer_balance,
        'Void: reversed ' || v_tx.loyalty_points_earned || ' earned pts',
        p_user_id
      );
      v_loyalty_clawed := v_tx.loyalty_points_earned;
    END IF;

    IF v_tx.loyalty_points_redeemed > 0 OR v_tx.loyalty_points_earned > 0 THEN
      UPDATE customers SET loyalty_points_balance = v_customer_balance
      WHERE id = v_tx.customer_id;
    END IF;
  END IF;

  IF v_tx.coupon_id IS NOT NULL THEN
    SELECT use_count, campaign_id INTO v_coupon
    FROM coupons WHERE id = v_tx.coupon_id FOR UPDATE;

    IF v_coupon IS NOT NULL THEN
      IF v_coupon.use_count > 0 THEN
        UPDATE coupons SET use_count = v_coupon.use_count - 1
        WHERE id = v_tx.coupon_id;
      END IF;
      v_coupon_reversed := true;

      IF v_coupon.campaign_id IS NOT NULL THEN
        UPDATE campaigns
        SET
          redeemed_count = GREATEST(0, redeemed_count - 1),
          revenue_attributed = GREATEST(0,
            ROUND((revenue_attributed - v_tx.total_amount)::numeric, 2))
        WHERE id = v_coupon.campaign_id;
        v_campaign_reversed := true;
      END IF;
    END IF;
  END IF;

  IF v_tx.customer_id IS NOT NULL THEN
    UPDATE customers
    SET
      lifetime_spend = GREATEST(0, lifetime_spend - v_tx.total_amount),
      visit_count = GREATEST(0, visit_count - 1)
    WHERE id = v_tx.customer_id;
  END IF;

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
  WHERE transaction_id = p_transaction_id AND status <> 'cancelled'
  RETURNING id INTO v_job_id;

  IF v_job_id IS NOT NULL THEN
    v_job_cancelled := true;
  END IF;

  UPDATE transactions SET status = 'voided', updated_at = now()
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'status', 'success', 'transaction_id', p_transaction_id,
    'items_restored', v_items_restored, 'units_restored', v_units_restored,
    'loyalty_restored', v_loyalty_restored, 'loyalty_clawed', v_loyalty_clawed,
    'coupon_reversed', v_coupon_reversed, 'campaign_reversed', v_campaign_reversed,
    'job_cancelled', v_job_cancelled, 'job_id', v_job_id,
    'customer_id', v_tx.customer_id
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Step 5c (inverse) — Drop new sale-price-discipline cents CHECKs
-- ---------------------------------------------------------------------------

ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_pricing_sale_price;
ALTER TABLE products        DROP CONSTRAINT IF EXISTS chk_product_sale_price;
ALTER TABLE services        DROP CONSTRAINT IF EXISTS chk_services_sale_price;

-- ---------------------------------------------------------------------------
-- Step 5b (inverse) — Drop whole-dollar CHECKs (10 base price columns)
-- ---------------------------------------------------------------------------

ALTER TABLE services        DROP CONSTRAINT IF EXISTS chk_services_flat_price_whole_dollar;
ALTER TABLE services        DROP CONSTRAINT IF EXISTS chk_services_custom_starting_price_whole_dollar;
ALTER TABLE services        DROP CONSTRAINT IF EXISTS chk_services_per_unit_price_whole_dollar;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_pricing_price_whole_dollar;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_pricing_vehicle_size_sedan_whole_dollar;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_pricing_vehicle_size_truck_suv_whole_dollar;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_pricing_vehicle_size_suv_van_whole_dollar;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_pricing_vehicle_size_exotic_whole_dollar;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS chk_service_pricing_vehicle_size_classic_whole_dollar;
ALTER TABLE packages        DROP CONSTRAINT IF EXISTS chk_packages_price_whole_dollar;

-- ---------------------------------------------------------------------------
-- Step 5a (inverse) — Drop non-negative cents CHECKs (15 columns)
-- ---------------------------------------------------------------------------

ALTER TABLE services        DROP CONSTRAINT IF EXISTS services_flat_price_cents_check;
ALTER TABLE services        DROP CONSTRAINT IF EXISTS services_sale_price_cents_check;
ALTER TABLE services        DROP CONSTRAINT IF EXISTS services_custom_starting_price_cents_check;
ALTER TABLE services        DROP CONSTRAINT IF EXISTS services_per_unit_price_cents_check;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS service_pricing_price_cents_check;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS service_pricing_sale_price_cents_check;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS service_pricing_vehicle_size_sedan_price_cents_check;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS service_pricing_vehicle_size_truck_suv_price_cents_check;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS service_pricing_vehicle_size_suv_van_price_cents_check;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS service_pricing_vehicle_size_exotic_price_cents_check;
ALTER TABLE service_pricing DROP CONSTRAINT IF EXISTS service_pricing_vehicle_size_classic_price_cents_check;
ALTER TABLE products        DROP CONSTRAINT IF EXISTS products_cost_price_cents_check;
ALTER TABLE products        DROP CONSTRAINT IF EXISTS products_retail_price_cents_check;
ALTER TABLE products        DROP CONSTRAINT IF EXISTS products_sale_price_cents_check;
ALTER TABLE packages        DROP CONSTRAINT IF EXISTS packages_price_cents_check;

-- ---------------------------------------------------------------------------
-- Step 4 (inverse) — Recreate original sale-price-discipline CHECKs
-- ---------------------------------------------------------------------------
-- service_pricing.chk_service_sale_price: sale_price < price (dollars)
-- products.chk_product_sale_price:        sale_price < retail_price (dollars)
-- services.services_sale_price_non_negative: sale_price >= 0 (dollars)

ALTER TABLE service_pricing
  ADD CONSTRAINT chk_service_sale_price
  CHECK (sale_price IS NULL OR sale_price < price);

ALTER TABLE products
  ADD CONSTRAINT chk_product_sale_price
  CHECK (sale_price IS NULL OR sale_price < retail_price);

ALTER TABLE services
  ADD CONSTRAINT services_sale_price_non_negative
  CHECK (sale_price IS NULL OR sale_price >= 0::numeric);

-- ---------------------------------------------------------------------------
-- Step 2 (inverse) — Restore NOT NULL on 4 legacy columns
-- ---------------------------------------------------------------------------
-- Legacy column values were never modified by Unify-3, so every row
-- that had a NOT NULL value before still does. SET NOT NULL is safe.

ALTER TABLE service_pricing ALTER COLUMN price        SET NOT NULL;
ALTER TABLE products        ALTER COLUMN cost_price   SET NOT NULL;
ALTER TABLE products        ALTER COLUMN retail_price SET NOT NULL;
ALTER TABLE packages        ALTER COLUMN price        SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 1 (inverse) — Drop 15 cents columns
-- ---------------------------------------------------------------------------

ALTER TABLE services         DROP COLUMN IF EXISTS flat_price_cents;
ALTER TABLE services         DROP COLUMN IF EXISTS sale_price_cents;
ALTER TABLE services         DROP COLUMN IF EXISTS custom_starting_price_cents;
ALTER TABLE services         DROP COLUMN IF EXISTS per_unit_price_cents;

ALTER TABLE service_pricing  DROP COLUMN IF EXISTS price_cents;
ALTER TABLE service_pricing  DROP COLUMN IF EXISTS sale_price_cents;
ALTER TABLE service_pricing  DROP COLUMN IF EXISTS vehicle_size_sedan_price_cents;
ALTER TABLE service_pricing  DROP COLUMN IF EXISTS vehicle_size_truck_suv_price_cents;
ALTER TABLE service_pricing  DROP COLUMN IF EXISTS vehicle_size_suv_van_price_cents;
ALTER TABLE service_pricing  DROP COLUMN IF EXISTS vehicle_size_exotic_price_cents;
ALTER TABLE service_pricing  DROP COLUMN IF EXISTS vehicle_size_classic_price_cents;

ALTER TABLE products         DROP COLUMN IF EXISTS cost_price_cents;
ALTER TABLE products         DROP COLUMN IF EXISTS retail_price_cents;
ALTER TABLE products         DROP COLUMN IF EXISTS sale_price_cents;

ALTER TABLE packages         DROP COLUMN IF EXISTS price_cents;

COMMIT;
