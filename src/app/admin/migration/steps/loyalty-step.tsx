'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Star, Droplets } from 'lucide-react';
import { parseDollarAmount } from '@/lib/migration/phone-utils';
import { formatCurrency, formatPoints } from '@/lib/utils/format';
import { WATER_SKU } from '@/lib/utils/constants';
import type { MigrationState } from '@/lib/migration/types';

interface LoyaltyStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
  onContinue: () => void;
}

interface CustomerLoyalty {
  customerRefId: string;
  customerName: string;
  totalSpend: number;
  eligibleSpend: number;
  waterSpend: number;
  points: number;
  transactionCount: number;
}

export function LoyaltyStep({ state, onStateChange, onContinue }: LoyaltyStepProps) {
  const [importing, setImporting] = useState(false);

  const transactionItems = state.parsedData.transactionItems || [];
  const transactions = state.parsedData.transactions || [];

  // Calculate loyalty per customer
  const loyaltyData = useMemo<CustomerLoyalty[]>(() => {
    // First, build a map of Transaction ID -> Customer Reference ID from transactions
    const txnCustomerMap = new Map<string, { refId: string; name: string }>();
    transactions.forEach((t) => {
      const txnId = t['Transaction ID'];
      const refId = (t['Customer Reference ID'] || '').trim();
      const name = (t['Customer Name'] || '').trim();
      if (txnId && refId) {
        txnCustomerMap.set(txnId, { refId, name });
      }
    });

    // Accumulate spend per customer, excluding water
    const customerSpend = new Map<
      string,
      {
        name: string;
        totalSpend: number;
        eligibleSpend: number;
        waterSpend: number;
        transactionIds: Set<string>;
      }
    >();

    transactionItems.forEach((item) => {
      const txnId = item['Transaction ID'];
      // Get customer from item row or transaction map
      let custRefId = (item['Customer Reference ID'] || '').trim();
      let custName = (item['Customer Name'] || '').trim();

      if (!custRefId && txnId) {
        const txnCust = txnCustomerMap.get(txnId);
        if (txnCust) {
          custRefId = txnCust.refId;
          custName = txnCust.name;
        }
      }

      if (!custRefId) return; // Skip anonymous transactions

      const netSales = parseDollarAmount(item['Net Sales']);
      const sku = (item['SKU'] || '').trim();
      const isWater = sku === WATER_SKU;

      const existing = customerSpend.get(custRefId) || {
        name: custName,
        totalSpend: 0,
        eligibleSpend: 0,
        waterSpend: 0,
        transactionIds: new Set<string>(),
      };

      existing.totalSpend += netSales;
      if (isWater) {
        existing.waterSpend += netSales;
      } else {
        existing.eligibleSpend += netSales;
      }
      if (txnId) {
        existing.transactionIds.add(txnId);
      }
      if (custName && !existing.name) {
        existing.name = custName;
      }

      customerSpend.set(custRefId, existing);
    });

    return Array.from(customerSpend.entries())
      .map(([refId, data]) => ({
        customerRefId: refId,
        customerName: data.name,
        totalSpend: data.totalSpend,
        eligibleSpend: data.eligibleSpend,
        waterSpend: data.waterSpend,
        points: Math.floor(data.eligibleSpend), // 1 point per $1
        transactionCount: data.transactionIds.size,
      }))
      .filter((c) => c.points > 0)
      .sort((a, b) => b.points - a.points);
  }, [transactionItems, transactions]);

  // Stats
  const totalPoints = useMemo(
    () => loyaltyData.reduce((sum, c) => sum + c.points, 0),
    [loyaltyData]
  );
  const totalEligible = useMemo(
    () => loyaltyData.reduce((sum, c) => sum + c.eligibleSpend, 0),
    [loyaltyData]
  );
  const totalWaterExcluded = useMemo(
    () => loyaltyData.reduce((sum, c) => sum + c.waterSpend, 0),
    [loyaltyData]
  );

  const handleImport = async () => {
    setImporting(true);

    try {
      const payload = loyaltyData.map((c) => ({
        customer_reference_id: c.customerRefId,
        points: c.points,
        eligible_spend: c.eligibleSpend,
      }));

      const res = await fetch('/api/migration/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loyaltyEntries: payload }),
      });

      const result = await res.json();

      if (result.error) {
        toast.error('Import failed: ' + result.error);
        const newState = { ...state };
        newState.steps = {
          ...state.steps,
          loyalty: { status: 'error', errors: [result.error] },
        };
        onStateChange(newState);
      } else {
        const newState = { ...state };
        newState.steps = {
          ...state.steps,
          loyalty: {
            status: 'completed',
            count: result.totalPoints || totalPoints,
            message: `Awarded ${formatPoints(result.totalPoints || totalPoints)} points to ${result.customersUpdated || loyaltyData.length} customers`,
          },
        };
        onStateChange(newState);
        toast.success(
          `Awarded ${formatPoints(result.totalPoints || totalPoints)} points to ${result.customersUpdated || loyaltyData.length} customers`
        );
      }
    } catch (err) {
      toast.error('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const isCompleted = state.steps.loyalty.status === 'completed';

  if (transactionItems.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Loyalty Calculation</h2>
          <p className="mt-1 text-sm text-gray-500">
            No transaction data available. Loyalty points require transaction items to calculate.
          </p>
        </div>
        <Button
          onClick={() => {
            const newState = { ...state };
            newState.steps = {
              ...state.steps,
              loyalty: { status: 'skipped', message: 'No transaction data' },
            };
            onStateChange(newState);
            onContinue();
          }}
        >
          Skip Loyalty Calculation
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Loyalty Calculation</h2>
        <p className="mt-1 text-sm text-gray-500">
          Calculate loyalty points from eligible spend (1 point per $1). Water purchases (SKU{' '}
          {WATER_SKU}) are excluded.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-gray-500">Total Points</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{formatPoints(totalPoints)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <span className="text-sm text-gray-500">Eligible Customers</span>
            <p className="mt-1 text-2xl font-bold">{loyaltyData.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <span className="text-sm text-gray-500">Eligible Spend</span>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(totalEligible)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-400" />
              <span className="text-sm text-gray-500">Water Excluded</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(totalWaterExcluded)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top 20 Customers by Points */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top 20 Customers by Loyalty Points</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="border-b px-3 py-2 text-left font-medium">#</th>
                  <th className="border-b px-3 py-2 text-left font-medium">Customer</th>
                  <th className="border-b px-3 py-2 text-right font-medium">Eligible Spend</th>
                  <th className="border-b px-3 py-2 text-right font-medium">Water Spend</th>
                  <th className="border-b px-3 py-2 text-right font-medium">Points</th>
                  <th className="border-b px-3 py-2 text-right font-medium">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {loyaltyData.slice(0, 20).map((c, i) => (
                  <tr key={c.customerRefId} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium">
                      {c.customerName || c.customerRefId}
                    </td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(c.eligibleSpend)}</td>
                    <td className="px-3 py-1.5 text-right text-blue-600">
                      {c.waterSpend > 0 ? formatCurrency(c.waterSpend) : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold">
                      {formatPoints(c.points)}
                    </td>
                    <td className="px-3 py-1.5 text-right">{c.transactionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loyaltyData.length > 20 && (
            <p className="mt-2 text-xs text-gray-400">
              Showing top 20 of {loyaltyData.length} eligible customers
            </p>
          )}
        </CardContent>
      </Card>

      {/* Import Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Ready to award{' '}
                <span className="text-lg font-bold">{formatPoints(totalPoints)}</span> points to{' '}
                {loyaltyData.length} customers
              </p>
              <p className="text-xs text-gray-500">
                Points calculated as welcome_bonus ledger entries (1 point per $1 eligible spend)
              </p>
            </div>
            <div className="flex items-center gap-3">
              {importing && <Spinner size="sm" />}
              {isCompleted ? (
                <div className="flex items-center gap-3">
                  <Badge variant="success">
                    {formatPoints(state.steps.loyalty.count || 0)} points awarded
                  </Badge>
                  <Button onClick={onContinue}>Continue to Validation</Button>
                </div>
              ) : (
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? 'Calculating...' : 'Award Loyalty Points'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
