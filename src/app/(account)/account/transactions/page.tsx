'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { TransactionCard } from '@/components/account/transaction-card';
import { TransactionDetail } from '@/components/account/transaction-detail';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface TransactionSummary {
  id: string;
  receipt_number: string | null;
  status: string;
  total_amount: number;
  payment_method: string | null;
  loyalty_points_earned: number;
  transaction_date: string;
}

export default function AccountTransactionsPage() {
  const { customer } = useCustomerAuth();
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 20;

  const loadTransactions = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customer/transactions?page=${p}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setTransactions(json.data ?? []);
      setTotal(json.total ?? 0);
      setPage(p);
    } catch {
      // leave current state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    loadTransactions(1);
  }, [customer, loadTransactions]);

  if (!customer) return null;

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
      <p className="mt-1 text-sm text-gray-600">
        View your past purchases and payment details.
      </p>

      {loading && transactions.length === 0 ? (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      ) : transactions.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No transactions yet.</p>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {transactions.map((txn) => (
              <TransactionCard
                key={txn.id}
                transaction={txn}
                expanded={expandedId === txn.id}
                onToggle={() =>
                  setExpandedId((prev) => (prev === txn.id ? null : txn.id))
                }
              >
                <TransactionDetail transactionId={txn.id} />
              </TransactionCard>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => loadTransactions(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => loadTransactions(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
