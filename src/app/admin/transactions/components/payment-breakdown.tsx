'use client';

import { formatCurrency } from '@/lib/utils/format';

interface PaymentBreakdownProps {
  methods: Array<{
    method: string;
    total: number;
    count: number;
    percentage: number;
  }>;
  loading: boolean;
}

const METHOD_COLORS: Record<string, string> = {
  card: 'bg-blue-500',
  cash: 'bg-green-500',
  square_gift_card: 'bg-purple-500',
};

const METHOD_DOT_COLORS: Record<string, string> = {
  card: 'bg-blue-500',
  cash: 'bg-green-500',
  square_gift_card: 'bg-purple-500',
};

function formatMethodName(method: string): string {
  switch (method) {
    case 'card':
      return 'Card';
    case 'cash':
      return 'Cash';
    case 'square_gift_card':
      return 'Gift Card';
    default:
      return method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' ');
  }
}

export function PaymentBreakdown({ methods, loading }: PaymentBreakdownProps) {
  const hasData = methods.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-medium uppercase text-gray-500 mb-3">Payment Methods</p>

      {loading ? (
        <div className="h-3 w-full rounded-full bg-gray-200 animate-pulse" />
      ) : !hasData ? (
        <>
          <div className="h-3 w-full rounded-full bg-gray-200" />
          <p className="text-xs text-gray-400 mt-2">No transactions in this period</p>
        </>
      ) : (
        <>
          {/* Segmented bar */}
          <div className="h-3 w-full rounded-full overflow-hidden flex">
            {methods.map((m) => (
              <div
                key={m.method}
                className={`${METHOD_COLORS[m.method] ?? 'bg-gray-400'} transition-all`}
                style={{ width: `${m.percentage}%` }}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3">
            {methods.map((m) => (
              <div key={m.method} className="flex items-center gap-1.5 text-sm text-gray-600">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${METHOD_DOT_COLORS[m.method] ?? 'bg-gray-400'}`}
                />
                <span>{formatMethodName(m.method)}</span>
                <span className="tabular-nums font-medium text-gray-900">
                  {formatCurrency(m.total)}
                </span>
                <span className="text-gray-400">({m.percentage}%)</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
