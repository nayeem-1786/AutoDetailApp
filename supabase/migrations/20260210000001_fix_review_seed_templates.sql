-- Fix review request seed templates: use snake_case variables, include both Google + Yelp links,
-- use {business_name} instead of hardcoded name.
-- Also standardize trigger_condition to 'service_completed' (canonical value).

UPDATE lifecycle_rules
SET
  trigger_condition = 'service_completed',
  sms_template = E'Hi {first_name}, thank you for choosing {business_name}! We just finished {service_name} on your {vehicle_info} and hope you love the results. We''d really appreciate a quick review:\n\n⭐ Google: {google_review_link}\n⭐ Yelp: {yelp_review_link}\n\nThank you for your support!'
WHERE name = 'Google Review Request — After Service';

UPDATE lifecycle_rules
SET
  sms_template = E'Hi {first_name}, thank you for your purchase at {business_name}! We''d really appreciate a quick review:\n\n⭐ Google: {google_review_link}\n⭐ Yelp: {yelp_review_link}\n\nThank you for your support!'
WHERE name = 'Google Review Request — After Purchase';

-- Standardize any remaining rows with legacy 'after_service' value
UPDATE lifecycle_rules
SET trigger_condition = 'service_completed'
WHERE trigger_condition = 'after_service';

ALTER TABLE lifecycle_rules
ALTER COLUMN trigger_condition SET DEFAULT 'service_completed';
