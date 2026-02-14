'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
  Eye,
  MousePointerClick,
  Percent,
  Trash2,
} from 'lucide-react';
import type { AdCreative, AdSize } from '@/lib/supabase/types';
import { AD_SIZE_LABELS } from '@/lib/utils/cms-zones';

// ---------------------------------------------------------------------------
// Ad size options
// ---------------------------------------------------------------------------

const AD_SIZE_OPTIONS: { value: AdSize; label: string }[] = [
  { value: '728x90', label: 'Leaderboard (728x90)' },
  { value: '300x250', label: 'Medium Rectangle (300x250)' },
  { value: '336x280', label: 'Large Rectangle (336x280)' },
  { value: '160x600', label: 'Wide Skyscraper (160x600)' },
  { value: '300x600', label: 'Half Page (300x600)' },
  { value: '320x50', label: 'Mobile Leaderboard (320x50)' },
  { value: '320x100', label: 'Large Mobile Banner (320x100)' },
  { value: '970x90', label: 'Large Leaderboard (970x90)' },
  { value: '970x250', label: 'Billboard (970x250)' },
  { value: '250x250', label: 'Square (250x250)' },
];

// ---------------------------------------------------------------------------
// Creative stats type
// ---------------------------------------------------------------------------

interface CreativePerformance {
  impressions: number;
  clicks: number;
  ctr: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdCreativeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  const [creative, setCreative] = useState<AdCreative | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState<CreativePerformance | null>(null);

  // New creative defaults
  const [form, setForm] = useState({
    name: '',
    ad_size: '728x90' as AdSize,
    image_url: '',
    image_url_mobile: '',
    link_url: '',
    alt_text: '',
    starts_at: '',
    ends_at: '',
    is_active: true,
  });

  // -----------------------------------------------------------------------
  // Load
  // -----------------------------------------------------------------------

  const load = useCallback(async () => {
    if (isNew) return;

    try {
      const [creativeRes, analyticsRes] = await Promise.all([
        adminFetch(`/api/admin/cms/ads/creatives/${id}`),
        adminFetch('/api/admin/cms/ads/analytics?period=all'),
      ]);

      if (!creativeRes.ok) throw new Error('Not found');
      const { data } = await creativeRes.json();
      setCreative(data);
      setForm({
        name: data.name || '',
        ad_size: data.ad_size,
        image_url: data.image_url || '',
        image_url_mobile: data.image_url_mobile || '',
        link_url: data.link_url || '',
        alt_text: data.alt_text || '',
        starts_at: data.starts_at ? data.starts_at.slice(0, 16) : '',
        ends_at: data.ends_at ? data.ends_at.slice(0, 16) : '',
        is_active: data.is_active,
      });

      // Extract stats for this creative
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        const found = (analyticsData.data?.top_creatives ?? []).find(
          (c: { ad_creative_id: string }) => c.ad_creative_id === id
        );
        if (found) {
          setStats({
            impressions: found.impressions,
            clicks: found.clicks,
            ctr: found.ctr,
          });
        }
      }
    } catch {
      toast.error('Failed to load creative');
      router.push('/admin/website/ads');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, router]);

  useEffect(() => {
    load();
  }, [load]);

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.image_url.trim() && !isNew) {
      // Allow save without image for existing (might just be updating other fields)
    }
    if (isNew && !form.image_url.trim()) {
      toast.error('Image URL is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        ad_size: form.ad_size,
        image_url: form.image_url,
        image_url_mobile: form.image_url_mobile || null,
        link_url: form.link_url || null,
        alt_text: form.alt_text || null,
        starts_at: form.starts_at
          ? new Date(form.starts_at).toISOString()
          : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        is_active: form.is_active,
      };

      if (isNew) {
        const res = await adminFetch('/api/admin/cms/ads/creatives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed');
        }
        const { data } = await res.json();
        toast.success('Creative created');
        router.push(`/admin/website/ads/creatives/${data.id}`);
      } else {
        const res = await adminFetch(`/api/admin/cms/ads/creatives/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed');
        const { data } = await res.json();
        setCreative(data);
        toast.success('Creative saved');
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save creative'
      );
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  const handleDelete = async () => {
    if (isNew) return;
    if (!confirm('Delete this ad creative? This cannot be undone.')) return;

    setDeleting(true);
    try {
      const res = await adminFetch(`/api/admin/cms/ads/creatives/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Creative deleted');
      router.push('/admin/website/ads');
    } catch {
      toast.error('Failed to delete creative');
    } finally {
      setDeleting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function parseDimensions(size: AdSize): { w: number; h: number } {
    const [w, h] = size.split('x').map(Number);
    return { w, h };
  }

  const updateField = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const { w: previewW, h: previewH } = parseDimensions(form.ad_size);
  const maxPreviewWidth = 700;
  const previewScale = Math.min(1, maxPreviewWidth / previewW);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'Create Ad' : 'Edit Ad'}
        description={isNew ? 'Create a new ad creative' : form.name || 'Untitled'}
        action={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push('/admin/website/ads')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {!isNew && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
              >
                {deleting ? (
                  <Spinner size="sm" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete
              </Button>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Spinner size="sm" /> Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Save
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form — 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Basic Info
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="mt-1"
                placeholder="Ad creative name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Ad Size
              </label>
              <select
                value={form.ad_size}
                onChange={(e) =>
                  updateField('ad_size', e.target.value as AdSize)
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                {AD_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Images */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Images
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Image URL
              </label>
              <Input
                value={form.image_url}
                onChange={(e) => updateField('image_url', e.target.value)}
                className="mt-1"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Mobile Image URL{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <Input
                value={form.image_url_mobile}
                onChange={(e) =>
                  updateField('image_url_mobile', e.target.value)
                }
                className="mt-1"
                placeholder="https://... (smaller image for mobile)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Alt Text
              </label>
              <Input
                value={form.alt_text}
                onChange={(e) => updateField('alt_text', e.target.value)}
                className="mt-1"
                placeholder="Descriptive alt text for accessibility"
              />
            </div>
          </div>

          {/* Link */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Link
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Click URL{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <Input
                value={form.link_url}
                onChange={(e) => updateField('link_url', e.target.value)}
                className="mt-1"
                placeholder="https://... or /book"
              />
              <p className="text-xs text-gray-500 mt-1">
                Where users are taken when they click the ad. Leave empty for
                non-clickable ads.
              </p>
            </div>
          </div>

          {/* Schedule */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Schedule
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Start Date{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => updateField('starts_at', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  End Date{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => updateField('ends_at', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Leave blank to show indefinitely. The ad will only serve within
              the specified date range.
            </p>
          </div>
        </div>

        {/* Sidebar — 1 col */}
        <div className="space-y-6">
          {/* Live Preview */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Preview
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                {form.ad_size} - {AD_SIZE_LABELS[form.ad_size]}
              </Badge>
            </div>

            <div className="flex justify-center">
              <div
                style={{
                  width: previewW * previewScale,
                  height: previewH * previewScale,
                }}
                className="rounded border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 overflow-hidden flex items-center justify-center"
              >
                {form.image_url ? (
                  <img
                    src={form.image_url}
                    alt={form.alt_text || form.name || 'Ad preview'}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="text-center p-2">
                    <ImageIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="text-xs text-gray-400 mt-1">
                      {previewW} x {previewH}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Actual dimensions: {previewW} x {previewH}px
              {previewScale < 1 && (
                <span>
                  {' '}
                  (scaled to {Math.round(previewScale * 100)}%)
                </span>
              )}
            </p>
          </div>

          {/* Performance Stats (only for existing creatives) */}
          {!isNew && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Performance (All Time)
              </h3>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <Eye className="h-3.5 w-3.5" />
                    Impressions
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {(stats?.impressions ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    Clicks
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {(stats?.clicks ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <Percent className="h-3.5 w-3.5" />
                    CTR
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {stats && stats.impressions > 0
                      ? ((stats.clicks / stats.impressions) * 100).toFixed(2)
                      : '0.00'}
                    %
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Status
            </h3>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Active
              </span>
              <div className="flex items-center gap-2">
                <Badge
                  variant={form.is_active ? 'default' : 'secondary'}
                  className={`text-[10px] ${
                    form.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : ''
                  }`}
                >
                  {form.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(val) => updateField('is_active', val)}
                />
              </div>
            </div>

            {!isNew && creative && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
                <p className="text-xs text-gray-500">
                  Created:{' '}
                  {new Date(creative.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-500">
                  Updated:{' '}
                  {new Date(creative.updated_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
