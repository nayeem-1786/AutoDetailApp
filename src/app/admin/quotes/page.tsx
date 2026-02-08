'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE_VARIANT } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Plus, Eye, ExternalLink, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { PipelineStats } from './components/pipeline-stats';
import { QuoteMetrics } from './components/quote-metrics';
import { QuoteSlideOver } from './components/quote-slide-over';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuoteWithRelations = {
  id: string;
  quote_number: string;
  customer_id: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  valid_until: string | null;
  sent_at: string | null;
  access_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customer?: { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null;
  vehicle?: { id: string; year: number | null; make: string | null; model: string | null } | null;
  items?: Array<{ id: string; item_name: string; tier_name: string | null; quantity: number; unit_price: number; total_price: number }>;
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<QuoteWithRelations[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sentCounts, setSentCounts] = useState<Record<string, number>>({});
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [pipelineStats, setPipelineStats] = useState<Array<{ status: string; count: number; totalAmount: number }>>([]);
  const [metrics, setMetrics] = useState<{ averageValue: number; conversionRate: number; avgDaysToConvert: number; totalQuotes: number } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---------- Fetch quotes ----------

  const fetchQuotes = useCallback(
    async (
      searchQuery: string,
      status: string,
      from: string,
      to: string,
      pageNum: number
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(pageNum + 1)); // API uses 1-based pages
        params.set('limit', String(PAGE_SIZE));
        if (status !== 'all') params.set('status', status);
        if (searchQuery.trim()) params.set('search', searchQuery.trim());
        if (from) params.set('date_from', from);
        if (to) params.set('date_to', to);

        const res = await fetch(`/api/admin/quotes?${params.toString()}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          console.error('Error fetching quotes:', res.status);
          setQuotes([]);
          setTotalCount(0);
          return;
        }

        const data = await res.json();
        setQuotes(data.quotes ?? []);
        setTotalCount(data.total ?? 0);
        setSentCounts(data.sentCounts ?? {});
      } catch (err) {
        console.error('Unexpected error:', err);
        setQuotes([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ---------- Fetch stats (once on mount) ----------

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch('/api/admin/quotes/stats', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setPipelineStats(data.pipeline ?? []);
          setMetrics(data.metrics ?? null);
        }
      } catch (err) {
        console.error('Error loading stats:', err);
      }
    }
    loadStats();
  }, []);

  // ---------- Initial load and page changes ----------

  useEffect(() => {
    fetchQuotes(search, statusFilter, dateFrom, dateTo, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ---------- Debounced search ----------

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      fetchQuotes(search, statusFilter, dateFrom, dateTo, 0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ---------- Immediate re-fetch on filter changes ----------

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(0);
    fetchQuotes(search, value, dateFrom, dateTo, 0);
  }

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    setPage(0);
    fetchQuotes(search, statusFilter, value, dateTo, 0);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    setPage(0);
    fetchQuotes(search, statusFilter, dateFrom, value, 0);
  }

  function handleStatusClick(status: string | null) {
    const next = status ?? 'all';
    setStatusFilter(next);
    setPage(0);
    fetchQuotes(search, next, dateFrom, dateTo, 0);
  }

  // ---------- Derived ----------

  const startIndex = page * PAGE_SIZE;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Quotes"
        description={loading ? 'Loading...' : `${totalCount} total quotes`}
        action={
          <a href="/pos/quotes?mode=builder" target="_blank" rel="noopener noreferrer">
            <Button>
              <Plus className="h-4 w-4" />
              New Quote
            </Button>
          </a>
        }
      />

      {/* 2. Pipeline Stats */}
      <PipelineStats
        stats={pipelineStats}
        activeStatus={statusFilter === 'all' ? null : statusFilter}
        onStatusClick={handleStatusClick}
      />

      {/* 3. Quote Metrics */}
      {metrics && <QuoteMetrics metrics={metrics} />}

      {/* 4. Filters Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search quote # or customer..."
              className="w-full sm:w-80"
            />
            <Select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full sm:w-44"
            >
              <option value="all">All Statuses</option>
              {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* 5. Quotes Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-lg font-medium text-gray-900">No quotes found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or search terms.
              </p>
            </div>
          ) : (
            <>
              {/* Info bar */}
              <div className="border-b border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-600">
                  Showing {startIndex + 1}-
                  {Math.min(startIndex + PAGE_SIZE, totalCount)} of {totalCount}
                </p>
              </div>

              {/* Table */}
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
                      <th className="px-4 py-3">Days Open</th>
                      <th className="px-4 py-3 text-center">Sends</th>
                      <th className="px-4 py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quotes.map((q) => {
                      const customer = q.customer;
                      const items = q.items || [];
                      const itemNames = items.map((i) => i.item_name).filter(Boolean);
                      const itemsDisplay = itemNames.slice(0, 2).join(', ');
                      const itemsOverflow = itemNames.length > 2 ? ` +${itemNames.length - 2}` : '';
                      const vehicle = q.vehicle
                        ? [q.vehicle.year, q.vehicle.make, q.vehicle.model].filter(Boolean).join(' ')
                        : '';
                      const isOpenStatus = q.status !== 'converted' && q.status !== 'expired';
                      const daysOpen = isOpenStatus
                        ? Math.floor((Date.now() - new Date(q.created_at).getTime()) / 86400000)
                        : null;

                      return (
                        <tr
                          key={q.id}
                          onClick={() => setSelectedQuoteId(q.id)}
                          className="cursor-pointer transition-colors hover:bg-gray-50"
                        >
                          {/* Date */}
                          <td
                            className="whitespace-nowrap px-4 py-3 text-gray-600"
                            title={new Date(q.created_at).toLocaleString()}
                          >
                            {formatRelativeDate(q.created_at)}
                          </td>

                          {/* Quote # */}
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                            {q.quote_number}
                          </td>

                          {/* Customer */}
                          <td className="whitespace-nowrap px-4 py-3">
                            {customer ? (
                              <a
                                href={`/admin/customers/${customer.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {customer.first_name} {customer.last_name}
                              </a>
                            ) : (
                              <span className="text-gray-400">Unknown</span>
                            )}
                          </td>

                          {/* Services */}
                          <td
                            className="max-w-[200px] truncate px-4 py-3 text-gray-600"
                            title={itemNames.join(', ')}
                          >
                            {itemNames.length > 0 ? (
                              <>
                                {itemsDisplay}
                                {itemsOverflow && <span className="text-gray-400">{itemsOverflow}</span>}
                              </>
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </td>

                          {/* Vehicle */}
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                            {vehicle || <span className="text-gray-400">--</span>}
                          </td>

                          {/* Status */}
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge variant={QUOTE_STATUS_BADGE_VARIANT[q.status] ?? 'default'}>
                              {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                            </Badge>
                          </td>

                          {/* Total */}
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                            {formatCurrency(q.total_amount)}
                          </td>

                          {/* Days Open */}
                          <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                            {daysOpen !== null ? `${daysOpen}d` : '--'}
                          </td>

                          {/* Sends */}
                          <td className="whitespace-nowrap px-4 py-3 text-center text-gray-500">
                            {sentCounts[q.id] ?? 0}
                          </td>

                          {/* Actions */}
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedQuoteId(q.id);
                                }}
                                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                title="Preview"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/pos/quotes?mode=detail&quoteId=${q.id}`, '_blank');
                                }}
                                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                title="Open in POS"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (q.access_token) {
                                    navigator.clipboard
                                      .writeText(`${window.location.origin}/quote/${q.access_token}`)
                                      .then(() => toast.success('Link copied!'))
                                      .catch(() => toast.error('Failed to copy link'));
                                  } else {
                                    toast.error('No public link available');
                                  }
                                }}
                                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                title="Copy public link"
                              >
                                <Link2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 6. Pagination */}
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

      {/* 7. Quote Slide-Over */}
      <QuoteSlideOver
        quoteId={selectedQuoteId}
        open={!!selectedQuoteId}
        onClose={() => setSelectedQuoteId(null)}
      />
    </div>
  );
}
