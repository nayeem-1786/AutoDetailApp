'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  PackageCheck,
  PackageSearch,
  Send,
  ShieldCheck,
  Undo2,
  XCircle,
  XOctagon,
} from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { useBarcodeScanner } from '@/lib/hooks/use-barcode-scanner';
import { usePermission } from '@/lib/hooks/use-permission';
import { formatDateTime } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';

type CountStatus = 'active' | 'review' | 'committed' | 'cancelled';
type CountType = 'full' | 'sectional';

interface EmployeeRef {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface ProductRef {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
}

interface CountDetail {
  id: string;
  status: CountStatus;
  count_type: CountType;
  section_label: string | null;
  notes: string | null;
  started_by: string;
  started_at: string;
  committed_by: string | null;
  committed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  started_by_employee: EmployeeRef | null;
  committed_by_employee: EmployeeRef | null;
  cancelled_by_employee: EmployeeRef | null;
}

interface CountItem {
  id: string;
  stock_count_id: string;
  product_id: string;
  expected_qty: number;
  counted_qty: number;
  last_updated_by: string;
  updated_at: string;
  product: ProductRef | null;
  last_updated_by_employee: EmployeeRef | null;
}

interface TopDriftedProduct {
  product_id: string;
  product_name: string;
  sku: string | null;
  adjustment_count: number;
  net_change: number;
}

interface ProjectedNegativeProduct {
  product_id: string;
  name: string | null;
  sku: string | null;
  current_qty: number;
  target_qty: number;
}

interface RevertPreview {
  revertable: boolean;
  reason?: string;
  reversals_count: number;
  original_products: number;
  has_drift: boolean;
  drift_adjustments: number;
  drift_products: number;
  top_drifted: TopDriftedProduct[];
  projected_negative_products: ProjectedNegativeProduct[];
}

type RevertMode = 'loading' | 'error' | 'normal' | 'blocked-negative' | 'blocked-stale';

function employeeName(emp: EmployeeRef | null | undefined): string {
  if (!emp) return '—';
  return `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim() || '—';
}

function countTitle(count: CountDetail | null): string {
  if (!count) return 'Count';
  if (count.section_label) return count.section_label;
  if (count.count_type === 'full') return 'Full Store';
  return `Section — ${formatDateTime(count.started_at)}`;
}

export default function CountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const countId = params.id as string;

  const [count, setCount] = useState<CountDetail | null>(null);
  const [items, setItems] = useState<CountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [search, setSearch] = useState('');
  const [varianceOnly, setVarianceOnly] = useState(true);

  // Inline-edit state for counted_qty cell
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const [reviewOpen, setReviewOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertPreview, setRevertPreview] = useState<RevertPreview | null>(null);
  const [revertPreviewLoading, setRevertPreviewLoading] = useState(false);

  const { granted: canRevert } = usePermission('inventory.counts.revert');

  const loadCount = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/inventory/counts/${countId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load count');
      setCount(json.count as CountDetail);
      setItems((json.items ?? []) as CountItem[]);
    } catch (err) {
      console.error('Load count error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to load count');
      router.push('/admin/inventory/counts');
    } finally {
      setLoading(false);
    }
  }, [countId, router]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  // Variance summary
  const varianceSummary = useMemo(() => {
    let positive = 0;
    let negative = 0;
    let zero = 0;
    for (const it of items) {
      const delta = it.counted_qty - it.expected_qty;
      if (delta > 0) positive++;
      else if (delta < 0) negative++;
      else zero++;
    }
    return { positive, negative, zero, total: items.length };
  }, [items]);

  // Top-5 variance preview for commit dialog
  const topVariances = useMemo(() => {
    return [...items]
      .map((it) => ({
        name: it.product?.name ?? 'Unknown',
        delta: it.counted_qty - it.expected_qty,
      }))
      .filter((v) => v.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const name = it.product?.name?.toLowerCase() ?? '';
        const sku = it.product?.sku?.toLowerCase() ?? '';
        if (!name.includes(q) && !sku.includes(q)) return false;
      }
      if (count?.status === 'review' && varianceOnly) {
        if (it.counted_qty === it.expected_qty) return false;
      }
      return true;
    });
  }, [items, search, count?.status, varianceOnly]);

  // --- Scanner ---------------------------------------------------------
  useBarcodeScanner({
    enabled: count?.status === 'active' && !loading && !acting,
    onScan: async (barcode) => {
      // If the user is mid-edit on a qty cell, save that edit first by
      // blurring the input. The onBlur handler fires commitEdit() which
      // POSTs /items with set_to=N. The scan's own POST (increment=1)
      // runs after. If both target the same line, last-write-wins per
      // 42C §5 — acceptable for MVP.
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement &&
        activeEl.dataset.qtyEditInput === 'true'
      ) {
        activeEl.blur();
      }

      try {
        const lookupRes = await adminFetch('/api/admin/products/barcode-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode }),
        });
        const lookupJson = await lookupRes.json();
        if (!lookupRes.ok) {
          toast.error(lookupJson.error || 'Lookup failed');
          return;
        }
        if (!lookupJson.product) {
          toast.error(`No product matches barcode ${barcode}`);
          return;
        }

        const product = lookupJson.product as { id: string; name: string };

        const res = await adminFetch(`/api/admin/inventory/counts/${countId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: product.id, increment: 1 }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error || 'Failed to log scan');
          return;
        }
        const item = json.item as CountItem;
        toast.success(`Added ${product.name} — counted: ${item.counted_qty}`);
        await loadCount();
      } catch (err) {
        console.error('Scan error:', err);
        toast.error('Scan failed');
      }
    },
  });

  // --- Manual qty edit -------------------------------------------------
  function startEdit(item: CountItem) {
    setEditingItemId(item.id);
    setEditingValue(String(item.counted_qty));
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditingValue('');
  }

  async function commitEdit(item: CountItem) {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    const parsed = parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error('Enter a non-negative whole number');
      return;
    }
    if (parsed === item.counted_qty) {
      cancelEdit();
      return;
    }
    try {
      const res = await adminFetch(`/api/admin/inventory/counts/${countId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: item.product_id, set_to: parsed }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to update');
        return;
      }
      toast.success(`Updated ${item.product?.name ?? 'product'} — counted: ${parsed}`);
      cancelEdit();
      await loadCount();
    } catch (err) {
      console.error('Manual edit error:', err);
      toast.error('Failed to update');
    }
  }

  // --- Status transitions ---------------------------------------------
  async function handleMoveToReview() {
    setActing(true);
    try {
      const res = await adminFetch(`/api/admin/inventory/counts/${countId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_status: 'review' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Transition failed');
      toast.success('Moved to Review');
      setReviewOpen(false);
      await loadCount();
    } catch (err) {
      console.error('Transition error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to transition');
    } finally {
      setActing(false);
    }
  }

  async function handleCommit() {
    setActing(true);
    try {
      const res = await adminFetch(`/api/admin/inventory/counts/${countId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Commit failed');
      const adjCount = json.adjustments_created ?? 0;
      toast.success(
        adjCount === 0
          ? 'Count committed with no changes'
          : `Count committed — ${adjCount} adjustment${adjCount === 1 ? '' : 's'} written`
      );
      setCommitOpen(false);
      await loadCount();
    } catch (err) {
      console.error('Commit error:', err);
      toast.error(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    setActing(true);
    try {
      const res = await adminFetch(`/api/admin/inventory/counts/${countId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancel failed');
      toast.success('Count cancelled');
      setCancelOpen(false);
      router.push('/admin/inventory/counts');
    } catch (err) {
      console.error('Cancel error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setActing(false);
    }
  }

  // Fetch the revert preview. Stable reference so the visibility-change
  // effect can re-trigger it. Preview is advisory — the RPC re-checks
  // every condition (negative-qty + drift) authoritatively before applying.
  const fetchRevertPreview = useCallback(async () => {
    setRevertPreviewLoading(true);
    try {
      const res = await adminFetch(`/api/admin/inventory/counts/${countId}/revert-preview`);
      const json = await res.json();
      if (json && typeof json === 'object' && 'revertable' in json) {
        setRevertPreview(json as RevertPreview);
      }
    } catch (err) {
      console.error('Revert preview error:', err);
      toast.error('Failed to load revert preview');
    } finally {
      setRevertPreviewLoading(false);
    }
  }, [countId]);

  // Initial preview fetch on dialog open.
  useEffect(() => {
    if (!revertOpen) return;
    setRevertPreview(null);
    fetchRevertPreview();
  }, [revertOpen, fetchRevertPreview]);

  // Auto-refetch on tab visibility change (debounced 2s).
  // Use case: user clicks a product link, adjusts quantity in another tab,
  // returns to the revert modal — preview should reflect the new state
  // without requiring a manual recheck click.
  useEffect(() => {
    if (!revertOpen) return;
    let lastRefetch = Date.now();
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefetch < 2000) return;
      lastRefetch = Date.now();
      fetchRevertPreview();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [revertOpen, fetchRevertPreview]);

  // Derive the modal mode from preview state. Loading → loading; missing
  // preview → error; revertable=false → blocked-stale (count flipped
  // status elsewhere); projected_negative_products non-empty →
  // blocked-negative (hard blocker, must resolve before revert); else
  // normal (drift may be present and needs confirmation, but that's
  // surfaced via the amber banner inside `normal` mode).
  const revertMode: RevertMode = (() => {
    if (revertPreviewLoading) return 'loading';
    if (!revertPreview) return 'error';
    if (revertPreview.revertable === false) return 'blocked-stale';
    if (revertPreview.projected_negative_products.length > 0) return 'blocked-negative';
    return 'normal';
  })();

  const revertBlocked = revertMode === 'blocked-negative' || revertMode === 'blocked-stale';

  async function handleRevert() {
    setActing(true);
    try {
      const res = await adminFetch(`/api/admin/inventory/counts/${countId}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmed_drift: revertPreview?.has_drift === true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // 409 NEGATIVE_QUANTITY: the RPC's structured error path. Inject
        // problem products into preview state so the modal re-renders in
        // blocked-negative mode without closing.
        if (res.status === 409 && json?.error === 'NEGATIVE_QUANTITY' && Array.isArray(json.problem_products)) {
          setRevertPreview((prev) =>
            prev
              ? { ...prev, projected_negative_products: json.problem_products }
              : prev
          );
          toast.error('Cannot revert — product quantities would go negative. See modal for details.');
          return;
        }
        throw new Error(json.error || 'Revert failed');
      }
      const n = json.reversals_created ?? 0;
      toast.success(
        n === 0
          ? 'Count reverted (no adjustments to inverse)'
          : `Count reverted — ${n} adjustment${n === 1 ? '' : 's'} inversed`
      );
      setRevertOpen(false);
      await loadCount();
    } catch (err) {
      console.error('Revert error:', err);
      toast.error(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!count) return null;

  const isActive = count.status === 'active';
  const isReview = count.status === 'review';
  const isCommitted = count.status === 'committed';
  const isCancelled = count.status === 'cancelled';
  const canEditQty = isActive || isReview;

  const statusVariant: Record<CountStatus, 'info' | 'warning' | 'success' | 'secondary'> = {
    active: 'info',
    review: 'warning',
    committed: 'success',
    cancelled: 'secondary',
  };
  const statusLabel: Record<CountStatus, string> = {
    active: 'Active',
    review: 'Review',
    committed: 'Committed',
    cancelled: 'Cancelled',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Count: ${countTitle(count)}`}
        description={count.count_type === 'full' ? 'Full store count' : 'Sectional count'}
        action={
          <Button variant="outline" onClick={() => router.push('/admin/inventory/counts')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {/* Status + Info Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
          <Badge variant={statusVariant[count.status]} className="text-sm">
            {statusLabel[count.status]}
          </Badge>
          <span>
            Started by <span className="font-medium">{employeeName(count.started_by_employee)}</span>{' '}
            on {formatDateTime(count.started_at)}
          </span>
          {isCommitted && count.committed_at && (
            <span>
              • Committed by{' '}
              <span className="font-medium">{employeeName(count.committed_by_employee)}</span>{' '}
              on {formatDateTime(count.committed_at)}
            </span>
          )}
          {isCancelled && count.cancelled_at && (
            <span>
              • Cancelled by{' '}
              <span className="font-medium">{employeeName(count.cancelled_by_employee)}</span>{' '}
              on {formatDateTime(count.cancelled_at)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isActive && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCancelOpen(true)}
                disabled={acting}
              >
                <XCircle className="h-4 w-4 text-red-500" />
                Cancel
              </Button>
              <Button size="sm" onClick={() => setReviewOpen(true)} disabled={acting}>
                <Send className="h-4 w-4" />
                Move to Review
              </Button>
            </>
          )}
          {isReview && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCancelOpen(true)}
                disabled={acting}
              >
                <XCircle className="h-4 w-4 text-red-500" />
                Cancel
              </Button>
              <Button size="sm" onClick={() => setCommitOpen(true)} disabled={acting}>
                <ShieldCheck className="h-4 w-4" />
                Commit Count
              </Button>
            </>
          )}
          {isCommitted && canRevert && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRevertOpen(true)}
              disabled={acting}
            >
              <Undo2 className="h-4 w-4 text-red-500" />
              Revert Count
            </Button>
          )}
        </div>
      </div>

      {/* Cancelled notes — rendered for any cancelled count with notes */}
      {isCancelled && count.notes && count.notes.trim().length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <p className="whitespace-pre-wrap text-sm italic text-gray-600 dark:text-gray-400">
            {count.notes}
          </p>
        </div>
      )}

      {/* Review summary strip */}
      {isReview && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <strong>{varianceSummary.total}</strong> products counted.{' '}
          <strong>{varianceSummary.positive + varianceSummary.negative}</strong> variance
          {varianceSummary.positive + varianceSummary.negative === 1 ? '' : 's'} detected
          {' ('}
          <span className="text-green-700 dark:text-green-400">
            +{varianceSummary.positive} over
          </span>
          ,{' '}
          <span className="text-red-700 dark:text-red-400">
            -{varianceSummary.negative} under
          </span>
          {', '}
          {varianceSummary.zero} at expected).
        </div>
      )}

      {/* Scan bar */}
      {isActive && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20">
          <div className="flex items-center gap-3 text-sm text-blue-900 dark:text-blue-200">
            <PackageSearch className="h-5 w-5 flex-shrink-0" />
            <span>
              <strong>Ready to scan.</strong> Each scan increments the counted quantity by 1.
              Tap a counted value below to override manually.
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search by product name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {isReview && (
          <label className="flex items-center gap-2 text-sm text-ui-text">
            <input
              type="checkbox"
              checked={varianceOnly}
              onChange={(e) => setVarianceOnly(e.target.checked)}
            />
            Variances only
          </label>
        )}
      </div>

      {/* Items table */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={
            items.length === 0
              ? isActive
                ? 'No products counted yet'
                : 'No items on this count'
              : 'No matching items'
          }
          description={
            items.length === 0 && isActive
              ? 'Scan a product to begin. Each scan increments the counted quantity by 1.'
              : search
              ? 'Try a different search term.'
              : isReview && varianceOnly
              ? 'All products are at expected counts. Toggle the filter to see everything.'
              : ''
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Product
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Expected
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Counted
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Variance
                </th>
                {isCommitted && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Adjustment
                  </th>
                )}
                {canEditQty && (
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Last by
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {filteredItems.map((item) => {
                const variance = item.counted_qty - item.expected_qty;
                const isEditing = editingItemId === item.id;
                return (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.product?.name ?? 'Unknown product'}
                      </div>
                      {item.product?.sku && (
                        <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {item.product.sku}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300">
                      {item.expected_qty}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {isEditing ? (
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => commitEdit(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEdit(item);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          className="w-20 text-right"
                          autoFocus
                          data-qty-edit-input="true"
                          aria-label={`Counted quantity for ${item.product?.name ?? 'product'}`}
                        />
                      ) : canEditQty ? (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400"
                        >
                          {item.counted_qty}
                        </button>
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {item.counted_qty}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-sm font-semibold ${
                        variance === 0
                          ? 'text-gray-500 dark:text-gray-400'
                          : variance > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {variance > 0 ? `+${variance}` : variance}
                    </td>
                    {isCommitted && (
                      <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300">
                        {variance === 0 ? '—' : variance > 0 ? `+${variance}` : variance}
                      </td>
                    )}
                    {canEditQty && (
                      <td className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400">
                        {employeeName(item.last_updated_by_employee)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Move to Review confirm */}
      <ConfirmDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="Move to Review?"
        description="The scanner will be disabled. You can still edit quantities manually, then commit or cancel the count."
        confirmLabel="Move to Review"
        variant="default"
        loading={acting}
        onConfirm={handleMoveToReview}
      />

      {/* Commit confirm */}
      <ConfirmDialog
        open={commitOpen}
        onOpenChange={setCommitOpen}
        title="Commit this inventory count?"
        description={
          <div className="space-y-3">
            <p>
              This will update quantities for{' '}
              <strong>
                {varianceSummary.positive + varianceSummary.negative} product
                {varianceSummary.positive + varianceSummary.negative === 1 ? '' : 's'}
              </strong>{' '}
              and write an adjustment log entry for each. This cannot be undone.
            </p>
            {topVariances.length === 0 ? (
              <p className="text-ui-text-muted">
                All products are at expected counts — commit will complete with no changes.
              </p>
            ) : (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                  Top variances
                </div>
                <ul className="space-y-0.5">
                  {topVariances.map((v, idx) => (
                    <li key={idx} className="flex justify-between gap-4 text-sm">
                      <span className="truncate">{v.name}</span>
                      <span
                        className={
                          v.delta > 0
                            ? 'font-semibold text-green-600 dark:text-green-400'
                            : 'font-semibold text-red-600 dark:text-red-400'
                        }
                      >
                        {v.delta > 0 ? `+${v.delta}` : v.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        }
        confirmLabel="Commit"
        variant="default"
        loading={acting}
        onConfirm={handleCommit}
      />

      {/* Cancel confirm */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this count?"
        description="Counted quantities are kept for audit, but no stock adjustments are written. This cannot be undone."
        confirmLabel="Cancel Count"
        variant="destructive"
        loading={acting}
        onConfirm={handleCancel}
      />

      {/* Revert confirm */}
      <ConfirmDialog
        open={revertOpen}
        onOpenChange={setRevertOpen}
        title="Revert Inventory Count"
        description={
          <div className="space-y-3">
            {revertMode === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Spinner className="h-4 w-4" />
                Loading preview…
              </div>
            )}

            {revertMode === 'error' && (
              <p className="text-sm text-gray-500">Preview unavailable.</p>
            )}

            {revertMode === 'blocked-stale' && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  This count is no longer in a revertable state. It may have been
                  reverted in another session. Close this dialog to see the current
                  state.
                </p>
              </div>
            )}

            {revertMode === 'blocked-negative' && revertPreview && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
                <div className="flex gap-3">
                  <XOctagon className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="flex-1 space-y-2 text-sm text-red-900 dark:text-red-200">
                    <p className="font-medium">
                      Cannot revert — {revertPreview.projected_negative_products.length} product
                      {revertPreview.projected_negative_products.length === 1 ? '' : 's'} would have negative quantity
                    </p>
                    <ul className="space-y-1">
                      {revertPreview.projected_negative_products.map((p) => (
                        <li key={p.product_id}>
                          <Link
                            href={`/admin/catalog/products/${p.product_id}`}
                            target="_blank"
                            rel="noopener"
                            className="underline text-red-900 hover:text-red-700 dark:text-red-200 dark:hover:text-red-100"
                          >
                            {p.name ?? 'Unknown product'}
                          </Link>
                          {' — current '}
                          <span className="font-mono">{p.current_qty}</span>
                          {', would set '}
                          <span className="font-mono">{p.target_qty}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs">
                      Adjust quantities in a new tab, then return here. The modal
                      will re-check automatically when you switch back, or click
                      Recheck below.
                    </p>
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={fetchRevertPreview}
                        disabled={revertPreviewLoading}
                      >
                        {revertPreviewLoading ? 'Checking…' : 'Recheck'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {revertMode === 'normal' && revertPreview && (
              <>
                <p>
                  This will inverse{' '}
                  <strong>
                    {revertPreview.reversals_count} stock adjustment
                    {revertPreview.reversals_count === 1 ? '' : 's'}
                  </strong>{' '}
                  across{' '}
                  <strong>
                    {revertPreview.original_products} product
                    {revertPreview.original_products === 1 ? '' : 's'}
                  </strong>
                  , restoring pre-commit quantities. The count will move to{' '}
                  <strong>cancelled</strong>.
                </p>

                {revertPreview.has_drift && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="space-y-2 text-sm text-amber-900 dark:text-amber-200">
                        <p className="font-medium">
                          {revertPreview.drift_adjustments} non-count adjustment
                          {revertPreview.drift_adjustments === 1 ? '' : 's'} on{' '}
                          {revertPreview.drift_products} product
                          {revertPreview.drift_products === 1 ? '' : 's'} since commit
                        </p>
                        <p>
                          Reversal math is still correct — it subtracts this count&apos;s
                          delta from live quantities. But subsequent sales, refunds, or
                          receipts on these products will remain in place. The final
                          quantities may no longer match physical stock.
                        </p>
                        {revertPreview.top_drifted.length > 0 && (
                          <div>
                            <div className="mb-1 text-xs font-medium uppercase tracking-wide">
                              Top drifted products
                            </div>
                            <ul className="space-y-0.5">
                              {revertPreview.top_drifted.map((d) => (
                                <li
                                  key={d.product_id}
                                  className="flex justify-between gap-4 text-xs"
                                >
                                  <span className="truncate">{d.product_name}</span>
                                  <span className="font-mono">
                                    {d.adjustment_count} adj · net{' '}
                                    {d.net_change > 0 ? `+${d.net_change}` : d.net_change}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-md bg-gray-50 p-3 text-center dark:bg-gray-800/50">
                  <p className="text-sm text-gray-700 dark:text-gray-300">Type to confirm:</p>
                  <p className="mt-1 font-mono text-lg font-bold text-gray-900 dark:text-gray-100">
                    CONFIRM
                  </p>
                </div>
              </>
            )}
          </div>
        }
        confirmLabel="Revert Count"
        cancelLabel={revertMode === 'blocked-stale' ? 'Close' : 'Cancel'}
        variant="destructive"
        loading={acting}
        requireConfirmText="CONFIRM"
        blockedByExternalError={revertBlocked}
        onConfirm={handleRevert}
      />

      {isCommitted && (
        <p className="text-sm text-ui-text-muted">
          Proper per-count audit-log filter is deferred — Stock History currently
          only filters by adjustment type. Check the Stock History page to see
          the adjustment rows recorded by this count.
        </p>
      )}
    </div>
  );
}
