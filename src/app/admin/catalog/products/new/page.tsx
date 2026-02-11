'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { productCreateSchema, type ProductCreateInput } from '@/lib/utils/validation';
import { WATER_SKU } from '@/lib/utils/constants';
import type { ProductCategory, Vendor } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft } from 'lucide-react';
import { ImageUpload } from '@/app/admin/catalog/components/image-upload';

export default function NewProductPage() {
  const router = useRouter();
  const supabase = createClient();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductCreateInput>({
    resolver: formResolver(productCreateSchema),
    defaultValues: {
      name: '',
      sku: '',
      description: '',
      category_id: null,
      vendor_id: null,
      cost_price: 0,
      retail_price: 0,
      quantity_on_hand: 0,
      reorder_threshold: null,
      min_order_qty: null,
      is_taxable: true,
      is_loyalty_eligible: true,
      is_active: true,
      barcode: '',
    },
  });

  const watchSku = watch('sku');

  // Auto-disable loyalty if water SKU
  useEffect(() => {
    if (watchSku === WATER_SKU) {
      setValue('is_loyalty_eligible', false);
    }
  }, [watchSku, setValue]);

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
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
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);
      setLoadingOptions(false);
    }
    loadOptions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadImage(productId: string): Promise<string | null> {
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
      // Insert the product first
      const { data: product, error } = await supabase
        .from('products')
        .insert({
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
        .select('id')
        .single();

      if (error) throw error;

      // Upload image if selected
      if (imageFile && product) {
        const imageUrl = await uploadImage(product.id);
        if (imageUrl) {
          await supabase
            .from('products')
            .update({ image_url: imageUrl })
            .eq('id', product.id);
        }
      }

      toast.success('Product created successfully');
      router.push('/admin/catalog/products');
    } catch (err) {
      console.error('Create product error:', err);
      toast.error('Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  if (loadingOptions) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Product"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/catalog/products')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Products
          </Button>
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
                <Select
                  id="category_id"
                  {...register('category_id')}
                  defaultValue=""
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Vendor" error={errors.vendor_id?.message} htmlFor="vendor_id">
                <Select
                  id="vendor_id"
                  {...register('vendor_id')}
                  defaultValue=""
                >
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
                  placeholder="0.00"
                />
              </FormField>

              <FormField label="Retail Price" error={errors.retail_price?.message} required htmlFor="retail_price">
                <Input
                  id="retail_price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('retail_price')}
                  placeholder="0.00"
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
                  placeholder="e.g. 5"
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
                  <Checkbox id="is_taxable" {...register('is_taxable')} defaultChecked />
                  <label htmlFor="is_taxable" className="text-sm font-medium text-gray-700">
                    Taxable
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="is_loyalty_eligible"
                    {...register('is_loyalty_eligible')}
                    defaultChecked
                    disabled={watchSku === WATER_SKU}
                  />
                  <label htmlFor="is_loyalty_eligible" className="text-sm font-medium text-gray-700">
                    Loyalty Eligible
                    {watchSku === WATER_SKU && (
                      <span className="ml-2 text-xs text-gray-400">(Water is excluded)</span>
                    )}
                  </label>
                </div>
                <Controller
                  name="is_active"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Active</p>
                        <p className="text-xs text-gray-500">
                          {field.value
                            ? 'Product is visible in POS and catalog'
                            : 'Product is hidden from POS and catalog'}
                        </p>
                      </div>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                  )}
                />
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
            {saving ? 'Saving...' : 'Create Product'}
          </Button>
        </div>
      </form>
    </div>
  );
}
