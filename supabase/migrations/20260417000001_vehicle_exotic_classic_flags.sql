-- Session 26: Add exotic/classic classification flags to vehicles
--
-- Root cause: resolveVehicleClassification() correctly detects exotic/classic
-- vehicles, but the flags were never persisted — the vehicles table had no
-- columns for them. This migration adds is_exotic, is_classic, and a
-- generated requires_custom_quote column.

-- ═══════════════════════════════════════════════════════════════
-- 1. Add is_exotic flag
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vehicles ADD COLUMN is_exotic BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════
-- 2. Add is_classic flag
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vehicles ADD COLUMN is_classic BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════
-- 3. Add generated requires_custom_quote column
-- Computed from is_exotic OR is_classic — single field for downstream checks.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vehicles ADD COLUMN requires_custom_quote BOOLEAN
  GENERATED ALWAYS AS (is_exotic OR is_classic) STORED;

-- ═══════════════════════════════════════════════════════════════
-- 4. Partial indexes for flag-based queries
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX idx_vehicles_is_exotic ON vehicles(is_exotic) WHERE is_exotic = true;
CREATE INDEX idx_vehicles_is_classic ON vehicles(is_classic) WHERE is_classic = true;
CREATE INDEX idx_vehicles_requires_custom_quote ON vehicles(requires_custom_quote) WHERE requires_custom_quote = true;
