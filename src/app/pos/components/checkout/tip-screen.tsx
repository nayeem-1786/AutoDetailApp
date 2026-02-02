'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { TIP_PRESETS } from '@/lib/utils/constants';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';

export function TipScreen() {
  const { ticket } = useTicket();
  const { setTip, setStep } = useCheckout();
  const [selected, setSelected] = useState<number | 'custom' | 'none' | null>(
    null
  );
  const [customAmount, setCustomAmount] = useState('');

  const subtotal = ticket.subtotal;

  function getTipAmount(): number {
    if (selected === 'none') return 0;
    if (selected === 'custom') {
      const val = parseFloat(customAmount);
      return isNaN(val) ? 0 : Math.round(val * 100) / 100;
    }
    if (typeof selected === 'number') {
      return Math.round(subtotal * (selected / 100) * 100) / 100;
    }
    return 0;
  }

  function handleContinue() {
    const amount = getTipAmount();
    const percent =
      typeof selected === 'number' ? selected : null;
    setTip(amount, percent);
    setStep('payment-method');
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500">Add a tip?</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          ${ticket.total.toFixed(2)}
        </p>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-4">
        {TIP_PRESETS.map((pct) => {
          const amt = Math.round(subtotal * (pct / 100) * 100) / 100;
          return (
            <button
              key={pct}
              onClick={() => {
                setSelected(pct);
                setCustomAmount('');
              }}
              className={cn(
                'flex h-24 w-24 flex-col items-center justify-center rounded-xl border-2 transition-all',
                selected === pct
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              )}
            >
              <span className="text-xl font-bold">{pct}%</span>
              <span className="text-sm text-gray-500">${amt.toFixed(2)}</span>
            </button>
          );
        })}

        {/* Custom */}
        <button
          onClick={() => setSelected('custom')}
          className={cn(
            'flex h-24 w-24 flex-col items-center justify-center rounded-xl border-2 transition-all',
            selected === 'custom'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-700 hover:border-gray-300'
          )}
        >
          <span className="text-xl font-bold">$</span>
          <span className="text-sm text-gray-500">Custom</span>
        </button>
      </div>

      {/* Custom input */}
      {selected === 'custom' && (
        <div className="flex items-center gap-2">
          <span className="text-lg text-gray-500">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="h-12 w-32 rounded-lg border border-gray-300 text-center text-xl focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="0.00"
          />
        </div>
      )}

      {/* Tip display */}
      {selected != null && selected !== 'none' && (
        <p className="text-lg text-gray-600">
          Tip: <span className="font-semibold">${getTipAmount().toFixed(2)}</span>
          {' '}— Total:{' '}
          <span className="font-bold text-gray-900">
            ${(ticket.total + getTipAmount()).toFixed(2)}
          </span>
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            setSelected('none');
            setTip(0, null);
            setStep('payment-method');
          }}
          className="min-w-[140px]"
        >
          No Tip
        </Button>
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={selected === null}
          className="min-w-[140px] bg-green-600 hover:bg-green-700"
        >
          Continue
        </Button>
      </div>

      <p className="text-xs text-gray-400">
        5% CC processing fee on card tips (informational)
      </p>
    </div>
  );
}
