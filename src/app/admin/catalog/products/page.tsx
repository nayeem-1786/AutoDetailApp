'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { z } from 'zod';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { Product, ProductCategory, Vendor } from '@/lib/supabase/types';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Package, ImageOff, Sparkles } from 'lucide-react';
import { usePermission } from '@/lib/hooks/use-permission';
import { ShieldAlert } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type ProductWithRelations = Product & {
  product_categories: Pick<ProductCategory, 'id' | 'name'> | null;
  vendors: Pick<Vendor, 'id' | 'name'> | null;
};

type StockFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';

const adjustSchema = z.object({
  adjustment: z.coerce.number().int('Must be a whole number'),
  reason: z.string().optional(),
});

type AdjustInput = z.infer<typeof adjustSchema>;

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { granted: canViewProducts, loading: loadingViewPerm } = usePermission('products.view');
  const { granted: canEditProducts } = usePermission('products.edit');
  const { granted: canViewCost } = usePermission('inventory.view_costs');
  const { granted: canViewStock } = usePermission('inventory.view_stock');
  const { granted: canAdjustStock } = usePermission('inventory.adjust_stock');

  const initialStock = (['all', 'in-stock', 'low-stock', 'out-of-stock'] as const).includes(
    searchParams.get('stock') as StockFilter
  )
    ? (searchParams.get('stock') as StockFilter)
    : 'all';

  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialStock);
  const [showInactive, setShowInactive] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<ProductWithRelations | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<ProductWithRelations | null>(null);

  // AI Enrichment batch state
  const [showEnrichConfirm, setShowEnrichConfirm] = useState(false);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [enrichBatchId, setEnrichBatchId] = useState<string | null>(null);
  const [enrichSubmitting, setEnrichSubmitting] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null); // null | 'submitted' | 'processing' | 'ended' | 'completed'
  const [enrichCounts, setEnrichCounts] = useState<{ processing: number; succeeded: number; errored: number; total: number }>({ processing: 0, succeeded: 0, errored: 0, total: 0 });
  const [enrichProcessing, setEnrichProcessing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetAdjustForm,
    formState: { errors: adjustErrors },
  } = useForm<AdjustInput>({
    resolver: formResolver(adjustSchema),
  });

  async function loadProducts() {
    setLoading(true);

    const productsRes = await supabase
      .from('products')
      .select('*, product_categories(id, name), vendors(id, name)')
      .order('name');

    if (productsRes.error) {
      console.error('Failed to load products:', productsRes.error);
      toast.error('Failed to load products');
      setLoading(false);
      return;
    }

    setProducts((productsRes.data ?? []) as ProductWithRelations[]);

    // Fetch filter options — partial failure OK
    const [categoriesRes, vendorsRes] = await Promise.all([
      supabase
        .from('product_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('vendors')
        .select('*')
        .eq('is_active', true)
        .order('name'),
    ]);

    let filterWarning = false;

    if (categoriesRes.error) {
      console.error('Failed to load categories:', categoriesRes.error);
      filterWarning = true;
    } else {
      setCategories(categoriesRes.data ?? []);
    }

    if (vendorsRes.error) {
      console.error('Failed to load vendors:', vendorsRes.error);
      filterWarning = true;
    } else {
      setVendors(vendorsRes.data ?? []);
    }

    if (filterWarning) {
      toast.error('Some filter options couldn\'t be loaded');
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
    // Load pending enrichment draft count
    supabase
      .from('product_enrichment_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }: { count: number | null }) => setPendingDraftCount(count ?? 0));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReactivate() {
    if (!reactivateTarget) return;
    const product = reactivateTarget;

    setReactivatingId(product.id);
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: true })
        .eq('id', product.id);

      if (error) throw error;

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: true } : p))
      );
      toast.success(`${product.name} reactivated`);
    } catch (err) {
      console.error('Reactivate product error:', err);
      toast.error('Failed to reactivate product');
    } finally {
      setReactivatingId(null);
      setReactivateTarget(null);
    }
  }

  function openAdjust(product: ProductWithRelations) {
    setAdjustTarget(product);
    resetAdjustForm({ adjustment: 0, reason: '' });
  }

  async function onAdjust(data: AdjustInput) {
    if (!adjustTarget) return;
    if (data.adjustment === 0) {
      toast.error('Adjustment cannot be zero');
      return;
    }

    const newQty = adjustTarget.quantity_on_hand + data.adjustment;
    if (newQty < 0) {
      toast.error('Stock cannot go below zero');
      return;
    }

    setAdjusting(true);
    try {
      const res = await adminFetch('/api/admin/stock-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: adjustTarget.id,
          adjustment: data.adjustment,
          reason: data.reason || null,
          adjustment_type: 'manual',
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      const direction = data.adjustment > 0 ? 'increased' : 'decreased';
      toast.success(
        `${adjustTarget.name} stock ${direction} by ${Math.abs(data.adjustment)} (now ${json.data.quantity_after})`
      );
      setAdjustTarget(null);
      await loadProducts();
    } catch (err) {
      console.error('Adjust stock error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  }

  const filtered = useMemo(() => {
    return products.filter((p) => {
      // Active/inactive filter
      if (!showInactive && !p.is_active) return false;
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku) return false;
      }
      // Category filter
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      // Vendor filter
      if (vendorFilter && p.vendor_id !== vendorFilter) return false;
      // Stock filter
      if (stockFilter === 'out-of-stock' && p.quantity_on_hand !== 0) return false;
      if (stockFilter === 'low-stock') {
        if (p.quantity_on_hand === 0) return false;
        if (p.reorder_threshold === null) return false;
        if (p.quantity_on_hand > p.reorder_threshold) return false;
      }
      if (stockFilter === 'in-stock') {
        if (p.quantity_on_hand === 0) return false;
        if (p.reorder_threshold !== null && p.quantity_on_hand <= p.reorder_threshold) return false;
      }
      return true;
    });
  }, [products, search, categoryFilter, vendorFilter, stockFilter, showInactive]);

  function getStockIcon(product: ProductWithRelations) {
    if (product.quantity_on_hand === 0) return '🔴';
    if (product.reorder_threshold !== null && product.quantity_on_hand <= product.reorder_threshold) return '🟡';
    return '🟢';
  }

  function getMarginColor(margin: number): string {
    if (margin > 40) return 'text-green-600';
    if (margin >= 20) return 'text-yellow-600';
    return 'text-red-600';
  }

  const baseColumns: ColumnDef<ProductWithRelations, unknown>[] = [
    {
      id: 'image',
      header: '',
      size: 40,
      cell: ({ row }) => (
        <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 overflow-hidden">
          {row.original.image_url ? (
            <img
              src={row.original.image_url}
              alt={row.original.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package className="h-4 w-4 text-gray-400" />
          )}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/catalog/products/${row.original.id}`)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      size: 80,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-500">
          {row.original.sku || '--'}
        </span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      size: 120,
      cell: ({ row }) => row.original.product_categories?.name || '--',
      enableSorting: false,
    },
    {
      id: 'vendor',
      header: 'Vendor',
      cell: ({ row }) => row.original.vendors?.name || '--',
      enableSorting: false,
    },
    {
      accessorKey: 'retail_price',
      header: 'Price',
      size: 80,
      cell: ({ row }) => formatCurrency(row.original.retail_price),
    },
  ];

  const costColumns: ColumnDef<ProductWithRelations, unknown>[] = canViewCost
    ? [
        {
          id: 'cost_price',
          header: 'Cost',
          size: 80,
          cell: ({ row }) =>
            row.original.cost_price > 0
              ? formatCurrency(row.original.cost_price)
              : '--',
        },
        {
          id: 'margin',
          header: 'Margin',
          size: 64,
          cell: ({ row }) => {
            const p = row.original;
            if (!p.cost_price || p.cost_price === 0 || p.retail_price === 0) return '--';
            const margin = (p.retail_price - p.cost_price) / p.retail_price * 100;
            return (
              <span className={`font-medium ${getMarginColor(margin)}`}>
                {margin.toFixed(0)}%
              </span>
            );
          },
          enableSorting: false,
        },
      ]
    : [];

  const stockColumns: ColumnDef<ProductWithRelations, unknown>[] = canViewStock
    ? [
        {
          accessorKey: 'quantity_on_hand',
          header: 'Stock',
          size: 64,
          cell: ({ row }) =>
            canAdjustStock ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openAdjust(row.original);
                }}
                className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                {row.original.quantity_on_hand}
              </button>
            ) : (
              <span>{row.original.quantity_on_hand}</span>
            ),
        },
        {
          id: 'reorder_threshold',
          header: 'Reorder At',
          size: 80,
          cell: ({ row }) =>
            row.original.reorder_threshold !== null
              ? row.original.reorder_threshold
              : '--',
        },
        {
          id: 'status',
          header: 'Status',
          size: 130,
          cell: ({ row }) => {
            const p = row.original;
            if (!p.is_active) {
              return (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Inactive</Badge>
                  {canEditProducts && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                      disabled={reactivatingId === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactivateTarget(p);
                      }}
                    >
                      {reactivatingId === p.id ? 'Activating...' : 'Activate'}
                    </Button>
                  )}
                </div>
              );
            }
            return getStockIcon(p);
          },
          enableSorting: false,
        },
      ]
    : [
        {
          id: 'status',
          header: 'Status',
          size: 130,
          cell: ({ row }) => {
            const p = row.original;
            if (!p.is_active) {
              return (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Inactive</Badge>
                  {canEditProducts && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                      disabled={reactivatingId === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactivateTarget(p);
                      }}
                    >
                      {reactivatingId === p.id ? 'Activating...' : 'Activate'}
                    </Button>
                  )}
                </div>
              );
            }
            return <Badge variant="success">Active</Badge>;
          },
          enableSorting: false,
        },
      ];

  // Poll batch status every 30 seconds
  const startPolling = useCallback((batchId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await adminFetch(`/api/admin/cms/products/ai-enrich/status?batchId=${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        setEnrichStatus(data.anthropicStatus ?? data.status);
        setEnrichCounts({
          processing: data.requestCounts?.processing ?? 0,
          succeeded: data.requestCounts?.succeeded ?? 0,
          errored: data.requestCounts?.errored ?? 0,
          total: data.totalRequests ?? 0,
        });

        // Batch finished — stop polling
        if (data.anthropicStatus === 'ended' || data.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setEnrichStatus('ended');
        }
      } catch {
        // Silently retry on next interval
      }
    }, 30_000);
  }, []);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Submit batch to Anthropic Message Batches API
  async function handleEnrichAll() {
    setShowEnrichConfirm(false);
    setEnrichSubmitting(true);

    try {
      const res = await adminFetch('/api/admin/cms/products/ai-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to submit batch');
        return;
      }

      if (data.totalProducts === 0) {
        toast.info(data.message || 'All products already enriched or pending review.');
        return;
      }

      setEnrichBatchId(data.batchId);
      setEnrichStatus('submitted');
      setEnrichCounts({ processing: data.totalProducts, succeeded: 0, errored: 0, total: data.totalProducts });
      toast.success(`Batch submitted! ${data.totalProducts} products queued for enrichment.${data.skipped ? ` ${data.skipped} skipped.` : ''}`);

      // Start polling
      startPolling(data.batchId);
    } catch (err) {
      console.error('Batch submission error:', err);
      toast.error('Failed to submit enrichment batch');
    } finally {
      setEnrichSubmitting(false);
    }
  }

  // Process results once batch is complete
  async function handleProcessResults() {
    if (!enrichBatchId) return;
    setEnrichProcessing(true);

    try {
      const res = await adminFetch('/api/admin/cms/products/ai-enrich/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: enrichBatchId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to process results');
        return;
      }

      setEnrichStatus('completed');
      setEnrichCounts(prev => ({ ...prev, succeeded: data.succeeded, errored: data.errored }));
      toast.success(`Results processed! ${data.succeeded} enriched, ${data.errored} errors.`);

      // Refresh pending draft count
      supabase
        .from('product_enrichment_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }: { count: number | null }) => setPendingDraftCount(count ?? 0));
    } catch (err) {
      console.error('Process results error:', err);
      toast.error('Failed to process enrichment results');
    } finally {
      setEnrichProcessing(false);
    }
  }

  const columns: ColumnDef<ProductWithRelations, unknown>[] = [
    ...baseColumns,
    ...costColumns,
    ...stockColumns,
  ];

  if (loadingViewPerm || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canViewProducts) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="h-12 w-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">You do not have permission to view products.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={`${products.length} products in catalog`}
        action={
          canEditProducts ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowEnrichConfirm(true)} disabled={enrichSubmitting || (enrichStatus !== null && enrichStatus !== 'completed')}>
                <Sparkles className="h-4 w-4" />
                {enrichSubmitting ? 'Submitting...' : 'AI Enrich Products'}
              </Button>
              {pendingDraftCount > 0 && (
                <Link href="/admin/catalog/products/enrichment-review" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors">
                  {pendingDraftCount} pending review{pendingDraftCount !== 1 ? 's' : ''}
                </Link>
              )}
              <Button onClick={() => router.push('/admin/catalog/products/new')}>
                <Plus className="h-4 w-4" />
                Add Product
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* AI Enrichment Batch Status */}
      {enrichStatus && enrichStatus !== 'completed' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {enrichStatus === 'submitted' && 'Batch submitted. Waiting for processing to start...'}
              {enrichStatus === 'processing' && `Enrichment in progress... ${enrichCounts.succeeded + enrichCounts.errored}/${enrichCounts.total} complete`}
              {enrichStatus === 'ended' && `Batch complete! ${enrichCounts.succeeded} succeeded, ${enrichCounts.errored} errors. Ready to process results.`}
            </span>
            <div className="flex gap-2">
              {enrichStatus === 'ended' && (
                <>
                  <Button size="sm" onClick={handleProcessResults} disabled={enrichProcessing}>
                    {enrichProcessing ? 'Processing...' : 'Process Results'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => router.push('/admin/catalog/products/enrichment-review')}>
                    Review Drafts
                  </Button>
                </>
              )}
            </div>
          </div>
          {enrichCounts.total > 0 && (
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.round(((enrichCounts.succeeded + enrichCounts.errored) / enrichCounts.total) * 100)}%` }}
              />
            </div>
          )}
          {enrichStatus !== 'ended' && (
            <p className="text-xs text-gray-500">Polling every 30 seconds. You can close this page and come back later.</p>
          )}
        </div>
      )}
      {enrichStatus === 'completed' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-green-700">
              Enrichment complete! {enrichCounts.succeeded} products enriched{enrichCounts.errored > 0 ? `, ${enrichCounts.errored} errors` : ''}.
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push('/admin/catalog/products/enrichment-review')}>
                Review Drafts
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEnrichStatus(null); setEnrichBatchId(null); }}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showEnrichConfirm}
        onOpenChange={setShowEnrichConfirm}
        title="AI Enrich Products"
        description={`Submit all ${products.filter(p => p.is_active).length} active products for AI enrichment? This runs in the background via Anthropic's batch API — you can close this page and come back later. Already-enriched products will be skipped. Results typically ready within 1 hour and are saved as drafts for your review.`}
        confirmLabel="Submit Batch"
        onConfirm={handleEnrichAll}
      />

      {(() => {
        const missingCount = products.filter((p) => p.is_active && !p.image_url).length;
        if (missingCount === 0) return null;
        return (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <ImageOff className="h-4 w-4 flex-shrink-0" />
              <span>{missingCount} active {missingCount === 1 ? 'product' : 'products'} missing images. Products without images won&apos;t display well to customers.</span>
            </div>
            <button
              type="button"
              className="ml-4 flex-shrink-0 font-medium text-amber-900 underline hover:text-amber-700"
              onClick={() => {
                setSearch('');
                setCategoryFilter('');
                setVendorFilter('');
                setStockFilter('all');
                setShowInactive(false);
              }}
            >
              Show all
            </button>
          </div>
        );
      })()}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or SKU..."
          className="w-full sm:w-64"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </Select>
        <Select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value as StockFilter)}
          className="w-full sm:w-40"
        >
          <option value="all">All Stock</option>
          <option value="in-stock">In Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="out-of-stock">Out of Stock</option>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Switch
            id="show-inactive-products"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive-products">Show Inactive</Label>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No products found"
        emptyDescription="Get started by adding your first product."
        emptyAction={
          canEditProducts ? (
            <Button onClick={() => router.push('/admin/catalog/products/new')}>
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          ) : undefined
        }
      />

      {/* Reactivate Confirm Dialog */}
      <ConfirmDialog
        open={!!reactivateTarget}
        onOpenChange={(open) => !open && setReactivateTarget(null)}
        title="Reactivate Product"
        description={`Are you sure you want to reactivate "${reactivateTarget?.name}"? It will become visible in POS and catalog.`}
        confirmLabel="Reactivate"
        loading={!!reactivatingId}
        onConfirm={handleReactivate}
      />

      {/* Quick Adjust Dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogClose onClose={() => setAdjustTarget(null)} />
        <DialogHeader>
          <DialogTitle>Adjust Stock: {adjustTarget?.name}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="mb-4 rounded-lg bg-gray-50 p-3">
            <div className="text-sm text-gray-500">Current Stock</div>
            <div className="text-2xl font-bold text-gray-900">
              {adjustTarget?.quantity_on_hand ?? 0}
            </div>
          </div>

          <form id="adjust-form" onSubmit={handleSubmit(onAdjust)} className="space-y-4">
            <FormField
              label="Adjustment"
              error={adjustErrors.adjustment?.message}
              required
              htmlFor="adjustment"
              description="Enter positive number to add, negative to subtract (e.g. +10 or -3)"
            >
              <Input
                id="adjustment"
                type="number"
                {...register('adjustment')}
                placeholder="e.g. +10 or -3"
              />
            </FormField>

            <FormField
              label="Reason"
              error={adjustErrors.reason?.message}
              htmlFor="adjust-reason"
            >
              <Input
                id="adjust-reason"
                {...register('reason')}
                placeholder="e.g. Recount, damaged, etc."
              />
            </FormField>
          </form>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAdjustTarget(null)} disabled={adjusting}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" disabled={adjusting}>
            {adjusting ? 'Updating...' : 'Update Stock'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
