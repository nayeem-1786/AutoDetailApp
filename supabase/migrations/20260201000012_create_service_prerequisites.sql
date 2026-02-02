CREATE TABLE service_prerequisites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  prerequisite_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  enforcement prerequisite_enforcement NOT NULL DEFAULT 'required_same_ticket',
  history_window_days INTEGER DEFAULT 30, -- for required_history enforcement
  warning_message TEXT, -- shown when prerequisite not met
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id, prerequisite_service_id),
  CHECK (service_id != prerequisite_service_id)
);

CREATE INDEX idx_prerequisites_service ON service_prerequisites(service_id);
