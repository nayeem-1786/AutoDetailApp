import Script from 'next/script';
import { getLightModeVarsJson } from '@/lib/utils/light-mode-vars';

/**
 * Runs before hydration to apply saved light-mode preference,
 * preventing a flash-of-dark on pages where the user chose light mode.
 * Uses Next.js Script with beforeInteractive to avoid hydration mismatch.
 * Sets both the data attribute AND inline style properties so light mode
 * overrides beat ThemeProvider's inherited CSS variables.
 *
 * Light mode vars sourced from shared constant in lib/utils/light-mode-vars.ts.
 */
export function ThemeToggleInitializer() {
  const lightVarsJson = getLightModeVarsJson();

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
                var lightVars = ${lightVarsJson};
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
