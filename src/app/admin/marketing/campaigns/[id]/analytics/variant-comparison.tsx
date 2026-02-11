'use client';

import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, FlaskConical } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface VariantStat {
  variantId: string;
  label: string;
  sent: number;
  delivered: number;
  clicked: number;
  optedOut: number;
  conversions: number;
  revenue: number;
  isWinner: boolean;
}

interface VariantComparisonProps {
  variants: VariantStat[];
  loading: boolean;
}

function computeRate(num: number, denom: number): number {
  return denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0;
}

const VARIANT_COLORS: Record<string, { bg: string; text: string; fill: string }> = {
  A: { bg: 'bg-blue-50', text: 'text-blue-700', fill: '#2563eb' },
  B: { bg: 'bg-purple-50', text: 'text-purple-700', fill: '#9333ea' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', fill: '#d97706' },
};

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

export function VariantComparison({ variants, loading }: VariantComparisonProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> A/B Test Comparison</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="h-48 bg-gray-100 rounded animate-pulse" />
            <div className="h-48 bg-gray-100 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!variants || variants.length === 0) return null;

  const hasWinner = variants.some(v => v.isWinner);

  const chartData = variants.map(v => ({
    name: `Variant ${v.label}`,
    deliveryRate: computeRate(v.delivered, v.sent),
    ctr: computeRate(v.clicked, v.delivered),
    conversionRate: computeRate(v.conversions, v.sent),
    fill: VARIANT_COLORS[v.label]?.fill ?? '#6b7280',
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-gray-500" />
          A/B Test Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Variant stat columns */}
        <div className="grid gap-6 sm:grid-cols-2">
          {variants.map(v => {
            const colors = VARIANT_COLORS[v.label] ?? VARIANT_COLORS.A;
            return (
              <div key={v.variantId}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold', colors.bg, colors.text)}>
                    Variant {v.label}
                  </span>
                  {hasWinner && v.isWinner && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      Winner
                    </span>
                  )}
                </div>
                <div className="border-t border-gray-100">
                  <MetricRow label="Sent" value={(v.sent ?? 0).toLocaleString()} />
                  <MetricRow label="Delivered" value={`${(v.delivered ?? 0).toLocaleString()} (${computeRate(v.delivered, v.sent).toFixed(1)}%)`} />
                  <MetricRow label="Clicked" value={`${(v.clicked ?? 0).toLocaleString()} (${computeRate(v.clicked, v.delivered).toFixed(1)}%)`} />
                  <MetricRow label="Opted Out" value={(v.optedOut ?? 0).toLocaleString()} />
                  <MetricRow label="Conversions" value={(v.conversions ?? 0).toLocaleString()} />
                  <MetricRow label="Revenue" value={formatCurrency(v.revenue ?? 0)} />
                </div>
              </div>
            );
          })}
        </div>

        {/* CTR comparison chart */}
        {variants.length >= 2 && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Click Rate Comparison</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} width={80} />
                  <Tooltip
                    formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)}%`, 'Click Rate']}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="ctr" radius={[0, 4, 4, 0]} barSize={24}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {hasWinner && (
          <p className="text-xs text-gray-500 text-center border-t border-gray-100 pt-3">
            Winner determined by: <span className="font-medium text-gray-700">Click-through rate</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
