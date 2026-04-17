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
  tipRefund?: number;
  reason: string;
  processing: boolean;
  onConfirm: () => void;
  loyaltyPointsRedeemed?: number;
  loyaltyPointsEarned?: number;
  couponCode?: string | null;
}

export function RefundSummary({
  items,
  tipRefund = 0,
  reason,
  processing,
  onConfirm,
  loyaltyPointsRedeemed = 0,
  loyaltyPointsEarned = 0,
  couponCode,
}: RefundSummaryProps) {
  const itemsTotal = items.reduce((sum, entry) => sum + entry.amount, 0);
  const totalAmount = Math.round((itemsTotal + tipRefund) * 100) / 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Refund Summary</h3>

      {/* Item list */}
      <div className="space-y-2">
        {items.map((entry) => (
          <div
            key={entry.item.id}
            className="flex items-center justify-between text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="text-gray-700 dark:text-gray-300">{entry.item.item_name}</span>
              <span className="ml-1.5 text-gray-400 dark:text-gray-500">x{entry.quantity}</span>
              {entry.restock && (
                <span className="ml-2 rounded bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                  restock
                </span>
              )}
            </div>
            <span className="shrink-0 font-medium tabular-nums text-gray-900 dark:text-gray-100">
              ${entry.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Tip line */}
      {tipRefund > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700 dark:text-gray-300">Tip refund</span>
          <span className="shrink-0 font-medium tabular-nums text-gray-900 dark:text-gray-100">
            ${tipRefund.toFixed(2)}
          </span>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Total Refund
        </span>
        <span className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
          ${totalAmount.toFixed(2)}
        </span>
      </div>

      {/* Loyalty + coupon reversal info */}
      {(loyaltyPointsRedeemed > 0 || loyaltyPointsEarned > 0 || couponCode) && (
        <div className="space-y-1 rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Also reversed:</p>
          {loyaltyPointsRedeemed > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Loyalty points restored: +{loyaltyPointsRedeemed} pts
            </p>
          )}
          {loyaltyPointsEarned > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Loyalty points clawed back: -{loyaltyPointsEarned} pts
            </p>
          )}
          {couponCode && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Coupon usage reversed: {couponCode}
            </p>
          )}
        </div>
      )}

      {/* Reason */}
      {reason && (
        <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Reason</p>
          <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{reason}</p>
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
