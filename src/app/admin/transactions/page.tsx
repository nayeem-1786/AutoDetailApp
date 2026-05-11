'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { TRANSACTION_STATUS_LABELS } from '@/lib/utils/constants';
import type {
  Transaction,
  TransactionItem,
  Customer,
  Employee,
} from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePermission } from '@/lib/hooks/use-permission';
import { useTableState } from '@/lib/hooks/useTableState';
import { TableToolbar, type FilterConfig } from '@/components/admin/table-toolbar';
import type { FilterValue } from '@/lib/hooks/useTableState';
import { RevenueStats } from './components/revenue-stats';
import { PaymentBreakdown } from './components/payment-breakdown';
import { ReceiptDialog } from '@/components/admin/receipt-dialog';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format transaction date: Today, Yesterday, or MM/DD/YY (PST) */
function formatTxnDate(iso: string): string {
  const d = new Date(iso);
  const pstStr = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  if (pstStr === todayStr) return 'Today';
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = yesterday.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  if (pstStr === yesterdayStr) return 'Yesterday';
  // MM/DD/YY
  const [month, day, year] = pstStr.split('/');
  return `${month}/${day}/${year.slice(2)}`;
}

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

const DEFAULT_FILTERS = {
  status: 'all',
  datePreset: 'this_month' as string,
  // Phase 1A.5 Part A: payment-method filter (top-level) + digital_platform
  // sub-filter (only consulted when method='digital').
  paymentMethod: 'all',
  digitalPlatform: 'all',
};

export default function AdminTransactionsPage() {
  const supabase = createClient();
  const { granted: canExport } = usePermission('reports.export');
  const { granted: canViewRevenue } = usePermission('reports.revenue');
  const { granted: canViewFinancialDetail } = usePermission('reports.financial_detail');
  const { granted: canViewEmployeeTips } = usePermission('reports.employee_tips');
  const { granted: canViewOwnTips } = usePermission('reports.own_tips');

  const table = useTableState({ defaultFilters: DEFAULT_FILTERS, defaultPageSize: PAGE_SIZE });

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  // Close-out rows show $0.00 — without this map, staff can't tell from a
  // list scan whether a row is real revenue or junk. Single batched query
  // by appointment_id keyed off rows whose notes match the close-out marker.
  const [appointmentTotalsByApptId, setAppointmentTotalsByApptId] = useState<
    Map<string, number>
  >(new Map());

  // Convenience filter accessors
  const statusFilter = (table.filters.status as string) || 'all';
  const activePreset = (table.filters.datePreset as string) || 'this_month';
  const paymentMethodFilter = (table.filters.paymentMethod as string) || 'all';
  const digitalPlatformFilter = (table.filters.digitalPlatform as string) || 'all';

  // Compute date range from the active preset
  const dateRange = useMemo(() => computeDateRange(activePreset as DatePreset), [activePreset]);

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
      pageNum: number,
      sortCol?: string,
      sortDir?: 'asc' | 'desc',
      // Phase 1A-followup FIX 1: pass payment-method + digital-platform filters
      // as arguments. Phase 1A.5 had these as captured closure values inside a
      // useCallback with deps=[], which froze the values at first render
      // ('all'/'all') — the filter UI updated but the query body always saw
      // stale 'all'. Routing through arguments matches the existing pattern
      // (status filter is already passed in this way) and keeps the empty
      // deps array semantically correct.
      paymentMethod: string = 'all',
      digitalPlatform: string = 'all'
    ) => {
      setLoading(true);
      try {
        const offset = pageNum * PAGE_SIZE;

        // Determine sort column — map UI column IDs to DB column names
        const dbSortCol = sortCol === 'total_amount' ? 'total_amount'
          : sortCol === 'receipt_number' ? 'receipt_number'
          : 'transaction_date';
        const ascending = sortDir === 'asc';

        let query = supabase
          .from('transactions')
          .select(
            '*, customer:customers(id, first_name, last_name, phone), employee:employees(id, first_name, last_name), items:transaction_items(id, item_name)',
            { count: 'exact' }
          )
          .order(dbSortCol, { ascending })
          .range(offset, offset + PAGE_SIZE - 1);

        // Status filter
        if (status !== 'all') {
          query = query.eq('status', status);
        }

        // Phase 1A.5 Part A: payment-method filter + optional digital-platform
        // sub-filter. The transactions.payment_method column carries the
        // aggregate ('cash'/'card'/'check'/'split'/'digital'). For digital
        // sub-filter, we need to query payments.digital_platform — but a raw
        // inner join would duplicate transaction rows when a transaction has
        // multiple payments. Instead we resolve via a separate query for
        // matching transaction_ids and constrain with .in() — guarantees
        // dedupe and preserves the existing pagination shape.
        if (paymentMethod !== 'all') {
          query = query.eq('payment_method', paymentMethod);
        }
        // The .in('id', txIds) clause below is the server-side EXISTS-equivalent:
        // it generates `WHERE id IN (uuid1, uuid2, ...)` which Postgres dedupes
        // automatically (id is PK). The JS `new Set()` only defends against the
        // unlikely case of duplicate transaction_id values in the payments
        // lookup (which can't happen given the schema, but is cheap insurance).
        if (paymentMethod === 'digital' && digitalPlatform !== 'all') {
          const { data: matchingPaymentTxs } = await supabase
            .from('payments')
            .select('transaction_id')
            .eq('digital_platform', digitalPlatform)
            .limit(1000);
          const txIds = Array.from(
            new Set((matchingPaymentTxs ?? []).map((p: { transaction_id: string }) => p.transaction_id))
          );
          if (txIds.length === 0) {
            // No transactions match the sub-filter — short-circuit to empty.
            setTransactions([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }
          query = query.in('id', txIds);
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

        // Search filter
        if (searchQuery.trim()) {
          const term = searchQuery.trim();
          const digits = term.replace(/\D/g, '');
          const isPhoneSearch = digits.length >= 2 && digits.length === term.replace(/[\s()-]/g, '').length;

          const receiptPattern = `%${term}%`;

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
          const rows = (data as unknown as TransactionRow[]) ?? [];
          setTransactions(rows);
          // Batched lookup of appointment.total_amount for close-out rows so
          // the list can show "$0.00 / ($X.XX paid to appt)" without an
          // N+1 fetch per row. Walk-in / non-close-out rows are skipped.
          const closeOutApptIds = Array.from(
            new Set(
              rows
                .filter(
                  (r) =>
                    r.notes === 'Closed out — fully pre-paid' && r.appointment_id
                )
                .map((r) => r.appointment_id as string)
            )
          );
          if (closeOutApptIds.length > 0) {
            const { data: appts } = await supabase
              .from('appointments')
              .select('id, total_amount')
              .in('id', closeOutApptIds);
            const map = new Map<string, number>();
            for (const a of appts ?? []) {
              map.set(a.id as string, Number(a.total_amount));
            }
            setAppointmentTotalsByApptId(map);
          } else {
            setAppointmentTotalsByApptId(new Map());
          }
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

  // ---------- Fetch on state changes ----------

  // Track whether initial load is done to avoid double-fetch
  const didInitialFetch = useRef(false);

  useEffect(() => {
    didInitialFetch.current = true;
    fetchTransactions(
      table.debouncedSearch,
      statusFilter,
      dateRange.from,
      dateRange.to,
      table.page - 1,
      table.sort?.column,
      table.sort?.direction,
      paymentMethodFilter,
      digitalPlatformFilter
    );
    // Also refresh stats when on page 1
    if (table.page === 1) {
      fetchStats(statusFilter, dateRange.from, dateRange.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.debouncedSearch, statusFilter, dateRange.from, dateRange.to, table.page, table.sort?.column, table.sort?.direction, paymentMethodFilter, digitalPlatformFilter]);

  // Handle preset click — fires via filter change, which triggers fetchTransactions via the effect above
  function handlePresetClick(preset: DatePreset) {
    table.setFilter('datePreset', preset);
    table.setPage(1);
  }

  // Toolbar filters
  const toolbarFilters: FilterConfig[] = useMemo(() => {
    const filters: FilterConfig[] = [
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { label: 'All Statuses', value: 'all' },
          { label: 'Completed', value: 'completed' },
          { label: 'Voided', value: 'voided' },
          { label: 'Refunded', value: 'refunded' },
          { label: 'Partial Refund', value: 'partial_refund' },
          { label: 'Open', value: 'open' },
        ],
      },
      // Phase 1A.5 Part A: payment-method filter.
      {
        key: 'paymentMethod',
        label: 'Payment Method',
        type: 'select',
        options: [
          { label: 'All Methods', value: 'all' },
          { label: 'Cash', value: 'cash' },
          { label: 'Card', value: 'card' },
          { label: 'Check', value: 'check' },
          { label: 'Split', value: 'split' },
          { label: 'Digital', value: 'digital' },
        ],
      },
    ];
    // Sub-filter for digital platform — only surfaced when method='digital'.
    if (paymentMethodFilter === 'digital') {
      filters.push({
        key: 'digitalPlatform',
        label: 'Digital Platform',
        type: 'select',
        options: [
          { label: 'All Platforms', value: 'all' },
          { label: 'Zelle', value: 'zelle' },
          { label: 'Venmo', value: 'venmo' },
          { label: 'AppleCash', value: 'apple_cash' },
        ],
      });
    }
    return filters;
  }, [paymentMethodFilter]);

  // Sort helper for column headers
  function handleHeaderSort(column: string) {
    if (table.sort?.column === column) {
      if (table.sort.direction === 'asc') {
        table.setSort({ column, direction: 'desc' });
      } else {
        table.setSort(null); // clear sort
      }
    } else {
      table.setSort({ column, direction: 'desc' });
    }
  }

  function SortIndicator({ column }: { column: string }) {
    if (table.sort?.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
    return table.sort.direction === 'asc'
      ? <ChevronUp className="h-4 w-4 text-gray-700" />
      : <ChevronDown className="h-4 w-4 text-gray-700" />;
  }

  const startIndex = (table.page - 1) * PAGE_SIZE;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={
          loading ? 'Loading...' : `${totalCount} transaction${totalCount !== 1 ? 's' : ''}`
        }
      />

      {/* Revenue Stats — gated by reports.revenue */}
      {canViewRevenue && (
        <RevenueStats
          revenue={stats?.revenue ?? 0}
          transactionCount={stats?.transactionCount ?? 0}
          avgTicket={stats?.avgTicket ?? 0}
          tips={stats?.tips ?? 0}
          newCustomers={stats?.newCustomers ?? 0}
          winBacks={stats?.winBacks ?? 0}
          loading={statsLoading}
          showTips={canViewEmployeeTips || canViewOwnTips}
        />
      )}

      {/* Payment Breakdown — gated by reports.financial_detail */}
      {canViewFinancialDetail && (
        <PaymentBreakdown
          methods={stats?.paymentMethods ?? []}
          loading={statsLoading}
        />
      )}

      {/* Date preset chips */}
      <Card>
        <CardContent className="p-4 space-y-4">
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
          <TableToolbar
            state={table}
            defaultFilters={DEFAULT_FILTERS}
            config={{
              searchPlaceholder: 'Search receipt #, name, or phone...',
              searchClassName: 'w-full sm:w-[28rem]',
              filters: toolbarFilters,
            }}
          />
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
                      <th
                        className="px-3 py-3 w-[72px] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('transaction_date')}
                      >
                        <div className="flex items-center gap-1">
                          Date <SortIndicator column="transaction_date" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-3 w-[72px] cursor-pointer select-none"
                        onClick={() => handleHeaderSort('receipt_number')}
                      >
                        <div className="flex items-center gap-1">
                          Receipt # <SortIndicator column="receipt_number" />
                        </div>
                      </th>
                      <th className="px-3 py-3 w-[144px]">Customer</th>
                      <th className="px-3 py-3">Services</th>
                      <th className="px-3 py-3 w-[100px]">Employee</th>
                      <th className="px-3 py-3 w-[70px]">Method</th>
                      <th className="px-3 py-3 w-[90px]">Status</th>
                      <th
                        className="px-3 py-3 w-[80px] text-right cursor-pointer select-none"
                        onClick={() => handleHeaderSort('total_amount')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Total <SortIndicator column="total_amount" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((tx) => (
                      <TransactionTableRow
                        key={tx.id}
                        tx={tx}
                        onReceiptClick={() => setReceiptTransactionId(tx.id)}
                        appointmentGross={
                          tx.notes === 'Closed out — fully pre-paid' && tx.appointment_id
                            ? appointmentTotalsByApptId.get(tx.appointment_id) ?? null
                            : null
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                  <p className="text-sm text-gray-600">
                    Page {table.page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={table.page <= 1}
                      onClick={() => table.setPage(table.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={table.page >= totalPages}
                      onClick={() => table.setPage(table.page + 1)}
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
  appointmentGross,
}: {
  tx: TransactionRow;
  onReceiptClick: () => void;
  /** Set only when this row is a close-out and the parent loaded the
   * appointment.total_amount. Renders the "($X.XX paid to appt)" subtitle
   * under the $0.00 total so list scans show real revenue, not zeros. */
  appointmentGross: number | null;
}) {
  return (
    <tr className="transition-colors hover:bg-gray-50">
      <td className="whitespace-nowrap px-3 py-3 text-gray-600" title={formatDateTime(tx.transaction_date)}>
        {formatTxnDate(tx.transaction_date)}
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
        ) : tx.appointment_id ? (
          <span className="text-gray-500 italic text-xs">Online Booking</span>
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
        {appointmentGross !== null && (
          <div className="text-xs font-normal text-gray-500">
            ({formatCurrency(appointmentGross)} paid to appt)
          </div>
        )}
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
        : tx.appointment_id ? 'Online Booking' : '',
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
