'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { fromCents, toCents } from '@/lib/utils/refund-math';

// Mirrors STRIPE_MIN_AMOUNT_CENTS in src/app/api/pay/[token]/intent/route.ts.
// Inlined to avoid coupling client bundles to a server-only file.
const STRIPE_MIN_AMOUNT_CENTS = 50;

type Preset = '25' | '50' | '75' | 'full' | 'custom';

interface PaymentLinkAmountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Outstanding balance in integer cents. Caller passes appointment.amount_due_cents. */
  remainingCents: number;
  /** Fired with the chosen amount in integer cents when staff clicks Continue. */
  onContinue: (amountCents: number) => void;
  customerName?: string;
}

function pctOf(cents: number, pct: number): number {
  // toCents/fromCents preserves single-rounding-site discipline (refund-math invariant 2).
  return toCents(fromCents(cents) * (pct / 100));
}

export function PaymentLinkAmountModal({
  open,
  onOpenChange,
  remainingCents,
  onContinue,
  customerName,
}: PaymentLinkAmountModalProps) {
  const [selected, setSelected] = useState<Preset | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setCustomAmount('');
    }
  }, [open]);

  const remainingDollars = fromCents(remainingCents);

  const presetCents: Record<Exclude<Preset, 'custom'>, number> = {
    '25': pctOf(remainingCents, 25),
    '50': pctOf(remainingCents, 50),
    '75': pctOf(remainingCents, 75),
    full: remainingCents,
  };

  const customCents = (() => {
    const parsed = parseFloat(customAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return toCents(parsed);
  })();

  let validationError: string | null = null;
  if (selected === 'custom') {
    if (customAmount.trim() === '') {
      validationError = null;
    } else if (customCents < STRIPE_MIN_AMOUNT_CENTS) {
      validationError = `Minimum $${(STRIPE_MIN_AMOUNT_CENTS / 100).toFixed(2)}`;
    } else if (customCents > remainingCents) {
      validationError = `Cannot exceed $${remainingDollars.toFixed(2)} remaining`;
    }
  }

  function chosenCents(): number | null {
    if (selected === null) return null;
    if (selected === 'custom') {
      if (customCents < STRIPE_MIN_AMOUNT_CENTS || customCents > remainingCents) return null;
      return customCents;
    }
    return presetCents[selected];
  }

  const chosen = chosenCents();
  const canContinue = chosen !== null;

  function handleContinue() {
    if (!canContinue || chosen === null) return;
    onContinue(chosen);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="max-w-md"
    >
      <DialogHeader>
        <DialogTitle>Send Payment Link</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4">
        <p className="text-sm text-ui-text-secondary">
          {customerName
            ? `Choose how much to charge ${customerName}.`
            : 'Choose how much to charge the customer.'}
        </p>

        {/* Preset row */}
        <div className="grid grid-cols-2 gap-2">
          {(['25', '50', '75', 'full'] as const).map((key) => {
            const cents = presetCents[key];
            const label = key === 'full' ? 'Full balance' : `${key}%`;
            const isSelected = selected === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelected(key);
                  setCustomAmount('');
                }}
                className={cn(
                  'flex flex-col items-center justify-center rounded-lg border-2 px-3 py-3 transition-all',
                  isSelected
                    ? 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                <span className="text-base font-semibold">{label}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  ${fromCents(cents).toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom button */}
        <button
          type="button"
          onClick={() => setSelected('custom')}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 transition-all',
            selected === 'custom'
              ? 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
          )}
        >
          <span className="text-base font-semibold">Custom</span>
        </button>

        {/* Custom input */}
        {selected === 'custom' && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg text-gray-500 dark:text-gray-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                autoFocus
                value={customAmount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '');
                  setCustomAmount(v);
                }}
                className="h-12 flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 text-center text-xl tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                placeholder="0.00"
              />
            </div>
            {validationError && (
              <p className="text-sm text-red-500 dark:text-red-400">{validationError}</p>
            )}
          </div>
        )}

        {/* Summary line */}
        {chosen !== null && (
          <div className="rounded-md border border-ui-border bg-ui-bg-soft px-3 py-2 text-sm">
            {selected === 'full' || chosen === remainingCents ? (
              <span className="text-ui-text">
                Send link for{' '}
                <span className="font-semibold tabular-nums">
                  ${fromCents(chosen).toFixed(2)}
                </span>
              </span>
            ) : (
              <span className="text-ui-text">
                Send link for{' '}
                <span className="font-semibold tabular-nums">
                  ${fromCents(chosen).toFixed(2)}
                </span>{' '}
                <span className="text-ui-text-muted">
                  ({Math.round((chosen / remainingCents) * 100)}% of $
                  {remainingDollars.toFixed(2)} remaining)
                </span>
              </span>
            )}
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleContinue} disabled={!canContinue}>
          Continue
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
