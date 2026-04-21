'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type {
  Transaction,
  TransactionItem,
  Refund,
  RefundItem,
} from '@/lib/supabase/types';
import { posFetch } from '../../lib/pos-fetch';
import { RefundItemRow } from './refund-item-row';
import { RefundSummary } from './refund-summary';
import {
  computePerUnitRefundableCents,
  computeTotalRefundCents,
  fromCents,
} from '@/lib/utils/refund-math';
import type { RefundDisposition } from '@/lib/utils/validation';

interface RefundDialogProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction & {
    items: TransactionItem[];
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
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()} modal={step === 'confirm' || processing}>
      <DialogHeader>
        <DialogTitle>
          Issue Refund &mdash; #{transaction.receipt_number ?? 'N/A'}
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
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
                      disposition={selection?.disposition ?? null}
                      showPerLineDisposition={allDisposition === 'mixed'}
                      perUnitCents={perUnitCentsMap.get(item.id) ?? 0}
                      onToggle={() => toggleItem(item.id)}
                      onQtyChange={(qty) => updateQty(item.id, qty)}
                      onDispositionChange={(d) => updateDisposition(item.id, d)}
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
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
