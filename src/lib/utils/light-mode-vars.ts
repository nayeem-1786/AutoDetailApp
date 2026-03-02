// ---------------------------------------------------------------------------
// Light Mode CSS Variable Overrides
// Single source of truth for light mode values — used by:
//   1. ThemeToggle (client-side toggle button)
//   2. ThemeToggleInitializer (pre-hydration flash prevention script)
//
// Applied via style.setProperty() on the .public-theme element to override
// ThemeProvider's inherited dark mode CSS variables.
// ---------------------------------------------------------------------------

export const LIGHT_MODE_VARS: Record<string, string> = {
  // Brand surfaces
  '--brand-black': '#ffffff',
  '--brand-dark': '#f8fafc',
  '--brand-darker': '#f1f5f9',
  '--brand-surface': '#ffffff',
  '--brand-grey': '#e5e7eb',
  '--brand-grey-light': '#f3f4f6',
  // Site text
  '--site-text': '#0f172a',
  '--site-text-secondary': '#374151',
  '--site-text-muted': '#6b7280',
  '--site-text-dim': '#9ca3af',
  '--site-text-faint': '#d1d5db',
  // Site borders
  '--site-border': '#e5e7eb',
  '--site-border-light': '#f3f4f6',
  '--site-border-medium': '#d1d5db',
  // Header / footer
  '--site-header-bg': '#ffffff',
  '--site-footer-bg': '#f8fafc',
  // Text on primary
  '--site-text-on-primary': '#000000',
  // Divider
  '--site-divider': '#e5e7eb',
  // Note: --lime palette overrides removed — accent-ui handles the light mode shift.
  // --site-icon-accent and --site-link* flow through --accent-ui in :root.
  // Buttons — brand lime with black text, same as dark mode
  '--site-btn-primary-bg': '#CCFF00',
  '--site-btn-primary-text': '#000000',
  '--site-btn-primary-hover-bg': '#B8E600',
  '--site-btn-cta-bg': '#CCFF00',
  '--site-btn-cta-text': '#000000',
  '--site-btn-cta-hover-bg': '#B8E600',
  // Semantic accent — only accent-ui shifts to gray; accent-brand stays lime
  '--accent-ui': '#545454',
  // Accent glow
  '--theme-accent-glow-rgb': '84, 84, 84',
  // UI tokens (shared components)
  '--ui-bg': '#ffffff',
  '--ui-bg-hover': '#f9fafb',
  '--ui-bg-alt': '#f8fafc',
  '--ui-bg-muted': '#f3f4f6',
  '--ui-text': '#0f172a',
  '--ui-text-secondary': '#374151',
  '--ui-text-muted': '#6b7280',
  '--ui-text-dim': '#9ca3af',
  '--ui-text-faint': '#d1d5db',
  '--ui-border': '#e5e7eb',
  '--ui-border-light': '#f3f4f6',
  '--ui-ring': '#545454',
  '--ui-placeholder': '#9ca3af',
  '--ui-shadow': 'rgba(0,0,0,0.1)',
  '--ui-input-bg': '#ffffff',
  '--ui-input-border': '#d1d5db',
  '--ui-skeleton': '#e5e7eb',
  '--ui-switch-off': '#e5e7eb',
  '--ui-switch-thumb': '#ffffff',
  '--ui-badge-default-bg': '#f3f4f6',
  '--ui-badge-default-text': '#374151',
  '--ui-tab-list-bg': '#f3f4f6',
  '--ui-tab-active-bg': '#ffffff',
  '--ui-tab-active-text': '#0f172a',
  '--ui-dropdown-bg': '#ffffff',
  '--ui-dropdown-hover': '#f3f4f6',
  '--ui-dropdown-border': '#e5e7eb',
  '--ui-page-bg': '#ffffff',
  '--ui-page-text': '#0f172a',
  '--ui-page-text-secondary': '#374151',
  '--ui-page-text-muted': '#6b7280',
  '--ui-page-border': '#e5e7eb',
  '--ui-page-section-bg': '#f8fafc',
  '--ui-page-card-bg': '#ffffff',
  '--ui-page-header-bg': '#ffffff',
  '--ui-page-footer-bg': '#f8fafc',
};

/**
 * Serialized version of LIGHT_MODE_VARS for embedding in a <Script> tag.
 * Used by ThemeToggleInitializer to avoid a flash-of-dark on page load.
 */
export function getLightModeVarsJson(): string {
  return JSON.stringify(LIGHT_MODE_VARS);
}
