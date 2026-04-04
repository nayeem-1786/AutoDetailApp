-- Migration: product_specs_and_variant_grouping
-- Adds specs JSONB, product_group_id UUID, and variant_label TEXT to products table.
-- Auto-groups 44 variant groups by vendor + name pattern matching.

-- ============================================================
-- Part 1: Schema changes
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_group_id UUID DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_label TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_products_group_id ON products (product_group_id) WHERE product_group_id IS NOT NULL;

-- ============================================================
-- Part 2: Auto-group variant products
-- ============================================================

DO $$
DECLARE
  v_group_id UUID;
  v_count INT;
  v_updated INT;
  v_vendor_id UUID;
  v_group_key TEXT;
  v_rec RECORD;
BEGIN

  -- Helper: create a temporary function for grouping
  -- We'll use a procedural approach with a custom type for variant tuples

  -- -----------------------------------------------------------
  -- Internal helper to process one variant group
  -- Args: vendor name, group display name, array of
  --       (pattern, exclude_pattern_or_null, label) tuples
  -- -----------------------------------------------------------
  -- Since we can't define functions inside DO blocks, we'll use
  -- inline logic with a loop over a temporary table approach.

  -- Create temp table to hold variant definitions
  CREATE TEMP TABLE IF NOT EXISTS _variant_groups (
    group_key TEXT,
    vendor_name TEXT,
    name_pattern TEXT,
    exclude_pattern TEXT,
    variant_label TEXT
  ) ON COMMIT DROP;

  -- Truncate in case of re-run within same transaction
  TRUNCATE _variant_groups;

  -- ============================================================
  -- VOLUME SIZE VARIANTS (21 groups)
  -- ============================================================

  -- Detailer Stop: Supreme Suds Wax Shampoo
  INSERT INTO _variant_groups VALUES
    ('DS Supreme Suds', 'Detailer Stop', '%supreme suds%16oz%', NULL, '16 oz'),
    ('DS Supreme Suds', 'Detailer Stop', '%supreme suds%1 gal%', NULL, '1 Gallon'),
    ('DS Supreme Suds', 'Detailer Stop', '%supreme suds%5 gal%', NULL, '5 Gallon');

  -- Detailer Stop: Blue X Armor
  INSERT INTO _variant_groups VALUES
    ('DS Blue X Armor', 'Detailer Stop', '%blue x armor%16oz%', NULL, '16 oz'),
    ('DS Blue X Armor', 'Detailer Stop', '%blue x armor%1 gal%', NULL, '1 Gallon'),
    ('DS Blue X Armor', 'Detailer Stop', '%blue x armor%5 gal%', NULL, '5 Gallon');

  -- Detailer Stop: Hyper Gloss
  INSERT INTO _variant_groups VALUES
    ('DS Hyper Gloss', 'Detailer Stop', '%hyper gloss%16oz%', NULL, '16 oz'),
    ('DS Hyper Gloss', 'Detailer Stop', '%hyper gloss%1 gal%', NULL, '1 Gallon'),
    ('DS Hyper Gloss', 'Detailer Stop', '%hyper gloss%5 gal%', NULL, '5 Gallon');

  -- Detailer Stop: Wheel Acid
  INSERT INTO _variant_groups VALUES
    ('DS Wheel Acid', 'Detailer Stop', '%wheel acid%16oz%', NULL, '16 oz'),
    ('DS Wheel Acid', 'Detailer Stop', '%wheel acid%1 gal%', NULL, '1 Gallon'),
    ('DS Wheel Acid', 'Detailer Stop', '%wheel acid%5 gal%', NULL, '5 Gallon');

  -- Detailer Stop: Water Tank
  INSERT INTO _variant_groups VALUES
    ('DS Water Tank', 'Detailer Stop', '%water tank%50%', NULL, '50 Gallon'),
    ('DS Water Tank', 'Detailer Stop', '%water tank%75%', NULL, '75 Gallon'),
    ('DS Water Tank', 'Detailer Stop', '%water tank%100%', NULL, '100 Gallon');

  -- Detailer Stop: PV&L
  INSERT INTO _variant_groups VALUES
    ('DS PV&L', 'Detailer Stop', '%pv%l%16oz%', NULL, '16 oz'),
    ('DS PV&L', 'Detailer Stop', '%pv%l%1 gal%', NULL, '1 Gallon'),
    ('DS PV&L', 'Detailer Stop', '%5 gal%pv%l%', NULL, '5 Gallon');

  -- Detailer Stop: All Shine Dressing
  INSERT INTO _variant_groups VALUES
    ('DS All Shine', 'Detailer Stop', '%all shine%1 gal%', NULL, '1 Gallon'),
    ('DS All Shine', 'Detailer Stop', '%all shine%5 gal%', NULL, '5 Gallon');

  -- Detailer Stop: Total Heavy Duty Degreaser
  INSERT INTO _variant_groups VALUES
    ('DS Total HD Degreaser', 'Detailer Stop', '%total heavy duty%1 gal%', NULL, '1 Gallon'),
    ('DS Total HD Degreaser', 'Detailer Stop', '%total heavy duty%5 gal%', NULL, '5 Gallon');

  -- P & S: Brake Buster
  INSERT INTO _variant_groups VALUES
    ('PS Brake Buster', 'P & S', '%brake buster%16oz%', NULL, '16 oz'),
    ('PS Brake Buster', 'P & S', '%brake buster%gal%', NULL, '1 Gallon');

  -- P & S: Carpet Bomber
  INSERT INTO _variant_groups VALUES
    ('PS Carpet Bomber', 'P & S', '%carpet bomber%16oz%', NULL, '16 oz'),
    ('PS Carpet Bomber', 'P & S', '%carpet bomber%gal%', NULL, '1 Gallon');

  -- P & S: Bead Maker
  INSERT INTO _variant_groups VALUES
    ('PS Bead Maker', 'P & S', '%bead maker%16oz%', NULL, '16 oz'),
    ('PS Bead Maker', 'P & S', '%bead maker%gal%', NULL, '1 Gallon');

  -- P & S: Dream Maker
  INSERT INTO _variant_groups VALUES
    ('PS Dream Maker', 'P & S', '%dream maker%16oz%', NULL, '16 oz'),
    ('PS Dream Maker', 'P & S', '%dream maker%gal%', NULL, '1 Gallon');

  -- P & S: Finisher Peroxide (SPECIAL — 16oz has no size in name)
  INSERT INTO _variant_groups VALUES
    ('PS Finisher Peroxide', 'P & S', '%finisher peroxide treatment%', '%gal%', '16 oz'),
    ('PS Finisher Peroxide', 'P & S', '%finisher peroxide%gal%', NULL, '1 Gallon');

  -- P & S: Insect Remover
  INSERT INTO _variant_groups VALUES
    ('PS Insect Remover', 'P & S', '%insect remover%16oz%', NULL, '16 oz'),
    ('PS Insect Remover', 'P & S', '%insect remover%gal%', NULL, '1 Gallon');

  -- P & S: Iron Buster
  INSERT INTO _variant_groups VALUES
    ('PS Iron Buster', 'P & S', '%iron buster%16oz%', NULL, '16 oz'),
    ('PS Iron Buster', 'P & S', '%iron buster%gal%', NULL, '1 Gallon');

  -- P & S: Paint Surface Prep
  INSERT INTO _variant_groups VALUES
    ('PS Paint Surface Prep', 'P & S', '%paint surface prep%16oz%', NULL, '16 oz'),
    ('PS Paint Surface Prep', 'P & S', '%paint surface prep%gal%', NULL, '1 Gallon');

  -- P & S: Premium Detergent
  INSERT INTO _variant_groups VALUES
    ('PS Premium Detergent', 'P & S', '%premium detergent%liter%', NULL, '1 Liter'),
    ('PS Premium Detergent', 'P & S', '%premium detergent%gal%', NULL, '1 Gallon');

  -- P & S: Swift Clean & Shine
  INSERT INTO _variant_groups VALUES
    ('PS Swift Clean', 'P & S', '%swift clean%16oz%', NULL, '16 oz'),
    ('PS Swift Clean', 'P & S', '%swift clean%gal%', NULL, '1 Gallon');

  -- P & S: Wash & Wax
  INSERT INTO _variant_groups VALUES
    ('PS Wash & Wax', 'P & S', '%wash%wax%16oz%', NULL, '16 oz'),
    ('PS Wash & Wax', 'P & S', '%wash%wax%gal%', NULL, '1 Gallon');

  -- Sonax: Profiline Cutmax
  INSERT INTO _variant_groups VALUES
    ('Sonax Cutmax', 'Sonax', '%cutmax%250%', NULL, '250ml'),
    ('Sonax Cutmax', 'Sonax', '%cutmax%1000%', NULL, '1000ml');

  -- Sonax: Profiline Perfect Finish
  INSERT INTO _variant_groups VALUES
    ('Sonax Perfect Finish', 'Sonax', '%perfect finish%250%', NULL, '250ml'),
    ('Sonax Perfect Finish', 'Sonax', '%perfect finish%1000%', NULL, '1000ml');

  -- ============================================================
  -- PAD DIAMETER VARIANTS (10 groups)
  -- ============================================================

  -- Buff & Shine: Wool Pad
  INSERT INTO _variant_groups VALUES
    ('BS Wool Pad', 'Buff & Shine', '%3%wool pad%', NULL, '3 inch'),
    ('BS Wool Pad', 'Buff & Shine', '%5%wool pad%', NULL, '5 inch'),
    ('BS Wool Pad', 'Buff & Shine', '%wool pad%6%', NULL, '6 inch');

  -- Buff & Shine: Foam HCutting Pad
  INSERT INTO _variant_groups VALUES
    ('BS HCutting', 'Buff & Shine', '%3%hcutting%', NULL, '3 inch / 2pk'),
    ('BS HCutting', 'Buff & Shine', '%5%hcutting%', NULL, '5 inch'),
    ('BS HCutting', 'Buff & Shine', '%hcutting%6%', NULL, '6 inch');

  -- Buff & Shine: Foam Maroon C/P Pad
  INSERT INTO _variant_groups VALUES
    ('BS Maroon', 'Buff & Shine', '%3%maroon%', NULL, '3 inch / 2pk'),
    ('BS Maroon', 'Buff & Shine', '%5%maroon%', NULL, '5 inch'),
    ('BS Maroon', 'Buff & Shine', '%maroon%6%', NULL, '6 inch');

  -- Buff & Shine: Microfiber Pad
  INSERT INTO _variant_groups VALUES
    ('BS Microfiber Pad', 'Buff & Shine', '%3%microfiber pad%', NULL, '3 inch'),
    ('BS Microfiber Pad', 'Buff & Shine', '%5%microfiber pad%', NULL, '5 inch'),
    ('BS Microfiber Pad', 'Buff & Shine', '%microfiber pad%6%', NULL, '6 inch');

  -- Buff & Shine: Wool Blend Pad
  INSERT INTO _variant_groups VALUES
    ('BS Wool Blend', 'Buff & Shine', '%3%wool blend%', NULL, '3 inch / 2pk'),
    ('BS Wool Blend', 'Buff & Shine', '%5%wool blend%', NULL, '5 inch'),
    ('BS Wool Blend', 'Buff & Shine', '%wool blend%6%', NULL, '6 inch');

  -- Buff & Shine: Blue HD Polishing
  INSERT INTO _variant_groups VALUES
    ('BS Blue HD', 'Buff & Shine', '%3%blue hd%', NULL, '3 inch / 2pk'),
    ('BS Blue HD', 'Buff & Shine', '%5%blue hd%', NULL, '5 inch'),
    ('BS Blue HD', 'Buff & Shine', '%blue hd%6%', NULL, '6 inch');

  -- Buff & Shine: Yellow P/F Pad
  INSERT INTO _variant_groups VALUES
    ('BS Yellow PF', 'Buff & Shine', '%3%yellow%p/f%', NULL, '3 inch / 2pk'),
    ('BS Yellow PF', 'Buff & Shine', '%5%yellow%p/f%', NULL, '5 inch');

  -- Buff & Shine: Complete Buffing Kit
  INSERT INTO _variant_groups VALUES
    ('BS Buffing Kit', 'Buff & Shine', '%buffing kit%5%', NULL, '5 inch'),
    ('BS Buffing Kit', 'Buff & Shine', '%buffing kit%6%', NULL, '6 inch');

  -- MaxShine: DA Backing Pad
  INSERT INTO _variant_groups VALUES
    ('MS DA Backing', 'MaxShine', '%backing pad%5%', NULL, '5 inch'),
    ('MS DA Backing', 'MaxShine', '%backing pad%6%', NULL, '6 inch');

  -- MaxShine: Nano Clay Pad
  INSERT INTO _variant_groups VALUES
    ('MS Nano Clay', 'MaxShine', '%nano clay%5%', NULL, '5 inch'),
    ('MS Nano Clay', 'MaxShine', '%nano clay%6%', NULL, '6 inch');

  -- ============================================================
  -- PACK QUANTITY VARIANTS (7 groups)
  -- ============================================================

  -- Autofiber: Edgeless Black Shop Rag
  INSERT INTO _variant_groups VALUES
    ('AF Black Shop Rag', 'Autofiber', '%black shop rag%', '%10%', 'Single'),
    ('AF Black Shop Rag', 'Autofiber', '%black shop rag%10%', NULL, '10-Pack');

  -- Autofiber: Edgeless Blue Shop Rag
  INSERT INTO _variant_groups VALUES
    ('AF Blue Shop Rag', 'Autofiber', '%blue shop rag%', '%10%', 'Single'),
    ('AF Blue Shop Rag', 'Autofiber', '%blue shop rag%10%', NULL, '10-Pack');

  -- Autofiber: Premium Microfiber Green
  INSERT INTO _variant_groups VALUES
    ('AF Premium Green', 'Autofiber', '%premium%green%', '%10%', 'Single'),
    ('AF Premium Green', 'Autofiber', '%premium%green%10%', NULL, '10-Pack');

  -- Autofiber: Premium Microfiber Gold
  INSERT INTO _variant_groups VALUES
    ('AF Premium Gold', 'Autofiber', '%premium%gold%', '%10%', 'Single'),
    ('AF Premium Gold', 'Autofiber', '%premium%gold%10%', NULL, '10-Pack');

  -- Autofiber: All Purpose Microfiber Towel
  INSERT INTO _variant_groups VALUES
    ('AF All Purpose', 'Autofiber', '%all purpose%blue%', NULL, 'Blue 10-Pack'),
    ('AF All Purpose', 'Autofiber', '%all purpose%yellow%', NULL, 'Yellow 10-Pack');

  -- Autofiber: Ultra Plush 470
  INSERT INTO _variant_groups VALUES
    ('AF Ultra Plush 470', 'Autofiber', '%ultra plush%470%', '%10%', 'Single'),
    ('AF Ultra Plush 470', 'Autofiber', '%ultra plush%470%10%', NULL, '10-Pack');

  -- Golden State Trading: Microfiber Waffle
  INSERT INTO _variant_groups VALUES
    ('GST Waffle', 'Golden State Trading, Inc', '%waffle%', '%12%', 'Single'),
    ('GST Waffle', 'Golden State Trading, Inc', '%waffle%12%', NULL, '12-Pack');

  -- ============================================================
  -- COLOR VARIANTS (5 groups)
  -- ============================================================

  -- MaxShine: Bucket
  INSERT INTO _variant_groups VALUES
    ('MS Bucket', 'MaxShine', '%bucket%black%', NULL, 'Black'),
    ('MS Bucket', 'MaxShine', '%bucket%blue%', NULL, 'Blue'),
    ('MS Bucket', 'MaxShine', '%bucket%green%', NULL, 'Green'),
    ('MS Bucket', 'MaxShine', '%bucket%red%', NULL, 'Red');

  -- MaxShine: Spray Bottle
  INSERT INTO _variant_groups VALUES
    ('MS Spray Bottle', 'MaxShine', '%spray bottle%black%', NULL, 'Black'),
    ('MS Spray Bottle', 'MaxShine', '%spray bottle%red%', NULL, 'Red'),
    ('MS Spray Bottle', 'MaxShine', '%spray bottle%yellow%', NULL, 'Yellow');

  -- Autofiber: Amphibian XL Drying Towel
  INSERT INTO _variant_groups VALUES
    ('AF Amphibian', 'Autofiber', '%amphibian%blue%', NULL, 'Blue'),
    ('AF Amphibian', 'Autofiber', '%amphibian%green%', NULL, 'Green');

  -- Alloygator: Wheel Protection
  INSERT INTO _variant_groups VALUES
    ('AG Wheel Protection', 'Alloygator', '%alloygator%black%', NULL, 'Black'),
    ('AG Wheel Protection', 'Alloygator', '%alloygator%red%', NULL, 'Red');

  -- Detailer Stop: Assorted Brushes
  INSERT INTO _variant_groups VALUES
    ('DS Assorted Brushes', 'Detailer Stop', '%assorted brush%blue%', NULL, 'Blue'),
    ('DS Assorted Brushes', 'Detailer Stop', '%assorted brush%green%', NULL, 'Green');

  -- ============================================================
  -- APPAREL SIZE (1 group)
  -- ============================================================

  -- SD Auto Spa: Gloves
  INSERT INTO _variant_groups VALUES
    ('SD Gloves', 'SD Auto Spa', '%gloves%small%', NULL, 'Small'),
    ('SD Gloves', 'SD Auto Spa', '%gloves%medium%', NULL, 'Medium'),
    ('SD Gloves', 'SD Auto Spa', '%gloves%/ large%', NULL, 'Large'),
    ('SD Gloves', 'SD Auto Spa', '%gloves%xlarge%', NULL, 'X-Large');

  -- ============================================================
  -- Process all groups
  -- ============================================================

  FOR v_group_key IN SELECT DISTINCT group_key FROM _variant_groups ORDER BY group_key
    LOOP
      -- Generate one UUID for this group
      v_group_id := gen_random_uuid();
      v_count := 0;

      -- Process each variant in this group
      FOR v_rec IN SELECT * FROM _variant_groups WHERE group_key = v_group_key
      LOOP
        -- Look up vendor_id
        SELECT id INTO v_vendor_id FROM vendors WHERE name = v_rec.vendor_name LIMIT 1;

        IF v_vendor_id IS NULL THEN
          RAISE WARNING 'Vendor not found: % (group: %)', v_rec.vendor_name, v_group_key;
          CONTINUE;
        END IF;

        -- Update matching products
        IF v_rec.exclude_pattern IS NOT NULL THEN
          UPDATE products
          SET product_group_id = v_group_id,
              variant_label = v_rec.variant_label
          WHERE is_active = true
            AND vendor_id = v_vendor_id
            AND name ILIKE v_rec.name_pattern
            AND NOT name ILIKE v_rec.exclude_pattern;
        ELSE
          UPDATE products
          SET product_group_id = v_group_id,
              variant_label = v_rec.variant_label
          WHERE is_active = true
            AND vendor_id = v_vendor_id
            AND name ILIKE v_rec.name_pattern;
        END IF;

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        v_count := v_count + v_updated;
      END LOOP;

      -- Log results
      RAISE NOTICE 'Group "%" — % products grouped', v_group_key, v_count;
      IF v_count < 2 THEN
        RAISE WARNING 'Group "%" has fewer than 2 products (found %). Check patterns.', v_group_key, v_count;
      END IF;
  END LOOP;

END
$$;
