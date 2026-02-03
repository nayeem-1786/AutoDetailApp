'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-provider';
import { TRANSACTION_STATUS_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDateTime, formatPhone } from '@/lib/utils/format';
import { RefundDialog } from '../refund/refund-dialog';
import { ReceiptOptions } from '../receipt-options';
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

type FullTransaction = Transaction & {
  items: TransactionItem[];
  payments: Payment[];
  refunds: (Refund & { refund_items: RefundItem[] })[];
  customer: Customer | null;
  employee: Employee | null;
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  completed: 'bg-green-50 text-green-700',
  refunded: 'bg-red-50 text-red-700',
  partial_refund: 'bg-amber-50 text-amber-700',
  voided: 'bg-gray-100 text-gray-500',
  open: 'bg-blue-50 text-blue-700',
};

const REFUND_STATUS_CLASSES: Record<string, string> = {
  processed: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
};

export function TransactionDetail({ transactionId, onBack }: TransactionDetailProps) {
  const { role } = useAuth();
  const [transaction, setTransaction] = useState<FullTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const fetchTransaction = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pos/transactions/${transactionId}`);
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">Transaction not found</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Transactions
        </Button>
      </div>
    );
  }

  const canRefund =
    (role === 'super_admin' || role === 'admin') &&
    (transaction.status === 'completed' || transaction.status === 'partial_refund');

  const canVoid =
    (role === 'super_admin' || role === 'admin') &&
    transaction.status === 'completed';

  const showReceipt =
    transaction.status === 'completed' ||
    transaction.status === 'voided' ||
    transaction.status === 'refunded' ||
    transaction.status === 'partial_refund';

  async function handleVoid() {
    setVoiding(true);
    try {
      const res = await fetch(`/api/pos/transactions/${transactionId}`, {
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
    <div className="h-full overflow-auto bg-white">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Transactions
        </button>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Receipt #{transaction.receipt_number ?? '---'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {formatDateTime(transaction.transaction_date)}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
              STATUS_BADGE_CLASSES[transaction.status] ?? 'bg-gray-100 text-gray-500'
            }`}
          >
            {TRANSACTION_STATUS_LABELS[transaction.status] ?? transaction.status}
          </span>
        </div>

        {/* Customer & Employee info */}
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
          <div>
            <p className="text-xs font-medium uppercase text-gray-400">Customer</p>
            {transaction.customer ? (
              <>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {transaction.customer.first_name} {transaction.customer.last_name}
                </p>
                {transaction.customer.phone && (
                  <p className="text-sm text-gray-500">
                    {formatPhone(transaction.customer.phone)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500">Walk-in</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-400">Employee</p>
            {transaction.employee ? (
              <p className="mt-1 text-sm font-medium text-gray-900">
                {transaction.employee.first_name} {transaction.employee.last_name}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">---</p>
            )}
          </div>
        </div>

        {/* Items table */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-2 pr-4">Item</th>
                <th className="pb-2 pr-4 text-center">Qty</th>
                <th className="pb-2 pr-4 text-right">Unit Price</th>
                <th className="pb-2 pr-4 text-right">Total</th>
                <th className="pb-2 text-right">Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transaction.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-4 text-gray-900">
                    <span>{item.item_name}</span>
                    {item.tier_name && (
                      <span className="ml-1.5 text-xs text-gray-400">({item.tier_name})</span>
                    )}
                    {item.vehicle_size_class && (
                      <span className="ml-1.5 text-xs text-gray-400">
                        [{item.vehicle_size_class}]
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-center tabular-nums text-gray-600">
                    {item.quantity}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-600">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium text-gray-900">
                    {formatCurrency(item.total_price)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500">
                    {item.is_taxable ? formatCurrency(item.tax_amount) : '---'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payments */}
        {transaction.payments.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Payments</h2>
            <div className="space-y-2">
              {transaction.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {payment.method.charAt(0).toUpperCase() + payment.method.slice(1)}
                      {payment.card_brand && payment.card_last_four && (
                        <span className="ml-1.5 text-gray-500">
                          {payment.card_brand} ****{payment.card_last_four}
                        </span>
                      )}
                    </p>
                    {payment.tip_amount > 0 && (
                      <p className="text-xs text-gray-500">
                        Tip: {formatCurrency(payment.tip_amount)}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-medium tabular-nums text-gray-900">
                    {formatCurrency(payment.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Totals</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="tabular-nums text-gray-700">
                {formatCurrency(transaction.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span className="tabular-nums text-gray-700">
                {formatCurrency(transaction.tax_amount)}
              </span>
            </div>
            {transaction.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Discount</span>
                <span className="tabular-nums text-red-600">
                  -{formatCurrency(transaction.discount_amount)}
                </span>
              </div>
            )}
            {transaction.loyalty_discount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Loyalty Discount</span>
                <span className="tabular-nums text-red-600">
                  -{formatCurrency(transaction.loyalty_discount)}
                </span>
              </div>
            )}
            {transaction.tip_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tip</span>
                <span className="tabular-nums text-gray-700">
                  {formatCurrency(transaction.tip_amount)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-semibold tabular-nums text-gray-900">
                  {formatCurrency(transaction.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Loyalty info */}
        {(transaction.loyalty_points_earned > 0 || transaction.loyalty_points_redeemed > 0) && (
          <div className="mb-6 rounded-lg border border-gray-200 px-4 py-3">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Loyalty</h2>
            <div className="flex gap-6 text-sm">
              {transaction.loyalty_points_earned > 0 && (
                <div>
                  <span className="text-gray-500">Points Earned: </span>
                  <span className="font-medium text-green-700">
                    +{transaction.loyalty_points_earned}
                  </span>
                </div>
              )}
              {transaction.loyalty_points_redeemed > 0 && (
                <div>
                  <span className="text-gray-500">Points Redeemed: </span>
                  <span className="font-medium text-amber-700">
                    -{transaction.loyalty_points_redeemed}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {transaction.notes && (
          <div className="mb-6 rounded-lg border border-gray-200 px-4 py-3">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">Notes</h2>
            <p className="text-sm text-gray-600">{transaction.notes}</p>
          </div>
        )}

        {/* Refund History */}
        {transaction.refunds.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Refund History</h2>
            <div className="space-y-3">
              {transaction.refunds.map((refund) => (
                <div
                  key={refund.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(refund.amount)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(refund.created_at)}
                      </p>
                      {refund.reason && (
                        <p className="mt-1 text-xs text-gray-500">
                          Reason: {refund.reason}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        REFUND_STATUS_CLASSES[refund.status] ?? 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {refund.status.charAt(0).toUpperCase() + refund.status.slice(1)}
                    </span>
                  </div>

                  {/* Refund items */}
                  {refund.refund_items && refund.refund_items.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-2">
                      <p className="mb-1 text-xs font-medium text-gray-400">Items Refunded</p>
                      {refund.refund_items.map((ri) => {
                        const txItem = transaction.items.find(
                          (i) => i.id === ri.transaction_item_id
                        );
                        return (
                          <div
                            key={ri.id}
                            className="flex items-center justify-between text-xs text-gray-600"
                          >
                            <span>
                              {txItem?.item_name ?? 'Unknown Item'} x{ri.quantity}
                              {ri.restock && (
                                <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 text-blue-600">
                                  restocked
                                </span>
                              )}
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
          <div className="mb-6 rounded-lg border border-gray-200 px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Send Receipt</h2>
            <ReceiptOptions
              transactionId={transactionId}
              customerEmail={transaction.customer?.email ?? null}
              customerPhone={transaction.customer?.phone ?? null}
            />
          </div>
        )}

        {/* Action buttons */}
        {(canRefund || canVoid) && (
          <div className="flex gap-3 border-t border-gray-200 pt-4">
            {canRefund && (
              <Button
                variant="destructive"
                onClick={() => setShowRefundDialog(true)}
              >
                Issue Refund
              </Button>
            )}
            {canVoid && (
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowVoidConfirm(true)}
              >
                <Ban className="mr-1.5 h-4 w-4" />
                Void Transaction
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Void Confirmation Modal */}
      {showVoidConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Void Transaction</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to void this transaction? This action is irreversible
              and will mark the transaction as voided.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowVoidConfirm(false)}
                disabled={voiding}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleVoid}
                disabled={voiding}
              >
                {voiding ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Voiding...
                  </>
                ) : (
                  'Void Transaction'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

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
