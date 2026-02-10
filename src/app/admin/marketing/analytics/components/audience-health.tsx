'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  MessageSquare,
  Mail,
  AlertTriangle,
  Phone,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Label,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// --- Types ---

interface ChannelBreakdown {
  smsOnly: number;
  emailOnly: number;
  both: number;
}

interface OptOutTrendPoint {
  date: string;
  optIns: number;
  optOuts: number;
}

interface GrowthTrendPoint {
  date: string;
  subscribers: number;
}

interface DeliveryHealth {
  smsBounceRate: number;
  emailBounceRate: number;
  landlineCount: number;
}

interface AudienceHealthData {
  totalContactable: number;
  smsConsentPercent: number;
  emailConsentPercent: number;
  channelBreakdown: ChannelBreakdown;
  optOutTrend: OptOutTrendPoint[];
  growthTrend: GrowthTrendPoint[];
  deliveryHealth: DeliveryHealth;
}

interface AudienceHealthProps {
  period: string;
}

// --- Chart Colors ---

const DONUT_COLORS = {
  smsOnly: '#2563eb',   // blue-600
  emailOnly: '#9333ea', // purple-600
  both: '#16a34a',      // green-600
};

const DONUT_LABELS: Record<string, string> = {
  smsOnly: 'SMS Only',
  emailOnly: 'Email Only',
  both: 'Both',
};

// --- Helpers ---

function getBounceRateColor(rate: number): string {
  if (rate > 10) return 'text-red-600';
  if (rate > 5) return 'text-amber-600';
  return 'text-green-600';
}

function getBounceRateBg(rate: number): string {
  if (rate > 10) return 'bg-red-50';
  if (rate > 5) return 'bg-amber-50';
  return 'bg-green-50';
}

function formatShortDate(dateStr: unknown): string {
  const str = String(dateStr ?? '');
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- Stat Cards ---

const statCards = [
  { key: 'totalContactable', label: 'Total Contactable', border: 'border-l-blue-500', icon: Users },
  { key: 'smsConsentPercent', label: 'SMS Consent', border: 'border-l-green-500', icon: MessageSquare },
  { key: 'emailConsentPercent', label: 'Email Consent', border: 'border-l-purple-500', icon: Mail },
] as const;

// --- Custom Donut Center Label ---

function renderCenterLabel(totalContactable: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function CenterLabel(props: any) {
    const viewBox = props?.viewBox;
    if (!viewBox || !viewBox.cx || !viewBox.cy) return null;
    const { cx, cy } = viewBox;
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
        <tspan x={cx} y={cy - 8} fill="#111827" fontSize="24" fontWeight="bold">
          {totalContactable.toLocaleString()}
        </tspan>
        <tspan x={cx} y={cy + 14} fill="#6b7280" fontSize="12">
          Contactable
        </tspan>
      </text>
    );
  };
}

// --- Main Component ---

export function AudienceHealth({ period }: AudienceHealthProps) {
  const [data, setData] = useState<AudienceHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/marketing/analytics/audience?period=${encodeURIComponent(period)}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load audience data');
      }
      const json = await res.json();
      setData(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audience data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Loading State ---

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Audience Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {statCards.map((card) => (
            <div
              key={card.key}
              className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 ${card.border}`}
            >
              <p className="text-xs font-medium uppercase text-gray-500">{card.label}</p>
              <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 h-72">
            <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="h-52 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 h-72">
            <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="h-52 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // --- Error State ---

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Audience Health</h2>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{error || 'Unable to load audience data.'}</p>
        </div>
      </div>
    );
  }

  // --- Donut Chart Data ---

  const donutData = [
    { name: 'smsOnly', value: data.channelBreakdown.smsOnly },
    { name: 'emailOnly', value: data.channelBreakdown.emailOnly },
    { name: 'both', value: data.channelBreakdown.both },
  ].filter((d) => d.value > 0);

  // --- Stat Value Renderer ---

  function getStatValue(key: string): string {
    if (!data) return '0';
    switch (key) {
      case 'totalContactable':
        return data.totalContactable.toLocaleString();
      case 'smsConsentPercent':
        return `${data.smsConsentPercent.toFixed(1)}%`;
      case 'emailConsentPercent':
        return `${data.emailConsentPercent.toFixed(1)}%`;
      default:
        return '0';
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Audience Health</h2>

      {/* Top Row: 3 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 ${card.border}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
                    {getStatValue(card.key)}
                  </p>
                </div>
                <Icon className="h-8 w-8 text-gray-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Middle: Donut Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Subscription Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {donutData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No subscriber data available for this period.
            </p>
          ) : (
            <div className="flex flex-col items-center">
              <div className="h-64 w-full max-w-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={false}
                    >
                      {donutData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={DONUT_COLORS[entry.name as keyof typeof DONUT_COLORS]}
                        />
                      ))}
                      <Label
                        content={renderCenterLabel(data.totalContactable)}
                        position="center"
                      />
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined, name: string | undefined) => [
                        (value ?? 0).toLocaleString(),
                        DONUT_LABELS[name ?? ''] || name || '',
                      ]}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-6 mt-2">
                {donutData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-full inline-block"
                      style={{ backgroundColor: DONUT_COLORS[entry.name as keyof typeof DONUT_COLORS] }}
                    />
                    <span className="text-xs text-gray-600">
                      {DONUT_LABELS[entry.name] || entry.name} ({entry.value.toLocaleString()})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom: Two Line Charts */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Opt-Out Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Opt-in / Opt-out Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.optOutTrend.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No opt-in/opt-out data available.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.optOutTrend}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      labelFormatter={formatShortDate}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Line
                      type="monotone"
                      dataKey="optIns"
                      name="Opt-ins"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#16a34a' }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="optOuts"
                      name="Opt-outs"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#dc2626' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscriber Growth */}
        <Card>
          <CardHeader>
            <CardTitle>Subscriber Growth</CardTitle>
          </CardHeader>
          <CardContent>
            {data.growthTrend.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No growth data available.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.growthTrend}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      labelFormatter={formatShortDate}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="subscribers"
                      name="Subscribers"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#16a34a' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delivery Health Card */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* SMS Bounce Rate */}
            <div
              className={cn(
                'rounded-lg p-4 border',
                getBounceRateBg(data.deliveryHealth.smsBounceRate),
                data.deliveryHealth.smsBounceRate > 10
                  ? 'border-red-200'
                  : data.deliveryHealth.smsBounceRate > 5
                    ? 'border-amber-200'
                    : 'border-green-200'
              )}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-500" />
                <p className="text-sm text-gray-600">SMS Bounce Rate</p>
              </div>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums mt-1',
                  getBounceRateColor(data.deliveryHealth.smsBounceRate)
                )}
              >
                {data.deliveryHealth.smsBounceRate.toFixed(1)}%
              </p>
              {data.deliveryHealth.smsBounceRate > 5 && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-600">
                    {data.deliveryHealth.smsBounceRate > 10
                      ? 'Critical - review phone list'
                      : 'Elevated - monitor closely'}
                  </span>
                </div>
              )}
            </div>

            {/* Email Bounce Rate */}
            <div
              className={cn(
                'rounded-lg p-4 border',
                getBounceRateBg(data.deliveryHealth.emailBounceRate),
                data.deliveryHealth.emailBounceRate > 10
                  ? 'border-red-200'
                  : data.deliveryHealth.emailBounceRate > 5
                    ? 'border-amber-200'
                    : 'border-green-200'
              )}
            >
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <p className="text-sm text-gray-600">Email Bounce Rate</p>
              </div>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums mt-1',
                  getBounceRateColor(data.deliveryHealth.emailBounceRate)
                )}
              >
                {data.deliveryHealth.emailBounceRate.toFixed(1)}%
              </p>
              {data.deliveryHealth.emailBounceRate > 5 && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-600">
                    {data.deliveryHealth.emailBounceRate > 10
                      ? 'Critical - verify email list'
                      : 'Elevated - monitor closely'}
                  </span>
                </div>
              )}
            </div>

            {/* Landline Count */}
            <div className="rounded-lg p-4 border border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-500" />
                <p className="text-sm text-gray-600">Landline Numbers</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
                {data.deliveryHealth.landlineCount.toLocaleString()}
              </p>
              {data.deliveryHealth.landlineCount > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Cannot receive SMS
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
