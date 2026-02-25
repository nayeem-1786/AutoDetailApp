-- Migration: Clean up category merge state
-- Context: Migration 20260224000003 renamed "Precision Express" → "Express & Detail Services"
-- and deleted "Signature Detail", but the owner had already created "Express & Detail Services - 2"
-- via the Admin UI and moved the 3 services there. So now we have:
--   - "Express & Detail Services" (empty, from migration rename of Precision Express)
--   - "Express & Detail Services - 2" (owner-created, has the 3 services)
-- This migration deletes the empty one and normalizes the "-2" name.
-- Created: 2026-02-25
-- Idempotent: Safe to run multiple times.

BEGIN;

-- 1. Delete the empty "Express & Detail Services" category (renamed from Precision Express by 20260224000003)
--    Only delete if it has zero services assigned
DELETE FROM service_categories
WHERE slug = 'express-detail-services'
  AND NOT EXISTS (
    SELECT 1 FROM services WHERE category_id = service_categories.id
  );

-- 2. Rename "Express & Detail Services - 2" → "Express & Detail Services"
--    Only rename if the target name doesn't already exist (idempotent)
UPDATE service_categories
SET name = 'Express & Detail Services',
    slug = 'express-detail-services',
    description = 'Express washes, interior cleans, and full signature detailing services',
    updated_at = now()
WHERE slug = 'express-detail-services-2'
  AND NOT EXISTS (
    SELECT 1 FROM service_categories WHERE slug = 'express-detail-services'
  );

-- 3. Fix service display_order within the merged category (currently two services have display_order=1)
UPDATE services SET display_order = 1, updated_at = now()
WHERE name = 'Express Exterior Wash'
  AND category_id = (SELECT id FROM service_categories WHERE slug = 'express-detail-services');

UPDATE services SET display_order = 2, updated_at = now()
WHERE name = 'Express Interior Clean'
  AND category_id = (SELECT id FROM service_categories WHERE slug = 'express-detail-services');

UPDATE services SET display_order = 3, updated_at = now()
WHERE name = 'Signature Complete Detail'
  AND category_id = (SELECT id FROM service_categories WHERE slug = 'express-detail-services');

-- 4. Reorder category display_order to be 1-based with no gaps
UPDATE service_categories SET display_order = 1 WHERE slug = 'express-detail-services';
UPDATE service_categories SET display_order = 2 WHERE slug = 'paint-correction-restoration';
UPDATE service_categories SET display_order = 3 WHERE slug = 'ceramic-coatings';
UPDATE service_categories SET display_order = 4 WHERE slug = 'exterior-enhancements';
UPDATE service_categories SET display_order = 5 WHERE slug = 'interior-enhancements';
UPDATE service_categories SET display_order = 6 WHERE slug = 'specialty-vehicles';

COMMIT;
