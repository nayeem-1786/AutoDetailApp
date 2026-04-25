-- Session 42Q: Void inventory restoration via void_transaction RPC
--
-- Fixes a silent inventory bug present since launch (Session 42M audit):
-- the POS void path flipped transactions.status to 'voided' but never
-- restored product inventory or wrote a stock_adjustments audit row. Every
-- void since launch silently corrupted inventory.
--
-- This migration:
-- 1. Extends stock_adjustments.adjustment_type CHECK to include 'voided'
--    (a new audit type, parallel to 'returned' but distinguishable in
--    stock-history reporting).
-- 2. Creates void_transaction(p_transaction_id, p_user_id, p_reason) RPC
--    that does ALL void side-effects atomically inside a single
--    transaction with FOR UPDATE row locks. Mirrors the pattern set by
--    revert_stock_count (Session 42K-patch-1) for safety under concurrent
--    POS sales / refunds.
--
-- The RPC handles:
--   * Status guard (completed only — partial_refund cannot be voided)
--   * Inventory restoration (always restock — no disposition fork)
--   * Loyalty reversal (always full — preserves current behavior)
--   * Coupon use_count + campaign metrics reversal (always — void is
--     always full, unlike refund which gates on full vs. partial)
--   * Customer lifetime_spend + visit_count reversal (gap that neither
--     void nor refund currently fix; addressed here for void only)
--   * Job cascade (transaction_id link → status='cancelled' with
--     cancelled_at, cancelled_by, cancellation_reason metadata)
--   * Status flip to 'voided'
--
-- Apply manually via Supabase SQL Editor.

-- =============================================================================
-- 1. Extend adjustment_type CHECK constraint with 'voided'
-- =============================================================================

ALTER TABLE stock_adjustments
  DROP CONSTRAINT stock_adjustments_adjustment_type_check;

ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type IN (
    'manual', 'received', 'sold', 'returned',
    'damaged', 'recount', 'shop_use', 'customer_retained',
    'voided'
  ));

-- =============================================================================
-- 2. void_transaction RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION void_transaction(
  p_transaction_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    SELECT quantity_on_hand, cost_price INTO v_product
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
      unit_cost
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
      v_product.cost_price
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
$$;

GRANT EXECUTE ON FUNCTION void_transaction(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION void_transaction(UUID, UUID, TEXT) IS
  'Atomic void of a POS transaction. Session 42Q. Restores product '
  'inventory (always restock, no disposition fork), reverses loyalty '
  '(full), reverses coupon use_count + campaign metrics, decrements '
  'customer lifetime_spend + visit_count, cancels linked job (with '
  'cancellation metadata), then flips transaction status to voided. '
  'Single PG transaction with FOR UPDATE row locks on the transaction '
  'row, every affected product, customer, and coupon. Returns structured '
  'JSONB matching the revert_stock_count v2 shape.';
