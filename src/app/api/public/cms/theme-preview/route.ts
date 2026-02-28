import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SeasonalTheme, SiteThemeSettings } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// GET /api/public/cms/theme-preview?id=xxx — Get theme data for preview mode
// Returns CSS variable overrides and metadata for the preview banner.
// id = UUID of seasonal theme, or "base" for the base theme
// ---------------------------------------------------------------------------

/**
 * Build CSS variable overrides from site theme settings.
 * Mirrors buildSiteThemeVars() from theme-provider.tsx.
 */
function buildSiteThemeVars(st: SiteThemeSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  if (st.color_page_bg) vars['--brand-black'] = st.color_page_bg;
  if (st.color_card_bg) vars['--brand-surface'] = st.color_card_bg;
  if (st.color_section_alt_bg) vars['--brand-dark'] = st.color_section_alt_bg;
  if (st.color_header_bg) vars['--site-header-bg'] = st.color_header_bg;
  if (st.color_footer_bg) vars['--site-footer-bg'] = st.color_footer_bg;
  if (st.color_text_primary) vars['--site-text'] = st.color_text_primary;
  if (st.color_text_secondary) vars['--site-text-secondary'] = st.color_text_secondary;
  if (st.color_text_muted) vars['--site-text-muted'] = st.color_text_muted;
  if (st.color_primary) { vars['--lime'] = st.color_primary; vars['--lime-300'] = st.color_primary; }
  if (st.color_primary_hover) vars['--lime-200'] = st.color_primary_hover;
  if (st.color_accent) vars['--lime-400'] = st.color_accent;
  if (st.color_accent_hover) vars['--lime-500'] = st.color_accent_hover;
  if (st.color_link) vars['--site-link'] = st.color_link;
  if (st.color_link_hover) vars['--site-link-hover'] = st.color_link_hover;
  if (st.color_text_on_primary) vars['--site-text-on-primary'] = st.color_text_on_primary;
  if (st.color_border) vars['--site-border'] = st.color_border;
  if (st.color_border_light) vars['--site-border-light'] = st.color_border_light;
  if (st.color_divider) vars['--site-divider'] = st.color_divider;
  if (st.font_family) vars['--font-body'] = st.font_family;
  if (st.font_heading_family) vars['--font-display'] = st.font_heading_family;
  if (st.btn_primary_bg) vars['--site-btn-primary-bg'] = st.btn_primary_bg;
  if (st.btn_primary_text) vars['--site-btn-primary-text'] = st.btn_primary_text;
  if (st.btn_primary_hover_bg) vars['--site-btn-primary-hover-bg'] = st.btn_primary_hover_bg;
  if (st.btn_primary_radius) vars['--site-btn-primary-radius'] = st.btn_primary_radius;
  if (st.btn_cta_bg) vars['--site-btn-cta-bg'] = st.btn_cta_bg;
  if (st.btn_cta_text) vars['--site-btn-cta-text'] = st.btn_cta_text;
  if (st.btn_cta_hover_bg) vars['--site-btn-cta-hover-bg'] = st.btn_cta_hover_bg;
  if (st.btn_cta_radius) vars['--site-btn-cta-radius'] = st.btn_cta_radius;
  return vars;
}

/**
 * Build CSS variable overrides from seasonal theme.
 * Mirrors buildSeasonalCssVars() from theme-provider.tsx.
 */
function buildSeasonalVars(theme: SeasonalTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  if (theme.color_overrides) {
    for (const [key, value] of Object.entries(theme.color_overrides)) {
      if (key === 'accent-glow-rgb') {
        vars['--theme-accent-glow-rgb'] = value;
      } else {
        vars[`--${key}`] = value;
      }
    }
  }
  if (theme.body_bg_color) {
    vars['--brand-black'] = theme.body_bg_color;
  }
  return vars;
}

function buildGradientCss(theme: SeasonalTheme): string | null {
  if (!theme.gradient_overrides) return null;
  const rules: string[] = [];
  for (const [key, value] of Object.entries(theme.gradient_overrides)) {
    if (key === 'hero') rules.push(`.bg-gradient-hero { background: ${value} !important; }`);
    else if (key === 'cta') rules.push(`.bg-gradient-cta { background: ${value} !important; }`);
    else if (key === 'brand') rules.push(`.bg-gradient-brand { background: ${value} !important; }`);
  }
  return rules.length > 0 ? rules.join('\n') : null;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (id === 'base') {
    // Preview the base theme (no seasonal overlay)
    const { data: active } = await supabase
      .from('site_theme_settings')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    const siteTheme = active ?? (await supabase
      .from('site_theme_settings')
      .select('*')
      .eq('is_default', true)
      .maybeSingle()).data;

    const vars = siteTheme ? buildSiteThemeVars(siteTheme as SiteThemeSettings) : {};

    return NextResponse.json({
      data: {
        name: siteTheme?.name ?? 'Default Theme',
        type: 'base',
        vars,
        gradientCss: null,
      },
    });
  }

  // Preview a seasonal theme (merged with base)
  const [{ data: seasonalTheme }, { data: activeSiteTheme }, { data: defaultSiteTheme }] = await Promise.all([
    supabase.from('seasonal_themes').select('*').eq('id', id).single(),
    supabase.from('site_theme_settings').select('*').eq('is_active', true).maybeSingle(),
    supabase.from('site_theme_settings').select('*').eq('is_default', true).maybeSingle(),
  ]);

  if (!seasonalTheme) {
    return NextResponse.json({ error: 'Theme not found' }, { status: 404 });
  }

  const siteTheme = (activeSiteTheme ?? defaultSiteTheme) as SiteThemeSettings | null;
  const vars: Record<string, string> = {};

  // Layer 1: base theme
  if (siteTheme) Object.assign(vars, buildSiteThemeVars(siteTheme));

  // Layer 2: seasonal overrides
  Object.assign(vars, buildSeasonalVars(seasonalTheme as SeasonalTheme));

  return NextResponse.json({
    data: {
      name: seasonalTheme.name,
      type: 'seasonal',
      vars,
      gradientCss: buildGradientCss(seasonalTheme as SeasonalTheme),
    },
  });
}
