-- Pay-Link Session 3 — seed sms_templates + email_templates rows for the
-- 'payment_link_sent' notification fired by /api/pos/appointments/[id]/send-payment-link.
--
-- No schema changes; rows only. After applying, regenerate the SMS contracts
-- source-of-truth file (sms-contracts.source.ts already updated to match):
--   npx tsx scripts/regen-sms-contracts.ts
--
-- ── SMS template ──────────────────────────────────────────────────────────────
-- Mirrors receipt_sms shape (category='transactional', recipient_type='customer',
-- both body_template and default_body identical, can_silence=true).
--
-- Body is two lines so the engine's REMOVE_LINE sentinel can cleanly strip
-- the greeting line when {first_name} is missing/empty. Single-line bodies
-- with optional chips trigger the empty-render fallback path (engine returns
-- the caller's hardcoded fallback instead of the seeded/operator-edited body),
-- which would silently bypass any admin-UI edits for customers without a
-- first name. Multi-line is the established pattern (see receipt_sms).
--
-- business_name is auto-injected by the engine — never hand-passed by the
-- caller. amount_due and pay_url are new chips registered in
-- src/lib/sms/sms-contracts.source.ts.

INSERT INTO sms_templates (
  slug,
  name,
  category,
  body_template,
  default_body,
  required_variables,
  optional_variables,
  is_active,
  can_silence,
  recipient_type
) VALUES (
  'payment_link_sent',
  'Appointment Payment Link — Manual Send',
  'transactional',
  E'Hi {first_name},\nYour {business_name} payment link for ${amount_due}: {pay_url}',
  E'Hi {first_name},\nYour {business_name} payment link for ${amount_due}: {pay_url}',
  '["amount_due","pay_url"]'::jsonb,
  '["first_name"]'::jsonb,
  true,
  true,
  'customer'
)
ON CONFLICT (slug) DO NOTHING;


-- ── Email template ────────────────────────────────────────────────────────────
-- Block-based template using the standard email_layouts row. Mirrors the
-- structure of quote_sent (heading → text → text → button → text). Seeded with
-- is_system=true AND is_customized=true so sendTemplatedEmail uses the seeded
-- content directly (its short-circuit at send-templated-email.ts:60 only fires
-- on is_system=true && !is_customized, the "needs hardcoded fallback" state).
--
-- ⚠️ Pre-existing footgun (NOT introduced here): clicking "Reset to defaults"
-- in /admin/marketing/email-templates/[id] for ANY system template clears
-- body_blocks to [] and flips is_customized to false, because the re-seed
-- infrastructure noted in src/app/api/admin/email-templates/[id]/reset/route.ts
-- doesn't exist yet. The same risk applies to every seeded system template
-- (appointment_confirmed, quote_sent, order_ready_pickup, etc.) — not specific
-- to this migration.

WITH std_layout AS (
  SELECT id FROM email_layouts WHERE slug = 'standard' LIMIT 1
)
INSERT INTO email_templates (
  template_key,
  category,
  name,
  subject,
  preview_text,
  layout_id,
  body_blocks,
  variables,
  is_system,
  is_customized
)
SELECT
  'payment_link_sent',
  'transactional',
  'Appointment Payment Link',
  'Payment link for your {business_name} appointment',
  'Pay your appointment online — secure link inside.',
  std_layout.id,
  '[
    {"id":"pl-1","type":"heading","data":{"text":"Pay for your appointment","level":2,"align":"left"}},
    {"id":"pl-2","type":"text","data":{"content":"Hi {first_name},\n\nHere''s the secure payment link for your upcoming appointment on **{scheduled_date}** at **{scheduled_time}**.","align":"left"}},
    {"id":"pl-3","type":"button","data":{"text":"Pay ${amount_due}","url":"{pay_url}","color":"primary","align":"center"}},
    {"id":"pl-4","type":"text","data":{"content":"Questions? Call us at {business_phone}.\n\n— {business_name}","align":"left"}}
  ]'::jsonb,
  '["first_name","amount_due","pay_url","scheduled_date","scheduled_time","business_name","business_phone"]'::jsonb,
  true,
  true
FROM std_layout
ON CONFLICT (template_key) DO NOTHING;
