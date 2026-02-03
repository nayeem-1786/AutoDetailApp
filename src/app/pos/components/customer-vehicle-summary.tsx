'use client';

import { User, Car, X, ChevronRight } from 'lucide-react';
import { formatPhone } from '@/lib/utils/format';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { CustomerTypeBadge } from './customer-type-badge';
import type { Customer, Vehicle } from '@/lib/supabase/types';

interface CustomerVehicleSummaryProps {
  customer: Customer | null;
  vehicle: Vehicle | null;
  onChangeCustomer: () => void;
  onChangeVehicle: () => void;
  onClear: () => void;
  onCustomerTagsChanged?: (newTags: string[]) => void;
}

export function CustomerVehicleSummary({
  customer,
  vehicle,
  onChangeCustomer,
  onChangeVehicle,
  onClear,
  onCustomerTagsChanged,
}: CustomerVehicleSummaryProps) {
  if (!customer) {
    // Guest state — show "Add Customer" button
    return (
      <button
        onClick={onChangeCustomer}
        className="flex w-full items-center justify-between rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
      >
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          <span>Guest — tap to add customer</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    );
  }

  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
      'Vehicle'
    : null;

  const sizeLabel = vehicle?.size_class
    ? VEHICLE_SIZE_LABELS[vehicle.size_class]
    : null;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      {/* Customer row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onChangeCustomer}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-blue-600"
          >
            <User className="h-3.5 w-3.5 text-gray-400" />
            {customer.first_name} {customer.last_name}
            {customer.phone && (
              <span className="text-xs font-normal text-gray-500">
                {formatPhone(customer.phone)}
              </span>
            )}
          </button>
          <CustomerTypeBadge
            customerId={customer.id}
            tags={customer.tags}
            onTypeChanged={onCustomerTagsChanged}
          />
        </div>
        <button
          onClick={onClear}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Vehicle row */}
      <button
        onClick={onChangeVehicle}
        className="mt-1 flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600"
      >
        <Car className="h-3.5 w-3.5 text-gray-400" />
        {vehicleLabel ? (
          <>
            <span>{vehicleLabel}</span>
            {sizeLabel && (
              <span className="text-xs text-gray-400">({sizeLabel})</span>
            )}
          </>
        ) : (
          <span className="text-gray-400">Tap to select vehicle</span>
        )}
      </button>
    </div>
  );
}
