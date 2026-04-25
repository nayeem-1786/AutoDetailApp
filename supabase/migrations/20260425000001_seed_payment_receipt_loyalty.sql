-- Session 42AB Phase 1: Formalize unseeded chip templates as git-source-of-truth.
--
-- Both `payment_receipt` and `loyalty_milestone` exist in production `sms_templates`
-- but were authored by the user via direct SQL editor — neither is in any prior
-- migration file. This migration formalizes them so git becomes the source of truth.
-- Safe to apply against existing production state via INSERT...ON CONFLICT (slug)
-- DO UPDATE pattern with CASE-preserve-user-edits clauses on body_template.
--
-- Pre-rewrite production state (captured 2026-04-25 for rollback reference):
--
--   payment_receipt:
--     body_template = E'Thank you {first_name}! Your {vehicle_description} is all '
--                  || E'set. You earned {loyalty_points_earned} loyalty points '
--                  || E'today. View your receipt: {receipt_link}\n\n{business_name}'
--     variables    = ["first_name","receipt_link","business_name"]   (flat string[])
--     ↑ Body has the "Your {vehicle_description} is all set" prose-collision bug
--       (Session 42W root cause). Variables array was trimmed by the user's manual
--       UPDATE in 42X-1-followup to unblock product-only sales after the engine's
--       hard-skip shipped.
--
--   loyalty_milestone:
--     body_template = E'Great news {first_name}! You now have '
--                  || E'{loyalty_points_balance} loyalty points — that''s '
--                  || E'{loyalty_cash_value} off your next visit! Book now: '
--                  || E'{booking_link}\n\n{business_name}'
--     variables    = ["first_name","loyalty_points_balance",
--                     "loyalty_cash_value","booking_link","business_name"]
--     ↑ Body is clean (no prose collision). Migration just formalizes git-as-source.
--
-- Variables column shape is normalized from flat string[] to object[] to match the
-- 16 other seeded templates. The cache loader (src/lib/sms/render-sms-template.ts
-- per Session 42X-1) accepts both shapes at runtime, so this overwrite is zero-risk
-- runtime — purely a consistency normalization.
--
-- Cross-references:
--   docs/audits/SMS_TEMPLATE_ROOT_CAUSE_SESSION42W.md (Phase 6 step 5)
--   docs/audits/SMS_COMPLETE_INVENTORY_SESSION42Z.md (Cluster C)
--   Session 42X-1 (commit b4696619) — engine hard-skip + emptied fallbacks
--   Session 42X-1-followup (commit afc0e2fb) — caller-side 'your vehicle' literal removal

-- =============================================================================
-- payment_receipt
-- =============================================================================
--
-- New body uses caller-built composite chip {transaction_greeting} for all
-- prose that depends on whether services were rendered, vehicle is attached,
-- or loyalty points were earned. Template owns ONLY the structural skeleton.
-- Caller (src/app/api/pos/transactions/route.ts) builds the greeting in Phase 3.

INSERT INTO sms_templates
  (slug, name, category, body_template, default_body, variables,
   is_active, can_silence, recipient_type)
VALUES
(
  'payment_receipt',
  'Payment Receipt (Auto-Send)',
  'transactional',
  E'Thank you {first_name}! {transaction_greeting} View your receipt: {receipt_link}\n\n{business_name}',
  E'Thank you {first_name}! {transaction_greeting} View your receipt: {receipt_link}\n\n{business_name}',
  '[
    {"key":"first_name","description":"Customer first name","required":true},
    {"key":"transaction_greeting","description":"Caller-built context-aware greeting (e.g. ''Your Honda Civic is all set.'' or ''Your service is complete.'' or ''We appreciate your purchase.''). Always non-empty per the chip-by-default contract — caller MUST provide a grammatical sentence even for product-only sales.","required":true},
    {"key":"receipt_link","description":"Short URL to view the digital receipt","required":true},
    {"key":"business_name","description":"Business name from settings (auto-injected if omitted)","required":true}
  ]'::jsonb,
  true,
  false,
  'customer'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  default_body = EXCLUDED.default_body,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  can_silence = EXCLUDED.can_silence,
  recipient_type = EXCLUDED.recipient_type,
  body_template = CASE
    WHEN sms_templates.body_template = E'Thank you {first_name}! Your {vehicle_description} is all set. You earned {loyalty_points_earned} loyalty points today. View your receipt: {receipt_link}\n\n{business_name}'
      THEN EXCLUDED.body_template
    ELSE sms_templates.body_template
  END;

-- =============================================================================
-- loyalty_milestone
-- =============================================================================
--
-- Body unchanged from current production state — no prose-collision risk
-- (no possessive prose around variables). Migration formalizes git-as-source.
-- The CASE clause is documentary: if production matches the seeded body, the
-- overwrite is a no-op-equivalent; if an operator has edited it, the edit is
-- preserved.

INSERT INTO sms_templates
  (slug, name, category, body_template, default_body, variables,
   is_active, can_silence, recipient_type)
VALUES
(
  'loyalty_milestone',
  'Loyalty Milestone Reached',
  'transactional',
  E'Great news {first_name}! You now have {loyalty_points_balance} loyalty points — that''s {loyalty_cash_value} off your next visit! Book now: {booking_link}\n\n{business_name}',
  E'Great news {first_name}! You now have {loyalty_points_balance} loyalty points — that''s {loyalty_cash_value} off your next visit! Book now: {booking_link}\n\n{business_name}',
  '[
    {"key":"first_name","description":"Customer first name","required":true},
    {"key":"loyalty_points_balance","description":"Current loyalty points balance after this transaction","required":true},
    {"key":"loyalty_cash_value","description":"Cash value of the points balance, formatted (e.g. ''$5'')","required":true},
    {"key":"booking_link","description":"Short URL to book the next appointment","required":true},
    {"key":"business_name","description":"Business name from settings (auto-injected if omitted)","required":true}
  ]'::jsonb,
  true,
  true,
  'customer'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  default_body = EXCLUDED.default_body,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  can_silence = EXCLUDED.can_silence,
  recipient_type = EXCLUDED.recipient_type,
  body_template = CASE
    WHEN sms_templates.body_template = E'Great news {first_name}! You now have {loyalty_points_balance} loyalty points — that''s {loyalty_cash_value} off your next visit! Book now: {booking_link}\n\n{business_name}'
      THEN EXCLUDED.body_template
    ELSE sms_templates.body_template
  END;
