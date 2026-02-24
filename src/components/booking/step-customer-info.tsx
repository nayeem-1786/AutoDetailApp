'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { bookingCustomerSchema, bookingVehicleSchema, type BookingCustomerInput, type BookingVehicleInput } from '@/lib/utils/validation';
import { formatPhoneInput, normalizePhone } from '@/lib/utils/format';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { VehicleMakeCombobox, getVehicleYearOptions, titleCaseField } from '@/components/ui/vehicle-make-combobox';
import type { VehicleSizeClass, VehicleType, VehicleCategory as VehicleCategoryType } from '@/lib/supabase/types';
import { z } from 'zod';
import { Plus, Check, LogIn, X } from 'lucide-react';

interface SavedVehicle {
  id: string;
  vehicle_type: VehicleType;
  vehicle_category?: VehicleCategoryType;
  size_class: VehicleSizeClass | null;
  specialty_tier?: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

const AUTOMOBILE_SIZE_CLASSES = ['sedan', 'truck_suv_2row', 'suv_3row_van'] as const;

const customerInfoSchema = z.object({
  customer: bookingCustomerSchema,
  vehicle: bookingVehicleSchema,
});

type CustomerInfoFormData = z.infer<typeof customerInfoSchema>;

interface StepCustomerInfoProps {
  initialCustomer: Partial<BookingCustomerInput>;
  initialVehicle: Partial<BookingVehicleInput>;
  requireSizeClass: boolean;
  initialSizeClass: VehicleSizeClass | null;
  savedVehicles?: SavedVehicle[];
  onContinue: (customer: BookingCustomerInput, vehicle: BookingVehicleInput) => void;
  onBack: () => void;
}

// Check if a phone string has 10 digits (valid US number)
function isValidPhoneForLookup(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

export function StepCustomerInfo({
  initialCustomer,
  initialVehicle,
  requireSizeClass,
  initialSizeClass,
  savedVehicles = [],
  onContinue,
  onBack,
}: StepCustomerInfoProps) {
  // Format initial phone from E.164 to display format if needed
  const formatInitialPhone = (phone: string | undefined): string => {
    if (!phone) return '';
    // If already in display format, return as-is
    if (/^\(\d{3}\) \d{3}-\d{4}$/.test(phone)) return phone;
    // Otherwise, format it (handles E.164 and other formats)
    return formatPhoneInput(phone);
  };

  // Fetch business name for consent disclosure text
  const [businessName, setBusinessName] = useState('our business');
  useEffect(() => {
    fetch('/api/public/business-info')
      .then((res) => res.json())
      .then((data) => {
        if (data?.name) setBusinessName(data.name);
      })
      .catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CustomerInfoFormData>({
    resolver: formResolver(customerInfoSchema),
    mode: 'onTouched',
    defaultValues: {
      customer: {
        first_name: initialCustomer.first_name ?? '',
        last_name: initialCustomer.last_name ?? '',
        phone: formatInitialPhone(initialCustomer.phone),
        email: initialCustomer.email ?? '',
        sms_consent: true,
        email_consent: true,
      },
      vehicle: {
        vehicle_category: (initialVehicle as BookingVehicleInput).vehicle_category ?? 'automobile',
        vehicle_type: initialVehicle.vehicle_type ?? 'standard',
        size_class: initialSizeClass ?? initialVehicle.size_class ?? null,
        specialty_tier: (initialVehicle as BookingVehicleInput).specialty_tier ?? null,
        year: initialVehicle.year ?? undefined,
        make: initialVehicle.make ?? '',
        model: initialVehicle.model ?? '',
        color: initialVehicle.color ?? '',
      },
    },
  });

  // Track selected saved vehicle ID, or null if adding new
  const [selectedSavedVehicleId, setSelectedSavedVehicleId] = useState<string | null>(null);
  // Track if user explicitly chose to add new vehicle
  const [isAddingNew, setIsAddingNew] = useState(savedVehicles.length === 0);
  // Vehicle selection error state
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  // --- Phone lookup state ---
  const [phoneLookup, setPhoneLookup] = useState<{
    exists: boolean;
    firstName?: string;
  } | null>(null);
  const [phoneLookupDismissed, setPhoneLookupDismissed] = useState(false);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLookedUpPhone = useRef<string | null>(null);
  const isPortal = savedVehicles.length > 0;

  const [bookingVehicleCategory, setBookingVehicleCategory] = useState<VehicleCategory>(
    (initialVehicle as BookingVehicleInput).vehicle_category ?? 'automobile'
  );
  const [yearOtherMode, setYearOtherMode] = useState(false);

  const bookingIsSpecialty = isSpecialtyCategory(bookingVehicleCategory);
  const bookingTierLabel = TIER_DROPDOWN_LABELS[bookingVehicleCategory];
  const bookingSpecialtyOptions = bookingIsSpecialty ? SPECIALTY_TIERS[bookingVehicleCategory] : [];

  function handleBookingCategoryChange(newCategory: VehicleCategory) {
    setBookingVehicleCategory(newCategory);
    const specialty = isSpecialtyCategory(newCategory);
    setValue('vehicle.vehicle_category', newCategory, { shouldDirty: true });
    setValue('vehicle.vehicle_type', specialty ? newCategory : 'standard', { shouldDirty: true });
    setValue('vehicle.make', '', { shouldDirty: true });
    setValue('vehicle.size_class', null, { shouldDirty: true });
    setValue('vehicle.specialty_tier', null, { shouldDirty: true });
  }

  const handleBookingMakeChange = useCallback((val: string) => {
    setValue('vehicle.make', val, { shouldDirty: true });
  }, [setValue]);

  // Phone lookup function
  const doPhoneLookup = useCallback(async (phone: string) => {
    const e164 = normalizePhone(phone);
    if (!e164) return;

    // Skip if same phone was already looked up
    if (lastLookedUpPhone.current === e164) return;
    lastLookedUpPhone.current = e164;

    try {
      const res = await fetch('/api/book/check-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      if (!res.ok) return;

      const data = await res.json();
      if (data.exists) {
        setPhoneLookup({ exists: true, firstName: data.firstName });
        setPhoneLookupDismissed(false);
      } else {
        setPhoneLookup(null);
      }
    } catch {
      // Fail silently — don't disrupt the booking flow
    }
  }, []);

  // Schedule phone lookup on change (debounced 500ms + valid number)
  const schedulePhoneLookup = useCallback(
    (phone: string) => {
      // Clear any pending lookup
      if (lookupTimerRef.current) {
        clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }

      // Don't look up if already logged in
      if (isPortal) return;

      // Check if phone changed from what was looked up
      const e164 = normalizePhone(phone);
      if (e164 && lastLookedUpPhone.current === e164) return;

      // If phone changed, dismiss old notification
      if (lastLookedUpPhone.current && e164 !== lastLookedUpPhone.current) {
        setPhoneLookup(null);
        setPhoneLookupDismissed(false);
        lastLookedUpPhone.current = null;
      }

      // Only look up with a valid 10-digit number
      if (!isValidPhoneForLookup(phone)) return;

      lookupTimerRef.current = setTimeout(() => {
        doPhoneLookup(phone);
      }, 500);
    },
    [isPortal, doPhoneLookup]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
  }, []);

  function handlePhoneBlur() {
    const phone = watch('customer.phone');
    if (phone && isValidPhoneForLookup(phone) && !isPortal) {
      // Clear pending debounce and do immediate lookup on blur
      if (lookupTimerRef.current) {
        clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }
      doPhoneLookup(phone);
    }
  }

  function handleLoginClick() {
    // Build redirect URL preserving current booking URL state
    const currentUrl = window.location.href;
    const redirectUrl = encodeURIComponent(currentUrl);
    // Pass phone number so the signin page can pre-fill it
    const phone = watch('customer.phone');
    const phoneParam = phone ? `&phone=${encodeURIComponent(phone)}` : '';
    window.location.href = `/signin?redirect=${redirectUrl}${phoneParam}`;
  }

  function handleSelectSavedVehicle(v: SavedVehicle) {
    setSelectedSavedVehicleId(v.id);
    setIsAddingNew(false);
    setVehicleError(null);
    const cat = (v.vehicle_category || (v.vehicle_type === 'standard' ? 'automobile' : v.vehicle_type)) as VehicleCategory;
    setBookingVehicleCategory(cat);
    setValue('vehicle.vehicle_category', cat, { shouldDirty: true });
    setValue('vehicle.vehicle_type', v.vehicle_type, { shouldDirty: true });
    setValue('vehicle.size_class', v.size_class ?? undefined, { shouldDirty: true });
    setValue('vehicle.specialty_tier', v.specialty_tier ?? null, { shouldDirty: true });
    setValue('vehicle.year', v.year ?? undefined, { shouldDirty: true });
    setValue('vehicle.make', v.make ?? '', { shouldDirty: true });
    setValue('vehicle.model', v.model ?? '', { shouldDirty: true });
    setValue('vehicle.color', v.color ?? '', { shouldDirty: true });
  }

  function handleAddNewVehicle() {
    setSelectedSavedVehicleId(null);
    setIsAddingNew(true);
    setBookingVehicleCategory('automobile');
    // Reset vehicle fields to defaults
    reset({
      customer: watch('customer'),
      vehicle: {
        vehicle_category: 'automobile',
        vehicle_type: 'standard',
        size_class: null,
        specialty_tier: null,
        year: undefined,
        make: '',
        model: '',
        color: '',
      },
    });
  }

  function formatVehicleLabel(v: SavedVehicle): string {
    const parts = [v.year, v.make, v.model].filter(Boolean);
    const label = parts.length > 0 ? parts.join(' ') : 'Vehicle';
    return v.color ? `${label} (${v.color})` : label;
  }

  function onSubmit(data: CustomerInfoFormData) {
    // Validate vehicle selection
    // If user has saved vehicles and hasn't selected one OR isn't adding new, show error
    if (hasSavedVehicles && !selectedSavedVehicleId && !isAddingNew) {
      setVehicleError('Please select a vehicle or add a new one');
      return;
    }

    // If adding new vehicle, require vehicle_type at minimum
    if (isAddingNew || !hasSavedVehicles) {
      if (!data.vehicle.vehicle_type) {
        setVehicleError('Please select a vehicle type');
        return;
      }
    }

    setVehicleError(null);
    // Title-case model + color before passing upstream
    const specialty = isSpecialtyCategory(bookingVehicleCategory);
    const vehicleType = (specialty ? bookingVehicleCategory : 'standard') as BookingVehicleInput['vehicle_type'];
    const vehicle: BookingVehicleInput = {
      ...data.vehicle,
      vehicle_category: bookingVehicleCategory,
      vehicle_type: vehicleType,
      size_class: !specialty ? data.vehicle.size_class : null,
      specialty_tier: specialty ? (data.vehicle.specialty_tier || null) : null,
      model: titleCaseField(data.vehicle.model || ''),
      color: titleCaseField(data.vehicle.color || ''),
    };
    // All online bookings are enthusiasts by default
    onContinue(data.customer, vehicle);
  }

  const hasSavedVehicles = savedVehicles.length > 0;
  const showVehicleForm = isAddingNew || !hasSavedVehicles;
  const showWelcomeBack = phoneLookup?.exists && !phoneLookupDismissed && !isPortal;

  // Theme-aware overrides for dark booking background
  const inputCls = 'border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime dark:border-site-border dark:bg-brand-surface dark:text-site-text dark:placeholder:text-site-text-dim';
  const selectCls = 'border-site-border bg-brand-surface text-site-text focus-visible:ring-lime dark:border-site-border dark:bg-brand-surface dark:text-site-text';
  const labelCls = 'text-site-text-secondary dark:text-site-text-secondary';

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h2 className="text-xl font-semibold text-site-text">Your Information</h2>
      <p className="mt-1 text-sm text-site-text-secondary">
        Tell us about yourself and your vehicle.
      </p>

      {/* Contact Info */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-site-text-secondary">Contact Details</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <FormField
            label="First Name"
            required
            error={errors.customer?.first_name?.message}
            htmlFor="first_name"
            labelClassName={labelCls}
          >
            <Input
              id="first_name"
              autoFocus
              placeholder="John"
              className={inputCls}
              {...register('customer.first_name')}
            />
          </FormField>

          <FormField
            label="Last Name"
            required
            error={errors.customer?.last_name?.message}
            htmlFor="last_name"
            labelClassName={labelCls}
          >
            <Input
              id="last_name"
              placeholder="Doe"
              className={inputCls}
              {...register('customer.last_name')}
            />
          </FormField>

          <FormField
            label="Mobile"
            required
            error={errors.customer?.phone?.message}
            htmlFor="phone"
            labelClassName={labelCls}
          >
            <Input
              id="phone"
              type="tel"
              placeholder="(310) 555-1234"
              className={inputCls}
              {...register('customer.phone', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const formatted = formatPhoneInput(e.target.value);
                  setValue('customer.phone', formatted, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  schedulePhoneLookup(formatted);
                },
                onBlur: handlePhoneBlur,
              })}
            />
          </FormField>

          <FormField
            label="Email"
            required
            error={errors.customer?.email?.message}
            htmlFor="email"
            labelClassName={labelCls}
          >
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              className={inputCls}
              {...register('customer.email')}
            />
          </FormField>
        </div>

        {/* Welcome Back Notification */}
        {showWelcomeBack && (
          <div className="mt-4 relative rounded-lg border border-lime bg-lime/10 p-4">
            <button
              type="button"
              onClick={() => setPhoneLookupDismissed(true)}
              className="absolute top-2 right-2 text-site-text-muted hover:text-site-text transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            <p className="text-sm font-medium text-site-text">
              {phoneLookup.firstName
                ? `Welcome back, ${phoneLookup.firstName}!`
                : 'Welcome back!'}
            </p>
            <p className="mt-1 text-xs text-site-text-muted">
              We found an account with this phone number. Log in to auto-fill your details and access your booking history.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={handleLoginClick}
                className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200 text-xs h-8 px-3"
              >
                <LogIn className="mr-1.5 h-3.5 w-3.5" />
                Log In to Continue
              </Button>
              <button
                type="button"
                onClick={() => setPhoneLookupDismissed(true)}
                className="text-xs text-site-text-muted hover:text-site-text transition-colors"
              >
                Continue as Guest
              </button>
            </div>
          </div>
        )}

        {/* Consent Checkboxes */}
        <div className="mt-5 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-site-border text-lime focus:ring-lime"
              {...register('customer.sms_consent')}
            />
            <span className="text-xs text-site-text-secondary">
              I agree to receive text messages from {businessName} including appointment reminders and updates. Msg &amp; data rates may apply. Reply STOP to opt out.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-site-border text-lime focus:ring-lime"
              {...register('customer.email_consent')}
            />
            <span className="text-xs text-site-text-secondary">
              I agree to receive emails from {businessName} including appointment confirmations and promotional offers.
            </span>
          </label>
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-site-text-secondary">Vehicle Details</h3>
          <span className="text-sm text-red-500">*Required</span>
        </div>

        {/* Vehicle error message */}
        {vehicleError && (
          <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
            {vehicleError}
          </div>
        )}

        {/* Saved Vehicle Picker for logged-in customers */}
        {hasSavedVehicles && (
          <div className="mt-3 mb-4">
            <p className="text-sm text-site-text-secondary mb-2">Select a saved vehicle:</p>
            <div className="flex flex-wrap gap-2">
              {savedVehicles.map((v) => {
                const isSelected = selectedSavedVehicleId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectSavedVehicle(v)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'border-lime bg-brand-surface text-lime'
                        : 'border-site-border bg-brand-surface text-site-text-secondary hover:bg-brand-surface'
                    }`}
                  >
                    {isSelected && <Check className="h-4 w-4" />}
                    {formatVehicleLabel(v)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleAddNewVehicle}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  isAddingNew
                    ? 'border-lime bg-brand-surface text-lime'
                    : 'border-site-border bg-brand-surface text-site-text-secondary hover:bg-brand-surface'
                }`}
              >
                <Plus className="h-4 w-4" />
                Add New Vehicle
              </button>
            </div>
          </div>
        )}

        {/* Vehicle form fields - shown when adding new or no saved vehicles */}
        {showVehicleForm && (
          <>
            {/* Category Selector */}
            <div className="mt-3">
              <FormField label="Category" htmlFor="vehicle_category" labelClassName={labelCls}>
                <Select
                  id="vehicle_category"
                  className={selectCls}
                  value={bookingVehicleCategory}
                  onChange={(e) => handleBookingCategoryChange(e.target.value as VehicleCategory)}
                >
                  {VEHICLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {VEHICLE_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <FormField label="Year" htmlFor="year" labelClassName={labelCls}>
                {yearOtherMode ? (
                  <>
                    <Input
                      id="year"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Enter year (e.g., 1965)"
                      className={inputCls}
                      {...register('vehicle.year')}
                    />
                    <button
                      type="button"
                      onClick={() => { setYearOtherMode(false); setValue('vehicle.year', undefined); }}
                      className="mt-1 text-xs text-site-text-muted hover:text-site-text transition-colors"
                    >
                      Back to list
                    </button>
                  </>
                ) : (
                  <Select
                    id="year"
                    className={selectCls}
                    {...register('vehicle.year', {
                      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                        if (e.target.value === 'other') {
                          setYearOtherMode(true);
                          setValue('vehicle.year', undefined);
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

              <FormField label="Make" htmlFor="make" labelClassName={labelCls}>
                <VehicleMakeCombobox
                  id="make"
                  value={watch('vehicle.make') || ''}
                  onChange={handleBookingMakeChange}
                  className={inputCls}
                  category={bookingVehicleCategory}
                />
              </FormField>

              <FormField label="Model" htmlFor="model" labelClassName={labelCls}>
                <Input
                  id="model"
                  placeholder={MODEL_PLACEHOLDERS[bookingVehicleCategory]}
                  className={inputCls}
                  {...register('vehicle.model')}
                />
              </FormField>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="Color" htmlFor="color" labelClassName={labelCls}>
                <Input
                  id="color"
                  placeholder="e.g., Silver"
                  className={inputCls}
                  {...register('vehicle.color')}
                />
              </FormField>

              <FormField
                label={bookingTierLabel}
                htmlFor="vehicle_tier"
                required={requireSizeClass && !bookingIsSpecialty}
                error={bookingIsSpecialty ? errors.vehicle?.specialty_tier?.message : errors.vehicle?.size_class?.message}
                labelClassName={labelCls}
              >
                {bookingIsSpecialty ? (
                  <Select
                    id="vehicle_tier"
                    className={selectCls}
                    {...register('vehicle.specialty_tier')}
                  >
                    <option value="">Select {bookingTierLabel.toLowerCase()}...</option>
                    {bookingSpecialtyOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Select
                    id="vehicle_tier"
                    className={selectCls}
                    {...register('vehicle.size_class')}
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
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface">
          Back
        </Button>
        <Button type="submit" className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200">Continue</Button>
      </div>
    </form>
  );
}
