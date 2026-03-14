-- Rename pos.override_pricing → pos.discount_override
-- Update label and description for clarity

-- 1. Update permission_definitions
UPDATE permission_definitions
SET key = 'pos.discount_override',
    name = 'Discount Override',
    description = 'Allow manual discounts on items that already have special pricing (sale, combo, or coupon)'
WHERE key = 'pos.override_pricing';

-- 2. Update permissions table (role defaults + any employee overrides)
UPDATE permissions
SET permission_key = 'pos.discount_override'
WHERE permission_key = 'pos.override_pricing';
