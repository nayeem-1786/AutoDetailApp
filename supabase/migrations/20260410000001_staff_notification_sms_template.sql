-- Seed staff_notification SMS template for voice agent escalations
INSERT INTO sms_templates (slug, name, category, body_template, default_body, variables, is_active, can_silence, recipient_type) VALUES
(
  'staff_notification',
  'Staff: Voice Agent Escalation',
  'system',
  E'\U0001F514 Staff Action Needed\nCustomer: {customer_name}\nPhone: {customer_phone}\nReason: {reason_label}\nDetails: {details}\nReply to customer: {customer_phone}',
  E'\U0001F514 Staff Action Needed\nCustomer: {customer_name}\nPhone: {customer_phone}\nReason: {reason_label}\nDetails: {details}\nReply to customer: {customer_phone}',
  '[{"key":"customer_name","description":"Customer name from the call","required":false},{"key":"customer_phone","description":"Customer phone number, formatted as (XXX) XXX-XXXX","required":false},{"key":"reason_label","description":"Human-readable escalation reason","required":true},{"key":"reason_code","description":"Raw reason code (e.g. custom_quote)","required":false},{"key":"details","description":"Free-text details from the agent","required":true},{"key":"business_name","description":"Business name","required":false}]'::jsonb,
  true,
  true,
  'staff'
);
