CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL,
  role user_role, -- NULL = user-level override
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE, -- NULL = role-level default
  granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either role-level (role set, employee_id NULL) or user-level (employee_id set, role NULL)
  CONSTRAINT valid_permission_target CHECK (
    (role IS NOT NULL AND employee_id IS NULL) OR
    (role IS NULL AND employee_id IS NOT NULL)
  ),
  -- Unique per role+permission or per employee+permission
  UNIQUE(permission_key, role),
  UNIQUE(permission_key, employee_id)
);

CREATE INDEX idx_permissions_role ON permissions(role);
CREATE INDEX idx_permissions_employee ON permissions(employee_id);
CREATE INDEX idx_permissions_key ON permissions(permission_key);
