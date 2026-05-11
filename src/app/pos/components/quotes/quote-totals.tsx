'use client';

import { useQuote } from '../../context/quote-context';

export function QuoteTotals() {
  const { quote } = useQuote();

  // Subtotal includes mobile surcharge (matches appointments convention +
  // transactions.subtotal). The mobile fee is rendered on its own line above
  // Subtotal so the breakdown reads naturally: items + mobile = subtotal.
  const itemsSubtotal = quote.mobile?.isMobile && quote.mobile.surcharge > 0
    ? Math.max(0, quote.subtotal - quote.mobile.surcharge)
    : quote.subtotal;

  return (
    <div className="space-y-1 border-t border-gray-200 dark:border-gray-700 pt-3">
      {quote.mobile?.isMobile && quote.mobile.surcharge > 0 && (
        <>
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Items</span>
            <span className="tabular-nums">${itemsSubtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>{quote.mobile.zoneNameSnapshot || 'Mobile Service Fee'}</span>
            <span className="tabular-nums">${quote.mobile.surcharge.toFixed(2)}</span>
          </div>
        </>
      )}

      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>Subtotal</span>
        <span className="tabular-nums">${quote.subtotal.toFixed(2)}</span>
      </div>

      {quote.taxAmount > 0 && (
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>Tax</span>
          <span className="tabular-nums">${quote.taxAmount.toFixed(2)}</span>
        </div>
      )}

      {quote.coupon && (
        <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
          <span>Coupon ({quote.coupon.code})</span>
          <span className="tabular-nums">
            -${quote.coupon.discount.toFixed(2)}
          </span>
        </div>
      )}

      {quote.loyaltyDiscount > 0 && (
        <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400">
          <span>Loyalty ({quote.loyaltyPointsToRedeem} pts)</span>
          <span className="tabular-nums">
            -${quote.loyaltyDiscount.toFixed(2)}
          </span>
        </div>
      )}

      {quote.manualDiscount && (
        <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
          <span>
            {quote.manualDiscount.label || 'Discount'} (
            {quote.manualDiscount.type === 'percent'
              ? `${quote.manualDiscount.value}%`
              : `$${quote.manualDiscount.value.toFixed(2)}`}
            )
          </span>
          <span className="tabular-nums">
            -$
            {quote.manualDiscount.type === 'percent'
              ? (quote.subtotal * quote.manualDiscount.value / 100).toFixed(2)
              : quote.manualDiscount.value.toFixed(2)}
          </span>
        </div>
      )}

      <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
        <span>Total</span>
        <span className="tabular-nums">${quote.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
