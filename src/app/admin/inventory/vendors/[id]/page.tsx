'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Vendor, Product, ProductCategory } from '@/lib/supabase/types';
import { formatCurrency, formatDate, formatPhone } from '@/lib/utils/format';
import { usePermission } from '@/lib/hooks/use-permission';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Mail, Phone, Globe, MapPin, Clock, DollarSign } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type VendorProduct = Product & {
  product_categories: Pick<ProductCategory, 'id' | 'name'> | null;
};

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const canViewCost = usePermission('inventory.view_cost_data');
  const vendorId = params.id as string;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [lastOrders, setLastOrders] = useState<Record<string, { date: string; qty: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [vendorRes, productsRes] = await Promise.all([
        supabase
          .from('vendors')
          .select('*')
          .eq('id', vendorId)
          .single(),
        supabase
          .from('products')
          .select('*, product_categories(id, name)')
          .eq('vendor_id', vendorId)
          .order('name'),
      ]);

      if (vendorRes.error || !vendorRes.data) {
        toast.error('Vendor not found');
        router.push('/admin/inventory/vendors');
        return;
      }

      setVendor(vendorRes.data as Vendor);
      setProducts((productsRes.data ?? []) as VendorProduct[]);

      // Fetch last PO data per product for this vendor
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('product_id, quantity_ordered, created_at, purchase_orders!inner(vendor_id, status)')
        .eq('purchase_orders.vendor_id', vendorId)
        .in('purchase_orders.status', ['ordered', 'received'])
        .order('created_at', { ascending: false });

      if (poItems) {
        const map: Record<string, { date: string; qty: number }> = {};
        for (const item of poItems as Array<{ product_id: string; quantity_ordered: number; created_at: string }>) {
          if (!map[item.product_id]) {
            map[item.product_id] = { date: item.created_at, qty: item.quantity_ordered };
          }
        }
        setLastOrders(map);
      }

      setLoading(false);
    }

    load();
  }, [vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getMarginColor(margin: number): string {
    if (margin > 40) return 'text-green-600';
    if (margin >= 20) return 'text-yellow-600';
    return 'text-red-600';
  }

  const baseColumns: ColumnDef<VendorProduct, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Product Name',
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
      accessorKey: 'retail_price',
      header: 'Retail Price',
      size: 90,
      cell: ({ row }) => formatCurrency(row.original.retail_price),
    },
    {
      accessorKey: 'quantity_on_hand',
      header: 'Stock',
      size: 64,
      cell: ({ row }) => {
        const qty = row.original.quantity_on_hand;
        const threshold = row.original.reorder_threshold;
        if (qty === 0) return <span className="font-medium text-red-600">{qty}</span>;
        if (threshold !== null && qty <= threshold) return <span className="font-medium text-yellow-600">{qty}</span>;
        return <span>{qty}</span>;
      },
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
      id: 'min_order_qty',
      header: 'Min Qty',
      size: 70,
      cell: ({ row }) =>
        row.original.min_order_qty !== null
          ? row.original.min_order_qty
          : '--',
    },
  ];

  const costColumns: ColumnDef<VendorProduct, unknown>[] = canViewCost
    ? [
        {
          id: 'cost_price',
          header: 'Vendor Cost',
          size: 90,
          cell: ({ row }) =>
            row.original.cost_price > 0
              ? formatCurrency(row.original.cost_price)
              : '--',
        },
        {
          id: 'margin',
          header: 'Margin %',
          size: 70,
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

  const lastOrderColumns: ColumnDef<VendorProduct, unknown>[] = [
    {
      id: 'last_order_date',
      header: 'Last Order',
      size: 90,
      cell: ({ row }) => {
        const last = lastOrders[row.original.id];
        return last ? (
          <span className="text-sm">{formatDate(last.date)}</span>
        ) : (
          <span className="text-gray-400">--</span>
        );
      },
      enableSorting: false,
    },
    {
      id: 'last_order_qty',
      header: 'Last Qty',
      size: 70,
      cell: ({ row }) => {
        const last = lastOrders[row.original.id];
        return last ? last.qty : <span className="text-gray-400">--</span>;
      },
      enableSorting: false,
    },
  ];

  const statusColumn: ColumnDef<VendorProduct, unknown> = {
    id: 'status',
    header: 'Status',
    size: 80,
    cell: ({ row }) => {
      const p = row.original;
      if (!p.is_active) return <Badge variant="secondary">Inactive</Badge>;
      if (p.quantity_on_hand === 0) return '🔴';
      if (p.reorder_threshold !== null && p.quantity_on_hand <= p.reorder_threshold)
        return '🟡';
      return '🟢';
    },
    enableSorting: false,
  };

  const columns: ColumnDef<VendorProduct, unknown>[] = [
    ...baseColumns,
    ...costColumns,
    ...lastOrderColumns,
    statusColumn,
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!vendor) return null;

  const activeProducts = products.filter((p) => p.is_active);
  const totalRetailValue = activeProducts.reduce((sum, p) => sum + p.retail_price * p.quantity_on_hand, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={vendor.name}
        description="Vendor details and products"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/inventory/vendors')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Vendors
          </Button>
        }
      />

      {/* Vendor Info Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{vendor.name}</h2>
              {vendor.is_active ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            {vendor.contact_name && (
              <p className="mt-1 text-sm text-gray-500">Contact: {vendor.contact_name}</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendor.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="h-4 w-4 text-gray-400" />
              <a href={`mailto:${vendor.email}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                {vendor.email}
              </a>
            </div>
          )}
          {vendor.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="h-4 w-4 text-gray-400" />
              {formatPhone(vendor.phone)}
            </div>
          )}
          {vendor.website && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Globe className="h-4 w-4 text-gray-400" />
              <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">
                {vendor.website}
              </a>
            </div>
          )}
          {vendor.address && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 text-gray-400" />
              {vendor.address}
            </div>
          )}
          {vendor.lead_time_days !== null && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4 text-gray-400" />
              {vendor.lead_time_days} day{vendor.lead_time_days !== 1 ? 's' : ''} lead time
            </div>
          )}
          {vendor.min_order_amount !== null && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <DollarSign className="h-4 w-4 text-gray-400" />
              Min order: {formatCurrency(vendor.min_order_amount)}
            </div>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Active Products</div>
          <div className="text-2xl font-bold text-gray-900">{activeProducts.length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total Stock</div>
          <div className="text-2xl font-bold text-gray-900">
            {activeProducts.reduce((sum, p) => sum + p.quantity_on_hand, 0)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Stock Retail Value</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalRetailValue)}</div>
        </div>
      </div>

      {/* Products Table */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-gray-900">
          Products ({products.length})
        </h3>
        <DataTable
          columns={columns}
          data={products}
          emptyTitle="No products from this vendor"
          emptyDescription="Products assigned to this vendor will appear here."
        />
      </div>
    </div>
  );
}
