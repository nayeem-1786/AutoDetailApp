-- Session 29 Phase 1b: Backfill size_class from legacy is_exotic/is_classic flags,
-- log dual-flag vehicles to audit_log for historical preservation, drop the flag
-- columns and their partial indexes, add scope-pricing fan-out columns for
-- exotic/classic, and add size_class_manual_override to gate future classifier
-- overwrites.
--
-- Prerequisite: migration 20260418000002 (enum extension) must be committed first.
-- Run this file as a second, independent SQL Editor execution.

-- 1. Audit-log the dual-flag vehicles BEFORE overwriting their size_class.
--    Session 29 owner decision: exotic wins for dual-flag. The "also classic"
--    attribute is permanently lost from the vehicles row, so we persist it here.
INSERT INTO audit_log (action, entity_type, entity_id, entity_label, details, source)
SELECT
  'dual_flag_backfill_preserved',
  'vehicle',
  id::text,
  CONCAT_WS(' ', COALESCE(year::text, ''), COALESCE(make, ''), COALESCE(model, '')),
  jsonb_build_object(
    'was_exotic', true,
    'was_classic', true,
    'resolved_to', 'exotic',
    'prior_size_class', size_class::text,
    'reason', 'Session 29 architecture cleanup: dual-flag consolidated to exotic (exotic wins policy)'
  ),
  'migration'
FROM vehicles
WHERE is_exotic = true AND is_classic = true;

-- 2. Backfill size_class from the legacy flags.
--    Exotic wins over classic for dual-flag vehicles (processed first).
UPDATE vehicles
SET size_class = 'exotic'
WHERE is_exotic = true;

UPDATE vehicles
SET size_class = 'classic'
WHERE is_classic = true
  AND is_exotic = false;

-- 3. Drop the partial indexes before dropping the columns they reference.
DROP INDEX IF EXISTS idx_vehicles_is_exotic;
DROP INDEX IF EXISTS idx_vehicles_is_classic;
DROP INDEX IF EXISTS idx_vehicles_requires_custom_quote;

-- 4. Drop the generated column FIRST (depends on is_exotic / is_classic).
ALTER TABLE vehicles DROP COLUMN IF EXISTS requires_custom_quote;

-- 5. Drop the source flag columns.
ALTER TABLE vehicles DROP COLUMN IF EXISTS is_exotic;
ALTER TABLE vehicles DROP COLUMN IF EXISTS is_classic;

-- 6. Add scope-pricing fan-out columns for is_vehicle_size_aware scope tiers.
--    Currently only Hot Shampoo Extraction's "Complete Interior" tier uses this
--    pattern. Columns are nullable; NULL means "fall through to tier base price".
ALTER TABLE service_pricing
  ADD COLUMN IF NOT EXISTS vehicle_size_exotic_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS vehicle_size_classic_price DECIMAL(10,2);

-- 7. Admin vehicle-edit dropdown-wins persistence (Session 29 bonus / owner M5).
--    When staff sets size_class via the admin dropdown, the app also sets
--    size_class_manual_override = true. findOrCreateVehicle() checks this flag
--    and skips the classifier's size_class overwrite when true. Flag resets to
--    false when the vehicle's make or model changes (classifier re-runs fresh).
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS size_class_manual_override BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vehicles.size_class_manual_override IS
  'When true, findOrCreateVehicle and classifier runs skip overwriting size_class. Set by admin vehicle-edit dropdown save. Reset by any make/model change.';
