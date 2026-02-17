-- Site Theme Settings — persistent customization for public site appearance
-- Separate from seasonal_themes (which are temporary overlays).
-- NULL fields = "use CSS default from globals.css".

CREATE TABLE IF NOT EXISTS site_theme_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Custom Theme',
  is_active BOOLEAN NOT NULL DEFAULT false,

  -- Mode
  mode TEXT NOT NULL DEFAULT 'dark' CHECK (mode IN ('dark', 'light')),

  -- Colors - Backgrounds
  color_page_bg TEXT,
  color_card_bg TEXT,
  color_header_bg TEXT,
  color_footer_bg TEXT,
  color_section_alt_bg TEXT,

  -- Colors - Text
  color_text_primary TEXT,
  color_text_secondary TEXT,
  color_text_muted TEXT,
  color_text_on_primary TEXT,

  -- Colors - Brand / Accent
  color_primary TEXT,
  color_primary_hover TEXT,
  color_accent TEXT,
  color_accent_hover TEXT,

  -- Colors - Links
  color_link TEXT,
  color_link_hover TEXT,

  -- Colors - Borders
  color_border TEXT,
  color_border_light TEXT,
  color_divider TEXT,

  -- Colors - Status (optional overrides)
  color_success TEXT,
  color_warning TEXT,
  color_error TEXT,

  -- Typography
  font_family TEXT,
  font_heading_family TEXT,
  font_base_size TEXT,
  font_h1_size TEXT,
  font_h2_size TEXT,
  font_h3_size TEXT,
  font_body_size TEXT,
  font_small_size TEXT,
  font_line_height TEXT,
  font_heading_weight TEXT,
  font_body_weight TEXT,

  -- Buttons - Primary
  btn_primary_bg TEXT,
  btn_primary_text TEXT,
  btn_primary_hover_bg TEXT,
  btn_primary_radius TEXT,
  btn_primary_padding TEXT,

  -- Buttons - Secondary / Ghost
  btn_secondary_bg TEXT,
  btn_secondary_text TEXT,
  btn_secondary_border TEXT,
  btn_secondary_radius TEXT,

  -- Buttons - CTA
  btn_cta_bg TEXT,
  btn_cta_text TEXT,
  btn_cta_hover_bg TEXT,
  btn_cta_radius TEXT,

  -- Borders & Shapes
  border_radius TEXT,
  border_card_radius TEXT,
  border_width TEXT,

  -- Spacing
  spacing_section_padding TEXT,
  spacing_card_padding TEXT,
  spacing_header_height TEXT,

  -- Metadata
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at trigger
CREATE TRIGGER tr_site_theme_settings_updated_at
  BEFORE UPDATE ON site_theme_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Only one active custom theme at a time
CREATE UNIQUE INDEX idx_site_theme_settings_active
  ON site_theme_settings (is_active) WHERE is_active = true;

-- Default theme record — all NULL fields mean "use CSS defaults"
INSERT INTO site_theme_settings (name, is_active, is_default, mode)
VALUES ('Default Dark Theme', false, true, 'dark');

-- RLS
ALTER TABLE site_theme_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_theme_public_read" ON site_theme_settings
  FOR SELECT USING (true);

CREATE POLICY "site_theme_authenticated_all" ON site_theme_settings
  FOR ALL USING (auth.role() = 'authenticated');
