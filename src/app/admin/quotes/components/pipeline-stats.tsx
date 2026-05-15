'use client';

import { QUOTE_STATUS_LABELS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface PipelineStatsProps {
  stats: Array<{ status: string; count: number; totalAmount: number }>;
  activeStatus: string | null;
  onStatusClick: (status: string | null) => void;
}

const STATUS_BORDER_COLOR: Record<string, string> = {
  draft: 'border-l-gray-400',
  sent: 'border-l-blue-500',
  viewed: 'border-l-amber-500',
  accepted: 'border-l-green-500',
  converted: 'border-l-teal-500',
  expired: 'border-l-red-500',
};

export function PipelineStats({ stats, activeStatus, onStatusClick }: PipelineStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((stat) => {
        const isActive = activeStatus === stat.status;
        return (
          <button
            key={stat.status}
            type="button"
            onClick={() => onStatusClick(isActive ? null : stat.status)}
            className={cn(
              'rounded-lg border border-gray-200 border-l-4 bg-white shadow-sm p-4 text-left cursor-pointer transition-all hover:shadow-md',
              STATUS_BORDER_COLOR[stat.status] ?? 'border-l-gray-400',
              isActive && 'ring-2 ring-offset-1 ring-gray-900'
            )}
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {QUOTE_STATUS_LABELS[stat.status] ?? stat.status}
            </p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{stat.count}</p>
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(stat.totalAmount)}</p>
          </button>
        );
      })}
    </div>
  );
}
