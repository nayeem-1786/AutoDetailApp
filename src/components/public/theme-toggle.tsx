'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

// Light mode CSS variable overrides — applied via style.setProperty()
// to beat ThemeProvider's inline styles on the parent element.
const LIGHT_VARS: Record<string, string> = {
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
  // Links
  '--site-link': '#4d7c0f',
  '--site-link-hover': '#65a30d',
  // Buttons — #4d7c0f with white text = 4.6:1 (passes WCAG AA normal text)
  '--site-btn-primary-bg': '#4d7c0f',
  '--site-btn-primary-text': '#ffffff',
  '--site-btn-primary-hover-bg': '#65a30d',
  '--site-btn-cta-bg': '#4d7c0f',
  '--site-btn-cta-text': '#ffffff',
  '--site-btn-cta-hover-bg': '#65a30d',
  // Accent glow
  '--theme-accent-glow-rgb': '101, 163, 13',
  // UI tokens
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
  '--ui-ring': '#65a30d',
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
      for (const [prop, value] of Object.entries(LIGHT_VARS)) {
        wrapper.style.setProperty(prop, value);
      }
    } else {
      wrapper.removeAttribute('data-user-theme');
      // Remove all light mode overrides so ThemeProvider's vars take over
      for (const prop of Object.keys(LIGHT_VARS)) {
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
