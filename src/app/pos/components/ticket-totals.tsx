'use client';

import { X } from 'lucide-react';
import { useTicket } from '../context/ticket-context';

function formatDepositLabel(depositDate: string | null): string {
  if (!depositDate) return 'Deposit Paid - Online';
  const formatted = new Date(depositDate).toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
  return `Deposit Paid - Online on ${formatted}`;
}

export function TicketTotals() {
  const { ticket, dispatch } = useTicket();

  return (
    <div className="space-y-1 border-t border-gray-200 dark:border-gray-700 pt-3">
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>Subtotal <span className="text-xs text-gray-400 dark:text-gray-500">(+${ticket.taxAmount.toFixed(2)} tax)</span></span>
        <span className="tabular-nums">${ticket.subtotal.toFixed(2)}</span>
      </div>

      {ticket.coupon && (
        <div className="flex items-center justify-between text-sm text-green-600 dark:text-green-400">
          <div className="flex items-center gap-1">
            <span>Coupon ({ticket.coupon.code})</span>
            {ticket.coupon.isAutoApplied && (
              <span className="text-[10px]">(auto)</span>
            )}
            <button
              onClick={() => dispatch({ type: 'SET_COUPON', coupon: null })}
              className="ml-1 rounded p-0.5 text-green-400 dark:text-green-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/40"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <span className="tabular-nums">
            -${ticket.coupon.discount.toFixed(2)}
          </span>
        </div>
      )}

      {ticket.loyaltyDiscount > 0 && (
        <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400">
          <span>Loyalty ({ticket.loyaltyPointsToRedeem} pts)</span>
          <span className="tabular-nums">
            -${ticket.loyaltyDiscount.toFixed(2)}
          </span>
        </div>
      )}

      {ticket.manualDiscount && (
        <div className="flex items-center justify-between text-sm text-red-600 dark:text-red-400">
          <div className="flex items-center gap-1">
            <span>
              {ticket.manualDiscount.label || 'Discount'} (
              {ticket.manualDiscount.type === 'percent'
                ? `${ticket.manualDiscount.value}%`
                : `$${ticket.manualDiscount.value.toFixed(2)}`}
              )
            </span>
            <button
              onClick={() => dispatch({ type: 'REMOVE_MANUAL_DISCOUNT' })}
              className="ml-1 rounded p-0.5 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <span className="tabular-nums">
            -$
            {ticket.manualDiscount.type === 'percent'
              ? (ticket.subtotal * ticket.manualDiscount.value / 100).toFixed(2)
              : ticket.manualDiscount.value.toFixed(2)}
          </span>
        </div>
      )}

      {ticket.depositCredit > 0 && (
        <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
          <span>{formatDepositLabel(ticket.depositDate)}</span>
          <span className="tabular-nums">-${ticket.depositCredit.toFixed(2)}</span>
        </div>
      )}

      <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
        <span>{ticket.depositCredit > 0 ? 'Balance Due' : 'Total'}</span>
        <span className="tabular-nums">${ticket.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
