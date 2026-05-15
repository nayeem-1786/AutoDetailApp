'use client';

import { formatCurrency } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ChannelData {
  sent: number;
  delivered: number;
  deliveryRate: number;
  clicked: number;
  clickRate: number;
  optedOut: number;
  estimatedCost: number;
}

interface ChannelComparisonProps {
  channels: {
    sms: ChannelData;
    email: ChannelData;
  };
  loading: boolean;
}

function MetricRow({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-gray-900 tabular-nums">{value}</span>
        {secondary && (
          <span className="ml-1.5 text-xs text-gray-500">({secondary})</span>
        )}
      </div>
    </div>
  );
}

function ChannelCard({ title, data, borderColor }: { title: string; data: ChannelData; borderColor: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 ${borderColor}`}>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">{title}</h3>
      <div>
        <MetricRow label="Sent" value={(data?.sent ?? 0).toLocaleString()} />
        <MetricRow
          label="Delivered"
          value={(data?.delivered ?? 0).toLocaleString()}
          secondary={`${(data?.deliveryRate ?? 0).toFixed(1)}%`}
        />
        <MetricRow
          label="Clicked"
          value={(data?.clicked ?? 0).toLocaleString()}
          secondary={`${(data?.clickRate ?? 0).toFixed(1)}%`}
        />
        <MetricRow label="Opted Out" value={(data?.optedOut ?? 0).toLocaleString()} />
        <MetricRow label="Est. Cost" value={formatCurrency(data?.estimatedCost ?? 0)} />
      </div>
    </div>
  );
}

export function ChannelComparison({ channels, loading }: ChannelComparisonProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <div className="h-5 w-16 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 w-full bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <div className="h-5 w-16 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 w-full bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sms = channels?.sms ?? { sent: 0, delivered: 0, clicked: 0, optedOut: 0 };
  const email = channels?.email ?? { sent: 0, delivered: 0, clicked: 0, optedOut: 0 };

  const chartData = [
    {
      metric: 'Sent',
      SMS: sms.sent ?? 0,
      Email: email.sent ?? 0,
    },
    {
      metric: 'Delivered',
      SMS: sms.delivered ?? 0,
      Email: email.delivered ?? 0,
    },
    {
      metric: 'Clicked',
      SMS: sms.clicked ?? 0,
      Email: email.clicked ?? 0,
    },
    {
      metric: 'Opted Out',
      SMS: sms.optedOut ?? 0,
      Email: email.optedOut ?? 0,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Side-by-side channel cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChannelCard title="SMS" data={channels.sms} borderColor="border-l-blue-500" />
        <ChannelCard title="Email" data={channels.email} borderColor="border-l-purple-500" />
      </div>

      {/* Comparison bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="metric"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                />
                <Bar dataKey="SMS" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Email" fill="#9333ea" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
