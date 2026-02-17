-- Update existing order numbers from SD- prefix to WO- prefix
UPDATE orders
SET order_number = 'WO-' || substring(order_number FROM 4)
WHERE order_number LIKE 'SD-%';
