'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Ban, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { usePosPermission } from '../../context/pos-permission-context';
import { TRANSACTION_STATUS_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDateTime, formatPhone } from '@/lib/utils/format';
import { formatCardBrand } from '@/lib/utils/card-brand';
import { renderTierToken } from '@/lib/quotes/tier-display';
import {
  parseRefundSources,
  enrichRefundSources,
  shortStripeRefundId,
} from '@/lib/data/refund-sources';
import { posFetch } from '../../lib/pos-fetch';
import { RefundDialog } from '../refund/refund-dialog';
import { ReceiptOptions } from '../receipt-options';
import { QboSyncBadge } from '@/components/qbo-sync-badge';
import type {
  Transaction,
  TransactionItem,
  Payment,
  Refund,
  RefundItem,
  Customer,
  Employee,
} from '@/lib/supabase/types';

interface TransactionDetailProps {
  transactionId: string;
  onBack: () => void;
}

interface LinkedJob {
  id: string;
  status: string;
}

type FullTransaction = Transaction & {
  items: TransactionItem[];
  payments: Payment[];
  refunds: (Refund & { refund_items: RefundItem[] })[];
  customer: Customer | null;
  employee: Employee | null;
  jobs: LinkedJob[] | null;
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  completed: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  refunded: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  partial_refund: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  voided: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  open: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
};

const REFUND_STATUS_CLASSES: Record<string, string> = {
  processed: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  pending: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  failed: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

export function TransactionDetail({ transactionId, onBack }: TransactionDetailProps) {
  const [transaction, setTransaction] = useState<FullTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [, setRetryingQbo] = useState(false);

  const fetchTransaction = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posFetch(`/api/pos/transactions/${transactionId}`);
      if (!res.ok) throw new Error('Failed to fetch transaction');
      const json = await res.json();
      setTransaction(json.data ?? null);
    } catch {
      setTransaction(null);
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    fetchTransaction();
  }, [fetchTransaction]);

  // Hooks must be called before any early returns
  const { granted: hasRefundPerm } = usePosPermission('pos.issue_refunds');
  const { granted: hasVoidPerm } = usePosPermission('pos.void_transactions');

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Transaction not found</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Transactions
        </Button>
      </div>
    );
  }

  const refundEligible =
    transaction.status === 'completed' || transaction.status === 'partial_refund';
  const _canRefund = hasRefundPerm && refundEligible;

  const voidEligible = transaction.status === 'completed';
  const _canVoid = hasVoidPerm && voidEligible;

  const hasCardPayment = (transaction.payments ?? []).some(
    (p) => p.method === 'card' || p.method === 'split'
  );
  const cardBlockTooltip =
    'This sale included a card payment. Card transactions must be refunded, not voided.';

  const linkedJob = (transaction.jobs ?? []).find((j) => j.status !== 'cancelled') ?? null;
  const customerName = transaction.customer
    ? `${transaction.customer.first_name} ${transaction.customer.last_name}`.trim() || 'the customer'
    : 'the customer';

  const showReceipt =
    transaction.status === 'completed' ||
    transaction.status === 'voided' ||
    transaction.status === 'refunded' ||
    transaction.status === 'partial_refund';

  async function handleRetryQbo() {
    setRetryingQbo(true);
    try {
      const res = await posFetch('/api/admin/integrations/qbo/sync/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });
      const json = await res.json();
      if (json.succeeded > 0) {
        toast.success('QBO sync retried successfully');
      } else {
        toast.error(json.error || 'QBO sync retry failed');
      }
      fetchTransaction();
    } catch {
      toast.error('Failed to retry QBO sync');
    } finally {
      setRetryingQbo(false);
    }
  }

  async function handleVoid() {
    setVoiding(true);
    try {
      const res = await posFetch(`/api/pos/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to void transaction');
        return;
      }
      toast.success('Transaction voided');
      setShowVoidConfirm(false);
      fetchTransaction();
    } catch {
      toast.error('Failed to void transaction');
    } finally {
      setVoiding(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Transactions
        </button>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Receipt #{transaction.receipt_number ?? '---'}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {formatDateTime(transaction.transaction_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <QboSyncBadge
              status={transaction.qbo_sync_status}
              qboId={transaction.qbo_id}
              error={transaction.qbo_sync_error}
              syncedAt={transaction.qbo_synced_at}
              onRetry={
                transaction.qbo_sync_status === 'failed'
                  ? handleRetryQbo
                  : undefined
              }
            />
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_BADGE_CLASSES[transaction.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {TRANSACTION_STATUS_LABELS[transaction.status] ?? transaction.status}
            </span>
          </div>
        </div>

        {/* Customer & Employee info */}
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
          <div>
            <p className="text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Customer</p>
            {transaction.customer ? (
              <>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {transaction.customer.first_name} {transaction.customer.last_name}
                </p>
                {transaction.customer.phone && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatPhone(transaction.customer.phone)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Walk-in</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Employee</p>
            {transaction.employee ? (
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {transaction.employee.first_name} {transaction.employee.last_name}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">---</p>
            )}
          </div>
        </div>

        {/* Items table */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4">Item</th>
                <th className="pb-2 pr-4 text-center">Qty</th>
                <th className="pb-2 pr-4 text-right">Unit Price</th>
                <th className="pb-2 pr-4 text-right">Total</th>
                <th className="pb-2 text-right">Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {transaction.items.map((item) => {
                // D46 (Issue 41): unified tier token. tier_label / qty_label
                // attached by /api/pos/transactions/[id] route via
                // attachTierMetaToItems. Parens-inline wrapper preserved.
                const tierToken = renderTierToken({
                  tier_name: item.tier_name,
                  tier_label: item.tier_label,
                  qty_label: item.qty_label,
                  quantity: item.quantity,
                });
                return (
                <tr key={item.id}>
                  <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">
                    <span>{item.item_name}</span>
                    {tierToken && (
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({tierToken})</span>
                    )}
                    {item.vehicle_size_class && (
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                        [{item.vehicle_size_class}]
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-center tabular-nums text-gray-600 dark:text-gray-400">
                    {item.quantity}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-600 dark:text-gray-400">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(item.total_price)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {item.is_taxable ? formatCurrency(item.tax_amount) : '---'}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Payments */}
        {transaction.payments?.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Payments</h2>
            <div className="space-y-2">
              {transaction.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {payment.method.charAt(0).toUpperCase() + payment.method.slice(1)}
                      {payment.card_brand && payment.card_last_four && (
                        <span className="ml-1.5 text-gray-500 dark:text-gray-400">
                          {payment.card_brand} ****{payment.card_last_four}
                        </span>
                      )}
                    </p>
                    {payment.tip_amount > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Tip: {formatCurrency(payment.tip_amount)}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                    {formatCurrency(payment.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="mb-6 rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Totals</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
              <span className="tabular-nums text-gray-700 dark:text-gray-300">
                {formatCurrency(transaction.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Tax</span>
              <span className="tabular-nums text-gray-700 dark:text-gray-300">
                {formatCurrency(transaction.tax_amount)}
              </span>
            </div>
            {transaction.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Discount</span>
                <span className="tabular-nums text-red-600 dark:text-red-400">
                  -{formatCurrency(transaction.discount_amount)}
                </span>
              </div>
            )}
            {transaction.loyalty_discount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Loyalty Discount</span>
                <span className="tabular-nums text-red-600 dark:text-red-400">
                  -{formatCurrency(transaction.loyalty_discount)}
                </span>
              </div>
            )}
            {transaction.tip_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Tip</span>
                <span className="tabular-nums text-gray-700 dark:text-gray-300">
                  {formatCurrency(transaction.tip_amount)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-gray-900 dark:text-gray-100">Total</span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatCurrency(transaction.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Loyalty info */}
        {(transaction.loyalty_points_earned > 0 || transaction.loyalty_points_redeemed > 0) && (
          <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Loyalty</h2>
            <div className="flex gap-6 text-sm">
              {transaction.loyalty_points_earned > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Points Earned: </span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    +{transaction.loyalty_points_earned}
                  </span>
                </div>
              )}
              {transaction.loyalty_points_redeemed > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Points Redeemed: </span>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    -{transaction.loyalty_points_redeemed}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {transaction.notes && (
          <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Notes</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{transaction.notes}</p>
          </div>
        )}

        {/* Refund History */}
        {transaction.refunds?.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Refund History</h2>
            <div className="space-y-3">
              {transaction.refunds.map((refund) => (
                <div
                  key={refund.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(refund.amount)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(refund.created_at)}
                      </p>
                      {refund.reason && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Reason: {refund.reason}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        REFUND_STATUS_CLASSES[refund.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {refund.status.charAt(0).toUpperCase() + refund.status.slice(1)}
                    </span>
                  </div>

                  {/* Per-method "Refunded to:" block.
                      Parsed from refund.notes (JSON {sources:[...]}) which
                      Session 4d's engine writes for split-tender and close-out
                      refunds. card_brand + last_four are joined against the
                      transaction's payments[] when the source's stripe_pi
                      matches locally; close-out sources whose pi lives on a
                      sibling tx fall through with brand/last_four undefined
                      (renderer handles via formatCardBrand fallback). */}
                  {(() => {
                    const rawSources = parseRefundSources(refund.notes ?? null);
                    if (!rawSources) return null;
                    const sources = enrichRefundSources(rawSources, transaction.payments);
                    return (
                      <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-2">
                        <p className="mb-1 text-xs font-medium text-gray-400 dark:text-gray-500">Refunded to</p>
                        <div className="flex flex-col gap-0.5">
                          {sources.map((source, i) => {
                            let label: string;
                            if (source.method === 'cash') {
                              label = 'Cash';
                            } else if (source.method === 'card') {
                              const brand = formatCardBrand(source.card_brand);
                              label = source.card_last_four
                                ? `Card (${brand} ****${source.card_last_four})`
                                : brand === 'Card' ? 'Card' : `Card (${brand})`;
                            } else {
                              label = source.method.charAt(0).toUpperCase() + source.method.slice(1);
                            }
                            const stripeTag = source.method === 'card'
                              ? shortStripeRefundId(source.stripe_refund_id)
                              : null;
                            return (
                              <div
                                key={i}
                                className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400"
                              >
                                <span className="flex items-center gap-1.5">
                                  {label}
                                  {stripeTag && (
                                    <span
                                      className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-gray-400"
                                      title={source.stripe_refund_id ?? undefined}
                                    >
                                      {stripeTag}
                                    </span>
                                  )}
                                </span>
                                <span className="tabular-nums">-{formatCurrency(Number(source.amount))}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Refund items */}
                  {refund.refund_items && refund.refund_items.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-2">
                      <p className="mb-1 text-xs font-medium text-gray-400 dark:text-gray-500">Items Refunded</p>
                      {refund.refund_items.map((ri) => {
                        const txItem = transaction.items.find(
                          (i) => i.id === ri.transaction_item_id
                        );
                        return (
                          <div
                            key={ri.id}
                            className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400"
                          >
                            <span>
                              {txItem?.item_name ?? 'Unknown Item'} x{ri.quantity}
                              {(() => {
                                const disposition = ri.disposition ?? (ri.restock ? 'restock' : null);
                                if (disposition === 'restock') return (
                                  <span className="ml-1.5 rounded bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 text-blue-600 dark:text-blue-400">
                                    restocked
                                  </span>
                                );
                                if (disposition === 'damaged') return (
                                  <span className="ml-1.5 rounded bg-red-50 dark:bg-red-900/30 px-1 py-0.5 text-red-600 dark:text-red-400">
                                    damaged
                                  </span>
                                );
                                if (disposition === 'customer_retained') return (
                                  <span className="ml-1.5 rounded bg-gray-100 dark:bg-gray-700 px-1 py-0.5 text-gray-600 dark:text-gray-400">
                                    kept
                                  </span>
                                );
                                return null;
                              })()}
                            </span>
                            <span className="tabular-nums">{formatCurrency(ri.amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Send Receipt */}
        {showReceipt && (
          <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Send Receipt</h2>
            <ReceiptOptions
              transactionId={transactionId}
              customerEmail={transaction.customer?.email ?? null}
              customerPhone={transaction.customer?.phone ?? null}
            />
          </div>
        )}

        {/* Action buttons */}
        {(refundEligible || voidEligible) && (
          <div className="flex gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            {refundEligible && (
              <Button
                variant="destructive"
                onClick={() => setShowRefundDialog(true)}
                disabled={!hasRefundPerm}
                title={!hasRefundPerm ? "You don't have permission to perform this action" : undefined}
              >
                Issue Refund
              </Button>
            )}
            {voidEligible && (
              <div className="flex flex-col items-start gap-1">
                <Button
                  variant="outline"
                  className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400"
                  onClick={() => setShowVoidConfirm(true)}
                  disabled={!hasVoidPerm || hasCardPayment}
                  title={
                    !hasVoidPerm
                      ? "You don't have permission to perform this action"
                      : hasCardPayment
                        ? cardBlockTooltip
                        : undefined
                  }
                >
                  <Ban className="mr-1.5 h-4 w-4" />
                  Void Transaction
                </Button>
                {hasCardPayment && (
                  <p
                    role="note"
                    className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
                  >
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    Card sales must be refunded, not voided.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Void Confirmation Dialog */}
      <ConfirmDialog
        open={showVoidConfirm}
        onOpenChange={(open) => !open && !voiding && setShowVoidConfirm(false)}
        title={linkedJob ? 'Void will cancel job and notify customer' : 'Void Transaction'}
        description={
          linkedJob ? (
            <div className="space-y-3">
              <p>This transaction is linked to a scheduled job. Voiding will:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Restore inventory for any product items</li>
                <li>Cancel the linked job (status &rarr; cancelled)</li>
                <li>Send a cancellation notification to {customerName}</li>
              </ul>
              <p>The customer will receive an SMS or email letting them know.</p>
              <p className="font-medium text-red-600 dark:text-red-400">
                This cannot be undone.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p>Voiding this transaction will:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Restore inventory for any product items</li>
                <li>Reverse loyalty points and coupon usage</li>
                <li>Mark the transaction as voided</li>
              </ul>
              <p className="font-medium text-red-600 dark:text-red-400">
                This cannot be undone.
              </p>
            </div>
          )
        }
        confirmLabel="Void Transaction"
        cancelLabel="Cancel"
        variant="destructive"
        loading={voiding}
        requireConfirmText="VOID"
        onConfirm={handleVoid}
      />


      {/* Refund Dialog */}
      {showRefundDialog && (
        <RefundDialog
          open={showRefundDialog}
          onClose={() => setShowRefundDialog(false)}
          transaction={transaction}
          onRefunded={() => {
            setShowRefundDialog(false);
            fetchTransaction();
          }}
        />
      )}
    </div>
  );
}
