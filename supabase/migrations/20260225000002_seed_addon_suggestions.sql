-- Migration: Seed service_addon_suggestions with combo pricing
-- 28 add-on suggestion rows across 11 primary services
-- Combo pricing strategy: ~20% discount on standard add-on prices
-- Created: 2026-02-25
-- Idempotent: DELETE + INSERT pattern

-- Safety: verify all referenced services exist before inserting
DO $$
BEGIN
  -- Primary services (11)
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Express Exterior Wash') THEN
    RAISE EXCEPTION 'Service not found: Express Exterior Wash';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Express Interior Clean') THEN
    RAISE EXCEPTION 'Service not found: Express Interior Clean';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Signature Complete Detail') THEN
    RAISE EXCEPTION 'Service not found: Signature Complete Detail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Single-Stage Polish') THEN
    RAISE EXCEPTION 'Service not found: Single-Stage Polish';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = '3-Stage Paint Correction') THEN
    RAISE EXCEPTION 'Service not found: 3-Stage Paint Correction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = '1-Year Ceramic Shield') THEN
    RAISE EXCEPTION 'Service not found: 1-Year Ceramic Shield';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = '3-Year Ceramic Shield') THEN
    RAISE EXCEPTION 'Service not found: 3-Year Ceramic Shield';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = '5-Year Ceramic Shield Plus') THEN
    RAISE EXCEPTION 'Service not found: 5-Year Ceramic Shield Plus';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Booster Detail for Ceramic Coated Vehicles') THEN
    RAISE EXCEPTION 'Service not found: Booster Detail for Ceramic Coated Vehicles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'RV Interior Clean') THEN
    RAISE EXCEPTION 'Service not found: RV Interior Clean';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'RV Exterior Wash') THEN
    RAISE EXCEPTION 'Service not found: RV Exterior Wash';
  END IF;

  -- Add-on services (8)
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Headlight Restoration') THEN
    RAISE EXCEPTION 'Service not found: Headlight Restoration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Trim Restoration') THEN
    RAISE EXCEPTION 'Service not found: Trim Restoration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Hot Shampoo Extraction') THEN
    RAISE EXCEPTION 'Service not found: Hot Shampoo Extraction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Pet Hair & Dander Removal') THEN
    RAISE EXCEPTION 'Service not found: Pet Hair & Dander Removal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Leather Conditioning') THEN
    RAISE EXCEPTION 'Service not found: Leather Conditioning';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Engine Bay Detail') THEN
    RAISE EXCEPTION 'Service not found: Engine Bay Detail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Paint Decontamination & Protection') THEN
    RAISE EXCEPTION 'Service not found: Paint Decontamination & Protection';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM services WHERE name = 'Ozone Odor Treatment') THEN
    RAISE EXCEPTION 'Service not found: Ozone Odor Treatment';
  END IF;
END $$;

-- Wipe existing rows for idempotency
DELETE FROM service_addon_suggestions;

-- Insert 28 add-on suggestion rows
INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, combo_price, display_order, auto_suggest)
VALUES
  -- Express Exterior Wash (2 add-ons)
  ((SELECT id FROM services WHERE name = 'Express Exterior Wash'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = 'Express Exterior Wash'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 2, true),

  -- Express Interior Clean (3 add-ons)
  ((SELECT id FROM services WHERE name = 'Express Interior Clean'), (SELECT id FROM services WHERE name = 'Hot Shampoo Extraction'), NULL, 1, true),
  ((SELECT id FROM services WHERE name = 'Express Interior Clean'), (SELECT id FROM services WHERE name = 'Pet Hair & Dander Removal'), 60.00, 2, true),
  ((SELECT id FROM services WHERE name = 'Express Interior Clean'), (SELECT id FROM services WHERE name = 'Leather Conditioning'), 60.00, 3, true),

  -- Signature Complete Detail (3 add-ons)
  ((SELECT id FROM services WHERE name = 'Signature Complete Detail'), (SELECT id FROM services WHERE name = 'Engine Bay Detail'), 140.00, 1, true),
  ((SELECT id FROM services WHERE name = 'Signature Complete Detail'), (SELECT id FROM services WHERE name = 'Paint Decontamination & Protection'), 140.00, 2, true),
  ((SELECT id FROM services WHERE name = 'Signature Complete Detail'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 3, true),

  -- Single-Stage Polish (2 add-ons)
  ((SELECT id FROM services WHERE name = 'Single-Stage Polish'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = 'Single-Stage Polish'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 2, true),

  -- 3-Stage Paint Correction (2 add-ons)
  ((SELECT id FROM services WHERE name = '3-Stage Paint Correction'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = '3-Stage Paint Correction'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 2, true),

  -- 1-Year Ceramic Shield (3 add-ons)
  ((SELECT id FROM services WHERE name = '1-Year Ceramic Shield'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = '1-Year Ceramic Shield'), (SELECT id FROM services WHERE name = 'Engine Bay Detail'), 140.00, 2, true),
  ((SELECT id FROM services WHERE name = '1-Year Ceramic Shield'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 3, true),

  -- 3-Year Ceramic Shield (3 add-ons)
  ((SELECT id FROM services WHERE name = '3-Year Ceramic Shield'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = '3-Year Ceramic Shield'), (SELECT id FROM services WHERE name = 'Engine Bay Detail'), 140.00, 2, true),
  ((SELECT id FROM services WHERE name = '3-Year Ceramic Shield'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 3, true),

  -- 5-Year Ceramic Shield Plus (3 add-ons)
  ((SELECT id FROM services WHERE name = '5-Year Ceramic Shield Plus'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = '5-Year Ceramic Shield Plus'), (SELECT id FROM services WHERE name = 'Engine Bay Detail'), 140.00, 2, true),
  ((SELECT id FROM services WHERE name = '5-Year Ceramic Shield Plus'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 3, true),

  -- Booster Detail for Ceramic Coated Vehicles (2 add-ons)
  ((SELECT id FROM services WHERE name = 'Booster Detail for Ceramic Coated Vehicles'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = 'Booster Detail for Ceramic Coated Vehicles'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 2, true),

  -- RV Interior Clean (3 add-ons)
  ((SELECT id FROM services WHERE name = 'RV Interior Clean'), (SELECT id FROM services WHERE name = 'Hot Shampoo Extraction'), NULL, 1, true),
  ((SELECT id FROM services WHERE name = 'RV Interior Clean'), (SELECT id FROM services WHERE name = 'Pet Hair & Dander Removal'), 60.00, 2, true),
  ((SELECT id FROM services WHERE name = 'RV Interior Clean'), (SELECT id FROM services WHERE name = 'Ozone Odor Treatment'), 60.00, 3, true),

  -- RV Exterior Wash (2 add-ons)
  ((SELECT id FROM services WHERE name = 'RV Exterior Wash'), (SELECT id FROM services WHERE name = 'Headlight Restoration'), 100.00, 1, true),
  ((SELECT id FROM services WHERE name = 'RV Exterior Wash'), (SELECT id FROM services WHERE name = 'Trim Restoration'), 100.00, 2, true);
