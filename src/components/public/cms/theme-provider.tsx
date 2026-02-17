'use client';

import { useMemo } from 'react';
import type { SeasonalTheme, SiteThemeSettings } from '@/lib/supabase/types';
import { ParticleCanvas } from './particle-canvas';

// ---------------------------------------------------------------------------
// ThemeProvider — Wraps public layout children
// Injects CSS custom properties from:
//   1. Site theme settings (persistent custom theme from admin)
//   2. Seasonal theme overrides (temporary, layered on top)
//
// Priority: DEFAULT_THEME (CSS) → site theme settings → seasonal overrides
//
// Scoped to public layout ONLY — does NOT affect admin panel
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  theme: SeasonalTheme | null;
  siteTheme: SiteThemeSettings | null;
  children: React.ReactNode;
}

/**
 * Maps site_theme_settings fields to CSS custom property names.
 * Sets raw :root vars (e.g. --brand-black, --lime) so Tailwind utilities
 * that reference them via var() in @theme inline cascade correctly.
 * Only non-null fields produce variables.
 */
function buildSiteThemeVars(st: SiteThemeSettings): Record<string, string> {
  const vars: Record<string, string> = {};

  // Background colors — raw :root vars referenced by @theme inline
  if (st.color_page_bg) vars['--brand-black'] = st.color_page_bg;
  if (st.color_card_bg) vars['--brand-surface'] = st.color_card_bg;
  if (st.color_section_alt_bg) vars['--brand-dark'] = st.color_section_alt_bg;
  if (st.color_header_bg) vars['--site-header-bg'] = st.color_header_bg;
  if (st.color_footer_bg) vars['--site-footer-bg'] = st.color_footer_bg;

  // Text colors — raw :root vars
  if (st.color_text_primary) vars['--site-text'] = st.color_text_primary;
  if (st.color_text_secondary) vars['--site-text-secondary'] = st.color_text_secondary;
  if (st.color_text_muted) vars['--site-text-muted'] = st.color_text_muted;

  // Brand / accent colors — raw lime vars
  if (st.color_primary) {
    vars['--lime'] = st.color_primary;
    vars['--lime-300'] = st.color_primary;
  }
  if (st.color_primary_hover) vars['--lime-200'] = st.color_primary_hover;
  if (st.color_accent) vars['--lime-400'] = st.color_accent;
  if (st.color_accent_hover) vars['--lime-500'] = st.color_accent_hover;

  // Border colors — raw :root vars
  if (st.color_border) vars['--site-border'] = st.color_border;
  if (st.color_border_light) vars['--site-border-light'] = st.color_border_light;

  // Typography
  if (st.font_family) vars['--font-body'] = st.font_family;
  if (st.font_heading_family) vars['--font-display'] = st.font_heading_family;

  // Buttons
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
 * Maps seasonal theme colorOverrides keys to raw CSS custom property names.
 * Keys that start with 'accent-glow-rgb' map to --theme-accent-glow-rgb.
 * All other keys map to --{key} (raw :root vars that @theme inline references).
 */
function buildSeasonalCssVars(theme: SeasonalTheme): Record<string, string> {
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

export function ThemeProvider({ theme, siteTheme, children }: ThemeProviderProps) {
  // Merge: site theme settings first, then seasonal overrides on top
  const styleOverrides = useMemo(() => {
    const vars: Record<string, string> = {};

    // Layer 1: site theme settings
    if (siteTheme) {
      Object.assign(vars, buildSiteThemeVars(siteTheme));
    }

    // Layer 2: seasonal theme overrides (takes precedence)
    if (theme) {
      Object.assign(vars, buildSeasonalCssVars(theme));
    }

    return Object.keys(vars).length > 0 ? vars : undefined;
  }, [theme, siteTheme]);

  // Build gradient override CSS from seasonal theme
  const gradientCss = useMemo(() => {
    if (!theme?.gradient_overrides) return null;

    const rules: string[] = [];
    for (const [key, value] of Object.entries(theme.gradient_overrides)) {
      if (key === 'hero') {
        rules.push(`.bg-gradient-hero { background: ${value} !important; }`);
      } else if (key === 'cta') {
        rules.push(`.bg-gradient-cta { background: ${value} !important; }`);
      } else if (key === 'brand') {
        rules.push(`.bg-gradient-brand { background: ${value} !important; }`);
      }
    }

    return rules.length > 0 ? rules.join('\n') : null;
  }, [theme]);

  return (
    <div style={styleOverrides as React.CSSProperties}>
      {/* Gradient overrides via scoped style */}
      {gradientCss && (
        <style dangerouslySetInnerHTML={{ __html: gradientCss }} />
      )}

      {/* Particle effect */}
      {theme?.particle_effect && (
        <ParticleCanvas
          effect={theme.particle_effect}
          intensity={theme.particle_intensity}
          color={theme.particle_color}
        />
      )}

      {children}
    </div>
  );
}
