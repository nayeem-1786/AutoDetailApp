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
import { Plus, Trash2, Megaphone, ArrowUpRight } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

export default function TickerManagerPage() {
  const router = useRouter();
  const [tickers, setTickers] = useState<AnnouncementTicker[]>([]);
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // Load master toggle
  const loadMaster = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/settings/business?key=ticker_enabled');
      if (res.ok) {
        const { value } = await res.json();
        setMasterEnabled(value === true || value === 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
    loadMaster();
  }, [load, loadMaster]);

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
        <div className="space-y-3">
          {tickers.map((ticker) => (
            <div
              key={ticker.id}
              className={`rounded-lg border bg-white dark:bg-gray-800 p-4 ${
                ticker.is_active
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-gray-100 dark:border-gray-800 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
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
                  onClick={() => router.push(`/admin/website/tickers/${ticker.id}`)}
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
                    onCheckedChange={(val) => toggleActive(ticker.id, val)}
                  />
                  <button
                    type="button"
                    onClick={() => deleteTicker(ticker.id)}
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
