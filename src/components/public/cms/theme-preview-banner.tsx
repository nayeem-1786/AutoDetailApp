'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, X, Check } from 'lucide-react';

interface PreviewThemeData {
  name: string;
  type: 'seasonal' | 'base';
  vars: Record<string, string>;
  gradientCss: string | null;
}

/**
 * ThemePreviewBanner — Client component that detects ?theme_preview=xxx in the URL,
 * fetches the theme data, applies CSS variable overrides to .public-theme, and shows
 * a banner with Apply/Close actions. Preview is per-browser — doesn't affect other users.
 */
export function ThemePreviewBanner() {
  const searchParams = useSearchParams();
  const previewId = searchParams.get('theme_preview');
  const [preview, setPreview] = useState<PreviewThemeData | null>(null);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!previewId || dismissed) return;

    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/public/cms/theme-preview?id=${encodeURIComponent(previewId)}`);
        if (!res.ok) return;
        const { data } = await res.json();
        if (!data) return;
        setPreview(data);
        applyPreviewVars(data);
      } catch {
        // Silently fail — preview is optional
      }
    };

    fetchPreview();
  }, [previewId, dismissed]);

  if (!previewId || !preview || dismissed) return null;

  function applyPreviewVars(data: PreviewThemeData) {
    const wrapper = document.querySelector('.public-theme') as HTMLElement;
    if (!wrapper) return;

    for (const [prop, value] of Object.entries(data.vars)) {
      wrapper.style.setProperty(prop, value);
    }

    // Remove existing preview gradient style
    const existing = document.getElementById('theme-preview-gradient');
    if (existing) existing.remove();

    if (data.gradientCss) {
      const style = document.createElement('style');
      style.id = 'theme-preview-gradient';
      style.textContent = data.gradientCss;
      document.head.appendChild(style);
    }
  }

  function removePreviewVars() {
    const wrapper = document.querySelector('.public-theme') as HTMLElement;
    if (!wrapper || !preview) return;

    for (const prop of Object.keys(preview.vars)) {
      wrapper.style.removeProperty(prop);
    }

    const gradientStyle = document.getElementById('theme-preview-gradient');
    if (gradientStyle) gradientStyle.remove();
  }

  async function handleApply() {
    if (!previewId || applying) return;
    setApplying(true);
    try {
      const endpoint = preview?.type === 'base'
        ? '/api/admin/cms/site-theme'
        : `/api/admin/cms/themes/${previewId}/activate`;

      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');

      // Redirect to admin with success message
      window.location.href = preview?.type === 'base'
        ? '/admin/website/theme-settings?activated=base'
        : '/admin/website/themes?activated=seasonal';
    } catch {
      setApplying(false);
    }
  }

  function handleClose() {
    removePreviewVars();
    setDismissed(true);
    // Remove query param from URL without reload
    const url = new URL(window.location.href);
    url.searchParams.delete('theme_preview');
    window.history.replaceState({}, '', url.toString());
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-indigo-600 text-white px-4 py-2 flex items-center justify-center gap-4 text-sm shadow-lg">
      <Eye className="h-4 w-4 flex-shrink-0" />
      <span>
        Theme Preview: <strong>{preview.name}</strong> — This is not the active theme
      </span>
      <button
        onClick={handleApply}
        disabled={applying}
        className="inline-flex items-center gap-1.5 rounded-md bg-white text-indigo-700 px-3 py-1 text-xs font-medium hover:bg-indigo-50 transition-colors disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        {applying ? 'Applying...' : 'Apply'}
      </button>
      <button
        onClick={handleClose}
        className="inline-flex items-center gap-1 rounded-md bg-indigo-500 px-3 py-1 text-xs font-medium hover:bg-indigo-400 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
        Close Preview
      </button>
    </div>
  );
}
