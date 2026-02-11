-- Migration: Purchase Orders (redesigned) + Stock Adjustments
-- Drops the old PO tables & enum, creates new schema with simplified statuses

-- ============================================================
-- 1. Drop old PO objects (reverse order of dependencies)
-- ============================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS tr_po_number ON purchase_orders;
DROP TRIGGER IF EXISTS tr_purchase_orders_updated_at ON purchase_orders;

-- Drop RLS policies
DROP POLICY IF EXISTS po_items_write ON po_items;
DROP POLICY IF EXISTS po_items_select ON po_items;
DROP POLICY IF EXISTS po_items_all ON po_items;
DROP POLICY IF EXISTS po_write ON purchase_orders;
DROP POLICY IF EXISTS po_select ON purchase_orders;
DROP POLICY IF EXISTS po_all ON purchase_orders;

-- Drop tables (child first)
DROP TABLE IF EXISTS po_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;

-- Drop old enum
DROP TYPE IF EXISTS po_status;

-- Drop old function
DROP FUNCTION IF EXISTS generate_po_number();


-- ============================================================
-- 2. Create new PO enum with simplified statuses
-- ============================================================

CREATE TYPE po_status AS ENUM ('draft', 'ordered', 'received', 'cancelled');


-- ============================================================
-- 3. Create purchase_orders table
-- ============================================================

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  status po_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);


-- ============================================================
-- 4. Create purchase_order_items table
-- ============================================================

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_product ON purchase_order_items(product_id);


-- ============================================================
-- 5. Create stock_adjustments table
-- ============================================================

CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('manual', 'received', 'sold', 'returned', 'damaged', 'recount')),
  quantity_change INTEGER NOT NULL,
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  reason TEXT,
  reference_id UUID,
  reference_type TEXT CHECK (reference_type IN ('purchase_order', 'transaction', 'refund')),
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_adj_product ON stock_adjustments(product_id);
CREATE INDEX idx_stock_adj_type ON stock_adjustments(adjustment_type);
CREATE INDEX idx_stock_adj_created ON stock_adjustments(created_at DESC);
CREATE INDEX idx_stock_adj_reference ON stock_adjustments(reference_id) WHERE reference_id IS NOT NULL;


-- ============================================================
-- 6. RLS policies
-- ============================================================

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY po_select ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY po_write ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY poi_select ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY poi_write ON purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY sa_select ON stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY sa_write ON stock_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- 7. Auto-generate PO number (PO-000001 format)
-- ============================================================

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM purchase_orders
  WHERE po_number LIKE 'PO-%';

  NEW.po_number = 'PO-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  WHEN (NEW.po_number IS NULL)
  EXECUTE FUNCTION generate_po_number();


-- ============================================================
-- 8. updated_at trigger for purchase_orders
-- ============================================================

CREATE TRIGGER tr_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
