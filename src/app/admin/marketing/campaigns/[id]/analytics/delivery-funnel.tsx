'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface FunnelStage {
  stage: string;
  count: number;
}

interface DeliveryFunnelProps {
  data: FunnelStage[];
  loading: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  clicked: 'Clicked',
  converted: 'Converted',
};

const STAGE_COLORS: Record<string, string> = {
  sent: '#3b82f6',
  delivered: '#22c55e',
  clicked: '#a855f7',
  converted: '#14b8a6',
};

export function DeliveryFunnel({ data, loading }: DeliveryFunnelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Delivery Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48 bg-gray-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const sentCount = data.find(d => d.stage === 'sent')?.count ?? 0;
  const chartData = data.map(d => ({
    name: STAGE_LABELS[d.stage] ?? d.stage,
    count: d.count,
    rate: sentCount > 0 ? Math.round((d.count / sentCount) * 1000) / 10 : 0,
    fill: STAGE_COLORS[d.stage] ?? '#6b7280',
  }));

  return (
    <Card>
      <CardHeader><CardTitle>Delivery Funnel</CardTitle></CardHeader>
      <CardContent>
        {sentCount === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No data yet</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="name"
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, _name: any, props: any) => [
                    `${Number(value ?? 0).toLocaleString()} (${props?.payload?.rate ?? 0}%)`,
                    'Count',
                  ]}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={48}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Stage stats below chart */}
        {sentCount > 0 && (
          <div className="grid grid-cols-4 gap-4 mt-4 border-t border-gray-100 pt-4">
            {chartData.map(s => (
              <div key={s.name} className="text-center">
                <p className="text-lg font-bold tabular-nums text-gray-900">{s.count.toLocaleString()}</p>
                <p className="text-xs text-gray-500">{s.name} ({s.rate}%)</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
