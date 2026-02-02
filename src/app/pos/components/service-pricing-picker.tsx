'use client';

import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogClose,
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
  onSelect: (pricing: ServicePricing, vehicleSizeClass: VehicleSizeClass | null) => void;
}

export function ServicePricingPicker({
  open,
  onClose,
  service,
  vehicleSizeClass,
  onSelect,
}: ServicePricingPickerProps) {
  const pricing = service.pricing ?? [];

  function handleSelect(tier: ServicePricing) {
    onSelect(tier, vehicleSizeClass);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogClose onClose={onClose} />
      <DialogHeader>
        <DialogTitle>{service.name}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {vehicleSizeClass && (
          <p className="mb-2 text-xs text-gray-500">
            Prices shown for {VEHICLE_SIZE_LABELS[vehicleSizeClass]}
          </p>
        )}

        {pricing.length === 0 ? (
          <p className="text-sm text-gray-500">
            No pricing tiers available for this service.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pricing
              .sort((a, b) => a.display_order - b.display_order)
              .map((tier) => {
                const price = resolveServicePrice(tier, vehicleSizeClass);
                const sizeLabel =
                  vehicleSizeClass && tier.is_vehicle_size_aware
                    ? VEHICLE_SIZE_LABELS[vehicleSizeClass]
                    : null;
                const showRange =
                  !vehicleSizeClass && tier.is_vehicle_size_aware;

                return (
                  <button
                    key={tier.id}
                    onClick={() => handleSelect(tier)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-4 text-left transition-all',
                      'min-h-[56px] active:scale-[0.99] active:bg-gray-50',
                      vehicleSizeClass && tier.is_vehicle_size_aware
                        ? 'border-blue-200 bg-blue-50/50 hover:border-blue-300'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    )}
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {tier.tier_label || tier.tier_name}
                      </span>
                      {sizeLabel && (
                        <span className="ml-2 text-xs text-blue-600">
                          {sizeLabel}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {showRange
                        ? (() => {
                            const prices = [
                              tier.vehicle_size_sedan_price ?? tier.price,
                              tier.vehicle_size_truck_suv_price ?? tier.price,
                              tier.vehicle_size_suv_van_price ?? tier.price,
                            ];
                            const min = Math.min(...prices);
                            const max = Math.max(...prices);
                            return min === max
                              ? `$${min.toFixed(2)}`
                              : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
                          })()
                        : `$${price.toFixed(2)}`}
                    </span>
                  </button>
                );
              })}
          </div>
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
