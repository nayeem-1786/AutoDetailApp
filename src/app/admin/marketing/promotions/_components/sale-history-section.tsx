'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatCurrency, formatMoney } from '@/lib/utils/format';
import { formatPstShortDate } from '@/lib/utils/pst-date';
import { ChevronDown, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { SaleHistoryRecord } from '@/lib/supabase/types';

// ─── Snapshot Price Display ────────────────────────────────

function SnapshotPriceDisplay({ record }: { record: SaleHistoryRecord }) {
  const { pricing_snapshot, pricing_model } = record;

  // Product (pricing_model is null)
  if (pricing_model === null || pricing_model === undefined) {
    const snap = pricing_snapshot as { retail_price_cents: number; sale_price_cents: number };
    return (
      <div className="text-xs">
        <span className="text-gray-400 line-through">{formatCurrency(snap.retail_price_cents)}</span>
        <span className="ml-1 font-medium text-green-600">{formatCurrency(snap.sale_price_cents)}</span>
      </div>
    );
  }

  // Flat
  if (pricing_model === 'flat') {
    const snap = pricing_snapshot as { base_price: number; sale_price_cents: number };
    return (
      <div className="text-xs">
        <span className="text-gray-400 line-through">{formatCurrency(snap.base_price)}</span>
        <span className="ml-1 font-medium text-green-600">{formatCurrency(snap.sale_price_cents)}</span>
      </div>
    );
  }

  // Per_unit
  if (pricing_model === 'per_unit') {
    const snap = pricing_snapshot as { base_price: number; sale_price_cents: number; per_unit_label?: string };
    const suffix = `/${snap.per_unit_label || 'unit'}`;
    return (
      <div className="text-xs">
        <span className="text-gray-400 line-through">{formatCurrency(snap.base_price)}{suffix}</span>
        <span className="ml-1 font-medium text-green-600">{formatCurrency(snap.sale_price_cents)}{suffix}</span>
      </div>
    );
  }

  // Tiered: vehicle_size, scope, specialty — array of tiers
  if (Array.isArray(pricing_snapshot)) {
    const tiers = pricing_snapshot as { tier_name: string; tier_label: string | null; base_price: number; sale_price_cents: number }[];
    return (
      <div className="space-y-0.5">
        {tiers.map((t) => (
          <div key={t.tier_name} className="text-xs">
            <span className="text-gray-400">{t.tier_label || t.tier_name}: </span>
            <span className="text-gray-400 line-through">{formatCurrency(t.base_price)}</span>
            <span className="ml-1 font-medium text-green-600">{formatCurrency(t.sale_price_cents)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-gray-400 text-xs">—</span>;
}

// ─── Ended Reason Badge ─────────────────────────────────────

function ReasonBadge({ reason }: { reason: string }) {
  if (reason === 'manual') {
    return <Badge variant="secondary" className="text-[10px]">Manual</Badge>;
  }
  if (reason === 'overwritten') {
    return <Badge variant="info" className="text-[10px]">Overwritten</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px]">{reason}</Badge>;
}

// ─── Sale Period Display ─────────────────────────────────────

function renderHistoryPeriod(record: SaleHistoryRecord) {
  const { sale_starts_at, sale_ends_at } = record;
  if (sale_starts_at && sale_ends_at) {
    return `${formatPstShortDate(sale_starts_at)} – ${formatPstShortDate(sale_ends_at)}`;
  }
  if (sale_starts_at) return `From ${formatPstShortDate(sale_starts_at)}`;
  if (sale_ends_at) return `Until ${formatPstShortDate(sale_ends_at)}`;
  return 'No limit';
}

// ─── Main Section ────────────────────────────────────────────

const PAGE_SIZE = 20;

export function SaleHistorySection({
  onDuplicate,
}: {
  onDuplicate: (record: SaleHistoryRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState<SaleHistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SaleHistoryRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchHistory = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/marketing/promotions/history?limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      if (offset === 0) {
        setRecords(json.data || []);
      } else {
        setRecords((prev) => [...prev, ...(json.data || [])]);
      }
      setTotal(json.total ?? 0);
      setLoaded(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) {
      fetchHistory(0);
    }
  }

  function handleLoadMore() {
    fetchHistory(records.length);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/marketing/promotions/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setTotal((prev) => prev - 1);
      toast.success('History record deleted');
    } catch {
      toast.error('Failed to delete history record');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const hasMore = records.length < total;

  return (
    <Card>
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span>📋</span>
          <span className="text-sm font-semibold text-gray-700">Sale History</span>
          {loaded && <Badge variant="secondary">{total}</Badge>}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {expanded && (
        <CardContent className="pt-0">
          {loading && records.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : records.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No sale history yet. Past sales will appear here when ended or overwritten.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Item</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sale Prices</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sale Period</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Ended</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Reason</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {record.service_name || record.product_name || '(deleted)'}
                        </td>
                        <td className="px-3 py-2">
                          <SnapshotPriceDisplay record={record} />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {renderHistoryPeriod(record)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {formatPstShortDate(record.ended_at)}
                        </td>
                        <td className="px-3 py-2">
                          <ReasonBadge reason={record.ended_reason} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDuplicate(record)}
                            title="Duplicate sale with new dates"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteTarget(record)}
                            title="Delete history record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore && (
                <div className="mt-3 text-center">
                  <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loading}>
                    {loading ? 'Loading...' : `Load More (${total - records.length} remaining)`}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete History Record"
        description="Delete this history record? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </Card>
  );
}
