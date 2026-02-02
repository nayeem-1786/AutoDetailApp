'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { createClient } from '@/lib/supabase/client';
import { mobileZoneSchema, type MobileZoneInput } from '@/lib/utils/validation';
import type { MobileZone } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';

export default function MobileZonesPage() {
  const [zones, setZones] = useState<MobileZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<MobileZone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MobileZone | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadZones = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('mobile_zones')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      toast.error('Failed to load mobile zones', {
        description: error.message,
      });
    } else {
      setZones((data as MobileZone[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  function openCreateDialog() {
    setEditingZone(null);
    setDialogOpen(true);
  }

  function openEditDialog(zone: MobileZone) {
    setEditingZone(zone);
    setDialogOpen(true);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setEditingZone(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const supabase = createClient();
    const { error } = await supabase
      .from('mobile_zones')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete zone', { description: error.message });
    } else {
      toast.success(`"${deleteTarget.name}" deleted`);
      await loadZones();
    }

    setDeleting(false);
    setDeleteTarget(null);
  }

  async function handleAvailabilityToggle(zone: MobileZone) {
    const supabase = createClient();
    const newAvailable = !zone.is_available;

    const { error } = await supabase
      .from('mobile_zones')
      .update({
        is_available: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq('id', zone.id);

    if (error) {
      toast.error('Failed to update availability', {
        description: error.message,
      });
      return;
    }

    toast.success(
      `"${zone.name}" ${newAvailable ? 'enabled' : 'disabled'}`
    );
    await loadZones();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mobile Zones"
          description="Manage mobile service zones and surcharges."
        />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mobile Zones"
        description="Define service zones with distance ranges and surcharges for mobile detailing."
        action={
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Add Zone
          </Button>
        }
      />

      {zones.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={MapPin}
              title="No mobile zones"
              description="Create your first mobile service zone to define distance ranges and surcharges."
              action={
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" />
                  Add Zone
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Distance Range</TableHead>
                  <TableHead>Surcharge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell className="font-medium">
                      {zone.name}
                    </TableCell>
                    <TableCell>
                      {zone.min_distance_miles} - {zone.max_distance_miles} mi
                    </TableCell>
                    <TableCell>{formatCurrency(zone.surcharge)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={zone.is_available}
                          onCheckedChange={() => handleAvailabilityToggle(zone)}
                        />
                        <Badge
                          variant={zone.is_available ? 'success' : 'secondary'}
                        >
                          {zone.is_available ? 'Available' : 'Unavailable'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(zone)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(zone)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <ZoneFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        zone={editingZone}
        onSaved={loadZones}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Mobile Zone"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ----- Zone Form Dialog -----

interface ZoneFormDialogProps {
  open: boolean;
  onOpenChange: () => void;
  zone: MobileZone | null;
  onSaved: () => Promise<void>;
}

function ZoneFormDialog({ open, onOpenChange, zone, onSaved }: ZoneFormDialogProps) {
  const isEditing = !!zone;
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MobileZoneInput>({
    resolver: formResolver(mobileZoneSchema),
    defaultValues: {
      name: '',
      min_distance_miles: 0,
      max_distance_miles: 0,
      surcharge: 0,
      is_available: true,
      display_order: 0,
    },
  });

  // Reset form when dialog opens with zone data or fresh defaults
  useEffect(() => {
    if (open) {
      if (zone) {
        reset({
          name: zone.name,
          min_distance_miles: zone.min_distance_miles,
          max_distance_miles: zone.max_distance_miles,
          surcharge: zone.surcharge,
          is_available: zone.is_available,
          display_order: zone.display_order,
        });
      } else {
        reset({
          name: '',
          min_distance_miles: 0,
          max_distance_miles: 0,
          surcharge: 0,
          is_available: true,
          display_order: 0,
        });
      }
    }
  }, [open, zone, reset]);

  async function onSubmit(formData: MobileZoneInput) {
    setSaving(true);
    const supabase = createClient();

    if (isEditing && zone) {
      const { error } = await supabase
        .from('mobile_zones')
        .update({
          ...formData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', zone.id);

      if (error) {
        toast.error('Failed to update zone', { description: error.message });
        setSaving(false);
        return;
      }

      toast.success(`"${formData.name}" updated`);
    } else {
      const { error } = await supabase
        .from('mobile_zones')
        .insert(formData);

      if (error) {
        toast.error('Failed to create zone', { description: error.message });
        setSaving(false);
        return;
      }

      toast.success(`"${formData.name}" created`);
    }

    setSaving(false);
    onOpenChange();
    await onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={() => onOpenChange()}>
      <DialogClose onClose={onOpenChange} />
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Edit Zone' : 'Add Mobile Zone'}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <form id="zone-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Zone Name"
            required
            error={errors.name?.message}
            htmlFor="zone_name"
          >
            <Input
              id="zone_name"
              placeholder="e.g. Zone 1 - Nearby"
              {...register('name')}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Min Distance (mi)"
              required
              error={errors.min_distance_miles?.message}
              htmlFor="min_distance"
            >
              <Input
                id="min_distance"
                type="number"
                step="0.1"
                min="0"
                {...register('min_distance_miles')}
              />
            </FormField>

            <FormField
              label="Max Distance (mi)"
              required
              error={errors.max_distance_miles?.message}
              htmlFor="max_distance"
            >
              <Input
                id="max_distance"
                type="number"
                step="0.1"
                min="0"
                {...register('max_distance_miles')}
              />
            </FormField>
          </div>

          <FormField
            label="Surcharge"
            required
            error={errors.surcharge?.message}
            description="Additional charge for this zone (in dollars)."
            htmlFor="surcharge"
          >
            <div className="relative max-w-xs">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                $
              </span>
              <Input
                id="surcharge"
                type="number"
                step="0.01"
                min="0"
                className="pl-7"
                {...register('surcharge')}
              />
            </div>
          </FormField>

          <FormField
            label="Display Order"
            error={errors.display_order?.message}
            description="Lower numbers appear first."
            htmlFor="display_order"
          >
            <Input
              id="display_order"
              type="number"
              min="0"
              className="max-w-xs"
              {...register('display_order')}
            />
          </FormField>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onOpenChange} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="zone-form" disabled={saving}>
          {saving ? 'Saving...' : isEditing ? 'Update Zone' : 'Create Zone'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
