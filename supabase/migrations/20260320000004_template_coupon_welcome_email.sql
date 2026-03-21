-- Part 1: Add coupon_id to email_templates
ALTER TABLE email_templates ADD COLUMN coupon_id UUID DEFAULT NULL REFERENCES coupons(id) ON DELETE SET NULL;

COMMENT ON COLUMN email_templates.coupon_id IS 'Optional default coupon — resolves {coupon_code} when template is sent without a trigger-level coupon';

-- Part 3: Seed welcome email template (is_customized = true — works immediately)
INSERT INTO email_templates (
  template_key, category, name, subject, preview_text,
  layout_id, body_blocks, variables, is_system, is_customized, version
) VALUES (
  'welcome_email',
  'transactional',
  'Welcome Email',
  'Welcome to {business_name}!',
  'Welcome aboard — we''re glad to have you',
  (SELECT id FROM email_layouts WHERE is_default = true),
  '[
    {"id":"we-1","type":"heading","data":{"text":"Welcome to {business_name}!","level":2,"align":"center"}},
    {"id":"we-2","type":"text","data":{"content":"Hi {first_name},\n\nThanks for joining us! We''re excited to have you as a customer.\n\nAs a welcome gift, use the code below on your next visit.","align":"left"}},
    {"id":"we-3","type":"coupon","data":{"heading":"Your Welcome Offer","code_variable":"coupon_code","description":"Use this code on your next visit","style":"card"}},
    {"id":"we-4","type":"button","data":{"text":"Book Now","url":"{business_website}/book","color":"primary","align":"center"}},
    {"id":"we-5","type":"text","data":{"content":"We look forward to seeing you soon!\n\n— The {business_name} Team","align":"left"}}
  ]'::jsonb,
  '["first_name","customer_name","business_name","business_phone","business_website","coupon_code"]'::jsonb,
  true, true, 1
);

INSERT INTO email_template_assignments (
  trigger_key, template_id, priority, is_active
) VALUES (
  'welcome_email',
  (SELECT id FROM email_templates WHERE template_key = 'welcome_email'),
  0, true
);
