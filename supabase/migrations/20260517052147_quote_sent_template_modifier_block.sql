-- Item 15g Layer 15g-v — extend the seeded `quote_sent` email template body
-- to render the coupon / loyalty / manual-discount modifier breakdown above
-- the Total line. Source: docs/dev/QUOTE_TOTAL_AND_RECEIPT_AUDIT_2026-05-16.md
--
-- Mechanism: a single composite `{quote_modifier_block}` variable holds the
-- conditional markdown rows (built in `src/lib/quotes/send-service.ts` from
-- the persisted `coupon_discount` / `loyalty_*` / `manual_discount_*`
-- columns). The composite is empty when no modifier applies — the rendered
-- template then reads identically to the pre-15g-v shape for unmodified
-- quotes.
--
-- Six individual modifier variables are also exposed on the template so an
-- operator who has customized the body can reference them by name in the
-- admin editor: `quote_coupon_code`, `quote_coupon_discount`,
-- `quote_loyalty_pts`, `quote_loyalty_discount`, `quote_manual_label`,
-- `quote_manual_discount`. Default-template wiring uses only the composite.
--
-- Guard: `is_customized = false` ensures operator-customized templates are
-- not clobbered. They will still receive the new variables (passed at send
-- time) but their body markup is preserved.

UPDATE email_templates
SET
  body_blocks = '[
    {"id":"qs-1","type":"heading","data":{"text":"Estimate {quote_number}","level":2,"align":"left"}},
    {"id":"qs-2","type":"text","data":{"content":"**Date:** {quote_date}\n**Customer:** {customer_name}\n**Vehicle:** {vehicle_info}","align":"left"}},
    {"id":"qs-3","type":"text","data":{"content":"{items_table}","align":"left"}},
    {"id":"qs-4","type":"text","data":{"content":"**Subtotal:** {quote_subtotal}\n**Tax:** {quote_tax}\n{quote_modifier_block}**Total: {quote_total}**","align":"left"}},
    {"id":"qs-5","type":"button","data":{"text":"View Your Estimate","url":"{quote_link}","color":"primary","align":"center"}},
    {"id":"qs-6","type":"text","data":{"content":"This estimate is valid for {validity_days} days. Questions? Call us at {business_phone}.","align":"left"}}
  ]'::jsonb,
  variables = '["quote_number","quote_date","customer_name","vehicle_info","items_table","quote_subtotal","quote_tax","quote_modifier_block","quote_coupon_code","quote_coupon_discount","quote_loyalty_pts","quote_loyalty_discount","quote_manual_label","quote_manual_discount","quote_total","quote_link","validity_days","business_phone","business_name"]'::jsonb
WHERE
  template_key = 'quote_sent'
  AND is_customized = false;
