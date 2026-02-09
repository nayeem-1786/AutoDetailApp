'use client';

import { formatCurrency } from '@/lib/utils/format';
import { Info } from 'lucide-react';

interface RevenueStatsProps {
  revenue: number;
  transactionCount: number;
  avgTicket: number;
  tips: number;
  newCustomers: number;
  winBacks: number;
  loading: boolean;
}

const cards = [
  { key: 'revenue', label: 'Revenue', border: 'border-l-green-500', isCurrency: true },
  { key: 'transactions', label: 'Transactions', border: 'border-l-blue-500', isCurrency: false },
  { key: 'avgTicket', label: 'Avg Ticket', border: 'border-l-gray-400', isCurrency: true },
  { key: 'tips', label: 'Tips', border: 'border-l-purple-500', isCurrency: true },
  { key: 'newReturning', label: 'New & Returning', border: 'border-l-amber-500', isCurrency: false },
] as const;

export function RevenueStats({
  revenue,
  transactionCount,
  avgTicket,
  tips,
  newCustomers,
  winBacks,
  loading,
}: RevenueStatsProps) {
  function getValue(key: string): string {
    switch (key) {
      case 'revenue':
        return formatCurrency(revenue);
      case 'transactions':
        return transactionCount.toLocaleString();
      case 'avgTicket':
        return formatCurrency(avgTicket);
      case 'tips':
        return formatCurrency(tips);
      case 'newReturning':
        return (newCustomers + winBacks).toLocaleString();
      default:
        return '0';
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
            {card.key === 'revenue' && (
              <span className="relative inline-block ml-1 align-middle group">
                <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                <span className="pointer-events-none absolute bottom-full left-0 mb-2 z-[60] hidden w-max max-w-[250px] rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case text-white shadow-lg group-hover:block">
                  Total revenue from all transactions in the selected period, including anonymous walk-ins without a customer profile.
                </span>
              </span>
            )}
          </p>
          {loading ? (
            <div className="h-8 w-24 rounded bg-gray-200 animate-pulse mt-1" />
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
                {getValue(card.key)}
              </p>
              {card.key === 'newReturning' && (
                <p className="text-xs text-gray-500 mt-1">
                  {newCustomers} new &middot; {winBacks} win-backs
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
