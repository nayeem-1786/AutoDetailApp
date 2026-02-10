'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// --- Types ---

interface ABVariant {
  label: string;
  messageBody: string;
  emailSubject: string;
  sent: number;
  delivered: number;
  clicked: number;
  clickRate: number;
  conversions: number;
  revenue: number;
}

interface ABTest {
  id: string;
  campaignName: string;
  status: 'active' | 'completed';
  variants: ABVariant[];
  winnerId: string | null;
  winnerMetric: string | null;
}

interface ABTestResultsData {
  abTests: ABTest[];
}

interface ABTestResultsProps {
  period: string;
}

// --- Helpers ---

const STATUS_BADGE_VARIANT: Record<string, 'info' | 'success'> = {
  active: 'info',
  completed: 'success',
};

const VARIANT_COLORS: Record<string, { bg: string; text: string; fill: string }> = {
  A: { bg: 'bg-blue-50', text: 'text-blue-700', fill: '#2563eb' },
  B: { bg: 'bg-purple-50', text: 'text-purple-700', fill: '#9333ea' },
};

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

// --- Variant Column ---

function VariantColumn({
  variant,
  isWinner,
  showWinner,
}: {
  variant: ABVariant;
  isWinner: boolean;
  showWinner: boolean;
}) {
  const colors = VARIANT_COLORS[variant.label] ?? VARIANT_COLORS.A;

  return (
    <div className="flex-1 min-w-0">
      {/* Variant label badge + winner */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold',
            colors.bg,
            colors.text
          )}
        >
          Variant {variant.label}
        </span>
        {showWinner && isWinner && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Winner
          </span>
        )}
      </div>

      {/* Message preview */}
      {variant.emailSubject && (
        <p className="text-xs text-gray-500 mb-0.5">
          Subject: <span className="text-gray-700">{variant.emailSubject}</span>
        </p>
      )}
      <p className="text-sm text-gray-700 line-clamp-2 mb-3">{variant.messageBody}</p>

      {/* Stats */}
      <div className="border-t border-gray-100">
        <MetricItem label="Sent" value={variant.sent.toLocaleString()} />
        <MetricItem label="Delivered" value={variant.delivered.toLocaleString()} />
        <MetricItem
          label="Clicked"
          value={`${variant.clicked.toLocaleString()} (${variant.clickRate.toFixed(1)}%)`}
        />
        <MetricItem label="Conversions" value={variant.conversions.toLocaleString()} />
        <MetricItem label="Revenue" value={formatCurrency(variant.revenue)} />
      </div>
    </div>
  );
}

// --- Single Test Card ---

function ABTestCard({ test }: { test: ABTest }) {
  const showWinner = test.status === 'completed' && test.winnerId !== null;

  // Build chart data for click rate comparison
  const chartData = test.variants.map((v) => ({
    name: `Variant ${v.label}`,
    clickRate: v.clickRate,
    fill: VARIANT_COLORS[v.label]?.fill ?? '#6b7280',
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-gray-500" />
            {test.campaignName}
          </CardTitle>
          <Badge variant={STATUS_BADGE_VARIANT[test.status] ?? 'default'}>
            {test.status === 'active' ? 'Active' : 'Completed'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Variant columns */}
          <div className="grid gap-6 sm:grid-cols-2">
            {test.variants.map((variant) => (
              <VariantColumn
                key={variant.label}
                variant={variant}
                isWinner={variant.label === test.winnerId}
                showWinner={showWinner}
              />
            ))}
          </div>

          {/* Click rate comparison bar chart */}
          {test.variants.length >= 2 && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Click Rate Comparison
              </p>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      unit="%"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      width={80}
                    />
                    <Tooltip
                      formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)}%`, 'Click Rate']}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Bar
                      dataKey="clickRate"
                      radius={[0, 4, 4, 0]}
                      barSize={24}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Winner metric note */}
          {showWinner && test.winnerMetric && (
            <p className="text-xs text-gray-500 text-center border-t border-gray-100 pt-3">
              Winner determined by: <span className="font-medium text-gray-700">{test.winnerMetric}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main Component ---

export function ABTestResults({ period }: ABTestResultsProps) {
  const [data, setData] = useState<ABTestResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/marketing/analytics/ab-tests?period=${encodeURIComponent(period)}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load A/B test data');
      }
      const json = await res.json();
      setData(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load A/B test data');
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
        <h2 className="text-lg font-semibold text-gray-900">A/B Test Results</h2>
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-12 w-full bg-gray-100 rounded animate-pulse" />
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-12 w-full bg-gray-100 rounded animate-pulse" />
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Error State ---

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">A/B Test Results</h2>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // --- Empty State ---

  if (!data || data.abTests.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">A/B Test Results</h2>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
          <FlaskConical className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900">No A/B tests yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Enable A/B testing when creating a campaign.
          </p>
        </div>
      </div>
    );
  }

  // --- Rendered Tests ---

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">A/B Test Results</h2>
      <div className="space-y-4">
        {data.abTests.map((test) => (
          <ABTestCard key={test.id} test={test} />
        ))}
      </div>
    </div>
  );
}
