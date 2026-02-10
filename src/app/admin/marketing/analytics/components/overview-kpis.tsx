'use client';

import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface OverviewData {
  totalSmsSent: number;
  totalEmailSent: number;
  smsDeliveryRate: number;
  emailDeliveryRate: number;
  overallDeliveryRate: number;
  clickThroughRate: number;
  optOutRate: number;
  revenueAttributed: number;
}

interface OverviewKpisProps {
  data: OverviewData;
  loading: boolean;
}

function getDeliveryRateColor(rate: number): string {
  if (rate > 95) return 'text-green-600';
  if (rate > 90) return 'text-amber-600';
  return 'text-red-600';
}

function getOptOutRateColor(rate: number): string {
  if (rate < 1) return 'text-green-600';
  if (rate < 3) return 'text-amber-600';
  return 'text-red-600';
}

const cards = [
  { key: 'totalSent', label: 'Total Sent', border: 'border-l-blue-500' },
  { key: 'deliveryRate', label: 'Delivery Rate', border: 'border-l-green-500' },
  { key: 'clickThroughRate', label: 'Click-Through Rate', border: 'border-l-purple-500' },
  { key: 'optOutRate', label: 'Opt-Out Rate', border: 'border-l-amber-500' },
  { key: 'revenueAttributed', label: 'Revenue Attributed', border: 'border-l-teal-500' },
] as const;

export function OverviewKpis({ data, loading }: OverviewKpisProps) {
  function getValue(key: string): string {
    switch (key) {
      case 'totalSent':
        return (data.totalSmsSent + data.totalEmailSent).toLocaleString();
      case 'deliveryRate':
        return `${data.overallDeliveryRate.toFixed(1)}%`;
      case 'clickThroughRate':
        return `${data.clickThroughRate.toFixed(1)}%`;
      case 'optOutRate':
        return `${data.optOutRate.toFixed(1)}%`;
      case 'revenueAttributed':
        return formatCurrency(data.revenueAttributed);
      default:
        return '0';
    }
  }

  function getValueColor(key: string): string {
    switch (key) {
      case 'deliveryRate':
        return getDeliveryRateColor(data.overallDeliveryRate);
      case 'optOutRate':
        return getOptOutRateColor(data.optOutRate);
      default:
        return 'text-gray-900';
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 ${card.border}`}
        >
          <p className="text-xs font-medium uppercase text-gray-500">
            {card.label}
          </p>
          {loading ? (
            <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
          ) : (
            <>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums mt-1',
                  getValueColor(card.key)
                )}
              >
                {getValue(card.key)}
              </p>
              {card.key === 'totalSent' && (
                <p className="text-xs text-gray-500 mt-1">
                  {data.totalSmsSent.toLocaleString()} SMS &middot; {data.totalEmailSent.toLocaleString()} Email
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
