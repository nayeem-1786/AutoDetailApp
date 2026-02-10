-- Seed default Google review request lifecycle rules
-- These can be modified by the user from Admin > Marketing > Automations

-- Google Review Request: After Service Completion (30 min delay)
INSERT INTO lifecycle_rules (name, description, trigger_condition, delay_days, delay_minutes, action, sms_template, is_active, chain_order)
VALUES (
  'Google Review Request — After Service',
  'Sends a Google review request SMS 30 minutes after an appointment is marked completed. Limited to once per customer per 30 days.',
  'after_service',
  0,
  30,
  'sms',
  'Hey {firstName}! Thanks for bringing your {vehicleInfo} to Smart Details! 🚗✨ If you loved your {serviceName}, we''d really appreciate a quick review — it helps us a lot: {googleReviewLink}',
  true,
  1
);

-- Google Review Request: After Product Purchase (30 min delay)
INSERT INTO lifecycle_rules (name, description, trigger_condition, delay_days, delay_minutes, action, sms_template, is_active, chain_order)
VALUES (
  'Google Review Request — After Purchase',
  'Sends a Google review request SMS 30 minutes after a POS transaction completes. Limited to once per customer per 30 days.',
  'after_transaction',
  0,
  30,
  'sms',
  'Hey {firstName}! Thanks for shopping at Smart Details! 🛍️ If you had a great experience, we''d love a quick review: {googleReviewLink}',
  true,
  1
);
