'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpDown, FlaskConical } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id: string;
  name: string;
  channel: 'sms' | 'email';
  sentAt: string;
  recipients: number;
  delivered: number;
  deliveryRate: number;
  clicked: number;
  clickRate: number;
  optedOut: number;
  conversions: number;
  revenue: number;
  hasVariants: boolean;
}

interface CampaignResponse {
  campaigns: Campaign[];
  total: number;
}

interface CampaignTableProps {
  period: string;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortKey = keyof Pick<
  Campaign,
  'name' | 'channel' | 'sentAt' | 'recipients' | 'delivered' | 'clicked' | 'optedOut' | 'conversions' | 'revenue'
>;

type SortDirection = 'asc' | 'desc';

function compareCampaigns(a: Campaign, b: Campaign, key: SortKey, dir: SortDirection): number {
  let aVal: string | number;
  let bVal: string | number;

  switch (key) {
    case 'name':
    case 'channel':
      aVal = a[key].toLowerCase();
      bVal = b[key].toLowerCase();
      break;
    case 'sentAt':
      aVal = new Date(a.sentAt).getTime();
      bVal = new Date(b.sentAt).getTime();
      break;
    default:
      aVal = a[key];
      bVal = b[key];
  }

  if (aVal < bVal) return dir === 'asc' ? -1 : 1;
  if (aVal > bVal) return dir === 'asc' ? 1 : -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Channel badge styling
// ---------------------------------------------------------------------------

const CHANNEL_BADGE_CLASSES: Record<string, string> = {
  sms: 'bg-blue-100 text-blue-800',
  email: 'bg-purple-100 text-purple-800',
};

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignTable({ period }: CampaignTableProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('sentAt');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // ---------- Fetch ----------

  const fetchCampaigns = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/marketing/analytics/campaigns?period=${encodeURIComponent(p)}`);
      if (res.ok) {
        const data: CampaignResponse = await res.json();
        setCampaigns(data.campaigns ?? []);
        setTotal(data.total ?? 0);
      } else {
        console.error('Error fetching campaign analytics:', res.status);
        setCampaigns([]);
        setTotal(0);
      }
    } catch (err) {
      console.error('Unexpected error fetching campaign analytics:', err);
      setCampaigns([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns(period);
  }, [period, fetchCampaigns]);

  // ---------- Sort ----------

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => compareCampaigns(a, b, sortKey, sortDir));
  }, [campaigns, sortKey, sortDir]);

  // ---------- Skeleton rows ----------

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Campaign Performance</h3>
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Sent Date</th>
                    <th className="px-4 py-3">Recipients</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">Clicked</th>
                    <th className="px-4 py-3">Opted Out</th>
                    <th className="px-4 py-3">Conversions</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 w-12">A/B</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-12 rounded-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-900">Campaign Performance</h3>
        <Badge variant="default">{total}</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-lg font-medium text-gray-900">No campaigns sent yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Create your first campaign to start tracking.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <SortableHeader label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Channel" sortKey="channel" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Sent Date" sortKey="sentAt" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Recipients" sortKey="recipients" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Delivered" sortKey="delivered" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Clicked" sortKey="clicked" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Opted Out" sortKey="optedOut" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Conversions" sortKey="conversions" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Revenue" sortKey="revenue" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                    <th className="px-4 py-3 w-12">A/B</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((campaign) => (
                    <tr
                      key={campaign.id}
                      onClick={() => router.push(`/admin/marketing/campaigns/${campaign.id}`)}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      {/* Name */}
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                        {campaign.name}
                      </td>

                      {/* Channel */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            CHANNEL_BADGE_CLASSES[campaign.channel] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {CHANNEL_LABELS[campaign.channel] ?? campaign.channel}
                        </span>
                      </td>

                      {/* Sent Date */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatDateTime(campaign.sentAt)}
                      </td>

                      {/* Recipients */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {campaign.recipients.toLocaleString()}
                      </td>

                      {/* Delivered */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {campaign.delivered.toLocaleString()}
                        <span className="ml-1 text-xs text-gray-500">
                          ({campaign.deliveryRate.toFixed(1)}%)
                        </span>
                      </td>

                      {/* Clicked */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {campaign.clicked.toLocaleString()}
                        <span className="ml-1 text-xs text-gray-500">
                          ({campaign.clickRate.toFixed(1)}%)
                        </span>
                      </td>

                      {/* Opted Out */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {campaign.optedOut}
                      </td>

                      {/* Conversions */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {campaign.conversions}
                      </td>

                      {/* Revenue */}
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                        {formatCurrency(campaign.revenue)}
                      </td>

                      {/* A/B */}
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        {campaign.hasVariants && (
                          <span title="Has A/B variants">
                            <FlaskConical className="inline-block h-4 w-4 text-gray-400" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable Header Helper
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDirection;
  onSort: (key: SortKey) => void;
  align?: 'right';
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={`px-4 py-3 cursor-pointer select-none hover:text-gray-700 ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3.5 w-3.5 ${isActive ? 'text-gray-700' : 'text-gray-400'} ${
            isActive && currentDir === 'asc' ? 'rotate-180' : ''
          }`}
        />
      </span>
    </th>
  );
}
