-- Session 42D-1: Inventory Count feature — schema.
--
-- Two new tables (header + items), RPC function for atomic commit,
-- extension of stock_adjustments.reference_type CHECK, and seed of
-- the inventory.counts.manage permission.
--
-- Design source: docs/audits/INVENTORY_COUNT_AUDIT_SESSION42C.md (Option C
-- data model, first-touch expected_qty freeze, recount adjustment type).

-- =============================================================================
-- 1. stock_counts (header)
-- =============================================================================

CREATE TABLE stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'review', 'committed', 'cancelled')),
  count_type TEXT NOT NULL DEFAULT 'sectional'
    CHECK (count_type IN ('full', 'sectional')),
  section_label TEXT,
  notes TEXT,
  started_by UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_by UUID REFERENCES employees(id) ON DELETE RESTRICT,
  committed_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES employees(id) ON DELETE RESTRICT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_counts_status ON stock_counts(status);
CREATE INDEX idx_stock_counts_started_at ON stock_counts(started_at DESC);

CREATE TRIGGER tr_stock_counts_updated_at
  BEFORE UPDATE ON stock_counts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_counts_all ON stock_counts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE stock_counts IS
  'Header for inventory count sessions. See Session 42D-1.';

-- =============================================================================
-- 2. stock_count_items (lines)
-- =============================================================================

CREATE TABLE stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  -- First-touch freeze: snapshotted when the product first enters the count.
  -- Never updated after insert. Commit math = counted_qty - expected_qty.
  expected_qty INTEGER NOT NULL,
  counted_qty INTEGER NOT NULL DEFAULT 0,
  last_updated_by UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stock_count_id, product_id)
);

CREATE INDEX idx_stock_count_items_count ON stock_count_items(stock_count_id);
CREATE INDEX idx_stock_count_items_product ON stock_count_items(product_id);

CREATE TRIGGER tr_stock_count_items_updated_at
  BEFORE UPDATE ON stock_count_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_count_items_all ON stock_count_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE stock_count_items IS
  'Per-product line items within a stock count. expected_qty is '
  'snapshotted at first-touch (Session 42D-1).';

-- =============================================================================
-- 3. Extend stock_adjustments.reference_type CHECK
-- =============================================================================

ALTER TABLE stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_reference_type_check;

ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_reference_type_check
  CHECK (reference_type IN (
    'purchase_order', 'transaction', 'refund', 'shop_use', 'stock_count'
  ));

-- =============================================================================
-- 4. commit_stock_count RPC — atomic commit
-- =============================================================================

CREATE OR REPLACE FUNCTION commit_stock_count(
  p_count_id UUID,
  p_employee_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count RECORD;
  v_item RECORD;
  v_delta INTEGER;
  v_new_qty INTEGER;
  v_adjustment_count INTEGER := 0;
BEGIN
  SELECT * INTO v_count
  FROM stock_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'Count not found';
  END IF;

  IF v_count.status NOT IN ('active', 'review') THEN
    RAISE EXCEPTION 'Count not in committable status: %', v_count.status;
  END IF;

  FOR v_item IN
    SELECT sci.*, p.quantity_on_hand AS live_qty
    FROM stock_count_items sci
    JOIN products p ON p.id = sci.product_id
    WHERE sci.stock_count_id = p_count_id
    FOR UPDATE OF p
  LOOP
    v_delta := v_item.counted_qty - v_item.expected_qty;
    v_new_qty := v_item.live_qty + v_delta;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'Commit would set negative quantity for product %', v_item.product_id;
    END IF;

    -- Skip zero-delta items: no change needed, no audit noise.
    IF v_delta <> 0 THEN
      UPDATE products
      SET quantity_on_hand = v_new_qty
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
        created_by
      ) VALUES (
        v_item.product_id,
        'recount',
        v_delta,
        v_item.live_qty,
        v_new_qty,
        'Stock count: ' || COALESCE(v_count.section_label, 'full store'),
        'stock_count',
        p_count_id,
        p_employee_id
      );

      v_adjustment_count := v_adjustment_count + 1;
    END IF;
  END LOOP;

  UPDATE stock_counts
  SET status = 'committed',
      committed_by = p_employee_id,
      committed_at = now()
  WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'count_id', p_count_id,
    'adjustments_created', v_adjustment_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION commit_stock_count(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION commit_stock_count(UUID, UUID) IS
  'Atomic commit of a stock count. Session 42D-1. Updates '
  'products.quantity_on_hand and writes stock_adjustments rows '
  'inside a single Postgres transaction. Skips zero-delta items. '
  'Aborts if any product would go negative.';

-- =============================================================================
-- 5. Seed inventory.counts.manage permission
-- =============================================================================

INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES (
  'inventory.counts.manage',
  'Manage Inventory Counts',
  'Start, edit, commit, and cancel inventory count sessions',
  'Inventory',
  507
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT 'inventory.counts.manage', r.name::user_role, r.id,
  CASE WHEN r.name IN ('super_admin', 'admin') THEN true ELSE false END
FROM roles r
ON CONFLICT (permission_key, role) DO NOTHING;
