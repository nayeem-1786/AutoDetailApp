'use client';

import { useQuote } from '../../context/quote-context';

export function QuoteTotals() {
  const { quote } = useQuote();

  return (
    <div className="space-y-1 border-t border-gray-200 pt-3">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span className="tabular-nums">${quote.subtotal.toFixed(2)}</span>
      </div>

      {quote.taxAmount > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>Tax</span>
          <span className="tabular-nums">${quote.taxAmount.toFixed(2)}</span>
        </div>
      )}

      {quote.coupon && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Coupon ({quote.coupon.code})</span>
          <span className="tabular-nums">
            -${quote.coupon.discount.toFixed(2)}
          </span>
        </div>
      )}

      {quote.loyaltyDiscount > 0 && (
        <div className="flex justify-between text-sm text-amber-600">
          <span>Loyalty ({quote.loyaltyPointsToRedeem} pts)</span>
          <span className="tabular-nums">
            -${quote.loyaltyDiscount.toFixed(2)}
          </span>
        </div>
      )}

      {quote.manualDiscount && (
        <div className="flex justify-between text-sm text-red-600">
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

      <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
        <span>Total</span>
        <span className="tabular-nums">${quote.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
