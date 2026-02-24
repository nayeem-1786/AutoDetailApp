'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import type { CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { resolveServicePrice } from '../utils/pricing';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';

interface ServicePricingPickerProps {
  open: boolean;
  onClose: () => void;
  service: CatalogService;
  vehicleSizeClass: VehicleSizeClass | null;
  vehicleSpecialtyTier: string | null;
  onSelect: (pricing: ServicePricing, vehicleSizeClass: VehicleSizeClass | null, perUnitQty?: number) => void;
}

export function ServicePricingPicker({
  open,
  onClose,
  service,
  vehicleSizeClass,
  vehicleSpecialtyTier,
  onSelect,
}: ServicePricingPickerProps) {
  const pricing = service.pricing ?? [];
  const isPerUnit = service.pricing_model === 'per_unit' && service.per_unit_price != null;

  const VEHICLE_SIZES: VehicleSizeClass[] = ['sedan', 'truck_suv_2row', 'suv_3row_van'];

  function handleSelect(tier: ServicePricing, sizeOverride?: VehicleSizeClass) {
    onSelect(tier, sizeOverride ?? vehicleSizeClass);
    onClose();
  }

  // Per-unit pricing UI
  if (isPerUnit) {
    return (
      <PerUnitPicker
        open={open}
        onClose={onClose}
        service={service}
        onSelect={onSelect}
        vehicleSizeClass={vehicleSizeClass}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogClose onClose={onClose} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <DialogHeader>
        <DialogTitle>{service.name}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {vehicleSizeClass && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Prices shown for {VEHICLE_SIZE_LABELS[vehicleSizeClass]}
          </p>
        )}
        {service.pricing_model === 'specialty' && vehicleSpecialtyTier && (
          <p className="mb-2 text-xs text-blue-600 dark:text-blue-400">
            Vehicle tier will be highlighted below
          </p>
        )}

        {pricing.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No pricing tiers available for this service.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pricing
              .sort((a, b) => a.display_order - b.display_order)
              .map((tier) => {
                const needsSizeSelection =
                  !vehicleSizeClass && tier.is_vehicle_size_aware;

                // When vehicle-size-aware and no vehicle set, show individual size options
                if (needsSizeSelection) {
                  return (
                    <div key={tier.id} className="flex flex-col gap-1.5">
                      {pricing.length > 1 && (
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {tier.tier_label || tier.tier_name}
                        </p>
                      )}
                      {VEHICLE_SIZES.map((size) => {
                        const sizePrice = resolveServicePrice(tier, size);
                        return (
                          <button
                            key={`${tier.id}-${size}`}
                            onClick={() => handleSelect(tier, size)}
                            className={cn(
                              'flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-left transition-all',
                              'min-h-[48px] active:scale-[0.99] active:bg-gray-50 dark:active:bg-gray-800',
                              'hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50'
                            )}
                          >
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {VEHICLE_SIZE_LABELS[size]}
                            </span>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              ${sizePrice.toFixed(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                }

                // Vehicle is set or tier is not vehicle-size-aware — single button
                const price = resolveServicePrice(tier, vehicleSizeClass);
                const sizeLabel =
                  vehicleSizeClass && tier.is_vehicle_size_aware
                    ? VEHICLE_SIZE_LABELS[vehicleSizeClass]
                    : null;

                // Specialty tier matching: highlight when vehicle's specialty_tier matches this tier
                const isSpecialtyMatch =
                  service.pricing_model === 'specialty' &&
                  vehicleSpecialtyTier != null &&
                  tier.tier_name === vehicleSpecialtyTier;

                const isHighlighted =
                  (vehicleSizeClass && tier.is_vehicle_size_aware) || isSpecialtyMatch;

                return (
                  <button
                    key={tier.id}
                    onClick={() => handleSelect(tier)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-4 text-left transition-all',
                      'min-h-[56px] active:scale-[0.99] active:bg-gray-50 dark:active:bg-gray-800',
                      isHighlighted
                        ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm dark:hover:shadow-gray-950/30'
                    )}
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {tier.tier_label || tier.tier_name}
                      </span>
                      {sizeLabel && (
                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                          {sizeLabel}
                        </span>
                      )}
                      {isSpecialtyMatch && (
                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                          Matched to vehicle
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      ${price.toFixed(2)}
                    </span>
                  </button>
                );
              })}
          </div>
        )}

        {!vehicleSizeClass && pricing.some((t) => t.is_vehicle_size_aware) && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Select a vehicle size above, or set a vehicle on the ticket for automatic pricing.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Per-Unit Quantity Picker ──────────────────────────────────

interface PerUnitPickerProps {
  open: boolean;
  onClose: () => void;
  service: CatalogService;
  vehicleSizeClass: VehicleSizeClass | null;
  onSelect: (pricing: ServicePricing, vehicleSizeClass: VehicleSizeClass | null, perUnitQty?: number) => void;
}

function PerUnitPicker({ open, onClose, service, vehicleSizeClass, onSelect }: PerUnitPickerProps) {
  const perUnitPrice = service.per_unit_price!;
  const perUnitMax = service.per_unit_max ?? 10;
  const perUnitLabel = service.per_unit_label || 'unit';
  const [quantity, setQuantity] = useState(1);

  const total = quantity * perUnitPrice;

  // Create a synthetic ServicePricing for the dispatch
  const syntheticPricing: ServicePricing = {
    id: 'per_unit',
    service_id: service.id,
    tier_name: 'default',
    tier_label: null,
    price: total,
    sale_price: null,
    display_order: 0,
    is_vehicle_size_aware: false,
    vehicle_size_sedan_price: null,
    vehicle_size_truck_suv_price: null,
    vehicle_size_suv_van_price: null,
    created_at: '',
  };

  function handleAdd() {
    onSelect(syntheticPricing, vehicleSizeClass, quantity);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogClose onClose={onClose} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
      <DialogHeader>
        <DialogTitle>{service.name}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {/* Unit price info */}
        <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100">${perUnitPrice.toFixed(2)}</span>
            {' '}per {perUnitLabel}
          </p>
          {perUnitMax && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Maximum: {perUnitMax} {perUnitLabel}{perUnitMax > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Quantity selector */}
        <div className="mb-4">
          <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            How many {perUnitLabel}{quantity !== 1 ? 's' : ''}?
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all',
                quantity <= 1
                  ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95'
              )}
            >
              <Minus className="h-5 w-5" />
            </button>

            <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800">
              <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {quantity}
              </span>
            </div>

            <button
              onClick={() => setQuantity((q) => Math.min(perUnitMax, q + 1))}
              disabled={quantity >= perUnitMax}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all',
                quantity >= perUnitMax
                  ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95'
              )}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Total display */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/20 px-4 py-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {quantity} {perUnitLabel}{quantity > 1 ? 's' : ''} &times; ${perUnitPrice.toFixed(2)}
          </span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
            ${total.toFixed(2)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <button
            onClick={handleAdd}
            className={cn(
              'flex-1 rounded-lg py-3 text-sm font-semibold text-white transition-all',
              'bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 active:scale-[0.99]',
              'min-h-[48px]'
            )}
          >
            Add to Ticket &mdash; ${total.toFixed(2)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
