-- Migration: Seed all 30 services with pricing, addon suggestions, and prerequisites
-- Created: 2026-02-01

BEGIN;

DO $$
DECLARE
  -- Category IDs
  cat_precision_express UUID;
  cat_signature_detail UUID;
  cat_paint_correction UUID;
  cat_ceramic_coatings UUID;
  cat_exterior_enhancements UUID;
  cat_interior_enhancements UUID;
  cat_specialty_vehicles UUID;

  -- Service IDs (Category 1: Precision Express)
  svc_express_exterior_wash UUID;
  svc_express_interior_clean UUID;

  -- Service IDs (Category 2: Signature Detail)
  svc_signature_complete_detail UUID;

  -- Service IDs (Category 3: Paint Correction & Restoration)
  svc_single_stage_polish UUID;
  svc_3_stage_paint_correction UUID;

  -- Service IDs (Category 4: Ceramic Coatings)
  svc_1_year_ceramic_shield UUID;
  svc_3_year_ceramic_shield UUID;
  svc_5_year_ceramic_shield_plus UUID;

  -- Service IDs (Category 5: Exterior Enhancements)
  svc_paint_decontamination UUID;
  svc_booster_detail UUID;
  svc_headlight_restoration UUID;
  svc_engine_bay_detail UUID;
  svc_undercarriage_steam UUID;
  svc_scratch_repair UUID;
  svc_trim_restoration UUID;
  svc_water_spot_removal UUID;

  -- Service IDs (Category 6: Interior Enhancements)
  svc_pet_hair_removal UUID;
  svc_leather_conditioning UUID;
  svc_excessive_cleaning_fee UUID;
  svc_ozone_odor_treatment UUID;
  svc_hot_shampoo_extraction UUID;
  svc_organic_stain_treatment UUID;
  svc_flood_damage_mold UUID;

  -- Service IDs (Category 7: Specialty Vehicles)
  svc_motorcycle_detail UUID;
  svc_rv_interior_clean UUID;
  svc_rv_exterior_wash UUID;
  svc_boat_interior_clean UUID;
  svc_boat_exterior_wash UUID;
  svc_aircraft_interior_clean UUID;
  svc_aircraft_exterior_wash UUID;

BEGIN
  -- Look up category IDs by slug
  SELECT id INTO cat_precision_express FROM service_categories WHERE slug = 'precision-express';
  SELECT id INTO cat_signature_detail FROM service_categories WHERE slug = 'signature-detail';
  SELECT id INTO cat_paint_correction FROM service_categories WHERE slug = 'paint-correction-restoration';
  SELECT id INTO cat_ceramic_coatings FROM service_categories WHERE slug = 'ceramic-coatings';
  SELECT id INTO cat_exterior_enhancements FROM service_categories WHERE slug = 'exterior-enhancements';
  SELECT id INTO cat_interior_enhancements FROM service_categories WHERE slug = 'interior-enhancements';
  SELECT id INTO cat_specialty_vehicles FROM service_categories WHERE slug = 'specialty-vehicles';

  -- Verify all categories exist
  IF cat_precision_express IS NULL OR cat_signature_detail IS NULL OR cat_paint_correction IS NULL OR
     cat_ceramic_coatings IS NULL OR cat_exterior_enhancements IS NULL OR cat_interior_enhancements IS NULL OR
     cat_specialty_vehicles IS NULL THEN
    RAISE EXCEPTION 'One or more service categories not found. Please run category migration first.';
  END IF;

  -- =====================================================================
  -- CATEGORY 1: PRECISION EXPRESS
  -- =====================================================================

  -- Service 1: Express Exterior Wash
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Express Exterior Wash',
    'express-exterior-wash',
    'Premium foam wash with pH-balanced shampoo. Includes wheel and tire cleaning, window streak-free finish, and tire dressing.',
    cat_precision_express,
    'vehicle_size',
    'primary',
    45,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    1
  ) RETURNING id INTO svc_express_exterior_wash;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_express_exterior_wash, 'sedan', 'Sedan', 75.00, 1),
    (svc_express_exterior_wash, 'truck_suv_2row', 'Truck/SUV (2-Row)', 90.00, 2),
    (svc_express_exterior_wash, 'suv_3row_van', 'SUV (3-Row) / Van', 110.00, 3);

  -- Service 2: Express Interior Clean
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Express Interior Clean',
    'express-interior-clean',
    'Complete vacuum of all surfaces including trunk. All interior surfaces wiped, cup holders and vents detailed, glass cleaned inside and out.',
    cat_precision_express,
    'vehicle_size',
    'primary',
    45,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    2
  ) RETURNING id INTO svc_express_interior_clean;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_express_interior_clean, 'sedan', 'Sedan', 85.00, 1),
    (svc_express_interior_clean, 'truck_suv_2row', 'Truck/SUV (2-Row)', 100.00, 2),
    (svc_express_interior_clean, 'suv_3row_van', 'SUV (3-Row) / Van', 120.00, 3);

  -- =====================================================================
  -- CATEGORY 2: SIGNATURE DETAIL
  -- =====================================================================

  -- Service 3: Signature Complete Detail
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Signature Complete Detail',
    'signature-complete-detail',
    'Full interior and exterior rejuvenation. Interior: deep vacuum, all surfaces cleaned and conditioned, vents and crevices detailed, interior dressing. Exterior: spot-free RO water pre-rinse, hand wash, door jambs, wheel wells, premium liquid wax hand-applied.',
    cat_signature_detail,
    'vehicle_size',
    'primary',
    210,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    1
  ) RETURNING id INTO svc_signature_complete_detail;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_signature_complete_detail, 'sedan', 'Sedan', 210.00, 1),
    (svc_signature_complete_detail, 'truck_suv_2row', 'Truck/SUV (2-Row)', 260.00, 2),
    (svc_signature_complete_detail, 'suv_3row_van', 'SUV (3-Row) / Van', 320.00, 3);

  -- =====================================================================
  -- CATEGORY 3: PAINT CORRECTION & RESTORATION
  -- =====================================================================

  -- Service 4: Single-Stage Polish
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Single-Stage Polish',
    'single-stage-polish',
    '50-70% defect removal. Removes light swirls and minor scratches, restores gloss and clarity.',
    cat_paint_correction,
    'vehicle_size',
    'primary',
    270,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    1
  ) RETURNING id INTO svc_single_stage_polish;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_single_stage_polish, 'sedan', 'Sedan', 450.00, 1),
    (svc_single_stage_polish, 'truck_suv_2row', 'Truck/SUV (2-Row)', 525.00, 2),
    (svc_single_stage_polish, 'suv_3row_van', 'SUV (3-Row) / Van', 600.00, 3);

  -- Service 5: 3-Stage Paint Correction
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    '3-Stage Paint Correction',
    '3-stage-paint-correction',
    '85-95% defect removal. Comprehensive correction process including paint decontamination and SiO2 protection.',
    cat_paint_correction,
    'vehicle_size',
    'primary',
    390,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    2
  ) RETURNING id INTO svc_3_stage_paint_correction;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_3_stage_paint_correction, 'sedan', 'Sedan', 650.00, 1),
    (svc_3_stage_paint_correction, 'truck_suv_2row', 'Truck/SUV (2-Row)', 750.00, 2),
    (svc_3_stage_paint_correction, 'suv_3row_van', 'SUV (3-Row) / Van', 975.00, 3);

  -- =====================================================================
  -- CATEGORY 4: CERAMIC COATINGS
  -- =====================================================================

  -- Service 6: 1-Year Ceramic Shield
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    '1-Year Ceramic Shield',
    '1-year-ceramic-shield',
    'Entry-level professional ceramic coating protection. Creates an invisible barrier that repels water, contaminants, and UV rays. Maintains showroom gloss and makes washing effortless. Ideal for drivers who want premium protection without the long-term commitment. Professional-grade SiO2 ceramic coating applied in a controlled environment by certified technicians.',
    cat_ceramic_coatings,
    'vehicle_size',
    'primary',
    150,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    1
  ) RETURNING id INTO svc_1_year_ceramic_shield;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_1_year_ceramic_shield, 'sedan', 'Sedan', 425.00, 1),
    (svc_1_year_ceramic_shield, 'truck_suv_2row', 'Truck/SUV (2-Row)', 525.00, 2),
    (svc_1_year_ceramic_shield, 'suv_3row_van', 'SUV (3-Row) / Van', 625.00, 3);

  -- Service 7: 3-Year Ceramic Shield
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    '3-Year Ceramic Shield',
    '3-year-ceramic-shield',
    'Mid-tier professional ceramic coating with enhanced durability and hydrophobic properties. Three years of protection against UV damage, chemical etching, bird droppings, and tree sap. Superior self-cleaning effect keeps your vehicle looking freshly detailed between washes. Multi-layer application for maximum depth and gloss.',
    cat_ceramic_coatings,
    'vehicle_size',
    'primary',
    150,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    2
  ) RETURNING id INTO svc_3_year_ceramic_shield;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_3_year_ceramic_shield, 'sedan', 'Sedan', 625.00, 1),
    (svc_3_year_ceramic_shield, 'truck_suv_2row', 'Truck/SUV (2-Row)', 750.00, 2),
    (svc_3_year_ceramic_shield, 'suv_3row_van', 'SUV (3-Row) / Van', 875.00, 3);

  -- Service 8: 5-Year Ceramic Shield Plus
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    '5-Year Ceramic Shield Plus',
    '5-year-ceramic-shield-plus',
    'Our premium ceramic coating package delivering maximum longevity and the ultimate hydrophobic finish. Five years of uncompromising protection with enhanced scratch resistance, extreme water beading, and a mirror-like depth of gloss. The gold standard in ceramic coating technology for discerning vehicle owners who demand the best.',
    cat_ceramic_coatings,
    'vehicle_size',
    'primary',
    210,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    3
  ) RETURNING id INTO svc_5_year_ceramic_shield_plus;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_5_year_ceramic_shield_plus, 'sedan', 'Sedan', 825.00, 1),
    (svc_5_year_ceramic_shield_plus, 'truck_suv_2row', 'Truck/SUV (2-Row)', 950.00, 2),
    (svc_5_year_ceramic_shield_plus, 'suv_3row_van', 'SUV (3-Row) / Van', 1075.00, 3);

  -- =====================================================================
  -- CATEGORY 5: EXTERIOR ENHANCEMENTS
  -- =====================================================================

  -- Service 9: Paint Decontamination & Protection
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Paint Decontamination & Protection',
    'paint-decontamination-protection',
    'Clay bar treatment followed by ceramic wax application. Removes embedded contaminants, restores smooth glass-like finish with water-repelling protection. Note: Included in 3-Stage Paint Correction.',
    cat_exterior_enhancements,
    'flat',
    'addon_only',
    90,
    175.00,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    1
  ) RETURNING id INTO svc_paint_decontamination;

  -- Service 10: Booster Detail for Ceramic Coated Vehicles
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Booster Detail for Ceramic Coated Vehicles',
    'booster-detail-ceramic',
    'Decontaminates and rejuvenates existing ceramic coating performance. Restores hydrophobic properties and self-cleaning effect.',
    cat_exterior_enhancements,
    'flat',
    'primary',
    90,
    125.00,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    2
  ) RETURNING id INTO svc_booster_detail;

  -- Service 11: Headlight Restoration
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Headlight Restoration',
    'headlight-restoration',
    'Restores cloudy/yellowed headlights to crystal clarity. Improves visibility up to 70%.',
    cat_exterior_enhancements,
    'flat',
    'both',
    45,
    125.00,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    3
  ) RETURNING id INTO svc_headlight_restoration;

  -- Service 12: Engine Bay Detail
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Engine Bay Detail',
    'engine-bay-detail',
    'Steam clean and dress all engine bay components. Removes grease, dust, and grime for showroom-worthy appearance.',
    cat_exterior_enhancements,
    'flat',
    'both',
    60,
    175.00,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    4
  ) RETURNING id INTO svc_engine_bay_detail;

  -- Service 13: Undercarriage Steam Cleaning
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Undercarriage Steam Cleaning',
    'undercarriage-steam-cleaning',
    'Removes road salt, mud, and grime from undercarriage. Prevents rust and corrosion.',
    cat_exterior_enhancements,
    'flat',
    'both',
    45,
    125.00,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    5
  ) RETURNING id INTO svc_undercarriage_steam;

  -- Service 14: Scratch Repair
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, per_unit_price, per_unit_max, per_unit_label,
    mobile_eligible, online_bookable, is_taxable, vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Scratch Repair',
    'scratch-repair',
    'Professional repair for parking lot scratches and surface damage. Per-panel pricing.',
    cat_exterior_enhancements,
    'per_unit',
    'both',
    90,
    150.00,
    4,
    'panel',
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    6
  ) RETURNING id INTO svc_scratch_repair;

  -- Service 15: Trim Restoration
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Trim Restoration',
    'trim-restoration',
    'Restores faded black trim and plastics to deep black finish.',
    cat_exterior_enhancements,
    'flat',
    'both',
    60,
    125.00,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    7
  ) RETURNING id INTO svc_trim_restoration;

  -- Service 16: Water Spot Removal
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Water Spot Removal',
    'water-spot-removal',
    'Specialized treatment to dissolve mineral deposits from glass and paint surfaces.',
    cat_exterior_enhancements,
    'flat',
    'both',
    60,
    125.00,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    8
  ) RETURNING id INTO svc_water_spot_removal;

  -- =====================================================================
  -- CATEGORY 6: INTERIOR ENHANCEMENTS
  -- =====================================================================

  -- Service 17: Pet Hair & Dander Removal
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Pet Hair & Dander Removal',
    'pet-hair-dander-removal',
    'Specialized extraction of pet hair from carpets, upholstery, and hard-to-reach areas.',
    cat_interior_enhancements,
    'flat',
    'addon_only',
    38,
    75.00,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    1
  ) RETURNING id INTO svc_pet_hair_removal;

  -- Service 18: Leather Conditioning
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Leather Conditioning',
    'leather-conditioning',
    'Professional-grade conditioning treatment that restores suppleness and adds UV protection to leather surfaces.',
    cat_interior_enhancements,
    'flat',
    'addon_only',
    30,
    75.00,
    true,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    2
  ) RETURNING id INTO svc_leather_conditioning;

  -- Service 19: Excessive Cleaning Fee
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, staff_assessed, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Excessive Cleaning Fee',
    'excessive-cleaning-fee',
    'Surcharge for vehicles with condition exceeding normal dirt levels.',
    cat_interior_enhancements,
    'flat',
    'addon_only',
    45,
    75.00,
    false,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    3
  ) RETURNING id INTO svc_excessive_cleaning_fee;

  -- Service 20: Ozone Odor Treatment
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Ozone Odor Treatment',
    'ozone-odor-treatment',
    'Eliminates lingering odors (smoke, food, pets) at the molecular level. Not a masking scent — genuine odor elimination.',
    cat_interior_enhancements,
    'flat',
    'addon_only',
    90,
    75.00,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    4
  ) RETURNING id INTO svc_ozone_odor_treatment;

  -- Service 21: Hot Shampoo Extraction
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Hot Shampoo Extraction',
    'hot-shampoo-extraction',
    'Hot water extraction process with enzyme pre-soak and citrus detergent. Lifts deep stains and embedded grime from fabric surfaces.',
    cat_interior_enhancements,
    'scope',
    'both',
    120,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    5
  ) RETURNING id INTO svc_hot_shampoo_extraction;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_hot_shampoo_extraction, 'floor_mats', 'Floor Mats Only', 75.00, 1),
    (svc_hot_shampoo_extraction, 'per_row', 'Per Seat Row', 125.00, 2),
    (svc_hot_shampoo_extraction, 'carpet_mats', 'Carpet & Mats Package', 175.00, 3);

  -- Complete Interior tier with vehicle size awareness
  INSERT INTO service_pricing (
    service_id, tier_name, tier_label, price, display_order,
    is_vehicle_size_aware, vehicle_size_sedan_price, vehicle_size_truck_suv_price, vehicle_size_suv_van_price
  ) VALUES (
    svc_hot_shampoo_extraction, 'complete', 'Complete Interior', 300.00, 4,
    true, 300.00, 350.00, 450.00
  );

  -- Service 22: Organic Stain Treatment
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, flat_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Organic Stain Treatment',
    'organic-stain-treatment',
    'Enzyme treatment for organic stains from pets, children, or illness. Breaks down organic matter to eliminate both stain and odor.',
    cat_interior_enhancements,
    'flat',
    'both',
    90,
    175.00,
    false,
    true,
    false,
    '["standard"]'::jsonb,
    true,
    6
  ) RETURNING id INTO svc_organic_stain_treatment;

  -- Service 23: Flood Damage / Mold Extraction
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, custom_starting_price, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Flood Damage / Mold Extraction',
    'flood-damage-mold-extraction',
    'Comprehensive extraction and treatment for water-damaged vehicles. Eliminates mold spores, removes moisture, and sanitizes affected areas.',
    cat_interior_enhancements,
    'custom',
    'primary',
    240,
    475.00,
    false,
    false,
    false,
    '["standard"]'::jsonb,
    true,
    7
  ) RETURNING id INTO svc_flood_damage_mold;

  -- =====================================================================
  -- CATEGORY 7: SPECIALTY VEHICLES
  -- =====================================================================

  -- Service 24: Complete Motorcycle Detail
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Complete Motorcycle Detail',
    'complete-motorcycle-detail',
    'Comprehensive motorcycle service: hand wash, bug and tar removal, chrome polishing, engine brightening, and 1-year ceramic wax protection.',
    cat_specialty_vehicles,
    'specialty',
    'primary',
    180,
    true,
    true,
    false,
    '["motorcycle"]'::jsonb,
    true,
    1
  ) RETURNING id INTO svc_motorcycle_detail;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_motorcycle_detail, 'standard_cruiser', 'Standard/Cruiser', 275.00, 1),
    (svc_motorcycle_detail, 'touring_bagger', 'Touring/Bagger', 350.00, 2);

  -- Service 25: RV Interior Clean
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'RV Interior Clean',
    'rv-interior-clean',
    'Deep clean of cab, living spaces, kitchen, bathroom, and storage compartments using RV-safe products.',
    cat_specialty_vehicles,
    'specialty',
    'primary',
    210,
    false,
    true,
    false,
    '["rv"]'::jsonb,
    true,
    2
  ) RETURNING id INTO svc_rv_interior_clean;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_rv_interior_clean, 'rv_up_to_24', 'Up to 24''', 350.00, 1),
    (svc_rv_interior_clean, 'rv_25_35', '25-35''', 450.00, 2),
    (svc_rv_interior_clean, 'rv_36_plus', '36''+', 550.00, 3);

  -- Service 26: RV Exterior Wash
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'RV Exterior Wash',
    'rv-exterior-wash',
    'Roof cleaning, oxidation removal, full body wash, tire and wheel detailing, sealant application.',
    cat_specialty_vehicles,
    'specialty',
    'primary',
    540,
    false,
    true,
    false,
    '["rv"]'::jsonb,
    true,
    3
  ) RETURNING id INTO svc_rv_exterior_wash;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_rv_exterior_wash, 'rv_up_to_24', 'Up to 24''', 650.00, 1),
    (svc_rv_exterior_wash, 'rv_25_35', '25-35''', 850.00, 2),
    (svc_rv_exterior_wash, 'rv_36_plus', '36''+', 1050.00, 3);

  -- Service 27: Boat Interior Clean
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Boat Interior Clean',
    'boat-interior-clean',
    'Deep clean all surfaces, condition vinyl and leather with marine-grade UV protection, bilge cleaning, odor elimination.',
    cat_specialty_vehicles,
    'specialty',
    'primary',
    150,
    false,
    true,
    false,
    '["boat"]'::jsonb,
    true,
    4
  ) RETURNING id INTO svc_boat_interior_clean;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_boat_interior_clean, 'boat_up_to_20', 'Up to 20''', 275.00, 1),
    (svc_boat_interior_clean, 'boat_21_26', '21-26''', 375.00, 2),
    (svc_boat_interior_clean, 'boat_27_32', '27-32''', 475.00, 3);

  -- Service 28: Boat Exterior Wash
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, is_active, display_order
  ) VALUES (
    'Boat Exterior Wash',
    'boat-exterior-wash',
    'Hull washing and waxing, deck deep cleaning, brightwork polishing, vinyl protection.',
    cat_specialty_vehicles,
    'specialty',
    'primary',
    360,
    false,
    true,
    false,
    '["boat"]'::jsonb,
    true,
    5
  ) RETURNING id INTO svc_boat_exterior_wash;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_boat_exterior_wash, 'boat_up_to_20', 'Up to 20''', 550.00, 1),
    (svc_boat_exterior_wash, 'boat_21_26', '21-26''', 750.00, 2),
    (svc_boat_exterior_wash, 'boat_27_32', '27-32''', 950.00, 3);

  -- Service 29: Aircraft Interior Clean
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, special_requirements, is_active, display_order
  ) VALUES (
    'Aircraft Interior Clean',
    'aircraft-interior-clean',
    'Comprehensive interior service using only aviation-approved products. Includes brightwork polishing and full interior detailing.',
    cat_specialty_vehicles,
    'specialty',
    'primary',
    420,
    false,
    true,
    false,
    '["aircraft"]'::jsonb,
    'Aviation-approved products only',
    true,
    6
  ) RETURNING id INTO svc_aircraft_interior_clean;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_aircraft_interior_clean, 'aircraft_2_4', '2-4 Seater', 850.00, 1),
    (svc_aircraft_interior_clean, 'aircraft_6_8', '6-8 Seater', 1250.00, 2),
    (svc_aircraft_interior_clean, 'aircraft_turboprop', 'Turboprop/Jet', 2000.00, 3);

  -- Service 30: Aircraft Exterior Wash
  INSERT INTO services (
    name, slug, description, category_id, pricing_model, classification,
    base_duration_minutes, mobile_eligible, online_bookable, is_taxable,
    vehicle_compatibility, special_requirements, is_active, display_order
  ) VALUES (
    'Aircraft Exterior Wash',
    'aircraft-exterior-wash',
    'Fuselage, wings, and belly wash using aviation-approved products. Contamination removal, brightwork polish, aerospace sealant application.',
    cat_specialty_vehicles,
    'specialty',
    'primary',
    270,
    false,
    true,
    false,
    '["aircraft"]'::jsonb,
    'Aviation-approved products only',
    true,
    7
  ) RETURNING id INTO svc_aircraft_exterior_wash;

  INSERT INTO service_pricing (service_id, tier_name, tier_label, price, display_order)
  VALUES
    (svc_aircraft_exterior_wash, 'aircraft_2_4', '2-4 Seater', 575.00, 1),
    (svc_aircraft_exterior_wash, 'aircraft_6_8', '6-8 Seater', 975.00, 2),
    (svc_aircraft_exterior_wash, 'aircraft_turboprop', 'Turboprop/Jet', 1500.00, 3);

  -- =====================================================================
  -- SERVICE PREREQUISITES
  -- =====================================================================

  -- All ceramic coating services require paint correction
  INSERT INTO service_prerequisites (service_id, prerequisite_service_id, enforcement, history_window_days, warning_message)
  VALUES
    (svc_1_year_ceramic_shield, svc_single_stage_polish, 'required_history', 30, 'Paint correction is required before ceramic coating application. Add Single-Stage Polish or 3-Stage Paint Correction to this ticket?'),
    (svc_1_year_ceramic_shield, svc_3_stage_paint_correction, 'required_history', 30, 'Paint correction is required before ceramic coating application. Add Single-Stage Polish or 3-Stage Paint Correction to this ticket?'),
    (svc_3_year_ceramic_shield, svc_single_stage_polish, 'required_history', 30, 'Paint correction is required before ceramic coating application. Add Single-Stage Polish or 3-Stage Paint Correction to this ticket?'),
    (svc_3_year_ceramic_shield, svc_3_stage_paint_correction, 'required_history', 30, 'Paint correction is required before ceramic coating application. Add Single-Stage Polish or 3-Stage Paint Correction to this ticket?'),
    (svc_5_year_ceramic_shield_plus, svc_single_stage_polish, 'required_history', 30, 'Paint correction is required before ceramic coating application. Add Single-Stage Polish or 3-Stage Paint Correction to this ticket?'),
    (svc_5_year_ceramic_shield_plus, svc_3_stage_paint_correction, 'required_history', 30, 'Paint correction is required before ceramic coating application. Add Single-Stage Polish or 3-Stage Paint Correction to this ticket?')
  ON CONFLICT (service_id, prerequisite_service_id) DO NOTHING;

  -- =====================================================================
  -- SERVICE ADDON SUGGESTIONS
  -- =====================================================================

  -- Express Exterior Wash suggestions
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_express_exterior_wash, svc_paint_decontamination, 1, true),
    (svc_express_exterior_wash, svc_headlight_restoration, 2, true),
    (svc_express_exterior_wash, svc_trim_restoration, 3, true),
    (svc_express_exterior_wash, svc_water_spot_removal, 4, true),
    (svc_express_exterior_wash, svc_engine_bay_detail, 5, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- Express Interior Clean suggestions
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_express_interior_clean, svc_hot_shampoo_extraction, 1, true),
    (svc_express_interior_clean, svc_pet_hair_removal, 2, true),
    (svc_express_interior_clean, svc_leather_conditioning, 3, true),
    (svc_express_interior_clean, svc_ozone_odor_treatment, 4, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- Signature Complete Detail suggestions
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_signature_complete_detail, svc_hot_shampoo_extraction, 1, true),
    (svc_signature_complete_detail, svc_paint_decontamination, 2, true),
    (svc_signature_complete_detail, svc_engine_bay_detail, 3, true),
    (svc_signature_complete_detail, svc_headlight_restoration, 4, true),
    (svc_signature_complete_detail, svc_leather_conditioning, 5, true),
    (svc_signature_complete_detail, svc_pet_hair_removal, 6, true),
    (svc_signature_complete_detail, svc_ozone_odor_treatment, 7, true),
    (svc_signature_complete_detail, svc_trim_restoration, 8, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- Single-Stage Polish suggestions
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_single_stage_polish, svc_headlight_restoration, 1, true),
    (svc_single_stage_polish, svc_trim_restoration, 2, true),
    (svc_single_stage_polish, svc_water_spot_removal, 3, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- 3-Stage Paint Correction suggestions (no Paint Decontamination - included)
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_3_stage_paint_correction, svc_headlight_restoration, 1, true),
    (svc_3_stage_paint_correction, svc_trim_restoration, 2, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- All Ceramic Shield suggestions (same for all 3)
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_1_year_ceramic_shield, svc_headlight_restoration, 1, true),
    (svc_1_year_ceramic_shield, svc_trim_restoration, 2, true),
    (svc_1_year_ceramic_shield, svc_engine_bay_detail, 3, true),
    (svc_3_year_ceramic_shield, svc_headlight_restoration, 1, true),
    (svc_3_year_ceramic_shield, svc_trim_restoration, 2, true),
    (svc_3_year_ceramic_shield, svc_engine_bay_detail, 3, true),
    (svc_5_year_ceramic_shield_plus, svc_headlight_restoration, 1, true),
    (svc_5_year_ceramic_shield_plus, svc_trim_restoration, 2, true),
    (svc_5_year_ceramic_shield_plus, svc_engine_bay_detail, 3, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- Booster Detail suggestions
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_booster_detail, svc_headlight_restoration, 1, true),
    (svc_booster_detail, svc_trim_restoration, 2, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- RV Interior Clean suggestions
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_rv_interior_clean, svc_hot_shampoo_extraction, 1, true),
    (svc_rv_interior_clean, svc_pet_hair_removal, 2, true),
    (svc_rv_interior_clean, svc_ozone_odor_treatment, 3, true),
    (svc_rv_interior_clean, svc_leather_conditioning, 4, true),
    (svc_rv_interior_clean, svc_organic_stain_treatment, 5, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  -- RV Exterior Wash suggestions
  INSERT INTO service_addon_suggestions (primary_service_id, addon_service_id, display_order, auto_suggest)
  VALUES
    (svc_rv_exterior_wash, svc_headlight_restoration, 1, true),
    (svc_rv_exterior_wash, svc_trim_restoration, 2, true),
    (svc_rv_exterior_wash, svc_water_spot_removal, 3, true)
  ON CONFLICT (primary_service_id, addon_service_id) DO NOTHING;

  RAISE NOTICE 'Successfully seeded 30 services with pricing, prerequisites, and addon suggestions';
END;
$$;

COMMIT;
