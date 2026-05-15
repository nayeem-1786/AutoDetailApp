'use client';

import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface SummaryData {
  totalRecipients: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number;
  totalClicks: number;
  uniqueClicks: number;
  clickThroughRate: number;
  totalOptedOut: number;
  attributedRevenue: number;
  attributedTransactions: number;
  attributedCustomers: number;
}

interface CampaignSummaryCardsProps {
  data: SummaryData;
  loading: boolean;
}

function rateColor(rate: number, thresholds: { good: number; warn: number }, invert = false): string {
  if (invert) {
    if (rate < thresholds.good) return 'text-green-600';
    if (rate < thresholds.warn) return 'text-amber-600';
    return 'text-red-600';
  }
  if (rate > thresholds.good) return 'text-green-600';
  if (rate > thresholds.warn) return 'text-amber-600';
  return 'text-red-600';
}

const cards = [
  { key: 'recipients', label: 'Recipients', border: 'border-l-blue-500' },
  { key: 'delivered', label: 'Delivered', border: 'border-l-green-500' },
  { key: 'clicked', label: 'Clicked', border: 'border-l-purple-500' },
  { key: 'optedOut', label: 'Opted Out', border: 'border-l-amber-500' },
  { key: 'revenue', label: 'Revenue', border: 'border-l-teal-500' },
] as const;

export function CampaignSummaryCards({ data, loading }: CampaignSummaryCardsProps) {
  function getValue(key: string): string {
    switch (key) {
      case 'recipients': return (data.totalRecipients ?? 0).toLocaleString();
      case 'delivered': return (data.totalDelivered ?? 0).toLocaleString();
      case 'clicked': return (data.uniqueClicks ?? 0).toLocaleString();
      case 'optedOut': return (data.totalOptedOut ?? 0).toLocaleString();
      case 'revenue': return formatCurrency(data.attributedRevenue ?? 0);
      default: return '0';
    }
  }

  function getSubtext(key: string): string | null {
    switch (key) {
      case 'delivered': return `${(data.deliveryRate ?? 0).toFixed(1)}% rate`;
      case 'clicked': return `${(data.clickThroughRate ?? 0).toFixed(1)}% CTR`;
      case 'revenue': return `${data.attributedCustomers ?? 0} customers`;
      default: return null;
    }
  }

  function getValueColor(key: string): string {
    switch (key) {
      case 'delivered': return rateColor(data.deliveryRate ?? 0, { good: 95, warn: 90 });
      case 'optedOut': return rateColor(data.totalOptedOut ?? 0, { good: 1, warn: 3 }, true);
      default: return 'text-gray-900';
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 ${card.border}`}
        >
          <p className="text-xs font-medium uppercase text-gray-500">{card.label}</p>
          {loading ? (
            <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
          ) : (
            <>
              <p className={cn('text-2xl font-bold tabular-nums mt-1', getValueColor(card.key))}>
                {getValue(card.key)}
              </p>
              {getSubtext(card.key) && (
                <p className="text-xs text-gray-500 mt-1">{getSubtext(card.key)}</p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
