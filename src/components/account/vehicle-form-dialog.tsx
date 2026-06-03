'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  type VehicleCategory,
  type VehicleClassification,
} from '@/lib/utils/vehicle-categories';
// C1 (Session #142, 2026-06-02 — Vehicle Classifier Restoration):
// the portal surface is authenticated (RLS would let direct browser
// queries work here), but routing through the same browser-wrapper
// as public booking eliminates the two-data-path drift (Mi2 in the
// audit). One canonical classifier access pattern for ALL browser
// callers — server endpoint with admin client. Authenticated portal
// users hit the same endpoint as anonymous booking customers.
import { classifyVehicleClient } from '@/lib/utils/classify-vehicle-client';
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
    // #136 Q3/B11 — vin / license_plate / notes surfaced on the portal
    // vehicle form. Optional fields (Q3 locks "surface", not "require").
    vin?: string | null;
    license_plate?: string | null;
    notes?: string | null;
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

  // #129 C3 — opt-in classifier: surfaces an inline specialty-tier advisory
  // when the typed make+model resolves to 'exotic' or 'classic'. The server
  // (POST + PATCH in /api/customer/vehicles) is the authoritative writer for
  // `size_class` and ALREADY overrides client-supplied size_class with the
  // classifier's exotic/classic result (Session 29 anti-gaming). This dialog
  // surfaces that decision pre-save so customers know their vehicle will be
  // flagged for the specialty service tier. See VEHICLE_FORM_UNIFICATION_AUDIT.md
  // C3 / Q4 and CLAUDE.md Rule 19.
  const [classification, setClassification] = useState<VehicleClassification | null>(null);

  // #136 B5-P — race-cancellation ref for the debounced classifier. A stale
  // in-flight call from a prior (make, model, category) tuple cannot
  // overwrite the cleared classification after the user changed category
  // mid-flight. handleCategoryChange + the classify effect both bump this.
  const classifyRequestIdRef = useRef(0);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<CustomerVehicleInput>({
    resolver: formResolver(customerVehicleSchema),
    // #136 Q5/B9 — real-time validation: validate on blur first, then on
    // every change once a field has been touched. Mirrors public booking's
    // per-keystroke feedback; eliminates the cross-surface timing
    // divergence noted in the audit.
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: null,
      specialty_tier: null,
      year: null,
      make: '',
      model: '',
      color: '',
      vin: '',
      license_plate: '',
      notes: '',
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
      // #132 Issue 2 — year is now a single 4-digit text input; no Other-mode
      // detection needed (the #131 dropdown + Other-mode toggle was removed).
      reset({
        vehicle_category: cat,
        vehicle_type: vehicle.vehicle_type as CustomerVehicleInput['vehicle_type'],
        size_class: (vehicle.size_class as CustomerVehicleInput['size_class']) ?? null,
        specialty_tier: vehicle.specialty_tier ?? null,
        year: vehicle.year ?? null,
        make: vehicle.make ?? '',
        model: vehicle.model ?? '',
        color: vehicle.color ?? '',
        vin: vehicle.vin ?? '',
        license_plate: vehicle.license_plate ?? '',
        notes: vehicle.notes ?? '',
      });
    } else if (open) {
      setCategory('automobile');
      reset({
        vehicle_category: 'automobile',
        vehicle_type: 'standard',
        size_class: null,
        specialty_tier: null,
        year: null,
        make: '',
        model: '',
        color: '',
        vin: '',
        license_plate: '',
        notes: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle, reset]);

  const handleMakeChange = useCallback((val: string) => {
    setValue('make', val, { shouldDirty: true, shouldTouch: true });
    // Model is make-specific — clear it on make change so the classifier
    // doesn't keep stale model context. Mirrors step-vehicle.tsx:388.
    setValue('model', '', { shouldDirty: true });
    // #136 Q5/B7 — re-run the Make validator so real-time required-field
    // feedback fires when the combobox transitions empty ↔ non-empty.
    // The combobox doesn't expose its own onBlur to RHF; trigger() is the
    // explicit handshake.
    trigger('make');
    // #136 B5-P — invalidate any in-flight classifier so its stale result
    // (from the prior make+model) can't overwrite the cleared classification.
    classifyRequestIdRef.current++;
    setClassification(null);
  }, [setValue, trigger]);

  // #136 T1/Q1/B1 — Category change resets ALL non-category fields. Mirrors
  // step-vehicle.tsx; T8 contract test locks parity. Previously missed
  // year + color. vin/license_plate/notes are added below (Commit 3 / Q3)
  // and their reset is included in the same handler.
  function handleCategoryChange(newCategory: VehicleCategory) {
    // #136 B5-P — invalidate in-flight classifier so its stale result
    // can't overwrite the cleared classification below.
    classifyRequestIdRef.current++;
    setCategory(newCategory);
    const isSpecialty = isSpecialtyCategory(newCategory);
    setValue('vehicle_category', newCategory, { shouldDirty: true });
    setValue('vehicle_type', isSpecialty ? newCategory : 'standard', { shouldDirty: true });
    setValue('make', '', { shouldDirty: true });
    setValue('model', '', { shouldDirty: true });
    setValue('year', null, { shouldDirty: true });
    setValue('color', '', { shouldDirty: true });
    setValue('vin', '', { shouldDirty: true });
    setValue('license_plate', '', { shouldDirty: true });
    setValue('notes', '', { shouldDirty: true });
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
      const myRequestId = ++classifyRequestIdRef.current;
      // C1 (Session #142): replaces `resolveVehicleClassification(browserSupabase, …)`
      // with the wrapper that routes through `/api/classify-vehicle`. Same
      // promise contract — `.then` on success, `.catch` on network/HTTP error.
      // The wrapper does NOT throw on classifier non-confident results
      // (those come back as a normal VehicleClassification with
      // `category_confident: false` + `classifier_reason` set), so the
      // existing `.then` branch handles both confident + non-confident
      // results identically. No advisory behavior change for the portal.
      classifyVehicleClient(mk, mdl, watchedYear ?? undefined)
        .then((result) => {
          if (classifyRequestIdRef.current !== myRequestId) return;
          setClassification(result);
        })
        .catch(() => {
          if (classifyRequestIdRef.current !== myRequestId) return;
          setClassification(null);
        });
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
          // #132 Issue 4 — preserve model case as the user typed it
          // (e.g., "CBR600RR" stays "CBR600RR"). Previously called
          // `titleCaseField(...)` here which lower-cased everything after
          // each word's first character, mangling VINs / part-style model
          // codes. Color's titleCase stays — operator decision separates
          // model casing from color casing.
          model: (data.model ?? '').trim(),
          color: titleCaseField(data.color || ''),
          // #136 Q3/B11 — preserve case + trim. VIN is conventionally
          // uppercase but operators sometimes paste mixed case; trim only,
          // server can uppercase later if needed. Empty strings collapse
          // to null on the server (see POST/PATCH route normalization).
          vin: (data.vin ?? '').trim() || null,
          license_plate: (data.license_plate ?? '').trim() || null,
          notes: (data.notes ?? '').trim() || null,
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
            {/* Year — #132 Issue 2: single 4-digit text input (supersedes
                #131's dropdown+Other... pattern). Rule: 4 digits starting
                with 19 or 20 (1900–2099). The "19/20" prefix IS the
                range constraint; the schema's 1900-2100 stays for back-compat
                with non-customer paths but the form rejects 2100+ via this
                validator. */}
            <FormField label="Year" error={errors.year?.message} htmlFor="vehicle_year" required reserveErrorSpace>
              <Input
                id="vehicle_year"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="e.g., 2024"
                className={errors.year ? 'border-red-500' : ''}
                {...register('year', {
                  setValueAs: (val: unknown) => {
                    // Strip non-digits and coerce to integer; RHF stores the
                    // numeric value while the input displays the raw string.
                    if (val === null || val === undefined) return null;
                    const str = String(val).trim();
                    if (str === '') return null;
                    const cleaned = str.replace(/\D/g, '').slice(0, 4);
                    const n = parseInt(cleaned, 10);
                    return Number.isFinite(n) ? n : null;
                  },
                  // #136 Q2/B15 — required at the validate layer (schema
                  // stays nullable for form-state compat; this enforces the
                  // operator-locked requirement at submit + on-touch).
                  validate: (val) => {
                    if (val === null || val === undefined) return 'Year is required';
                    const str = String(val).trim();
                    if (str === '') return 'Year is required';
                    return validateCustomerVehicleYear(str) ?? true;
                  },
                })}
              />
            </FormField>

            <FormField label="Make" error={errors.make?.message} htmlFor="vehicle_make" required reserveErrorSpace>
              {/* #136 Q2/B15 — register `make` for its validator side-effect
                  even though the combobox sets the value via setValue().
                  RHF runs the validate fn on every value change once the
                  field is touched (mode: 'onTouched'); handleMakeChange
                  calls trigger('make') to handshake combobox → RHF. */}
              <input type="hidden" {...register('make', {
                validate: (val) => {
                  const str = (val ?? '').toString().trim();
                  return str.length > 0 || 'Make is required';
                },
              })} />
              <VehicleMakeCombobox
                id="vehicle_make"
                value={watch('make') || ''}
                onChange={handleMakeChange}
                category={category}
                hasError={!!errors.make}
              />
            </FormField>

            <FormField label="Model" error={errors.model?.message} htmlFor="vehicle_model" required reserveErrorSpace>
              <Input
                id="vehicle_model"
                placeholder={MODEL_PLACEHOLDERS[category]}
                className={errors.model ? 'border-red-500' : ''}
                {...register('model', {
                  // #136 Q2/B15 — required at validate layer.
                  validate: (val) => {
                    const str = (val ?? '').toString().trim();
                    return str.length > 0 || 'Model is required';
                  },
                })}
              />
            </FormField>
          </div>

          {/* Specialty-tier advisory (C3) — surfaces when classifier detects
              exotic/classic. Customer cannot self-elect this tier from the
              dropdown (CUSTOMER_SELF_SERVICE_SIZE_CLASSES restricts to 3),
              but the server will write the classifier's `size_class` on save.
              #136 Q4/B2-P — height-reserved container eliminates the layout
              shift that occurred when the banner appeared/disappeared on
              classifier resolution. Min-height fits a single-line banner
              (~2.75rem with px-3/py-2 padding); banners that wrap to 2-3
              lines grow gracefully but never shift content below. */}
          <div className="min-h-[2.75rem]" data-testid="specialty-tier-advisory-slot">
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Color" error={errors.color?.message} htmlFor="vehicle_color" required reserveErrorSpace>
              <Input
                id="vehicle_color"
                placeholder="e.g., Silver"
                className={errors.color ? 'border-red-500' : ''}
                {...register('color', {
                  // #136 Q2/B15 — required at validate layer.
                  validate: (val) => {
                    const str = (val ?? '').toString().trim();
                    return str.length > 0 || 'Color is required';
                  },
                })}
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

          {/* #136 Q3/B11 — vin / license_plate / notes. Optional fields
              surfaced for customers who want to keep complete vehicle
              records. None of them feed pricing or the classifier — they
              persist as-is on the `vehicles` row and the operator-side
              admin form sees them later. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="VIN (optional)" error={errors.vin?.message} htmlFor="vehicle_vin">
              <Input
                id="vehicle_vin"
                placeholder="17-character VIN"
                maxLength={17}
                autoComplete="off"
                className={errors.vin ? 'border-red-500' : ''}
                {...register('vin')}
              />
            </FormField>
            <FormField label="License plate (optional)" error={errors.license_plate?.message} htmlFor="vehicle_license_plate">
              <Input
                id="vehicle_license_plate"
                placeholder="e.g., 8ABC123"
                maxLength={20}
                autoComplete="off"
                className={errors.license_plate ? 'border-red-500' : ''}
                {...register('license_plate')}
              />
            </FormField>
          </div>
          <FormField label="Notes (optional)" error={errors.notes?.message} htmlFor="vehicle_notes">
            <Input
              id="vehicle_notes"
              placeholder="Anything we should know — e.g., aftermarket wheels, ceramic coating"
              maxLength={500}
              className={errors.notes ? 'border-red-500' : ''}
              {...register('notes')}
            />
          </FormField>
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
