'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Loader2,
  Receipt,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { posFetch } from '../lib/pos-fetch';

interface RecentTransaction {
  id: string;
  receipt_number: string | null;
  transaction_date: string;
  total_amount: number;
  status: string;
  payment_method: string | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  refunded: 'bg-red-500',
  partial_refund: 'bg-amber-500',
  voided: 'bg-gray-400',
  open: 'bg-blue-500',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function RecentTransactionsDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchRecent = useCallback(async () => {
    try {
      setError(null);
      // Fetch today's transactions (last 24h fallback if no today range)
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const params = new URLSearchParams({
        date_from: startOfDay.toISOString(),
        limit: '10',
        offset: '0',
      });

      const res = await posFetch(`/api/pos/transactions/search?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch');
      }
      const json = await res.json();
      setTransactions(json.data ?? []);
    } catch {
      setError('Could not load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when opening
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    fetchRecent();

    // Auto-refresh every 60s while open
    refreshIntervalRef.current = setInterval(fetchRecent, 60_000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [open, fetchRecent]);

  // Close on outside click/tap
  useEffect(() => {
    if (!open) return;

    function handleOutsideClick(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [open]);

  function handleRowClick(txn: RecentTransaction) {
    setOpen(false);
    router.push(`/pos/transactions?id=${txn.id}`);
  }

  function handleViewAll() {
    setOpen(false);
    router.push('/pos/transactions');
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-8 w-8 items-center justify-center rounded-full ${
          open
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
        }`}
        title="Recent transactions"
        aria-label="Recent transactions"
        aria-expanded={open}
      >
        <Clock className="h-4 w-4" />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-gray-900">
              Recent Transactions
            </h3>
            <span className="text-xs text-gray-400">Today</span>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {loading && transactions.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                <AlertCircle className="h-5 w-5" />
                <span className="text-xs">{error}</span>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                <Receipt className="h-6 w-6" />
                <span className="text-sm">No transactions today</span>
              </div>
            ) : (
              transactions.map((txn) => {
                const customerName = txn.customer
                  ? `${txn.customer.first_name} ${txn.customer.last_name}`
                  : 'Walk-in';

                return (
                  <button
                    key={txn.id}
                    onClick={() => handleRowClick(txn)}
                    className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-gray-50"
                  >
                    {/* Status dot */}
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[txn.status] || 'bg-gray-300'}`}
                    />

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {customerName}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                          {formatCurrency(txn.total_amount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500">
                          {txn.receipt_number ? `#${txn.receipt_number}` : '—'}
                          {txn.payment_method && (
                            <> &middot; {txn.payment_method}</>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {timeAgo(txn.transaction_date)}
                        </span>
                      </div>
                    </div>

                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100">
            <button
              onClick={handleViewAll}
              className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
            >
              View All Transactions
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
