'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductCategory, Vendor } from '@/lib/supabase/types';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Plus, Package } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type ProductWithRelations = Product & {
  product_categories: Pick<ProductCategory, 'id' | 'name'> | null;
  vendors: Pick<Vendor, 'id' | 'name'> | null;
};

type StockFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';

export default function ProductsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch products, categories, and vendors in parallel
      // If categories or vendors fail, still show products
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
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReactivate(product: ProductWithRelations) {
    if (!window.confirm(`Reactivate "${product.name}"?`)) return;

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

  function getStockBadge(product: ProductWithRelations) {
    if (product.quantity_on_hand === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    }
    if (product.reorder_threshold !== null && product.quantity_on_hand <= product.reorder_threshold) {
      return <Badge variant="warning">Low Stock</Badge>;
    }
    return <Badge variant="success">In Stock</Badge>;
  }

  const columns: ColumnDef<ProductWithRelations, unknown>[] = [
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
    {
      accessorKey: 'quantity_on_hand',
      header: 'Stock',
      size: 64,
      cell: ({ row }) => row.original.quantity_on_hand,
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
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                disabled={reactivatingId === p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleReactivate(p);
                }}
              >
                {reactivatingId === p.id ? 'Activating...' : 'Activate'}
              </Button>
            </div>
          );
        }
        return getStockBadge(p);
      },
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
        title="Products"
        description={`${products.length} products in catalog`}
        action={
          <Button onClick={() => router.push('/admin/catalog/products/new')}>
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        }
      />

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
          <Button onClick={() => router.push('/admin/catalog/products/new')}>
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        }
      />
    </div>
  );
}
