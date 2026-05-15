'use client';

/**
 * Phase 1A.5 Part A — Payments report.
 *
 * Date-range view of all payment rows grouped by (method, digital_platform).
 * Shows count, sum, percentage. CSV export (client-side blob) for accounting.
 *
 * Permission: gated by reports.financial_detail (same as the breakdown card
 * on /admin/transactions). Admin layout gates the entire /admin tree.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { mapDigitalPlatformToFriendly } from '@/lib/data/receipt-composer';
import { formatCurrency } from '@/lib/utils/format';

interface PaymentRow {
  method: string;
  digital_platform: string | null;
  amount: number;
}

interface GroupedRow {
  method: string;
  digital_platform: string | null;
  label: string;
  count: number;
  total: number;
  percentage: number;
}

function todayPst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function firstOfMonthPst(): string {
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return `${pst.getFullYear()}-${String(pst.getMonth() + 1).padStart(2, '0')}-01`;
}

function buildLabel(method: string, digital_platform: string | null): string {
  if (method === 'digital') return mapDigitalPlatformToFriendly(digital_platform);
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'check') return 'Check';
  if (method === 'split') return 'Split';
  return method;
}

export default function PaymentsReportPage() {
  const supabase = createClient();
  const [from, setFrom] = useState(firstOfMonthPst());
  const [to, setTo] = useState(todayPst());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PaymentRow[]>([]);

  const fetchData = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    try {
      const [fy, fm, fd] = fromDate.split('-').map(Number);
      const [ty, tm, td] = toDate.split('-').map(Number);
      const fromIso = new Date(fy, fm - 1, fd).toISOString();
      const toIso = new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString();

      // Pull payments via inner-join to transactions for date filtering.
      // status='completed' excludes voided/refunded source transactions.
      const { data, error } = await supabase
        .from('payments')
        .select(
          'method, digital_platform, amount, transaction:transactions!inner(status, transaction_date)'
        )
        .eq('transaction.status', 'completed')
        .gte('transaction.transaction_date', fromIso)
        .lte('transaction.transaction_date', toIso);

      if (error) {
        console.error('[Payments Report] fetch failed:', error);
        setRows([]);
      } else {
        setRows(
          (data ?? []).map((r: { method: string; digital_platform: string | null; amount: number | string }) => ({
            method: r.method,
            digital_platform: r.digital_platform ?? null,
            amount: Number(r.amount),
          }))
        );
      }
    } catch (err) {
      console.error('[Payments Report] unexpected error:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchData(from, to);
  }, [fetchData, from, to]);

  const grouped: GroupedRow[] = useMemo(() => {
    const map = new Map<string, { method: string; digital_platform: string | null; count: number; total: number }>();
    let grandTotal = 0;
    for (const r of rows) {
      const key = `${r.method}|${r.digital_platform ?? ''}`;
      const existing = map.get(key) ?? {
        method: r.method,
        digital_platform: r.digital_platform,
        count: 0,
        total: 0,
      };
      existing.count += 1;
      existing.total += r.amount;
      grandTotal += r.amount;
      map.set(key, existing);
    }
    const out: GroupedRow[] = [];
    for (const v of map.values()) {
      out.push({
        method: v.method,
        digital_platform: v.digital_platform,
        label: buildLabel(v.method, v.digital_platform),
        count: v.count,
        total: v.total,
        percentage: grandTotal > 0 ? (v.total / grandTotal) * 100 : 0,
      });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [rows]);

  const grandTotal = useMemo(() => grouped.reduce((s, g) => s + g.total, 0), [grouped]);
  const grandCount = useMemo(() => grouped.reduce((s, g) => s + g.count, 0), [grouped]);

  function downloadCsv() {
    const header = [
      'payment_method',
      'digital_platform',
      'count',
      'total_amount',
      'percentage_of_total',
      'date_range_start',
      'date_range_end',
    ].join(',');
    const lines = grouped.map((g) =>
      [
        g.method,
        g.digital_platform ?? '',
        g.count,
        g.total.toFixed(2),
        g.percentage.toFixed(2),
        from,
        to,
      ].join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-report-${from}-to-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments Report"
        description={
          loading
            ? 'Loading…'
            : `${grandCount} payments · ${formatCurrency(grandTotal)} total`
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="from-date">
                From
              </label>
              <input
                id="from-date"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="to-date">
                To
              </label>
              <input
                id="to-date"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="ml-auto">
              <Button
                onClick={downloadCsv}
                disabled={loading || grouped.length === 0}
                variant="outline"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-6 py-10 text-center text-sm text-gray-500">Loading payments…</p>
          ) : grouped.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-500">
              No payments in this date range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-6 py-3 font-medium text-gray-700">Method / Platform</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Count</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Total</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">% of total</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <tr key={`${g.method}-${g.digital_platform ?? ''}`} className="border-b border-gray-100">
                      <td className="px-6 py-3 font-medium text-gray-900">{g.label}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{g.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatCurrency(g.total)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                        {g.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-6 py-3 text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{grandCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(grandTotal)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
