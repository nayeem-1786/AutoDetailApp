'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { productCreateSchema, type ProductCreateInput } from '@/lib/utils/validation';
import { WATER_SKU } from '@/lib/utils/constants';
import type { Product, ProductCategory, ProductImage, Vendor } from '@/lib/supabase/types';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { usePermission } from '@/lib/hooks/use-permission';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, DollarSign, Trash2 } from 'lucide-react';
import { MultiImageUpload } from '@/app/admin/catalog/components/multi-image-upload';

type ProductWithRelations = Product & {
  product_categories: Pick<ProductCategory, 'id' | 'name'> | null;
  vendors: Pick<Vendor, 'id' | 'name'> | null;
};

interface CostHistoryEntry {
  date: string;
  po_number: string;
  po_id: string;
  unit_cost: number;
  quantity_received: number;
}

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const supabase = createClient();
  const { granted: canViewCost } = usePermission('inventory.view_costs');
  const { granted: canDeleteProduct } = usePermission('products.delete');

  const [product, setProduct] = useState<ProductWithRelations | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [costHistory, setCostHistory] = useState<CostHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProductCreateInput>({
    resolver: formResolver(productCreateSchema),
  });

  const watchSku = watch('sku');

  // Auto-disable loyalty if water SKU
  useEffect(() => {
    if (watchSku === WATER_SKU) {
      setValue('is_loyalty_eligible', false);
    }
  }, [watchSku, setValue]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [productRes, categoriesRes, vendorsRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, product_categories(id, name), vendors(id, name)')
          .eq('id', productId)
          .single(),
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

      if (productRes.error || !productRes.data) {
        toast.error('Product not found');
        router.push('/admin/catalog/products');
        return;
      }

      const p = productRes.data as ProductWithRelations;
      setProduct(p);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);

      // Load product images
      const { data: imgData } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order');
      if (imgData) setProductImages(imgData);

      // Load cost history from PO receiving
      const { data: poItems } = await supabase
        .from('po_items')
        .select('unit_cost, quantity_received, purchase_order_id, purchase_orders(id, po_number, received_at)')
        .eq('product_id', productId)
        .gt('quantity_received', 0)
        .order('created_at', { ascending: false })
        .limit(10);

      if (poItems) {
        const history: CostHistoryEntry[] = poItems
          .filter((item: Record<string, unknown>) => item.purchase_orders)
          .map((item: Record<string, unknown>) => {
            const po = item.purchase_orders as { id: string; po_number: string; received_at: string | null };
            return {
              date: po.received_at || '',
              po_number: po.po_number,
              po_id: po.id,
              unit_cost: item.unit_cost as number,
              quantity_received: item.quantity_received as number,
            };
          });
        setCostHistory(history);
      }

      // Populate form
      reset({
        name: p.name,
        sku: p.sku || '',
        description: p.description || '',
        category_id: p.category_id || null,
        vendor_id: p.vendor_id || null,
        cost_price: p.cost_price,
        retail_price: p.retail_price,
        quantity_on_hand: p.quantity_on_hand,
        reorder_threshold: p.reorder_threshold ?? null,
        min_order_qty: p.min_order_qty ?? null,
        is_taxable: p.is_taxable,
        is_loyalty_eligible: p.is_loyalty_eligible,
        is_active: p.is_active,
        barcode: p.barcode || '',
      });

      setLoading(false);
    }
    loadData();
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Multi-image handlers (immediate operations) ---

  async function handleImageUpload(file: File) {
    const ext = file.name.split('.').pop();
    const fileId = crypto.randomUUID();
    const path = `products/${productId}/${fileId}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true });

    if (error) {
      console.error('Image upload error:', error);
      toast.error('Failed to upload image');
      return;
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(path);

    const isFirst = productImages.length === 0;
    const nextSort = isFirst ? 0 : Math.max(...productImages.map(i => i.sort_order)) + 1;

    const { data: row, error: insertErr } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        image_url: urlData.publicUrl,
        storage_path: path,
        sort_order: nextSort,
        is_primary: isFirst,
      })
      .select()
      .single();

    if (insertErr || !row) {
      console.error('Insert product_images error:', insertErr);
      toast.error('Failed to save image record');
      return;
    }

    setProductImages(prev => [...prev, row]);
    toast.success('Image uploaded');
  }

  async function handleImageRemove(image: ProductImage) {
    // Delete from storage
    await supabase.storage.from('product-images').remove([image.storage_path]);

    // Delete from DB
    const { error } = await supabase
      .from('product_images')
      .delete()
      .eq('id', image.id);

    if (error) {
      toast.error('Failed to remove image');
      return;
    }

    const remaining = productImages.filter(i => i.id !== image.id);

    // If we removed the primary, promote the next image
    if (image.is_primary && remaining.length > 0) {
      const nextPrimary = remaining.sort((a, b) => a.sort_order - b.sort_order)[0];
      await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', nextPrimary.id);
      remaining.forEach(i => {
        if (i.id === nextPrimary.id) i.is_primary = true;
      });
    }

    setProductImages(remaining);
    toast.success('Image removed');
  }

  async function handleImageReplace(image: ProductImage, file: File) {
    const ext = file.name.split('.').pop();
    const fileId = crypto.randomUUID();
    const newPath = `products/${productId}/${fileId}.${ext}`;

    // Upload new file
    const { error: uploadErr } = await supabase.storage
      .from('product-images')
      .upload(newPath, file, { upsert: true });

    if (uploadErr) {
      toast.error('Failed to upload replacement image');
      return;
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(newPath);

    // Update DB row
    const { error: updateErr } = await supabase
      .from('product_images')
      .update({ image_url: urlData.publicUrl, storage_path: newPath })
      .eq('id', image.id);

    if (updateErr) {
      toast.error('Failed to update image record');
      return;
    }

    // Delete old file from storage
    await supabase.storage.from('product-images').remove([image.storage_path]);

    setProductImages(prev =>
      prev.map(i => i.id === image.id ? { ...i, image_url: urlData.publicUrl, storage_path: newPath } : i)
    );
    toast.success('Image replaced');
  }

  async function handleSetPrimary(image: ProductImage) {
    // Unset old primary, set new primary
    const oldPrimary = productImages.find(i => i.is_primary);
    if (oldPrimary) {
      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('id', oldPrimary.id);
    }

    await supabase
      .from('product_images')
      .update({ is_primary: true })
      .eq('id', image.id);

    setProductImages(prev =>
      prev.map(i => ({ ...i, is_primary: i.id === image.id }))
    );
    toast.success('Primary image updated');
  }

  async function handleReorder(reorderedImages: ProductImage[]) {
    setProductImages(reorderedImages);

    // Batch-update sort_order
    const updates = reorderedImages.map(img =>
      supabase
        .from('product_images')
        .update({ sort_order: img.sort_order })
        .eq('id', img.id)
    );
    await Promise.all(updates);
  }

  async function onSubmit(data: ProductCreateInput) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: data.name,
          sku: data.sku || null,
          description: data.description || null,
          category_id: data.category_id || null,
          vendor_id: data.vendor_id || null,
          cost_price: data.cost_price,
          retail_price: data.retail_price,
          quantity_on_hand: data.quantity_on_hand,
          reorder_threshold: data.reorder_threshold ?? null,
          min_order_qty: data.min_order_qty ?? null,
          is_taxable: data.is_taxable,
          is_loyalty_eligible: data.is_loyalty_eligible,
          is_active: data.is_active,
          barcode: data.barcode || null,
        })
        .eq('id', productId);

      if (error) throw error;

      toast.success('Product updated successfully');
      router.push('/admin/catalog/products');
    } catch (err) {
      console.error('Update product error:', err);
      toast.error('Failed to update product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', productId);

      if (error) throw error;

      toast.success('Product deleted');
      router.push('/admin/catalog/products');
    } catch (err) {
      console.error('Delete product error:', err);
      toast.error('Failed to delete product');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit: ${product.name}`}
        action={
          <div className="flex items-center gap-3">
            <Controller
              name="is_active"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {field.value ? 'Active' : 'Inactive'}
                  </span>
                  <Switch
                    checked={field.value}
                    onCheckedChange={async (checked) => {
                      field.onChange(checked);
                      const { error } = await supabase
                        .from('products')
                        .update({ is_active: checked })
                        .eq('id', productId);
                      if (error) {
                        field.onChange(!checked);
                        toast.error('Failed to update status');
                      } else {
                        toast.success(checked ? 'Product activated' : 'Product deactivated');
                      }
                    }}
                  />
                </div>
              )}
            />
            <Button variant="outline" onClick={() => router.push('/admin/catalog/products')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {canDeleteProduct && (
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="Product Name" error={errors.name?.message} required htmlFor="name">
                <Input id="name" {...register('name')} placeholder="e.g. Ceramic Coating Spray" />
              </FormField>

              <FormField label="SKU" error={errors.sku?.message} htmlFor="sku">
                <Input id="sku" {...register('sku')} placeholder="e.g. CC-SPRAY-16" />
              </FormField>

              <div className="md:col-span-2">
                <FormField label="Description" error={errors.description?.message} htmlFor="description">
                  <Textarea id="description" {...register('description')} placeholder="Product description..." rows={3} />
                </FormField>
              </div>

              <FormField label="Category" error={errors.category_id?.message} htmlFor="category_id">
                <Select id="category_id" {...register('category_id')}>
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Vendor" error={errors.vendor_id?.message} htmlFor="vendor_id">
                <Select id="vendor_id" {...register('vendor_id')}>
                  <option value="">No vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Cost Price" error={errors.cost_price?.message} required htmlFor="cost_price">
                <Input
                  id="cost_price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('cost_price')}
                />
              </FormField>

              <FormField label="Retail Price" error={errors.retail_price?.message} required htmlFor="retail_price">
                <Input
                  id="retail_price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('retail_price')}
                />
              </FormField>

              <FormField label="Quantity on Hand" error={errors.quantity_on_hand?.message} htmlFor="quantity_on_hand">
                <Input
                  id="quantity_on_hand"
                  type="number"
                  min="0"
                  {...register('quantity_on_hand')}
                />
              </FormField>

              <FormField label="Reorder Threshold" error={errors.reorder_threshold?.message} htmlFor="reorder_threshold" description="Alert when stock drops to this level">
                <Input
                  id="reorder_threshold"
                  type="number"
                  min="0"
                  {...register('reorder_threshold')}
                />
              </FormField>

              <FormField label="Min Order Qty" error={errors.min_order_qty?.message} htmlFor="min_order_qty" description="Minimum quantity to order from vendor">
                <Input
                  id="min_order_qty"
                  type="number"
                  min="0"
                  {...register('min_order_qty')}
                  placeholder="e.g. 6"
                />
              </FormField>

              <FormField label="Barcode" error={errors.barcode?.message} htmlFor="barcode">
                <Input id="barcode" {...register('barcode')} placeholder="UPC / EAN barcode" />
              </FormField>

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Checkbox id="is_taxable" {...register('is_taxable')} />
                  <label htmlFor="is_taxable" className="text-sm font-medium text-gray-700">
                    Taxable
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="is_loyalty_eligible"
                    {...register('is_loyalty_eligible')}
                    disabled={watchSku === WATER_SKU}
                  />
                  <label htmlFor="is_loyalty_eligible" className="text-sm font-medium text-gray-700">
                    Loyalty Eligible
                    {watchSku === WATER_SKU && (
                      <span className="ml-2 text-xs text-gray-400">(Water is excluded)</span>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-sm font-medium text-gray-700">Product Images</p>
            <MultiImageUpload
              images={productImages}
              onUpload={handleImageUpload}
              onRemove={handleImageRemove}
              onReplace={handleImageReplace}
              onSetPrimary={handleSetPrimary}
              onReorder={handleReorder}
              disabled={saving}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/catalog/products')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Cost & Margin Card — permission-gated */}
      {canViewCost && product && (
        <CostMarginCard product={product} costHistory={costHistory} />
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Product"
        description={`Are you sure you want to delete "${product.name}"? This will deactivate the product from the catalog.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─── Cost & Margin Card ──────────────────────────────────────────

function CostMarginCard({
  product,
  costHistory,
}: {
  product: ProductWithRelations;
  costHistory: CostHistoryEntry[];
}) {
  const margin =
    product.retail_price > 0
      ? ((product.retail_price - product.cost_price) / product.retail_price) * 100
      : 0;

  function getMarginColor(m: number) {
    if (m > 40) return 'text-green-600';
    if (m >= 20) return 'text-amber-600';
    return 'text-red-600';
  }

  function getMarginVariant(m: number): 'success' | 'warning' | 'destructive' {
    if (m > 40) return 'success';
    if (m >= 20) return 'warning';
    return 'destructive';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5" />
          Cost & Margin
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Cost Price */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cost Price</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {formatCurrency(product.cost_price)}
            </p>
          </div>

          {/* Retail Price */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Retail Price</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {formatCurrency(product.retail_price)}
            </p>
          </div>

          {/* Margin */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Margin</p>
            <div className="mt-1 flex items-center gap-2">
              {product.cost_price > 0 ? (
                <>
                  <span className={`text-lg font-semibold ${getMarginColor(margin)}`}>
                    {margin.toFixed(1)}%
                  </span>
                  <Badge variant={getMarginVariant(margin)}>
                    {margin > 40 ? 'Healthy' : margin >= 20 ? 'Fair' : 'Low'}
                  </Badge>
                </>
              ) : (
                <span className="text-lg font-semibold text-gray-400">--</span>
              )}
            </div>
          </div>
        </div>

        {/* Min Order Qty */}
        {product.min_order_qty !== null && product.min_order_qty > 0 && (
          <div className="mt-4 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Min Order Qty</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{product.min_order_qty} units</p>
          </div>
        )}

        {/* Cost History */}
        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Cost History (from POs)</p>
          {costHistory.length > 0 ? (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">PO #</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Cost</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {costHistory.map((entry, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-3 py-2 text-gray-600">
                        {entry.date ? formatDate(entry.date) : '--'}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/inventory/purchase-orders/${entry.po_id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {entry.po_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(entry.unit_cost)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{entry.quantity_received}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No purchase order history yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
