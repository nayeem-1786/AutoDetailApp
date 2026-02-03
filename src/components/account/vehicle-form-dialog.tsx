'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { customerVehicleSchema, type CustomerVehicleInput } from '@/lib/utils/validation';
import { VEHICLE_TYPE_LABELS, VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { toast } from 'sonner';

interface VehicleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: {
    id: string;
    vehicle_type: string;
    size_class: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  } | null;
  onSuccess: () => void;
}

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
  onSuccess,
}: VehicleFormDialogProps) {
  const isEdit = !!vehicle;
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerVehicleInput>({
    resolver: formResolver(customerVehicleSchema),
    defaultValues: {
      vehicle_type: 'standard',
      size_class: null,
      year: null,
      make: '',
      model: '',
      color: '',
    },
  });

  useEffect(() => {
    if (open && vehicle) {
      reset({
        vehicle_type: vehicle.vehicle_type as CustomerVehicleInput['vehicle_type'],
        size_class: (vehicle.size_class as CustomerVehicleInput['size_class']) ?? null,
        year: vehicle.year ?? null,
        make: vehicle.make ?? '',
        model: vehicle.model ?? '',
        color: vehicle.color ?? '',
      });
    } else if (open) {
      reset({
        vehicle_type: 'standard',
        size_class: null,
        year: null,
        make: '',
        model: '',
        color: '',
      });
    }
  }, [open, vehicle, reset]);

  const onSubmit = async (data: CustomerVehicleInput) => {
    setSaving(true);

    try {
      const url = isEdit
        ? `/api/customer/vehicles/${vehicle.id}`
        : '/api/customer/vehicles';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save vehicle');
      }

      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle added');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save vehicle');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
        <DialogDescription>
          {isEdit ? 'Update your vehicle details.' : 'Add a new vehicle to your account.'}
        </DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form id="vehicle-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Vehicle Type"
              required
              error={errors.vehicle_type?.message}
              htmlFor="vehicle_type"
            >
              <Select id="vehicle_type" {...register('vehicle_type')}>
                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Size Class"
              error={errors.size_class?.message}
              htmlFor="size_class"
            >
              <Select id="size_class" {...register('size_class')}>
                <option value="">Select size...</option>
                {Object.entries(VEHICLE_SIZE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Year" error={errors.year?.message} htmlFor="vehicle_year">
              <Input
                id="vehicle_year"
                type="number"
                placeholder="2024"
                {...register('year')}
              />
            </FormField>

            <FormField label="Make" error={errors.make?.message} htmlFor="vehicle_make">
              <Input
                id="vehicle_make"
                placeholder="Toyota"
                {...register('make')}
              />
            </FormField>

            <FormField label="Model" error={errors.model?.message} htmlFor="vehicle_model">
              <Input
                id="vehicle_model"
                placeholder="Camry"
                {...register('model')}
              />
            </FormField>
          </div>

          <FormField label="Color" error={errors.color?.message} htmlFor="vehicle_color">
            <Input
              id="vehicle_color"
              placeholder="Silver"
              {...register('color')}
            />
          </FormField>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="vehicle-form" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Vehicle'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
