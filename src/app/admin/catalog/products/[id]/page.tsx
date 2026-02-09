'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { productCreateSchema, type ProductCreateInput } from '@/lib/utils/validation';
import { WATER_SKU } from '@/lib/utils/constants';
import type { Product, ProductCategory, Vendor } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { ImageUpload } from '@/app/admin/catalog/components/image-upload';

type ProductWithRelations = Product & {
  product_categories: Pick<ProductCategory, 'id' | 'name'> | null;
  vendors: Pick<Vendor, 'id' | 'name'> | null;
};

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const supabase = createClient();

  const [product, setProduct] = useState<ProductWithRelations | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
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
      if (p.image_url) setImagePreview(p.image_url);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);

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
        is_taxable: p.is_taxable,
        is_loyalty_eligible: p.is_loyalty_eligible,
        barcode: p.barcode || '',
      });

      setLoading(false);
    }
    loadData();
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null;

    const ext = imageFile.name.split('.').pop();
    const path = `products/${productId}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, imageFile, { upsert: true });

    if (error) {
      console.error('Image upload error:', error);
      toast.error('Failed to upload image');
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(path);

    return urlData.publicUrl;
  }

  async function onSubmit(data: ProductCreateInput) {
    setSaving(true);
    try {
      let imageUrl = product?.image_url || null;

      // Upload new image if selected
      if (imageFile) {
        const newUrl = await uploadImage();
        if (newUrl) imageUrl = newUrl;
      }

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
          is_taxable: data.is_taxable,
          is_loyalty_eligible: data.is_loyalty_eligible,
          barcode: data.barcode || null,
          image_url: imageUrl,
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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/catalog/products')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
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
            <p className="mb-3 text-sm font-medium text-gray-700">Product Image</p>
            <ImageUpload
              imageUrl={imagePreview}
              onUpload={async (file) => {
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
              }}
              onRemove={async () => {
                setImageFile(null);
                setImagePreview(null);
              }}
              uploading={saving}
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
