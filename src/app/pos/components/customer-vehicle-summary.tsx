'use client';

import { User, Car, X, ChevronRight, Pencil } from 'lucide-react';
import { formatPhone } from '@/lib/utils/format';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { VEHICLE_CATEGORY_LABELS } from '@/lib/utils/vehicle-categories';
import { CustomerTypeBadge } from './customer-type-badge';
import type { Customer, Vehicle, CustomerType } from '@/lib/supabase/types';

interface CustomerVehicleSummaryProps {
  customer: Customer | null;
  vehicle: Vehicle | null;
  onChangeCustomer: () => void;
  onChangeVehicle: () => void;
  onClear: () => void;
  onCustomerTypeChanged?: (newType: CustomerType | null) => void;
  onEditVehicle?: () => void;
}

export function CustomerVehicleSummary({
  customer,
  vehicle,
  onChangeCustomer,
  onChangeVehicle,
  onClear,
  onCustomerTypeChanged,
  onEditVehicle,
}: CustomerVehicleSummaryProps) {
  if (!customer) {
    // Guest state -- show "Add Customer" button
    return (
      <button
        onClick={onChangeCustomer}
        className="flex w-full items-center justify-between rounded-md border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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

  const categoryLabel = vehicle?.vehicle_category && vehicle.vehicle_category !== 'automobile'
    ? VEHICLE_CATEGORY_LABELS[vehicle.vehicle_category as keyof typeof VEHICLE_CATEGORY_LABELS]
    : null;

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
      {/* Customer row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onChangeCustomer}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <User className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            {customer.first_name} {customer.last_name}
            {customer.phone && (
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                {formatPhone(customer.phone)}
              </span>
            )}
          </button>
          <CustomerTypeBadge
            customerId={customer.id}
            customerType={customer.customer_type}
            onTypeChanged={onCustomerTypeChanged}
          />
        </div>
        <button
          onClick={onClear}
          className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Vehicle row */}
      <div className="mt-1 flex items-center gap-1">
        <button
          onClick={onChangeVehicle}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <Car className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
          {vehicleLabel ? (
            <>
              <span>{vehicleLabel}</span>
              {categoryLabel && (
                <span className="text-xs text-gray-400 dark:text-gray-500">({categoryLabel})</span>
              )}
              {!categoryLabel && sizeLabel && (
                <span className="text-xs text-gray-400 dark:text-gray-500">({sizeLabel})</span>
              )}
            </>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">Tap to select vehicle</span>
          )}
        </button>
        {vehicle && onEditVehicle && (
          <button
            onClick={onEditVehicle}
            className="ml-1 rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-400"
            title="Edit vehicle"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
