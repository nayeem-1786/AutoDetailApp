-- Review Request template (is_customized = true — works immediately)
-- Sent after job completion via lifecycle engine to request a Google/Yelp review
INSERT INTO email_templates (
  template_key, category, name, subject, preview_text,
  layout_id, body_blocks, variables, is_system, is_customized, version
) VALUES (
  'review_request',
  'review',
  'Review Request',
  'How was your {service_name} experience, {first_name}?',
  'We''d love your feedback — it only takes a minute',
  (SELECT id FROM email_layouts WHERE is_default = true),
  '[
    {"id":"rr-1","type":"heading","data":{"text":"Thank You, {first_name}!","level":2,"align":"center"}},
    {"id":"rr-2","type":"text","data":{"content":"We hope you loved your recent **{service_name}** service. Your feedback helps us improve and helps other customers find us.\n\nWould you take a moment to share your experience?","align":"left"}},
    {"id":"rr-3","type":"button","data":{"text":"Leave a Google Review","url":"{google_review_link}","color":"primary","align":"center"}},
    {"id":"rr-4","type":"text","data":{"content":"Thank you for choosing **{business_name}** — we appreciate your support!\n\nIf you have any concerns, please reach out to us directly at {business_phone} so we can make it right.","align":"left"}}
  ]'::jsonb,
  '["first_name","customer_name","service_name","google_review_link","yelp_review_link","business_name","business_phone","business_email","booking_url","loyalty_points","visit_count"]'::jsonb,
  true, true, 1
);

INSERT INTO email_template_assignments (
  trigger_key, template_id, priority, is_active
) VALUES (
  'review_request',
  (SELECT id FROM email_templates WHERE template_key = 'review_request'),
  0, true
);
