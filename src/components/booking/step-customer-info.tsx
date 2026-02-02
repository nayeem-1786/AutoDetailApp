'use client';

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
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerInfoFormData>({
    resolver: formResolver(customerInfoSchema),
    defaultValues: {
      customer: {
        first_name: initialCustomer.first_name ?? '',
        last_name: initialCustomer.last_name ?? '',
        phone: initialCustomer.phone ?? '',
        email: initialCustomer.email ?? '',
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

  const vehicleType = watch('vehicle.vehicle_type');
  const sizeClasses = VEHICLE_TYPE_SIZE_CLASSES[vehicleType] ?? [];

  function handleSelectSavedVehicle(v: SavedVehicle) {
    setValue('vehicle.vehicle_type', v.vehicle_type, { shouldDirty: true });
    setValue('vehicle.size_class', v.size_class ?? undefined, { shouldDirty: true });
    setValue('vehicle.year', v.year ?? undefined, { shouldDirty: true });
    setValue('vehicle.make', v.make ?? '', { shouldDirty: true });
    setValue('vehicle.model', v.model ?? '', { shouldDirty: true });
    setValue('vehicle.color', v.color ?? '', { shouldDirty: true });
  }

  function onSubmit(data: CustomerInfoFormData) {
    onContinue(data.customer, data.vehicle);
  }

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
            label="Phone"
            required
            error={errors.customer?.phone?.message}
            description="(XXX) XXX-XXXX"
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
      </div>

      {/* Vehicle Info */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-700">Vehicle Details</h3>

        {/* Saved Vehicle Picker for logged-in customers */}
        {savedVehicles.length > 0 && (
          <div className="mt-3 mb-4">
            <p className="text-sm text-gray-600 mb-2">Select a saved vehicle:</p>
            <div className="flex flex-wrap gap-2">
              {savedVehicles.map((v) => {
                const label = [v.year, v.make, v.model].filter(Boolean).join(' ');
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectSavedVehicle(v)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {label || 'Saved Vehicle'}
                    {v.color ? ` (${v.color})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
