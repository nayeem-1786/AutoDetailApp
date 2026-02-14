'use client';

import { useMemo } from 'react';
import type { SeasonalTheme } from '@/lib/supabase/types';
import { ParticleCanvas } from './particle-canvas';

// ---------------------------------------------------------------------------
// ThemeProvider — Wraps public layout children
// Injects CSS custom properties from active theme's color_overrides
// Renders ParticleCanvas if theme has particle effect
// Scoped to public layout ONLY — does NOT affect admin panel
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  theme: SeasonalTheme | null;
  children: React.ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  // Build inline CSS variable overrides from theme
  const styleOverrides = useMemo(() => {
    if (!theme) return undefined;

    const vars: Record<string, string> = {};

    // Color overrides (e.g., { 'brand-500': '#dc2626' } → --brand-500: #dc2626)
    if (theme.color_overrides) {
      for (const [key, value] of Object.entries(theme.color_overrides)) {
        vars[`--${key}`] = value;
      }
    }

    // Body background color
    if (theme.body_bg_color) {
      vars['--theme-body-bg'] = theme.body_bg_color;
    }

    return Object.keys(vars).length > 0 ? vars : undefined;
  }, [theme]);

  // Build gradient override CSS
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
