'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Plus, Trash2, Palette, Sparkles, Play, Square } from 'lucide-react';
import { THEME_PRESETS } from '@/lib/utils/cms-theme-presets';
import type { SeasonalTheme } from '@/lib/supabase/types';

export default function ThemeManagerPage() {
  const router = useRouter();
  const [themes, setThemes] = useState<SeasonalTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPresets, setShowPresets] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/themes');
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      setThemes(data ?? []);
    } catch {
      toast.error('Failed to load themes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTheme = async (presetSlug?: string) => {
    try {
      const preset = presetSlug
        ? THEME_PRESETS.find((p) => p.slug === presetSlug)
        : null;

      const body = preset
        ? {
            name: preset.name,
            slug: preset.slug,
            description: preset.description,
            color_overrides: preset.colorOverrides,
            gradient_overrides: preset.gradientOverrides,
            particle_effect: preset.particleEffect,
            particle_intensity: preset.particleIntensity,
            particle_color: preset.particleColor,
            ticker_message: preset.tickerMessage,
            ticker_bg_color: preset.tickerBgColor,
            ticker_text_color: preset.tickerTextColor,
          }
        : { name: 'New Theme' };

      const res = await adminFetch('/api/admin/cms/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      router.push(`/admin/website/themes/${data.id}`);
    } catch {
      toast.error('Failed to create theme');
    }
  };

  const toggleActive = async (theme: SeasonalTheme) => {
    const action = theme.is_active ? 'deactivate' : 'activate';
    try {
      const res = await adminFetch(`/api/admin/cms/themes/${theme.id}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(theme.is_active ? 'Theme deactivated' : 'Theme activated');
      load();
    } catch {
      toast.error('Failed to update theme');
    }
  };

  const deleteTheme = async (id: string) => {
    if (!confirm('Delete this theme?')) return;
    try {
      const res = await adminFetch(`/api/admin/cms/themes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setThemes((prev) => prev.filter((t) => t.id !== id));
      toast.success('Theme deleted');
    } catch {
      toast.error('Failed to delete theme');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seasonal Themes"
        description="Create and manage seasonal themes for the public website"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowPresets(!showPresets)}>
              <Palette className="mr-2 h-4 w-4" />
              Use Preset
            </Button>
            <Button onClick={() => createTheme()}>
              <Plus className="mr-2 h-4 w-4" />
              Create Theme
            </Button>
          </div>
        }
      />

      {/* Preset Selector */}
      {showPresets && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Choose a Preset
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.slug}
                type="button"
                onClick={() => {
                  createTheme(preset.slug);
                  setShowPresets(false);
                }}
                className="rounded-lg border border-gray-200 p-3 text-left hover:border-brand-500 hover:bg-brand-50 dark:border-gray-600 dark:hover:bg-brand-900/20 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: preset.colorOverrides['brand-500'] }}
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {preset.name}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-1">{preset.description}</p>
                {preset.particleEffect && (
                  <Badge variant="secondary" className="mt-1 text-[10px]">
                    <Sparkles className="mr-1 h-2.5 w-2.5" />
                    {preset.particleEffect}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Themes List */}
      {themes.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Palette className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-3 text-sm text-gray-500">No themes yet</p>
          <Button variant="outline" onClick={() => setShowPresets(true)} className="mt-4">
            <Palette className="mr-2 h-4 w-4" />
            Start with a Preset
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`rounded-lg border bg-white dark:bg-gray-800 p-4 ${
                theme.is_active
                  ? 'border-green-300 ring-1 ring-green-200 dark:border-green-700 dark:ring-green-800'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Color preview */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md"
                  style={{
                    background: Object.values(theme.gradient_overrides ?? {})[0] ??
                      theme.color_overrides?.['brand-500'] ?? '#6b7280',
                  }}
                >
                  <Palette className="h-4 w-4 text-white" />
                </div>

                {/* Content */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/admin/website/themes/${theme.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {theme.name}
                    </p>
                    {theme.is_active && (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Active
                      </Badge>
                    )}
                    {theme.particle_effect && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Sparkles className="mr-1 h-2.5 w-2.5" />
                        {theme.particle_effect}
                      </Badge>
                    )}
                    {theme.auto_activate && (
                      <Badge variant="secondary" className="text-[10px]">Auto</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    {theme.description && (
                      <span className="truncate">{theme.description}</span>
                    )}
                    {theme.starts_at && (
                      <span>Starts: {new Date(theme.starts_at).toLocaleDateString()}</span>
                    )}
                    {theme.ends_at && (
                      <span>Ends: {new Date(theme.ends_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(theme)}
                  >
                    {theme.is_active ? (
                      <><Square className="mr-1 h-3.5 w-3.5" /> Deactivate</>
                    ) : (
                      <><Play className="mr-1 h-3.5 w-3.5" /> Activate</>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => deleteTheme(theme.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
