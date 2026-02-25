'use client';

import { useEffect, useState, useRef, type ComponentType } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { productCategorySchema, type ProductCategoryInput } from '@/lib/utils/validation';
import type { ProductCategory, ServiceCategory, VehicleCategoryRecord } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Pencil, Trash2, Car, Bike, Truck, Ship, Plane, Upload, ImageOff } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type CategoryType = 'product' | 'service' | 'vehicle';

// Placeholder icons for vehicle categories without images
const VEHICLE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  automobile: Car,
  motorcycle: Bike,
  rv: Truck,
  boat: Ship,
  aircraft: Plane,
};

// Service category form uses the same shape as product category
const serviceCategorySchema = productCategorySchema;
type ServiceCategoryInput = ProductCategoryInput;

export default function CategoriesPage() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<CategoryType>('product');
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [serviceCounts, setServiceCounts] = useState<Record<string, number>>({});
  const [vehicleCategories, setVehicleCategories] = useState<VehicleCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Vehicle edit dialog state
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleCategoryRecord | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    display_name: '',
    description: '',
    image_alt: '',
    is_active: true,
    display_order: 0,
  });
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const vehicleFileRef = useRef<HTMLInputElement>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<CategoryType>('product');
  const [editingCategory, setEditingCategory] = useState<ProductCategory | ServiceCategory | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ category: ProductCategory | ServiceCategory; type: CategoryType } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductCategoryInput>({
    resolver: formResolver(productCategorySchema),
  });

  const watchName = watch('name');

  // Auto-generate slug from name
  useEffect(() => {
    if (!editingCategory && watchName) {
      const slug = watchName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setValue('slug', slug);
    }
  }, [watchName, editingCategory, setValue]);

  async function loadData() {
    setLoading(true);

    try {
      const [prodCatRes, svcCatRes, prodCountRes, svcCountRes] = await Promise.all([
        supabase.from('product_categories').select('*').order('display_order'),
        supabase.from('service_categories').select('*').order('display_order'),
        supabase.from('products').select('category_id').eq('is_active', true).not('category_id', 'is', null),
        supabase.from('services').select('category_id').eq('is_active', true).not('category_id', 'is', null),
      ]);

      if (prodCatRes.error && svcCatRes.error) {
        console.error('Failed to load categories:', prodCatRes.error, svcCatRes.error);
        toast.error('Failed to load categories');
        setLoading(false);
        return;
      }

      if (prodCatRes.error) {
        console.error('Failed to load product categories:', prodCatRes.error);
        toast.error('Failed to load product categories');
      } else {
        setProductCategories(prodCatRes.data);
      }

      if (svcCatRes.error) {
        console.error('Failed to load service categories:', svcCatRes.error);
        toast.error('Failed to load service categories');
      } else {
        setServiceCategories(svcCatRes.data);
      }

      // Build product count map
      const pMap: Record<string, number> = {};
      if (prodCountRes.data) {
        for (const row of prodCountRes.data) {
          if (row.category_id) {
            pMap[row.category_id] = (pMap[row.category_id] || 0) + 1;
          }
        }
      }
      setProductCounts(pMap);

      // Build service count map
      const sMap: Record<string, number> = {};
      if (svcCountRes.data) {
        for (const row of svcCountRes.data) {
          if (row.category_id) {
            sMap[row.category_id] = (sMap[row.category_id] || 0) + 1;
          }
        }
      }
      setServiceCounts(sMap);

      // Fetch vehicle categories via admin API
      try {
        const vcRes = await adminFetch('/api/admin/vehicle-categories');
        const vcJson = await vcRes.json();
        if (vcRes.ok && vcJson.data) {
          setVehicleCategories(vcJson.data);
        }
      } catch (vcErr) {
        console.error('Failed to load vehicle categories:', vcErr);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate(type: CategoryType) {
    setEditingCategory(null);
    setDialogType(type);
    reset({
      name: '',
      slug: '',
      description: '',
      display_order: 0,
    });
    setDialogOpen(true);
  }

  function openEdit(category: ProductCategory | ServiceCategory, type: CategoryType) {
    setEditingCategory(category);
    setDialogType(type);
    reset({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      display_order: category.display_order,
    });
    setDialogOpen(true);
  }

  function attemptDelete(category: ProductCategory | ServiceCategory, type: CategoryType) {
    const counts = type === 'product' ? productCounts : serviceCounts;
    const linkedCount = counts[category.id] || 0;

    if (linkedCount > 0) {
      const itemType = type === 'product' ? 'products' : 'services';
      toast.error(`Cannot delete "${category.name}" - it has ${linkedCount} linked ${itemType}. Reassign them first.`);
      return;
    }

    setDeleteTarget({ category, type });
  }

  async function onSubmit(data: ProductCategoryInput) {
    setSaving(true);
    const table = dialogType === 'product' ? 'product_categories' : 'service_categories';

    try {
      const payload = {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        display_order: data.display_order,
      };

      if (editingCategory) {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq('id', editingCategory.id);
        if (error) throw error;
        toast.success('Category updated');
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
        toast.success('Category created');
      }

      setDialogOpen(false);
      setEditingCategory(null);
      await loadData();
    } catch (err: unknown) {
      console.error('Save category error:', err);
      const message = err instanceof Error ? err.message : 'Failed to save category';
      // Check for unique constraint on slug
      if (typeof message === 'string' && message.includes('unique')) {
        toast.error('A category with this slug already exists');
      } else {
        toast.error('Failed to save category');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const table = deleteTarget.type === 'product' ? 'product_categories' : 'service_categories';

    try {
      const { error } = await supabase
        .from(table)
        .update({ is_active: false })
        .eq('id', deleteTarget.category.id);
      if (error) throw error;
      toast.success('Category deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      console.error('Delete category error:', err);
      toast.error('Failed to delete category');
    } finally {
      setDeleting(false);
    }
  }

  // Vehicle category functions
  function openVehicleEdit(vc: VehicleCategoryRecord) {
    setEditingVehicle(vc);
    setVehicleForm({
      display_name: vc.display_name,
      description: vc.description || '',
      image_alt: vc.image_alt || '',
      is_active: vc.is_active,
      display_order: vc.display_order,
    });
    setVehicleDialogOpen(true);
  }

  async function saveVehicle() {
    if (!editingVehicle) return;
    if (!vehicleForm.display_name.trim()) {
      toast.error('Display name is required');
      return;
    }

    setSavingVehicle(true);
    try {
      const res = await adminFetch(`/api/admin/vehicle-categories/${editingVehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: vehicleForm.display_name.trim(),
          description: vehicleForm.description.trim() || null,
          image_alt: vehicleForm.image_alt.trim() || null,
          is_active: vehicleForm.is_active,
          display_order: vehicleForm.display_order,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');

      toast.success('Vehicle category updated');
      setVehicleDialogOpen(false);
      setEditingVehicle(null);
      await loadData();
    } catch (err) {
      console.error('Save vehicle category error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save vehicle category');
    } finally {
      setSavingVehicle(false);
    }
  }

  async function handleVehicleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editingVehicle || !e.target.files?.[0]) return;
    const file = e.target.files[0];

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP files are supported');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await adminFetch(`/api/admin/vehicle-categories/${editingVehicle.id}/image`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');

      // Update the editing vehicle with the new image
      setEditingVehicle(json.data);
      toast.success('Image uploaded');
      await loadData();
    } catch (err) {
      console.error('Image upload error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (vehicleFileRef.current) vehicleFileRef.current.value = '';
    }
  }

  async function handleVehicleImageRemove() {
    if (!editingVehicle) return;
    setRemovingImage(true);
    try {
      const res = await adminFetch(`/api/admin/vehicle-categories/${editingVehicle.id}/image`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to remove image');

      setEditingVehicle(json.data);
      toast.success('Image removed');
      await loadData();
    } catch (err) {
      console.error('Image remove error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to remove image');
    } finally {
      setRemovingImage(false);
    }
  }

  function makeCategoryColumns(type: CategoryType): ColumnDef<ProductCategory | ServiceCategory, unknown>[] {
    const counts = type === 'product' ? productCounts : serviceCounts;
    const itemLabel = type === 'product' ? 'Products' : 'Services';

    return [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium text-gray-900">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'slug',
        header: 'Slug',
        size: 160,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-500">{row.original.slug}</span>
        ),
      },
      {
        accessorKey: 'display_order',
        header: 'Order',
        size: 64,
        cell: ({ row }) => row.original.display_order,
      },
      {
        id: 'items',
        header: itemLabel,
        size: 80,
        cell: ({ row }) => (
          <Badge variant="secondary">{counts[row.original.id] || 0}</Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: 'Status',
        size: 80,
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEdit(row.original, type)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => attemptDelete(row.original, type)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ),
        enableSorting: false,
      },
    ];
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
        title="Categories"
        description="Manage product, service, and vehicle categories"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CategoryType)}>
        <TabsList>
          <TabsTrigger value="product">
            Product Categories ({productCategories.length})
          </TabsTrigger>
          <TabsTrigger value="service">
            Service Categories ({serviceCategories.length})
          </TabsTrigger>
          <TabsTrigger value="vehicle">
            Vehicle Categories ({vehicleCategories.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="product">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => openCreate('product')}>
              <Plus className="h-4 w-4" />
              Add Product Category
            </Button>
          </div>
          <DataTable
            columns={makeCategoryColumns('product')}
            data={productCategories}
            emptyTitle="No product categories"
            emptyDescription="Create your first product category."
            emptyAction={
              <Button onClick={() => openCreate('product')}>
                <Plus className="h-4 w-4" />
                Add Category
              </Button>
            }
          />
        </TabsContent>

        <TabsContent value="service">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => openCreate('service')}>
              <Plus className="h-4 w-4" />
              Add Service Category
            </Button>
          </div>
          <DataTable
            columns={makeCategoryColumns('service')}
            data={serviceCategories}
            emptyTitle="No service categories"
            emptyDescription="Create your first service category."
            emptyAction={
              <Button onClick={() => openCreate('service')}>
                <Plus className="h-4 w-4" />
                Add Category
              </Button>
            }
          />
        </TabsContent>

        <TabsContent value="vehicle">
          <p className="mb-4 text-sm text-ui-text-muted">
            These 5 vehicle categories are fixed and control what appears in the booking flow.
            Edit display settings, images, and active status below.
          </p>
          <div className="space-y-3">
            {vehicleCategories.map((vc) => {
              const IconComponent = VEHICLE_ICONS[vc.key] || Car;
              return (
                <div
                  key={vc.id}
                  className={`flex items-center gap-4 rounded-lg border border-ui-border bg-ui-bg p-4 transition-opacity ${
                    !vc.is_active ? 'opacity-50' : ''
                  }`}
                >
                  {/* Image / Placeholder */}
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ui-bg-muted">
                    {vc.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={vc.image_url}
                        alt={vc.image_alt || vc.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <IconComponent className="h-8 w-8 text-ui-text-muted" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{vc.display_name}</span>
                      <Badge variant="secondary">
                        <span className="font-mono text-[10px]">{vc.key}</span>
                      </Badge>
                    </div>
                    {vc.description && (
                      <p className="mt-0.5 text-sm text-ui-text-muted truncate">{vc.description}</p>
                    )}
                  </div>

                  {/* Order */}
                  <div className="hidden sm:block text-sm text-ui-text-muted">
                    Order: {vc.display_order}
                  </div>

                  {/* Status */}
                  <div>
                    {vc.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>

                  {/* Edit */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openVehicleEdit(vc)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Vehicle Category Edit Dialog */}
      <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
        <DialogClose onClose={() => setVehicleDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>Edit Vehicle Category</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            {/* Image Upload Section */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ui-text">Image</label>
              <div className="flex items-start gap-4">
                <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-border bg-ui-bg-muted">
                  {editingVehicle?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editingVehicle.image_url}
                      alt={editingVehicle.image_alt || editingVehicle.display_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageOff className="h-8 w-8 text-ui-text-muted" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={vehicleFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleVehicleImageUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => vehicleFileRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {uploadingImage ? 'Uploading...' : 'Upload Image'}
                  </Button>
                  {editingVehicle?.image_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVehicleImageRemove}
                      disabled={removingImage}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {removingImage ? 'Removing...' : 'Remove Image'}
                    </Button>
                  )}
                  <p className="text-xs text-ui-text-muted">Recommended: 800x600px, landscape orientation</p>
                </div>
              </div>
            </div>

            {/* Key (read-only) */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ui-text">Key</label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  <span className="font-mono">{editingVehicle?.key}</span>
                </Badge>
                <span className="text-xs text-ui-text-muted">System identifier — cannot be changed</span>
              </div>
            </div>

            {/* Display Name */}
            <FormField label="Display Name" required htmlFor="vc-name">
              <Input
                id="vc-name"
                value={vehicleForm.display_name}
                onChange={(e) => setVehicleForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="e.g. Automobile"
              />
            </FormField>

            {/* Description */}
            <FormField label="Description" htmlFor="vc-desc">
              <Textarea
                id="vc-desc"
                value={vehicleForm.description}
                onChange={(e) => setVehicleForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Cars, trucks, SUVs, and vans"
                rows={2}
              />
            </FormField>

            {/* Image Alt Text */}
            <FormField label="Image Alt Text" htmlFor="vc-alt" description="Accessibility text for the image">
              <Input
                id="vc-alt"
                value={vehicleForm.image_alt}
                onChange={(e) => setVehicleForm((f) => ({ ...f, image_alt: e.target.value }))}
                placeholder="e.g. Automobile category"
              />
            </FormField>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-ui-text">Active</label>
                <p className="text-xs text-ui-text-muted">Controls visibility in the booking flow</p>
              </div>
              <Switch
                checked={vehicleForm.is_active}
                onCheckedChange={(checked) => setVehicleForm((f) => ({ ...f, is_active: checked }))}
              />
            </div>

            {/* Display Order */}
            <FormField label="Display Order" htmlFor="vc-order" description="Lower numbers appear first">
              <Input
                id="vc-order"
                type="number"
                min="0"
                value={vehicleForm.display_order}
                onChange={(e) => setVehicleForm((f) => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
              />
            </FormField>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setVehicleDialogOpen(false)} disabled={savingVehicle}>
            Cancel
          </Button>
          <Button onClick={saveVehicle} disabled={savingVehicle}>
            {savingVehicle ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogClose onClose={() => setDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            {editingCategory ? 'Edit' : 'Add'} {dialogType === 'product' ? 'Product' : 'Service'} Category
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form id="category-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Name" error={errors.name?.message} required htmlFor="cat-name">
              <Input id="cat-name" {...register('name')} placeholder="e.g. Coatings & Sealants" />
            </FormField>

            <FormField label="Slug" error={errors.slug?.message} required htmlFor="cat-slug" description="URL-friendly identifier (auto-generated from name)">
              <Input id="cat-slug" {...register('slug')} placeholder="coatings-sealants" />
            </FormField>

            <FormField label="Description" error={errors.description?.message} htmlFor="cat-description">
              <Textarea id="cat-description" {...register('description')} placeholder="Category description..." rows={2} />
            </FormField>

            <FormField label="Display Order" error={errors.display_order?.message} htmlFor="cat-order" description="Lower numbers appear first">
              <Input id="cat-order" type="number" min="0" {...register('display_order')} />
            </FormField>
          </form>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={saving}>
            {saving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Category"
        description={`Are you sure you want to delete "${deleteTarget?.category.name}"? This will deactivate the category.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
