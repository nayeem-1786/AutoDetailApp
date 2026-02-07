'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { posFetch } from '../../lib/pos-fetch';
import { STATUS_BADGE_CONFIG, formatCurrency } from './quote-helpers';
import type { QuoteStatus } from '../../types';

interface QuoteItem {
  id: string;
  item_name: string;
}

interface QuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  sent_at: string | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
  } | null;
  items: QuoteItem[];
}

type StatusFilter = 'all' | QuoteStatus;

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'accepted', label: 'Accepted' },
];

interface QuoteListProps {
  onSelect: (quoteId: string) => void;
  onNewQuote: () => void;
}

export function QuoteList({ onSelect, onNewQuote }: QuoteListProps) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await posFetch(`/api/pos/quotes?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setQuotes(data.quotes || []);
      setTotal(data.total || 0);
    } catch {
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Quotes</h1>
        <button
          onClick={onNewQuote}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Quote
        </button>
      </div>

      {/* Search + Filters */}
      <div className="shrink-0 space-y-3 border-b border-gray-200 bg-white px-4 py-3">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === tab.key
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by quote #, customer name, or phone..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <p className="text-sm text-gray-400">No quotes found</p>
            <button
              onClick={onNewQuote}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Create your first quote
            </button>
          </div>
        ) : (
          <>
            {/* Showing count */}
            <div className="border-b border-gray-200 px-4 py-2">
              <p className="text-xs text-gray-500">
                Showing {startIndex + 1}-{Math.min(startIndex + limit, total)} of {total}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Quote #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Services</th>
                    <th className="px-4 py-3">Vehicle</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {quotes.map((quote) => {
                    const badge = STATUS_BADGE_CONFIG[quote.status];
                    const customerName = quote.customer
                      ? `${quote.customer.first_name} ${quote.customer.last_name}`
                      : 'No Customer';
                    const vehicleStr = quote.vehicle
                      ? `${quote.vehicle.year} ${quote.vehicle.make} ${quote.vehicle.model}`
                      : '';

                    return (
                      <tr
                        key={quote.id}
                        onClick={() => onSelect(quote.id)}
                        className="cursor-pointer transition-colors hover:bg-gray-50"
                      >
                        <td
                          className="whitespace-nowrap px-4 py-3 text-gray-600"
                          title={new Date(quote.created_at).toLocaleString()}
                        >
                          {formatRelativeDate(quote.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                          {quote.quote_number}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {customerName}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-4 py-3 text-gray-600"
                          title={
                            quote.items
                              ?.map((i) => i.item_name)
                              .join(', ') || ''
                          }
                        >
                          {quote.items && quote.items.length > 0 ? (
                            <>
                              {quote.items
                                .slice(0, 2)
                                .map((i) => i.item_name)
                                .join(', ')}
                              {quote.items.length > 2 && (
                                <span className="text-gray-400">
                                  {' '}
                                  +{quote.items.length - 2}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {vehicleStr || <span className="text-gray-400">--</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                              badge.bg,
                              badge.text
                            )}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                          {formatCurrency(quote.total_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 py-3">
          <p className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
