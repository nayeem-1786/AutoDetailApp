'use client';

import { cn } from '@/lib/utils/cn';

interface PeriodSelectorProps {
  value: string;
  onChange: (period: string) => void;
}

const PERIODS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' },
] as const;

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white shadow-sm">
      {PERIODS.map((period, index) => (
        <button
          key={period.value}
          type="button"
          onClick={() => onChange(period.value)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium transition-colors',
            index === 0 && 'rounded-l-lg',
            index === PERIODS.length - 1 && 'rounded-r-lg',
            index > 0 && 'border-l border-gray-200',
            value === period.value
              ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
