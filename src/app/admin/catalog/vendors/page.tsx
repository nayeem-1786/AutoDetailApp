'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { vendorSchema, type VendorInput } from '@/lib/utils/validation';
import type { Vendor } from '@/lib/supabase/types';
import { formatPhone, formatPhoneInput } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
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

type VendorWithCount = Vendor & {
  product_count: number;
};

export default function VendorsPage() {
  const supabase = createClient();

  const [vendors, setVendors] = useState<VendorWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<VendorWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<VendorInput>({
    resolver: formResolver(vendorSchema),
  });

  async function loadData() {
    setLoading(true);

    const [vendorRes, countRes] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase
        .from('products')
        .select('vendor_id')
        .eq('is_active', true)
        .not('vendor_id', 'is', null),
    ]);

    if (vendorRes.error) {
      toast.error('Failed to load vendors');
      setLoading(false);
      return;
    }

    // Build product count map
    const countMap: Record<string, number> = {};
    if (countRes.data) {
      for (const row of countRes.data) {
        if (row.vendor_id) {
          countMap[row.vendor_id] = (countMap[row.vendor_id] || 0) + 1;
        }
      }
    }

    const withCounts: VendorWithCount[] = (vendorRes.data || []).map((v: Vendor) => ({
      ...v,
      product_count: countMap[v.id] || 0,
    }));

    setVendors(withCounts);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditingVendor(null);
    reset({
      name: '',
      contact_name: '',
      email: '',
      phone: '',
      website: '',
      notes: '',
    });
    setDialogOpen(true);
  }

  function openEdit(vendor: Vendor) {
    setEditingVendor(vendor);
    reset({
      name: vendor.name,
      contact_name: vendor.contact_name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      website: vendor.website || '',
      notes: vendor.notes || '',
    });
    setDialogOpen(true);
  }

  function attemptDelete(vendor: VendorWithCount) {
    if (vendor.product_count > 0) {
      toast.error(
        `Cannot delete "${vendor.name}" — it has ${vendor.product_count} linked product${vendor.product_count === 1 ? '' : 's'}. Reassign them first.`
      );
      return;
    }
    setDeleteTarget(vendor);
  }

  async function onSubmit(data: VendorInput) {
    setSaving(true);
    try {
      const payload = {
        name: data.name,
        contact_name: data.contact_name || null,
        email: data.email || null,
        phone: data.phone || null,
        website: data.website || null,
        notes: data.notes || null,
      };

      if (editingVendor) {
        const { error } = await supabase
          .from('vendors')
          .update(payload)
          .eq('id', editingVendor.id);
        if (error) throw error;
        toast.success('Vendor updated');
      } else {
        const { error } = await supabase
          .from('vendors')
          .insert({ ...payload, is_active: true });
        if (error) throw error;
        toast.success('Vendor created');
      }

      setDialogOpen(false);
      setEditingVendor(null);
      await loadData();
    } catch (err) {
      console.error('Save vendor error:', err);
      toast.error('Failed to save vendor');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ is_active: false })
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Vendor deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      console.error('Delete vendor error:', err);
      toast.error('Failed to delete vendor');
    } finally {
      setDeleting(false);
    }
  }

  const columns: ColumnDef<VendorWithCount, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'contact_name',
      header: 'Contact Name',
      cell: ({ row }) => row.original.contact_name || '--',
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email || '--',
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) =>
        row.original.phone ? formatPhone(row.original.phone) : '--',
    },
    {
      id: 'products',
      header: 'Products',
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.product_count}</Badge>
      ),
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
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
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => attemptDelete(row.original)}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
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
        title="Vendors"
        description="Manage product vendors"
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={vendors}
        emptyTitle="No vendors found"
        emptyDescription="Add your first vendor to get started."
        emptyAction={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        }
      />

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogClose onClose={() => setDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form id="vendor-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Name" error={errors.name?.message} required htmlFor="vendor-name">
              <Input id="vendor-name" {...register('name')} placeholder="e.g. Chemical Guys" />
            </FormField>

            <FormField label="Contact Name" error={errors.contact_name?.message} htmlFor="vendor-contact">
              <Input id="vendor-contact" {...register('contact_name')} placeholder="Primary contact" />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email" error={errors.email?.message} htmlFor="vendor-email">
                <Input id="vendor-email" type="email" {...register('email')} placeholder="vendor@example.com" />
              </FormField>

              <FormField label="Phone" error={errors.phone?.message} htmlFor="vendor-phone">
                <Input
                  id="vendor-phone"
                  placeholder="(310) 555-1234"
                  {...register('phone', {
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      const formatted = formatPhoneInput(e.target.value);
                      setValue('phone', formatted, { shouldDirty: true });
                    },
                  })}
                />
              </FormField>
            </div>

            <FormField label="Website" error={errors.website?.message} htmlFor="vendor-website">
              <Input id="vendor-website" {...register('website')} placeholder="https://..." />
            </FormField>

            <FormField label="Notes" error={errors.notes?.message} htmlFor="vendor-notes">
              <Textarea id="vendor-notes" {...register('notes')} placeholder="Internal notes..." rows={2} />
            </FormField>
          </form>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-form" disabled={saving}>
            {saving ? 'Saving...' : editingVendor ? 'Save Changes' : 'Create Vendor'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Vendor"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will deactivate the vendor.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
