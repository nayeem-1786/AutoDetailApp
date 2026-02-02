'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils/format';

interface CashCountFormProps {
  onTotalChange: (total: number) => void;
}

const denominations = [
  { label: '$100', value: 100 },
  { label: '$50', value: 50 },
  { label: '$20', value: 20 },
  { label: '$10', value: 10 },
  { label: '$5', value: 5 },
  { label: '$1', value: 1 },
  { label: '25\u00a2', value: 0.25 },
  { label: '10\u00a2', value: 0.10 },
  { label: '5\u00a2', value: 0.05 },
  { label: '1\u00a2', value: 0.01 },
] as const;

type DenominationCounts = Record<number, number>;

function buildInitialCounts(): DenominationCounts {
  const counts: DenominationCounts = {};
  for (const d of denominations) {
    counts[d.value] = 0;
  }
  return counts;
}

export function CashCountForm({ onTotalChange }: CashCountFormProps) {
  const [counts, setCounts] = useState<DenominationCounts>(buildInitialCounts);

  const total = denominations.reduce(
    (sum, d) => sum + (counts[d.value] || 0) * d.value,
    0
  );

  // Round to avoid floating point drift
  const roundedTotal = Math.round(total * 100) / 100;

  useEffect(() => {
    onTotalChange(roundedTotal);
  }, [roundedTotal, onTotalChange]);

  const handleCountChange = useCallback((value: number, count: string) => {
    const parsed = parseInt(count, 10);
    setCounts((prev) => ({
      ...prev,
      [value]: isNaN(parsed) || parsed < 0 ? 0 : parsed,
    }));
  }, []);

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[4rem_5rem_1fr] items-center gap-2 px-1 text-xs font-medium text-gray-500">
        <span>Denom</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Subtotal</span>
      </div>

      {/* Denomination rows */}
      {denominations.map((d) => {
        const subtotal = (counts[d.value] || 0) * d.value;
        const roundedSubtotal = Math.round(subtotal * 100) / 100;
        return (
          <div
            key={d.value}
            className="grid grid-cols-[4rem_5rem_1fr] items-center gap-2 px-1 py-0.5"
          >
            <span className="text-sm font-medium text-gray-700">
              {d.label}
            </span>
            <Input
              type="number"
              min={0}
              step={1}
              value={counts[d.value] || ''}
              onChange={(e) => handleCountChange(d.value, e.target.value)}
              className="h-8 w-20 text-center tabular-nums"
            />
            <span className="text-right text-sm tabular-nums text-gray-600">
              {formatCurrency(roundedSubtotal)}
            </span>
          </div>
        );
      })}

      {/* Total */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-200 px-1 pt-3">
        <span className="text-sm font-bold text-gray-900">Total</span>
        <span className="text-lg font-bold tabular-nums text-gray-900">
          {formatCurrency(roundedTotal)}
        </span>
      </div>
    </div>
  );
}
