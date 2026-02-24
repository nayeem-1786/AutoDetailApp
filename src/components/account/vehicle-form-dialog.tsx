'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { customerVehicleSchema, type CustomerVehicleInput } from '@/lib/utils/validation';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  SPECIALTY_TIERS,
  TIER_DROPDOWN_LABELS,
  MODEL_PLACEHOLDERS,
  isSpecialtyCategory,
  type VehicleCategory,
} from '@/lib/utils/vehicle-categories';
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
import { VehicleMakeCombobox, getVehicleYearOptions, titleCaseField } from '@/components/ui/vehicle-make-combobox';
import { toast } from 'sonner';

const AUTOMOBILE_SIZE_CLASSES = ['sedan', 'truck_suv_2row', 'suv_3row_van'] as const;

interface VehicleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: {
    id: string;
    vehicle_type: string;
    vehicle_category?: string;
    size_class: string | null;
    specialty_tier?: string | null;
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
  const [category, setCategory] = useState<VehicleCategory>('automobile');
  const [yearOtherMode, setYearOtherMode] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomerVehicleInput>({
    resolver: formResolver(customerVehicleSchema),
    defaultValues: {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: null,
      specialty_tier: null,
      year: null,
      make: '',
      model: '',
      color: '',
    },
  });

  // Derive category from vehicle_category or vehicle_type for edit mode
  function deriveCategory(v: NonNullable<typeof vehicle>): VehicleCategory {
    if (v.vehicle_category && v.vehicle_category !== 'automobile') return v.vehicle_category as VehicleCategory;
    if (v.vehicle_type === 'standard') return 'automobile';
    if (['motorcycle', 'rv', 'boat', 'aircraft'].includes(v.vehicle_type)) return v.vehicle_type as VehicleCategory;
    return 'automobile';
  }

  useEffect(() => {
    if (open && vehicle) {
      const cat = deriveCategory(vehicle);
      setCategory(cat);
      // Auto-detect "Other" mode if year is outside the dropdown range
      const yearOptions = getVehicleYearOptions();
      setYearOtherMode(!!vehicle.year && !yearOptions.includes(vehicle.year));
      reset({
        vehicle_category: cat,
        vehicle_type: vehicle.vehicle_type as CustomerVehicleInput['vehicle_type'],
        size_class: (vehicle.size_class as CustomerVehicleInput['size_class']) ?? null,
        specialty_tier: vehicle.specialty_tier ?? null,
        year: vehicle.year ?? null,
        make: vehicle.make ?? '',
        model: vehicle.model ?? '',
        color: vehicle.color ?? '',
      });
    } else if (open) {
      setCategory('automobile');
      setYearOtherMode(false);
      reset({
        vehicle_category: 'automobile',
        vehicle_type: 'standard',
        size_class: null,
        specialty_tier: null,
        year: null,
        make: '',
        model: '',
        color: '',
      });
    }
  }, [open, vehicle, reset]);

  const handleMakeChange = useCallback((val: string) => {
    setValue('make', val, { shouldDirty: true });
  }, [setValue]);

  function handleCategoryChange(newCategory: VehicleCategory) {
    setCategory(newCategory);
    const isSpecialty = isSpecialtyCategory(newCategory);
    setValue('vehicle_category', newCategory, { shouldDirty: true });
    setValue('vehicle_type', isSpecialty ? newCategory : 'standard', { shouldDirty: true });
    setValue('make', '', { shouldDirty: true });
    setValue('size_class', null, { shouldDirty: true });
    setValue('specialty_tier', null, { shouldDirty: true });
  }

  const isSpecialty = isSpecialtyCategory(category);
  const tierLabel = TIER_DROPDOWN_LABELS[category];
  const specialtyOptions = isSpecialty ? SPECIALTY_TIERS[category] : [];

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
        body: JSON.stringify({
          ...data,
          vehicle_category: category,
          vehicle_type: isSpecialty ? category : 'standard',
          size_class: !isSpecialty ? data.size_class : null,
          specialty_tier: isSpecialty ? (data.specialty_tier || null) : null,
          model: titleCaseField(data.model || ''),
          color: titleCaseField(data.color || ''),
        }),
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
          {/* Category Selector */}
          <FormField label="Category" htmlFor="vehicle_category">
            <Select
              id="vehicle_category"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as VehicleCategory)}
            >
              {VEHICLE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {VEHICLE_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Year" error={errors.year?.message} htmlFor="vehicle_year">
              {yearOtherMode ? (
                <>
                  <Input
                    id="vehicle_year"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter year (e.g., 1965)"
                    className={errors.year ? 'border-red-500' : ''}
                    {...register('year')}
                  />
                  <button
                    type="button"
                    onClick={() => { setYearOtherMode(false); setValue('year', null); }}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    Back to list
                  </button>
                </>
              ) : (
                <Select
                  id="vehicle_year"
                  className={errors.year ? 'border-red-500' : ''}
                  {...register('year', {
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                      if (e.target.value === 'other') {
                        setYearOtherMode(true);
                        setValue('year', null);
                      }
                    },
                  })}
                >
                  <option value="">Year...</option>
                  {getVehicleYearOptions().map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                  <option value="other">Other</option>
                </Select>
              )}
            </FormField>

            <FormField label="Make" error={errors.make?.message} htmlFor="vehicle_make">
              <VehicleMakeCombobox
                id="vehicle_make"
                value={watch('make') || ''}
                onChange={handleMakeChange}
                category={category}
                hasError={!!errors.make}
              />
            </FormField>

            <FormField label="Model" error={errors.model?.message} htmlFor="vehicle_model">
              <Input
                id="vehicle_model"
                placeholder={MODEL_PLACEHOLDERS[category]}
                className={errors.model ? 'border-red-500' : ''}
                {...register('model')}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Color" error={errors.color?.message} htmlFor="vehicle_color">
              <Input
                id="vehicle_color"
                placeholder="e.g., Silver"
                className={errors.color ? 'border-red-500' : ''}
                {...register('color')}
              />
            </FormField>

            <FormField
              label={tierLabel}
              error={isSpecialty ? errors.specialty_tier?.message : errors.size_class?.message}
              htmlFor="vehicle_tier"
            >
              {isSpecialty ? (
                <Select
                  id="vehicle_tier"
                  className={errors.specialty_tier ? 'border-red-500' : ''}
                  {...register('specialty_tier')}
                >
                  <option value="">Select {tierLabel.toLowerCase()}...</option>
                  {specialtyOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select
                  id="vehicle_tier"
                  className={errors.size_class ? 'border-red-500' : ''}
                  {...register('size_class')}
                >
                  <option value="">Select size...</option>
                  {AUTOMOBILE_SIZE_CLASSES.map((sc) => (
                    <option key={sc} value={sc}>
                      {VEHICLE_SIZE_LABELS[sc]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="vehicle-form" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : `Add ${VEHICLE_CATEGORY_LABELS[category]}`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
