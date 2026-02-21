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
  const [theme, setThemeState] = useState<PosTheme>(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(getInitialTheme()));

  // Apply .dark class + color-scheme to <html> whenever resolvedTheme changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
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
