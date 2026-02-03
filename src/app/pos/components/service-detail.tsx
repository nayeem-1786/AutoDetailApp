'use client';

import { useState } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { useTicket } from '../context/ticket-context';
import { resolveServicePrice } from '../utils/pricing';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import type { CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

interface ServiceDetailProps {
  service: CatalogService;
  categoryName: string;
  onBack: () => void;
}

export function ServiceDetail({ service, categoryName, onBack }: ServiceDetailProps) {
  const { ticket, dispatch } = useTicket();
  const pricing = service.pricing ?? [];
  const vehicleSizeClass = ticket.vehicle?.size_class ?? null;

  // If flat price and no tiers, create synthetic tier
  const tiers: ServicePricing[] = pricing.length > 0
    ? [...pricing].sort((a, b) => a.display_order - b.display_order)
    : service.flat_price != null
    ? [{
        id: 'flat',
        service_id: service.id,
        tier_name: 'default',
        tier_label: null,
        price: service.flat_price,
        display_order: 0,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        created_at: '',
      }]
    : [];

  const [selectedTierIdx, setSelectedTierIdx] = useState(0);

  const selectedTier = tiers[selectedTierIdx] ?? null;

  function getDisplayPrice(tier: ServicePricing): number {
    return resolveServicePrice(tier, vehicleSizeClass);
  }

  function handleAdd() {
    if (!selectedTier) {
      toast.error('No pricing available');
      return;
    }
    dispatch({
      type: 'ADD_SERVICE',
      service,
      pricing: selectedTier,
      vehicleSizeClass,
    });
    toast.success(`Added ${service.name}`);
    onBack();
  }

  const resolvedPrice = selectedTier ? getDisplayPrice(selectedTier) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex shrink-0 items-center gap-1.5 px-4 pt-4 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {categoryName}
      </button>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-lg font-semibold text-gray-900">{service.name}</h2>
        {service.base_duration_minutes && (
          <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <Clock className="h-4 w-4" />
            Est. {service.base_duration_minutes} min
          </div>
        )}

        {service.description && (
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            {service.description}
          </p>
        )}

        {/* Tier selection */}
        {tiers.length > 1 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Select Tier</h3>
            <div className="flex flex-col gap-2">
              {tiers.map((tier, idx) => {
                const price = getDisplayPrice(tier);
                const isSelected = idx === selectedTierIdx;
                const isVehicleAware = tier.is_vehicle_size_aware && vehicleSizeClass;

                return (
                  <button
                    key={tier.id}
                    onClick={() => setSelectedTierIdx(idx)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-4 text-left transition-all',
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border-2',
                          isSelected ? 'border-blue-500' : 'border-gray-300'
                        )}
                      >
                        {isSelected && (
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {tier.tier_label || tier.tier_name}
                        </span>
                        {isVehicleAware && (
                          <span className="ml-2 text-xs text-blue-600">
                            {VEHICLE_SIZE_LABELS[vehicleSizeClass as VehicleSizeClass]}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      ${price.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Vehicle size pricing info */}
        {tiers.length === 1 && tiers[0].is_vehicle_size_aware && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Vehicle Size Pricing</h3>
            <div className="flex flex-wrap gap-2">
              {(['sedan', 'truck_suv_2row', 'suv_3row_van'] as VehicleSizeClass[]).map((size) => {
                const price = resolveServicePrice(tiers[0], size);
                const isActive = vehicleSizeClass === size;
                return (
                  <div
                    key={size}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      isActive
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600'
                    )}
                  >
                    <span className="font-medium">{VEHICLE_SIZE_LABELS[size]}:</span>{' '}
                    ${price.toFixed(2)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Multi-tier vehicle size pricing */}
        {tiers.length > 1 && tiers.some((t) => t.is_vehicle_size_aware) && !vehicleSizeClass && (
          <p className="mt-3 text-xs text-gray-400">
            Select a vehicle on the ticket to see size-specific pricing.
          </p>
        )}
      </div>

      {/* Bottom: Add button */}
      <div className="shrink-0 border-t border-gray-200 bg-white p-4">
        <button
          onClick={handleAdd}
          disabled={!selectedTier}
          className={cn(
            'w-full rounded-xl py-3 text-base font-semibold text-white transition-all',
            selectedTier
              ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
              : 'cursor-not-allowed bg-gray-300'
          )}
        >
          {resolvedPrice != null
            ? `+ Add to Ticket — $${resolvedPrice.toFixed(2)}`
            : '+ Add to Ticket'}
        </button>
      </div>
    </div>
  );
}
