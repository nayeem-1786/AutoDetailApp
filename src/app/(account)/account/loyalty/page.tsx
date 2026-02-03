'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { LOYALTY } from '@/lib/utils/constants';
import { formatPoints, formatCurrency, formatDate } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface LoyaltyEntry {
  id: string;
  action: string;
  points_change: number;
  points_balance: number;
  description: string | null;
  created_at: string;
}

const ACTION_BADGE: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning' | 'info' }> = {
  earned: { label: 'Earned', variant: 'success' },
  redeemed: { label: 'Redeemed', variant: 'info' },
  adjusted: { label: 'Adjusted', variant: 'warning' },
  expired: { label: 'Expired', variant: 'destructive' },
  welcome_bonus: { label: 'Bonus', variant: 'success' },
};

export default function AccountLoyaltyPage() {
  const { customer } = useCustomerAuth();
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LoyaltyEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const limit = 20;

  const loadLoyalty = useCallback(async (offset: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch(`/api/customer/loyalty?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setBalance(json.balance ?? 0);
      setTotal(json.total ?? 0);
      if (append) {
        setEntries((prev) => [...prev, ...(json.entries ?? [])]);
      } else {
        setEntries(json.entries ?? []);
      }
    } catch {
      // leave current state
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    loadLoyalty(0, false);
  }, [customer, loadLoyalty]);

  if (!customer) return null;

  const redemptionValue = formatCurrency(LOYALTY.REDEEM_MINIMUM * LOYALTY.REDEEM_RATE);
  const hasMore = entries.length < total;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Loyalty Rewards</h1>
      <p className="mt-1 text-sm text-gray-600">
        Track your points and rewards.
      </p>

      {/* Balance Card */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm font-medium text-gray-600">Current Balance</p>
        <p className="mt-1 text-4xl font-bold text-gray-900">
          {formatPoints(balance)}
        </p>
        <p className="mt-1 text-sm text-gray-500">points</p>
        <div className="mt-4 rounded-md bg-white px-4 py-2 text-sm text-gray-600">
          {LOYALTY.REDEEM_MINIMUM} pts = {redemptionValue} off your next visit
        </div>
      </div>

      {/* Ledger */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Points History</h2>

        {loading ? (
          <div className="mt-6 flex justify-center">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No points activity yet.</p>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              {entries.map((entry) => {
                const badge = ACTION_BADGE[entry.action] ?? {
                  label: entry.action,
                  variant: 'default' as const,
                };

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <span className="text-sm text-gray-900">
                          {entry.description || entry.action}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatDate(entry.created_at)}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <span
                        className={`text-sm font-semibold ${
                          entry.points_change >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {entry.points_change >= 0 ? '+' : ''}
                        {formatPoints(entry.points_change)}
                      </span>
                      <p className="text-xs text-gray-400">
                        bal: {formatPoints(entry.points_balance)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => loadLoyalty(entries.length, true)}
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
