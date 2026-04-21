-- Session 37: Extend stock_adjustments for unified audit trail + shop-use feature
-- Apply via Supabase SQL Editor (consistent with prior sessions)

-- 1. Extend adjustment_type to include shop_use + customer_retained
ALTER TABLE stock_adjustments
  DROP CONSTRAINT stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type IN (
    'manual', 'received', 'sold', 'returned',
    'damaged', 'recount', 'shop_use', 'customer_retained'
  ));

-- 2. Extend reference_type to include shop_use
ALTER TABLE stock_adjustments
  DROP CONSTRAINT stock_adjustments_reference_type_check;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_reference_type_check
  CHECK (reference_type IN (
    'purchase_order', 'transaction', 'refund', 'shop_use'
  ));

-- 3. Cost snapshot for expense reporting
-- Nullable: existing rows stay NULL; new rows (esp. shop_use + sold)
-- snapshot products.cost_price at insert time
ALTER TABLE stock_adjustments
  ADD COLUMN unit_cost NUMERIC(10,2) DEFAULT NULL;

-- 4. Index for the expense report date-range queries
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_type_created
  ON stock_adjustments (adjustment_type, created_at DESC);

-- 5. refund_items disposition column
-- Replaces the old restock boolean semantically. Keep restock column for
-- backwards-compat reads; write both going forward.
ALTER TABLE refund_items
  ADD COLUMN disposition TEXT CHECK (
    disposition IN ('restock', 'damaged', 'customer_retained')
  );
