'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { z } from 'zod';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Product, Vendor } from '@/lib/supabase/types';
import { formatDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
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
import { Package } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type StockProduct = Product & {
  vendors: Pick<Vendor, 'id' | 'name'> | null;
};

type StockFilter = 'all' | 'low-stock' | 'out-of-stock';

const adjustSchema = z.object({
  adjustment: z.coerce.number().int('Must be a whole number'),
  reason: z.string().optional(),
});

type AdjustInput = z.infer<typeof adjustSchema>;

export default function InventoryPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [adjustTarget, setAdjustTarget] = useState<StockProduct | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdjustInput>({
    resolver: formResolver(adjustSchema),
  });

  async function loadProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*, vendors(id, name)')
      .eq('is_active', true)
      .order('name');

    if (error) {
      toast.error('Failed to load inventory');
    } else {
      setProducts((data || []) as StockProduct[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (stockFilter === 'out-of-stock') return p.quantity_on_hand === 0;
      if (stockFilter === 'low-stock') {
        return (
          p.quantity_on_hand > 0 &&
          p.reorder_threshold !== null &&
          p.quantity_on_hand <= p.reorder_threshold
        );
      }
      return true;
    });
  }, [products, stockFilter]);

  // Summary counts
  const lowStockCount = products.filter(
    (p) =>
      p.quantity_on_hand > 0 &&
      p.reorder_threshold !== null &&
      p.quantity_on_hand <= p.reorder_threshold
  ).length;
  const outOfStockCount = products.filter((p) => p.quantity_on_hand === 0).length;

  function getStockBadge(product: StockProduct) {
    if (product.quantity_on_hand === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    }
    if (product.reorder_threshold !== null && product.quantity_on_hand <= product.reorder_threshold) {
      return <Badge variant="warning">Low Stock</Badge>;
    }
    return null;
  }

  function openAdjust(product: StockProduct) {
    setAdjustTarget(product);
    reset({ adjustment: 0, reason: '' });
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
      const { error } = await supabase
        .from('products')
        .update({ quantity_on_hand: newQty })
        .eq('id', adjustTarget.id);

      if (error) throw error;

      const direction = data.adjustment > 0 ? 'increased' : 'decreased';
      toast.success(
        `${adjustTarget.name} stock ${direction} by ${Math.abs(data.adjustment)} (now ${newQty})`
      );
      setAdjustTarget(null);
      await loadProducts();
    } catch (err) {
      console.error('Adjust stock error:', err);
      toast.error('Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  }

  const columns: ColumnDef<StockProduct, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
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
          <span className="font-medium text-gray-900">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-500">
          {row.original.sku || '--'}
        </span>
      ),
    },
    {
      accessorKey: 'quantity_on_hand',
      header: 'Current Stock',
      cell: ({ row }) => {
        const badge = getStockBadge(row.original);
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAdjust(row.original)}
              className="font-medium text-blue-600 hover:underline"
            >
              {row.original.quantity_on_hand}
            </button>
            {badge}
          </div>
        );
      },
    },
    {
      id: 'reorder_threshold',
      header: 'Reorder At',
      cell: ({ row }) =>
        row.original.reorder_threshold !== null
          ? row.original.reorder_threshold
          : '--',
    },
    {
      id: 'vendor',
      header: 'Vendor',
      cell: ({ row }) => row.original.vendors?.name || '--',
      enableSorting: false,
    },
    {
      id: 'updated',
      header: 'Last Updated',
      cell: ({ row }) => formatDate(row.original.updated_at),
      enableSorting: false,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Overview"
        description={`${products.length} products tracked | ${lowStockCount} low stock | ${outOfStockCount} out of stock`}
      />

      <div className="flex items-center gap-4">
        <Select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value as StockFilter)}
          className="w-48"
        >
          <option value="all">All Products ({products.length})</option>
          <option value="low-stock">Low Stock ({lowStockCount})</option>
          <option value="out-of-stock">Out of Stock ({outOfStockCount})</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No products found"
        emptyDescription={
          stockFilter === 'all'
            ? 'No products in inventory yet.'
            : `No ${stockFilter.replace('-', ' ')} products.`
        }
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
              error={errors.adjustment?.message}
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

            {adjustTarget && (
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm text-gray-500">New Stock Level</div>
                <div className="text-lg font-semibold">
                  {/* This is static preview - actual validation on submit */}
                  {adjustTarget.quantity_on_hand} + adjustment
                </div>
              </div>
            )}
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
