-- Add issue_type and issue_description columns to job_addons
-- These describe what the detailer FOUND (the problem), separate from the recommended service (the solution)

ALTER TABLE job_addons
  ADD COLUMN IF NOT EXISTS issue_type TEXT,
  ADD COLUMN IF NOT EXISTS issue_description TEXT;

-- Add check constraint for predefined issue types
ALTER TABLE job_addons
  ADD CONSTRAINT job_addons_issue_type_check
  CHECK (issue_type IS NULL OR issue_type IN (
    'scratches',
    'water_spots',
    'paint_damage',
    'pet_hair_stains',
    'interior_stains',
    'odor',
    'headlight_haze',
    'wheel_damage',
    'tar_sap_overspray',
    'other'
  ));
