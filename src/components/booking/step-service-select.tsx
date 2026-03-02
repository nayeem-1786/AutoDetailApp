'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  Clock, Truck, Check, Car, Sparkles, Shield, Paintbrush,
  Bike, Ship, Plane, Bus, Minus, Plus, X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { getSaleStatus, getTierSaleInfo, type TierSaleInfo } from '@/lib/utils/sale-pricing';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import type { BookableCategory, BookableService } from '@/lib/data/booking';
import type { MobileZone, ServicePricing, VehicleSizeClass, VehicleCategoryRecord } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Exported types (used by booking-wizard.tsx)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_FALLBACK_ICONS: Record<string, typeof Car> = {
  automobile: Car,
  motorcycle: Bike,
  rv: Truck,
  boat: Ship,
  aircraft: Plane,
};

const VEHICLE_SIZE_ICONS: Record<string, typeof Car> = {
  sedan: Car,
  truck_suv_2row: Truck,
  suv_3row_van: Bus,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepServiceSelectProps {
  categories: BookableCategory[];
  selectedServiceId: string | null;
  onSelect: (service: BookableService, config: ConfigureResult) => void;
  vehicleCategories?: VehicleCategoryRecord[];
  selectedCategoryKey?: string;
  onCategoryChange?: (key: string) => void;
  mobileZones: MobileZone[];
  initialConfig?: Partial<ConfigureResult>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StepServiceSelect({
  categories,
  selectedServiceId,
  onSelect,
  vehicleCategories = [],
  selectedCategoryKey = 'automobile',
  onCategoryChange,
  mobileZones,
  initialConfig,
}: StepServiceSelectProps) {
  // Helper to find a service by ID across all categories
  function findService(id: string | null): BookableService | null {
    if (!id) return null;
    for (const cat of categories) {
      const svc = cat.services.find((s) => s.id === id);
      if (svc) return svc;
    }
    return null;
  }

  // --- Service category tab state ---
  const [activeCategory, setActiveCategory] = useState(() => {
    if (selectedServiceId) {
      const cat = categories.find((c) =>
        c.services.some((s) => s.id === selectedServiceId)
      );
      if (cat) return cat.category.id;
    }
    return categories[0]?.category.id ?? '';
  });

  // Reset active tab when filtered categories change (e.g. vehicle category switch)
  useEffect(() => {
    const hasActive = categories.some((c) => c.category.id === activeCategory);
    if (!hasActive && categories.length > 0) {
      setActiveCategory(categories[0].category.id);
    }
  }, [categories, activeCategory]);

  // --- Selected service state ---
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(selectedServiceId);
  const selectedService = findService(pendingServiceId);

  // --- Configure state ---
  const [selectedTier, setSelectedTier] = useState<string | null>(() => {
    if (initialConfig?.tier_name) return initialConfig.tier_name;
    if (selectedServiceId) {
      const svc = findService(selectedServiceId);
      const tiers = svc?.service_pricing ?? [];
      return tiers.length === 1 ? tiers[0].tier_name : null;
    }
    return null;
  });
  const [sizeClass, setSizeClass] = useState<VehicleSizeClass | null>(
    initialConfig?.size_class ?? null
  );
  const [perUnitQty, setPerUnitQty] = useState(initialConfig?.per_unit_quantity ?? 1);
  const [showMobileFields, setShowMobileFields] = useState(initialConfig?.is_mobile ?? false);
  const [mobileZoneId, setMobileZoneId] = useState<string | null>(
    initialConfig?.mobile_zone_id ?? null
  );
  const [mobileAddress, setMobileAddress] = useState(initialConfig?.mobile_address ?? '');
  const [selectedAddons, setSelectedAddons] = useState<AddonSelection[]>(
    initialConfig?.addons ?? []
  );
  const [showAllAddons, setShowAllAddons] = useState(false);
  const [showVehicleSheet, setShowVehicleSheet] = useState(false);

  // --- Derived values ---
  const tiers = selectedService?.service_pricing ?? [];
  const tier = tiers.find((t) => t.tier_name === selectedTier);
  const saleStatus = selectedService
    ? getSaleStatus({
        sale_starts_at: selectedService.sale_starts_at,
        sale_ends_at: selectedService.sale_ends_at,
      })
    : { isOnSale: false };
  const isFlatPrice = selectedService?.pricing_model === 'flat';
  const price = selectedService
    ? computePrice(selectedService, tier, sizeClass, perUnitQty, saleStatus.isOnSale)
    : 0;

  const zone = mobileZones.find((z) => z.id === mobileZoneId);
  const mobileSurcharge = showMobileFields && zone ? Number(zone.surcharge) : 0;
  const addonTotal = selectedAddons.reduce((s, a) => s + a.price, 0);
  const total = price + addonTotal + mobileSurcharge;

  // Can continue?
  const tierReady =
    !selectedService ||
    isFlatPrice ||
    selectedService.pricing_model === 'per_unit' ||
    selectedTier !== null;
  const sizeReady = selectedService && needsSizeClass(selectedService, tier)
    ? sizeClass !== null
    : true;
  const mobileReady = !showMobileFields || (mobileAddress.trim().length > 0 && mobileZoneId !== null);
  const canContinue = !!pendingServiceId && tierReady && sizeReady && mobileReady && price > 0;

  // --- Handlers ---
  function handleCardClick(service: BookableService) {
    if (pendingServiceId === service.id) {
      // Deselect
      setPendingServiceId(null);
      return;
    }

    // Select new service — reset configure state
    setPendingServiceId(service.id);
    const newTiers = service.service_pricing;
    setSelectedTier(newTiers.length === 1 ? newTiers[0].tier_name : null);
    setSizeClass(null);
    setPerUnitQty(1);
    setShowMobileFields(false);
    setMobileZoneId(null);
    setMobileAddress('');
    setSelectedAddons([]);
    setShowAllAddons(false);

    // Switch to the tab containing this service
    const cat = categories.find((c) => c.services.some((s) => s.id === service.id));
    if (cat && cat.category.id !== activeCategory) {
      setActiveCategory(cat.category.id);
    }
  }

  function handleContinue() {
    if (!selectedService || !canContinue) return;
    const tierLabel = tier?.tier_label ?? null;
    onSelect(selectedService, {
      tier_name: selectedTier,
      tier_label: tierLabel,
      price,
      size_class: sizeClass,
      is_mobile: showMobileFields,
      mobile_zone_id: showMobileFields ? mobileZoneId : null,
      mobile_address: showMobileFields ? mobileAddress : '',
      mobile_surcharge: mobileSurcharge,
      addons: selectedAddons,
      per_unit_quantity: perUnitQty,
    });
  }

  function toggleAddon(addon: AddonSelection) {
    setSelectedAddons((prev) => {
      const exists = prev.find((a) => a.service_id === addon.service_id);
      if (exists) return prev.filter((a) => a.service_id !== addon.service_id);
      return [...prev, addon];
    });
  }

  // --- Configure panel render function ---
  // Rendered inside mobile accordion AND desktop sidebar (CSS-toggled)
  function renderConfigurePanel() {
    if (!selectedService) return null;
    const addonSuggestions = selectedService.service_addon_suggestions;
    const visibleAddons = showAllAddons ? addonSuggestions : addonSuggestions.slice(0, 3);
    const hiddenCount = addonSuggestions.length - 3;

    return (
      <div className="space-y-6">
        {/* Pricing selector */}
        <PricingSelector
          service={selectedService}
          tiers={tiers}
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
          sizeClass={sizeClass}
          onSelectSize={setSizeClass}
          perUnitQty={perUnitQty}
          onSetQty={setPerUnitQty}
          saleStatus={saleStatus}
        />

        {/* Add-ons */}
        {addonSuggestions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-accent-brand">
              Choose Add-ons <span className="font-normal text-site-text-muted">(optional)</span>
            </h3>
            <div className="mt-2 space-y-2">
              {visibleAddons.map((suggestion) => {
                const addonSvc = suggestion.addon_service;
                if (!addonSvc) return null;

                const standalonePrice = addonSvc.flat_price ?? getAddonMinPrice(addonSvc);
                if (standalonePrice == null) return null;

                const comboPrice = suggestion.combo_price;
                const addonPrice = comboPrice ?? standalonePrice;
                const hasDiscount = comboPrice != null && comboPrice < standalonePrice;
                const savings = hasDiscount ? standalonePrice - comboPrice : 0;
                const isSelected = selectedAddons.some((a) => a.service_id === addonSvc.id);

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
                        ? 'border-accent-brand bg-accent-brand/5'
                        : 'border-site-border hover:border-site-border-medium'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-site-text">{addonSvc.name}</p>
                      {addonSvc.description && (
                        <p className="text-xs text-site-text-muted line-clamp-1">
                          {addonSvc.description}
                        </p>
                      )}
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      {hasDiscount ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-site-text-muted line-through">
                              {formatCurrency(standalonePrice)}
                            </span>
                            <span className="text-sm font-semibold text-accent-brand whitespace-nowrap">
                              +{formatCurrency(addonPrice)}
                            </span>
                          </div>
                          <span className="text-[10px] font-medium text-accent-brand/80">
                            Save {formatCurrency(savings)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-site-text whitespace-nowrap">
                          +{formatCurrency(addonPrice)}
                        </span>
                      )}
                      <div
                        className={cn(
                          'h-5 w-5 rounded border flex items-center justify-center transition-colors flex-shrink-0',
                          isSelected
                            ? 'border-accent-brand bg-accent-brand text-site-text-on-primary'
                            : 'border-site-border'
                        )}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Show more addons link */}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllAddons(!showAllAddons)}
                className="mt-2 text-sm text-accent-brand hover:text-accent-brand-hover font-medium"
              >
                {showAllAddons
                  ? 'Show fewer add-ons'
                  : `Show ${hiddenCount} more add-on${hiddenCount > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}

        {/* Mobile service link */}
        {selectedService.mobile_eligible && mobileZones.length > 0 && (
          <div>
            {!showMobileFields ? (
              <p className="text-sm text-site-text-muted">
                Need us to come to you?{' '}
                <button
                  type="button"
                  onClick={() => setShowMobileFields(true)}
                  className="text-accent-brand hover:text-accent-brand-hover font-medium"
                >
                  Add mobile service &rarr;
                </button>
              </p>
            ) : (
              <div className="rounded-lg border border-site-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-accent-brand" />
                  <p className="text-sm font-medium text-site-text">Mobile Service</p>
                </div>

                <FormField label="Service Address" required htmlFor="mobile-address-field" labelClassName="text-site-text-secondary dark:text-site-text-secondary">
                  <Input
                    id="mobile-address-field"
                    placeholder="123 Main St, City, CA 90000"
                    value={mobileAddress}
                    onChange={(e) => setMobileAddress(e.target.value)}
                    className="border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-accent-ui dark:border-site-border dark:bg-brand-surface dark:text-site-text dark:placeholder:text-site-text-dim"
                  />
                </FormField>

                <FormField label="Zone" required htmlFor="mobile-zone-field" labelClassName="text-site-text-secondary dark:text-site-text-secondary">
                  <Select
                    id="mobile-zone-field"
                    value={mobileZoneId ?? ''}
                    onChange={(e) => setMobileZoneId(e.target.value || null)}
                    className="border-site-border bg-brand-surface text-site-text focus-visible:ring-accent-ui dark:border-site-border dark:bg-brand-surface dark:text-site-text"
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
                    <span className="font-medium">+{formatCurrency(Number(zone.surcharge))}</span>
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileFields(false);
                    setMobileZoneId(null);
                    setMobileAddress('');
                  }}
                  className="text-sm text-site-text-muted hover:text-red-400 font-medium"
                >
                  Remove mobile service
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Price summary render function ---
  function renderPriceSummary(compact = false) {
    if (!selectedService || price <= 0) return null;

    if (compact) {
      return (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-site-text-muted">Total</p>
            <p className="text-lg font-bold text-site-text">{formatCurrency(total)}</p>
          </div>
          <Button
            onClick={handleContinue}
            disabled={!canContinue}
            className="bg-accent-brand text-site-text-on-primary hover:bg-accent-brand-hover dark:bg-accent-brand dark:text-site-text-on-primary dark:hover:bg-accent-brand-hover"
          >
            Continue
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-site-text-secondary">{selectedService.name}</span>
          <span className="font-medium text-site-text">{formatCurrency(price)}</span>
        </div>
        {selectedAddons.map((addon) => {
          const suggestion = selectedService.service_addon_suggestions.find(
            (s) => s.addon_service?.id === addon.service_id
          );
          const originalPrice = suggestion?.addon_service
            ? (suggestion.addon_service.flat_price ?? getAddonMinPrice(suggestion.addon_service))
            : null;
          const showSavings = originalPrice != null && addon.price < originalPrice;

          return (
            <div key={addon.service_id} className="flex justify-between">
              <span className="text-site-text-secondary">
                {addon.name}
                {showSavings && (
                  <span className="ml-1 text-xs text-accent-brand/80">
                    (save {formatCurrency(originalPrice - addon.price)})
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                {showSavings && (
                  <span className="text-xs text-site-text-muted line-through">
                    {formatCurrency(originalPrice)}
                  </span>
                )}
                <span className="font-medium text-site-text">{formatCurrency(addon.price)}</span>
              </div>
            </div>
          );
        })}
        {mobileSurcharge > 0 && (
          <div className="flex justify-between">
            <span className="text-site-text-secondary">Mobile surcharge</span>
            <span className="font-medium text-site-text">{formatCurrency(mobileSurcharge)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-site-border pt-2 text-base font-semibold">
          <span className="text-site-text">Total</span>
          <span className="text-site-text">{formatCurrency(total)}</span>
        </div>
      </div>
    );
  }

  // --- Render ---
  return (
    <div>
      {/* Vehicle Category Link + Sheet */}
      {vehicleCategories.length > 1 && onCategoryChange && (
        <div className="mb-6">
          {selectedCategoryKey !== 'automobile' ? (
            <p className="text-sm text-site-text-muted">
              Vehicle type:{' '}
              <span className="font-medium text-site-text">
                {vehicleCategories.find((vc) => vc.key === selectedCategoryKey)?.display_name ?? selectedCategoryKey}
              </span>
              {' '}
              <button
                type="button"
                onClick={() => setShowVehicleSheet(true)}
                className="text-accent-brand hover:text-accent-brand-hover font-medium"
              >
                Change
              </button>
            </p>
          ) : (
            <p className="text-sm text-site-text-muted">
              Detailing a motorcycle, RV, boat, or aircraft?{' '}
              <button
                type="button"
                onClick={() => setShowVehicleSheet(true)}
                className="text-accent-brand hover:text-accent-brand-hover font-medium"
              >
                Change vehicle type
              </button>
            </p>
          )}
        </div>
      )}

      {/* Two-column layout */}
      <div className="lg:grid lg:grid-cols-[1fr_400px] lg:gap-8">
        {/* Left column: Service list */}
        <div>
          <h2 className="text-xl font-semibold text-site-text">Choose Your Detail</h2>
          <p className="mt-1 text-sm text-site-text-secondary">
            Select a service and customize your options.
          </p>

          {categories.length === 0 ? (
            <div className="mt-6 rounded-lg border border-site-border bg-brand-surface p-8 text-center">
              <p className="text-sm text-site-text-muted">
                No services are available for this vehicle type yet. Please try a different category.
              </p>
            </div>
          ) : (
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mt-6">
              <TabsList className="flex-wrap bg-brand-surface dark:bg-brand-surface">
                {categories.map((cat) => (
                  <TabsTrigger
                    key={cat.category.id}
                    value={cat.category.id}
                    className="data-[state=active]:bg-brand-grey data-[state=active]:text-site-text data-[state=active]:shadow-none text-site-text-muted hover:text-site-text dark:data-[state=active]:bg-brand-grey dark:data-[state=active]:text-site-text dark:text-site-text-muted dark:hover:text-site-text"
                  >
                    {cat.category.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map((cat) => (
                <TabsContent key={cat.category.id} value={cat.category.id}>
                  <div className="space-y-3">
                    {cat.services.map((service) => (
                      <div key={service.id}>
                        <ServiceCard
                          service={service}
                          categoryName={cat.category.name}
                          isSelected={service.id === pendingServiceId}
                          onClick={() => handleCardClick(service)}
                        />
                        {/* Mobile accordion: configure panel inline below selected card */}
                        {pendingServiceId === service.id && (
                          <div className="lg:hidden mt-2 rounded-lg border border-accent-brand/20 bg-brand-surface p-4">
                            {renderConfigurePanel()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}

          {/* Mobile spacer for sticky footer */}
          {pendingServiceId && price > 0 && <div className="h-24 lg:hidden" />}
        </div>

        {/* Right column: Desktop sidebar */}
        <div className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            {selectedService ? (
              <>
                <div className="booking-summary-dark rounded-lg border border-site-border bg-brand-surface p-5">
                  <h3 className="text-base font-semibold text-site-text mb-4">
                    {selectedService.name}
                  </h3>
                  {renderConfigurePanel()}
                </div>

                {price > 0 && (
                  <div className="booking-summary-dark rounded-lg bg-brand-surface p-4">
                    {renderPriceSummary()}
                  </div>
                )}

                <Button
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="w-full bg-accent-brand text-site-text-on-primary hover:bg-accent-brand-hover dark:bg-accent-brand dark:text-site-text-on-primary dark:hover:bg-accent-brand-hover"
                >
                  Continue
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-site-border p-8 text-center">
                <p className="text-sm text-site-text-muted">
                  Select a service to see pricing and options
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sticky footer */}
      {pendingServiceId && selectedService && price > 0 && (
        <div className="booking-summary-dark lg:hidden fixed bottom-0 left-0 right-0 z-10 border-t border-site-border bg-brand-surface px-4 py-3">
          <div className="max-w-3xl mx-auto">
            {renderPriceSummary(true)}
          </div>
        </div>
      )}

      {/* Vehicle category bottom sheet */}
      {showVehicleSheet && (
        <VehicleCategorySheet
          vehicleCategories={vehicleCategories}
          selectedKey={selectedCategoryKey}
          onSelect={(key) => {
            onCategoryChange?.(key);
            setShowVehicleSheet(false);
          }}
          onClose={() => setShowVehicleSheet(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VehicleCategorySheet — bottom sheet on mobile, centered dialog on desktop
// ---------------------------------------------------------------------------

function VehicleCategorySheet({
  vehicleCategories,
  selectedKey,
  onSelect,
  onClose,
}: {
  vehicleCategories: VehicleCategoryRecord[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      {/* Sheet — bottom on mobile, centered on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-brand-surface p-6 shadow-lg lg:inset-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:max-w-md lg:w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-site-text">Vehicle Type</h3>
          <button type="button" onClick={onClose} className="text-site-text-muted hover:text-site-text">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {vehicleCategories.map((vc) => {
            const isActive = selectedKey === vc.key;
            const FallbackIcon = CATEGORY_FALLBACK_ICONS[vc.key] ?? Car;

            return (
              <button
                key={vc.id}
                type="button"
                onClick={() => onSelect(vc.key)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all',
                  isActive
                    ? 'border-accent-brand bg-accent-brand/10 ring-1 ring-accent-brand'
                    : 'border-site-border hover:border-accent-ui/50'
                )}
              >
                {vc.image_url ? (
                  <img
                    src={vc.image_url}
                    alt={vc.image_alt || vc.display_name}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  <FallbackIcon className={cn('h-8 w-8', isActive ? 'text-accent-brand' : 'text-site-text-muted')} />
                )}
                <span className={cn('text-sm font-medium', isActive ? 'text-accent-brand' : 'text-site-text')}>
                  {vc.display_name}
                </span>
                {isActive && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-brand text-site-text-on-primary">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ServiceCard — horizontal layout with thumbnail
// ---------------------------------------------------------------------------

function ServiceCard({
  service,
  categoryName,
  isSelected,
  onClick,
}: {
  service: BookableService;
  categoryName: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { priceLabel, originalPrice, isOnSale } = getServicePriceDisplay(service);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-lg border p-3 sm:p-4 text-left transition-all',
        isSelected
          ? 'border-accent-brand bg-accent-brand/5 ring-1 ring-accent-brand'
          : 'border-site-border hover:border-accent-ui/50 hover:shadow-sm',
      )}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0">
        {service.image_url ? (
          <img
            src={service.image_url}
            alt={service.image_alt || service.name}
            className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover"
          />
        ) : (
          <ServiceFallbackIcon categoryName={categoryName} serviceName={service.name} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm sm:text-base font-semibold text-site-text">
            {service.name}
          </h3>
          {isSelected && (
            <div className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-accent-brand text-site-text-on-primary">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </div>
          )}
        </div>

        {service.description && (
          <p className="mt-0.5 text-xs sm:text-sm text-site-text-muted line-clamp-1 sm:line-clamp-2">
            {service.description}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-site-text-muted">
          {/* Price */}
          {priceLabel && (
            <span className="font-medium text-site-text">
              {isOnSale && originalPrice && (
                <>
                  <span className="line-through text-site-text-muted font-normal mr-1">
                    {originalPrice}
                  </span>
                  <span className="inline-flex items-center rounded bg-accent-brand/20 px-1 py-0.5 text-[10px] font-semibold text-accent-brand uppercase mr-1">
                    Sale
                  </span>
                </>
              )}
              {priceLabel}
            </span>
          )}

          {/* Duration */}
          {service.base_duration_minutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(service.base_duration_minutes)}
            </span>
          )}

          {/* Mobile */}
          {service.mobile_eligible && (
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              Mobile
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ServiceFallbackIcon — fallback when no service image
// ---------------------------------------------------------------------------

function ServiceFallbackIcon({ categoryName, serviceName }: { categoryName: string; serviceName: string }) {
  const lowerCat = categoryName.toLowerCase();
  const lowerName = serviceName.toLowerCase();

  let Icon = Sparkles;
  let bgClass = 'bg-purple-600';

  if (lowerCat.includes('exterior') || lowerName.includes('wash') || lowerName.includes('exterior')) {
    Icon = Car;
    bgClass = 'bg-blue-600';
  } else if (lowerCat.includes('ceramic') || lowerCat.includes('coating') || lowerName.includes('ceramic') || lowerName.includes('coating') || lowerCat.includes('full') || lowerName.includes('detail')) {
    Icon = Shield;
    bgClass = 'bg-lime-600';
  } else if (lowerCat.includes('paint') || lowerName.includes('paint') || lowerName.includes('correction') || lowerCat.includes('special')) {
    Icon = Paintbrush;
    bgClass = 'bg-amber-600';
  }

  return (
    <div className={`flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-lg ${bgClass}`}>
      <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PricingSelector — renders the right control for the pricing model
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
          <h3 className="text-sm font-semibold text-accent-brand">
            Choose Vehicle Size
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
                      ? 'border-accent-brand bg-accent-brand/5 ring-1 ring-accent-brand'
                      : 'border-site-border hover:border-accent-ui/50'
                  )}
                >
                  <SizeIcon className={cn('h-8 w-8 mb-2', isSelected ? 'text-accent-brand' : 'text-site-text-muted')} />
                  <p className="text-sm font-medium text-site-text">
                    {tier.tier_label ?? VEHICLE_SIZE_LABELS[tier.tier_name] ?? tier.tier_name}
                  </p>
                  {saleInfo?.isDiscounted ? (
                    <div className="mt-1 text-center">
                      <p className="text-sm text-site-text-muted line-through">
                        {formatCurrency(saleInfo.originalPrice)}
                      </p>
                      <p className="text-lg font-bold text-accent-brand">
                        {formatCurrency(saleInfo.currentPrice)}
                      </p>
                      <p className="text-xs text-accent-brand">
                        Save {formatCurrency(saleInfo.savings)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-lg font-bold text-site-text">
                      {formatCurrency(saleInfo?.currentPrice ?? tier.price)}
                    </p>
                  )}
                  {isSelected && (
                    <div className="mt-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-brand text-site-text-on-primary">
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
                <h3 className="text-sm font-semibold text-accent-brand">
                  Choose Vehicle Size
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
                            ? 'border-accent-brand bg-accent-brand/5 ring-1 ring-accent-brand'
                            : 'border-site-border hover:border-accent-ui/50'
                        )}
                      >
                        <SizeIcon className={cn('h-8 w-8 mb-2', isSelected ? 'text-accent-brand' : 'text-site-text-muted')} />
                        <p className="text-sm font-medium text-site-text">
                          {VEHICLE_SIZE_LABELS[sc]}
                        </p>
                        <p className="mt-1 text-lg font-bold text-site-text">
                          {formatCurrency(p)}
                        </p>
                        {isSelected && (
                          <div className="mt-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-brand text-site-text-on-primary">
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
          ? 'border-accent-brand bg-accent-brand/5 ring-1 ring-accent-brand'
          : 'border-site-border hover:border-accent-ui/50'
      )}
    >
      <div className="flex items-center gap-2">
        {isSelected && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-brand text-site-text-on-primary flex-shrink-0">
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
            <span className="text-base font-bold text-accent-brand">
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

// ---------------------------------------------------------------------------
// Price display helpers (for service cards)
// ---------------------------------------------------------------------------

function getServicePriceDisplay(service: BookableService): {
  priceLabel: string | null;
  originalPrice: string | null;
  isOnSale: boolean;
} {
  const saleStatus = getSaleStatus({
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  });

  switch (service.pricing_model) {
    case 'flat': {
      if (service.flat_price == null) return { priceLabel: null, originalPrice: null, isOnSale: false };
      return { priceLabel: formatCurrency(service.flat_price), originalPrice: null, isOnSale: false };
    }

    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      const tiers = service.service_pricing;
      if (tiers.length === 0) return { priceLabel: null, originalPrice: null, isOnSale: false };

      let minCurrent = Infinity;
      let minOriginal = Infinity;
      let hasDiscount = false;

      for (const tier of tiers) {
        if (tier.is_vehicle_size_aware) {
          const sedanPrice = tier.vehicle_size_sedan_price;
          if (sedanPrice != null) {
            if (sedanPrice < minCurrent) minCurrent = sedanPrice;
            if (sedanPrice < minOriginal) minOriginal = sedanPrice;
          }
        } else {
          const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, saleStatus.isOnSale);
          if (saleInfo) {
            if (saleInfo.currentPrice < minCurrent) minCurrent = saleInfo.currentPrice;
            if (saleInfo.originalPrice < minOriginal) minOriginal = saleInfo.originalPrice;
            if (saleInfo.isDiscounted) hasDiscount = true;
          }
        }
      }

      if (minCurrent === Infinity) return { priceLabel: null, originalPrice: null, isOnSale: false };

      return {
        priceLabel: `From ${formatCurrency(minCurrent)}`,
        originalPrice: hasDiscount && minOriginal !== minCurrent ? `From ${formatCurrency(minOriginal)}` : null,
        isOnSale: hasDiscount,
      };
    }

    case 'per_unit':
      return service.per_unit_price != null
        ? { priceLabel: `${formatCurrency(service.per_unit_price)} / ${service.per_unit_label || 'unit'}`, originalPrice: null, isOnSale: false }
        : { priceLabel: null, originalPrice: null, isOnSale: false };

    case 'custom':
      return service.custom_starting_price != null
        ? { priceLabel: `From ${formatCurrency(service.custom_starting_price)}`, originalPrice: null, isOnSale: false }
        : { priceLabel: null, originalPrice: null, isOnSale: false };

    default:
      return { priceLabel: null, originalPrice: null, isOnSale: false };
  }
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${minutes}m`;
}
