-- Notification recipients (extensible for future alert types)
CREATE TABLE IF NOT EXISTS notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('low_stock', 'all')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track last stock alert per product (anti-spam)
CREATE TABLE IF NOT EXISTS stock_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  stock_level INT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low_stock', 'out_of_stock')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_alert_log_product ON stock_alert_log(product_id, created_at DESC);
CREATE INDEX idx_notification_recipients_type ON notification_recipients(notification_type, is_active);
