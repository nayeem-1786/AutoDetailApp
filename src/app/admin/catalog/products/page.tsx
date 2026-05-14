'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { z } from 'zod';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { Product, ProductCategory, Vendor } from '@/lib/supabase/types';
import { formatCurrency, formatMoney } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { TableToolbar, type FilterConfig, type QuickFilterConfig } from '@/components/admin/table-toolbar';
import type { FilterValue } from '@/lib/hooks/useTableState';
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
import { Plus, Package, ImageOff, Sparkles, Pencil } from 'lucide-react';
import { usePermission } from '@/lib/hooks/use-permission';
import { ShieldAlert } from 'lucide-react';
import { useTableState } from '@/lib/hooks/useTableState';
import { useBarcodeScanner } from '@/lib/hooks/use-barcode-scanner';
import type { ColumnDef } from '@tanstack/react-table';
import { QuickEditDrawer } from './components/quick-edit-drawer';

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

const DEFAULT_FILTERS = {
  category: '',
  vendor: '',
  stock: 'all' as string,
  showInactive: false,
  showMissingImages: false,
};

export default function ProductsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { granted: canViewProducts, loading: loadingViewPerm } = usePermission('products.view');
  const { granted: canEditProducts } = usePermission('products.edit');
  const { granted: canViewCost } = usePermission('inventory.view_costs');
  const { granted: canViewStock } = usePermission('inventory.view_stock');
  const { granted: canAdjustStock } = usePermission('inventory.adjust_stock');

  const table = useTableState({ defaultFilters: DEFAULT_FILTERS });

  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<ProductWithRelations | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<ProductWithRelations | null>(null);
  const [quickEditTarget, setQuickEditTarget] = useState<Product | null>(null);
  const [quickEditOpen, setQuickEditOpen] = useState(false);

  useBarcodeScanner({
    onScan: async (barcode) => {
      try {
        const res = await adminFetch('/api/admin/products/barcode-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error || 'Lookup failed');
          return;
        }
        if (!json.product) {
          toast.error(`No product matches barcode ${barcode}`);
          return;
        }
        setQuickEditTarget(json.product as Product);
        setQuickEditOpen(true);
      } catch {
        toast.error('Lookup failed');
      }
    },
  });

  // Enrichment draft counts (for review link badge)
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [totalDraftCount, setTotalDraftCount] = useState(0);
  const [adjusting, setAdjusting] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetAdjustForm,
    formState: { errors: adjustErrors },
  } = useForm<AdjustInput>({
    resolver: formResolver(adjustSchema),
  });

  // Convenience accessors for filter values
  const categoryFilter = (table.filters.category as string) || '';
  const vendorFilter = (table.filters.vendor as string) || '';
  const stockFilter = ((table.filters.stock as string) || 'all') as StockFilter;
  const showInactive = table.filters.showInactive === true;
  const showMissingImages = table.filters.showMissingImages === true;

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

    // Load enrichment draft counts for review link badge
    supabase
      .from('product_enrichment_drafts')
      .select('id, status, error_message', { count: 'exact' })
      .then(({ data, count }: { data: Array<{ status: string; error_message: string | null }> | null; count: number | null }) => {
        setTotalDraftCount(count ?? 0);
        const pending = (data ?? []).filter(d => d.status === 'pending' && !d.error_message).length;
        setPendingDraftCount(pending);
      });
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
      // Missing images filter — only show active products with no image
      if (showMissingImages) {
        if (!p.is_active || (p.image_url && p.image_url.length > 0)) return false;
      }
      // Search filter (use debounced value)
      if (table.debouncedSearch) {
        const q = table.debouncedSearch.toLowerCase();
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
  }, [products, table.debouncedSearch, categoryFilter, vendorFilter, stockFilter, showInactive, showMissingImages]);

  // Toolbar filter configs — built from loaded data so options are dynamic
  const toolbarFilters: FilterConfig[] = useMemo(() => [
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      options: [
        { label: 'All Categories', value: '' },
        ...categories.map((c) => ({ label: c.name, value: c.id })),
      ],
    },
    {
      key: 'vendor',
      label: 'Vendor',
      type: 'select',
      options: [
        { label: 'All Vendors', value: '' },
        ...vendors.map((v) => ({ label: v.name, value: v.id })),
      ],
    },
    {
      key: 'stock',
      label: 'Stock',
      type: 'select',
      options: [
        { label: 'All Stock', value: 'all' },
        { label: 'In Stock', value: 'in-stock' },
        { label: 'Low Stock', value: 'low-stock' },
        { label: 'Out of Stock', value: 'out-of-stock' },
      ],
    },
    {
      key: 'showInactive',
      label: 'Show Inactive',
      type: 'boolean-toggle',
    },
  ], [categories, vendors]);

  const toolbarQuickFilters: QuickFilterConfig[] = useMemo(() => [
    {
      label: 'Out of Stock',
      filter: { stock: 'out-of-stock' } as Record<string, FilterValue>,
      isActive: (f: Record<string, FilterValue>) => f.stock === 'out-of-stock',
    },
    {
      label: 'Missing Images',
      filter: { showMissingImages: true } as Record<string, FilterValue>,
      isActive: (f: Record<string, FilterValue>) => f.showMissingImages === true,
    },
  ], []);

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
      accessorFn: (row) => row.product_categories?.name || '',
      cell: ({ row }) => row.original.product_categories?.name || '--',
    },
    {
      id: 'vendor',
      header: 'Vendor',
      accessorFn: (row) => row.vendors?.name || '',
      cell: ({ row }) => row.original.vendors?.name || '--',
    },
    {
      accessorKey: 'retail_price_cents',
      header: 'Price',
      size: 80,
      cell: ({ row }) => formatCurrency(row.original.retail_price_cents),
    },
  ];

  const costColumns: ColumnDef<ProductWithRelations, unknown>[] = canViewCost
    ? [
        {
          id: 'cost_price_cents',
          header: 'Cost',
          size: 80,
          cell: ({ row }) =>
            row.original.cost_price_cents > 0
              ? formatCurrency(row.original.cost_price_cents)
              : '--',
          enableSorting: false,
        },
        {
          id: 'margin',
          header: 'Margin',
          size: 64,
          cell: ({ row }) => {
            const p = row.original;
            if (!p.cost_price_cents || p.cost_price_cents === 0 || p.retail_price_cents === 0) return '--';
            const margin = (p.retail_price_cents - p.cost_price_cents) / p.retail_price_cents * 100;
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
          enableSorting: false,
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

  const quickEditColumn: ColumnDef<ProductWithRelations, unknown>[] = canEditProducts
    ? [
        {
          id: 'quick_edit',
          header: '',
          size: 48,
          cell: ({ row }) => (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQuickEditTarget(row.original);
                setQuickEditOpen(true);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ui-text-dim hover:bg-ui-bg-hover hover:text-ui-text"
              aria-label={`Quick edit ${row.original.name}`}
              title="Quick edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ),
          enableSorting: false,
        },
      ]
    : [];

  const columns: ColumnDef<ProductWithRelations, unknown>[] = [
    ...baseColumns,
    ...costColumns,
    ...stockColumns,
    ...quickEditColumn,
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
              {totalDraftCount > 0 && (
                <Link href="/admin/catalog/products/enrichment-review" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors">
                  <Sparkles className="h-3.5 w-3.5" />
                  Enrichment Review{pendingDraftCount > 0 ? ` (${pendingDraftCount} pending)` : ''}
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

      {(() => {
        const missingCount = products.filter((p) => p.is_active && !p.image_url).length;
        if (missingCount === 0) return null;
        return (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <ImageOff className="h-4 w-4 flex-shrink-0" />
              {showMissingImages ? (
                <span>Showing {missingCount} {missingCount === 1 ? 'product' : 'products'} missing images.</span>
              ) : (
                <span>{missingCount} active {missingCount === 1 ? 'product' : 'products'} missing images. Products without images won&apos;t display well to customers.</span>
              )}
            </div>
            <button
              type="button"
              className="ml-4 flex-shrink-0 font-medium text-amber-900 underline hover:text-amber-700"
              onClick={() => table.setFilter('showMissingImages', !showMissingImages)}
            >
              {showMissingImages ? 'Clear filter' : 'Show all'}
            </button>
          </div>
        );
      })()}

      <TableToolbar
        state={table}
        defaultFilters={DEFAULT_FILTERS}
        config={{
          searchPlaceholder: 'Search by name or SKU...',
          filters: toolbarFilters,
          quickFilters: toolbarQuickFilters,
        }}
      />

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
        initialSorting={table.sort ?? undefined}
        onSortingChange={table.setSort}
        initialPage={table.page}
        initialPageSize={table.pageSize}
        onPaginationChange={(page, size) => {
          table.setPage(page);
          if (size !== table.pageSize) table.setPageSize(size);
        }}
      />

      {/* Quick Edit Drawer */}
      <QuickEditDrawer
        open={quickEditOpen}
        product={quickEditTarget}
        onOpenChange={(open) => {
          setQuickEditOpen(open);
          if (!open) setQuickEditTarget(null);
        }}
        onSaved={(updated) => {
          setQuickEditTarget(updated);
          setProducts((prev) =>
            prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
          );
        }}
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
                type="text"
                inputMode="numeric"
                pattern="-?[0-9]*"
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
