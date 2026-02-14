'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { ArrowLeft, Save, Image as ImageIcon, Video, Columns } from 'lucide-react';
import type { HeroSlide } from '@/lib/supabase/types';

const CONTENT_TYPES = [
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'before_after', label: 'Before / After', icon: Columns },
] as const;

export default function HeroSlideEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [slide, setSlide] = useState<HeroSlide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/cms/hero/${id}`);
      if (!res.ok) throw new Error('Not found');
      const { data } = await res.json();
      setSlide(data);
    } catch {
      toast.error('Failed to load slide');
      router.push('/admin/website/hero');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const update = (field: keyof HeroSlide, value: unknown) => {
    setSlide((prev) => prev ? { ...prev, [field]: value } : null);
  };

  const save = async () => {
    if (!slide) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/cms/hero/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: slide.title,
          subtitle: slide.subtitle,
          cta_text: slide.cta_text,
          cta_url: slide.cta_url,
          content_type: slide.content_type,
          image_url: slide.image_url,
          image_url_mobile: slide.image_url_mobile,
          image_alt: slide.image_alt,
          video_url: slide.video_url,
          video_thumbnail_url: slide.video_thumbnail_url,
          before_image_url: slide.before_image_url,
          after_image_url: slide.after_image_url,
          before_label: slide.before_label,
          after_label: slide.after_label,
          overlay_opacity: slide.overlay_opacity,
          text_alignment: slide.text_alignment,
          is_active: slide.is_active,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Slide saved');
    } catch {
      toast.error('Failed to save slide');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !slide) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Slide"
        description={slide.title || 'Untitled'}
        action={
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/admin/website/hero')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
            </Button>
          </div>
        }
      />

      {/* Content Type Tabs */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Content Type
        </label>
        <div className="flex gap-2">
          {CONTENT_TYPES.map((ct) => {
            const Icon = ct.icon;
            const isSelected = slide.content_type === ct.value;
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => update('content_type', ct.value)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {ct.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Text Content */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Text Content</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
          <Input
            value={slide.title || ''}
            onChange={(e) => update('title', e.target.value)}
            className="mt-1"
            placeholder="Slide headline"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Subtitle</label>
          <Input
            value={slide.subtitle || ''}
            onChange={(e) => update('subtitle', e.target.value || null)}
            className="mt-1"
            placeholder="Optional subtitle"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">CTA Text</label>
            <Input
              value={slide.cta_text || ''}
              onChange={(e) => update('cta_text', e.target.value || null)}
              className="mt-1"
              placeholder="e.g., Book Now"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">CTA URL</label>
            <Input
              value={slide.cta_url || ''}
              onChange={(e) => update('cta_url', e.target.value || null)}
              className="mt-1"
              placeholder="e.g., /book"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Text Alignment</label>
            <select
              value={slide.text_alignment}
              onChange={(e) => update('text_alignment', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Overlay Opacity ({slide.overlay_opacity}%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={slide.overlay_opacity}
              onChange={(e) => update('overlay_opacity', Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
        </div>
      </div>

      {/* Image Fields */}
      {slide.content_type === 'image' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Image</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Image URL</label>
            <Input
              value={slide.image_url || ''}
              onChange={(e) => update('image_url', e.target.value || null)}
              className="mt-1"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Mobile Image URL (optional)
            </label>
            <Input
              value={slide.image_url_mobile || ''}
              onChange={(e) => update('image_url_mobile', e.target.value || null)}
              className="mt-1"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Alt Text</label>
            <Input
              value={slide.image_alt || ''}
              onChange={(e) => update('image_alt', e.target.value || null)}
              className="mt-1"
              placeholder="Descriptive alt text for SEO"
            />
          </div>
        </div>
      )}

      {/* Video Fields */}
      {slide.content_type === 'video' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Video</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Video URL (YouTube or Vimeo)
            </label>
            <Input
              value={slide.video_url || ''}
              onChange={(e) => update('video_url', e.target.value || null)}
              className="mt-1"
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Poster / Thumbnail URL
            </label>
            <Input
              value={slide.video_thumbnail_url || ''}
              onChange={(e) => update('video_thumbnail_url', e.target.value || null)}
              className="mt-1"
              placeholder="https://..."
            />
          </div>
        </div>
      )}

      {/* Before/After Fields */}
      {slide.content_type === 'before_after' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Before / After</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Before Image URL</label>
              <Input
                value={slide.before_image_url || ''}
                onChange={(e) => update('before_image_url', e.target.value || null)}
                className="mt-1"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">After Image URL</label>
              <Input
                value={slide.after_image_url || ''}
                onChange={(e) => update('after_image_url', e.target.value || null)}
                className="mt-1"
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Before Label</label>
              <Input
                value={slide.before_label ?? 'Before'}
                onChange={(e) => update('before_label', e.target.value || 'Before')}
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">After Label</label>
              <Input
                value={slide.after_label ?? 'After'}
                onChange={(e) => update('after_label', e.target.value || 'After')}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
