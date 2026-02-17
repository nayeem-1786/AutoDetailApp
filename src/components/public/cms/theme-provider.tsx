'use client';

import { useMemo } from 'react';
import type { SeasonalTheme } from '@/lib/supabase/types';
import { ParticleCanvas } from './particle-canvas';

// ---------------------------------------------------------------------------
// ThemeProvider — Wraps public layout children
// Injects CSS custom properties from active theme's color_overrides
// Renders ParticleCanvas if theme has particle effect
// Scoped to public layout ONLY — does NOT affect admin panel
//
// How it works:
// 1. Theme presets store colorOverrides like { lime: '#ec4899', ... }
// 2. ThemeProvider maps each key to --color-{key} (Tailwind v4 token)
// 3. Since bg-lime reads var(--color-lime), overriding --color-lime
//    on this wrapper div changes all bg-lime/text-lime/etc. inside.
// 4. Also sets --theme-accent-glow-rgb for shadow/glow CSS utilities.
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  theme: SeasonalTheme | null;
  children: React.ReactNode;
}

/**
 * Maps theme colorOverrides keys to CSS custom property names.
 * Keys that start with 'accent-glow-rgb' map to --theme-accent-glow-rgb.
 * All other keys map to --color-{key} for Tailwind token override.
 */
function buildCssVars(theme: SeasonalTheme): Record<string, string> | undefined {
  const vars: Record<string, string> = {};

  if (theme.color_overrides) {
    for (const [key, value] of Object.entries(theme.color_overrides)) {
      if (key === 'accent-glow-rgb') {
        // Special: sets the RGB triplet used by shadow/glow utilities
        vars['--theme-accent-glow-rgb'] = value;
      } else {
        // Map to Tailwind v4 color token: --color-{key}
        vars[`--color-${key}`] = value;
      }
    }
  }

  // Body background color override
  if (theme.body_bg_color) {
    vars['--color-brand-black'] = theme.body_bg_color;
  }

  return Object.keys(vars).length > 0 ? vars : undefined;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  // Build inline CSS variable overrides from theme
  const styleOverrides = useMemo(() => {
    if (!theme) return undefined;
    return buildCssVars(theme);
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
