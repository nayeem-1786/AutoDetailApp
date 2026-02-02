'use client';

import { Banknote, CreditCard, Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';

export function PaymentMethodScreen() {
  const { ticket } = useTicket();
  const { tipAmount, setPaymentMethod, setStep } = useCheckout();

  const grandTotal = ticket.total + tipAmount;

  function handleSelect(method: 'cash' | 'card' | 'split') {
    setPaymentMethod(method);
    setStep(method);
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500">Payment method</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          ${grandTotal.toFixed(2)}
        </p>
        {tipAmount > 0 && (
          <p className="mt-1 text-sm text-gray-400">
            includes ${tipAmount.toFixed(2)} tip
          </p>
        )}
      </div>

      <div className="flex gap-6">
        <button
          onClick={() => handleSelect('cash')}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 transition-all',
            'hover:border-green-400 hover:bg-green-50 active:scale-[0.97]'
          )}
        >
          <Banknote className="h-8 w-8 text-green-600" />
          <span className="text-lg font-semibold text-gray-900">Cash</span>
        </button>

        <button
          onClick={() => handleSelect('card')}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 transition-all',
            'hover:border-blue-400 hover:bg-blue-50 active:scale-[0.97]'
          )}
        >
          <CreditCard className="h-8 w-8 text-blue-600" />
          <span className="text-lg font-semibold text-gray-900">Card</span>
        </button>

        <button
          onClick={() => handleSelect('split')}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 transition-all',
            'hover:border-purple-400 hover:bg-purple-50 active:scale-[0.97]'
          )}
        >
          <Split className="h-8 w-8 text-purple-600" />
          <span className="text-lg font-semibold text-gray-900">Split</span>
        </button>
      </div>

      <Button
        variant="outline"
        onClick={() => setStep('tip')}
        className="mt-4"
      >
        Back
      </Button>
    </div>
  );
}
