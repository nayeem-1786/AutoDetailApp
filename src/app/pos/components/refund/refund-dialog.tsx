'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import type {
  Transaction,
  TransactionItem,
  Payment,
  Refund,
  RefundItem,
} from '@/lib/supabase/types';
import { posFetch } from '../../lib/pos-fetch';
import { PinPad } from '../pin-pad';
import { RefundItemRow } from './refund-item-row';
import { RefundSummary } from './refund-summary';
import {
  computePerUnitRefundableCents,
  computeTotalRefundCents,
  fromCents,
  toCents,
} from '@/lib/utils/refund-math';
import type { RefundDisposition } from '@/lib/utils/validation';
import {
  walkLifoAllocation,
  type SourceEntry,
  type SourceAllocation,
} from '@/lib/refunds/source-plan';
import { derivePaymentSourceLabel } from '@/lib/utils/payment-source-label';
import { formatDateTime } from '@/lib/utils/format';

// Mirrors STRIPE_MIN_AMOUNT_CENTS in src/app/api/pay/[token]/intent/route.ts
// and src/components/jobs/payment-link-amount-modal.tsx. Stripe rejects card
// refunds below $0.50.
const STRIPE_MIN_AMOUNT_CENTS = 50;

interface RefundDialogProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction & {
    items: TransactionItem[];
    payments?: Payment[];
    refunds?: (Refund & { refund_items: RefundItem[] })[];
  };
  onRefunded: () => void;
}

export type AllItemsDisposition =
  | 'restock'
  | 'damaged'
  | 'customer_retained'
  | 'mixed'
  | null;

interface SelectedItemState {
  qty: number;
  disposition: RefundDisposition | null;
}

export function RefundDialog({
  open,
  onClose,
  transaction,
  onRefunded,
}: RefundDialogProps) {
  const [selectedItems, setSelectedItems] = useState<
    Map<string, SelectedItemState>
  >(new Map());
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [allDisposition, setAllDisposition] = useState<AllItemsDisposition>(null);

  // Shell mode = no transaction_items rows. Pay-link payments, booking
  // deposits, and any future appointment-payment shells take this branch
  // because they exist as money against a transaction (Stripe PI) without
  // line-item structure. The two-step Review→Confirm flow is replaced with a
  // single screen: Full / Partial radio + reason + Issue Refund.
  const isShellMode = transaction.items.length === 0;
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [partialCents, setPartialCents] = useState(0);

  // Close-out / appointment-linked: fetch the LIFO source plan once when the
  // dialog opens. Walk-in transactions get an empty plan and the
  // "Refund will be issued from:" section never renders. The walk
  // (walkLifoAllocation) runs in the summary on every selection change so
  // the display tracks the staff's chosen subset.
  const [sourcePlan, setSourcePlan] = useState<SourceEntry[]>([]);
  useEffect(() => {
    if (!open || !transaction.appointment_id) {
      setSourcePlan([]);
      return;
    }
    let cancelled = false;
    posFetch(`/api/pos/refunds/source-plan/${transaction.id}`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!cancelled && json?.data?.sources) {
          setSourcePlan(json.data.sources as SourceEntry[]);
        }
      })
      .catch(() => { /* network error — modal still works, just no source list */ });
    return () => { cancelled = true; };
  }, [open, transaction.id, transaction.appointment_id]);

  // Calculate max refundable quantity for each transaction item
  const maxRefundableQtyMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of transaction.items) {
      let alreadyRefunded = 0;

      if (transaction.refunds) {
        for (const refund of transaction.refunds) {
          if (refund.status === 'failed') continue;

          for (const ri of refund.refund_items) {
            if (ri.transaction_item_id === item.id) {
              alreadyRefunded += ri.quantity;
            }
          }
        }
      }

      map.set(item.id, item.quantity - alreadyRefunded);
    }

    return map;
  }, [transaction.items, transaction.refunds]);

  // Toggle item selection
  const toggleItem = useCallback(
    (itemId: string) => {
      setSelectedItems((prev) => {
        const next = new Map(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          const maxQty = maxRefundableQtyMap.get(itemId) ?? 0;
          if (maxQty > 0) {
            next.set(itemId, { qty: maxQty, disposition: null });
          }
        }
        return next;
      });
    },
    [maxRefundableQtyMap]
  );

  // Update quantity for a selected item
  const updateQty = useCallback((itemId: string, qty: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const entry = next.get(itemId);
      if (entry) {
        next.set(itemId, { ...entry, qty });
      }
      return next;
    });
  }, []);

  // Update disposition for a selected item (used in mixed mode)
  const updateDisposition = useCallback((itemId: string, disposition: RefundDisposition) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const entry = next.get(itemId);
      if (entry) {
        next.set(itemId, { ...entry, disposition });
      }
      return next;
    });
  }, []);

  // Per-unit refundable amount for each item, in FRACTIONAL CENTS.
  const perUnitCentsMap = useMemo(() => {
    const map = new Map<string, number>();
    const tx_subtotal = transaction.subtotal || 0;
    const tx_discount_amount = transaction.discount_amount || 0;

    for (const item of transaction.items) {
      const perUnitCents = computePerUnitRefundableCents({
        unit_price: item.unit_price,
        quantity: item.quantity,
        tax_amount: item.tax_amount || 0,
        tx_subtotal,
        tx_discount_amount,
      });
      map.set(item.id, perUnitCents);
    }

    return map;
  }, [transaction.items, transaction.subtotal, transaction.discount_amount]);

  // Authoritative refund line amounts (integer cents, residual-distributed).
  const summaryItems = useMemo(() => {
    const selectedEntries: Array<{
      item: TransactionItem;
      state: SelectedItemState;
    }> = [];

    for (const [itemId, state] of selectedItems) {
      const item = transaction.items.find((i) => i.id === itemId);
      if (item) selectedEntries.push({ item, state });
    }

    if (selectedEntries.length === 0) return [];

    const { lineAmountsCents } = computeTotalRefundCents({
      transaction: {
        subtotal: transaction.subtotal || 0,
        discount_amount: transaction.discount_amount || 0,
        tip_amount: transaction.tip_amount || 0,
      },
      items: selectedEntries.map(({ item, state }) => ({
        unit_price: item.unit_price,
        quantity: item.quantity,
        tax_amount: item.tax_amount || 0,
        refund_quantity: state.qty,
      })),
      tip_refund: 0,
    });

    return selectedEntries.map(({ item, state }, i) => ({
      item,
      quantity: state.qty,
      amountCents: lineAmountsCents[i],
      amountDollars: fromCents(lineAmountsCents[i]),
      disposition: state.disposition,
    }));
  }, [
    selectedItems,
    transaction.items,
    transaction.subtotal,
    transaction.discount_amount,
    transaction.tip_amount,
  ]);

  // Check if all refundable items are fully selected (full refund → include tip)
  const isFullRefund = useMemo(() => {
    for (const item of transaction.items) {
      const maxQty = maxRefundableQtyMap.get(item.id) ?? 0;
      if (maxQty <= 0) continue;
      const selection = selectedItems.get(item.id);
      if (!selection || selection.qty < maxQty) return false;
    }
    return selectedItems.size > 0;
  }, [transaction.items, selectedItems, maxRefundableQtyMap]);

  const tipRefund = isFullRefund ? (transaction.tip_amount || 0) : 0;

  const canProceed = selectedItems.size > 0 && reason.trim().length > 0;

  // Check if any selected items are products (disposition only matters for products)
  const hasProductItems = useMemo(
    () =>
      summaryItems.some((entry) => entry.item.item_type === 'product'),
    [summaryItems]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Shell-mode derived values. These compute regardless of mode, but are
  // only consumed inside the `isShellMode` JSX branch below.
  //
  // remainingRefundableShellCents subtracts prior processed refunds from
  // (total + tip), so reopening the modal on a partially-refunded shell
  // shows the correct cap. isZeroShell catches both fresh $0 close-out
  // shells (Session 4b "Closed out — fully pre-paid") and shells that have
  // already been fully refunded — both render the same "nothing to refund
  // here" guard panel below.
  // ─────────────────────────────────────────────────────────────────────────
  const totalAmountCents = toCents(transaction.total_amount);
  const tipAmountCents = toCents(transaction.tip_amount || 0);
  const alreadyRefundedShellCents = useMemo(() => {
    if (!isShellMode || !transaction.refunds) return 0;
    return transaction.refunds
      .filter((r) => r.status === 'processed')
      .reduce((sum, r) => sum + toCents(Number(r.amount)), 0);
  }, [transaction.refunds, isShellMode]);

  const remainingRefundableShellCents = isShellMode
    ? Math.max(
        0,
        totalAmountCents + tipAmountCents - alreadyRefundedShellCents
      )
    : 0;
  const isZeroShell = isShellMode && remainingRefundableShellCents === 0;

  // Source-label / method / date for the shell-mode summary card. First
  // payment determines the method; notes prefix overrides the label
  // (pay-link, booking deposit) per the shared helper.
  const firstPayment = transaction.payments?.[0];
  const shellSourceLabel = isShellMode
    ? derivePaymentSourceLabel(
        transaction.notes,
        (firstPayment?.method ?? 'card') as
          | 'cash'
          | 'card'
          | 'check'
          | 'split'
      )
    : '';
  const shellCardLastFour = firstPayment?.card_last_four ?? null;
  const shellMethodLabel =
    firstPayment?.method === 'card'
      ? shellCardLastFour
        ? `Card ending ${shellCardLastFour}`
        : 'Card'
      : firstPayment?.method
        ? firstPayment.method.charAt(0).toUpperCase() +
          firstPayment.method.slice(1)
        : 'Card';

  // Shell-mode validation message slot. Mirrors the unified status-slot
  // pattern from src/components/jobs/payment-link-amount-modal.tsx
  // (Session 5-followup-3): single min-h-reserved row, mutually exclusive
  // error vs preview vs empty content, anchors the layout while the user
  // types digits across the validation boundary.
  let shellValidationError: string | null = null;
  if (isShellMode && refundType === 'partial' && partialCents > 0) {
    if (partialCents < STRIPE_MIN_AMOUNT_CENTS) {
      shellValidationError = `Minimum $${(STRIPE_MIN_AMOUNT_CENTS / 100).toFixed(2)}`;
    } else if (partialCents > remainingRefundableShellCents) {
      shellValidationError = `Cannot exceed $${fromCents(remainingRefundableShellCents).toFixed(2)}`;
    }
  }

  const shellPartialValid =
    partialCents >= STRIPE_MIN_AMOUNT_CENTS &&
    partialCents <= remainingRefundableShellCents;

  const shellCanIssue =
    isShellMode &&
    !isZeroShell &&
    reason.trim().length > 0 &&
    (refundType === 'full'
      ? remainingRefundableShellCents > 0
      : shellPartialValid);

  // Cents-from-the-right entry, mirroring keypad-tab.tsx:21-26 and
  // payment-link-amount-modal.tsx:76-81. The cap is applied at the
  // dialog level (cannot exceed remainingRefundableShellCents); we still
  // enforce the absolute $99,999.99 ceiling to match the other keypad
  // surfaces and prevent integer overflow issues.
  function handleShellDigit(d: string) {
    if (d === '.') return; // Defensive — `.` not rendered in amount layout.
    const next =
      d === '00' ? partialCents * 100 : partialCents * 10 + parseInt(d, 10);
    if (next > 9999999) return;
    setPartialCents(next);
  }

  function handleShellBackspace() {
    setPartialCents(Math.floor(partialCents / 10));
  }

  // Single-step shell-mode submit (no Review→Confirm).
  async function handleShellConfirm() {
    if (!shellCanIssue) return;
    setProcessing(true);
    try {
      const amountCents =
        refundType === 'full' ? remainingRefundableShellCents : partialCents;
      const amountDollars = fromCents(amountCents);
      const payload = {
        transaction_id: transaction.id,
        items: [],
        bulk_amount: amountDollars,
        reason: reason.trim(),
      };
      const res = await posFetch('/api/pos/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `Refund failed with status ${res.status}`
        );
      }
      toast.success('Refund processed successfully');
      onRefunded();
      handleClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to process refund'
      );
    } finally {
      setProcessing(false);
    }
  }

  // Handle confirm refund submission
  async function handleConfirm() {
    setProcessing(true);

    try {
      const payload = {
        transaction_id: transaction.id,
        items: summaryItems.map((entry) => ({
          transaction_item_id: entry.item.id,
          quantity: entry.quantity,
          amount: entry.amountDollars,
          disposition:
            entry.item.item_type !== 'product'
              ? 'customer_retained'
              : allDisposition && allDisposition !== 'mixed'
                ? allDisposition
                : entry.disposition,
        })),
        tip_refund: tipRefund,
        reason: reason.trim(),
      };

      const res = await posFetch('/api/pos/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `Refund failed with status ${res.status}`
        );
      }

      toast.success('Refund processed successfully');
      onRefunded();
      handleClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to process refund'
      );
    } finally {
      setProcessing(false);
    }
  }

  // Reset state and close
  function handleClose() {
    setSelectedItems(new Map());
    setReason('');
    setProcessing(false);
    setStep('select');
    setAllDisposition(null);
    setRefundType('full');
    setPartialCents(0);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
      modal={isShellMode ? processing : step === 'confirm' || processing}
    >
      <DialogHeader>
        <DialogTitle>
          {isShellMode ? 'Refund Transaction' : 'Issue Refund'} &mdash; #
          {transaction.receipt_number ?? 'N/A'}
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        {isShellMode ? (
          <div className="space-y-4">
            {/* Transaction summary card. Pay-link / booking deposit / generic
                appointment payment — derived from notes prefix via the same
                helper used by /api/pos/jobs/[id]/checkout-items and the
                receipt template, so labels stay consistent. */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {shellSourceLabel}
                </span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  ${transaction.total_amount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{shellMethodLabel}</span>
                <span className="tabular-nums">
                  {formatDateTime(transaction.transaction_date)}
                </span>
              </div>
              {alreadyRefundedShellCents > 0 && (
                <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span>Already refunded</span>
                  <span className="tabular-nums">
                    -${fromCents(alreadyRefundedShellCents).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Zero-refundable guard: $0 close-out shell (Session 4b) OR a
                shell already fully refunded. Surface the explanation and
                disable the rest of the form — the refund engine will reject
                this case anyway, but failing client-side is friendlier. */}
            {isZeroShell ? (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-3">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {alreadyRefundedShellCents > 0
                    ? 'This transaction has already been fully refunded.'
                    : 'This transaction has no payment of its own. To refund the appointment, open the original Pay Link or Booking Deposit transaction and refund from there.'}
                </p>
              </div>
            ) : (
              <>
                {/* Refund type radio */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Refund amount
                  </p>
                  <div className="space-y-1.5">
                    {(['full', 'partial'] as const).map((type) => {
                      const isSelected = refundType === type;
                      const label =
                        type === 'full' ? 'Full refund' : 'Partial refund';
                      const previewCents =
                        type === 'full'
                          ? remainingRefundableShellCents
                          : partialCents;
                      return (
                        <label
                          key={type}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                            isSelected
                              ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          )}
                        >
                          <input
                            type="radio"
                            name="shell-refund-type"
                            checked={isSelected}
                            onChange={() => {
                              setRefundType(type);
                              if (type === 'full') setPartialCents(0);
                            }}
                            className="h-4 w-4 border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {label}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            ${fromCents(previewCents).toFixed(2)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Partial keypad — fixed-decimal cents-from-the-right entry,
                    same pattern as keypad-tab.tsx + payment-link-amount-modal.tsx. */}
                {refundType === 'partial' && (
                  <div className="space-y-3">
                    <div
                      className={cn(
                        'flex items-center justify-center rounded-lg border-2 px-4 py-3 text-3xl font-bold tabular-nums',
                        partialCents === 0
                          ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600'
                          : 'border-blue-200 dark:border-blue-800 text-gray-900 dark:text-gray-100'
                      )}
                      aria-live="polite"
                    >
                      ${(partialCents / 100).toFixed(2)}
                    </div>
                    <PinPad
                      onDigit={handleShellDigit}
                      onBackspace={handleShellBackspace}
                      size="sm"
                      layoutVariant="amount"
                    />
                  </div>
                )}

                {/* Unified validation slot — same min-h-reserved row pattern
                    as Session 5-followup-3 in payment-link-amount-modal.tsx,
                    so the buttons below don't shift as the user types digits
                    across the validation boundary. */}
                <p
                  className="min-h-[1.25rem] text-sm"
                  role="status"
                  aria-live="polite"
                >
                  {shellValidationError && (
                    <span className="text-red-500 dark:text-red-400">
                      {shellValidationError}
                    </span>
                  )}
                </p>

                {/* Reason — required, same trim() validation as items mode */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="refund-reason-shell"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Reason for refund{' '}
                    <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <textarea
                    id="refund-reason-shell"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe why this refund is being issued..."
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-2"
                  />
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={processing}>
                Cancel
              </Button>
              {!isZeroShell && (
                <Button
                  variant="destructive"
                  disabled={!shellCanIssue || processing}
                  onClick={handleShellConfirm}
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    'Issue Refund'
                  )}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {step === 'select' && (
              <div className="space-y-4">
                {/* Item selection list */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select items to refund
                  </p>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto">
                    {transaction.items.map((item) => {
                      const maxQty = maxRefundableQtyMap.get(item.id) ?? 0;
                      const selection = selectedItems.get(item.id);

                      return (
                        <RefundItemRow
                          key={item.id}
                          item={item}
                          maxRefundableQty={maxQty}
                          selected={!!selection}
                          refundQty={selection?.qty ?? 1}
                          perUnitCents={perUnitCentsMap.get(item.id) ?? 0}
                          onToggle={() => toggleItem(item.id)}
                          onQtyChange={(qty) => updateQty(item.id, qty)}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Reason input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="refund-reason"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Reason for refund <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <textarea
                    id="refund-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe why this refund is being issued..."
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-2"
                  />
                </div>

                {/* Review button */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!canProceed}
                    onClick={() => setStep('confirm')}
                  >
                    Review Refund
                  </Button>
                </div>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('select')}
                >
                  &larr; Back to selection
                </Button>

                <RefundSummary
                  items={summaryItems}
                  tipRefund={tipRefund}
                  reason={reason}
                  processing={processing}
                  onConfirm={handleConfirm}
                  loyaltyPointsRedeemed={transaction.loyalty_points_redeemed}
                  loyaltyPointsEarned={transaction.loyalty_points_earned}
                  couponCode={transaction.coupon_code}
                  allDisposition={allDisposition}
                  onAllDispositionChange={setAllDisposition}
                  hasProductItems={hasProductItems}
                  onDispositionChange={updateDisposition}
                  sourcePlan={sourcePlan}
                />
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
