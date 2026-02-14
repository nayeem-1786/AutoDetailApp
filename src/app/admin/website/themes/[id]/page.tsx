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
import { ArrowLeft, Save } from 'lucide-react';
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

const COLOR_KEYS = ['brand-500', 'brand-600', 'brand-700', 'accent-500'];

export default function ThemeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [theme, setTheme] = useState<SeasonalTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/cms/themes/${id}`);
      if (!res.ok) throw new Error('Not found');
      const { data } = await res.json();
      setTheme(data);
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
          starts_at: theme.starts_at,
          ends_at: theme.ends_at,
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
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/admin/website/themes')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Color Overrides</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {COLOR_KEYS.map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                --{key}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.color_overrides?.[key] ?? '#6b7280'}
                  onChange={(e) => updateColorOverride(key, e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                />
                <Input
                  value={theme.color_overrides?.[key] ?? ''}
                  onChange={(e) => updateColorOverride(key, e.target.value)}
                  className="flex-1 font-mono text-xs"
                  placeholder="#000000"
                />
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Body Background Color (optional)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={theme.body_bg_color ?? '#ffffff'}
              onChange={(e) => update('body_bg_color', e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-gray-300"
            />
            <Input
              value={theme.body_bg_color || ''}
              onChange={(e) => update('body_bg_color', e.target.value || null)}
              className="w-40 font-mono text-xs"
              placeholder="#ffffff"
            />
          </div>
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
              value={theme.starts_at ? theme.starts_at.slice(0, 16) : ''}
              onChange={(e) => update('starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              End Date (optional)
            </label>
            <Input
              type="datetime-local"
              value={theme.ends_at ? theme.ends_at.slice(0, 16) : ''}
              onChange={(e) => update('ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
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
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Hero Background Image URL (optional)
          </label>
          <Input
            value={theme.hero_bg_image_url || ''}
            onChange={(e) => update('hero_bg_image_url', e.target.value || null)}
            className="mt-1"
            placeholder="https://..."
          />
        </div>
      </div>
    </div>
  );
}
