'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TimelineEntry {
  hour: number;
  deliveries: number;
  clicks: number;
}

interface EngagementTimelineProps {
  data: TimelineEntry[];
  loading: boolean;
}

export function EngagementTimeline({ data, loading }: EngagementTimelineProps) {
  // Compute cumulative clicks and trim to last non-zero hour
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let cumClicks = 0;
    const mapped = data.map(d => {
      cumClicks += d.clicks;
      return {
        hour: d.hour,
        label: d.hour < 24 ? `${d.hour}h` : `${Math.floor(d.hour / 24)}d ${d.hour % 24}h`,
        clicks: d.clicks,
        cumulativeClicks: cumClicks,
      };
    });

    // Find last hour with a click and show at least 24 hours
    let lastNonZero = 23;
    for (let i = mapped.length - 1; i >= 0; i--) {
      if (mapped[i].clicks > 0) {
        lastNonZero = Math.max(i + 2, 23); // Show 2 hours after last click, min 24h
        break;
      }
    }
    return mapped.slice(0, Math.min(lastNonZero + 1, mapped.length));
  }, [data]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Engagement Timeline</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48 bg-gray-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const hasClicks = chartData.some(d => d.clicks > 0);

  if (!hasClicks) {
    return (
      <Card>
        <CardHeader><CardTitle>Engagement Timeline</CardTitle></CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-gray-500">No click data to chart yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Engagement Timeline</CardTitle></CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-3">Cumulative clicks after send</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="clickGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                allowDecimals={false}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [Number(value ?? 0), 'Cumulative Clicks']}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(label: any) => `${label} after send`}
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulativeClicks"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#clickGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
