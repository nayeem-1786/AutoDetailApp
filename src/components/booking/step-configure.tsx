'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import { Truck, Minus, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import type { BookableService } from '@/lib/data/booking';
import type { MobileZone, ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

export interface ConfigureResult {
  tier_name: string | null;
  price: number;
  size_class: VehicleSizeClass | null;
  is_mobile: boolean;
  mobile_zone_id: string | null;
  mobile_address: string;
  mobile_surcharge: number;
  addons: AddonSelection[];
  per_unit_quantity: number;
}

export interface AddonSelection {
  service_id: string;
  name: string;
  price: number;
  tier_name: string | null;
}

interface StepConfigureProps {
  service: BookableService;
  mobileZones: MobileZone[];
  initialConfig: Partial<ConfigureResult>;
  onContinue: (result: ConfigureResult) => void;
  onBack: () => void;
}

export function StepConfigure({
  service,
  mobileZones,
  initialConfig,
  onContinue,
  onBack,
}: StepConfigureProps) {
  const tiers = service.service_pricing;

  // State
  const [selectedTier, setSelectedTier] = useState<string | null>(
    initialConfig.tier_name ?? (tiers.length === 1 ? tiers[0].tier_name : null)
  );
  const [sizeClass, setSizeClass] = useState<VehicleSizeClass | null>(
    initialConfig.size_class ?? null
  );
  const [perUnitQty, setPerUnitQty] = useState(initialConfig.per_unit_quantity ?? 1);
  const [isMobile, setIsMobile] = useState(initialConfig.is_mobile ?? false);
  const [mobileZoneId, setMobileZoneId] = useState<string | null>(
    initialConfig.mobile_zone_id ?? null
  );
  const [mobileAddress, setMobileAddress] = useState(
    initialConfig.mobile_address ?? ''
  );
  const [selectedAddons, setSelectedAddons] = useState<AddonSelection[]>(
    initialConfig.addons ?? []
  );

  // For flat pricing, auto-advance is handled by checking on mount
  const isFlatPrice = service.pricing_model === 'flat';

  // Compute the current price
  const tier = tiers.find((t) => t.tier_name === selectedTier);
  const price = computePrice(service, tier, sizeClass, perUnitQty);

  // Mobile surcharge
  const zone = mobileZones.find((z) => z.id === mobileZoneId);
  const mobileSurcharge = isMobile && zone ? Number(zone.surcharge) : 0;

  // Can proceed?
  const tierReady =
    isFlatPrice ||
    service.pricing_model === 'per_unit' ||
    selectedTier !== null;
  const sizeReady = needsSizeClass(service, tier)
    ? sizeClass !== null
    : true;
  const mobileReady = !isMobile || (mobileAddress.trim().length > 0 && mobileZoneId !== null);
  const canContinue = tierReady && sizeReady && mobileReady && price > 0;

  function handleContinue() {
    if (!canContinue) return;
    onContinue({
      tier_name: selectedTier,
      price,
      size_class: sizeClass,
      is_mobile: isMobile,
      mobile_zone_id: isMobile ? mobileZoneId : null,
      mobile_address: isMobile ? mobileAddress : '',
      mobile_surcharge: mobileSurcharge,
      addons: selectedAddons,
      per_unit_quantity: perUnitQty,
    });
  }

  function toggleAddon(addon: AddonSelection) {
    setSelectedAddons((prev) => {
      const exists = prev.find((a) => a.service_id === addon.service_id);
      if (exists) {
        return prev.filter((a) => a.service_id !== addon.service_id);
      }
      return [...prev, addon];
    });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">
        Configure Your Service
      </h2>
      <p className="mt-1 text-sm text-gray-600">{service.name}</p>

      {/* Pricing selector based on model */}
      <div className="mt-6 space-y-6">
        <PricingSelector
          service={service}
          tiers={tiers}
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
          sizeClass={sizeClass}
          onSelectSize={setSizeClass}
          perUnitQty={perUnitQty}
          onSetQty={setPerUnitQty}
        />

        {/* Mobile toggle — hidden when no zones available (mobile_service flag off) */}
        {service.mobile_eligible && mobileZones.length > 0 && (
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Mobile Service
                  </p>
                  <p className="text-xs text-gray-500">
                    We come to your location
                  </p>
                </div>
              </div>
              <Switch checked={isMobile} onCheckedChange={setIsMobile} />
            </div>

            {isMobile && (
              <div className="mt-4 space-y-3">
                <FormField label="Service Address" required htmlFor="mobile-address">
                  <Input
                    id="mobile-address"
                    placeholder="123 Main St, City, CA 90000"
                    value={mobileAddress}
                    onChange={(e) => setMobileAddress(e.target.value)}
                  />
                </FormField>

                <FormField label="Zone" required htmlFor="mobile-zone">
                  <Select
                    id="mobile-zone"
                    value={mobileZoneId ?? ''}
                    onChange={(e) => setMobileZoneId(e.target.value || null)}
                  >
                    <option value="">Select zone...</option>
                    {mobileZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} (+{formatCurrency(Number(z.surcharge))})
                      </option>
                    ))}
                  </Select>
                </FormField>

                {zone && (
                  <p className="text-sm text-gray-600">
                    Mobile surcharge:{' '}
                    <span className="font-medium">
                      +{formatCurrency(Number(zone.surcharge))}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Addon suggestions */}
        {service.service_addon_suggestions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Enhance Your Service
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Add popular extras to your appointment.
            </p>
            <div className="mt-3 space-y-2">
              {service.service_addon_suggestions.map((suggestion) => {
                const addonSvc = suggestion.addon_service;
                if (!addonSvc) return null;

                const addonPrice =
                  suggestion.combo_price ??
                  addonSvc.flat_price ??
                  getAddonMinPrice(addonSvc);
                if (addonPrice == null) return null;

                const isSelected = selectedAddons.some(
                  (a) => a.service_id === addonSvc.id
                );

                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() =>
                      toggleAddon({
                        service_id: addonSvc.id,
                        name: addonSvc.name,
                        price: addonPrice,
                        tier_name: null,
                      })
                    }
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all',
                      isSelected
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {addonSvc.name}
                      </p>
                      {addonSvc.description && (
                        <p className="text-xs text-gray-500 line-clamp-1">
                          {addonSvc.description}
                        </p>
                      )}
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        +{formatCurrency(addonPrice)}
                      </span>
                      <div
                        className={cn(
                          'h-5 w-5 rounded border flex items-center justify-center transition-colors',
                          isSelected
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-300'
                        )}
                      >
                        {isSelected && (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Price summary */}
        <div className="rounded-lg bg-gray-50 p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{service.name}</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(price)}
              </span>
            </div>
            {selectedAddons.map((addon) => (
              <div key={addon.service_id} className="flex justify-between">
                <span className="text-gray-600">{addon.name}</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(addon.price)}
                </span>
              </div>
            ))}
            {mobileSurcharge > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Mobile surcharge</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(mobileSurcharge)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
              <span>Total</span>
              <span>
                {formatCurrency(
                  price +
                    selectedAddons.reduce((s, a) => s + a.price, 0) +
                    mobileSurcharge
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleContinue} disabled={!canContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PricingSelector: renders the right control for the pricing model
// ---------------------------------------------------------------------------

function PricingSelector({
  service,
  tiers,
  selectedTier,
  onSelectTier,
  sizeClass,
  onSelectSize,
  perUnitQty,
  onSetQty,
}: {
  service: BookableService;
  tiers: ServicePricing[];
  selectedTier: string | null;
  onSelectTier: (name: string) => void;
  sizeClass: VehicleSizeClass | null;
  onSelectSize: (sc: VehicleSizeClass) => void;
  perUnitQty: number;
  onSetQty: (q: number) => void;
}) {
  switch (service.pricing_model) {
    case 'flat':
      return (
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Flat Rate</p>
          <p className="text-2xl font-bold text-gray-900">
            {service.flat_price != null
              ? formatCurrency(service.flat_price)
              : '--'}
          </p>
        </div>
      );

    case 'vehicle_size':
      return (
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Select Vehicle Size
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {tiers.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                isSelected={selectedTier === tier.tier_name}
                onClick={() => onSelectTier(tier.tier_name)}
              />
            ))}
          </div>
        </div>
      );

    case 'scope':
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Select Option
            </h3>
            <div className="mt-2 grid gap-2">
              {tiers.map((tier) => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  isSelected={selectedTier === tier.tier_name}
                  onClick={() => onSelectTier(tier.tier_name)}
                  wide
                />
              ))}
            </div>
          </div>

          {/* Nested vehicle size for vehicle-size-aware scope tiers */}
          {selectedTier && (() => {
            const current = tiers.find((t) => t.tier_name === selectedTier);
            if (!current?.is_vehicle_size_aware) return null;
            return (
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  Select Vehicle Size
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(['sedan', 'truck_suv_2row', 'suv_3row_van'] as const).map((sc) => {
                    const p = getVehicleSizePrice(current, sc);
                    if (p == null) return null;
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => onSelectSize(sc)}
                        className={cn(
                          'rounded-lg border p-3 text-left transition-all',
                          sizeClass === sc
                            ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {VEHICLE_SIZE_LABELS[sc]}
                        </p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(p)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      );

    case 'specialty':
      return (
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Select Option
          </h3>
          <div className="mt-2 grid gap-2">
            {tiers.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                isSelected={selectedTier === tier.tier_name}
                onClick={() => onSelectTier(tier.tier_name)}
                wide
              />
            ))}
          </div>
        </div>
      );

    case 'per_unit':
      return (
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">
            {formatCurrency(service.per_unit_price ?? 0)} per{' '}
            {service.per_unit_label || 'unit'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSetQty(Math.max(1, perUnitQty - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-12 text-center text-lg font-semibold">
              {perUnitQty}
            </span>
            <button
              type="button"
              onClick={() =>
                onSetQty(
                  Math.min(
                    service.per_unit_max ?? 99,
                    perUnitQty + 1
                  )
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xl font-bold text-gray-900">
            {formatCurrency((service.per_unit_price ?? 0) * perUnitQty)}
          </p>
        </div>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// TierCard
// ---------------------------------------------------------------------------

function TierCard({
  tier,
  isSelected,
  onClick,
  wide,
}: {
  tier: ServicePricing;
  isSelected: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border p-3 text-left transition-all',
        isSelected
          ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
          : 'border-gray-200 hover:border-gray-300',
        wide && 'flex items-center justify-between'
      )}
    >
      <div>
        <p className="text-sm font-medium text-gray-900">
          {tier.tier_label ?? tier.tier_name}
        </p>
      </div>
      <p className={cn('font-bold text-gray-900', wide ? 'text-base' : 'mt-1 text-lg')}>
        {tier.is_vehicle_size_aware
          ? `From ${formatCurrency(Math.min(
              tier.vehicle_size_sedan_price ?? Infinity,
              tier.vehicle_size_truck_suv_price ?? Infinity,
              tier.vehicle_size_suv_van_price ?? Infinity
            ))}`
          : formatCurrency(tier.price)}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computePrice(
  service: BookableService,
  tier: ServicePricing | undefined,
  sizeClass: VehicleSizeClass | null,
  perUnitQty: number
): number {
  switch (service.pricing_model) {
    case 'flat':
      return service.flat_price ?? 0;

    case 'vehicle_size':
    case 'scope':
    case 'specialty':
      if (!tier) return 0;
      if (tier.is_vehicle_size_aware && sizeClass) {
        return getVehicleSizePrice(tier, sizeClass) ?? 0;
      }
      return tier.price;

    case 'per_unit':
      return (service.per_unit_price ?? 0) * perUnitQty;

    default:
      return 0;
  }
}

function getVehicleSizePrice(
  tier: ServicePricing,
  sc: VehicleSizeClass
): number | null {
  if (sc === 'sedan') return tier.vehicle_size_sedan_price;
  if (sc === 'truck_suv_2row') return tier.vehicle_size_truck_suv_price;
  if (sc === 'suv_3row_van') return tier.vehicle_size_suv_van_price;
  return null;
}

function needsSizeClass(
  service: BookableService,
  tier: ServicePricing | undefined
): boolean {
  if (service.pricing_model === 'scope' && tier?.is_vehicle_size_aware) {
    return true;
  }
  return false;
}

function getAddonMinPrice(
  addonSvc: BookableService['service_addon_suggestions'][number]['addon_service']
): number | null {
  if (addonSvc.flat_price != null) return addonSvc.flat_price;
  const tiers = addonSvc.service_pricing ?? [];
  if (tiers.length > 0) {
    let min = Infinity;
    for (const t of tiers) {
      if (t.price < min) min = t.price;
    }
    return min < Infinity ? min : null;
  }
  if (addonSvc.per_unit_price != null) return addonSvc.per_unit_price;
  return null;
}
