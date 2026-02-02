'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Receipt, AlertTriangle, DollarSign, Calendar } from 'lucide-react';
import { parseDollarAmount } from '@/lib/migration/phone-utils';
import { formatCurrency } from '@/lib/utils/format';
import type { MigrationState, TransactionItemRow, TransactionRow } from '@/lib/migration/types';

interface TransactionStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
  onContinue: () => void;
}

interface JoinedTransaction {
  transaction: TransactionRow;
  items: TransactionItemRow[];
  grossSales: number;
  netSales: number;
  tax: number;
  tip: number;
  totalCollected: number;
  customerRefId: string;
  staffName: string;
  date: string;
}

export function TransactionStep({ state, onStateChange, onContinue }: TransactionStepProps) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const transactionItems = state.parsedData.transactionItems || [];
  const transactions = state.parsedData.transactions || [];

  // Join transactions with their items
  const joined = useMemo<JoinedTransaction[]>(() => {
    // Group items by Transaction ID
    const itemsByTxn = new Map<string, TransactionItemRow[]>();
    transactionItems.forEach((item) => {
      const txnId = item['Transaction ID'];
      if (!txnId) return;
      const existing = itemsByTxn.get(txnId) || [];
      existing.push(item);
      itemsByTxn.set(txnId, existing);
    });

    // Join each transaction with its items
    return transactions
      .filter((t) => t['Transaction ID'] && t['Event Type'] === 'Payment')
      .map((t) => {
        const txnId = t['Transaction ID'];
        const items = itemsByTxn.get(txnId) || [];

        return {
          transaction: t,
          items,
          grossSales: parseDollarAmount(t['Gross Sales']),
          netSales: parseDollarAmount(t['Net Sales']),
          tax: parseDollarAmount(t['Tax']),
          tip: parseDollarAmount(t['Tip']),
          totalCollected: parseDollarAmount(t['Total Collected']),
          customerRefId: (t['Customer Reference ID'] || '').trim(),
          staffName: (t['Staff Name'] || '').trim(),
          date: t['Date'] || '',
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactionItems, transactions]);

  // Stats
  const totalGross = useMemo(
    () => joined.reduce((sum, t) => sum + t.grossSales, 0),
    [joined]
  );
  const totalTax = useMemo(
    () => joined.reduce((sum, t) => sum + t.tax, 0),
    [joined]
  );
  const totalTips = useMemo(
    () => joined.reduce((sum, t) => sum + t.tip, 0),
    [joined]
  );
  const totalCollected = useMemo(
    () => joined.reduce((sum, t) => sum + t.totalCollected, 0),
    [joined]
  );

  const withCustomer = joined.filter((t) => t.customerRefId).length;
  const withStaff = joined.filter((t) => t.staffName).length;
  const withItems = joined.filter((t) => t.items.length > 0).length;
  const orphanedItems = transactionItems.length - joined.reduce((s, t) => s + t.items.length, 0);

  // Date range
  const dateRange = useMemo(() => {
    if (joined.length === 0) return null;
    const dates = joined.map((t) => t.date).filter(Boolean).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [joined]);

  // Top items by category
  const categoryBreakdown = useMemo(() => {
    const cats = new Map<string, { count: number; gross: number }>();
    transactionItems.forEach((item) => {
      const cat = item['Category'] || 'Uncategorized';
      const existing = cats.get(cat) || { count: 0, gross: 0 };
      existing.count++;
      existing.gross += parseDollarAmount(item['Gross Sales']);
      cats.set(cat, existing);
    });
    return Array.from(cats.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.gross - a.gross);
  }, [transactionItems]);

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);

    try {
      // Send in batches
      const BATCH_SIZE = 50;
      let imported = 0;
      let itemsImported = 0;
      const errors: string[] = [];

      for (let i = 0; i < joined.length; i += BATCH_SIZE) {
        const batch = joined.slice(i, i + BATCH_SIZE);
        const payload = batch.map((j) => ({
          square_transaction_id: j.transaction['Transaction ID'],
          customer_reference_id: j.customerRefId || null,
          staff_name: j.staffName || null,
          transaction_date: j.date,
          gross_sales: j.grossSales,
          net_sales: j.netSales,
          tax_amount: j.tax,
          tip_amount: j.tip,
          total_amount: j.totalCollected,
          discount_amount: parseDollarAmount(j.transaction['Discounts']),
          payment_method: j.transaction['Cash'] && parseDollarAmount(j.transaction['Cash']) > 0
            ? 'cash'
            : j.transaction['Card'] && parseDollarAmount(j.transaction['Card']) > 0
              ? 'card'
              : null,
          card_brand: j.transaction['Card Brand'] || null,
          card_last_four: j.transaction['PAN Suffix'] || null,
          fees: parseDollarAmount(j.transaction['Fees']),
          transaction_status: j.transaction['Transaction Status'] || 'Complete',
          items: j.items.map((item) => ({
            item_name: item['Item'] || 'Unknown',
            category: item['Category'] || null,
            sku: item['SKU'] || null,
            quantity: parseFloat(item['Qty'] || '1') || 1,
            gross_sales: parseDollarAmount(item['Gross Sales']),
            net_sales: parseDollarAmount(item['Net Sales']),
            tax: parseDollarAmount(item['Tax']),
            discount_amount: parseDollarAmount(item['Discounts']),
            price_point_name: item['Price Point Name'] || null,
            itemization_type: item['Itemization Type'] || null,
          })),
        }));

        const res = await fetch('/api/migration/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: payload }),
        });

        const result = await res.json();
        if (result.error) {
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.error}`);
        } else {
          imported += result.transactionsImported || batch.length;
          itemsImported += result.itemsImported || 0;
        }

        setProgress(Math.round(((i + batch.length) / joined.length) * 100));
      }

      const newState = { ...state };
      newState.steps = {
        ...state.steps,
        transactions: {
          status: errors.length > 0 ? 'error' : 'completed',
          count: imported,
          errors: errors.length > 0 ? errors : undefined,
          message: `Imported ${imported} transactions with ${itemsImported} line items`,
        },
      };
      onStateChange(newState);

      if (errors.length > 0) {
        toast.error(`Import completed with ${errors.length} errors`);
      } else {
        toast.success(`Imported ${imported} transactions with ${itemsImported} items`);
      }
    } catch (err) {
      toast.error('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const isCompleted = state.steps.transactions.status === 'completed';

  if (transactions.length === 0 && transactionItems.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Transaction Import</h2>
          <p className="mt-1 text-sm text-gray-500">
            No transaction CSVs were uploaded. You can skip this step.
          </p>
        </div>
        <Button
          onClick={() => {
            const newState = { ...state };
            newState.steps = {
              ...state.steps,
              transactions: { status: 'skipped', message: 'No CSV uploaded' },
            };
            onStateChange(newState);
            onContinue();
          }}
        >
          Skip Transaction Import
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Transaction Import</h2>
        <p className="mt-1 text-sm text-gray-500">
          Joining {transactions.length.toLocaleString()} transactions with{' '}
          {transactionItems.length.toLocaleString()} line items by Transaction ID.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Transactions</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{joined.length.toLocaleString()}</p>
            <p className="text-xs text-gray-400">
              {withItems} with items, {joined.length - withItems} without
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Total Collected</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(totalCollected)}</p>
            <p className="text-xs text-gray-400">
              {formatCurrency(totalTax)} tax, {formatCurrency(totalTips)} tips
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Date Range</span>
            </div>
            {dateRange ? (
              <>
                <p className="mt-1 text-sm font-bold">{dateRange.from}</p>
                <p className="text-xs text-gray-400">to {dateRange.to}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-400">No dates</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <span className="text-sm text-gray-500">Customer Match</span>
            <p className="mt-1 text-2xl font-bold">{withCustomer}</p>
            <p className="text-xs text-gray-400">
              {joined.length - withCustomer} anonymous
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sales by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categoryBreakdown.slice(0, 15).map((cat) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cat.name}</span>
                    <span className="text-xs text-gray-400">({cat.count} items)</span>
                  </div>
                  <span className="text-sm font-medium">{formatCurrency(cat.gross)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {orphanedItems > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500" />
              <p className="text-sm text-gray-600">
                <span className="font-medium">{orphanedItems}</span> transaction items could not
                be matched to a transaction (missing or non-Payment transaction IDs).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Ready to import{' '}
                <span className="text-lg font-bold">{joined.length.toLocaleString()}</span>{' '}
                transactions
              </p>
              <p className="text-xs text-gray-500">
                {withCustomer} linked to customers, {withStaff} with staff assignments
              </p>
            </div>
            <div className="flex items-center gap-3">
              {importing && <Spinner size="sm" />}
              {isCompleted ? (
                <div className="flex items-center gap-3">
                  <Badge variant="success">
                    {state.steps.transactions.count?.toLocaleString()} imported
                  </Badge>
                  <Button onClick={onContinue}>Continue to Loyalty</Button>
                </div>
              ) : (
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? `Importing... ${progress}%` : 'Import Transactions'}
                </Button>
              )}
            </div>
          </div>

          {importing && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gray-900 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {state.steps.transactions.errors && state.steps.transactions.errors.length > 0 && (
            <div className="mt-4 rounded-lg bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">Import Errors:</p>
              {state.steps.transactions.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
