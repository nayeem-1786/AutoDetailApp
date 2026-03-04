-- Email Template System: tables, seeds, and schema changes
-- Creates: email_layouts, email_templates, email_template_assignments,
--          drip_sequences, drip_steps, drip_enrollments, drip_send_log
-- Alters:  lifecycle_rules, campaigns

-- ============================================================
-- 1. email_layouts — structural HTML frames for emails
-- ============================================================
CREATE TABLE email_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  structure_html TEXT NOT NULL,
  color_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  header_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  footer_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_layouts_slug ON email_layouts(slug);

-- ============================================================
-- 2. email_templates — block-based email content
-- ============================================================
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('transactional', 'review', 'marketing', 'notification')),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT NOT NULL DEFAULT '',
  layout_id UUID NOT NULL REFERENCES email_layouts(id) ON DELETE RESTRICT,
  body_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_html TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  segment_tag TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_customized BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_email_templates_key ON email_templates(template_key);
CREATE INDEX idx_email_templates_category ON email_templates(category);

-- ============================================================
-- 3. email_template_assignments — segment routing
-- ============================================================
CREATE TABLE email_template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  segment_filter JSONB,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_template_assignments_trigger ON email_template_assignments(trigger_key);
CREATE INDEX idx_email_template_assignments_active ON email_template_assignments(is_active);

-- ============================================================
-- 4. drip_sequences — multi-step automated sequences
-- ============================================================
CREATE TABLE drip_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_condition TEXT NOT NULL CHECK (trigger_condition IN ('no_visit_days', 'after_service', 'new_customer', 'manual_enroll', 'tag_added')),
  trigger_value JSONB,
  stop_conditions JSONB NOT NULL DEFAULT '{"on_purchase": true, "on_booking": true, "on_reply": false}'::jsonb,
  nurture_sequence_id UUID REFERENCES drip_sequences(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  audience_filters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_drip_sequences_active ON drip_sequences(is_active);

-- ============================================================
-- 5. drip_steps — individual steps within a sequence
-- ============================================================
CREATE TABLE drip_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  sms_template TEXT,
  coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  subject_override TEXT,
  exit_condition TEXT,
  exit_action TEXT CHECK (exit_action IN ('stop', 'move', 'tag')),
  exit_sequence_id UUID REFERENCES drip_sequences(id) ON DELETE SET NULL,
  exit_tag TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drip_steps_sequence ON drip_steps(sequence_id, step_order);

-- ============================================================
-- 6. drip_enrollments — customer enrollment in sequences
-- ============================================================
CREATE TABLE drip_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_send_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'stopped', 'paused')),
  stopped_reason TEXT,
  stopped_at TIMESTAMPTZ,
  nurture_transferred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, customer_id)
);

CREATE INDEX idx_drip_enrollments_active ON drip_enrollments(status, next_send_at);
CREATE INDEX idx_drip_enrollments_customer ON drip_enrollments(customer_id);

-- ============================================================
-- 7. drip_send_log — delivery log per step execution
-- ============================================================
CREATE TABLE drip_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES drip_enrollments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES drip_steps(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  mailgun_message_id TEXT,
  coupon_code TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT
);

CREATE INDEX idx_drip_send_log_enrollment ON drip_send_log(enrollment_id);

-- ============================================================
-- 8. ALTER existing tables
-- ============================================================

-- lifecycle_rules: add email_template_id reference
ALTER TABLE lifecycle_rules
  ADD COLUMN email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL;

-- lifecycle_rules: add delay_minutes if not exists (may already exist)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lifecycle_rules' AND column_name = 'delay_minutes'
  ) THEN
    ALTER TABLE lifecycle_rules ADD COLUMN delay_minutes INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- campaigns: add email template system columns
ALTER TABLE campaigns
  ADD COLUMN email_body_blocks JSONB,
  ADD COLUMN email_layout_id UUID REFERENCES email_layouts(id) ON DELETE SET NULL,
  ADD COLUMN email_preview_text TEXT;

-- ============================================================
-- 9. Seed 3 layout rows
-- ============================================================
INSERT INTO email_layouts (name, slug, description, structure_html, color_overrides, header_config, footer_config, is_default) VALUES

-- Standard layout
('Standard', 'standard', 'Professional layout with centered logo header, white content area, and full footer with social links. Best for transactional emails, review requests, and general communications.',
$$<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{BUSINESS_NAME}}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:{{BG_COLOR}};font-family:{{FONT_FAMILY}};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{{BG_COLOR}};">
<tr><td align="center" style="padding:24px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
    <!-- Header -->
    <tr><td align="center" style="background-color:{{PRIMARY_COLOR}};padding:24px 32px;border-radius:8px 8px 0 0;">
      {{LOGO_HTML}}
    </td></tr>
    <!-- Body -->
    <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      {{BODY_CONTENT}}
    </td></tr>
    <!-- Footer -->
    <tr><td style="background-color:#f9fafb;padding:24px 32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none;">
      {{SOCIAL_LINKS_HTML}}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding-top:16px;font-size:12px;color:#6b7280;line-height:18px;">
          {{FOOTER_CONTENT}}
        </td></tr>
      </table>
      {{UNSUBSCRIBE_LINK}}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>$$,
'{}'::jsonb,
'{"show_logo": true, "logo_position": "center", "show_title": false}'::jsonb,
'{"show_social": true, "compact": false}'::jsonb,
true),

-- Minimal layout
('Minimal', 'minimal', 'Clean, borderless layout with small top-left logo and compact footer. Best for booking confirmations, stock alerts, and internal notifications.',
$$<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{BUSINESS_NAME}}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:{{BG_COLOR}};font-family:{{FONT_FAMILY}};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{{BG_COLOR}};">
<tr><td align="center" style="padding:24px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
    <!-- Header -->
    <tr><td style="padding:24px 32px 0;">
      {{LOGO_HTML}}
    </td></tr>
    <!-- Body -->
    <tr><td style="padding:24px 32px;">
      {{BODY_CONTENT}}
    </td></tr>
    <!-- Footer -->
    <tr><td style="padding:16px 32px 24px;font-size:12px;color:#6b7280;line-height:18px;border-top:1px solid #e5e7eb;">
      {{FOOTER_CONTENT}}
      {{UNSUBSCRIBE_LINK}}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>$$,
'{}'::jsonb,
'{"show_logo": true, "logo_position": "left", "show_title": false}'::jsonb,
'{"show_social": false, "compact": true}'::jsonb,
false),

-- Promotional layout
('Promotional', 'promotional', 'Bold marketing layout with full-width hero area, prominent CTA styling, and large footer with social grid. Best for campaigns, win-back, seasonal, and drip sequences.',
$$<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{BUSINESS_NAME}}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:{{BG_COLOR}};font-family:{{FONT_FAMILY}};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{{BG_COLOR}};">
<tr><td align="center" style="padding:24px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
    <!-- Header -->
    <tr><td align="center" style="background-color:{{PRIMARY_COLOR}};padding:32px;border-radius:8px 8px 0 0;">
      {{LOGO_HTML}}
      {{HEADER_CONTENT}}
    </td></tr>
    <!-- Body -->
    <tr><td style="background-color:#ffffff;padding:40px 32px;">
      {{BODY_CONTENT}}
    </td></tr>
    <!-- Footer -->
    <tr><td style="background-color:{{PRIMARY_COLOR}};padding:32px;border-radius:0 0 8px 8px;">
      {{SOCIAL_LINKS_HTML}}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding-top:16px;font-size:12px;color:#ffffff;line-height:18px;opacity:0.8;">
          {{FOOTER_CONTENT}}
        </td></tr>
      </table>
      {{UNSUBSCRIBE_LINK}}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>$$,
'{}'::jsonb,
'{"show_logo": true, "logo_position": "center", "show_title": true, "title_style": "bold"}'::jsonb,
'{"show_social": true, "compact": false}'::jsonb,
false);

-- ============================================================
-- 10. Seed Brand Kit defaults in business_settings
-- ============================================================
INSERT INTO business_settings (key, value, description) VALUES
  ('email_brand_primary_color', '"#1a1a2e"', 'Email brand: header background & primary buttons'),
  ('email_brand_accent_color', '"#CCFF00"', 'Email brand: secondary buttons & link highlights'),
  ('email_brand_text_color', '"#333333"', 'Email brand: body text color'),
  ('email_brand_bg_color', '"#f5f5f5"', 'Email brand: outer background color'),
  ('email_brand_font_family', '"Arial, Helvetica, sans-serif"', 'Email brand: font family (email-safe)'),
  ('email_brand_logo_url', '""', 'Email brand: logo URL (empty = use receipt_config logo)'),
  ('email_brand_logo_width', '200', 'Email brand: logo width in pixels'),
  ('email_brand_social_google', '""', 'Email brand: Google Business URL'),
  ('email_brand_social_yelp', '""', 'Email brand: Yelp page URL'),
  ('email_brand_social_instagram', '""', 'Email brand: Instagram URL'),
  ('email_brand_social_facebook', '""', 'Email brand: Facebook URL'),
  ('email_brand_footer_text', '""', 'Email brand: optional custom footer line')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 11. RLS policies — admin-only access via service role
-- ============================================================
ALTER TABLE email_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE drip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE drip_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE drip_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE drip_send_log ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so no policies needed for admin access.
-- Authenticated users have no direct access — all via API routes.

-- ============================================================
-- 12. Updated_at triggers
-- ============================================================
CREATE TRIGGER set_updated_at_email_layouts
  BEFORE UPDATE ON email_layouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_email_templates
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_drip_sequences
  BEFORE UPDATE ON drip_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
