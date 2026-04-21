'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Package, DollarSign, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/lib/hooks/use-permission';
import { adminFetch } from '@/lib/utils/admin-fetch';

interface ShopExpenseRow {
  id: string;
  created_at: string;
  quantity_change: number;
  unit_cost: number | null;
  reason: string | null;
  product: { id: string; name: string; sku: string | null } | null;
  created_by_employee: { first_name: string; last_name: string } | null;
}

type DatePreset = 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'custom';

const PST_TZ = 'America/Los_Angeles';

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: PST_TZ }));
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = now.getDay();

  let from: Date;
  const to = new Date(y, m, d + 1); // end of today

  switch (preset) {
    case 'this_week': {
      from = new Date(y, m, d - day);
      break;
    }
    case 'this_month': {
      from = new Date(y, m, 1);
      break;
    }
    case 'this_quarter': {
      const qStart = m - (m % 3);
      from = new Date(y, qStart, 1);
      break;
    }
    case 'this_year': {
      from = new Date(y, 0, 1);
      break;
    }
    default:
      from = new Date(y, m, 1);
  }

  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function formatPst(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: PST_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ShopExpensesPage() {
  const { granted, loading: permLoading } = usePermission('inventory.view_expense_report');
  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<ShopExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Initialize date range from preset
  useEffect(() => {
    if (preset !== 'custom') {
      const { from, to } = getPresetRange(preset);
      setDateFrom(from);
      setDateTo(to);
    }
  }, [preset]);

  // Fetch data
  useEffect(() => {
    if (!dateFrom || !dateTo || !granted) return;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        const res = await adminFetch(`/api/admin/stock-adjustments?type=shop_use&limit=500&offset=0`);
        if (res.ok) {
          const json = await res.json();
          // Filter by date range client-side (API doesn't have date params for stock-adjustments yet)
          const all = (json.data ?? []) as ShopExpenseRow[];
          const filtered = all.filter((r) => {
            const d = r.created_at;
            return d >= dateFrom && d < dateTo;
          });
          setRows(filtered);
          setTotal(json.total ?? filtered.length);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [dateFrom, dateTo, granted]);

  // Summary calculations
  const { totalSpend, rowCount, topProduct } = useMemo(() => {
    let spend = 0;
    const productSpend = new Map<string, { name: string; spend: number }>();

    for (const row of rows) {
      const qty = Math.abs(row.quantity_change);
      const cost = row.unit_cost ?? 0;
      const lineCost = qty * cost;
      spend += lineCost;

      const pName = row.product?.name ?? 'Unknown';
      const existing = productSpend.get(pName) ?? { name: pName, spend: 0 };
      existing.spend += lineCost;
      productSpend.set(pName, existing);
    }

    let top = '—';
    let topSpend = 0;
    for (const [, val] of productSpend) {
      if (val.spend > topSpend) {
        topSpend = val.spend;
        top = val.name;
      }
    }

    return { totalSpend: spend, rowCount: rows.length, topProduct: top };
  }, [rows]);

  async function handleExport() {
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    const res = await adminFetch(`/api/admin/shop-expenses/export?${params}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shop-expenses-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (permLoading) return null;

  if (!granted) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Access Denied</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You don&apos;t have permission to view the shop expense report.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Shop Supplies Expense
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Track consumables used in day-to-day operations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Date presets */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['this_week', 'This Week'],
          ['this_month', 'This Month'],
          ['this_quarter', 'This Quarter'],
          ['this_year', 'This Year'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              preset === key
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreset('custom'); }}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-800"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreset('custom'); }}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-800"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Spend</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            ${totalSpend.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Usage Events</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {rowCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Top Product</p>
          </div>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {topProduct}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">SKU</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Unit Cost</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Logged By</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No shop use logged in this period.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const qty = Math.abs(row.quantity_change);
                const cost = row.unit_cost ?? 0;
                const lineTotal = qty * cost;
                const note = row.reason?.replace(/^Shop use\s*—?\s*/, '') || '—';

                return (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                      {formatPst(row.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {row.product?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                      {row.product?.sku ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {qty}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {cost > 0 ? `$${cost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                      {lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                      {row.created_by_employee
                        ? `${row.created_by_employee.first_name} ${row.created_by_employee.last_name}`
                        : '—'}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                      {note}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
