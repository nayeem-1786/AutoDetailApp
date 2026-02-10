-- Seed default Google review request lifecycle rules
-- These can be modified by the user from Admin > Marketing > Automations

-- Google Review Request: After Service Completion (30 min delay)
INSERT INTO lifecycle_rules (name, description, trigger_condition, delay_days, delay_minutes, action, sms_template, is_active, chain_order)
VALUES (
  'Google Review Request — After Service',
  'Sends a review request SMS 30 minutes after an appointment is marked completed. Limited to once per customer per 30 days.',
  'after_service',
  0,
  30,
  'sms',
  E'Hi {first_name}, thank you for choosing {business_name}! We just finished {service_name} on your {vehicle_info} and hope you love the results. We''d really appreciate a quick review:\n\n⭐ Google: {google_review_link}\n⭐ Yelp: {yelp_review_link}\n\nThank you for your support!',
  true,
  1
);

-- Google Review Request: After Product Purchase (30 min delay)
INSERT INTO lifecycle_rules (name, description, trigger_condition, delay_days, delay_minutes, action, sms_template, is_active, chain_order)
VALUES (
  'Google Review Request — After Purchase',
  'Sends a review request SMS 30 minutes after a POS transaction completes. Limited to once per customer per 30 days.',
  'after_transaction',
  0,
  30,
  'sms',
  E'Hi {first_name}, thank you for your purchase at {business_name}! We''d really appreciate a quick review:\n\n⭐ Google: {google_review_link}\n⭐ Yelp: {yelp_review_link}\n\nThank you for your support!',
  true,
  1
);
