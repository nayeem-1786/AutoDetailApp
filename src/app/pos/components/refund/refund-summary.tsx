'use client';

import { Loader2, RotateCcw, AlertTriangle, UserCheck, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TransactionItem } from '@/lib/supabase/types';
import { fromCents, toCents } from '@/lib/utils/refund-math';
import type { RefundDisposition } from '@/lib/utils/validation';
import type { AllItemsDisposition } from './refund-dialog';
import { walkLifoAllocation, type SourceEntry } from '@/lib/refunds/source-plan';
import { formatReceiptDateTime } from '@/lib/utils/format';

interface RefundSummaryProps {
  items: Array<{
    item: TransactionItem;
    quantity: number;
    amountCents: number;
    disposition: RefundDisposition | null;
  }>;
  tipRefund?: number;
  reason: string;
  processing: boolean;
  onConfirm: () => void;
  loyaltyPointsRedeemed?: number;
  loyaltyPointsEarned?: number;
  couponCode?: string | null;
  allDisposition: AllItemsDisposition;
  onAllDispositionChange: (d: AllItemsDisposition) => void;
  hasProductItems: boolean;
  onDispositionChange: (itemId: string, disposition: RefundDisposition) => void;
  /** LIFO source plan from /api/pos/refunds/source-plan/[id]. Empty for
   * walk-in transactions and appointment-linked rows with no siblings —
   * the "Refund will be issued from:" section is hidden in those cases. */
  sourcePlan?: SourceEntry[];
}

const DISPOSITION_OPTIONS: {
  value: AllItemsDisposition;
  label: string;
  description: string;
  icon: typeof RotateCcw;
}[] = [
  {
    value: 'restock',
    label: 'Restock all',
    description: 'Put all refunded products back on the shelf',
    icon: RotateCcw,
  },
  {
    value: 'damaged',
    label: 'Damaged all',
    description: 'None are resellable — write off',
    icon: AlertTriangle,
  },
  {
    value: 'customer_retained',
    label: 'Customer kept all',
    description: 'Customer retained the items (goodwill refund)',
    icon: UserCheck,
  },
  {
    value: 'mixed',
    label: 'Mixed',
    description: 'Choose per line item below',
    icon: Shuffle,
  },
];

const DISPOSITION_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  restock: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', label: 'restock' },
  damaged: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', label: 'damaged' },
  customer_retained: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', label: 'kept' },
};

const PER_LINE_DISPOSITIONS: { value: RefundDisposition; label: string }[] = [
  { value: 'restock', label: 'Restock' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'customer_retained', label: 'Kept' },
];

export function RefundSummary({
  items,
  tipRefund = 0,
  reason,
  processing,
  onConfirm,
  loyaltyPointsRedeemed = 0,
  loyaltyPointsEarned = 0,
  couponCode,
  allDisposition,
  onAllDispositionChange,
  hasProductItems,
  onDispositionChange,
  sourcePlan,
}: RefundSummaryProps) {
  const itemsTotalCents = items.reduce(
    (sum, entry) => sum + entry.amountCents,
    0
  );
  const totalCents = itemsTotalCents + toCents(tipRefund);
  const totalAmount = fromCents(totalCents);

  // LIFO allocation across sibling sources. Recomputes on every selection
  // change so the displayed rows match what the server will actually do.
  // Empty allocation when no source plan (walk-in / no siblings) — section
  // hidden below.
  const allocation = (sourcePlan && sourcePlan.length > 0)
    ? walkLifoAllocation(sourcePlan, totalCents)
    : [];

  // Disposition readiness check
  const dispositionReady = !hasProductItems || (
    allDisposition !== null &&
    (allDisposition !== 'mixed' ||
      items.every(
        (e) => e.item.item_type !== 'product' || e.disposition !== null
      ))
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Refund Summary</h3>

      {/* Item list */}
      <div className="space-y-2">
        {items.map((entry) => {
          const isProduct = entry.item.item_type === 'product';
          const resolvedDisposition =
            !isProduct
              ? null
              : allDisposition && allDisposition !== 'mixed'
                ? allDisposition
                : entry.disposition;
          const badge = resolvedDisposition ? DISPOSITION_BADGE[resolvedDisposition] : null;
          const showPerLineRadio = isProduct && allDisposition === 'mixed';

          return (
            <div key={entry.item.id}>
              <div className="flex items-center justify-between text-sm">
                <div className="min-w-0 flex-1">
                  <span className="text-gray-700 dark:text-gray-300">{entry.item.item_name}</span>
                  <span className="ml-1.5 text-gray-400 dark:text-gray-500">x{entry.quantity}</span>
                  {badge && (
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-medium tabular-nums text-gray-900 dark:text-gray-100">
                  ${fromCents(entry.amountCents).toFixed(2)}
                </span>
              </div>
              {/* Per-line disposition radio — only for products in mixed mode */}
              {showPerLineRadio && (
                <div className="mt-1.5 flex items-center gap-3 pl-1">
                  {PER_LINE_DISPOSITIONS.map(({ value, label }) => (
                    <label key={value} className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name={`disposition-${entry.item.id}`}
                        checked={entry.disposition === value}
                        onChange={() => onDispositionChange(entry.item.id, value)}
                        className="h-3.5 w-3.5 border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

      {/* "Refund will be issued from:" — appointment-linked sources only.
          LIFO order (most recent payment first), recomputed on every
          selection change via walkLifoAllocation in shared source-plan. */}
      {allocation.length > 0 && (
        <div className="space-y-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
            Refund will be issued from:
          </p>
          {allocation.map((row) => (
            <div
              key={row.transaction_id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-blue-600 dark:text-blue-400 truncate pr-2">
                {row.source_label} - {formatReceiptDateTime(row.newest_paid_at)}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-blue-700 dark:text-blue-300">
                -${(row.amount_cents / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Disposition picker — only when there are product items */}
      {hasProductItems && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            What should happen to these items?
          </p>
          <div className="space-y-1.5">
            {DISPOSITION_OPTIONS.map(({ value, label, description, icon: Icon }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  allDisposition === value
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="all-disposition"
                  checked={allDisposition === value}
                  onChange={() => onAllDispositionChange(value)}
                  className="h-4 w-4 border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
                <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

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
        disabled={processing || items.length === 0 || !dispositionReady}
        onClick={onConfirm}
        title={!dispositionReady ? 'Choose a disposition for refunded items' : undefined}
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
