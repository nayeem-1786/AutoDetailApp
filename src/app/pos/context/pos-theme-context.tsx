'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';

type PosTheme = 'light' | 'dark' | 'system';

interface PosThemeContextType {
  theme: PosTheme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: PosTheme) => void;
}

const PosThemeContext = createContext<PosThemeContextType | null>(null);

export function usePosTheme() {
  const ctx = useContext(PosThemeContext);
  if (!ctx) throw new Error('usePosTheme must be used within PosThemeProvider');
  return ctx;
}

const STORAGE_KEY = 'pos-theme';

function getInitialTheme(): PosTheme {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem(STORAGE_KEY) as PosTheme) || 'light';
}

function resolveTheme(theme: PosTheme): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Disable @media (prefers-color-scheme: dark) CSS rules injected by Turbopack.
 *
 * In dev mode, Turbopack generates a separate CSS chunk for server components
 * with its own Tailwind compilation. That chunk uses the DEFAULT dark variant
 * (@media prefers-color-scheme: dark) instead of our @custom-variant dark
 * (class-based). These media-query rules conflict with our class-based toggle:
 * when the OS is in dark mode and the user selects light mode in POS, the
 * media-query rules at (0,1,0) specificity compete with base utilities at
 * the same specificity, and source order often makes the dark rules win.
 *
 * Fix: on mount, find every @media (prefers-color-scheme: dark) block in every
 * stylesheet and delete it. Our class-based rules (specificity 0,2,0 via :is())
 * remain and are the sole authority on dark mode.
 */
function disableMediaQueryDarkRules(): number {
  let removed = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i];
        if (
          rule instanceof CSSMediaRule &&
          rule.conditionText?.includes('prefers-color-scheme: dark')
        ) {
          sheet.deleteRule(i);
          removed++;
        }
      }
    } catch {
      // Cross-origin stylesheets — skip
    }
  }
  return removed;
}

export function PosThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<PosTheme>(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(getInitialTheme()));
  const cleanedRef = useRef(false);

  // Apply .dark class + color-scheme to <html> whenever resolvedTheme changes.
  // This is imperative DOM manipulation because React does not own the <html> element.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;

    // On first run, remove Turbopack's conflicting media-query dark rules.
    // Run AFTER applying the class so the page doesn't flash.
    if (!cleanedRef.current) {
      cleanedRef.current = true;
      disableMediaQueryDarkRules();
      // Turbopack hot-reload can re-inject rules — observe and re-clean.
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLStyleElement || node instanceof HTMLLinkElement) {
              // Small delay to let the stylesheet load
              setTimeout(disableMediaQueryDarkRules, 50);
              return;
            }
          }
        }
      });
      observer.observe(document.head, { childList: true });
      return () => observer.disconnect();
    }
  }, [resolvedTheme]);

  // Listen for OS preference changes in "system" mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setResolvedTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Clean up <html> on unmount (leaving POS)
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.removeProperty('color-scheme');
    };
  }, []);

  const setTheme = useCallback((t: PosTheme) => {
    setThemeState(t);
    setResolvedTheme(resolveTheme(t));
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  return (
    <PosThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </PosThemeContext.Provider>
  );
}
