-- Session 42K-patch-1: Replace revert_stock_count RPC with structured-error
-- return for negative-quantity blocks. Drift remains a RAISE-based exception.
--
-- Behavior changes vs 20260424000001:
-- 1. Pre-checks every affected product BEFORE writing anything (two-pass).
--    If any reversal would push quantity_on_hand negative, returns a
--    structured error JSONB listing every problem product. Caller (API
--    route) maps this to HTTP 409 with the full list — UI can render
--    actionable links instead of a single uuid in a toast.
-- 2. Acquires row locks on every affected product at the top, before any
--    reads. This guarantees concurrent writes can't push a product into
--    negative range between the pre-check and the per-row write — the
--    pre-check's verdict is binding.
-- 3. Adds an explicit `status` field to the success return so callers can
--    branch on `result.status === 'success'` cleanly.
--
-- Ordering decision (Session 42K-patch-1 F1): negative-qty is a hard
-- blocker checked BEFORE drift. Drift is a soft warning that's only
-- meaningful if the revert can actually complete. If problem products
-- exist, return structured error immediately without evaluating drift —
-- showing a drift banner when the action is impossible would be misleading.
--
-- Apply manually via Supabase SQL Editor.

CREATE OR REPLACE FUNCTION revert_stock_count(
  p_count_id UUID,
  p_user_id UUID,
  p_confirmed_drift BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count RECORD;
  v_adj RECORD;
  v_problem JSONB := '[]'::jsonb;
  v_problem_count INTEGER := 0;
  v_reversals_created INTEGER := 0;
  v_drift_count INTEGER := 0;
  v_drift_products INTEGER := 0;
  v_section_label TEXT;
BEGIN
  -- 1. Lock count header, verify status
  SELECT * INTO v_count
  FROM stock_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'Count not found';
  END IF;

  IF v_count.status <> 'committed' THEN
    RAISE EXCEPTION 'Count not in revertable status: %', v_count.status;
  END IF;

  v_section_label := COALESCE(v_count.section_label, 'full store');

  -- 2. Lock every affected product. This serialises with concurrent POS
  -- sales / refunds / receipts so the FIRST PASS verdict below is binding
  -- through to the SECOND PASS write. Without this, a sale could squeeze
  -- between the pre-check and the write, mutating quantity_on_hand and
  -- invalidating either decision.
  PERFORM 1
  FROM products p
  WHERE p.id IN (
    SELECT DISTINCT product_id
    FROM stock_adjustments
    WHERE reference_type = 'stock_count'
      AND reference_id = p_count_id
      AND reason NOT LIKE 'Reversal of%'
  )
  FOR UPDATE;

  -- 3. FIRST PASS: collect any products that would go negative.
  -- Negative-qty is checked BEFORE drift per ordering decision above.
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', sa.product_id,
      'name', p.name,
      'sku', p.sku,
      'current_qty', p.quantity_on_hand,
      'target_qty', p.quantity_on_hand - sa.quantity_change
    )), '[]'::jsonb),
    COUNT(*)
    INTO v_problem, v_problem_count
  FROM stock_adjustments sa
  JOIN products p ON p.id = sa.product_id
  WHERE sa.reference_type = 'stock_count'
    AND sa.reference_id = p_count_id
    AND sa.reason NOT LIKE 'Reversal of%'
    AND p.quantity_on_hand - sa.quantity_change < 0;

  IF v_problem_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error_code', 'NEGATIVE_QUANTITY',
      'problem_products', v_problem
    );
  END IF;

  -- 4. Authoritative drift check (only reached if no negative-qty issues).
  SELECT COUNT(*), COUNT(DISTINCT sa2.product_id)
    INTO v_drift_count, v_drift_products
  FROM stock_adjustments sa2
  WHERE sa2.product_id IN (
          SELECT DISTINCT product_id
          FROM stock_adjustments
          WHERE reference_type = 'stock_count'
            AND reference_id = p_count_id
            AND reason NOT LIKE 'Reversal of%'
        )
    AND sa2.created_at > v_count.committed_at
    AND sa2.reference_type IS DISTINCT FROM 'stock_count';

  IF v_drift_count > 0 AND NOT p_confirmed_drift THEN
    RAISE EXCEPTION 'Drift detected: % adjustment(s) on % product(s) since commit — confirm to proceed',
      v_drift_count, v_drift_products;
  END IF;

  -- 5. SECOND PASS: write all changes atomically. Locks already held from
  -- step 2 — no per-row guard needed (FIRST PASS validated all rows are
  -- safe and locks prevent interim mutation).
  FOR v_adj IN
    SELECT sa.id, sa.product_id, sa.quantity_change, p.quantity_on_hand AS live_qty
    FROM stock_adjustments sa
    JOIN products p ON p.id = sa.product_id
    WHERE sa.reference_type = 'stock_count'
      AND sa.reference_id = p_count_id
      AND sa.reason NOT LIKE 'Reversal of%'
  LOOP
    UPDATE products
    SET quantity_on_hand = v_adj.live_qty - v_adj.quantity_change
    WHERE id = v_adj.product_id;

    INSERT INTO stock_adjustments (
      product_id,
      adjustment_type,
      quantity_change,
      quantity_before,
      quantity_after,
      reason,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      v_adj.product_id,
      'recount',
      -v_adj.quantity_change,
      v_adj.live_qty,
      v_adj.live_qty - v_adj.quantity_change,
      'Reversal of stock count: ' || v_section_label,
      'stock_count',
      p_count_id,
      p_user_id
    );

    v_reversals_created := v_reversals_created + 1;
  END LOOP;

  -- 6. Flip header to cancelled + append drift context to notes
  UPDATE stock_counts
  SET
    status = 'cancelled',
    cancelled_by = p_user_id,
    cancelled_at = now(),
    notes = COALESCE(notes || E'\n\n', '') ||
            'Reverted ' || to_char(now() AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI TZ') ||
            '. ' || v_reversals_created || ' adjustment(s) inversed' ||
            CASE WHEN v_drift_count > 0
                 THEN '. Drift acknowledged: ' || v_drift_count || ' non-count adjustment(s) on '
                      || v_drift_products || ' product(s) since commit.'
                 ELSE '.'
            END
  WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'count_id', p_count_id,
    'reversals_created', v_reversals_created,
    'drift_count', v_drift_count,
    'drift_products', v_drift_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION revert_stock_count(UUID, UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION revert_stock_count(UUID, UUID, BOOLEAN) IS
  'Atomic reversal of a committed stock count with structured negative-qty '
  'error returns. Session 42K-patch-1. Two-pass: locks affected products, '
  'pre-checks for negative-qty (returns structured error if any), then '
  'checks drift (RAISE if not confirmed), then writes inverses + flips '
  'header to cancelled. Negative-qty is checked BEFORE drift since drift '
  'is meaningless when the action is impossible.';
