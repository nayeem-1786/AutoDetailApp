-- Migration: Merge "Precision Express" and "Signature Detail" into "Express & Detail Services"
-- Created: 2026-02-24

BEGIN;

-- 1. Rename the "Precision Express" category to "Express & Detail Services"
UPDATE service_categories
SET name = 'Express & Detail Services',
    slug = 'express-detail-services',
    description = 'Express washes, interior cleans, and full signature detailing services',
    updated_at = now()
WHERE slug = 'precision-express';

-- 2. Move services from "Signature Detail" into the merged category
-- Signature Complete Detail gets display_order = 3 (after Express Exterior Wash=1, Express Interior Clean=2)
UPDATE services
SET category_id = (SELECT id FROM service_categories WHERE slug = 'express-detail-services'),
    display_order = 3,
    updated_at = now()
WHERE category_id = (SELECT id FROM service_categories WHERE slug = 'signature-detail');

-- 3. Delete the now-empty "Signature Detail" category
DELETE FROM service_categories WHERE slug = 'signature-detail';

-- 4. Reorder remaining categories to close any display_order gap
-- Current expected order after merge:
--   Express & Detail Services (was Precision Express, order 1)
--   Paint Correction & Restoration (was order 3, now order 2)
--   Ceramic Coatings (was order 4, now order 3)
--   Exterior Enhancements (was order 5, now order 4)
--   Interior Enhancements (was order 6, now order 5)
--   Specialty Vehicles (was order 7, now order 6)
UPDATE service_categories SET display_order = 1 WHERE slug = 'express-detail-services';
UPDATE service_categories SET display_order = 2 WHERE slug = 'paint-correction-restoration';
UPDATE service_categories SET display_order = 3 WHERE slug = 'ceramic-coatings';
UPDATE service_categories SET display_order = 4 WHERE slug = 'exterior-enhancements';
UPDATE service_categories SET display_order = 5 WHERE slug = 'interior-enhancements';
UPDATE service_categories SET display_order = 6 WHERE slug = 'specialty-vehicles';

COMMIT;
