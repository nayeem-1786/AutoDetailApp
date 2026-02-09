'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { productCategorySchema, type ProductCategoryInput } from '@/lib/utils/validation';
import type { ProductCategory, ServiceCategory } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type CategoryType = 'product' | 'service';

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
  const [loading, setLoading] = useState(true);

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
        description="Manage product and service categories"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CategoryType)}>
        <TabsList>
          <TabsTrigger value="product">
            Product Categories ({productCategories.length})
          </TabsTrigger>
          <TabsTrigger value="service">
            Service Categories ({serviceCategories.length})
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
      </Tabs>

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
