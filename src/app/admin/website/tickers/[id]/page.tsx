'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { ArrowLeft, Save } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';
import {
  TICKER_POSITION_OPTIONS,
  POSITION_AVAILABILITY,
  PAGE_TYPE_LABELS,
  type TickerPosition,
} from '@/lib/utils/ticker-sections';

// ---------------------------------------------------------------------------
// Speed → consistent px/s rate (content-width-aware)
// ---------------------------------------------------------------------------
/** Map slider value (1-100) to pixels-per-second scroll rate */
function speedToPxPerSec(speed: number): number {
  // speed 1 → 30 px/s (very slow), speed 100 → 300 px/s (very fast)
  return 30 + (speed / 100) * 270;
}

/** Convert ISO string to datetime-local format (YYYY-MM-DDThh:mm) in local timezone */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/** Convert datetime-local string to ISO, or null if empty */
function localToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

export default function TickerEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ticker, setTicker] = useState<AnnouncementTicker | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Separate local state for date fields — avoids ISO conversion on every keystroke
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Ref for measuring preview content width
  const previewRef = useRef<HTMLSpanElement>(null);
  const [previewDuration, setPreviewDuration] = useState(20);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/cms/tickers/${id}`);
      if (!res.ok) throw new Error('Not found');
      const { data } = await res.json();
      setTicker(data);
      setStartDate(isoToLocal(data.starts_at));
      setEndDate(isoToLocal(data.ends_at));
    } catch {
      toast.error('Failed to load ticker');
      router.push('/admin/website/tickers');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const update = (field: keyof AnnouncementTicker, value: unknown) => {
    setTicker((prev) => prev ? { ...prev, [field]: value } : null);
  };

  // Measure preview content width and calculate duration based on px/s
  const speedValue = ticker?.scroll_speed_value ?? 50;
  useEffect(() => {
    function measure() {
      const el = previewRef.current;
      if (!el) return;
      const pxPerSec = speedToPxPerSec(speedValue);
      const totalDistance = window.innerWidth + el.scrollWidth;
      const dur = Math.max(3, totalDistance / pxPerSec);
      setPreviewDuration(dur);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [speedValue, ticker?.message, ticker?.link_text]);

  const save = async () => {
    if (!ticker) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/cms/tickers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: ticker.message,
          link_url: ticker.link_url,
          link_text: ticker.link_text,
          placement: ticker.placement,
          section_position: ticker.section_position,
          bg_color: ticker.bg_color,
          text_color: ticker.text_color,
          scroll_speed: ticker.scroll_speed,
          scroll_speed_value: ticker.scroll_speed_value,
          font_size: ticker.font_size,
          target_pages: ticker.target_pages,
          starts_at: localToIso(startDate),
          ends_at: localToIso(endDate),
          is_active: ticker.is_active,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Ticker saved');
    } catch {
      toast.error('Failed to save ticker');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !ticker) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const pxPerSec = speedToPxPerSec(speedValue);
  const previewFontSize = ticker.font_size === 'xs' ? '0.75rem' : ticker.font_size === 'sm' ? '0.875rem' : ticker.font_size === 'lg' ? '1.125rem' : '1rem';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Ticker"
        description={ticker.message?.replace(/<[^>]*>/g, '').slice(0, 60) || 'Untitled'}
        action={
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/admin/website/tickers')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
            </Button>
          </div>
        }
      />

      {/* Live Preview */}
      <div className="overflow-hidden rounded-lg">
        <div
          className="px-4 py-2 overflow-hidden whitespace-nowrap"
          style={{
            backgroundColor: ticker.bg_color,
            color: ticker.text_color,
            fontSize: previewFontSize,
          }}
        >
          <span
            ref={previewRef}
            className="inline-block animate-marquee"
            style={{ animationDuration: `${previewDuration.toFixed(1)}s` }}
          >
            {/* Two identical halves — each message followed by same spacer */}
            {[0, 1].map((half) =>
              Array.from({ length: 4 }, (_, i) => (
                <span key={`${half}-${i}`} className="inline-flex items-center">
                  <span dangerouslySetInnerHTML={{ __html: ticker.message }} />
                  {ticker.link_text && (
                    <span className="underline ml-2">{ticker.link_text}</span>
                  )}
                  <span className="inline-block" style={{ width: '5rem' }} />
                </span>
              ))
            )}
          </span>
        </div>
      </div>

      {/* Message */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Message</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Ticker Message
          </label>
          <textarea
            value={ticker.message || ''}
            onChange={(e) => update('message', e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Your announcement..."
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Supports inline HTML for colored text. Use{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-gray-600">
              {'<span style="color:red;">TEXT</span>'}
            </code>{' '}
            to colorize specific words.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Link URL (optional)
            </label>
            <Input
              value={ticker.link_url || ''}
              onChange={(e) => update('link_url', e.target.value || null)}
              className="mt-1"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Link Text (optional)
            </label>
            <Input
              value={ticker.link_text || ''}
              onChange={(e) => update('link_text', e.target.value || null)}
              className="mt-1"
              placeholder="Learn more"
            />
          </div>
        </div>
      </div>

      {/* Placement & Appearance */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Placement & Appearance</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Placement</label>
            <select
              value={ticker.placement}
              onChange={(e) => update('placement', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="top_bar">Top Bar</option>
              <option value="section">Between Sections</option>
            </select>
          </div>

          {ticker.placement === 'section' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Section Position
              </label>
              <select
                value={ticker.section_position || 'before_footer'}
                onChange={(e) => update('section_position', e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                {TICKER_POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label} — {opt.description}</option>
                ))}
              </select>
            </div>
          )}

          {ticker.placement === 'section' && (
            <PositionAvailabilityWarning
              position={ticker.section_position || 'before_footer'}
              targetPages={ticker.target_pages || ['all']}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Font Size
            </label>
            <select
              value={ticker.font_size}
              onChange={(e) => update('font_size', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="xs">Extra Small</option>
              <option value="sm">Small</option>
              <option value="base">Normal</option>
              <option value="lg">Large</option>
            </select>
          </div>
        </div>

        {/* Scroll Speed Slider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Scroll Speed
          </label>
          <div className="mt-2">
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={speedValue}
              onChange={(e) => update('scroll_speed_value', parseInt(e.target.value, 10))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-brand-500 bg-gray-200 dark:bg-gray-600"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Slower</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {speedValue} &mdash; {Math.round(pxPerSec)} px/s
              </span>
              <span>Faster</span>
            </div>
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Background Color
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={ticker.bg_color}
                onChange={(e) => update('bg_color', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300"
              />
              <Input
                value={ticker.bg_color}
                onChange={(e) => update('bg_color', e.target.value)}
                className="flex-1 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Text Color
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={ticker.text_color}
                onChange={(e) => update('text_color', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300"
              />
              <Input
                value={ticker.text_color}
                onChange={(e) => update('text_color', e.target.value)}
                className="flex-1 font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Page Visibility */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Show On</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Choose which page types this ticker appears on.
        </p>
        <TargetPagesSelector
          value={ticker.target_pages || ['all']}
          onChange={(pages) => update('target_pages', pages)}
        />
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
        <p className="text-xs text-gray-500">
          Leave blank to show indefinitely. Tickers will only display within the specified date range.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Position options & availability — imported from shared module
// ---------------------------------------------------------------------------

function PositionAvailabilityWarning({
  position,
  targetPages,
}: {
  position: string;
  targetPages: string[];
}) {
  const pos = position as TickerPosition;
  const availableOn = POSITION_AVAILABILITY[pos];
  if (!availableOn) return null;

  // before_footer is universal — no warning needed
  if (pos === 'before_footer') return null;

  // Expand 'all' in target pages to all specific page types
  const allPageTypes = Object.keys(PAGE_TYPE_LABELS).filter((p) => p !== 'all');
  const effectivePages = targetPages.includes('all') || targetPages.length === 0
    ? allPageTypes
    : targetPages.filter((p) => p !== 'all');

  const unavailablePages = effectivePages.filter((p) => !(availableOn as string[]).includes(p));
  if (unavailablePages.length === 0) return null;

  const posLabel = TICKER_POSITION_OPTIONS.find((o) => o.value === pos)?.label || position;
  const availableLabels = availableOn.map((p) => PAGE_TYPE_LABELS[p] || p).join(', ');
  const fallbackLabel = availableOn.includes('home') && !availableOn.includes('products')
    ? 'Before CTA or Before Footer'
    : 'Before Footer';

  return (
    <div className="sm:col-span-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-300">
      <span className="font-medium">Note:</span> &ldquo;{posLabel}&rdquo; is only available on: {availableLabels}.
      On other pages, this ticker will fall back to &ldquo;{fallbackLabel}&rdquo;.
    </div>
  );
}

// ---------------------------------------------------------------------------
// TargetPagesSelector — multi-checkbox for page type visibility
// ---------------------------------------------------------------------------

const PAGE_TYPE_OPTIONS = [
  { value: 'all', label: 'All Pages' },
  { value: 'home', label: 'Homepage' },
  { value: 'cms_pages', label: 'CMS Pages (/p/*)' },
  { value: 'products', label: 'Products' },
  { value: 'services', label: 'Services' },
  { value: 'areas', label: 'Service Areas' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'cart', label: 'Cart' },
  { value: 'checkout', label: 'Checkout' },
  { value: 'account', label: 'Account Pages' },
] as const;

function TargetPagesSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (pages: string[]) => void;
}) {
  const isAll = value.includes('all') || value.length === 0;

  const handleToggle = (pageType: string) => {
    if (pageType === 'all') {
      onChange(['all']);
      return;
    }

    // If currently "all", switch to just this specific page
    if (isAll) {
      onChange([pageType]);
      return;
    }

    // Toggle the specific page type
    const newValue = value.includes(pageType)
      ? value.filter((v) => v !== pageType)
      : [...value.filter((v) => v !== 'all'), pageType];

    // If nothing selected, default to all
    if (newValue.length === 0) {
      onChange(['all']);
      return;
    }

    onChange(newValue);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {PAGE_TYPE_OPTIONS.map((opt) => {
        const checked = opt.value === 'all' ? isAll : !isAll && value.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
              checked
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/50'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => handleToggle(opt.value)}
              className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
