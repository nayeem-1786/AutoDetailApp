'use client';

import { useEffect, useState, useCallback } from 'react';
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

// --- Types matching actual API response ---

interface DeliveryHealth {
  smsBounceRate: number;
  emailBounceRate: number;
  landlineCount: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface AudienceApiResponse {
  totalContactable: number;
  smsOnly: number;
  emailOnly: number;
  both: number;
  optOutTrend: TrendPoint[];
  growthTrend: TrendPoint[];
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
  { key: 'smsReach', label: 'SMS Reach', border: 'border-l-green-500', icon: MessageSquare },
  { key: 'emailReach', label: 'Email Reach', border: 'border-l-purple-500', icon: Mail },
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
  const [data, setData] = useState<AudienceApiResponse | null>(null);
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
      setData(json);
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

  // --- Derived values ---

  const totalContactable = data.totalContactable ?? 0;
  const smsOnly = data.smsOnly ?? 0;
  const emailOnly = data.emailOnly ?? 0;
  const both = data.both ?? 0;
  const smsReach = smsOnly + both;
  const emailReach = emailOnly + both;

  // --- Donut Chart Data ---

  const donutData = [
    { name: 'smsOnly', value: smsOnly },
    { name: 'emailOnly', value: emailOnly },
    { name: 'both', value: both },
  ].filter((d) => d.value > 0);

  // --- Stat Value Renderer ---

  function getStatValue(key: string): string {
    switch (key) {
      case 'totalContactable':
        return totalContactable.toLocaleString();
      case 'smsReach':
        return smsReach.toLocaleString();
      case 'emailReach':
        return emailReach.toLocaleString();
      default:
        return '0';
    }
  }

  const optOutTrend = data.optOutTrend ?? [];
  const growthTrend = data.growthTrend ?? [];
  const deliveryHealth = data.deliveryHealth ?? { smsBounceRate: 0, emailBounceRate: 0, landlineCount: 0 };

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
                        content={renderCenterLabel(totalContactable)}
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
            <CardTitle>Opt-out Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {optOutTrend.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No opt-out data available.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={optOutTrend}
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
                      dataKey="count"
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
            <CardTitle>New Customers</CardTitle>
          </CardHeader>
          <CardContent>
            {growthTrend.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No growth data available.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={growthTrend}
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
                      dataKey="count"
                      name="New Customers"
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
                getBounceRateBg(deliveryHealth.smsBounceRate),
                deliveryHealth.smsBounceRate > 10
                  ? 'border-red-200'
                  : deliveryHealth.smsBounceRate > 5
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
                  getBounceRateColor(deliveryHealth.smsBounceRate)
                )}
              >
                {deliveryHealth.smsBounceRate.toFixed(1)}%
              </p>
              {deliveryHealth.smsBounceRate > 5 && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-600">
                    {deliveryHealth.smsBounceRate > 10
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
                getBounceRateBg(deliveryHealth.emailBounceRate),
                deliveryHealth.emailBounceRate > 10
                  ? 'border-red-200'
                  : deliveryHealth.emailBounceRate > 5
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
                  getBounceRateColor(deliveryHealth.emailBounceRate)
                )}
              >
                {deliveryHealth.emailBounceRate.toFixed(1)}%
              </p>
              {deliveryHealth.emailBounceRate > 5 && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-600">
                    {deliveryHealth.emailBounceRate > 10
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
                {(deliveryHealth.landlineCount ?? 0).toLocaleString()}
              </p>
              {(deliveryHealth.landlineCount ?? 0) > 0 && (
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
