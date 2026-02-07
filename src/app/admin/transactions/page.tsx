'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime, formatPhone, formatRelativeDate } from '@/lib/utils/format';
import { TRANSACTION_STATUS_LABELS } from '@/lib/utils/constants';
import type {
  Transaction,
  TransactionItem,
  Payment,
  Refund,
  RefundItem,
  Customer,
  Employee,
} from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  ChevronDown,
  ChevronUp,
  Printer,
  Mail,
  MessageSquare,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionRow = Transaction & {
  customer: Pick<Customer, 'id' | 'first_name' | 'last_name' | 'phone'> | null;
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name'> | null;
  items: Pick<TransactionItem, 'id' | 'item_name'>[];
};

type FullTransaction = Transaction & {
  customer: Customer | null;
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name'> | null;
  items: TransactionItem[];
  payments: Payment[];
  refunds: (Refund & { refund_items: RefundItem[] })[];
};

// ---------------------------------------------------------------------------
// Status badge colors (matching POS)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Date presets
// ---------------------------------------------------------------------------

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_year' | 'all';

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  this_month: 'This Month',
  this_year: 'This Year',
  all: 'All',
};

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = toLocalDateString(now);

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yd = toLocalDateString(y);
      return { from: yd, to: yd };
    }
    case 'this_week': {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(monday.getDate() - diff);
      return { from: toLocalDateString(monday), to: today };
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toLocalDateString(first), to: today };
    }
    case 'this_year': {
      const jan1 = new Date(now.getFullYear(), 0, 1);
      return { from: toLocalDateString(jan1), to: today };
    }
    case 'all':
      return { from: '', to: '' };
  }
}

// ---------------------------------------------------------------------------
// Detail Panel Component
// ---------------------------------------------------------------------------

function TransactionDetailPanel({
  transactionId,
  onClose,
}: {
  transactionId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [transaction, setTransaction] = useState<FullTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingPrint, setSendingPrint] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select(
          '*, customer:customers(*), employee:employees(id, first_name, last_name), items:transaction_items(*), payments(*), refunds(*, refund_items(*))'
        )
        .eq('id', transactionId)
        .single();

      if (error) {
        console.error('Error loading transaction detail:', error);
        setTransaction(null);
      } else {
        setTransaction(data as unknown as FullTransaction);
      }
      setLoading(false);
    }
    load();
  }, [transactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePrint() {
    setSendingPrint(true);
    try {
      const res = await fetch('/api/pos/receipts/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to print receipt');
      } else {
        toast.success('Print receipt sent');
      }
    } catch {
      toast.error('Failed to print receipt');
    } finally {
      setSendingPrint(false);
    }
  }

  async function handleEmail() {
    if (!transaction?.customer?.email) {
      toast.error('Customer has no email on file');
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch('/api/pos/receipts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          email: transaction.customer.email,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to email receipt');
      } else {
        toast.success('Receipt emailed');
      }
    } catch {
      toast.error('Failed to email receipt');
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleSms() {
    if (!transaction?.customer?.phone) {
      toast.error('Customer has no phone on file');
      return;
    }
    setSendingSms(true);
    try {
      const res = await fetch('/api/pos/receipts/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          phone: transaction.customer.phone,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to send SMS receipt');
      } else {
        toast.success('Receipt sent via SMS');
      }
    } catch {
      toast.error('Failed to send SMS receipt');
    } finally {
      setSendingSms(false);
    }
  }

  if (loading) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 p-6">
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Transaction not found</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const showReceipt =
    transaction.status === 'completed' ||
    transaction.status === 'voided' ||
    transaction.status === 'refunded' ||
    transaction.status === 'partial_refund';

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-6 py-5">
      {/* Close button */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Transaction Detail &mdash; Receipt #{transaction.receipt_number ?? '---'}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Customer & Employee, Items */}
        <div className="space-y-5">
          {/* Customer & Employee info */}
          <div className="grid grid-cols-2 gap-4 rounded-lg bg-white p-4 shadow-sm">
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
                  {transaction.customer.email && (
                    <p className="text-sm text-gray-500">{transaction.customer.email}</p>
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
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">Items</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="pb-2 pr-4">Item</th>
                  <th className="pb-2 pr-4 text-center">Qty</th>
                  <th className="pb-2 pr-4 text-right">Unit</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transaction.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-4 text-gray-900">
                      <span>{item.item_name}</span>
                      {item.tier_name && (
                        <span className="ml-1.5 text-xs text-gray-400">
                          ({item.tier_name})
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-center tabular-nums text-gray-600">
                      {item.quantity}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-600">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-gray-900">
                      {formatCurrency(item.total_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Payments, Totals, Refunds, Receipt */}
        <div className="space-y-5">
          {/* Payments */}
          {transaction.payments.length > 0 && (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">Payments</h4>
              <div className="space-y-2">
                {transaction.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
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
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">Totals</h4>
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

          {/* Refund History */}
          {transaction.refunds && transaction.refunds.length > 0 && (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">
                Refund History
              </h4>
              <div className="space-y-3">
                {transaction.refunds.map((refund) => (
                  <div
                    key={refund.id}
                    className="rounded-lg border border-gray-100 p-3"
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
                    {refund.refund_items && refund.refund_items.length > 0 && (
                      <div className="mt-2 border-t border-gray-100 pt-2">
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

          {/* Notes */}
          {transaction.notes && (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Notes</h4>
              <p className="text-sm text-gray-600">{transaction.notes}</p>
            </div>
          )}

          {/* Receipt Actions */}
          {showReceipt && (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">
                Send Receipt
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  disabled={sendingPrint}
                >
                  {sendingPrint ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEmail}
                  disabled={sendingEmail || !transaction.customer?.email}
                >
                  {sendingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSms}
                  disabled={sendingSms || !transaction.customer?.phone}
                >
                  {sendingSms ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  SMS
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const DATE_PRESETS: DatePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'all'];

export default function AdminTransactionsPage() {
  const supabase = createClient();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activePreset, setActivePreset] = useState<DatePreset>('this_month');
  const initialRange = useMemo(() => computeDateRange('this_month'), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);

  // Detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---------- Data fetching ----------

  const fetchTransactions = useCallback(
    async (
      searchQuery: string,
      status: string,
      from: string,
      to: string,
      pageNum: number
    ) => {
      setLoading(true);
      try {
        const offset = pageNum * PAGE_SIZE;
        let query = supabase
          .from('transactions')
          .select(
            '*, customer:customers(id, first_name, last_name, phone), employee:employees(id, first_name, last_name), items:transaction_items(id, item_name)',
            { count: 'exact' }
          )
          .order('transaction_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        // Status filter
        if (status !== 'all') {
          query = query.eq('status', status);
        }

        // Date range filter
        if (from) {
          const [y, m, d] = from.split('-').map(Number);
          query = query.gte('transaction_date', new Date(y, m - 1, d).toISOString());
        }
        if (to) {
          const [y, m, d] = to.split('-').map(Number);
          query = query.lte(
            'transaction_date',
            new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
          );
        }

        // Search filter — PostgREST doesn't support .or() on related tables,
        // so we search customers first, then filter transactions by matching IDs.
        if (searchQuery.trim()) {
          const term = searchQuery.trim();
          const digits = term.replace(/\D/g, '');
          const isPhoneSearch = digits.length >= 2 && digits.length === term.replace(/[\s()-]/g, '').length;

          // Always try receipt number match
          const receiptPattern = `%${term}%`;

          // Search customers separately to get matching IDs
          let customerQuery = supabase
            .from('customers')
            .select('id')
            .limit(50);

          if (isPhoneSearch) {
            customerQuery = customerQuery.like('phone', `%${digits}%`);
          } else {
            customerQuery = customerQuery.or(
              `first_name.ilike.%${term}%,last_name.ilike.%${term}%`
            );
          }

          const { data: matchingCustomers } = await customerQuery;
          const customerIds = (matchingCustomers ?? []).map((c: { id: string }) => c.id);

          if (customerIds.length > 0) {
            query = query.or(
              `receipt_number.ilike.${receiptPattern},customer_id.in.(${customerIds.join(',')})`
            );
          } else {
            query = query.ilike('receipt_number', receiptPattern);
          }
        }

        const { data, count, error } = await query;

        if (error) {
          console.error('Error loading transactions:', error);
          setTransactions([]);
          setTotalCount(0);
        } else {
          setTransactions((data as unknown as TransactionRow[]) ?? []);
          setTotalCount(count ?? 0);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setTransactions([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Initial load and page changes
  useEffect(() => {
    fetchTransactions(search, statusFilter, dateFrom, dateTo, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      fetchTransactions(search, statusFilter, dateFrom, dateTo, 0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Immediate re-fetch on status or date change
  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(0);
    fetchTransactions(search, value, dateFrom, dateTo, 0);
  }

  function handlePresetClick(preset: DatePreset) {
    setActivePreset(preset);
    const range = computeDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPage(0);
    fetchTransactions(search, statusFilter, range.from, range.to, 0);
  }

  const startIndex = page * PAGE_SIZE;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={
          loading ? 'Loading...' : `${totalCount} transaction${totalCount !== 1 ? 's' : ''}`
        }
      />

      {/* Filters row */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Date preset chips */}
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activePreset === preset
                    ? 'bg-gray-900 text-white'
                    : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
          </div>

          {/* Search + Status filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search receipt #, name, or phone..."
              className="w-full sm:w-80"
            />
            <Select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full sm:w-44"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="refunded">Refunded</option>
              <option value="partial_refund">Partial Refund</option>
              <option value="open">Open</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-lg font-medium text-gray-900">No transactions found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or date range.
              </p>
            </div>
          ) : (
            <>
              {/* Export button */}
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-600">
                  Showing {startIndex + 1}-
                  {Math.min(startIndex + PAGE_SIZE, totalCount)} of {totalCount}
                </p>
                <ExportButton transactions={transactions} />
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Receipt #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Services</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((tx) => {
                      const isExpanded = expandedId === tx.id;
                      return (
                        <TransactionTableRow
                          key={tx.id}
                          tx={tx}
                          isExpanded={isExpanded}
                          onToggle={() => setExpandedId(isExpanded ? null : tx.id)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                  <p className="text-sm text-gray-600">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page + 1 >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Row with expansion
// ---------------------------------------------------------------------------

function TransactionTableRow({
  tx,
  isExpanded,
  onToggle,
}: {
  tx: TransactionRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-gray-50"
      >
        <td className="whitespace-nowrap px-4 py-3 text-gray-600" title={formatDateTime(tx.transaction_date)}>
          {formatRelativeDate(tx.transaction_date)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
          {tx.receipt_number ?? '---'}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {tx.customer ? (
            <a
              href={`/admin/customers/${tx.customer.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              {tx.customer.first_name} {tx.customer.last_name}
            </a>
          ) : (
            <span className="text-gray-600">Walk-in</span>
          )}
        </td>
        <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-600" title={
          tx.items?.map((i: { item_name: string }) => i.item_name).join(', ') || ''
        }>
          {tx.items && tx.items.length > 0 ? (
            <>
              {tx.items.slice(0, 2).map((i: { item_name: string }) => i.item_name).join(', ')}
              {tx.items.length > 2 && <span className="text-gray-400"> +{tx.items.length - 2}</span>}
            </>
          ) : (
            <span className="text-gray-400">--</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {tx.employee ? (
            <a
              href={`/admin/staff/${tx.employee.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              {tx.employee.first_name} {tx.employee.last_name}
            </a>
          ) : (
            <span className="text-gray-600">---</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
          {tx.payment_method
            ? tx.payment_method.charAt(0).toUpperCase() + tx.payment_method.slice(1)
            : '---'}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_BADGE_CLASSES[tx.status] ?? 'bg-gray-100 text-gray-500'
            }`}
          >
            {TRANSACTION_STATUS_LABELS[tx.status] ?? tx.status}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
          {formatCurrency(tx.total_amount)}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <TransactionDetailPanel
              transactionId={tx.id}
              onClose={onToggle}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// CSV Export Button
// ---------------------------------------------------------------------------

function ExportButton({ transactions }: { transactions: TransactionRow[] }) {
  const handleExport = useCallback(() => {
    const headers = ['Date', 'Receipt #', 'Customer', 'Services', 'Employee', 'Method', 'Status', 'Total'];

    const rows = transactions.map((tx) => [
      tx.transaction_date ? new Date(tx.transaction_date).toLocaleString() : '',
      tx.receipt_number ?? '',
      tx.customer
        ? `${tx.customer.first_name} ${tx.customer.last_name}`
        : 'Walk-in',
      tx.items?.map((i: { item_name: string }) => i.item_name).join('; ') || '',
      tx.employee
        ? `${tx.employee.first_name} ${tx.employee.last_name}`
        : '',
      tx.payment_method ?? '',
      tx.status,
      tx.total_amount.toFixed(2),
    ]);

    const escapeCsvField = (field: string): string => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((row) => row.map(escapeCsvField).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transactions.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transactions]);

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      Export CSV
    </Button>
  );
}
