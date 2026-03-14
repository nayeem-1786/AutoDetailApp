-- Update description for pos.manual_discounts permission
UPDATE permission_definitions
SET description = 'Show the Add Discount button in POS tickets and quotes'
WHERE key = 'pos.manual_discounts';
