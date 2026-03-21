-- Booking Reminder template (is_customized = true — works immediately)
INSERT INTO email_templates (
  template_key, category, name, subject, preview_text,
  layout_id, body_blocks, variables, is_system, is_customized, version
) VALUES (
  'booking_reminder',
  'transactional',
  'Booking Reminder',
  'Your appointment is coming up — {service_name} on {appointment_date}',
  'Don''t forget your upcoming appointment',
  (SELECT id FROM email_layouts WHERE is_default = true),
  '[
    {"id":"br-1","type":"heading","data":{"text":"Appointment Reminder","level":2,"align":"center"}},
    {"id":"br-2","type":"text","data":{"content":"Hi {first_name},\n\nThis is a friendly reminder that your **{service_name}** appointment is scheduled for **{appointment_date}** at **{appointment_time}**.\n\nIf you need to reschedule or cancel, please contact us as soon as possible.","align":"left"}},
    {"id":"br-3","type":"button","data":{"text":"View My Appointments","url":"{booking_url}","color":"primary","align":"center"}}
  ]'::jsonb,
  '["first_name","customer_name","service_name","appointment_date","appointment_time","business_name","business_phone","booking_url"]'::jsonb,
  true, true, 1
);

INSERT INTO email_template_assignments (
  trigger_key, template_id, priority, is_active
) VALUES (
  'booking_reminder',
  (SELECT id FROM email_templates WHERE template_key = 'booking_reminder'),
  0, true
);

-- Booking Cancellation template (is_customized = true — works immediately)
INSERT INTO email_templates (
  template_key, category, name, subject, preview_text,
  layout_id, body_blocks, variables, is_system, is_customized, version
) VALUES (
  'booking_cancellation',
  'transactional',
  'Booking Cancellation',
  'Your appointment has been cancelled — {service_name}',
  'Your appointment has been cancelled',
  (SELECT id FROM email_layouts WHERE is_default = true),
  '[
    {"id":"bc-1","type":"heading","data":{"text":"Appointment Cancelled","level":2,"align":"center"}},
    {"id":"bc-2","type":"text","data":{"content":"Hi {first_name},\n\nYour **{service_name}** appointment originally scheduled for **{appointment_date}** at **{appointment_time}** has been cancelled.\n\nIf you''d like to rebook, you can schedule a new appointment anytime.","align":"left"}},
    {"id":"bc-3","type":"button","data":{"text":"Book Again","url":"{booking_url}","color":"primary","align":"center"}}
  ]'::jsonb,
  '["first_name","customer_name","service_name","appointment_date","appointment_time","cancellation_reason","business_name","business_phone","booking_url"]'::jsonb,
  true, true, 1
);

INSERT INTO email_template_assignments (
  trigger_key, template_id, priority, is_active
) VALUES (
  'booking_cancellation',
  (SELECT id FROM email_templates WHERE template_key = 'booking_cancellation'),
  0, true
);

-- Duplicate prevention flag for reminders
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;
