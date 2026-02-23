'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime, formatRelativeDate } from '@/lib/utils/format';
import { TRANSACTION_STATUS_LABELS } from '@/lib/utils/constants';
import type {
  Transaction,
  TransactionItem,
  Customer,
  Employee,
} from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePermission } from '@/lib/hooks/use-permission';
import { RevenueStats } from './components/revenue-stats';
import { PaymentBreakdown } from './components/payment-breakdown';
import { ReceiptDialog } from '@/components/admin/receipt-dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionRow = Transaction & {
  customer: Pick<Customer, 'id' | 'first_name' | 'last_name' | 'phone'> | null;
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name'> | null;
  items: Pick<TransactionItem, 'id' | 'item_name'>[];
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
// Main Page Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const DATE_PRESETS: DatePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'all'];

export default function AdminTransactionsPage() {
  const supabase = createClient();
  const { granted: canExport } = usePermission('reports.export');

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

  // Stats
  const [stats, setStats] = useState<{
    revenue: number;
    transactionCount: number;
    avgTicket: number;
    tips: number;
    newCustomers: number;
    winBacks: number;
    paymentMethods: Array<{
      method: string;
      total: number;
      count: number;
      percentage: number;
    }>;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Receipt dialog
  const [receiptTransactionId, setReceiptTransactionId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---------- Stats fetching ----------

  const fetchStats = useCallback(async (status: string, from: string, to: string) => {
    setStatsLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/admin/transactions/stats?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching transaction stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

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
    if (page === 0) {
      fetchStats(statusFilter, dateFrom, dateTo);
    }
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
    fetchStats(value, dateFrom, dateTo);
  }

  function handlePresetClick(preset: DatePreset) {
    setActivePreset(preset);
    const range = computeDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPage(0);
    fetchTransactions(search, statusFilter, range.from, range.to, 0);
    fetchStats(statusFilter, range.from, range.to);
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

      {/* Revenue Stats */}
      <RevenueStats
        revenue={stats?.revenue ?? 0}
        transactionCount={stats?.transactionCount ?? 0}
        avgTicket={stats?.avgTicket ?? 0}
        tips={stats?.tips ?? 0}
        newCustomers={stats?.newCustomers ?? 0}
        winBacks={stats?.winBacks ?? 0}
        loading={statsLoading}
      />

      {/* Payment Breakdown */}
      <PaymentBreakdown
        methods={stats?.paymentMethods ?? []}
        loading={statsLoading}
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
                {canExport && <ExportButton transactions={transactions} />}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-3 py-3 w-[72px]">Date</th>
                      <th className="px-3 py-3 w-[72px]">Receipt #</th>
                      <th className="px-3 py-3 w-[144px]">Customer</th>
                      <th className="px-3 py-3">Services</th>
                      <th className="px-3 py-3 w-[100px]">Employee</th>
                      <th className="px-3 py-3 w-[70px]">Method</th>
                      <th className="px-3 py-3 w-[90px]">Status</th>
                      <th className="px-3 py-3 w-[80px] text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((tx) => (
                      <TransactionTableRow
                        key={tx.id}
                        tx={tx}
                        onReceiptClick={() => setReceiptTransactionId(tx.id)}
                      />
                    ))}
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

      {/* Receipt Dialog */}
      <ReceiptDialog
        open={!!receiptTransactionId}
        onOpenChange={(open) => { if (!open) setReceiptTransactionId(null); }}
        transactionId={receiptTransactionId}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Row
// ---------------------------------------------------------------------------

function TransactionTableRow({
  tx,
  onReceiptClick,
}: {
  tx: TransactionRow;
  onReceiptClick: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-gray-50">
      <td className="whitespace-nowrap px-3 py-3 text-gray-600" title={formatDateTime(tx.transaction_date)}>
        {formatRelativeDate(tx.transaction_date)}
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        {tx.receipt_number ? (
          <button
            type="button"
            onClick={onReceiptClick}
            className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
          >
            {tx.receipt_number}
          </button>
        ) : (
          <span className="text-gray-400">---</span>
        )}
      </td>
      <td className="px-3 py-3 max-w-[144px] truncate">
        {tx.customer ? (
          <a
            href={`/admin/customers/${tx.customer.id}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            {tx.customer.first_name} {tx.customer.last_name}
          </a>
        ) : (
          <span className="text-gray-600">Walk-in</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-gray-600">
        {tx.items && tx.items.length > 0 ? (
          tx.items.map((i: { item_name: string }) => i.item_name).join(', ')
        ) : (
          <span className="text-gray-400">--</span>
        )}
      </td>
      <td className="px-3 py-3 max-w-[100px] truncate">
        {tx.employee ? (
          <a
            href={`/admin/staff/${tx.employee.id}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            {tx.employee.first_name}
          </a>
        ) : (
          <span className="text-gray-600">---</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-gray-600">
        {tx.payment_method
          ? tx.payment_method.charAt(0).toUpperCase() + tx.payment_method.slice(1)
          : '---'}
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_BADGE_CLASSES[tx.status] ?? 'bg-gray-100 text-gray-500'
          }`}
        >
          {TRANSACTION_STATUS_LABELS[tx.status] ?? tx.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-gray-900">
        {formatCurrency(tx.total_amount)}
      </td>
    </tr>
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
