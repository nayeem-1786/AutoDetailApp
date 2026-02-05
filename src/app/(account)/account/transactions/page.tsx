'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { formatCurrency, formatDate, formatPoints } from '@/lib/utils/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CalendarDays, DollarSign, ShoppingCart, Award, Printer, Mail, Loader2, Check } from 'lucide-react';
import { generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';
import type { ColumnDef } from '@tanstack/react-table';

interface TransactionSummary {
  id: string;
  receipt_number: string | null;
  status: string;
  total_amount: number;
  transaction_date: string;
  vehicles: {
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  } | null;
}

interface Stats {
  total_visits: number;
  lifetime_spend: number;
  loyalty_balance: number;
  member_since: string | null;
}

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'default'> = {
  completed: 'success',
  refunded: 'destructive',
};

export default function AccountTransactionsPage() {
  const { customer } = useCustomerAuth();
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Receipt dialog state
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [receiptTransaction, setReceiptTransaction] = useState<any>(null);
  const [receiptHtml, setReceiptHtml] = useState('');
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [receiptEmailing, setReceiptEmailing] = useState(false);
  const [receiptEmailed, setReceiptEmailed] = useState(false);
  const [showReceiptEmailInput, setShowReceiptEmailInput] = useState(false);
  const [receiptEmailInput, setReceiptEmailInput] = useState('');

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/customer/transactions?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setTransactions(json.data ?? []);
      setStats(json.stats ?? null);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    loadTransactions();
  }, [customer, loadTransactions]);

  // Receipt dialog handlers
  async function openReceiptDialog(transactionId: string) {
    setLoadingReceipt(true);
    setReceiptDialogOpen(true);
    setReceiptEmailed(false);
    setShowReceiptEmailInput(false);

    try {
      const res = await fetch(`/api/customer/transactions/${transactionId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load transaction');

      const tx = json.data;
      const rcfg: MergedReceiptConfig | undefined = json.receipt_config ?? undefined;
      setReceiptTransaction(tx);
      setReceiptEmailInput(customer?.email || '');

      const html = generateReceiptHtml({
        receipt_number: tx.receipt_number,
        transaction_date: tx.transaction_date,
        subtotal: tx.subtotal,
        tax_amount: tx.tax_amount,
        discount_amount: tx.discount_amount,
        coupon_code: tx.coupon_code,
        loyalty_discount: tx.loyalty_discount,
        loyalty_points_redeemed: tx.loyalty_points_redeemed,
        tip_amount: tx.tip_amount,
        total_amount: tx.total_amount,
        customer: tx.customer,
        employee: tx.employee,
        vehicle: tx.vehicles,
        items: tx.transaction_items ?? [],
        payments: tx.payments ?? [],
      }, rcfg);
      setReceiptHtml(html);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load receipt');
      setReceiptDialogOpen(false);
    } finally {
      setLoadingReceipt(false);
    }
  }

  function handleReceiptPrint() {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      toast.error('Pop-up blocked — please allow pop-ups and try again');
      return;
    }
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handleReceiptEmail(email: string) {
    if (!email || !receiptTransaction) return;
    setReceiptEmailing(true);
    try {
      const res = await fetch('/api/pos/receipts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: receiptTransaction.id, email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Email failed');
      setReceiptEmailed(true);
      setShowReceiptEmailInput(false);
      toast.success(`Receipt sent to ${email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setReceiptEmailing(false);
    }
  }

  // Format vehicle for display
  function formatVehicle(vehicle: TransactionSummary['vehicles']): string {
    if (!vehicle) return '—';
    const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '—';
  }

  // Table columns
  const columns: ColumnDef<TransactionSummary, unknown>[] = [
    {
      id: 'date',
      header: 'Date',
      accessorFn: (row) => row.transaction_date,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.original.transaction_date)}
        </span>
      ),
    },
    {
      id: 'receipt',
      header: 'Receipt #',
      cell: ({ row }) => {
        const receiptNum = row.original.receipt_number;
        if (!receiptNum) return <span className="text-sm text-gray-400">—</span>;
        return (
          <button
            type="button"
            onClick={() => openReceiptDialog(row.original.id)}
            className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
          >
            {receiptNum}
          </button>
        );
      },
    },
    {
      id: 'vehicle',
      header: 'Vehicle',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatVehicle(row.original.vehicles)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge variant={STATUS_VARIANTS[status] || 'default'}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        );
      },
    },
    {
      id: 'total',
      header: () => <div className="text-right">Total</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm font-medium text-gray-900">
          {formatCurrency(row.original.total_amount)}
        </div>
      ),
    },
  ];

  if (!customer) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
      <p className="mt-1 text-sm text-gray-600">
        View your past purchases and receipts. Click any receipt number to view or print.
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          {stats && (
            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <CalendarDays className="h-4 w-4" />
                    Member Since
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {stats.member_since ? formatDate(stats.member_since) : 'N/A'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <ShoppingCart className="h-4 w-4" />
                    Total Visits
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {stats.total_visits}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <DollarSign className="h-4 w-4" />
                    Lifetime Spend
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatCurrency(stats.lifetime_spend)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Award className="h-4 w-4" />
                    Loyalty Points
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatPoints(stats.loyalty_balance)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Transactions Table */}
          <Card className="mt-6">
            <CardContent className="pt-6">
              <DataTable
                columns={columns}
                data={transactions}
                emptyTitle="No transactions yet"
                emptyDescription="Your completed purchases will appear here."
                pageSize={10}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Receipt Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogClose onClose={() => setReceiptDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            Receipt {receiptTransaction?.receipt_number ? `#${receiptTransaction.receipt_number}` : ''}
          </DialogTitle>
        </DialogHeader>
        <DialogContent className="max-h-[60vh] overflow-y-auto">
          {loadingReceipt ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : (
            <div
              className="rounded border border-gray-200 bg-gray-50 p-2"
              dangerouslySetInnerHTML={{ __html: receiptHtml }}
            />
          )}
        </DialogContent>
        {!loadingReceipt && receiptTransaction && (
          <DialogFooter className="flex-col items-stretch gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReceiptPrint}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Print
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const email = customer?.email;
                  if (email) {
                    handleReceiptEmail(email);
                  } else {
                    setShowReceiptEmailInput(true);
                  }
                }}
                disabled={receiptEmailing || receiptEmailed}
              >
                {receiptEmailing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : receiptEmailed ? (
                  <Check className="mr-1.5 h-4 w-4 text-green-500" />
                ) : (
                  <Mail className="mr-1.5 h-4 w-4" />
                )}
                Email
              </Button>
            </div>

            {/* Email input */}
            {showReceiptEmailInput && (
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={receiptEmailInput}
                  onChange={(e) => setReceiptEmailInput(e.target.value)}
                  placeholder="your@email.com"
                  className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleReceiptEmail(receiptEmailInput);
                  }}
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => handleReceiptEmail(receiptEmailInput)}
                  disabled={!receiptEmailInput || receiptEmailing}
                >
                  Send
                </Button>
              </div>
            )}
          </DialogFooter>
        )}
      </Dialog>
    </div>
  );
}
