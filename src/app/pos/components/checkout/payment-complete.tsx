'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CheckCircle2, CloudOff, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCheckout } from '../../context/checkout-context';
import { ReceiptOptions } from '../receipt-options';
import { ApplyCreditDialog } from './apply-credit-dialog';

export function PaymentComplete() {
  const checkout = useCheckout();
  const router = useRouter();
  const pathname = usePathname();
  const isOfflineTx = checkout.transactionId?.startsWith('offline-');
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  // Phase 3 Theme E.3 — credit application surfaces only for synced (non-offline)
  // transactions with an attached customer. Offline transactions can't apply
  // credit safely because the credit ledger lives server-side.
  const canApplyCredit =
    !isOfflineTx && !!checkout.transactionId && !!checkout.customerId;

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-8 py-12">
      <CheckCircle2 className="h-20 w-20 text-green-500 dark:text-green-400" />

      <div className="text-center">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">Payment Complete</p>
        {checkout.receiptNumber && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Receipt #{checkout.receiptNumber}
          </p>
        )}
        {isOfflineTx && (
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400">
            <CloudOff className="h-3.5 w-3.5" />
            <span>Saved offline — will sync when reconnected</span>
          </div>
        )}
      </div>

      {/* Payment summary */}
      <div className="w-full max-w-xs space-y-2 rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
        {checkout.paymentMethod === 'cash' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Tendered</span>
              <span className="tabular-nums">
                ${checkout.cashTendered.toFixed(2)}
              </span>
            </div>
            {checkout.cashChange > 0 && (
              <div className="flex justify-between text-sm font-medium text-green-700 dark:text-green-400">
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
            <span className="text-gray-500 dark:text-gray-400">Card</span>
            <span className="tabular-nums">Approved</span>
          </div>
        )}

        {checkout.paymentMethod === 'check' && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Check</span>
            <span className="tabular-nums">Received</span>
          </div>
        )}

        {checkout.paymentMethod === 'split' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Cash</span>
              <span className="tabular-nums">
                ${checkout.cashPortion.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Card</span>
              <span className="tabular-nums">
                ${checkout.cardPortion.toFixed(2)}
              </span>
            </div>
          </>
        )}

        {checkout.tipAmount > 0 && (
          <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Tip</span>
            <span className="tabular-nums">
              ${checkout.tipAmount.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Receipt delivery — skip for offline transactions (not synced yet) */}
      {checkout.transactionId && !isOfflineTx && (
        <ReceiptOptions
          transactionId={checkout.transactionId}
          customerEmail={checkout.customerEmail}
          customerPhone={checkout.customerPhone}
        />
      )}

      {/* Phase 3 Theme E.3 — Apply customer credit (AC-15). Calls E.2's
          endpoint, which records the credit consumption against this
          transaction's ledger row. */}
      {canApplyCredit && (
        <Button
          variant="outline"
          onClick={() => setCreditDialogOpen(true)}
          className="gap-2"
        >
          <Wallet className="h-4 w-4" />
          Apply Customer Credit
        </Button>
      )}

      {canApplyCredit && checkout.customerId && checkout.transactionId && (
        <ApplyCreditDialog
          open={creditDialogOpen}
          onOpenChange={setCreditDialogOpen}
          customerId={checkout.customerId}
          transactionId={checkout.transactionId}
        />
      )}

      {/* New ticket */}
      <Button
        size="lg"
        onClick={() => {
          checkout.closeCheckout();
          if (pathname !== '/pos') {
            router.push('/pos');
          }
        }}
        className="min-w-[200px] bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
      >
        New Ticket
      </Button>
    </div>
  );
}
