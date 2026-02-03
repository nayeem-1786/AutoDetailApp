'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TRANSACTION_STATUS_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import type { Transaction } from '@/lib/supabase/types';

type TransactionWithRelations = Transaction & {
  customer: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  employee: { id: string; first_name: string; last_name: string } | null;
};

interface TransactionListProps {
  onSelect: (transaction: TransactionWithRelations) => void;
}

const PAGE_SIZE = 20;

const STATUS_BADGE_CLASSES: Record<string, string> = {
  completed: 'bg-green-50 text-green-700',
  refunded: 'bg-red-50 text-red-700',
  partial_refund: 'bg-amber-50 text-amber-700',
  voided: 'bg-gray-100 text-gray-500',
  open: 'bg-blue-50 text-blue-700',
};

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_year' | 'all' | 'custom';

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  this_month: 'This Month',
  this_year: 'This Year',
  all: 'All',
  custom: 'Custom',
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
      const diff = day === 0 ? 6 : day - 1; // Monday = start of week
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
    case 'custom':
      return { from: '', to: '' };
  }
}

export function TransactionList({ onSelect }: TransactionListProps) {
  const [query, setQuery] = useState('');
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const initialRange = useMemo(() => computeDateRange('today'), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchTransactions = useCallback(async (search: string, pageNum: number, from: string, to: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
      });
      // Convert local YYYY-MM-DD dates to UTC ISO boundaries so the
      // TIMESTAMPTZ comparison accounts for the user's timezone.
      if (from) {
        const [y, m, d] = from.split('-').map(Number);
        params.set('date_from', new Date(y, m - 1, d).toISOString());
      }
      if (to) {
        const [y, m, d] = to.split('-').map(Number);
        params.set('date_to', new Date(y, m - 1, d, 23, 59, 59, 999).toISOString());
      }

      const res = await fetch(`/api/pos/transactions/search?${params}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      const json = await res.json();
      setTransactions(json.data ?? []);
      setTotal(json.count ?? 0);
    } catch {
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when page changes
  useEffect(() => {
    fetchTransactions(query, page, dateFrom, dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      fetchTransactions(query, 0, dateFrom, dateTo);
    }, 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handlePresetClick(preset: DatePreset) {
    setActivePreset(preset);
    if (preset === 'custom') return; // don't auto-fetch, user picks dates
    const range = computeDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPage(0);
    fetchTransactions(query, 0, range.from, range.to);
  }

  function handleCustomDateChange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    setPage(0);
    fetchTransactions(query, 0, from, to);
  }

  const startIndex = page * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, total);

  const presets: DatePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'all', 'custom'];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Filters */}
      <div className="border-b border-gray-200 p-4 space-y-3">
        {/* Date preset chips */}
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activePreset === preset
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {activePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleCustomDateChange(e.target.value, dateTo)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleCustomDateChange(dateFrom, e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {/* Search bar */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Receipt # or phone..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-gray-500">No transactions found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => onSelect(tx)}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                    {tx.receipt_number ?? '---'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatDateTime(tx.transaction_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {tx.customer
                      ? `${tx.customer.first_name} ${tx.customer.last_name}`
                      : 'Walk-in'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {tx.payment_method
                      ? tx.payment_method.charAt(0).toUpperCase() + tx.payment_method.slice(1)
                      : '---'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                    {formatCurrency(tx.total_amount)}
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">
            Showing {startIndex + 1}-{endIndex} of {total}
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
              disabled={endIndex >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
