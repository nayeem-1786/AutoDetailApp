'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { ArrowLeft, Save, Megaphone } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

export default function TickerEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ticker, setTicker] = useState<AnnouncementTicker | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/cms/tickers/${id}`);
      if (!res.ok) throw new Error('Not found');
      const { data } = await res.json();
      setTicker(data);
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
          font_size: ticker.font_size,
          target_pages: ticker.target_pages,
          starts_at: ticker.starts_at,
          ends_at: ticker.ends_at,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Ticker"
        description={ticker.message || 'Untitled'}
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
          className="px-4 py-2 text-center overflow-hidden whitespace-nowrap"
          style={{
            backgroundColor: ticker.bg_color,
            color: ticker.text_color,
            fontSize: ticker.font_size === 'xs' ? '0.75rem' : ticker.font_size === 'sm' ? '0.875rem' : ticker.font_size === 'lg' ? '1.125rem' : '1rem',
          }}
        >
          <span className="inline-block animate-marquee">
            {ticker.message}
            {ticker.link_text && (
              <span className="ml-2 underline">{ticker.link_text}</span>
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
            rows={2}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Your announcement..."
          />
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
              <Input
                value={ticker.section_position || ''}
                onChange={(e) => update('section_position', e.target.value || null)}
                className="mt-1"
                placeholder="e.g., after_services"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Scroll Speed
            </label>
            <select
              value={ticker.scroll_speed}
              onChange={(e) => update('scroll_speed', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </div>

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
              value={ticker.starts_at ? ticker.starts_at.slice(0, 16) : ''}
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
              value={ticker.ends_at ? ticker.ends_at.slice(0, 16) : ''}
              onChange={(e) => update('ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
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
