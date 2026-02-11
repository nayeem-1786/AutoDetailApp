'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { Vendor, Product } from '@/lib/supabase/types';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

interface POLineItem {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_ordered: number;
  unit_cost: number;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const supabase = createClient();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POLineItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [vendorRes, productRes] = await Promise.all([
        supabase
          .from('vendors')
          .select('*')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('name'),
      ]);

      setVendors(vendorRes.data ?? []);
      setProducts(productRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredProducts = products.filter((p) => {
    // Filter by selected vendor if applicable
    if (vendorId && p.vendor_id && p.vendor_id !== vendorId) return false;
    // Exclude already added products
    if (items.some((i) => i.product_id === p.id)) return false;
    // Search
    if (productSearch) {
      const q = productSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function addProduct(product: Product) {
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        quantity_ordered: product.min_order_qty || 1,
        unit_cost: product.cost_price,
      },
    ]);
    setProductSearch('');
  }

  function updateItem(index: number, field: 'quantity_ordered' | 'unit_cost', value: number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, i) => sum + i.quantity_ordered * i.unit_cost, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!vendorId) {
      toast.error('Select a vendor');
      return;
    }
    if (items.length === 0) {
      toast.error('Add at least one product');
      return;
    }

    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendorId,
          notes: notes || null,
          items: items.map((i) => ({
            product_id: i.product_id,
            quantity_ordered: i.quantity_ordered,
            unit_cost: i.unit_cost,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      toast.success('Purchase order created');
      router.push(`/admin/inventory/purchase-orders/${json.data.id}`);
    } catch (err) {
      console.error('Create PO error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  }

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
        title="New Purchase Order"
        description="Create a purchase order for a vendor"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/inventory/purchase-orders')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Vendor & Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <FormField label="Vendor" required htmlFor="vendor-select">
            <Select
              id="vendor-select"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Notes" htmlFor="po-notes">
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={2}
            />
          </FormField>
        </div>

        {/* Add Products */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Line Items ({items.length})
          </h3>

          {/* Product search */}
          <div className="mb-4">
            <SearchInput
              value={productSearch}
              onChange={setProductSearch}
              placeholder="Search products to add..."
              className="w-full sm:w-64"
            />
            {productSearch && filteredProducts.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {filteredProducts.slice(0, 10).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => addProduct(p)}
                  >
                    <span>
                      <span className="font-medium">{p.name}</span>
                      {p.sku && (
                        <span className="ml-2 font-mono text-xs text-gray-400">{p.sku}</span>
                      )}
                    </span>
                    <span className="text-gray-500">
                      Cost: {formatCurrency(p.cost_price)} | Stock: {p.quantity_on_hand}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Line items table */}
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium w-20">SKU</th>
                    <th className="pb-2 font-medium w-24">Qty</th>
                    <th className="pb-2 font-medium w-28">Unit Cost</th>
                    <th className="pb-2 font-medium w-24 text-right">Line Total</th>
                    <th className="pb-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.product_id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{item.product_name}</td>
                      <td className="py-2 font-mono text-xs text-gray-400">{item.sku || '--'}</td>
                      <td className="py-2">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity_ordered}
                          onChange={(e) => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 1)}
                          className="w-20"
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_cost}
                          onChange={(e) => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-24"
                        />
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(item.quantity_ordered * item.unit_cost)}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="pt-3 text-right font-semibold text-gray-900">
                      Total:
                    </td>
                    <td className="pt-3 text-right font-semibold text-gray-900">
                      {formatCurrency(total)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
              <Plus className="mx-auto mb-2 h-6 w-6 text-gray-400" />
              Search and add products above
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/inventory/purchase-orders')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || items.length === 0}>
            {saving ? 'Creating...' : 'Create Purchase Order'}
          </Button>
        </div>
      </form>
    </div>
  );
}
