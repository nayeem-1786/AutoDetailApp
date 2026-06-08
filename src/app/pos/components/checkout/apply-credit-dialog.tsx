'use client';

/**
 * Phase 3 Theme E.3 — POS Apply Credit dialog (AC-15 operator UI).
 *
 * Thin client over E.1's balance fetch + E.2's apply endpoint. The dialog is
 * deliberately stateless beyond its open/close + input — it owns no credit
 * data and does no business logic. Race-safety lives in the repository layer.
 *
 * Mounted on the payment-complete screen because E.2's endpoint requires a
 * finalized transaction id. Operators apply credit AFTER tender to record
 * consumption against the ledger; pre-tender "reduce amount due" UX is a
 * separate piece of work that requires routing credit application through
 * the transaction-create POST and is out of scope for this theme.
 */

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { formatMoney } from '@/lib/utils/format';
import { toCents } from '@/lib/utils/money';
import { posFetch } from '../../lib/pos-fetch';

export interface ApplyCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  transactionId: string;
  /** Optional cap — the operator shouldn't be able to apply more than amount due. */
  maxApplyCents?: number;
  /** Fired with cents applied after a successful apply. */
  onApplied?: (appliedCents: number) => void;
}

export function ApplyCreditDialog({
  open,
  onOpenChange,
  customerId,
  transactionId,
  maxApplyCents,
  onApplied,
}: ApplyCreditDialogProps) {
  const [availableCents, setAvailableCents] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [applying, setApplying] = useState(false);

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      // The customer-credits balance endpoint sits on the admin surface
      // because the read is identical from either context. POS already
      // shares admin endpoints for similar look-ups (e.g. customer search).
      const res = await posFetch(
        `/api/admin/customers/${customerId}/credits`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load credit balance');
      }
      setAvailableCents(json.available_balance_cents ?? 0);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to load credit balance'
      );
      setAvailableCents(0);
    } finally {
      setLoadingBalance(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (open) {
      setAmountStr('');
      loadBalance();
    }
  }, [open, loadBalance]);

  const upperBound =
    availableCents === null
      ? null
      : maxApplyCents !== undefined
        ? Math.min(availableCents, maxApplyCents)
        : availableCents;

  async function handleApply() {
    const dollars = Number.parseFloat(amountStr);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    const requestedCents = toCents(dollars);
    if (upperBound !== null && requestedCents > upperBound) {
      toast.error(
        `Maximum applicable is ${formatMoney(upperBound)} (credit balance${maxApplyCents !== undefined ? ' or amount due' : ''})`
      );
      return;
    }
    setApplying(true);
    try {
      const res = await posFetch(
        `/api/pos/transactions/${transactionId}/apply-credit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            amount_cents: requestedCents,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to apply credit');
      }
      const appliedCents: number =
        typeof json.total_applied_cents === 'number'
          ? json.total_applied_cents
          : requestedCents;
      toast.success(`Applied ${formatMoney(appliedCents)} credit`);
      onApplied?.(appliedCents);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to apply credit'
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Apply Customer Credit</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 p-4">
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <Wallet className="h-4 w-4" />
              <span>Available credit balance</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-300 tabular-nums">
              {loadingBalance
                ? '…'
                : availableCents === null
                  ? '—'
                  : formatMoney(availableCents)}
            </p>
            {maxApplyCents !== undefined && upperBound !== null && (
              <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                Max applicable to this transaction: {formatMoney(upperBound)}
              </p>
            )}
          </div>

          <FormField label="Amount to apply" htmlFor="apply_credit_amount">
            <Input
              id="apply_credit_amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              disabled={
                loadingBalance ||
                applying ||
                availableCents === 0
              }
            />
          </FormField>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={applying}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          disabled={
            applying ||
            loadingBalance ||
            !amountStr ||
            availableCents === 0
          }
        >
          {applying ? 'Applying…' : 'Apply Credit'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
