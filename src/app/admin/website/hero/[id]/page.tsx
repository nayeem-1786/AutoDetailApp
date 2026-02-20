'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { ArrowLeft, Save, Image as ImageIcon, Video, Columns, ChevronDown, X } from 'lucide-react';
import { HeroImageUpload } from '../components/hero-image-upload';
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
          // Per-slide color overrides
          text_color: slide.text_color,
          subtitle_color: slide.subtitle_color,
          accent_color: slide.accent_color,
          overlay_color: slide.overlay_color,
          cta_bg_color: slide.cta_bg_color,
          cta_text_color: slide.cta_text_color,
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
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Background Image</h3>

          <HeroImageUpload
            imageUrl={slide.image_url}
            slideId={id}
            pathPrefix="hero-slides"
            onChange={(url) => update('image_url', url)}
            label="Desktop Image"
            aspect="landscape"
          />

          <HeroImageUpload
            imageUrl={slide.image_url_mobile}
            slideId={id}
            pathPrefix="hero-slides-mobile"
            onChange={(url) => update('image_url_mobile', url)}
            label="Mobile Image (optional)"
            aspect="square"
          />

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

          <HeroImageUpload
            imageUrl={slide.video_thumbnail_url}
            slideId={id}
            pathPrefix="hero-slides-thumbs"
            onChange={(url) => update('video_thumbnail_url', url)}
            label="Poster / Thumbnail Image"
            aspect="landscape"
          />
        </div>
      )}

      {/* Before/After Fields */}
      {slide.content_type === 'before_after' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Before / After</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HeroImageUpload
              imageUrl={slide.before_image_url}
              slideId={id}
              pathPrefix="hero-slides-before"
              onChange={(url) => update('before_image_url', url)}
              label="Before Image"
              aspect="square"
            />
            <HeroImageUpload
              imageUrl={slide.after_image_url}
              slideId={id}
              pathPrefix="hero-slides-after"
              onChange={(url) => update('after_image_url', url)}
              label="After Image"
              aspect="square"
            />
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

      {/* Color Overrides */}
      <ColorOverridesSection slide={slide} update={update} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color override field — hex input + native color picker + reset
// ---------------------------------------------------------------------------

const COLOR_FIELDS: { field: keyof HeroSlide; label: string; hint?: string }[] = [
  { field: 'text_color', label: 'Text Color', hint: 'Headline text' },
  { field: 'subtitle_color', label: 'Subtitle Color' },
  { field: 'accent_color', label: 'Accent Color', hint: 'Gradient highlight + active indicator' },
  { field: 'overlay_color', label: 'Overlay Color', hint: 'Default: black' },
  { field: 'cta_bg_color', label: 'CTA Background' },
  { field: 'cta_text_color', label: 'CTA Text Color' },
];

function isValidHex(v: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function ColorOverridesSection({
  slide,
  update,
}: {
  slide: HeroSlide;
  update: (field: keyof HeroSlide, value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasOverrides = COLOR_FIELDS.some((cf) => slide[cf.field] != null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
      >
        <span className="flex items-center gap-2">
          Color Overrides
          {hasOverrides && (
            <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
              Active
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Leave blank to use your site theme colors. Set a color to override for this specific slide.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COLOR_FIELDS.map((cf) => (
              <ColorField
                key={cf.field}
                label={cf.label}
                hint={cf.hint}
                value={(slide[cf.field] as string | null) ?? ''}
                onChange={(v) => update(cf.field, v || null)}
              />
            ))}
          </div>
          {hasOverrides && (
            <button
              type="button"
              onClick={() => {
                for (const cf of COLOR_FIELDS) update(cf.field, null);
              }}
              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              Reset all overrides
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
        {hint && <span className="ml-1 text-gray-400 dark:text-gray-500">({hint})</span>}
      </label>
      <div className="mt-1 flex items-center gap-2">
        {/* Swatch / native picker */}
        <label className="relative">
          <span
            className="block h-8 w-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
            style={{ backgroundColor: isValidHex(value) ? value : '#000000' }}
          />
          <input
            type="color"
            value={isValidHex(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        {/* Hex input */}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className={`flex-1 font-mono text-xs ${value && !isValidHex(value) ? 'border-red-400' : ''}`}
        />
        {/* Reset */}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            title="Reset to theme default"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
