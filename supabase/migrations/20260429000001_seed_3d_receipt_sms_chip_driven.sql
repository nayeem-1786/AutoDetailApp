-- Session 3D — Final hardcoded-slug migration. Closes Path B Phase 2.
-- After this migration, ZERO hardcoded SMS slugs remain in the codebase;
-- the admin "Hardcoded Messages" section becomes empty / hidden.
--
--   receipt_sms — was: hardcoded at src/app/api/pos/receipts/sms/route.ts.
--                 Sent when staff clicks "Send SMS receipt" from POS or
--                 admin receipt dialog. Length-aware: caller computes the
--                 summary_line composite via buildSummaryLine() (truncates
--                 vehicle prefix if the assembled body would exceed 160
--                 chars). receipt_link + summary_line REQUIRED;
--                 business_name auto-injected; first_name + last_name +
--                 vehicle_description optional cheap-adds for operator-
--                 edit parity with sibling transactional slugs.
--
-- Truncation contract — known operator-edit limitation:
--   The default body is sized at the 160-char SMS limit. The summary_line
--   composite's truncation budget assumes the exact default surround prose
--   ("\nThank you! View receipt:\n" + " — " separator inside summary_line,
--   ~30 chars reserved). Operators editing the body to add prose (e.g.,
--   "Hi {first_name}, here is your receipt for {service_name}: ...") may
--   cause the rendered SMS to exceed 160 chars and split into 2 segments.
--   Vehicle prefix in summary_line truncates first when budget exhausts.
--
-- Distinct from `payment_receipt` (separate slug, NOT migrated this
-- session). payment_receipt is the auto-send 30s-post-transaction path at
-- src/app/api/pos/transactions/route.ts:547. Both share notificationType
-- 'receipt_sent' so the existing dedup at transactions/route.ts:456-466
-- continues to suppress auto-send when manual happened first; dedup
-- matches on metadata.notificationType, not slug, so the migration is
-- transparent to that interlock.
--
-- Currency rendering convention: receipt_sms's summary_line is composite-
-- built and embeds the formatted total (e.g., "$329.45") inside its own
-- value; the template body has no separate {total_amount} placeholder, so
-- the Path B currency convention question doesn't apply here.
--
-- Both the public-facing manual send AND the auto-receipt dedup remain
-- transparent post-migration — body shape is byte-identical when no
-- operator edit applied; engine substitution preserves customer-facing
-- text exactly.
--
-- ON CONFLICT (slug) DO NOTHING makes this migration idempotent.

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
  'receipt_sms',
  'POS Receipt — Manual Send',
  'transactional',
  E'{business_name}\n{summary_line}\nThank you! View receipt:\n{receipt_link}',
  E'{business_name}\n{summary_line}\nThank you! View receipt:\n{receipt_link}',
  '["summary_line","receipt_link"]'::jsonb,
  '["first_name","last_name","vehicle_description"]'::jsonb,
  true,
  true,
  'customer'
)
ON CONFLICT (slug) DO NOTHING;
