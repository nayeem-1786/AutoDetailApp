'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { LIGHT_MODE_VARS } from '@/lib/utils/light-mode-vars';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('sd-user-theme');
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
      applyTheme(saved);
    }
  }, []);

  function applyTheme(mode: 'dark' | 'light') {
    const wrapper = document.querySelector('.public-theme') as HTMLElement;
    if (!wrapper) return;

    if (mode === 'light') {
      wrapper.setAttribute('data-user-theme', 'light');
      // Apply light mode vars via inline style to override ThemeProvider's inherited vars
      for (const [prop, value] of Object.entries(LIGHT_MODE_VARS)) {
        wrapper.style.setProperty(prop, value);
      }
    } else {
      wrapper.removeAttribute('data-user-theme');
      // Remove all light mode overrides so ThemeProvider's vars take over
      for (const prop of Object.keys(LIGHT_MODE_VARS)) {
        wrapper.style.removeProperty(prop);
      }
    }
  }

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sd-user-theme', next);
    applyTheme(next);
  }

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      className="relative flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-200 hover:bg-ui-bg-hover border border-ui-border"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-ui-text-muted" />
      ) : (
        <Moon className="w-4 h-4 text-ui-text-muted" />
      )}
    </button>
  );
}
