'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { LOYALTY, FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { formatPoints, formatCurrency, formatDate } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import { Award, Gift, TrendingUp, Info } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface LoyaltyEntry {
  id: string;
  action: string;
  points_change: number;
  points_balance: number;
  description: string | null;
  created_at: string;
}

const ACTION_VARIANTS: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'default'> = {
  earned: 'success',
  redeemed: 'info',
  adjusted: 'warning',
  expired: 'destructive',
  welcome_bonus: 'success',
};

const ACTION_LABELS: Record<string, string> = {
  earned: 'Earned',
  redeemed: 'Redeemed',
  adjusted: 'Adjusted',
  expired: 'Expired',
  welcome_bonus: 'Bonus',
};

export default function AccountLoyaltyPage() {
  const { customer } = useCustomerAuth();
  const { enabled: loyaltyEnabled, loading: flagLoading } = useFeatureFlag(FEATURE_FLAGS.LOYALTY_REWARDS);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LoyaltyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLoyalty = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/customer/loyalty?limit=100&offset=0');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setBalance(json.balance ?? 0);
      setEntries(json.entries ?? []);
    } catch {
      // leave current state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    loadLoyalty();
  }, [customer, loadLoyalty]);

  if (!customer) return null;

  if (flagLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!loyaltyEnabled) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Loyalty Rewards</h1>
        <p className="mt-4 text-sm text-gray-500">
          The loyalty rewards program is not currently available.
        </p>
      </div>
    );
  }

  const pointValue = balance * LOYALTY.REDEEM_RATE;
  const canRedeem = balance >= LOYALTY.REDEEM_MINIMUM;
  const pointsToNextReward = canRedeem ? 0 : LOYALTY.REDEEM_MINIMUM - balance;

  // Table columns (matching admin design)
  const columns: ColumnDef<LoyaltyEntry, unknown>[] = [
    {
      id: 'date',
      header: 'Date',
      size: 100,
      accessorFn: (row) => row.created_at,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 whitespace-nowrap">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Action',
      size: 90,
      cell: ({ row }) => {
        const action = row.original.action;
        return (
          <Badge variant={ACTION_VARIANTS[action] || 'default'}>
            {ACTION_LABELS[action] || action.charAt(0).toUpperCase() + action.slice(1)}
          </Badge>
        );
      },
    },
    {
      id: 'points',
      header: 'Points',
      size: 80,
      cell: ({ row }) => {
        const change = row.original.points_change;
        return (
          <span className={`text-sm font-medium whitespace-nowrap ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change > 0 ? '+' : ''}{formatPoints(change)}
          </span>
        );
      },
    },
    {
      id: 'balance',
      header: 'Balance',
      size: 80,
      cell: ({ row }) => (
        <span className="text-sm text-gray-900 whitespace-nowrap">
          {formatPoints(row.original.points_balance)}
        </span>
      ),
    },
    {
      id: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.description || '—'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Loyalty Rewards</h1>
      <p className="mt-1 text-sm text-gray-600">
        Earn points on every purchase and redeem them for discounts.
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Balance Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Current Balance</p>
                  <p className="text-4xl font-bold text-gray-900">
                    {formatPoints(balance)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Worth {formatCurrency(pointValue)} in discounts
                  </p>
                </div>
                <Award className="h-12 w-12 text-amber-500" />
              </div>

              {/* Progress to next reward */}
              {!canRedeem && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Progress to next reward</span>
                    <span className="font-medium text-gray-900">
                      {formatPoints(balance)} / {formatPoints(LOYALTY.REDEEM_MINIMUM)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${Math.min(100, (balance / LOYALTY.REDEEM_MINIMUM) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Earn {formatPoints(pointsToNextReward)} more points to unlock {formatCurrency(LOYALTY.REDEEM_MINIMUM * LOYALTY.REDEEM_RATE)} off
                  </p>
                </div>
              )}

              {canRedeem && (
                <div className="mt-4 rounded-lg bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-800">
                    You have enough points for a reward! Your points will be applied automatically at checkout.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* How It Works Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                <CardTitle>How It Works</CardTitle>
              </div>
              <CardDescription>
                It&apos;s simple — the more you visit, the more you save.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
                  <TrendingUp className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-900">Earn Points</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Get {LOYALTY.EARN_RATE} point for every ${(1 / LOYALTY.EARN_RATE).toFixed(0)} you spend
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
                  <Gift className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-500" />
                  <div>
                    <p className="font-medium text-gray-900">Redeem Rewards</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatPoints(LOYALTY.REDEEM_MINIMUM)} points = {formatCurrency(LOYALTY.REDEEM_MINIMUM * LOYALTY.REDEEM_RATE)} off
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
                  <Award className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                  <div>
                    <p className="font-medium text-gray-900">Auto-Applied</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Your points are used automatically when you check out
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Points History */}
          <Card>
            <CardHeader>
              <CardTitle>Points History</CardTitle>
              <CardDescription>
                See all your earned and redeemed points.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={entries}
                emptyTitle="No points activity yet"
                emptyDescription="Earn points on your next visit and they'll show up here."
                pageSize={10}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
