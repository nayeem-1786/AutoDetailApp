'use client';

import { useState, useEffect } from 'react';
import { Clock, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { useTicket } from '../context/ticket-context';
import { resolveServicePrice } from '../utils/pricing';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import type { CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

interface ServiceDetailDialogProps {
  service: CatalogService;
  open: boolean;
  onClose: () => void;
  /** When provided, use this callback instead of dispatching to ticket context */
  onAdd?: (service: CatalogService, pricing: ServicePricing, vehicleSizeClass: VehicleSizeClass | null, perUnitQty?: number) => void;
  /** Override vehicle size class */
  vehicleSizeOverride?: VehicleSizeClass | null;
}

export function ServiceDetailDialog({ service, open, onClose, onAdd, vehicleSizeOverride }: ServiceDetailDialogProps) {
  const { ticket, dispatch: ticketDispatch } = useTicket();
  const dispatch = onAdd ? undefined : ticketDispatch;
  const pricing = service.pricing ?? [];
  const vehicleSizeClass = vehicleSizeOverride !== undefined
    ? vehicleSizeOverride
    : (ticket.vehicle?.size_class ?? null);

  const isPerUnit = service.pricing_model === 'per_unit' && service.per_unit_price != null;

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

  // Detect if tiers represent vehicle sizes (e.g., "sedan", "truck_suv_2row", "suv_3row_van")
  const VEHICLE_SIZE_CLASSES = new Set(['sedan', 'truck_suv_2row', 'suv_3row_van']);
  const isVehicleSizeTiers = tiers.length > 1
    && tiers.every((t) => VEHICLE_SIZE_CLASSES.has(t.tier_name));
  const autoMatchIdx = isVehicleSizeTiers && vehicleSizeClass
    ? tiers.findIndex((t) => t.tier_name === vehicleSizeClass)
    : -1;

  const [selectedTierIdx, setSelectedTierIdx] = useState(0);
  const [perUnitQty, setPerUnitQty] = useState(1);

  // Auto-select matching tier when service or vehicle changes
  useEffect(() => {
    if (autoMatchIdx >= 0) {
      setSelectedTierIdx(autoMatchIdx);
    } else {
      setSelectedTierIdx(0);
    }
  }, [service.id, autoMatchIdx]);

  // Reset per-unit quantity when service changes
  useEffect(() => {
    setPerUnitQty(1);
  }, [service.id]);

  const selectedTier = tiers[selectedTierIdx] ?? null;

  function getDisplayPrice(tier: ServicePricing): number {
    return resolveServicePrice(tier, vehicleSizeClass);
  }

  function handleAdd() {
    if (isPerUnit) {
      const perUnitPrice = service.per_unit_price!;
      const total = perUnitQty * perUnitPrice;
      const syntheticPricing: ServicePricing = {
        id: 'per_unit',
        service_id: service.id,
        tier_name: 'default',
        tier_label: null,
        price: total,
        display_order: 0,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        created_at: '',
      };
      if (onAdd) {
        onAdd(service, syntheticPricing, vehicleSizeClass, perUnitQty);
      } else if (dispatch) {
        dispatch({
          type: 'ADD_SERVICE',
          service,
          pricing: syntheticPricing,
          vehicleSizeClass,
          perUnitQty,
        });
        toast.success(`Added ${service.name}`);
      }
      onClose();
      return;
    }

    if (!selectedTier) {
      toast.error('No pricing available');
      return;
    }
    if (onAdd) {
      onAdd(service, selectedTier, vehicleSizeClass);
    } else if (dispatch) {
      dispatch({
        type: 'ADD_SERVICE',
        service,
        pricing: selectedTier,
        vehicleSizeClass,
      });
      toast.success(`Added ${service.name}`);
    }
    onClose();
  }

  // Resolve display price for the Add button
  let resolvedPrice: number | null;
  if (isPerUnit) {
    resolvedPrice = perUnitQty * service.per_unit_price!;
  } else {
    resolvedPrice = selectedTier ? getDisplayPrice(selectedTier) : null;
  }

  const perUnitMax = service.per_unit_max ?? 10;
  const perUnitLabel = service.per_unit_label || 'unit';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogClose onClose={onClose} />

      <div className="flex max-h-[80vh] flex-col">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5">
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

          {/* Per-unit quantity picker */}
          {isPerUnit && (
            <div className="mt-5">
              {/* Unit price info */}
              <div className="mb-4 rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">
                    ${service.per_unit_price!.toFixed(2)}
                  </span>
                  {' '}per {perUnitLabel}
                </p>
                {perUnitMax && (
                  <p className="mt-1 text-xs text-gray-400">
                    Maximum: {perUnitMax} {perUnitLabel}{perUnitMax > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Quantity selector */}
              <p className="mb-3 text-sm font-medium text-gray-700">
                How many {perUnitLabel}{perUnitQty !== 1 ? 's' : ''}?
              </p>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setPerUnitQty((q) => Math.max(1, q - 1))}
                  disabled={perUnitQty <= 1}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all',
                    perUnitQty <= 1
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50 active:scale-95'
                  )}
                >
                  <Minus className="h-5 w-5" />
                </button>

                <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-white border-2 border-blue-200">
                  <span className="text-2xl font-bold tabular-nums text-gray-900">
                    {perUnitQty}
                  </span>
                </div>

                <button
                  onClick={() => setPerUnitQty((q) => Math.min(perUnitMax, q + 1))}
                  disabled={perUnitQty >= perUnitMax}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all',
                    perUnitQty >= perUnitMax
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50 active:scale-95'
                  )}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {/* Total display */}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
                <span className="text-sm font-medium text-gray-700">
                  {perUnitQty} {perUnitLabel}{perUnitQty > 1 ? 's' : ''} &times; ${service.per_unit_price!.toFixed(2)}
                </span>
                <span className="text-lg font-bold text-gray-900">
                  ${resolvedPrice!.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Tier selection (non-per-unit services only) */}
          {!isPerUnit && tiers.length > 1 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                {isVehicleSizeTiers ? 'Vehicle Size Pricing' : 'Select Tier'}
              </h3>
              <div className="flex flex-col gap-2">
                {tiers.map((tier, idx) => {
                  const price = getDisplayPrice(tier);
                  const isSelected = idx === selectedTierIdx;
                  const isVehicleAware = tier.is_vehicle_size_aware && vehicleSizeClass;
                  // Disable non-matching vehicle-size tiers when vehicle is known
                  const isDisabled = autoMatchIdx >= 0 && idx !== autoMatchIdx;

                  return (
                    <button
                      key={tier.id}
                      onClick={() => { if (!isDisabled) setSelectedTierIdx(idx); }}
                      disabled={isDisabled}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-4 text-left transition-all',
                        isDisabled
                          ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50'
                          : isSelected
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-full border-2',
                            isDisabled
                              ? 'border-gray-200'
                              : isSelected ? 'border-blue-500' : 'border-gray-300'
                          )}
                        >
                          {isSelected && !isDisabled && (
                            <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <div>
                          <span className={cn(
                            'text-sm font-medium',
                            isDisabled ? 'text-gray-400' : 'text-gray-900'
                          )}>
                            {tier.tier_label || VEHICLE_SIZE_LABELS[tier.tier_name] || tier.tier_name}
                          </span>
                          {isVehicleAware && !isDisabled && (
                            <span className="ml-2 text-xs text-blue-600">
                              {VEHICLE_SIZE_LABELS[vehicleSizeClass as VehicleSizeClass]}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={cn(
                        'text-sm font-semibold',
                        isDisabled ? 'text-gray-300' : 'text-gray-700'
                      )}>
                        ${price.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {autoMatchIdx >= 0 && (
                <p className="mt-2 text-xs text-blue-600">
                  Auto-selected based on vehicle size
                </p>
              )}
            </div>
          )}

          {/* Vehicle size pricing info (non-per-unit only) */}
          {!isPerUnit && tiers.length === 1 && tiers[0].is_vehicle_size_aware && (
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

          {/* Multi-tier vehicle size pricing hint (non-per-unit only) */}
          {!isPerUnit && tiers.length > 1 && tiers.some((t) => t.is_vehicle_size_aware) && !vehicleSizeClass && (
            <p className="mt-3 text-xs text-gray-400">
              Select a vehicle on the ticket to see size-specific pricing.
            </p>
          )}
        </div>

        {/* Sticky bottom: Add button */}
        <div className="shrink-0 border-t border-gray-100 p-5 pt-4">
          <button
            onClick={handleAdd}
            disabled={!isPerUnit && !selectedTier}
            className={cn(
              'w-full rounded-xl py-3 text-base font-semibold text-white transition-all',
              (isPerUnit || selectedTier)
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
    </Dialog>
  );
}
