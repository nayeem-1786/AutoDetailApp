'use client';

import { X } from 'lucide-react';
import { useTicket } from '../context/ticket-context';
import { formatReceiptDateTime } from '@/lib/utils/format';

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
  const hasPriorPayments = ticket.priorPayments.length > 0;

  return (
    <div className="space-y-1 border-t border-gray-200 dark:border-gray-700 pt-3">
      {/* Payments Received — itemized prior payments hitting this appointment.
          Rendered ABOVE Subtotal so the customer/staff first see "what's
          already been paid", then the bill builds up to the Balance Due. */}
      {hasPriorPayments && (
        <div className="space-y-1 pb-2 mb-1 border-b border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Payments Received
          </div>
          {ticket.priorPayments.map((p, i) => (
            <div
              key={`${p.paid_at}-${i}`}
              className="flex justify-between text-sm text-blue-600 dark:text-blue-400"
            >
              <span className="truncate pr-2">
                {p.source_label} · {formatReceiptDateTime(p.paid_at)}
              </span>
              <span className="tabular-nums shrink-0">
                -${(p.amount_cents / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>Subtotal</span>
        <span className="tabular-nums">${ticket.subtotal.toFixed(2)}</span>
      </div>

      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>Tax</span>
        <span className="tabular-nums">${ticket.taxAmount.toFixed(2)}</span>
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

      {/* Balance Due — always rendered, even at $0.00. Staff need to see the
          explicit "Balance Due: $0.00" so they know nothing is owed. The label
          flips to "Balance Due" whenever any pre-payment (deposit OR pay-link
          OR booking-paid-in-full) has been applied; otherwise it's "Total". */}
      <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
        <span>
          {ticket.depositCredit > 0 || hasPriorPayments ? 'Balance Due' : 'Total'}
        </span>
        <span className="tabular-nums">${ticket.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
