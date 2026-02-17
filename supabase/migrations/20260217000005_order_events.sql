-- Order events table for tracking order lifecycle
CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'paid', 'fulfillment_updated', 'shipped', 'delivered',
    'ready_for_pickup', 'refunded', 'partially_refunded', 'note_added',
    'tracking_updated', 'cancelled'
  )),
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);

-- RLS
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access on order_events"
    ON order_events FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read order_events"
    ON order_events FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add orders.view and orders.manage to permission_definitions
INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES
  ('orders.view', 'View Orders', 'View online store orders and order details', 'Online Store', 90),
  ('orders.manage', 'Manage Orders', 'Update fulfillment status, process refunds, manage order lifecycle', 'Online Store', 91)
ON CONFLICT DO NOTHING;

-- Seed permissions for 4 system roles
-- Must include both role (enum) and role_id (FK) to satisfy valid_permission_target CHECK constraint
-- super_admin and admin get both view + manage; cashier gets view only
INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT p.pkey, r.name::user_role, r.id,
  CASE
    WHEN p.pkey = 'orders.view' THEN true
    WHEN p.pkey = 'orders.manage' AND r.name IN ('super_admin', 'admin') THEN true
    ELSE false
  END
FROM roles r
CROSS JOIN (
  VALUES ('orders.view'), ('orders.manage')
) AS p(pkey)
WHERE r.name IN ('super_admin', 'admin', 'cashier', 'detailer')
ON CONFLICT (permission_key, role) DO NOTHING;
