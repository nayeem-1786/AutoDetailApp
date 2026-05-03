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
import { PinPad } from '@/app/pos/components/pin-pad';

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
  // Custom amount lives as integer cents and entry is "fixed-decimal" (Square /
  // Clover / Toast pattern): every digit shifts the existing value left by one
  // place. No decimal key, no way to skip the cents column. See keypad-tab.tsx
  // for the same pattern in the POS register flow.
  const [customCents, setCustomCents] = useState(0);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setCustomCents(0);
    }
  }, [open]);

  const remainingDollars = fromCents(remainingCents);

  const presetCents: Record<Exclude<Preset, 'custom'>, number> = {
    '25': pctOf(remainingCents, 25),
    '50': pctOf(remainingCents, 50),
    '75': pctOf(remainingCents, 75),
    full: remainingCents,
  };

  let validationError: string | null = null;
  if (selected === 'custom' && customCents > 0) {
    if (customCents < STRIPE_MIN_AMOUNT_CENTS) {
      validationError = `Minimum $${(STRIPE_MIN_AMOUNT_CENTS / 100).toFixed(2)}`;
    } else if (customCents > remainingCents) {
      validationError = `Cannot exceed $${remainingDollars.toFixed(2)} remaining`;
    }
  }

  function handleDigit(d: string) {
    if (d === '.') return; // Ignored — fixed-decimal entry has no decimal key.
    const next = customCents * 10 + parseInt(d, 10);
    if (next > 9999999) return; // $99,999.99 hard cap matches keypad-tab.
    setCustomCents(next);
  }

  function handleBackspace() {
    setCustomCents(Math.floor(customCents / 10));
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
    // Close *this* modal explicitly before opening the next step. Relying on
    // the parent's onContinue handler to flip both flags in one render led to
    // both modals being visible simultaneously (Bug 1, Session 5-followup).
    onOpenChange(false);
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
                  setCustomCents(0);
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

        {/* Custom amount: fixed-decimal entry via on-screen keypad. The native
            iPad keyboard's decimal handling is unreliable; this pattern (used
            by Square/Clover/Toast and by keypad-tab.tsx) treats every digit
            as a cents-column shift-left. */}
        {selected === 'custom' && (
          <div className="space-y-3">
            <div
              className={cn(
                'flex items-center justify-center rounded-lg border-2 px-4 py-3 text-3xl font-bold tabular-nums',
                customCents === 0
                  ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600'
                  : 'border-blue-200 dark:border-blue-800 text-gray-900 dark:text-gray-100'
              )}
              aria-live="polite"
            >
              ${(customCents / 100).toFixed(2)}
            </div>
            <PinPad
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              size="sm"
            />
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
