-- Add unique constraint on pin_code (NULLs are allowed — only non-null values must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS employees_pin_code_unique ON employees (pin_code) WHERE pin_code IS NOT NULL;
