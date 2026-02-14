'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Star, LayoutGrid } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogService {
  id: string;
  name: string;
  is_active: boolean;
  show_on_website: boolean;
  is_featured: boolean;
  display_order: number;
  category_id: string;
  service_categories: { name: string } | null;
}

interface CatalogProduct {
  id: string;
  name: string;
  is_active: boolean;
  show_on_website: boolean;
  is_featured: boolean;
  website_sort_order: number;
  category_id: string;
  product_categories: { name: string } | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CatalogDisplayPage() {
  const [tab, setTab] = useState<'services' | 'products'>('services');
  const [services, setServices] = useState<CatalogService[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadServices = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/catalog/services');
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      setServices(data ?? []);
    } catch {
      toast.error('Failed to load services');
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/catalog/products');
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      setProducts(data ?? []);
    } catch {
      toast.error('Failed to load products');
    }
  }, []);

  useEffect(() => {
    Promise.all([loadServices(), loadProducts()]).finally(() => setLoading(false));
  }, [loadServices, loadProducts]);

  // Optimistic toggle for services
  const toggleService = async (
    id: string,
    field: 'show_on_website' | 'is_featured',
    value: boolean
  ) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
    try {
      const res = await adminFetch('/api/admin/cms/catalog/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id, [field]: value }] }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [field]: !value } : s))
      );
      toast.error('Failed to update');
    }
  };

  // Optimistic toggle for products
  const toggleProduct = async (
    id: string,
    field: 'show_on_website' | 'is_featured',
    value: boolean
  ) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
    try {
      const res = await adminFetch('/api/admin/cms/catalog/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id, [field]: value }] }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: !value } : p))
      );
      toast.error('Failed to update');
    }
  };

  // Bulk actions
  const bulkServices = async (field: 'show_on_website', value: boolean) => {
    const updates = services.map((s) => ({ id: s.id, [field]: value }));
    setServices((prev) => prev.map((s) => ({ ...s, [field]: value })));
    try {
      const res = await adminFetch('/api/admin/cms/catalog/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(value ? 'All services shown on website' : 'All services hidden from website');
    } catch {
      loadServices();
      toast.error('Failed to update');
    }
  };

  const bulkProducts = async (field: 'show_on_website', value: boolean) => {
    const updates = products.map((p) => ({ id: p.id, [field]: value }));
    setProducts((prev) => prev.map((p) => ({ ...p, [field]: value })));
    try {
      const res = await adminFetch('/api/admin/cms/catalog/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(value ? 'All products shown on website' : 'All products hidden from website');
    } catch {
      loadProducts();
      toast.error('Failed to update');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const visibleServices = services.filter((s) => s.show_on_website).length;
  const visibleProducts = products.filter((p) => p.show_on_website).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog Display"
        description="Control which services and products appear on the public website"
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => setTab('services')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'services'
              ? 'bg-white shadow text-gray-900 dark:bg-gray-700 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Services ({visibleServices}/{services.length} visible)
        </button>
        <button
          type="button"
          onClick={() => setTab('products')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'products'
              ? 'bg-white shadow text-gray-900 dark:bg-gray-700 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Products ({visibleProducts}/{products.length} visible)
        </button>
      </div>

      {/* Services Tab */}
      {tab === 'services' && (
        <div className="space-y-4">
          {/* Bulk actions */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <button
              type="button"
              onClick={() => bulkServices('show_on_website', true)}
              className="hover:text-brand-600 underline"
            >
              Show all on website
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={() => bulkServices('show_on_website', false)}
              className="hover:text-brand-600 underline"
            >
              Hide all from website
            </button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Service</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Category</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">POS Active</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">Website</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">Featured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {services.map((service) => (
                  <tr key={service.id} className={!service.is_active ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {service.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {service.service_categories?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={service.is_active ? 'default' : 'secondary'}>
                        {service.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={service.show_on_website}
                          onCheckedChange={(val) => toggleService(service.id, 'show_on_website', val)}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleService(service.id, 'is_featured', !service.is_featured)}
                        className={`transition-colors ${
                          service.is_featured
                            ? 'text-yellow-500'
                            : 'text-gray-300 hover:text-yellow-400 dark:text-gray-600'
                        }`}
                      >
                        <Star className={`h-5 w-5 ${service.is_featured ? 'fill-current' : ''}`} />
                      </button>
                    </td>
                  </tr>
                ))}
                {services.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No services found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Products Tab */}
      {tab === 'products' && (
        <div className="space-y-4">
          {/* Bulk actions */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <button
              type="button"
              onClick={() => bulkProducts('show_on_website', true)}
              className="hover:text-brand-600 underline"
            >
              Show all on website
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={() => bulkProducts('show_on_website', false)}
              className="hover:text-brand-600 underline"
            >
              Hide all from website
            </button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Product</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Category</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">POS Active</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">Website</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">Featured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {products.map((product) => (
                  <tr key={product.id} className={!product.is_active ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {product.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {product.product_categories?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={product.is_active ? 'default' : 'secondary'}>
                        {product.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={product.show_on_website}
                          onCheckedChange={(val) => toggleProduct(product.id, 'show_on_website', val)}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleProduct(product.id, 'is_featured', !product.is_featured)}
                        className={`transition-colors ${
                          product.is_featured
                            ? 'text-yellow-500'
                            : 'text-gray-300 hover:text-yellow-400 dark:text-gray-600'
                        }`}
                      >
                        <Star className={`h-5 w-5 ${product.is_featured ? 'fill-current' : ''}`} />
                      </button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No products found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <div className="flex items-start gap-3">
          <LayoutGrid className="mt-0.5 h-5 w-5 text-blue-500" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">Website vs POS</p>
            <p className="mt-1 text-blue-600 dark:text-blue-400">
              Website visibility is independent from POS active status. You can sell a service in-store
              but hide it from the public website, or feature items that you want to highlight.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
