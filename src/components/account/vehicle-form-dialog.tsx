'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { customerVehicleSchema, type CustomerVehicleInput } from '@/lib/utils/validation';
import { VEHICLE_SIZE_LABELS, CUSTOMER_SELF_SERVICE_SIZE_CLASSES } from '@/lib/utils/constants';
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  SPECIALTY_TIERS,
  TIER_DROPDOWN_LABELS,
  MODEL_PLACEHOLDERS,
  isSpecialtyCategory,
  resolveVehicleClassification,
  type VehicleCategory,
  type VehicleClassification,
} from '@/lib/utils/vehicle-categories';
import { createClient } from '@/lib/supabase/client';
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
import {
  VehicleMakeCombobox,
  getCustomerVehicleYearOptions,
  validateCustomerVehicleYear,
  titleCaseField,
} from '@/components/ui/vehicle-make-combobox';
import { toast } from 'sonner';

const AUTOMOBILE_SIZE_CLASSES = CUSTOMER_SELF_SERVICE_SIZE_CLASSES;

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

  // #129 C3 — opt-in classifier: surfaces an inline specialty-tier advisory
  // when the typed make+model resolves to 'exotic' or 'classic'. The server
  // (POST + PATCH in /api/customer/vehicles) is the authoritative writer for
  // `size_class` and ALREADY overrides client-supplied size_class with the
  // classifier's exotic/classic result (Session 29 anti-gaming). This dialog
  // surfaces that decision pre-save so customers know their vehicle will be
  // flagged for the specialty service tier. See VEHICLE_FORM_UNIFICATION_AUDIT.md
  // C3 / Q4 and CLAUDE.md Rule 19.
  const [classification, setClassification] = useState<VehicleClassification | null>(null);

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
      // Auto-detect "Other" mode if year is outside the customer dropdown range
      // (#131 Issue 2 — dropdown is now 2028→2000; older vehicles auto-route to write-in).
      const yearOptions = getCustomerVehicleYearOptions();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle, reset]);

  const handleMakeChange = useCallback((val: string) => {
    setValue('make', val, { shouldDirty: true });
    // Model is make-specific — clear it on make change so the classifier
    // doesn't keep stale model context. Mirrors step-vehicle.tsx:388.
    setValue('model', '', { shouldDirty: true });
    setClassification(null);
  }, [setValue]);

  function handleCategoryChange(newCategory: VehicleCategory) {
    setCategory(newCategory);
    const isSpecialty = isSpecialtyCategory(newCategory);
    setValue('vehicle_category', newCategory, { shouldDirty: true });
    setValue('vehicle_type', isSpecialty ? newCategory : 'standard', { shouldDirty: true });
    setValue('make', '', { shouldDirty: true });
    setValue('model', '', { shouldDirty: true });
    setValue('size_class', null, { shouldDirty: true });
    setValue('specialty_tier', null, { shouldDirty: true });
    setClassification(null);
  }

  // --- Debounced classifier — opt-in: only fires when make AND model are typed
  // (the #129 C1 gate; without a model, the resolver silently defaults to
  // automobile, masking exotic/classic detection). The classifier's result
  // is used purely for the inline advisory below — the server is the
  // authoritative writer for size_class on POST/PATCH.
  const watchedMake = watch('make') ?? '';
  const watchedModel = watch('model') ?? '';
  const watchedYear = watch('year') ?? null;
  useEffect(() => {
    if (!open) return;
    const mk = watchedMake.trim();
    const mdl = watchedModel.trim();
    // C1 gate — require both make AND model before invoking the classifier.
    if (!mk || !mdl) {
      setClassification(null);
      return;
    }
    const timer = setTimeout(() => {
      const supabase = createClient();
      resolveVehicleClassification(supabase, mk, mdl, watchedYear ?? undefined)
        .then((result) => setClassification(result))
        .catch(() => setClassification(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [open, watchedMake, watchedModel, watchedYear]);

  const classifierSpecialty =
    classification?.size_class === 'exotic' || classification?.size_class === 'classic';

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
                    maxLength={4}
                    placeholder="Enter year (e.g., 1965)"
                    className={errors.year ? 'border-red-500' : ''}
                    {...register('year', {
                      // #131 Issue 2 — enforce 1900-2028 client-side per the
                      // customer-facing write-in bounds. The schema accepts a
                      // wider range (1900-2100) for non-customer paths.
                      validate: (val) => {
                        if (val === null || val === undefined) return true;
                        const str = String(val).trim();
                        if (str === '') return true;
                        return validateCustomerVehicleYear(str) ?? true;
                      },
                    })}
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
                  {getCustomerVehicleYearOptions().map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                  <option value="other">Other...</option>
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

          {/* Specialty-tier advisory (C3) — surfaces when classifier detects
              exotic/classic. Customer cannot self-elect this tier from the
              dropdown (CUSTOMER_SELF_SERVICE_SIZE_CLASSES restricts to 3),
              but the server will write the classifier's `size_class` on save. */}
          {classifierSpecialty && (
            <div
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
              data-testid="specialty-tier-advisory"
            >
              <strong className="font-semibold">
                {classification!.size_class === 'exotic' ? 'Specialty / Exotic vehicle' : 'Classic vehicle'}
                {' '}detected.
              </strong>{' '}
              Your {[watchedYear, watchedMake, watchedModel].filter(Boolean).join(' ')} qualifies for our specialty service tier — our team will reach out to confirm pricing.
            </div>
          )}

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
