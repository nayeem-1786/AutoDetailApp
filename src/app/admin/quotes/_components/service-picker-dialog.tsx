'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Service, ServiceCategory, ServicePricing } from '@/lib/supabase/types';
import { formatCurrency } from '@/lib/utils/format';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Search, X, ArrowLeft, Check } from 'lucide-react';

type ServiceWithPricing = Service & {
  category: ServiceCategory | null;
  pricing: ServicePricing[];
};

interface ServicePickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: {
    service_id: string;
    item_name: string;
    unit_price: number;
    tier_name: string | null;
  }) => void;
  vehicleSizeClass: string | null;
}

type NavState =
  | { view: 'categories' }
  | { view: 'services'; categoryId: string; categoryName: string }
  | { view: 'detail'; service: ServiceWithPricing; categoryName: string };

function resolveTierPrice(tier: ServicePricing, sizeClass: string | null): number {
  if (tier.is_vehicle_size_aware && sizeClass) {
    if (sizeClass === 'sedan' && tier.vehicle_size_sedan_price != null) return tier.vehicle_size_sedan_price;
    if (sizeClass === 'truck_suv_2row' && tier.vehicle_size_truck_suv_price != null) return tier.vehicle_size_truck_suv_price;
    if (sizeClass === 'suv_3row_van' && tier.vehicle_size_suv_van_price != null) return tier.vehicle_size_suv_van_price;
  }
  return tier.price;
}

function getPriceDisplay(service: ServiceWithPricing, sizeClass: string | null): string {
  const tiers = (service.pricing ?? []).sort((a, b) => a.display_order - b.display_order);

  if (service.pricing_model === 'flat' || tiers.length === 0) {
    return service.flat_price != null ? formatCurrency(service.flat_price) : 'Custom';
  }

  // Check if any tier is vehicle-size-aware
  const hasVehicleSizePricing = tiers.some((t) => t.is_vehicle_size_aware);

  if (hasVehicleSizePricing && !sizeClass) {
    // Show range: "From $X"
    const prices = tiers.map((t) => t.price);
    const min = Math.min(...prices);
    return `From ${formatCurrency(min)}`;
  }

  if (tiers.length === 1) {
    return formatCurrency(resolveTierPrice(tiers[0], sizeClass));
  }

  // Multiple tiers — show range
  const resolvedPrices = tiers.map((t) => resolveTierPrice(t, sizeClass));
  const min = Math.min(...resolvedPrices);
  const max = Math.max(...resolvedPrices);
  if (min === max) return formatCurrency(min);
  return `${formatCurrency(min)} – ${formatCurrency(max)}`;
}

export function ServicePickerDialog({ open, onClose, onSelect, vehicleSizeClass }: ServicePickerDialogProps) {
  const supabase = createClient();

  const [services, setServices] = useState<ServiceWithPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nav, setNav] = useState<NavState>({ view: 'categories' });

  // Detail view state
  const [selectedTierName, setSelectedTierName] = useState<string | null>(null);

  // Load services with categories and pricing on mount
  useEffect(() => {
    if (!open) return;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('services')
        .select(
          'id, name, description, slug, flat_price, pricing_model, classification, base_duration_minutes, custom_starting_price, per_unit_price, per_unit_max, per_unit_label, mobile_eligible, online_bookable, staff_assessed, is_taxable, vehicle_compatibility, special_requirements, is_active, display_order, created_at, updated_at, category_id, category:service_categories(id, name, slug, description, display_order, is_active, created_at, updated_at), pricing:service_pricing(id, service_id, tier_name, tier_label, price, display_order, is_vehicle_size_aware, vehicle_size_sedan_price, vehicle_size_truck_suv_price, vehicle_size_suv_van_price, created_at)'
        )
        .eq('is_active', true)
        .order('display_order')
        .order('name');

      if (data) {
        setServices(data as ServiceWithPricing[]);
      }
      setLoading(false);
    }

    load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('');
      setNav({ view: 'categories' });
      setSelectedTierName(null);
    }
  }, [open]);

  // Build category data
  const categories = useMemo(() => {
    const catMap = new Map<string, { id: string; name: string; display_order: number; count: number }>();

    for (const svc of services) {
      if (svc.category) {
        const existing = catMap.get(svc.category.id);
        if (existing) {
          existing.count++;
        } else {
          catMap.set(svc.category.id, {
            id: svc.category.id,
            name: svc.category.name,
            display_order: svc.category.display_order,
            count: 1,
          });
        }
      }
    }

    // Add uncategorized if any services have no category
    const uncategorized = services.filter((s) => !s.category);
    if (uncategorized.length > 0) {
      catMap.set('__uncategorized', {
        id: '__uncategorized',
        name: 'Other',
        display_order: 9999,
        count: uncategorized.length,
      });
    }

    return Array.from(catMap.values()).sort((a, b) => a.display_order - b.display_order);
  }, [services]);

  // Filter services by search
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.category && s.category.name.toLowerCase().includes(q))
    );
  }, [services, search]);

  // Services in selected category
  const categoryServices = useMemo(() => {
    if (nav.view !== 'services') return [];
    if (nav.categoryId === '__uncategorized') {
      return services.filter((s) => !s.category);
    }
    return services.filter((s) => s.category?.id === nav.categoryId);
  }, [nav, services]);

  const handleServiceClick = useCallback(
    (service: ServiceWithPricing, categoryName: string) => {
      const tiers = (service.pricing ?? []).sort((a, b) => a.display_order - b.display_order);
      const isFlat = service.pricing_model === 'flat' || tiers.length === 0;

      if (isFlat) {
        // Auto-add flat-price services immediately
        onSelect({
          service_id: service.id,
          item_name: service.name,
          unit_price: service.flat_price ?? 0,
          tier_name: null,
        });
        onClose();
      } else if (tiers.length === 1) {
        // Single tier — auto-add with resolved price
        const tier = tiers[0];
        const price = resolveTierPrice(tier, vehicleSizeClass);
        onSelect({
          service_id: service.id,
          item_name: service.name,
          unit_price: price,
          tier_name: tier.tier_name,
        });
        onClose();
      } else {
        // Multiple tiers — show detail view
        setSelectedTierName(tiers[0].tier_name);
        setNav({ view: 'detail', service, categoryName });
      }
    },
    [onSelect, onClose, vehicleSizeClass]
  );

  const handleAddToQuote = useCallback(() => {
    if (nav.view !== 'detail' || !selectedTierName) return;
    const { service } = nav;
    const tier = (service.pricing ?? []).find((t) => t.tier_name === selectedTierName);
    if (!tier) return;

    const price = resolveTierPrice(tier, vehicleSizeClass);
    onSelect({
      service_id: service.id,
      item_name: service.name,
      unit_price: price,
      tier_name: tier.tier_name,
    });
    onClose();
  }, [nav, selectedTierName, vehicleSizeClass, onSelect, onClose]);

  const handleBack = useCallback(() => {
    if (nav.view === 'detail') {
      setNav({ view: 'services', categoryId: nav.service.category?.id ?? '__uncategorized', categoryName: nav.categoryName });
      setSelectedTierName(null);
    } else if (nav.view === 'services') {
      setNav({ view: 'categories' });
    }
  }, [nav]);

  if (!open) return null;

  const isSearching = search.trim().length > 0;

  const selectedTier =
    nav.view === 'detail'
      ? (nav.service.pricing ?? []).find((t) => t.tier_name === selectedTierName)
      : null;

  const selectedTierPrice = selectedTier ? resolveTierPrice(selectedTier, vehicleSizeClass) : 0;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className="relative z-50 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Browse Services</h2>
            <button
              onClick={onClose}
              className="rounded-sm p-1 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="border-b border-gray-100 px-6 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search services..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-9 w-full rounded-md border border-gray-300 bg-white pl-9 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {vehicleSizeClass && (
              <p className="mt-1.5 text-xs text-gray-500">
                Prices for {VEHICLE_SIZE_LABELS[vehicleSizeClass] ?? vehicleSizeClass}
              </p>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : isSearching ? (
              /* Search Results */
              <div>
                <p className="mb-3 text-sm text-gray-500">
                  {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} for &ldquo;{search}&rdquo;
                </p>
                {searchResults.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No services found</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {searchResults.map((svc) => (
                      <button
                        key={svc.id}
                        onClick={() => handleServiceClick(svc, svc.category?.name ?? 'Other')}
                        className="flex min-h-[72px] flex-col items-start rounded-lg border border-gray-200 p-3 text-left transition-all hover:border-gray-300 hover:shadow-sm"
                      >
                        <span className="text-sm font-medium text-gray-900">{svc.name}</span>
                        <span className="mt-0.5 text-xs text-gray-500">{svc.category?.name ?? 'Other'}</span>
                        <span className="mt-auto pt-1 text-sm font-semibold text-gray-700">
                          {getPriceDisplay(svc, vehicleSizeClass)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : nav.view === 'categories' ? (
              /* Category Tiles */
              <div className="grid grid-cols-3 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setNav({ view: 'services', categoryId: cat.id, categoryName: cat.name })}
                    className="flex min-h-[100px] flex-col items-center justify-center rounded-xl bg-gray-100 p-4 text-center transition-colors hover:bg-gray-200"
                  >
                    <span className="text-sm font-semibold text-gray-900">{cat.name}</span>
                    <span className="mt-1 text-xs text-gray-500">
                      {cat.count} {cat.count === 1 ? 'service' : 'services'}
                    </span>
                  </button>
                ))}
              </div>
            ) : nav.view === 'services' ? (
              /* Services in Category */
              <div>
                <button
                  onClick={handleBack}
                  className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Categories
                </button>
                <h3 className="mb-3 text-base font-semibold text-gray-900">{nav.categoryName}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {categoryServices.map((svc) => (
                    <button
                      key={svc.id}
                      onClick={() => handleServiceClick(svc, nav.categoryName)}
                      className="flex min-h-[72px] flex-col items-start rounded-lg border border-gray-200 p-3 text-left transition-all hover:border-gray-300 hover:shadow-sm"
                    >
                      <span className="text-sm font-medium text-gray-900">{svc.name}</span>
                      <span className="mt-auto pt-1 text-sm font-semibold text-gray-700">
                        {getPriceDisplay(svc, vehicleSizeClass)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : nav.view === 'detail' ? (
              /* Tier/Size Selection */
              <div>
                <button
                  onClick={handleBack}
                  className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to {nav.categoryName}
                </button>
                <h3 className="text-base font-semibold text-gray-900">{nav.service.name}</h3>
                {nav.service.description && (
                  <p className="mt-1 text-sm text-gray-500">{nav.service.description}</p>
                )}

                <div className="mt-4 space-y-2">
                  {(nav.service.pricing ?? [])
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((tier) => {
                      const price = resolveTierPrice(tier, vehicleSizeClass);
                      const isSelected = selectedTierName === tier.tier_name;
                      return (
                        <button
                          key={tier.id}
                          onClick={() => setSelectedTierName(tier.tier_name)}
                          className={`flex w-full items-center justify-between rounded-lg border-2 p-4 text-left transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                                isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {tier.tier_label || tier.tier_name}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(price)}
                          </span>
                        </button>
                      );
                    })}
                </div>

                {vehicleSizeClass && selectedTier?.is_vehicle_size_aware && (
                  <p className="mt-3 text-xs text-gray-500">
                    Price shown for {VEHICLE_SIZE_LABELS[vehicleSizeClass] ?? vehicleSizeClass}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer — only show Add button on detail view */}
          {nav.view === 'detail' && selectedTierName && (
            <div className="border-t border-gray-200 px-6 py-4">
              <Button
                className="w-full bg-gray-900 text-white hover:bg-gray-800"
                onClick={handleAddToQuote}
              >
                Add to Quote — {formatCurrency(selectedTierPrice)}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
