'use client';

import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCheckout } from '../../context/checkout-context';
import { useTicket } from '../../context/ticket-context';
import { ReceiptOptions } from '../receipt-options';

export function PaymentComplete() {
  const checkout = useCheckout();
  const { ticket } = useTicket();

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
      <CheckCircle2 className="h-20 w-20 text-green-500" />

      <div className="text-center">
        <p className="text-2xl font-bold text-gray-900">Payment Complete</p>
        {checkout.receiptNumber && (
          <p className="mt-1 text-sm text-gray-500">
            Receipt #{checkout.receiptNumber}
          </p>
        )}
      </div>

      {/* Payment summary */}
      <div className="w-full max-w-xs space-y-2 rounded-lg bg-gray-50 p-4">
        {checkout.paymentMethod === 'cash' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tendered</span>
              <span className="tabular-nums">
                ${checkout.cashTendered.toFixed(2)}
              </span>
            </div>
            {checkout.cashChange > 0 && (
              <div className="flex justify-between text-sm font-medium text-green-700">
                <span>Change</span>
                <span className="tabular-nums">
                  ${checkout.cashChange.toFixed(2)}
                </span>
              </div>
            )}
          </>
        )}

        {checkout.paymentMethod === 'card' && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Card</span>
            <span className="tabular-nums">Approved</span>
          </div>
        )}

        {checkout.paymentMethod === 'split' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Cash</span>
              <span className="tabular-nums">
                ${checkout.cashPortion.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Card</span>
              <span className="tabular-nums">
                ${checkout.cardPortion.toFixed(2)}
              </span>
            </div>
          </>
        )}

        {checkout.tipAmount > 0 && (
          <div className="flex justify-between border-t border-gray-200 pt-2 text-sm">
            <span className="text-gray-500">Tip</span>
            <span className="tabular-nums">
              ${checkout.tipAmount.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Receipt delivery */}
      {checkout.transactionId && (
        <ReceiptOptions
          transactionId={checkout.transactionId}
          customerEmail={ticket.customer?.email ?? null}
          customerPhone={ticket.customer?.phone ?? null}
        />
      )}

      {/* New ticket */}
      <Button
        size="lg"
        onClick={checkout.closeCheckout}
        className="min-w-[200px] bg-green-600 hover:bg-green-700"
      >
        New Ticket
      </Button>
    </div>
  );
}
