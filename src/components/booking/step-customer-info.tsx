'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { bookingCustomerSchema, bookingVehicleSchema, type BookingCustomerInput, type BookingVehicleInput } from '@/lib/utils/validation';
import { formatPhoneInput } from '@/lib/utils/format';
import { VEHICLE_TYPE_LABELS, VEHICLE_SIZE_LABELS, VEHICLE_TYPE_SIZE_CLASSES } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import type { VehicleSizeClass, VehicleType } from '@/lib/supabase/types';
import { z } from 'zod';
import { Plus, Check } from 'lucide-react';

interface SavedVehicle {
  id: string;
  vehicle_type: VehicleType;
  size_class: VehicleSizeClass | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

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
    defaultValues: {
      customer: {
        first_name: initialCustomer.first_name ?? '',
        last_name: initialCustomer.last_name ?? '',
        phone: formatInitialPhone(initialCustomer.phone),
        email: initialCustomer.email ?? '',
        sms_consent: false,
        email_consent: false,
      },
      vehicle: {
        vehicle_type: initialVehicle.vehicle_type ?? 'standard',
        size_class: initialSizeClass ?? initialVehicle.size_class ?? null,
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

  const vehicleType = watch('vehicle.vehicle_type');
  const sizeClasses = VEHICLE_TYPE_SIZE_CLASSES[vehicleType] ?? [];

  function handleSelectSavedVehicle(v: SavedVehicle) {
    setSelectedSavedVehicleId(v.id);
    setIsAddingNew(false);
    setVehicleError(null);
    setValue('vehicle.vehicle_type', v.vehicle_type, { shouldDirty: true });
    setValue('vehicle.size_class', v.size_class ?? undefined, { shouldDirty: true });
    setValue('vehicle.year', v.year ?? undefined, { shouldDirty: true });
    setValue('vehicle.make', v.make ?? '', { shouldDirty: true });
    setValue('vehicle.model', v.model ?? '', { shouldDirty: true });
    setValue('vehicle.color', v.color ?? '', { shouldDirty: true });
  }

  function handleAddNewVehicle() {
    setSelectedSavedVehicleId(null);
    setIsAddingNew(true);
    // Reset vehicle fields to defaults
    reset({
      customer: watch('customer'),
      vehicle: {
        vehicle_type: 'standard',
        size_class: null,
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
    // All online bookings are enthusiasts by default
    onContinue(data.customer, data.vehicle);
  }

  const hasSavedVehicles = savedVehicles.length > 0;
  const showVehicleForm = isAddingNew || !hasSavedVehicles;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h2 className="text-xl font-semibold text-gray-900">Your Information</h2>
      <p className="mt-1 text-sm text-gray-600">
        Tell us about yourself and your vehicle.
      </p>

      {/* Contact Info */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-700">Contact Details</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <FormField
            label="First Name"
            required
            error={errors.customer?.first_name?.message}
            htmlFor="first_name"
          >
            <Input
              id="first_name"
              placeholder="John"
              {...register('customer.first_name')}
            />
          </FormField>

          <FormField
            label="Last Name"
            required
            error={errors.customer?.last_name?.message}
            htmlFor="last_name"
          >
            <Input
              id="last_name"
              placeholder="Doe"
              {...register('customer.last_name')}
            />
          </FormField>

          <FormField
            label="Mobile"
            required
            error={errors.customer?.phone?.message}
            htmlFor="phone"
          >
            <Input
              id="phone"
              placeholder="(310) 555-1234"
              {...register('customer.phone', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const formatted = formatPhoneInput(e.target.value);
                  setValue('customer.phone', formatted, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                },
              })}
            />
          </FormField>

          <FormField
            label="Email"
            required
            error={errors.customer?.email?.message}
            htmlFor="email"
          >
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              {...register('customer.email')}
            />
          </FormField>
        </div>

        {/* Consent Checkboxes */}
        <div className="mt-5 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              {...register('customer.sms_consent')}
            />
            <span className="text-xs text-gray-600">
              I agree to receive text messages from {businessName} including appointment reminders and updates. Msg &amp; data rates may apply. Reply STOP to opt out.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              {...register('customer.email_consent')}
            />
            <span className="text-xs text-gray-600">
              I agree to receive emails from {businessName} including appointment confirmations and promotional offers.
            </span>
          </label>
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Vehicle Details</h3>
          <span className="text-sm text-red-500">*Required</span>
        </div>

        {/* Vehicle error message */}
        {vehicleError && (
          <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {vehicleError}
          </div>
        )}

        {/* Saved Vehicle Picker for logged-in customers */}
        {hasSavedVehicles && (
          <div className="mt-3 mb-4">
            <p className="text-sm text-gray-600 mb-2">Select a saved vehicle:</p>
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
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
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
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
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
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormField label="Vehicle Type" htmlFor="vehicle_type">
              <Select
                id="vehicle_type"
                {...register('vehicle.vehicle_type')}
              >
                {Object.entries(VEHICLE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>

            {sizeClasses.length > 0 && (
              <FormField
                label="Size Class"
                htmlFor="size_class"
                required={requireSizeClass}
                error={errors.vehicle?.size_class?.message}
              >
                <Select
                  id="size_class"
                  {...register('vehicle.size_class')}
                >
                  <option value="">Select size...</option>
                  {sizeClasses.map((sc) => (
                    <option key={sc} value={sc}>
                      {VEHICLE_SIZE_LABELS[sc]}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            <FormField label="Year" htmlFor="year">
              <Input
                id="year"
                type="number"
                placeholder="2024"
                {...register('vehicle.year')}
              />
            </FormField>

            <FormField label="Make" htmlFor="make">
              <Input
                id="make"
                placeholder="Toyota"
                {...register('vehicle.make')}
              />
            </FormField>

            <FormField label="Model" htmlFor="model">
              <Input
                id="model"
                placeholder="Camry"
                {...register('vehicle.model')}
              />
            </FormField>

            <FormField label="Color" htmlFor="color">
              <Input
                id="color"
                placeholder="White"
                {...register('vehicle.color')}
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}
