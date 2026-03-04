-- Seed Email Templates: 8 system templates, 4 drip templates,
-- 8 default assignments, 2 example drip sequences + 5 steps
--
-- All system templates have is_customized = false, so senders
-- continue using hardcoded HTML fallbacks until admin customizes them.

-- ============================================================
-- 1. Seed 8 system email templates + 4 drip email templates
-- ============================================================

-- Use a CTE to get the Standard layout's UUID
WITH std_layout AS (
  SELECT id FROM email_layouts WHERE slug = 'standard' LIMIT 1
),
promo_layout AS (
  SELECT id FROM email_layouts WHERE slug = 'promotional' LIMIT 1
),

-- Insert 12 templates and return their IDs for assignments/drip steps
inserted_templates AS (
  INSERT INTO email_templates (template_key, category, name, subject, preview_text, layout_id, body_blocks, variables, is_system, is_customized)
  VALUES

  -- ── 1. order_ready_pickup ──────────────────────────────────
  (
    'order_ready_pickup',
    'transactional',
    'Order Ready for Pickup',
    'Your Order {order_number} is Ready for Pickup',
    'Your order is ready! Come pick it up.',
    (SELECT id FROM std_layout),
    '[
      {"id":"orp-1","type":"heading","data":{"text":"Your Order is Ready for Pickup!","level":2,"align":"left"}},
      {"id":"orp-2","type":"text","data":{"content":"Hi {first_name},\n\nGreat news! Your order **{order_number}** is ready for pickup at our location.\n\n**Pickup Location:**\n{business_address}","align":"left"}},
      {"id":"orp-3","type":"text","data":{"content":"{items_table}","align":"left"}},
      {"id":"orp-4","type":"text","data":{"content":"If you have any questions, give us a call at {business_phone}.\n\nThank you for your order!","align":"left"}}
    ]'::jsonb,
    '["first_name","order_number","items_table","business_address","business_phone"]'::jsonb,
    true, false
  ),

  -- ── 2. order_shipped ───────────────────────────────────────
  (
    'order_shipped',
    'transactional',
    'Order Shipped',
    'Your Order {order_number} Has Shipped',
    'Your order is on its way!',
    (SELECT id FROM std_layout),
    '[
      {"id":"os-1","type":"heading","data":{"text":"Your Order Has Shipped!","level":2,"align":"left"}},
      {"id":"os-2","type":"text","data":{"content":"Hi {first_name},\n\nYour order **{order_number}** is on its way! You can track your package using the button below.","align":"left"}},
      {"id":"os-3","type":"button","data":{"text":"Track Your Package","url":"{tracking_url}","color":"primary","align":"center"}},
      {"id":"os-4","type":"text","data":{"content":"**Carrier:** {shipping_carrier}\n**Tracking #:** {tracking_number}\n\nIf you have any questions, contact us at {business_phone}.","align":"left"}}
    ]'::jsonb,
    '["first_name","order_number","tracking_url","tracking_number","shipping_carrier","business_phone"]'::jsonb,
    true, false
  ),

  -- ── 3. order_delivered ─────────────────────────────────────
  (
    'order_delivered',
    'transactional',
    'Order Delivered',
    'Your Order {order_number} Has Been Delivered',
    'Your order has been delivered!',
    (SELECT id FROM std_layout),
    '[
      {"id":"od-1","type":"heading","data":{"text":"Your Order Has Been Delivered!","level":2,"align":"left"}},
      {"id":"od-2","type":"text","data":{"content":"Hi {first_name},\n\nYour order **{order_number}** has been delivered. We hope you enjoy your purchase!","align":"left"}},
      {"id":"od-3","type":"text","data":{"content":"If you have any questions or concerns about your order, don''t hesitate to reach out to us at {business_phone} or {business_email}.\n\nThank you for shopping with {business_name}!","align":"left"}}
    ]'::jsonb,
    '["first_name","order_number","business_phone","business_email","business_name"]'::jsonb,
    true, false
  ),

  -- ── 4. order_refund ────────────────────────────────────────
  (
    'order_refund',
    'transactional',
    'Order Refund Processed',
    'Refund Processed — {order_number}',
    'Your refund has been processed.',
    (SELECT id FROM std_layout),
    '[
      {"id":"or-1","type":"heading","data":{"text":"Refund Processed","level":2,"align":"left"}},
      {"id":"or-2","type":"text","data":{"content":"Hi {first_name},\n\nA **{refund_type} refund** of **{refund_amount}** has been processed for your order **{order_number}**.","align":"left"}},
      {"id":"or-3","type":"text","data":{"content":"The refund should appear in your account within **5–10 business days**, depending on your payment provider.\n\nIf you have any questions, please contact us at {business_phone}.\n\nThank you for your patience.","align":"left"}}
    ]'::jsonb,
    '["first_name","refund_type","refund_amount","order_number","business_phone"]'::jsonb,
    true, false
  ),

  -- ── 5. stock_alert ─────────────────────────────────────────
  (
    'stock_alert',
    'notification',
    'Stock Alert',
    'Stock Alert — {total_count} products need attention',
    '{out_of_stock_count} out of stock, {low_stock_count} low stock',
    (SELECT id FROM std_layout),
    '[
      {"id":"sa-1","type":"heading","data":{"text":"Stock Alert","level":2,"align":"left"}},
      {"id":"sa-2","type":"text","data":{"content":"**{out_of_stock_count}** products are out of stock and **{low_stock_count}** are running low on inventory.","align":"left"}},
      {"id":"sa-3","type":"text","data":{"content":"{products_table}","align":"left"}},
      {"id":"sa-4","type":"button","data":{"text":"View Products","url":"{admin_products_url}","color":"primary","align":"center"}},
      {"id":"sa-5","type":"text","data":{"content":"Products are only re-alerted when stock levels change or after 7 days.","align":"left"}}
    ]'::jsonb,
    '["out_of_stock_count","low_stock_count","total_count","products_table","admin_products_url"]'::jsonb,
    true, false
  ),

  -- ── 6. appointment_confirmed ───────────────────────────────
  (
    'appointment_confirmed',
    'transactional',
    'Appointment Confirmed',
    'Appointment Confirmed — {appointment_date} at {appointment_time}',
    'Your appointment is confirmed!',
    (SELECT id FROM std_layout),
    '[
      {"id":"ac-1","type":"heading","data":{"text":"Appointment Confirmed","level":2,"align":"left"}},
      {"id":"ac-2","type":"text","data":{"content":"Hi {first_name}, your appointment is confirmed!","align":"left"}},
      {"id":"ac-3","type":"text","data":{"content":"**Date:** {appointment_date}\n**Time:** {appointment_time}\n**Vehicle:** {vehicle_info}","align":"left"}},
      {"id":"ac-4","type":"text","data":{"content":"{items_table}","align":"left"}},
      {"id":"ac-5","type":"text","data":{"content":"**Total: {appointment_total}**\n\nNeed to reschedule? Call us at {business_phone}.","align":"left"}}
    ]'::jsonb,
    '["first_name","appointment_date","appointment_time","vehicle_info","items_table","appointment_total","business_phone"]'::jsonb,
    true, false
  ),

  -- ── 7. quote_sent ──────────────────────────────────────────
  (
    'quote_sent',
    'transactional',
    'Estimate Sent',
    'Estimate {quote_number} from {business_name}',
    'Your estimate is ready to view.',
    (SELECT id FROM std_layout),
    '[
      {"id":"qs-1","type":"heading","data":{"text":"Estimate {quote_number}","level":2,"align":"left"}},
      {"id":"qs-2","type":"text","data":{"content":"**Date:** {quote_date}\n**Customer:** {customer_name}\n**Vehicle:** {vehicle_info}","align":"left"}},
      {"id":"qs-3","type":"text","data":{"content":"{items_table}","align":"left"}},
      {"id":"qs-4","type":"text","data":{"content":"**Subtotal:** {quote_subtotal}\n**Tax:** {quote_tax}\n**Total: {quote_total}**","align":"left"}},
      {"id":"qs-5","type":"button","data":{"text":"View Your Estimate","url":"{quote_link}","color":"primary","align":"center"}},
      {"id":"qs-6","type":"text","data":{"content":"This estimate is valid for {validity_days} days. Questions? Call us at {business_phone}.","align":"left"}}
    ]'::jsonb,
    '["quote_number","quote_date","customer_name","vehicle_info","items_table","quote_subtotal","quote_tax","quote_total","quote_link","validity_days","business_phone","business_name"]'::jsonb,
    true, false
  ),

  -- ── 8. job_complete ────────────────────────────────────────
  (
    'job_complete',
    'transactional',
    'Job Complete — Vehicle Ready',
    'Your Vehicle is Ready!',
    'Your vehicle is looking great and ready for pickup.',
    (SELECT id FROM std_layout),
    '[
      {"id":"jc-1","type":"heading","data":{"text":"Your Vehicle is Ready!","level":1,"align":"center"}},
      {"id":"jc-2","type":"text","data":{"content":"Hi {first_name}! Great news — your **{vehicle_info}** is looking great and ready for pickup.","align":"left"}},
      {"id":"jc-3","type":"photo_gallery","data":{"mode":"dynamic","service_match":true,"limit":4,"gallery_link":true}},
      {"id":"jc-4","type":"text","data":{"content":"**Services:** {services_list}\n**Total Time:** {timer_display}","align":"left"}},
      {"id":"jc-5","type":"text","data":{"content":"{items_table}","align":"left"}},
      {"id":"jc-6","type":"button","data":{"text":"View All Photos","url":"{gallery_url}","color":"primary","align":"center"}},
      {"id":"jc-7","type":"text","data":{"content":"Thank you for choosing {business_name}! We hope to see you again soon.","align":"left"}}
    ]'::jsonb,
    '["first_name","vehicle_info","services_list","timer_display","items_table","gallery_url","business_name"]'::jsonb,
    true, false
  ),

  -- ── 9. drip_winback_1 (Win-Back Day 0 email) ──────────────
  (
    'drip_winback_1',
    'marketing',
    'Win-Back: We Miss You!',
    'We Miss You, {first_name}!',
    'It''s been a while — your vehicle deserves some love.',
    (SELECT id FROM promo_layout),
    '[
      {"id":"dw1-1","type":"heading","data":{"text":"We Miss You!","level":1,"align":"center"}},
      {"id":"dw1-2","type":"text","data":{"content":"Hi {first_name},\n\nIt''s been {days_since_last_visit} days since your last visit. Your vehicle deserves some love!\n\nWhether it''s a quick wash or a full detail, we''re here to make your ride shine.","align":"left"}},
      {"id":"dw1-3","type":"button","data":{"text":"Book Now","url":"{booking_url}","color":"primary","align":"center"}},
      {"id":"dw1-4","type":"text","data":{"content":"We look forward to seeing you again!\n\n— The {business_name} Team","align":"left"}}
    ]'::jsonb,
    '["first_name","days_since_last_visit","booking_url","business_name"]'::jsonb,
    false, false
  ),

  -- ── 10. drip_winback_3 (Win-Back Day 7 email) ─────────────
  (
    'drip_winback_3',
    'marketing',
    'Win-Back: Last Chance Offer',
    'Last Chance — Special Offer Inside',
    'Don''t miss your exclusive discount!',
    (SELECT id FROM promo_layout),
    '[
      {"id":"dw3-1","type":"heading","data":{"text":"Last Chance!","level":1,"align":"center"}},
      {"id":"dw3-2","type":"text","data":{"content":"Hi {first_name},\n\nWe really want to welcome you back! Here''s a special offer just for you:","align":"left"}},
      {"id":"dw3-3","type":"coupon","data":{"heading":"Welcome Back Discount","code_variable":"coupon_code","description":"Use this code on your next booking","style":"card"}},
      {"id":"dw3-4","type":"button","data":{"text":"Book Now","url":"{booking_url}","color":"primary","align":"center"}},
      {"id":"dw3-5","type":"text","data":{"content":"This offer expires soon — don''t miss out!\n\n— The {business_name} Team","align":"left"}}
    ]'::jsonb,
    '["first_name","coupon_code","booking_url","business_name"]'::jsonb,
    false, false
  ),

  -- ── 11. drip_welcome_1 (Welcome Day 1 email) ──────────────
  (
    'drip_welcome_1',
    'marketing',
    'Welcome: Introduction',
    'Welcome to {business_name}!',
    'Thanks for joining — here''s what we offer.',
    (SELECT id FROM promo_layout),
    '[
      {"id":"wl1-1","type":"heading","data":{"text":"Welcome to {business_name}!","level":1,"align":"center"}},
      {"id":"wl1-2","type":"text","data":{"content":"Hi {first_name},\n\nThank you for choosing us! We''re a mobile auto detailing company that comes to you.\n\nHere''s what we offer:\n- **Express Wash** — Quick exterior clean\n- **Interior Detail** — Deep clean your cabin\n- **Full Detail** — Complete interior + exterior\n- **Ceramic Coating** — Long-lasting paint protection\n- **Paint Correction** — Remove swirls and scratches","align":"left"}},
      {"id":"wl1-3","type":"button","data":{"text":"Book Your First Appointment","url":"{booking_url}","color":"primary","align":"center"}},
      {"id":"wl1-4","type":"text","data":{"content":"Questions? Reply to this email or call us at {business_phone}.\n\n— The {business_name} Team","align":"left"}}
    ]'::jsonb,
    '["first_name","booking_url","business_phone","business_name"]'::jsonb,
    false, false
  ),

  -- ── 12. drip_welcome_2 (Welcome Day 5 email) ──────────────
  (
    'drip_welcome_2',
    'marketing',
    'Welcome: Ready to Book?',
    'Ready to Book, {first_name}?',
    'Schedule your first appointment — we come to you!',
    (SELECT id FROM promo_layout),
    '[
      {"id":"wl2-1","type":"heading","data":{"text":"Ready to Book?","level":1,"align":"center"}},
      {"id":"wl2-2","type":"text","data":{"content":"Hi {first_name},\n\nJust a friendly reminder that we''re here whenever your vehicle needs attention.\n\n**Why choose us?**\n- We come to your home or office\n- Professional-grade products\n- Fully insured & experienced\n- Satisfaction guaranteed","align":"left"}},
      {"id":"wl2-3","type":"button","data":{"text":"Schedule Now","url":"{booking_url}","color":"primary","align":"center"}},
      {"id":"wl2-4","type":"text","data":{"content":"We look forward to making your ride shine!\n\n— The {business_name} Team","align":"left"}}
    ]'::jsonb,
    '["first_name","booking_url","business_name"]'::jsonb,
    false, false
  )

  RETURNING id, template_key
)

-- ============================================================
-- 2. Insert 8 default template assignments
-- ============================================================
, inserted_assignments AS (
  INSERT INTO email_template_assignments (trigger_key, template_id, segment_filter, priority, is_active)
  SELECT
    t.template_key,
    t.id,
    NULL,  -- no segment filter = universal default
    0,     -- lowest priority
    true
  FROM inserted_templates t
  WHERE t.template_key IN (
    'order_ready_pickup',
    'order_shipped',
    'order_delivered',
    'order_refund',
    'stock_alert',
    'appointment_confirmed',
    'quote_sent',
    'job_complete'
  )
  RETURNING id
)

-- ============================================================
-- 3. Insert 2 example drip sequences (inactive)
-- ============================================================
, inserted_sequences AS (
  INSERT INTO drip_sequences (name, description, trigger_condition, trigger_value, stop_conditions, is_active)
  VALUES
  (
    '30-Day Win-Back',
    'Re-engage customers who haven''t visited in 30+ days. Sends a friendly reminder, then an SMS nudge, then a special offer with coupon.',
    'no_visit_days',
    '{"days": 30}'::jsonb,
    '{"on_purchase": true, "on_booking": true, "on_reply": false}'::jsonb,
    false
  ),
  (
    'Welcome Series',
    'Onboard new customers with a welcome email introducing services, followed by a booking reminder.',
    'new_customer',
    '{"days": 1}'::jsonb,
    '{"on_purchase": false, "on_booking": true, "on_reply": false}'::jsonb,
    false
  )
  RETURNING id, name
)

-- ============================================================
-- 4. Insert 5 drip steps
-- ============================================================
INSERT INTO drip_steps (sequence_id, step_order, delay_days, delay_hours, channel, template_id, sms_template, is_active)
VALUES
  -- Win-Back Step 0: Day 0, email, "We miss you"
  (
    (SELECT id FROM inserted_sequences WHERE name = '30-Day Win-Back'),
    0, 0, 0, 'email',
    (SELECT id FROM inserted_templates WHERE template_key = 'drip_winback_1'),
    NULL, true
  ),
  -- Win-Back Step 1: Day 3, SMS only, quick reminder
  (
    (SELECT id FROM inserted_sequences WHERE name = '30-Day Win-Back'),
    1, 3, 0, 'sms',
    NULL,
    'Hi {first_name}, just a quick reminder — your vehicle could use some attention! Book at {booking_url}',
    true
  ),
  -- Win-Back Step 2: Day 7, email, special offer + coupon
  (
    (SELECT id FROM inserted_sequences WHERE name = '30-Day Win-Back'),
    2, 7, 0, 'email',
    (SELECT id FROM inserted_templates WHERE template_key = 'drip_winback_3'),
    NULL, true
  ),
  -- Welcome Step 0: Day 1, email, welcome + services overview
  (
    (SELECT id FROM inserted_sequences WHERE name = 'Welcome Series'),
    0, 1, 0, 'email',
    (SELECT id FROM inserted_templates WHERE template_key = 'drip_welcome_1'),
    NULL, true
  ),
  -- Welcome Step 1: Day 5, email, booking CTA
  (
    (SELECT id FROM inserted_sequences WHERE name = 'Welcome Series'),
    1, 5, 0, 'email',
    (SELECT id FROM inserted_templates WHERE template_key = 'drip_welcome_2'),
    NULL, true
  );
