'use client';

import { useTicket } from '../context/ticket-context';

export function TicketTotals() {
  const { ticket } = useTicket();

  return (
    <div className="space-y-1 border-t border-gray-200 pt-3">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span className="tabular-nums">${ticket.subtotal.toFixed(2)}</span>
      </div>

      {ticket.taxAmount > 0 && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>Tax</span>
          <span className="tabular-nums">${ticket.taxAmount.toFixed(2)}</span>
        </div>
      )}

      {ticket.coupon && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Coupon ({ticket.coupon.code})</span>
          <span className="tabular-nums">
            -${ticket.coupon.discount.toFixed(2)}
          </span>
        </div>
      )}

      {ticket.loyaltyDiscount > 0 && (
        <div className="flex justify-between text-sm text-amber-600">
          <span>Loyalty ({ticket.loyaltyPointsToRedeem} pts)</span>
          <span className="tabular-nums">
            -${ticket.loyaltyDiscount.toFixed(2)}
          </span>
        </div>
      )}

      {ticket.manualDiscount && (
        <div className="flex justify-between text-sm text-red-600">
          <span>
            {ticket.manualDiscount.label || 'Discount'} (
            {ticket.manualDiscount.type === 'percent'
              ? `${ticket.manualDiscount.value}%`
              : `$${ticket.manualDiscount.value.toFixed(2)}`}
            )
          </span>
          <span className="tabular-nums">
            -$
            {ticket.manualDiscount.type === 'percent'
              ? (ticket.subtotal * ticket.manualDiscount.value / 100).toFixed(2)
              : ticket.manualDiscount.value.toFixed(2)}
          </span>
        </div>
      )}

      <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
        <span>Total</span>
        <span className="tabular-nums">${ticket.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
