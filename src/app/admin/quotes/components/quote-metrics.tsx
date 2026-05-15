'use client';

import { formatCurrency } from '@/lib/utils/format';

interface QuoteMetricsProps {
  metrics: {
    averageValue: number;
    conversionRate: number;
    avgDaysToConvert: number;
    totalQuotes: number;
  };
}

export function QuoteMetrics({ metrics }: QuoteMetricsProps) {
  const items = [
    { label: 'Avg Value', value: formatCurrency(metrics.averageValue) },
    { label: 'Booking Rate', value: `${metrics.conversionRate.toFixed(1)}%` },
    { label: 'Avg Days', value: `${Math.round(metrics.avgDaysToConvert)}d` },
    { label: 'Total', value: metrics.totalQuotes.toLocaleString() },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Desktop: horizontal row with dividers */}
      <div className="hidden sm:flex items-center divide-x divide-gray-200">
        {items.map((item) => (
          <div key={item.label} className="px-6 py-4 flex-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {item.label}
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Mobile: 2-column grid */}
      <div className="grid grid-cols-2 sm:hidden">
        {items.map((item, idx) => (
          <div
            key={item.label}
            className={`px-6 py-4 ${idx % 2 === 1 ? 'border-l border-gray-200' : ''} ${idx >= 2 ? 'border-t border-gray-200' : ''}`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {item.label}
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
