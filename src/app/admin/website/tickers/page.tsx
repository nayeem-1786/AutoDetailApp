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
import { createClient } from '@/lib/supabase/client';
import {
  Plus,
  Trash2,
  Megaphone,
  ArrowUpRight,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Settings2,
} from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Types for multi-ticker options
// ---------------------------------------------------------------------------
interface TickerPlacementOptions {
  hold_duration: number;
  bg_transition: 'slide_down' | 'crossfade' | 'none';
  text_entry: 'scroll' | 'ltr' | 'rtl' | 'ttb' | 'btt' | 'fade_in';
}

const DEFAULT_OPTIONS: TickerPlacementOptions = {
  hold_duration: 5,
  bg_transition: 'crossfade',
  text_entry: 'rtl',
};

const BG_TRANSITION_OPTIONS = [
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'slide_down', label: 'Slide Down' },
  { value: 'none', label: 'None (instant)' },
] as const;

const TEXT_ENTRY_OPTIONS = [
  { value: 'scroll', label: 'Scroll (continuous marquee)' },
  { value: 'rtl', label: 'Right to Left' },
  { value: 'ltr', label: 'Left to Right' },
  { value: 'ttb', label: 'Top to Bottom' },
  { value: 'btt', label: 'Bottom to Top' },
  { value: 'fade_in', label: 'Fade In' },
] as const;

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function TickerManagerPage() {
  const router = useRouter();
  const [tickers, setTickers] = useState<AnnouncementTicker[]>([]);
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [featureFlagEnabled, setFeatureFlagEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [topBarOptions, setTopBarOptions] = useState<TickerPlacementOptions>(DEFAULT_OPTIONS);
  const [sectionOptions, setSectionOptions] = useState<TickerPlacementOptions>(DEFAULT_OPTIONS);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/tickers');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setTickers(data.data ?? []);
    } catch {
      toast.error('Failed to load tickers');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMaster = useCallback(async () => {
    try {
      const [settingRes] = await Promise.all([
        adminFetch('/api/admin/settings/business?key=ticker_enabled'),
      ]);
      if (settingRes.ok) {
        const { value } = await settingRes.json();
        setMasterEnabled(value === true || value === 'true');
      }
      const supabase = createClient();
      const { data: flag } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('key', 'announcement_tickers')
        .maybeSingle();
      setFeatureFlagEnabled(flag?.enabled ?? false);
    } catch {
      // ignore
    }
  }, []);

  // Load multi-ticker options
  const loadOptions = useCallback(async () => {
    try {
      const [topRes, secRes] = await Promise.all([
        adminFetch('/api/admin/settings/business?key=ticker_top_bar_options'),
        adminFetch('/api/admin/settings/business?key=ticker_section_options'),
      ]);
      if (topRes.ok) {
        const { value } = await topRes.json();
        if (value && typeof value === 'object') {
          setTopBarOptions({ ...DEFAULT_OPTIONS, ...value });
        }
      }
      if (secRes.ok) {
        const { value } = await secRes.json();
        if (value && typeof value === 'object') {
          setSectionOptions({ ...DEFAULT_OPTIONS, ...value });
        }
      }
    } catch {
      // use defaults
    }
  }, []);

  useEffect(() => {
    load();
    loadMaster();
    loadOptions();
  }, [load, loadMaster, loadOptions]);

  const toggleMaster = async (val: boolean) => {
    setMasterEnabled(val);
    try {
      const res = await adminFetch('/api/admin/settings/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ticker_enabled', value: val }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(val ? 'Tickers enabled' : 'Tickers disabled');
    } catch {
      setMasterEnabled(!val);
      toast.error('Failed to update');
    }
  };

  const addTicker = async () => {
    try {
      const res = await adminFetch('/api/admin/cms/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'New announcement' }),
      });
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      router.push(`/admin/website/tickers/${data.id}`);
    } catch {
      toast.error('Failed to create ticker');
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    setTickers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_active: isActive } : t))
    );
    try {
      const res = await adminFetch(`/api/admin/cms/tickers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setTickers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_active: !isActive } : t))
      );
      toast.error('Failed to update ticker');
    }
  };

  const deleteTicker = async (id: string) => {
    if (!confirm('Delete this ticker?')) return;
    try {
      const res = await adminFetch(`/api/admin/cms/tickers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setTickers((prev) => prev.filter((t) => t.id !== id));
      toast.success('Ticker deleted');
    } catch {
      toast.error('Failed to delete ticker');
    }
  };

  const moveItem = async (
    placementTickers: AnnouncementTicker[],
    idx: number,
    direction: -1 | 1
  ) => {
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= placementTickers.length) return;

    const reordered = [...placementTickers];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const items = reordered.map((t, i) => ({ id: t.id, sort_order: i }));

    const prev = [...tickers];
    setTickers((current) => {
      const updated = [...current];
      for (const item of items) {
        const found = updated.find((t) => t.id === item.id);
        if (found) found.sort_order = item.sort_order;
      }
      return updated.sort((a, b) => a.sort_order - b.sort_order);
    });

    try {
      const res = await adminFetch('/api/admin/cms/tickers/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setTickers(prev);
      toast.error('Failed to reorder');
    }
  };

  const saveOptions = async (
    key: 'ticker_top_bar_options' | 'ticker_section_options',
    value: TickerPlacementOptions
  ) => {
    try {
      const res = await adminFetch('/api/admin/settings/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Options saved');
    } catch {
      toast.error('Failed to save options');
    }
  };

  // Group tickers by placement
  const topBarTickers = tickers.filter((t) => t.placement === 'top_bar');
  const sectionTickers = tickers.filter((t) => t.placement === 'section');
  const activeTopBar = topBarTickers.filter((t) => t.is_active);
  const activeSection = sectionTickers.filter((t) => t.is_active);

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
        title="Announcement Tickers"
        description="Scrolling announcements on the public website"
        action={
          <Button onClick={addTicker}>
            <Plus className="mr-2 h-4 w-4" />
            Add Ticker
          </Button>
        }
      />

      {/* Feature Flag Warning */}
      {!featureFlagEnabled && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              Announcement Tickers feature is disabled
            </p>
            <p className="text-sm text-amber-600 mt-1">
              The &ldquo;Announcement Tickers&rdquo; feature flag must be enabled in Feature Toggles for tickers to appear on the website, even when the master toggle below is on.
            </p>
          </div>
          <a
            href="/admin/settings/feature-toggles"
            className="text-sm font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
          >
            Feature Toggles
          </a>
        </div>
      )}

      {/* Master Toggle */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Tickers Enabled
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Master toggle — when off, no tickers display on the website
          </p>
        </div>
        <Switch checked={masterEnabled} onCheckedChange={toggleMaster} />
      </div>

      {/* Tickers List */}
      {tickers.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Megaphone className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-3 text-sm text-gray-500">No tickers yet</p>
          <Button variant="outline" onClick={addTicker} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create First Ticker
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Bar Tickers */}
          {topBarTickers.length > 0 && (
            <PlacementGroup
              label="Top Bar"
              description="Scrolls above the site header"
              tickers={topBarTickers}
              onMove={moveItem}
              onToggle={toggleActive}
              onDelete={deleteTicker}
              onEdit={(id) => router.push(`/admin/website/tickers/${id}`)}
            />
          )}

          {/* Top Bar Options — only when 2+ active */}
          {activeTopBar.length >= 2 && (
            <OptionsCard
              label="Top Bar"
              options={topBarOptions}
              onChange={(opts) => {
                setTopBarOptions(opts);
                saveOptions('ticker_top_bar_options', opts);
              }}
            />
          )}

          {/* Section Tickers */}
          {sectionTickers.length > 0 && (
            <PlacementGroup
              label="Between Sections"
              description="Scrolls inline between page sections"
              tickers={sectionTickers}
              onMove={moveItem}
              onToggle={toggleActive}
              onDelete={deleteTicker}
              onEdit={(id) => router.push(`/admin/website/tickers/${id}`)}
            />
          )}

          {/* Section Options — only when 2+ active */}
          {activeSection.length >= 2 && (
            <OptionsCard
              label="Section"
              options={sectionOptions}
              onChange={(opts) => {
                setSectionOptions(opts);
                saveOptions('ticker_section_options', opts);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OptionsCard — global multi-ticker rotation settings per placement
// ---------------------------------------------------------------------------
function OptionsCard({
  label,
  options,
  onChange,
}: {
  label: string;
  options: TickerPlacementOptions;
  onChange: (opts: TickerPlacementOptions) => void;
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Settings2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
          {label} Rotation Options
        </h4>
      </div>
      <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">
        Controls how multiple tickers cycle when more than one is active.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Text Entry */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Text Entry
          </label>
          <select
            value={options.text_entry}
            onChange={(e) =>
              onChange({ ...options, text_entry: e.target.value as TickerPlacementOptions['text_entry'] })
            }
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {TEXT_ENTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Background Transition */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Background Transition
          </label>
          <select
            value={options.bg_transition}
            onChange={(e) =>
              onChange({ ...options, bg_transition: e.target.value as TickerPlacementOptions['bg_transition'] })
            }
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {BG_TRANSITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Hold Duration */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Hold Duration
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={options.hold_duration}
              onChange={(e) =>
                onChange({ ...options, hold_duration: Math.max(1, Math.min(30, Number(e.target.value) || 5)) })
              }
              className="w-20 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500">seconds</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlacementGroup — renders a labeled section with reorderable ticker cards
// ---------------------------------------------------------------------------
function PlacementGroup({
  label,
  description,
  tickers,
  onMove,
  onToggle,
  onDelete,
  onEdit,
}: {
  label: string;
  description: string;
  tickers: AnnouncementTicker[];
  onMove: (
    placementTickers: AnnouncementTicker[],
    idx: number,
    direction: -1 | 1
  ) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {label}
        </h3>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <div className="space-y-2">
        {tickers.map((ticker, idx) => (
          <div
            key={ticker.id}
            className={`rounded-lg border bg-white dark:bg-gray-800 p-3 ${
              ticker.is_active
                ? 'border-gray-200 dark:border-gray-700'
                : 'border-gray-100 dark:border-gray-800 opacity-60'
            }`}
          >
            <div className="flex items-center gap-2">
              {/* Reorder arrows */}
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onMove(tickers, idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                <button
                  type="button"
                  onClick={() => onMove(tickers, idx, 1)}
                  disabled={idx === tickers.length - 1}
                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Color preview */}
              <div
                className="h-10 w-10 flex-shrink-0 rounded-md flex items-center justify-center"
                style={{ backgroundColor: ticker.bg_color }}
              >
                <Megaphone className="h-4 w-4" style={{ color: ticker.text_color }} />
              </div>

              {/* Content */}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onEdit(ticker.id)}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {ticker.message}
                  </p>
                  <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                    {ticker.placement === 'top_bar' ? 'Top Bar' : 'Section'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {ticker.link_url && (
                    <span className="text-xs text-blue-500 flex items-center gap-0.5">
                      <ArrowUpRight className="h-3 w-3" />
                      {ticker.link_text || 'Link'}
                    </span>
                  )}
                  {ticker.starts_at && (
                    <span className="text-xs text-gray-500">
                      Starts: {new Date(ticker.starts_at).toLocaleDateString()}
                    </span>
                  )}
                  {ticker.ends_at && (
                    <span className="text-xs text-gray-500">
                      Ends: {new Date(ticker.ends_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={ticker.is_active}
                  onCheckedChange={(val) => onToggle(ticker.id, val)}
                />
                <button
                  type="button"
                  onClick={() => onDelete(ticker.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
