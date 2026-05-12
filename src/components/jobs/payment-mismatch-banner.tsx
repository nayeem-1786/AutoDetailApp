'use client';

import { AlertTriangle, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Phase Mobile-1.9 — non-blocking warning surfaced after a mobile-fields
 * edit when the recomputed `appointment.total_amount` no longer matches
 * the customer's paid amount.
 *
 * Informational only (LOCKED-3 Phase 1.9). The admin reconciles via
 * existing refund / send-payment-link flows. The banner doesn't trigger
 * any side effect; the dismiss `X` just hides it locally.
 *
 * `mismatchAmount` semantics (signed delta of new_total - paid):
 *   - positive → customer owes more (charge them)
 *   - negative → customer overpaid (refund them)
 *   - zero    → balanced; banner should not render at all
 */

export interface PaymentMismatchBannerProps {
  mismatchAmount: number;
  newTotal: number;
  paidAmount: number;
  onDismiss: () => void;
}

export function PaymentMismatchBanner({
  mismatchAmount,
  newTotal,
  paidAmount,
  onDismiss,
}: PaymentMismatchBannerProps) {
  if (Math.abs(mismatchAmount) < 0.005) return null;

  const direction =
    mismatchAmount > 0
      ? 'may need to be charged'
      : 'may need to be refunded';
  const absDiff = Math.abs(mismatchAmount);

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Payment mismatch
          </p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-300">
            This job&apos;s total is now {formatCurrency(newTotal)}. Customer
            has paid {formatCurrency(paidAmount)}. The difference of{' '}
            <span className="font-medium">{formatCurrency(absDiff)}</span>{' '}
            {direction} separately.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
