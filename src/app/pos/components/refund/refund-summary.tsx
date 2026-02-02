'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TransactionItem } from '@/lib/supabase/types';

interface RefundSummaryProps {
  items: Array<{
    item: TransactionItem;
    quantity: number;
    amount: number;
    restock: boolean;
  }>;
  reason: string;
  processing: boolean;
  onConfirm: () => void;
}

export function RefundSummary({
  items,
  reason,
  processing,
  onConfirm,
}: RefundSummaryProps) {
  const totalAmount = items.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-900">Refund Summary</h3>

      {/* Item list */}
      <div className="space-y-2">
        {items.map((entry) => (
          <div
            key={entry.item.id}
            className="flex items-center justify-between text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="text-gray-700">{entry.item.item_name}</span>
              <span className="ml-1.5 text-gray-400">x{entry.quantity}</span>
              {entry.restock && (
                <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                  restock
                </span>
              )}
            </div>
            <span className="shrink-0 font-medium tabular-nums text-gray-900">
              ${entry.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          Total Refund
        </span>
        <span className="text-lg font-bold tabular-nums text-red-600">
          ${totalAmount.toFixed(2)}
        </span>
      </div>

      {/* Reason */}
      {reason && (
        <div className="rounded-md bg-gray-50 px-3 py-2">
          <p className="text-xs font-medium text-gray-500">Reason</p>
          <p className="mt-0.5 text-sm text-gray-700">{reason}</p>
        </div>
      )}

      {/* Confirm button */}
      <Button
        variant="destructive"
        className="w-full"
        disabled={processing || items.length === 0}
        onClick={onConfirm}
      >
        {processing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing Refund...
          </>
        ) : (
          `Confirm Refund — $${totalAmount.toFixed(2)}`
        )}
      </Button>
    </div>
  );
}
