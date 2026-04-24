-- Session 42K: Revert committed stock count.
--
-- Adds:
-- 1. inventory.counts.revert permission (sort_order 508)
-- 2. revert_stock_count(p_count_id, p_user_id, p_confirmed_drift) RPC
--
-- Design source: docs/audits/REVERT_STOCK_COUNT_SESSION42K.md
-- Apply manually via Supabase SQL Editor.

-- =============================================================================
-- 1. Seed inventory.counts.revert permission
-- =============================================================================

INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES (
  'inventory.counts.revert',
  'Revert Inventory Counts',
  'Reverse a committed inventory count — restores pre-commit quantities and writes inverse adjustment rows',
  'Inventory',
  508
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT 'inventory.counts.revert', r.name::user_role, r.id,
  CASE WHEN r.name IN ('super_admin', 'admin') THEN true ELSE false END
FROM roles r
ON CONFLICT (permission_key, role) DO NOTHING;

-- =============================================================================
-- 2. revert_stock_count RPC — atomic reversal
-- =============================================================================
--
-- Mirrors commit_stock_count's structure. Walks the stock_adjustments ledger
-- (reference_type='stock_count', reference_id=p_count_id), inverting each
-- row's quantity_change, writing a new "Reversal of..." adjustment row, and
-- updating products.quantity_on_hand. Flips header to 'cancelled' and appends
-- drift context to notes.
--
-- The ledger is self-contained — we do NOT read stock_count_items. Even if
-- those rows were deleted somehow, the reversal math still works as long as
-- the adjustment rows exist (they do — no CASCADE from stock_counts to
-- stock_adjustments).
--
-- Drift = stock_adjustments rows on the same products, after commit, whose
-- reference_type is NOT 'stock_count'. Examples: POS sales (reference_type=
-- 'transaction'), refunds ('refund'), shop-use ('shop_use'), PO receipts
-- ('purchase_order'). Drift is ALWAYS checked inside the RPC (authoritative)
-- regardless of what the preview said — prevents TOCTOU between preview and
-- confirm.

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
  v_reverse_qty INTEGER;
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

  -- 2. Authoritative drift check
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

  -- 3. Loop over original adjustment rows, write inverses, update products
  FOR v_adj IN
    SELECT sa.id, sa.product_id, sa.quantity_change, p.quantity_on_hand AS live_qty
    FROM stock_adjustments sa
    JOIN products p ON p.id = sa.product_id
    WHERE sa.reference_type = 'stock_count'
      AND sa.reference_id = p_count_id
      AND sa.reason NOT LIKE 'Reversal of%'
    FOR UPDATE OF p
  LOOP
    v_reverse_qty := v_adj.live_qty - v_adj.quantity_change;

    IF v_reverse_qty < 0 THEN
      RAISE EXCEPTION 'Revert would set negative quantity for product %', v_adj.product_id;
    END IF;

    UPDATE products
    SET quantity_on_hand = v_reverse_qty
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
      v_reverse_qty,
      'Reversal of stock count: ' || v_section_label,
      'stock_count',
      p_count_id,
      p_user_id
    );

    v_reversals_created := v_reversals_created + 1;
  END LOOP;

  -- 4. Flip header to cancelled + append drift context to notes
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
    'count_id', p_count_id,
    'reversals_created', v_reversals_created,
    'drift_count', v_drift_count,
    'drift_products', v_drift_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION revert_stock_count(UUID, UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION revert_stock_count(UUID, UUID, BOOLEAN) IS
  'Atomic reversal of a committed stock count. Session 42K. Walks the '
  'stock_adjustments ledger for reference_id=<count>, writes inverse rows, '
  'updates products.quantity_on_hand, and flips the header to cancelled. '
  'Rejects if drift exists and p_confirmed_drift is false. Aborts if any '
  'product would go negative after reversal.';
