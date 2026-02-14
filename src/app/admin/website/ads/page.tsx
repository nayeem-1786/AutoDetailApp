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
  Image as ImageIcon,
  BarChart3,
  Map,
  Layers,
  Eye,
  MousePointerClick,
  Percent,
  X,
  Check,
} from 'lucide-react';
import type { AdCreative, AdPlacement, AdSize } from '@/lib/supabase/types';
import type { PageZones, AdZoneDefinition } from '@/lib/utils/cms-zones';
import { AD_SIZE_LABELS } from '@/lib/utils/cms-zones';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsData {
  period: string;
  total_impressions: number;
  total_clicks: number;
  average_ctr: number;
  top_creatives: {
    ad_creative_id: string;
    name: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }[];
}

interface ZoneDialogState {
  open: boolean;
  pagePath: string;
  zoneId: string;
  zoneLabel: string;
  currentPlacement: AdPlacement | null;
}

type TabId = 'creatives' | 'pagemap' | 'analytics';

const TABS: { id: TabId; label: string; icon: typeof Layers }[] = [
  { id: 'creatives', label: 'Creatives', icon: Layers },
  { id: 'pagemap', label: 'Page Map', icon: Map },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdManagementPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('creatives');

  // Master toggle
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [masterLoading, setMasterLoading] = useState(true);

  // Creatives tab
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [creativesLoading, setCreativesLoading] = useState(true);
  const [creativeStats, setCreativeStats] = useState<
    Record<string, { impressions: number; clicks: number }>
  >({});

  // Page Map tab
  const [pageZones, setPageZones] = useState<PageZones[]>([]);
  const [placements, setPlacements] = useState<AdPlacement[]>([]);
  const [pageMapLoading, setPageMapLoading] = useState(false);
  const [zoneDialog, setZoneDialog] = useState<ZoneDialogState>({
    open: false,
    pagePath: '',
    zoneId: '',
    zoneLabel: '',
    currentPlacement: null,
  });
  const [assignSaving, setAssignSaving] = useState(false);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string>('');

  // Analytics tab
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('30d');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Master toggle
  // -----------------------------------------------------------------------

  const loadMaster = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/settings/business?key=ads_enabled');
      if (res.ok) {
        const { value } = await res.json();
        setMasterEnabled(value === true || value === 'true');
      }
    } catch {
      // ignore
    } finally {
      setMasterLoading(false);
    }
  }, []);

  const toggleMaster = async (val: boolean) => {
    setMasterEnabled(val);
    try {
      const res = await adminFetch('/api/admin/settings/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ads_enabled', value: val }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(val ? 'Ads enabled' : 'Ads disabled');
    } catch {
      setMasterEnabled(!val);
      toast.error('Failed to update');
    }
  };

  // -----------------------------------------------------------------------
  // Creatives tab
  // -----------------------------------------------------------------------

  const loadCreatives = useCallback(async () => {
    setCreativesLoading(true);
    try {
      const [creativesRes, analyticsRes] = await Promise.all([
        adminFetch('/api/admin/cms/ads/creatives'),
        adminFetch('/api/admin/cms/ads/analytics?period=all'),
      ]);
      if (!creativesRes.ok) throw new Error('Failed');
      const { data } = await creativesRes.json();
      setCreatives(data ?? []);

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        const statsMap: Record<string, { impressions: number; clicks: number }> = {};
        for (const c of analyticsData.data?.top_creatives ?? []) {
          statsMap[c.ad_creative_id] = {
            impressions: c.impressions,
            clicks: c.clicks,
          };
        }
        setCreativeStats(statsMap);
      }
    } catch {
      toast.error('Failed to load creatives');
    } finally {
      setCreativesLoading(false);
    }
  }, []);

  const toggleCreativeActive = async (id: string, isActive: boolean) => {
    setCreatives((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_active: isActive } : c))
    );
    try {
      const res = await adminFetch(`/api/admin/cms/ads/creatives/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setCreatives((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: !isActive } : c))
      );
      toast.error('Failed to update creative');
    }
  };

  // -----------------------------------------------------------------------
  // Page Map tab
  // -----------------------------------------------------------------------

  const loadPageMap = useCallback(async () => {
    setPageMapLoading(true);
    try {
      const res = await adminFetch('/api/admin/cms/ads/zones');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setPageZones(data.zones ?? []);
      setPlacements(data.placements ?? []);
    } catch {
      toast.error('Failed to load zone data');
    } finally {
      setPageMapLoading(false);
    }
  }, []);

  const openZoneDialog = (
    pagePath: string,
    zone: AdZoneDefinition,
    placement: AdPlacement | null
  ) => {
    setSelectedCreativeId(placement?.ad_creative_id ?? '');
    setZoneDialog({
      open: true,
      pagePath,
      zoneId: zone.id,
      zoneLabel: zone.label,
      currentPlacement: placement,
    });
  };

  const closeZoneDialog = () => {
    setZoneDialog((prev) => ({ ...prev, open: false }));
  };

  const assignCreative = async () => {
    setAssignSaving(true);
    try {
      // If clearing the assignment
      if (!selectedCreativeId && zoneDialog.currentPlacement) {
        const res = await adminFetch(
          `/api/admin/cms/ads/placements/${zoneDialog.currentPlacement.id}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error('Failed');
        toast.success('Ad removed from zone');
      } else if (selectedCreativeId && zoneDialog.currentPlacement) {
        // Update existing placement
        const res = await adminFetch(
          `/api/admin/cms/ads/placements/${zoneDialog.currentPlacement.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ad_creative_id: selectedCreativeId }),
          }
        );
        if (!res.ok) throw new Error('Failed');
        toast.success('Ad updated');
      } else if (selectedCreativeId) {
        // Create new placement
        const res = await adminFetch('/api/admin/cms/ads/placements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ad_creative_id: selectedCreativeId,
            page_path: zoneDialog.pagePath,
            zone_id: zoneDialog.zoneId,
          }),
        });
        if (!res.ok) throw new Error('Failed');
        toast.success('Ad assigned to zone');
      }

      closeZoneDialog();
      loadPageMap();
    } catch {
      toast.error('Failed to update placement');
    } finally {
      setAssignSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Analytics tab
  // -----------------------------------------------------------------------

  const loadAnalytics = useCallback(async (period: string) => {
    setAnalyticsLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/cms/ads/analytics?period=${period}`
      );
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      setAnalytics(data);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  useEffect(() => {
    loadMaster();
    loadCreatives();
  }, [loadMaster, loadCreatives]);

  useEffect(() => {
    if (activeTab === 'pagemap') {
      loadPageMap();
    } else if (activeTab === 'analytics') {
      loadAnalytics(analyticsPeriod);
    }
  }, [activeTab, loadPageMap, loadAnalytics, analyticsPeriod]);

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function getPlacementForZone(
    pagePath: string,
    zoneId: string
  ): AdPlacement | null {
    return (
      placements.find(
        (p) => p.page_path === pagePath && p.zone_id === zoneId
      ) ?? null
    );
  }

  function parseDimensions(size: AdSize): { w: number; h: number } {
    const [w, h] = size.split('x').map(Number);
    return { w, h };
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (masterLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ad Management"
        description="Manage ad creatives, placements, and performance"
        action={
          activeTab === 'creatives' ? (
            <Button
              onClick={() =>
                router.push('/admin/website/ads/creatives/new')
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Ad
            </Button>
          ) : undefined
        }
      />

      {/* Master Toggle */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Ads Enabled
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Master toggle — when off, no ads display on the website
          </p>
        </div>
        <Switch checked={masterEnabled} onCheckedChange={toggleMaster} />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 pb-3 pt-1 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Creatives Tab */}
      {activeTab === 'creatives' && (
        <>
          {creativesLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : creatives.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-3 text-sm text-gray-500">No ad creatives yet</p>
              <Button
                variant="outline"
                onClick={() =>
                  router.push('/admin/website/ads/creatives/new')
                }
                className="mt-4"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create First Ad
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {creatives.map((creative) => {
                const stats = creativeStats[creative.id];
                const impressions = stats?.impressions ?? 0;
                const clicks = stats?.clicks ?? 0;
                return (
                  <div
                    key={creative.id}
                    className={`rounded-lg border bg-white dark:bg-gray-800 overflow-hidden transition-opacity ${
                      creative.is_active
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-gray-100 dark:border-gray-800 opacity-60'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div
                      className="h-36 bg-gray-100 dark:bg-gray-700 flex items-center justify-center cursor-pointer overflow-hidden"
                      onClick={() =>
                        router.push(
                          `/admin/website/ads/creatives/${creative.id}`
                        )
                      }
                    >
                      {creative.image_url ? (
                        <img
                          src={creative.image_url}
                          alt={creative.alt_text || creative.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-gray-400" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-pointer hover:underline"
                          onClick={() =>
                            router.push(
                              `/admin/website/ads/creatives/${creative.id}`
                            )
                          }
                        >
                          {creative.name}
                        </p>
                        <Switch
                          checked={creative.is_active}
                          onCheckedChange={(val) =>
                            toggleCreativeActive(creative.id, val)
                          }
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {AD_SIZE_LABELS[creative.ad_size] || creative.ad_size}
                        </Badge>
                        <Badge variant="default" className="text-[10px]">
                          {creative.ad_size}
                        </Badge>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {impressions.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="h-3 w-3" />
                          {clicks.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Percent className="h-3 w-3" />
                          {impressions > 0
                            ? ((clicks / impressions) * 100).toFixed(1)
                            : '0.0'}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Page Map Tab */}
      {activeTab === 'pagemap' && (
        <>
          {pageMapLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : pageZones.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <Map className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-3 text-sm text-gray-500">
                No zone definitions found
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {pageZones.map((page) => (
                <div
                  key={page.pagePath}
                  className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {page.label}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                      {page.pagePath}
                    </p>
                  </div>

                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {page.zones.map((zone) => {
                      const placement = getPlacementForZone(
                        page.pagePath,
                        zone.id
                      );
                      const assignedCreative = placement?.ad_creative;

                      return (
                        <div
                          key={zone.id}
                          className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                          onClick={() =>
                            openZoneDialog(page.pagePath, zone, placement)
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {zone.label}
                              </p>
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {zone.id}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {zone.description}
                            </p>
                          </div>
                          <div className="ml-4 flex-shrink-0">
                            {assignedCreative ? (
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-12 rounded border border-gray-200 dark:border-gray-600 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                  {assignedCreative.image_url ? (
                                    <img
                                      src={assignedCreative.image_url}
                                      alt={assignedCreative.name}
                                      className="h-full w-full object-contain"
                                    />
                                  ) : (
                                    <ImageIcon className="h-3 w-3 text-gray-400" />
                                  )}
                                </div>
                                <span className="text-xs text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                                  {assignedCreative.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">
                                No ad assigned
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <>
          {/* Period Selector */}
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAnalyticsPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  analyticsPeriod === p
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {p === 'all' ? 'All Time' : p}
              </button>
            ))}
          </div>

          {analyticsLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : !analytics ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-3 text-sm text-gray-500">
                No analytics data available
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-gray-400" />
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Impressions
                    </p>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {analytics.total_impressions.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <MousePointerClick className="h-4 w-4 text-gray-400" />
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Clicks
                    </p>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {analytics.total_clicks.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-gray-400" />
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CTR
                    </p>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {(analytics.average_ctr * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Top Creatives Table */}
              {analytics.top_creatives.length > 0 ? (
                <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                  <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Top Creatives by Impressions
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Creative
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Impressions
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Clicks
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            CTR
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {analytics.top_creatives.map((c) => (
                          <tr key={c.ad_creative_id}>
                            <td className="px-4 py-2 text-gray-900 dark:text-gray-100 font-medium">
                              {c.name}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                              {c.impressions.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                              {c.clicks.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                              {(c.ctr * 100).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                  <p className="text-sm text-gray-500">
                    No impression or click data yet
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Zone Assignment Dialog (Modal Overlay) */}
      {zoneDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Assign Ad to Zone
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {zoneDialog.zoneLabel} on{' '}
                  <span className="font-mono">{zoneDialog.pagePath}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeZoneDialog}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Select Creative
                </label>
                <select
                  value={selectedCreativeId}
                  onChange={(e) => setSelectedCreativeId(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                >
                  <option value="">-- No ad (remove) --</option>
                  {creatives
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({AD_SIZE_LABELS[c.ad_size] || c.ad_size})
                      </option>
                    ))}
                </select>
              </div>

              {/* Preview */}
              {selectedCreativeId && (
                <div className="rounded-md border border-gray-200 dark:border-gray-600 p-2 bg-gray-50 dark:bg-gray-700">
                  {(() => {
                    const c = creatives.find(
                      (cr) => cr.id === selectedCreativeId
                    );
                    if (!c) return null;
                    const { w, h } = parseDimensions(c.ad_size);
                    const scale = Math.min(1, 380 / w);
                    return (
                      <div className="flex flex-col items-center gap-2">
                        <div
                          style={{
                            width: w * scale,
                            height: h * scale,
                          }}
                          className="overflow-hidden rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center"
                        >
                          {c.image_url ? (
                            <img
                              src={c.image_url}
                              alt={c.alt_text || c.name}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-gray-400" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {c.ad_size} - {AD_SIZE_LABELS[c.ad_size]}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
              <Button variant="outline" size="sm" onClick={closeZoneDialog}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={assignCreative}
                disabled={assignSaving}
              >
                {assignSaving ? (
                  <Spinner size="sm" />
                ) : (
                  <Check className="mr-1 h-4 w-4" />
                )}
                {assignSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
