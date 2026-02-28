'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { ArrowLeft, Save, RotateCcw, Eye, Download, Upload } from 'lucide-react';
import { ImageUploadField } from '@/components/admin/image-upload-field';
import type { SeasonalTheme, ParticleEffect } from '@/lib/supabase/types';

const PARTICLE_EFFECTS: { value: ParticleEffect | ''; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'snowfall', label: 'Snowfall' },
  { value: 'fireworks', label: 'Fireworks' },
  { value: 'confetti', label: 'Confetti' },
  { value: 'hearts', label: 'Hearts' },
  { value: 'leaves', label: 'Leaves' },
  { value: 'stars', label: 'Stars' },
  { value: 'sparkles', label: 'Sparkles' },
];

/** Base theme default colors — seasonal overrides replace these values */
const BASE_DEFAULTS: Record<string, string> = {
  'lime': '#CCFF00',
  'lime-50': '#F5FFD6',
  'lime-100': '#ECFF99',
  'lime-200': '#DDFF4D',
  'lime-300': '#CCFF00',
  'lime-400': '#B8E600',
  'lime-500': '#A3CC00',
  'lime-600': '#7A9900',
  'brand-dark': '#0A0A0A',
  'brand-surface': '#1A1A1A',
  'accent-glow-rgb': '204, 255, 0',
};

const COLOR_KEYS: { key: string; label: string }[] = [
  { key: 'lime', label: 'Primary Accent' },
  { key: 'lime-50', label: 'Accent Lightest' },
  { key: 'lime-100', label: 'Accent Light' },
  { key: 'lime-200', label: 'Accent Hover' },
  { key: 'lime-300', label: 'Accent Mid-Light' },
  { key: 'lime-400', label: 'Accent Mid' },
  { key: 'lime-500', label: 'Accent Dark' },
  { key: 'lime-600', label: 'Accent Darkest' },
  { key: 'brand-dark', label: 'Section BG' },
  { key: 'brand-surface', label: 'Card BG' },
];

/** Convert ISO string to datetime-local format (YYYY-MM-DDThh:mm) */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

/** Convert datetime-local string to ISO, or null if empty */
function localToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

export default function ThemeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [theme, setTheme] = useState<SeasonalTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Separate local state for date fields — avoids ISO conversion on every keystroke
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/cms/themes/${id}`);
      if (!res.ok) throw new Error('Not found');
      const { data } = await res.json();
      setTheme(data);
      setStartDate(isoToLocal(data.starts_at));
      setEndDate(isoToLocal(data.ends_at));
    } catch {
      toast.error('Failed to load theme');
      router.push('/admin/website/themes');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const update = (field: keyof SeasonalTheme, value: unknown) => {
    setTheme((prev) => prev ? { ...prev, [field]: value } : null);
  };

  const updateColorOverride = (key: string, value: string) => {
    setTheme((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        color_overrides: { ...(prev.color_overrides ?? {}), [key]: value },
      };
    });
  };

  const clearColorOverride = (key: string) => {
    setTheme((prev) => {
      if (!prev) return null;
      const overrides = { ...(prev.color_overrides ?? {}) };
      delete overrides[key];
      return { ...prev, color_overrides: overrides };
    });
  };

  const handlePreview = () => {
    window.open(`/?theme_preview=${id}`, '_blank');
  };

  const handleExport = () => {
    if (!theme) return;
    const exportData = {
      type: 'seasonal_theme' as const,
      name: theme.name,
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings: {
        name: theme.name,
        slug: theme.slug,
        description: theme.description,
        color_overrides: theme.color_overrides,
        gradient_overrides: theme.gradient_overrides,
        particle_effect: theme.particle_effect,
        particle_intensity: theme.particle_intensity,
        particle_color: theme.particle_color,
        ticker_message: theme.ticker_message,
        ticker_bg_color: theme.ticker_bg_color,
        ticker_text_color: theme.ticker_text_color,
        hero_bg_image_url: theme.hero_bg_image_url,
        body_bg_color: theme.body_bg_color,
        starts_at: theme.starts_at,
        ends_at: theme.ends_at,
        auto_activate: theme.auto_activate,
      },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theme-${theme.slug}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Theme exported');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.settings || typeof data.settings !== 'object') {
          toast.error('Invalid theme file: missing settings');
          return;
        }
        if (data.type && data.type !== 'seasonal_theme') {
          toast.error('This file is not a seasonal theme export');
          return;
        }
        const s = data.settings;
        setTheme((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            name: s.name ?? prev.name,
            slug: s.slug ?? prev.slug,
            description: s.description ?? prev.description,
            color_overrides: s.color_overrides ?? prev.color_overrides,
            gradient_overrides: s.gradient_overrides ?? prev.gradient_overrides,
            particle_effect: s.particle_effect ?? prev.particle_effect,
            particle_intensity: s.particle_intensity ?? prev.particle_intensity,
            particle_color: s.particle_color ?? prev.particle_color,
            ticker_message: s.ticker_message ?? prev.ticker_message,
            ticker_bg_color: s.ticker_bg_color ?? prev.ticker_bg_color,
            ticker_text_color: s.ticker_text_color ?? prev.ticker_text_color,
            hero_bg_image_url: s.hero_bg_image_url ?? prev.hero_bg_image_url,
            body_bg_color: s.body_bg_color ?? prev.body_bg_color,
            auto_activate: s.auto_activate ?? prev.auto_activate,
          };
        });
        if (s.starts_at) setStartDate(isoToLocal(s.starts_at));
        if (s.ends_at) setEndDate(isoToLocal(s.ends_at));
        toast.success(`Imported "${data.name ?? 'theme'}" — click Save to apply`);
      } catch {
        toast.error('Failed to parse theme file');
      }
    };
    input.click();
  };

  const save = async () => {
    if (!theme) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/cms/themes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: theme.name,
          slug: theme.slug,
          description: theme.description,
          color_overrides: theme.color_overrides,
          gradient_overrides: theme.gradient_overrides,
          particle_effect: theme.particle_effect,
          particle_intensity: theme.particle_intensity,
          particle_color: theme.particle_color,
          ticker_message: theme.ticker_message,
          ticker_bg_color: theme.ticker_bg_color,
          ticker_text_color: theme.ticker_text_color,
          hero_bg_image_url: theme.hero_bg_image_url,
          body_bg_color: theme.body_bg_color,
          starts_at: localToIso(startDate),
          ends_at: localToIso(endDate),
          auto_activate: theme.auto_activate,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Theme saved');
    } catch {
      toast.error('Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !theme) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Theme"
        description={theme.name}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/website/themes')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="mr-2 h-4 w-4" /> Preview
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button variant="outline" onClick={handleImport}>
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
            </Button>
          </div>
        }
      />

      {/* Basic Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Basic Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <Input
              value={theme.name}
              onChange={(e) => update('name', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label>
            <Input
              value={theme.slug}
              onChange={(e) => update('slug', e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <Input
            value={theme.description || ''}
            onChange={(e) => update('description', e.target.value || null)}
            className="mt-1"
            placeholder="Brief theme description..."
          />
        </div>
      </div>

      {/* Colors */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Color Overrides</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {COLOR_KEYS.filter(({ key }) => theme.color_overrides?.[key]).length} of {COLOR_KEYS.length} colors overriding base
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Colors set here override the base theme. Click the reset button to revert a color to the base theme default.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {COLOR_KEYS.map(({ key, label }) => {
            const hasOverride = !!theme.color_overrides?.[key];
            const baseDefault = BASE_DEFAULTS[key] ?? '#6b7280';
            return (
              <div key={key} className={hasOverride ? '' : 'opacity-60'}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {label}
                  </label>
                  {hasOverride ? (
                    <button
                      type="button"
                      onClick={() => clearColorOverride(key)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title="Reset to base theme default"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      base
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.color_overrides?.[key] ?? baseDefault}
                    onChange={(e) => updateColorOverride(key, e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                  />
                  <Input
                    value={theme.color_overrides?.[key] ?? ''}
                    onChange={(e) => updateColorOverride(key, e.target.value)}
                    className="flex-1 font-mono text-xs"
                    placeholder={baseDefault}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Accent Glow RGB */}
        <div className={theme.color_overrides?.['accent-glow-rgb'] ? '' : 'opacity-60'}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Accent Glow RGB (for shadows/glows)
            </label>
            {theme.color_overrides?.['accent-glow-rgb'] ? (
              <button
                type="button"
                onClick={() => clearColorOverride('accent-glow-rgb')}
                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Reset to base theme default"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                base
              </span>
            )}
          </div>
          <Input
            value={theme.color_overrides?.['accent-glow-rgb'] ?? ''}
            onChange={(e) => updateColorOverride('accent-glow-rgb', e.target.value)}
            className="w-60 font-mono text-xs"
            placeholder={BASE_DEFAULTS['accent-glow-rgb']}
          />
        </div>

        {/* Body BG */}
        <div className={theme.body_bg_color ? '' : 'opacity-60'}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Body Background Color (overrides page background)
            </label>
            {theme.body_bg_color ? (
              <button
                type="button"
                onClick={() => update('body_bg_color', null)}
                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Reset to base theme default"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                base
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.body_bg_color ?? '#000000'}
              onChange={(e) => update('body_bg_color', e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-gray-300"
            />
            <Input
              value={theme.body_bg_color || ''}
              onChange={(e) => update('body_bg_color', e.target.value || null)}
              className="w-40 font-mono text-xs"
              placeholder="#000000"
            />
          </div>
        </div>

        {/* Hero Gradient */}
        <div className={theme.gradient_overrides?.['hero'] ? '' : 'opacity-60'}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Hero Gradient Override (CSS gradient value)
            </label>
            {theme.gradient_overrides?.['hero'] ? (
              <button
                type="button"
                onClick={() => {
                  setTheme((prev) => {
                    if (!prev) return null;
                    const overrides = { ...(prev.gradient_overrides ?? {}) };
                    delete overrides['hero'];
                    return { ...prev, gradient_overrides: overrides };
                  });
                }}
                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Remove gradient override"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                base
              </span>
            )}
          </div>
          <Input
            value={theme.gradient_overrides?.['hero'] || ''}
            onChange={(e) => {
              setTheme((prev) => {
                if (!prev) return null;
                const overrides = { ...(prev.gradient_overrides ?? {}) };
                if (e.target.value) {
                  overrides['hero'] = e.target.value;
                } else {
                  delete overrides['hero'];
                }
                return { ...prev, gradient_overrides: overrides };
              });
            }}
            className="font-mono text-xs"
            placeholder="linear-gradient(135deg, #991b1b 0%, #14532d 100%)"
          />
        </div>
      </div>

      {/* Particles */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Particle Effect</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Effect</label>
            <select
              value={theme.particle_effect ?? ''}
              onChange={(e) => update('particle_effect', e.target.value || null)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {PARTICLE_EFFECTS.map((pe) => (
                <option key={pe.value} value={pe.value}>{pe.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Intensity ({theme.particle_intensity})
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={theme.particle_intensity}
              onChange={(e) => update('particle_intensity', parseInt(e.target.value))}
              className="mt-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Particle Color
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={theme.particle_color ?? '#ffffff'}
                onChange={(e) => update('particle_color', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300"
              />
              <Input
                value={theme.particle_color || ''}
                onChange={(e) => update('particle_color', e.target.value || null)}
                className="flex-1 font-mono text-xs"
                placeholder="Auto (multi-color)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Ticker Override */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Themed Ticker (optional)</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
          <Input
            value={theme.ticker_message || ''}
            onChange={(e) => update('ticker_message', e.target.value || null)}
            className="mt-1"
            placeholder="Seasonal announcement..."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">BG Color</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={theme.ticker_bg_color ?? '#1e3a5f'}
                onChange={(e) => update('ticker_bg_color', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300"
              />
              <Input
                value={theme.ticker_bg_color || ''}
                onChange={(e) => update('ticker_bg_color', e.target.value || null)}
                className="flex-1 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Text Color</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={theme.ticker_text_color ?? '#ffffff'}
                onChange={(e) => update('ticker_text_color', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300"
              />
              <Input
                value={theme.ticker_text_color || ''}
                onChange={(e) => update('ticker_text_color', e.target.value || null)}
                className="flex-1 font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Schedule</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Start Date (optional)
            </label>
            <Input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              End Date (optional)
            </label>
            <Input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={theme.auto_activate}
            onCheckedChange={(val) => update('auto_activate', val)}
          />
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Auto-activate when date range begins (and deactivate when it ends)
          </label>
        </div>
      </div>

      {/* Background */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Background</h3>
        <ImageUploadField
          value={theme.hero_bg_image_url || ''}
          onChange={(url) => update('hero_bg_image_url', url || null)}
          folder="seasonal-themes"
          label="Hero Background Image (optional)"
        />
      </div>
    </div>
  );
}
