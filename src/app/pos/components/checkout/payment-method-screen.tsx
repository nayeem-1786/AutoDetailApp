'use client';

import { Banknote, CreditCard, FileText, Split, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';

export function PaymentMethodScreen() {
  const { ticket } = useTicket();
  const { setPaymentMethod, setStep, closeCheckout } = useCheckout();
  const isOnline = useOnlineStatus();

  function handleSelect(method: 'cash' | 'card' | 'check' | 'split') {
    setPaymentMethod(method);
    setStep(method);
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">Payment method</p>
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${ticket.total.toFixed(2)}
        </p>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You&apos;re offline — only cash payments are available</span>
        </div>
      )}

      <div className="flex gap-6">
        <button
          onClick={() => handleSelect('cash')}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            'hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 active:scale-[0.97]'
          )}
        >
          <Banknote className="h-8 w-8 text-green-600 dark:text-green-400" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cash</span>
        </button>

        <button
          onClick={() => handleSelect('card')}
          disabled={!isOnline}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            isOnline
              ? 'hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
        >
          <CreditCard className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Card</span>
        </button>

        <button
          onClick={() => handleSelect('check')}
          disabled={!isOnline}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            isOnline
              ? 'hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
        >
          <FileText className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Check</span>
        </button>

        <button
          onClick={() => handleSelect('split')}
          disabled={!isOnline}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            isOnline
              ? 'hover:border-purple-400 hover:bg-purple-50 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
        >
          <Split className="h-8 w-8 text-purple-600" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Split</span>
        </button>
      </div>

      <Button
        variant="outline"
        onClick={closeCheckout}
        className="mt-4"
      >
        Back
      </Button>
    </div>
  );
}
