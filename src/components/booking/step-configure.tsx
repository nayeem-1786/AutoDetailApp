'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Truck, Minus, Plus, Check, Car, Bus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { getSaleStatus, getTierSaleInfo } from '@/lib/utils/sale-pricing';
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
  tier_label: string | null;
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

// Vehicle size icon mapping
const VEHICLE_SIZE_ICONS: Record<string, typeof Car> = {
  sedan: Car,
  truck_suv_2row: Truck,
  suv_3row_van: Bus,
};

export function StepConfigure({
  service,
  mobileZones,
  initialConfig,
  onContinue,
  onBack,
}: StepConfigureProps) {
  const tiers = service.service_pricing;

  // Sale status for this service
  const saleStatus = getSaleStatus({
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  });

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

  const isFlatPrice = service.pricing_model === 'flat';

  // Compute the current price
  const tier = tiers.find((t) => t.tier_name === selectedTier);
  const price = computePrice(service, tier, sizeClass, perUnitQty, saleStatus.isOnSale);

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

  // Total including addons and mobile
  const total = price + selectedAddons.reduce((s, a) => s + a.price, 0) + mobileSurcharge;

  function handleContinue() {
    if (!canContinue) return;
    const tierLabel = tier?.tier_label ?? null;
    onContinue({
      tier_name: selectedTier,
      tier_label: tierLabel,
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
      <h2 className="text-xl font-semibold text-site-text">
        Configure Your Detail
      </h2>
      <p className="mt-1 text-sm text-site-text-secondary">{service.name}</p>

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
          saleStatus={saleStatus}
        />

        {/* Mobile toggle */}
        {service.mobile_eligible && mobileZones.length > 0 && (
          <div className="rounded-lg border border-site-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-site-text-muted" />
                <div>
                  <p className="text-sm font-medium text-site-text">
                    Mobile Service
                  </p>
                  <p className="text-xs text-site-text-muted">
                    We come to your location
                  </p>
                </div>
              </div>
              <Switch checked={isMobile} onCheckedChange={setIsMobile} />
            </div>

            {isMobile && (
              <div className="mt-4 space-y-3">
                <FormField label="Service Address" required htmlFor="mobile-address" labelClassName="text-site-text-secondary dark:text-site-text-secondary">
                  <Input
                    id="mobile-address"
                    placeholder="123 Main St, City, CA 90000"
                    value={mobileAddress}
                    onChange={(e) => setMobileAddress(e.target.value)}
                    className="border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime dark:border-site-border dark:bg-brand-surface dark:text-site-text dark:placeholder:text-site-text-dim"
                  />
                </FormField>

                <FormField label="Zone" required htmlFor="mobile-zone" labelClassName="text-site-text-secondary dark:text-site-text-secondary">
                  <Select
                    id="mobile-zone"
                    value={mobileZoneId ?? ''}
                    onChange={(e) => setMobileZoneId(e.target.value || null)}
                    className="border-site-border bg-brand-surface text-site-text focus-visible:ring-lime dark:border-site-border dark:bg-brand-surface dark:text-site-text"
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
                  <p className="text-sm text-site-text-secondary">
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
            <h3 className="text-sm font-semibold text-site-text">
              Add-ons <span className="font-normal text-site-text-muted">(optional)</span>
            </h3>
            <p className="mt-1 text-xs text-site-text-muted">
              Enhance your service with popular extras.
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
                        ? 'border-lime bg-lime/5'
                        : 'border-site-border hover:border-site-border-medium'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-site-text">
                        {addonSvc.name}
                      </p>
                      {addonSvc.description && (
                        <p className="text-xs text-site-text-muted line-clamp-1">
                          {addonSvc.description}
                        </p>
                      )}
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      <span className="text-sm font-medium text-site-text whitespace-nowrap">
                        +{formatCurrency(addonPrice)}
                      </span>
                      <div
                        className={cn(
                          'h-5 w-5 rounded border flex items-center justify-center transition-colors flex-shrink-0',
                          isSelected
                            ? 'border-lime bg-lime text-site-text-on-primary'
                            : 'border-site-border'
                        )}
                      >
                        {isSelected && (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Price summary — sticky on mobile */}
        <div className="rounded-lg bg-brand-surface p-4 sm:relative fixed bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-auto z-10 sm:z-auto sm:rounded-lg rounded-none border-t border-site-border sm:border-t-0">
          <div className="space-y-1 text-sm max-w-3xl mx-auto">
            <div className="flex justify-between">
              <span className="text-site-text-secondary">{service.name}</span>
              <span className="font-medium text-site-text">
                {formatCurrency(price)}
              </span>
            </div>
            {selectedAddons.map((addon) => (
              <div key={addon.service_id} className="flex justify-between">
                <span className="text-site-text-secondary">{addon.name}</span>
                <span className="font-medium text-site-text">
                  {formatCurrency(addon.price)}
                </span>
              </div>
            ))}
            {mobileSurcharge > 0 && (
              <div className="flex justify-between">
                <span className="text-site-text-secondary">Mobile surcharge</span>
                <span className="font-medium text-site-text">
                  {formatCurrency(mobileSurcharge)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-site-border pt-2 text-base font-semibold">
              <span className="text-site-text">Total</span>
              <span className="text-site-text">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Spacer on mobile to avoid content hidden behind sticky summary */}
        <div className="h-24 sm:hidden" />

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface">
            Back
          </Button>
          <Button onClick={handleContinue} disabled={!canContinue} className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200">
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

interface SaleStatusInfo {
  isOnSale: boolean;
}

function PricingSelector({
  service,
  tiers,
  selectedTier,
  onSelectTier,
  sizeClass,
  onSelectSize,
  perUnitQty,
  onSetQty,
  saleStatus,
}: {
  service: BookableService;
  tiers: ServicePricing[];
  selectedTier: string | null;
  onSelectTier: (name: string) => void;
  sizeClass: VehicleSizeClass | null;
  onSelectSize: (sc: VehicleSizeClass) => void;
  perUnitQty: number;
  onSetQty: (q: number) => void;
  saleStatus: SaleStatusInfo;
}) {
  switch (service.pricing_model) {
    case 'flat':
      return (
        <div className="rounded-lg border border-site-border p-4">
          <p className="text-sm text-site-text-secondary">Flat Rate</p>
          <p className="text-2xl font-bold text-site-text">
            {service.flat_price != null
              ? formatCurrency(service.flat_price)
              : '--'}
          </p>
        </div>
      );

    case 'vehicle_size':
      return (
        <div>
          <h3 className="text-sm font-semibold text-site-text-secondary">
            Vehicle Size
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {tiers.map((tier) => {
              const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, saleStatus.isOnSale);
              const SizeIcon = VEHICLE_SIZE_ICONS[tier.tier_name] ?? Car;
              const isSelected = selectedTier === tier.tier_name;

              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => onSelectTier(tier.tier_name)}
                  className={cn(
                    'flex flex-col items-center rounded-lg border p-4 transition-all',
                    isSelected
                      ? 'border-lime bg-lime/5 ring-1 ring-lime'
                      : 'border-site-border hover:border-lime/50'
                  )}
                >
                  <SizeIcon className={cn('h-8 w-8 mb-2', isSelected ? 'text-lime' : 'text-site-text-muted')} />
                  <p className="text-sm font-medium text-site-text">
                    {tier.tier_label ?? VEHICLE_SIZE_LABELS[tier.tier_name] ?? tier.tier_name}
                  </p>
                  {saleInfo?.isDiscounted ? (
                    <div className="mt-1 text-center">
                      <p className="text-sm text-site-text-muted line-through">
                        {formatCurrency(saleInfo.originalPrice)}
                      </p>
                      <p className="text-lg font-bold text-lime">
                        {formatCurrency(saleInfo.currentPrice)}
                      </p>
                      <p className="text-xs text-lime">
                        Save {formatCurrency(saleInfo.savings)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-lg font-bold text-site-text">
                      {formatCurrency(saleInfo?.currentPrice ?? tier.price)}
                    </p>
                  )}
                  {isSelected && (
                    <div className="mt-2 flex h-5 w-5 items-center justify-center rounded-full bg-lime text-site-text-on-primary">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );

    case 'scope':
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-site-text-secondary">
              Select Option
            </h3>
            <div className="mt-2 grid gap-2">
              {tiers.map((tier) => {
                const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, saleStatus.isOnSale);
                return (
                  <ScopeTierCard
                    key={tier.id}
                    tier={tier}
                    saleInfo={saleInfo}
                    isSelected={selectedTier === tier.tier_name}
                    onClick={() => onSelectTier(tier.tier_name)}
                  />
                );
              })}
            </div>
          </div>

          {/* Nested vehicle size for vehicle-size-aware scope tiers */}
          {selectedTier && (() => {
            const current = tiers.find((t) => t.tier_name === selectedTier);
            if (!current?.is_vehicle_size_aware) return null;
            return (
              <div>
                <h3 className="text-sm font-semibold text-site-text-secondary">
                  Vehicle Size
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(['sedan', 'truck_suv_2row', 'suv_3row_van'] as const).map((sc) => {
                    const p = getVehicleSizePrice(current, sc);
                    if (p == null) return null;
                    const SizeIcon = VEHICLE_SIZE_ICONS[sc] ?? Car;
                    const isSelected = sizeClass === sc;
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => onSelectSize(sc)}
                        className={cn(
                          'flex flex-col items-center rounded-lg border p-4 transition-all',
                          isSelected
                            ? 'border-lime bg-lime/5 ring-1 ring-lime'
                            : 'border-site-border hover:border-lime/50'
                        )}
                      >
                        <SizeIcon className={cn('h-8 w-8 mb-2', isSelected ? 'text-lime' : 'text-site-text-muted')} />
                        <p className="text-sm font-medium text-site-text">
                          {VEHICLE_SIZE_LABELS[sc]}
                        </p>
                        <p className="mt-1 text-lg font-bold text-site-text">
                          {formatCurrency(p)}
                        </p>
                        {isSelected && (
                          <div className="mt-2 flex h-5 w-5 items-center justify-center rounded-full bg-lime text-site-text-on-primary">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </div>
                        )}
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
          <h3 className="text-sm font-semibold text-site-text-secondary">
            Select Option
          </h3>
          <div className="mt-2 grid gap-2">
            {tiers.map((tier) => {
              const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, saleStatus.isOnSale);
              return (
                <ScopeTierCard
                  key={tier.id}
                  tier={tier}
                  saleInfo={saleInfo}
                  isSelected={selectedTier === tier.tier_name}
                  onClick={() => onSelectTier(tier.tier_name)}
                />
              );
            })}
          </div>
        </div>
      );

    case 'per_unit':
      return (
        <div className="rounded-lg border border-site-border p-4">
          <p className="text-sm text-site-text-secondary">
            {formatCurrency(service.per_unit_price ?? 0)} per{' '}
            {service.per_unit_label || 'unit'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSetQty(Math.max(1, perUnitQty - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-site-border hover:bg-brand-surface"
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
              className="flex h-9 w-9 items-center justify-center rounded-md border border-site-border hover:bg-brand-surface"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xl font-bold text-site-text">
            {formatCurrency((service.per_unit_price ?? 0) * perUnitQty)}
          </p>
        </div>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// ScopeTierCard — full-width tier card for scope/specialty pricing
// ---------------------------------------------------------------------------

import type { TierSaleInfo } from '@/lib/utils/sale-pricing';

function ScopeTierCard({
  tier,
  saleInfo,
  isSelected,
  onClick,
}: {
  tier: ServicePricing;
  saleInfo: TierSaleInfo | null;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-lg border p-3 text-left transition-all',
        isSelected
          ? 'border-lime bg-lime/5 ring-1 ring-lime'
          : 'border-site-border hover:border-lime/50'
      )}
    >
      <div className="flex items-center gap-2">
        {isSelected && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-lime text-site-text-on-primary flex-shrink-0">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </div>
        )}
        <p className="text-sm font-medium text-site-text">
          {tier.tier_label ?? tier.tier_name}
        </p>
      </div>
      <div className="text-right">
        {saleInfo?.isDiscounted ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-site-text-muted line-through">
              {formatCurrency(saleInfo.originalPrice)}
            </span>
            <span className="text-base font-bold text-lime">
              {formatCurrency(saleInfo.currentPrice)}
            </span>
          </div>
        ) : (
          <span className="text-base font-bold text-site-text">
            {tier.is_vehicle_size_aware
              ? `From ${formatCurrency(Math.min(
                  tier.vehicle_size_sedan_price ?? Infinity,
                  tier.vehicle_size_truck_suv_price ?? Infinity,
                  tier.vehicle_size_suv_van_price ?? Infinity
                ))}`
              : formatCurrency(saleInfo?.currentPrice ?? tier.price)}
          </span>
        )}
      </div>
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
  perUnitQty: number,
  isOnSale: boolean
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
      // Apply sale price if active
      if (isOnSale && tier.sale_price !== null && tier.sale_price < tier.price) {
        return tier.sale_price;
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
