'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  Plus,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Trash2,
  Image as ImageIcon,
  Video,
  Columns,
  Settings,
} from 'lucide-react';
import type { HeroSlide, HeroCarouselConfig } from '@/lib/supabase/types';

const CONTENT_TYPE_LABELS: Record<string, { label: string; icon: typeof ImageIcon }> = {
  image: { label: 'Image', icon: ImageIcon },
  video: { label: 'Video', icon: Video },
  before_after: { label: 'Before/After', icon: Columns },
};

export default function HeroManagerPage() {
  const router = useRouter();
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [config, setConfig] = useState<HeroCarouselConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  const load = useCallback(async () => {
    try {
      const [slidesRes, configRes] = await Promise.all([
        adminFetch('/api/admin/cms/hero'),
        adminFetch('/api/admin/cms/hero/config'),
      ]);
      if (!slidesRes.ok || !configRes.ok) throw new Error('Failed to load');
      const [slidesData, configData] = await Promise.all([
        slidesRes.json(),
        configRes.json(),
      ]);
      setSlides(slidesData.data ?? []);
      setConfig(configData.data ?? null);
    } catch {
      toast.error('Failed to load hero slides');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addSlide = async () => {
    try {
      const res = await adminFetch('/api/admin/cms/hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Slide' }),
      });
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      router.push(`/admin/website/hero/${data.id}`);
    } catch {
      toast.error('Failed to create slide');
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_active: isActive } : s))
    );
    try {
      const res = await adminFetch(`/api/admin/cms/hero/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setSlides((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !isActive } : s))
      );
      toast.error('Failed to update slide');
    }
  };

  const deleteSlide = async (id: string) => {
    if (!confirm('Delete this slide?')) return;
    try {
      const res = await adminFetch(`/api/admin/cms/hero/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
      setSlides((prev) => prev.filter((s) => s.id !== id));
      toast.success('Slide deleted');
    } catch {
      toast.error('Failed to delete slide');
    }
  };

  const moveSlide = async (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= slides.length) return;

    const updated = [...slides];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    // Reassign sort orders
    updated.forEach((s, i) => { s.sort_order = i; });
    setSlides(updated);

    try {
      const res = await adminFetch('/api/admin/cms/hero/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: updated.map((s, i) => ({ id: s.id, sort_order: i })),
        }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to reorder slides');
      load();
    }
  };

  const updateConfig = async (updates: Partial<HeroCarouselConfig>) => {
    const prev = config;
    const merged = { ...config, ...updates } as HeroCarouselConfig;
    setConfig(merged);
    try {
      const res = await adminFetch('/api/admin/cms/hero/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Config saved');
    } catch {
      setConfig(prev);
      toast.error('Failed to update config');
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
        title="Hero Slides"
        description="Manage the hero section on the homepage"
        action={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)}>
              <Settings className="mr-2 h-4 w-4" />
              Config
            </Button>
            <Button onClick={addSlide}>
              <Plus className="mr-2 h-4 w-4" />
              Add Slide
            </Button>
          </div>
        }
      />

      {/* Carousel Config */}
      {showConfig && config && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Carousel Configuration
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Mode
              </label>
              <select
                value={config.mode}
                onChange={(e) => updateConfig({ mode: e.target.value as 'single' | 'carousel' })}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                <option value="single">Single (Static)</option>
                <option value="carousel">Carousel (Auto-rotate)</option>
              </select>
            </div>

            {config.mode === 'carousel' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Interval ({(config.interval_ms / 1000).toFixed(0)}s)
                  </label>
                  <input
                    type="range"
                    min={3000}
                    max={10000}
                    step={1000}
                    value={config.interval_ms}
                    onChange={(e) => updateConfig({ interval_ms: Number(e.target.value) })}
                    className="mt-2 w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Transition
                  </label>
                  <select
                    value={config.transition}
                    onChange={(e) => updateConfig({ transition: e.target.value as 'fade' | 'slide' })}
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="fade">Fade</option>
                    <option value="slide">Slide</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={config.pause_on_hover}
                    onCheckedChange={(val) => updateConfig({ pause_on_hover: val })}
                  />
                  <label className="text-sm text-gray-700 dark:text-gray-300">
                    Pause on hover
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Slides List */}
      {slides.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-3 text-sm text-gray-500">No hero slides yet</p>
          <Button variant="outline" onClick={addSlide} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create First Slide
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {slides.map((slide, idx) => {
            const typeInfo = CONTENT_TYPE_LABELS[slide.content_type] ?? CONTENT_TYPE_LABELS.image;
            const TypeIcon = typeInfo.icon;

            return (
              <div
                key={slide.id}
                className={`rounded-lg border bg-white dark:bg-gray-800 p-4 ${
                  slide.is_active
                    ? 'border-gray-200 dark:border-gray-700'
                    : 'border-gray-100 dark:border-gray-800 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Reorder */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveSlide(idx, -1)}
                      disabled={idx === 0}
                      className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <GripVertical className="h-4 w-4 text-gray-300" />
                    <button
                      type="button"
                      onClick={() => moveSlide(idx, 1)}
                      disabled={idx === slides.length - 1}
                      className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Thumbnail */}
                  <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    {slide.image_url ? (
                      <img
                        src={slide.image_url}
                        alt={slide.image_alt || slide.title || 'Hero slide'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <TypeIcon className="h-6 w-6 text-gray-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => router.push(`/admin/website/hero/${slide.id}`)}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {slide.title}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        <TypeIcon className="mr-1 h-3 w-3" />
                        {typeInfo.label}
                      </Badge>
                    </div>
                    {slide.subtitle && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {slide.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={slide.is_active}
                      onCheckedChange={(val) => toggleActive(slide.id, val)}
                    />
                    <button
                      type="button"
                      onClick={() => deleteSlide(slide.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
