CREATE TABLE waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  service_id UUID NOT NULL REFERENCES services(id),
  preferred_date DATE,
  preferred_time_start TIME,
  preferred_time_end TIME,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','booked','expired','cancelled')),
  notified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_entries_customer ON waitlist_entries(customer_id);
CREATE INDEX idx_waitlist_entries_service ON waitlist_entries(service_id);
CREATE INDEX idx_waitlist_entries_status ON waitlist_entries(status);
CREATE INDEX idx_waitlist_entries_date ON waitlist_entries(preferred_date);
