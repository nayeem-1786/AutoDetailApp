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
import { dateToPstStartOfDay, dateToPstEndOfDay } from '@/lib/utils/pst-date';
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
import { ArrowLeft, DollarSign, Trash2, X, Plus, Link2, Unlink, Sparkles } from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { MultiImageUpload } from '@/app/admin/catalog/components/multi-image-upload';
import {
  getSaleStatus,
  getTierSaleInfo,
  getSaleStatusDisplay,
  getSaleEndDescription,
  isEndingSoon,
} from '@/lib/utils/sale-pricing';

type ProductWithRelations = Product & {
  product_categories: Pick<ProductCategory, 'id' | 'name' | 'slug'> | null;
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
  const { granted: canEditProduct } = usePermission('products.edit');
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

  // Variant group state
  const [variants, setVariants] = useState<{ id: string; name: string; variant_label: string | null; retail_price: number; quantity_on_hand: number; image_url: string | null }[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<{ id: string; name: string; retail_price: number; vendor_name: string | null }[]>([]);
  const [groupSelectedIds, setGroupSelectedIds] = useState<string[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);

  // Original slug/category for SEO path sync on change
  const [originalSlug, setOriginalSlug] = useState<string>('');
  const [originalCategoryId, setOriginalCategoryId] = useState<string | null>(null);

  // AI Enrichment state (single product)
  const [singleEnriching, setSingleEnriching] = useState(false);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [acceptingEnrichment, setAcceptingEnrichment] = useState(false);

  // Specs form state (managed separately from react-hook-form for tag inputs)
  const [specKeyFeatures, setSpecKeyFeatures] = useState<string[]>([]);
  const [specSurfaceCompat, setSpecSurfaceCompat] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState('');
  const [newSurface, setNewSurface] = useState('');

  // Sale pricing state
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [saleStartsAt, setSaleStartsAt] = useState('');
  const [saleEndsAt, setSaleEndsAt] = useState('');
  const [savingSale, setSavingSale] = useState(false);
  const [showClearSaleDialog, setShowClearSaleDialog] = useState(false);
  const [saleDiscountType, setSaleDiscountType] = useState<'percentage' | 'fixed' | 'direct'>('direct');
  const [saleDiscountValue, setSaleDiscountValue] = useState<number | ''>('');

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
          .select('*, product_categories(id, name, slug), vendors(id, name)')
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

      // Store originals for SEO sync
      setOriginalSlug(p.slug);
      setOriginalCategoryId(p.category_id);

      // Populate form
      reset({
        name: p.name,
        slug: p.slug,
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
        variant_label: p.variant_label || '',
        specs: (p.specs as Record<string, unknown>) ?? null,
      });

      // Populate specs tag arrays
      const pSpecs = (p.specs as Record<string, unknown>) ?? {};
      setSpecKeyFeatures(Array.isArray(pSpecs.key_features) ? pSpecs.key_features as string[] : []);
      setSpecSurfaceCompat(Array.isArray(pSpecs.surface_compatibility) ? pSpecs.surface_compatibility as string[] : []);

      // Load variant group siblings
      if (p.product_group_id) {
        setVariantsLoading(true);
        fetch(`/api/admin/products/${productId}/variants`)
          .then(r => r.ok ? r.json() : { variants: [] })
          .then(d => setVariants(d.variants ?? []))
          .catch(() => {})
          .finally(() => setVariantsLoading(false));
      }

      // Check for pending enrichment draft
      supabase
        .from('product_enrichment_drafts')
        .select('id')
        .eq('product_id', productId)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle()
        .then(({ data: draft }: { data: { id: string } | null }) => setPendingDraftId(draft?.id ?? null));

      // Populate sale pricing
      setSalePrice(p.sale_price ?? '');
      setSaleStartsAt(p.sale_starts_at ? new Date(p.sale_starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : '');
      setSaleEndsAt(p.sale_ends_at ? new Date(p.sale_ends_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : '');
      setSaleDiscountType('direct');
      setSaleDiscountValue('');

      setLoading(false);
    }
    loadData();
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate sale price when discount type/value changes
  useEffect(() => {
    if (saleDiscountType === 'direct') return;
    if (typeof saleDiscountValue !== 'number' || saleDiscountValue <= 0) return;
    if (!product) return;

    const std = product.retail_price;
    if (std <= 0) return;

    const newPrice = saleDiscountType === 'percentage'
      ? Math.round(std * (1 - saleDiscountValue / 100) * 100) / 100
      : Math.max(0.01, Math.round((std - saleDiscountValue) * 100) / 100);

    setSalePrice(newPrice);
  }, [saleDiscountType, saleDiscountValue, product]);

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
      const newSlug = data.slug || originalSlug;

      // Check slug uniqueness
      if (newSlug !== originalSlug) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('slug', newSlug)
          .neq('id', productId)
          .maybeSingle();
        if (existing) {
          toast.error(`The slug "${newSlug}" is already in use by another product.`);
          setSaving(false);
          return;
        }
      }

      // Strip empty values from specs JSONB before saving
      let cleanSpecs: Record<string, unknown> | null = null;
      if (data.specs && typeof data.specs === 'object') {
        const filtered = Object.fromEntries(
          Object.entries(data.specs).filter(([, v]) => {
            if (v === null || v === undefined || v === '') return false;
            if (Array.isArray(v) && v.length === 0) return false;
            return true;
          })
        );
        cleanSpecs = Object.keys(filtered).length > 0 ? filtered : null;
      }

      const { error } = await supabase
        .from('products')
        .update({
          name: data.name,
          slug: newSlug,
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
          variant_label: data.variant_label || null,
          specs: cleanSpecs,
        })
        .eq('id', productId);

      if (error) throw error;

      // SEO path sync: update page_seo path + regenerate content if slug or category changed
      const slugChanged = newSlug !== originalSlug;
      const categoryChanged = (data.category_id || null) !== originalCategoryId;

      if (slugChanged || categoryChanged) {
        const oldCatSlug = originalCategoryId
          ? categories.find(c => c.id === originalCategoryId)?.slug
          : null;
        const newCatSlug = data.category_id
          ? categories.find(c => c.id === data.category_id)?.slug
          : null;

        if (oldCatSlug && newCatSlug) {
          const oldPath = `/products/${oldCatSlug}/${originalSlug}`;
          const newPath = `/products/${newCatSlug}/${newSlug}`;

          if (oldPath !== newPath) {
            // Step 1: Update page_path + focus_keyword immediately
            await supabase
              .from('page_seo')
              .update({
                page_path: newPath,
                focus_keyword: newSlug.replace(/-/g, ' '),
                updated_at: new Date().toISOString(),
              })
              .eq('page_path', oldPath);

            // Step 2: Trigger AI SEO regeneration for the new path (non-blocking)
            try {
              const genRes = await adminFetch('/api/admin/cms/seo/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'single', pagePath: newPath }),
              });

              if (genRes.ok) {
                const genData = await genRes.json();
                const generated = genData.data?.generated;
                if (generated) {
                  // Apply the generated SEO content
                  await adminFetch('/api/admin/cms/seo/ai-apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      pages: [{
                        pagePath: newPath,
                        seo_title: generated.seo_title,
                        meta_description: generated.meta_description,
                        meta_keywords: generated.meta_keywords,
                        focus_keyword: generated.focus_keyword,
                        og_title: generated.og_title,
                        og_description: generated.og_description,
                        internal_links: generated.internal_links,
                      }],
                    }),
                  });
                  toast.success('Product saved. SEO updated for new URL.');
                  router.push('/admin/catalog/products');
                  return;
                }
              }
            } catch {
              // AI regeneration failed — product still saved, SEO may need manual update
            }
            toast.success('Product saved. SEO may need manual update.');
            router.push('/admin/catalog/products');
            return;
          }
        }
      }

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

  async function onSaveSalePricing() {
    if (!product) return;
    setSavingSale(true);
    try {
      if (salePrice !== '' && typeof salePrice === 'number') {
        if (salePrice >= product.retail_price) {
          toast.error(`Sale price must be less than retail price (${formatCurrency(product.retail_price)})`);
          setSavingSale(false);
          return;
        }
        if (salePrice <= 0) {
          toast.error('Sale price must be greater than $0');
          setSavingSale(false);
          return;
        }
      }

      const startTs = dateToPstStartOfDay(saleStartsAt);
      const endTs = dateToPstEndOfDay(saleEndsAt);
      const sp = (salePrice !== '' && typeof salePrice === 'number') ? salePrice : null;

      const { error } = await supabase
        .from('products')
        .update({
          sale_price: sp,
          sale_starts_at: startTs,
          sale_ends_at: endTs,
        })
        .eq('id', productId);

      if (error) throw error;
      toast.success('Sale pricing updated');

      // Refresh product data
      const { data: updated } = await supabase
        .from('products')
        .select('*, product_categories(id, name, slug), vendors(id, name)')
        .eq('id', productId)
        .single();
      if (updated) {
        setProduct(updated as ProductWithRelations);
        setSalePrice(updated.sale_price ?? '');
        setSaleStartsAt(updated.sale_starts_at ? new Date(updated.sale_starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : '');
        setSaleEndsAt(updated.sale_ends_at ? new Date(updated.sale_ends_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : '');
      }
    } catch (err) {
      console.error('Failed to update sale pricing:', err);
      toast.error('Failed to update sale pricing');
    } finally {
      setSavingSale(false);
    }
  }

  async function clearSalePricing() {
    setSavingSale(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ sale_price: null, sale_starts_at: null, sale_ends_at: null })
        .eq('id', productId);
      if (error) throw error;
      toast.success('Sale pricing cleared');
      setSalePrice('');
      setSaleStartsAt('');
      setSaleEndsAt('');
      setShowClearSaleDialog(false);
      if (product) {
        setProduct({ ...product, sale_price: null, sale_starts_at: null, sale_ends_at: null });
      }
    } catch (err) {
      console.error('Failed to clear sale pricing:', err);
      toast.error('Failed to clear sale pricing');
    } finally {
      setSavingSale(false);
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
                <FormField
                  label="URL Slug"
                  error={errors.slug?.message}
                  htmlFor="slug"
                  description={(() => {
                    const s = watch('slug') || '';
                    const catId = watch('category_id');
                    const catSlug = catId ? categories.find(c => c.id === catId)?.slug : null;
                    return catSlug && s
                      ? `URL: /products/${catSlug}/${s}`
                      : 'Lowercase, hyphens, no special characters';
                  })()}
                >
                  <Input id="slug" {...register('slug')} placeholder="e.g. ceramic-spray-coating" className="font-mono text-sm" />
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField label="Short Description" error={errors.description?.message} htmlFor="description" description="1-2 sentences shown in product cards, search results, POS catalog, and voice agent quick answers.">
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

            {/* Alt text inputs for each image */}
            {productImages.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-medium text-gray-500">Image Alt Text (for SEO and accessibility)</p>
                {[...productImages].sort((a, b) => a.sort_order - b.sort_order).map((image, index) => (
                  <div key={image.id} className="flex items-center gap-3">
                    <img
                      src={image.image_url}
                      alt={image.alt_text ?? `Image ${index + 1}`}
                      className="h-8 w-8 rounded object-cover flex-shrink-0"
                    />
                    <Input
                      defaultValue={image.alt_text ?? ''}
                      placeholder={`${product?.name ?? 'Product'} - image ${index + 1}`}
                      className="text-sm"
                      onBlur={async (e) => {
                        const newAlt = e.target.value.trim() || null;
                        if (newAlt === (image.alt_text ?? null)) return;
                        const { error } = await supabase
                          .from('product_images')
                          .update({ alt_text: newAlt })
                          .eq('id', image.id);
                        if (error) {
                          toast.error('Failed to update alt text');
                        } else {
                          setProductImages(prev =>
                            prev.map(i => i.id === image.id ? { ...i, alt_text: newAlt } : i)
                          );
                        }
                      }}
                    />
                    {image.is_primary && (
                      <Badge variant="secondary" className="flex-shrink-0 text-[10px]">Primary</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- Variant Label ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Variant Label</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              label="Variant Label"
              htmlFor="variant_label"
              description="If this product comes in different sizes, colors, or packs, enter the variant descriptor (e.g. '16 oz', '1 Gallon', '6 inch', 'Blue'). Leave empty for standalone products."
            >
              <Input id="variant_label" {...register('variant_label')} placeholder="e.g. 16 oz" />
            </FormField>
          </CardContent>
        </Card>

        {/* ---- Variant Group ---- */}
        {product && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-5 w-5" />
                Variant Group
              </CardTitle>
            </CardHeader>
            <CardContent>
              {product.product_group_id ? (
                <div className="space-y-3">
                  {variantsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-4 w-4" /> Loading variants...</div>
                  ) : variants.length === 0 ? (
                    <p className="text-sm text-gray-500">No other variants found in this group.</p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {variants.map((v) => (
                        <div key={v.id} className="flex items-center justify-between px-3 py-2.5">
                          <Link href={`/admin/catalog/products/${v.id}`} className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate hover:text-blue-600">{v.name}</p>
                            <div className="flex gap-2 text-xs text-gray-500">
                              {v.variant_label && <span className="font-medium">{v.variant_label}</span>}
                              <span>{formatCurrency(v.retail_price)}</span>
                              <span>{v.quantity_on_hand > 0 ? `${v.quantity_on_hand} in stock` : 'Out of stock'}</span>
                            </div>
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-red-500 flex-shrink-0"
                            onClick={async () => {
                              const res = await fetch(`/api/admin/products/${v.id}/group`, { method: 'DELETE' });
                              if (res.ok) {
                                setVariants(prev => prev.filter(vv => vv.id !== v.id));
                                if (variants.length <= 1) {
                                  setProduct(prev => prev ? { ...prev, product_group_id: null } : prev);
                                }
                                toast.success('Variant removed from group');
                              } else {
                                toast.error('Failed to remove variant');
                              }
                            }}
                            title="Remove from group"
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">This product is not part of a variant group.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowGroupModal(true)}>
                    <Link2 className="h-4 w-4" />
                    Create Variant Group
                  </Button>

                  {showGroupModal && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-700">Search for products to group with this one:</p>
                      <Input
                        value={groupSearch}
                        onChange={async (e) => {
                          setGroupSearch(e.target.value);
                          if (e.target.value.trim().length < 2) { setGroupSearchResults([]); return; }
                          const { data } = await supabase
                            .from('products')
                            .select('id, name, retail_price, vendors(name)')
                            .eq('is_active', true)
                            .is('product_group_id', null)
                            .neq('id', productId)
                            .ilike('name', `%${e.target.value.trim()}%`)
                            .limit(10);
                          setGroupSearchResults((data ?? []).map((p: Record<string, unknown>) => ({
                            id: p.id as string,
                            name: p.name as string,
                            retail_price: p.retail_price as number,
                            vendor_name: (p.vendors as { name: string } | null)?.name ?? null,
                          })));
                        }}
                        placeholder="Search by product name..."
                        className="text-sm"
                      />
                      {groupSearchResults.length > 0 && (
                        <div className="divide-y rounded-lg border bg-white max-h-48 overflow-auto">
                          {groupSearchResults.map((r) => {
                            const selected = groupSelectedIds.includes(r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setGroupSelectedIds(prev =>
                                  selected ? prev.filter(id => id !== r.id) : [...prev, r.id]
                                )}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              >
                                <div>
                                  <p className="font-medium text-gray-900">{r.name}</p>
                                  <p className="text-xs text-gray-500">{r.vendor_name ?? 'No vendor'} &middot; {formatCurrency(r.retail_price)}</p>
                                </div>
                                {selected && <Badge variant="secondary">Selected</Badge>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={groupSelectedIds.length === 0 || groupCreating}
                          onClick={async () => {
                            setGroupCreating(true);
                            try {
                              const res = await fetch('/api/admin/products/group', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ productIds: [productId, ...groupSelectedIds] }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setProduct(prev => prev ? { ...prev, product_group_id: data.groupId } : prev);
                                const vRes = await fetch(`/api/admin/products/${productId}/variants`);
                                if (vRes.ok) {
                                  const vData = await vRes.json();
                                  setVariants(vData.variants ?? []);
                                }
                                setShowGroupModal(false);
                                setGroupSearch('');
                                setGroupSearchResults([]);
                                setGroupSelectedIds([]);
                                toast.success(`Variant group created with ${data.count} products`);
                              } else {
                                toast.error('Failed to create variant group');
                              }
                            } finally {
                              setGroupCreating(false);
                            }
                          }}
                        >
                          {groupCreating ? 'Creating...' : `Create Group (${groupSelectedIds.length + 1} products)`}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setShowGroupModal(false);
                          setGroupSearch('');
                          setGroupSearchResults([]);
                          setGroupSelectedIds([]);
                        }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---- Product Specs ---- */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Product Specs</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={singleEnriching}
                  onClick={async () => {
                    setSingleEnriching(true);
                    try {
                      // Submit batch of 1 product
                      const submitRes = await adminFetch('/api/admin/cms/products/ai-enrich', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'selected', productIds: [productId] }),
                      });
                      const submitData = await submitRes.json();
                      if (!submitRes.ok) {
                        toast.error(submitData.error || 'Enrichment failed');
                        return;
                      }
                      if (submitData.totalProducts === 0) {
                        toast.info(submitData.message || 'Product already enriched.');
                        return;
                      }

                      const batchId = submitData.batchId;
                      toast.info('Enrichment submitted. Waiting for results...');

                      // Poll every 5 seconds until complete
                      let attempts = 0;
                      const maxAttempts = 120; // 10 minutes
                      while (attempts < maxAttempts) {
                        await new Promise(r => setTimeout(r, 5_000));
                        attempts++;
                        const statusRes = await adminFetch(`/api/admin/cms/products/ai-enrich/status?batchId=${batchId}`);
                        if (!statusRes.ok) continue;
                        const statusData = await statusRes.json();
                        if (statusData.anthropicStatus === 'ended' || statusData.status === 'completed') {
                          // Process results
                          const resultsRes = await adminFetch('/api/admin/cms/products/ai-enrich/results', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ batchId }),
                          });
                          if (resultsRes.ok) {
                            // Check for pending draft
                            const { data: draft } = await supabase
                              .from('product_enrichment_drafts')
                              .select('id')
                              .eq('product_id', productId)
                              .eq('status', 'pending')
                              .limit(1)
                              .maybeSingle();
                            if (draft) setPendingDraftId(draft.id);
                            toast.success('Product enriched successfully');
                          } else {
                            toast.error('Failed to process enrichment results');
                          }
                          break;
                        }
                      }
                      if (attempts >= maxAttempts) {
                        toast.error('Enrichment timed out. Check the enrichment review page later.');
                      }
                    } catch {
                      toast.error('Enrichment failed');
                    } finally {
                      setSingleEnriching(false);
                    }
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  {singleEnriching ? 'Enriching...' : 'AI Enrich'}
                </Button>
                {pendingDraftId && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={acceptingEnrichment}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        setAcceptingEnrichment(true);
                        try {
                          const res = await adminFetch('/api/admin/cms/products/ai-enrich/apply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              actions: [{
                                draftId: pendingDraftId,
                                action: 'apply',
                                applyDescription: true,
                                applySpecs: true,
                              }],
                            }),
                          });
                          if (res.ok) {
                            setPendingDraftId(null);
                            toast.success('Enrichment applied');
                            // Reload product data to refresh specs on screen
                            const { data: refreshed } = await supabase
                              .from('products')
                              .select('*, product_categories(id, name, slug), vendors(id, name)')
                              .eq('id', productId)
                              .single();
                            if (refreshed) {
                              const p = refreshed as ProductWithRelations;
                              setProduct(p);
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
                                variant_label: p.variant_label || '',
                                specs: (p.specs as Record<string, unknown>) ?? null,
                              });
                              const pSpecs = (p.specs as Record<string, unknown>) ?? {};
                              setSpecKeyFeatures(Array.isArray(pSpecs.key_features) ? pSpecs.key_features as string[] : []);
                              setSpecSurfaceCompat(Array.isArray(pSpecs.surface_compatibility) ? pSpecs.surface_compatibility as string[] : []);
                            }
                          } else {
                            toast.error('Failed to apply enrichment');
                          }
                        } catch {
                          toast.error('Failed to apply enrichment');
                        } finally {
                          setAcceptingEnrichment(false);
                        }
                      }}
                    >
                      {acceptingEnrichment ? 'Applying...' : 'Accept Enrichment'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => router.push('/admin/catalog/products/enrichment-review')}
                    >
                      Enrichment Review
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Full Description" htmlFor="specs-overview" description="Detailed product description shown on the product detail page. What it is, what it does, and why it's great.">
              <Textarea
                id="specs-overview"
                rows={3}
                defaultValue={(watch('specs') as Record<string, unknown> | null)?.overview as string ?? ''}
                onBlur={(e) => {
                  const current = (watch('specs') as Record<string, unknown>) ?? {};
                  setValue('specs', { ...current, overview: e.target.value.trim() || undefined });
                }}
              />
            </FormField>

            <FormField label="Use Case" htmlFor="specs-use-case" description="What problem does this product solve? Who is it for?">
              <Textarea
                id="specs-use-case"
                rows={2}
                defaultValue={(watch('specs') as Record<string, unknown> | null)?.use_case as string ?? ''}
                onBlur={(e) => {
                  const current = (watch('specs') as Record<string, unknown>) ?? {};
                  setValue('specs', { ...current, use_case: e.target.value.trim() || undefined });
                }}
              />
            </FormField>

            <FormField label="Key Features" description="Add features one at a time, e.g. 'UV protection', 'Hydrophobic'">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {specKeyFeatures.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {f}
                    <button type="button" onClick={() => {
                      const next = specKeyFeatures.filter((_, idx) => idx !== i);
                      setSpecKeyFeatures(next);
                      const current = (watch('specs') as Record<string, unknown>) ?? {};
                      setValue('specs', { ...current, key_features: next.length > 0 ? next : undefined });
                    }} className="ml-0.5 text-gray-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  placeholder="Add a feature..."
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newFeature.trim()) {
                        const next = [...specKeyFeatures, newFeature.trim()];
                        setSpecKeyFeatures(next);
                        setNewFeature('');
                        const current = (watch('specs') as Record<string, unknown>) ?? {};
                        setValue('specs', { ...current, key_features: next });
                      }
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  if (newFeature.trim()) {
                    const next = [...specKeyFeatures, newFeature.trim()];
                    setSpecKeyFeatures(next);
                    setNewFeature('');
                    const current = (watch('specs') as Record<string, unknown>) ?? {};
                    setValue('specs', { ...current, key_features: next });
                  }
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </FormField>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Application Method" htmlFor="specs-app-method" description="e.g. Spray on, wipe off with microfiber towel">
                <Input
                  id="specs-app-method"
                  defaultValue={(watch('specs') as Record<string, unknown> | null)?.application_method as string ?? ''}
                  onBlur={(e) => {
                    const current = (watch('specs') as Record<string, unknown>) ?? {};
                    setValue('specs', { ...current, application_method: e.target.value.trim() || undefined });
                  }}
                />
              </FormField>

              <FormField label="Size / Volume" htmlFor="specs-size" description="e.g. 16 oz, 1 Gallon, 250ml, 5 inch">
                <Input
                  id="specs-size"
                  defaultValue={(watch('specs') as Record<string, unknown> | null)?.size_volume as string ?? ''}
                  onBlur={(e) => {
                    const current = (watch('specs') as Record<string, unknown>) ?? {};
                    setValue('specs', { ...current, size_volume: e.target.value.trim() || undefined });
                  }}
                />
              </FormField>

              <FormField label="Dilution Ratio" htmlFor="specs-dilution" description="e.g. Ready to use, 10:1, 4:1 for light cleaning">
                <Input
                  id="specs-dilution"
                  defaultValue={(watch('specs') as Record<string, unknown> | null)?.dilution_ratio as string ?? ''}
                  onBlur={(e) => {
                    const current = (watch('specs') as Record<string, unknown>) ?? {};
                    setValue('specs', { ...current, dilution_ratio: e.target.value.trim() || undefined });
                  }}
                />
              </FormField>

              <FormField label="Coverage / Yield" htmlFor="specs-coverage" description="e.g. 4-6 applications per bottle">
                <Input
                  id="specs-coverage"
                  defaultValue={(watch('specs') as Record<string, unknown> | null)?.coverage_yield as string ?? ''}
                  onBlur={(e) => {
                    const current = (watch('specs') as Record<string, unknown>) ?? {};
                    setValue('specs', { ...current, coverage_yield: e.target.value.trim() || undefined });
                  }}
                />
              </FormField>

              <FormField label="Scent" htmlFor="specs-scent">
                <Input
                  id="specs-scent"
                  defaultValue={(watch('specs') as Record<string, unknown> | null)?.scent as string ?? ''}
                  onBlur={(e) => {
                    const current = (watch('specs') as Record<string, unknown>) ?? {};
                    setValue('specs', { ...current, scent: e.target.value.trim() || undefined });
                  }}
                />
              </FormField>
            </div>

            <FormField label="Surface Compatibility" description="Add compatible surfaces, e.g. paint, glass, trim, wheels, leather">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {specSurfaceCompat.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    {s}
                    <button type="button" onClick={() => {
                      const next = specSurfaceCompat.filter((_, idx) => idx !== i);
                      setSpecSurfaceCompat(next);
                      const current = (watch('specs') as Record<string, unknown>) ?? {};
                      setValue('specs', { ...current, surface_compatibility: next.length > 0 ? next : undefined });
                    }} className="ml-0.5 text-blue-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSurface}
                  onChange={(e) => setNewSurface(e.target.value)}
                  placeholder="Add a surface..."
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newSurface.trim()) {
                        const next = [...specSurfaceCompat, newSurface.trim()];
                        setSpecSurfaceCompat(next);
                        setNewSurface('');
                        const current = (watch('specs') as Record<string, unknown>) ?? {};
                        setValue('specs', { ...current, surface_compatibility: next });
                      }
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  if (newSurface.trim()) {
                    const next = [...specSurfaceCompat, newSurface.trim()];
                    setSpecSurfaceCompat(next);
                    setNewSurface('');
                    const current = (watch('specs') as Record<string, unknown>) ?? {};
                    setValue('specs', { ...current, surface_compatibility: next });
                  }
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </FormField>

            <FormField label="Pro Tips" htmlFor="specs-tips" description="e.g. Apply in shade. Work one panel at a time.">
              <Textarea
                id="specs-tips"
                rows={2}
                defaultValue={(watch('specs') as Record<string, unknown> | null)?.pro_tips as string ?? ''}
                onBlur={(e) => {
                  const current = (watch('specs') as Record<string, unknown>) ?? {};
                  setValue('specs', { ...current, pro_tips: e.target.value.trim() || undefined });
                }}
              />
            </FormField>
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
          {canEditProduct && (
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </form>

      {/* ---- Sale Pricing Card ---- */}
      <ProductSalePricingCard
        product={product}
        salePrice={salePrice}
        setSalePrice={setSalePrice}
        saleStartsAt={saleStartsAt}
        setSaleStartsAt={setSaleStartsAt}
        saleEndsAt={saleEndsAt}
        setSaleEndsAt={setSaleEndsAt}
        onSave={onSaveSalePricing}
        discountType={saleDiscountType}
        setDiscountType={setSaleDiscountType}
        discountValue={saleDiscountValue}
        setDiscountValue={setSaleDiscountValue}
        onClear={() => setShowClearSaleDialog(true)}
        saving={savingSale}
      />

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

      <ConfirmDialog
        open={showClearSaleDialog}
        onOpenChange={setShowClearSaleDialog}
        title="Clear Sale Pricing"
        description="This will remove the sale price and date range for this product."
        confirmLabel="Clear Sale"
        variant="destructive"
        loading={savingSale}
        onConfirm={clearSalePricing}
      />
    </div>
  );
}

// ─── Product Sale Pricing Card ─────────────────────────────────────

function ProductSalePricingCard({
  product,
  salePrice,
  setSalePrice,
  saleStartsAt,
  setSaleStartsAt,
  saleEndsAt,
  setSaleEndsAt,
  onSave,
  onClear,
  saving,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
}: {
  product: ProductWithRelations;
  salePrice: number | '';
  setSalePrice: (v: number | '') => void;
  saleStartsAt: string;
  setSaleStartsAt: (v: string) => void;
  saleEndsAt: string;
  setSaleEndsAt: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
  saving: boolean;
  discountType: 'percentage' | 'fixed' | 'direct';
  setDiscountType: (v: 'percentage' | 'fixed' | 'direct') => void;
  discountValue: number | '';
  setDiscountValue: (v: number | '') => void;
}) {
  const hasDbSale = product.sale_price !== null;
  const hasSaleInput = salePrice !== '' && typeof salePrice === 'number';
  const hasError = hasSaleInput && salePrice >= product.retail_price;

  const saleStatus = getSaleStatus({
    sale_starts_at: product.sale_starts_at,
    sale_ends_at: product.sale_ends_at,
  });
  const statusDisplay = getSaleStatusDisplay(saleStatus);
  const endDesc = getSaleEndDescription(saleStatus.saleEndsAt);
  const endingSoon = isEndingSoon(saleStatus.saleEndsAt);

  const info = hasSaleInput
    ? getTierSaleInfo(product.retail_price, salePrice, true)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Sale Pricing
          {hasDbSale && (
            <Badge
              variant={
                saleStatus.isOnSale ? 'success' :
                saleStatus.isScheduled ? 'warning' :
                saleStatus.isExpired ? 'destructive' : 'secondary'
              }
            >
              {statusDisplay.emoji} {statusDisplay.label}
              {saleStatus.isOnSale && endDesc && ` — ${endDesc}`}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProductSaleDiscountControls
          discountType={discountType}
          setDiscountType={setDiscountType}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
        />
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Standard Price</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatCurrency(product.retail_price)}
            </p>
          </div>
          <FormField label="Sale Price">
            {discountType !== 'direct' ? (
              <p className="text-sm font-semibold text-gray-900 pt-2">
                {hasSaleInput ? formatCurrency(salePrice as number) : <span className="text-gray-400">—</span>}
              </p>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="No sale"
                  className={`pl-7 ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                />
                {hasError && (
                  <p className="mt-1 text-xs text-red-500">
                    Must be less than {formatCurrency(product.retail_price)}
                  </p>
                )}
              </div>
            )}
          </FormField>
          <FormField label="Start Date">
            <Input
              type="date"
              value={saleStartsAt}
              onChange={(e) => setSaleStartsAt(e.target.value)}
            />
          </FormField>
          <FormField label="End Date">
            <Input
              type="date"
              value={saleEndsAt}
              onChange={(e) => setSaleEndsAt(e.target.value)}
            />
          </FormField>
        </div>

        {/* Sale Preview */}
        {info && info.isDiscounted && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              {endingSoon && <span className="mr-1 text-amber-600">⏰</span>}
              <span className="text-gray-400 line-through">{formatCurrency(info.originalPrice)}</span>
              {' → '}
              <span className="font-semibold text-green-600">{formatCurrency(info.currentPrice)}</span>
              <span className="ml-2 text-xs text-gray-400">
                (-{info.discountPercent}%, save {formatCurrency(info.savings)})
              </span>
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          {hasDbSale && (
            <Button variant="outline" size="sm" onClick={onClear} disabled={saving}>
              <X className="h-4 w-4" />
              Clear Sale
            </Button>
          )}
          <div className="ml-auto">
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Sale Pricing'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Product Sale Discount Controls ────────────────────────────────

function ProductSaleDiscountControls({
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
}: {
  discountType: 'percentage' | 'fixed' | 'direct';
  setDiscountType: (v: 'percentage' | 'fixed' | 'direct') => void;
  discountValue: number | '';
  setDiscountValue: (v: number | '') => void;
}) {
  const types: { value: 'percentage' | 'fixed' | 'direct'; label: string }[] = [
    { value: 'percentage', label: 'Percentage off' },
    { value: 'fixed', label: 'Fixed amount off' },
    { value: 'direct', label: 'Direct price' },
  ];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-500">Discount type</p>
        <div className="flex gap-1.5">
          {types.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setDiscountType(t.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                discountType === t.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {discountType !== 'direct' && (
        <div className="max-w-[140px]">
          <p className="mb-1.5 text-xs font-medium text-gray-500">
            {discountType === 'percentage' ? 'Percent off' : 'Amount off'}
          </p>
          <div className="relative">
            {discountType === 'fixed' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
            )}
            <Input
              type="number"
              min="0"
              step={discountType === 'percentage' ? '1' : '0.01'}
              placeholder="0"
              className={discountType === 'fixed' ? 'pl-7 pr-3' : 'pr-8'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
            />
            {discountType === 'percentage' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
            )}
          </div>
        </div>
      )}
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
