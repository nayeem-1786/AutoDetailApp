// ---------------------------------------------------------------------------
// Default Theme — Baseline values for the Smart Details dark + lime design.
// Every value maps to an actual Tailwind class / CSS value in the codebase.
// Used as CSS variable defaults in globals.css (:root / .public-theme).
// Seasonal themes override specific tokens via ThemeProvider.
// ---------------------------------------------------------------------------

export const DEFAULT_THEME = {
  mode: 'dark' as const,

  // ── Accent palette (lime) ──────────────────────────────────────────────
  // The primary interactive color used for CTAs, links, icons, badges.
  accent: {
    DEFAULT: '#CCFF00',         // bg-lime, text-lime
    '50': '#F5FFD6',            // bg-lime-50
    '100': '#ECFF99',           // bg-lime-100
    '200': '#DDFF4D',           // bg-lime-200 (hover states)
    '300': '#CCFF00',           // bg-lime-300
    '400': '#B8E600',           // bg-lime-400 (hover, indicators)
    '500': '#A3CC00',           // bg-lime-500 (gradient endpoint)
    '600': '#7A9900',           // bg-lime-600
    textOnAccent: '#000000',    // text-black on lime buttons
    glowRgb: '204, 255, 0',    // for rgba() in shadows/glows
  },

  // ── Backgrounds ────────────────────────────────────────────────────────
  backgrounds: {
    page: '#000000',            // bg-brand-black (page-level bg)
    surface: '#0A0A0A',         // bg-brand-dark (section alternate bg)
    card: '#1A1A1A',            // bg-brand-surface (cards, modals)
    cardAlt: '#1F2937',         // bg-brand-grey (gradient stops)
    cardAltLight: '#374151',    // bg-brand-grey-light
    deeper: '#111111',          // bg-brand-darker
  },

  // ── Text ───────────────────────────────────────────────────────────────
  text: {
    primary: '#ffffff',         // text-white
    secondary: '#D1D5DB',       // text-gray-300
    muted: '#9CA3AF',           // text-gray-400
    dim: '#6B7280',             // text-gray-500
    faint: '#4B5563',           // text-gray-600
  },

  // ── Borders ────────────────────────────────────────────────────────────
  borders: {
    subtle: 'rgba(255,255,255,0.05)',   // border-white/5
    light: 'rgba(255,255,255,0.1)',     // border-white/10
    medium: 'rgba(255,255,255,0.2)',    // border-white/20
  },

  // ── Typography ─────────────────────────────────────────────────────────
  typography: {
    fontBody: "'DM Sans', system-ui, sans-serif",
    fontDisplay: "'Urbanist', system-ui, sans-serif",
    lineHeight: '1.7',
  },

  // ── Buttons ────────────────────────────────────────────────────────────
  buttons: {
    primaryBg: '#CCFF00',       // bg-lime
    primaryText: '#000000',     // text-black
    primaryHoverBg: '#DDFF4D',  // bg-lime-200
    primaryRadius: '9999px',    // rounded-full
    primaryShadow: '0 10px 15px -3px rgba(204, 255, 0, 0.25)',
    ghostBg: 'rgba(255,255,255,0.05)',  // bg-white/5
    ghostText: '#ffffff',
    ghostHoverBg: 'rgba(255,255,255,0.1)',
  },

  // ── Shadows ────────────────────────────────────────────────────────────
  shadows: {
    accentSm: '0 0 10px rgba(204, 255, 0, 0.1)',
    accent: '0 0 20px rgba(204, 255, 0, 0.15)',
    accentLg: '0 0 40px rgba(204, 255, 0, 0.25)',
    accentGlow: '0 0 60px rgba(204, 255, 0, 0.3)',
  },

  // ── Spacing (reference only — not CSS-variable-driven) ─────────────────
  spacing: {
    sectionPadding: '6rem',       // py-24 / section-spacing
    sectionPaddingSm: '8rem',     // sm: section-spacing
    cardPadding: '1.5rem',        // p-6
    headerHeight: '4rem',         // h-16
    headerHeightLg: '5rem',       // lg:h-20
  },
} as const;

/**
 * Maps a seasonal theme's colorOverrides keys → CSS custom property names.
 * Used by ThemeProvider to inject the right variables.
 *
 * Theme presets store overrides like:
 *   { accent: '#ec4899', 'accent-200': '#f9a8d4', ... }
 *
 * This maps them to:
 *   { '--theme-accent': '#ec4899', '--theme-accent-200': '#f9a8d4', ... }
 */
export const THEME_VAR_PREFIX = '--theme-';

/**
 * All theme CSS custom property names that ThemeProvider can set.
 * Defaults are defined in globals.css :root / .public-theme.
 */
export const THEME_CSS_VARS = [
  'accent',
  'accent-50',
  'accent-100',
  'accent-200',
  'accent-300',
  'accent-400',
  'accent-500',
  'accent-600',
  'accent-text',
  'accent-glow-rgb',
  'page-bg',
  'surface',
  'card-bg',
  'card-alt',
] as const;

export type ThemeCssVar = (typeof THEME_CSS_VARS)[number];
