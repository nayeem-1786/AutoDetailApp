'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

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

/** Apply dark class and color-scheme to <html> so ALL CSS chunks respect the toggle.
 *  color-scheme on the root element overrides @media (prefers-color-scheme) queries,
 *  neutralizing the media-query dark styles Turbopack generates in a separate chunk. */
function applyThemeToDocument(resolved: 'light' | 'dark', mode: PosTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');

  // color-scheme on root overrides prefers-color-scheme media queries.
  // 'light'       → forces @media(prefers-color-scheme:dark) = false
  // 'dark'        → forces @media(prefers-color-scheme:dark) = true
  // 'light dark'  → follows OS preference (correct for "system" mode)
  if (mode === 'system') {
    root.style.colorScheme = 'light dark';
  } else {
    root.style.colorScheme = resolved;
  }
}

function cleanupDocument() {
  const root = document.documentElement;
  root.classList.remove('dark');
  root.style.removeProperty('color-scheme');
}

export function PosThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<PosTheme>(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(theme));

  // Apply dark class + color-scheme to <html> on mount and when theme changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved, theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        const r = mq.matches ? 'dark' : 'light';
        setResolvedTheme(r);
        applyThemeToDocument(r, 'system');
      };
      mq.addEventListener('change', handler);
      return () => {
        mq.removeEventListener('change', handler);
        cleanupDocument();
      };
    }

    return cleanupDocument;
  }, [theme]);

  const setTheme = useCallback((t: PosTheme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  return (
    <PosThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </PosThemeContext.Provider>
  );
}
