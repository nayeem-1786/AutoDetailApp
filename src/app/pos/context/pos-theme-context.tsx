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

export function PosThemeProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setThemeState] = useState<PosTheme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Read stored theme on mount (client only)
  useEffect(() => {
    const stored = getInitialTheme();
    setThemeState(stored);
    setResolvedTheme(resolveTheme(stored));
    setMounted(true);
  }, []);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (!mounted) return;
    setResolvedTheme(resolveTheme(theme));

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => setResolvedTheme(mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme, mounted]);

  const setTheme = useCallback((t: PosTheme) => {
    setThemeState(t);
    setResolvedTheme(resolveTheme(t));
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  // Render wrapper div with .dark class — React manages this, no imperative DOM hacks.
  // Uses inline display:contents so the div is invisible to layout (flex/grid pass through).
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <PosThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      <div className={isDark ? 'dark' : undefined} style={{ display: 'contents' }}>
        {children}
      </div>
    </PosThemeContext.Provider>
  );
}
