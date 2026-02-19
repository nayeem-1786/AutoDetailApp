import Script from 'next/script';

/**
 * Runs before hydration to apply saved light-mode preference,
 * preventing a flash-of-dark on pages where the user chose light mode.
 * Uses Next.js Script with beforeInteractive to avoid hydration mismatch.
 * Sets both the data attribute AND inline style properties so light mode
 * overrides beat ThemeProvider's inherited CSS variables.
 */
export function ThemeToggleInitializer() {
  return (
    <Script
      id="theme-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var saved = localStorage.getItem('sd-user-theme');
              if (saved === 'light') {
                var lightVars = {
                  '--brand-black':'#ffffff','--brand-dark':'#f8fafc','--brand-darker':'#f1f5f9',
                  '--brand-surface':'#ffffff','--brand-grey':'#e5e7eb','--brand-grey-light':'#f3f4f6',
                  '--site-text':'#0f172a','--site-text-secondary':'#374151','--site-text-muted':'#6b7280',
                  '--site-text-dim':'#9ca3af','--site-text-faint':'#d1d5db',
                  '--site-border':'#e5e7eb','--site-border-light':'#f3f4f6','--site-border-medium':'#d1d5db',
                  '--site-header-bg':'#ffffff','--site-footer-bg':'#f8fafc',
                  '--site-text-on-primary':'#000000','--site-divider':'#e5e7eb',
                  '--site-link':'#65a30d','--site-link-hover':'#84cc16',
                  '--site-btn-primary-bg':'#65a30d','--site-btn-primary-text':'#ffffff',
                  '--site-btn-primary-hover-bg':'#84cc16',
                  '--site-btn-cta-bg':'#65a30d','--site-btn-cta-text':'#ffffff',
                  '--site-btn-cta-hover-bg':'#84cc16',
                  '--theme-accent-glow-rgb':'101, 163, 13',
                  '--ui-bg':'#ffffff','--ui-bg-hover':'#f9fafb','--ui-bg-alt':'#f8fafc',
                  '--ui-bg-muted':'#f3f4f6','--ui-text':'#0f172a','--ui-text-secondary':'#374151',
                  '--ui-text-muted':'#6b7280','--ui-text-dim':'#9ca3af','--ui-text-faint':'#d1d5db',
                  '--ui-border':'#e5e7eb','--ui-border-light':'#f3f4f6','--ui-ring':'#65a30d',
                  '--ui-placeholder':'#9ca3af','--ui-shadow':'rgba(0,0,0,0.1)',
                  '--ui-input-bg':'#ffffff','--ui-input-border':'#d1d5db','--ui-skeleton':'#e5e7eb',
                  '--ui-switch-off':'#e5e7eb','--ui-switch-thumb':'#ffffff',
                  '--ui-badge-default-bg':'#f3f4f6','--ui-badge-default-text':'#374151',
                  '--ui-tab-list-bg':'#f3f4f6','--ui-tab-active-bg':'#ffffff','--ui-tab-active-text':'#0f172a',
                  '--ui-dropdown-bg':'#ffffff','--ui-dropdown-hover':'#f3f4f6','--ui-dropdown-border':'#e5e7eb',
                  '--ui-page-bg':'#ffffff','--ui-page-text':'#0f172a','--ui-page-text-secondary':'#374151',
                  '--ui-page-text-muted':'#6b7280','--ui-page-border':'#e5e7eb',
                  '--ui-page-section-bg':'#f8fafc','--ui-page-card-bg':'#ffffff',
                  '--ui-page-header-bg':'#ffffff','--ui-page-footer-bg':'#f8fafc'
                };
                document.addEventListener('DOMContentLoaded', function() {
                  var el = document.querySelector('.public-theme');
                  if (el) {
                    el.setAttribute('data-user-theme', 'light');
                    for (var k in lightVars) { el.style.setProperty(k, lightVars[k]); }
                  }
                });
              }
            } catch(e) {}
          })();
        `,
      }}
    />
  );
}
