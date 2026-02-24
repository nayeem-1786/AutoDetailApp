'use client';

import { useState, useMemo } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCatalog } from '../hooks/use-catalog';
import { useTicket } from '../context/ticket-context';
import type { CatalogProduct, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { CategoryTile } from './category-tile';
import { ProductGrid, ServiceGrid } from './catalog-grid';
import { ProductDetail } from './product-detail';
import { ServiceDetailDialog } from './service-detail-dialog';
import { ServicePricingPicker } from './service-pricing-picker';
import { resolveServicePrice } from '../utils/pricing';
import { categoryToCompatibilityKey, VEHICLE_CATEGORY_LABELS, type VehicleCategory } from '@/lib/utils/vehicle-categories';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const VEHICLE_SIZE_CLASSES = new Set(['sedan', 'truck_suv_2row', 'suv_3row_van']);

type BrowseState =
  | { view: 'categories' }
  | { view: 'items'; categoryId: string; categoryName: string };

interface CatalogBrowserProps {
  type: 'products' | 'services';
  search: string;
  /** When provided, use this callback instead of dispatching to ticket context */
  onAddProduct?: (product: CatalogProduct) => void;
  /** When provided, use this callback instead of dispatching to ticket context */
  onAddService?: (service: CatalogService, pricing: ServicePricing, vehicleSizeClass: VehicleSizeClass | null, perUnitQty?: number) => void;
  /** Override vehicle size class (for quote builder where vehicle is in a different context) */
  vehicleSizeOverride?: VehicleSizeClass | null;
  /** Override specialty tier (for quote builder where vehicle is in a different context) */
  vehicleSpecialtyTierOverride?: string | null;
  /** Set of service IDs already on the ticket — shows checkmark indicator */
  addedServiceIds?: Set<string>;
}

export function CatalogBrowser({ type, search, onAddProduct, onAddService, vehicleSizeOverride, vehicleSpecialtyTierOverride, addedServiceIds }: CatalogBrowserProps) {
  const { products, services } = useCatalog();
  const { ticket, dispatch: ticketDispatch } = useTicket();
  const hasCallbacks = !!onAddProduct || !!onAddService;
  const dispatch = hasCallbacks ? undefined : ticketDispatch;
  const [browseState, setBrowseState] = useState<BrowseState>({ view: 'categories' });
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);
  const [detailProduct, setDetailProduct] = useState<CatalogProduct | null>(null);
  const [detailService, setDetailService] = useState<CatalogService | null>(null);
  const [compatWarning, setCompatWarning] = useState<{ service: CatalogService; mode: 'direct' | 'detail' } | null>(null);

  const items = type === 'products' ? products : services;
  const vehicleSizeClass = vehicleSizeOverride !== undefined
    ? vehicleSizeOverride
    : (ticket.vehicle?.size_class ?? null);
  const vehicleSpecialtyTier = vehicleSpecialtyTierOverride !== undefined
    ? vehicleSpecialtyTierOverride
    : (ticket.vehicle?.specialty_tier ?? null);

  // Build categories with counts and image
  const categories = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; count: number; imageUrl: string | null }
    >();

    items.forEach((item) => {
      const cat = 'category' in item ? (item as CatalogProduct | CatalogService).category : null;
      if (!cat) return;
      const existing = map.get(cat.id);
      if (existing) {
        existing.count++;
        if (!existing.imageUrl && 'image_url' in item && item.image_url) {
          existing.imageUrl = item.image_url as string;
        }
      } else {
        map.set(cat.id, {
          id: cat.id,
          name: cat.name,
          count: 1,
          imageUrl: ('image_url' in item && item.image_url) ? item.image_url as string : null,
        });
      }
    });

    const uncategorized = items.filter((item) => {
      const cat = 'category' in item ? (item as CatalogProduct | CatalogService).category : null;
      return !cat;
    });
    if (uncategorized.length > 0) {
      map.set('__uncategorized__', {
        id: '__uncategorized__',
        name: 'Other',
        count: uncategorized.length,
        imageUrl: null,
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Items in current category
  const categoryItems = useMemo(() => {
    if (browseState.view !== 'items') return [];
    const catId = browseState.categoryId;
    if (catId === '__uncategorized__') {
      return items.filter((item) => {
        const cat = 'category' in item ? (item as CatalogProduct | CatalogService).category : null;
        return !cat;
      });
    }
    return items.filter((item) => (item as { category_id?: string }).category_id === catId);
  }, [items, browseState]);

  // Search filtered items (flat list, skip categories)
  const searchResults = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    if (type === 'products') {
      return products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      );
    }
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [search, type, products, services]);

  /**
   * Check if a service is compatible with the current ticket vehicle.
   * Returns true if compatible or no vehicle attached (skip check).
   */
  function isServiceCompatible(service: CatalogService): boolean {
    const vehicle = ticket.vehicle;
    if (!vehicle) return true; // No vehicle — skip check
    const compat = (service as { vehicle_compatibility?: string[] }).vehicle_compatibility;
    if (!compat || compat.length === 0) return true; // No restrictions
    const vehicleCat = (vehicle.vehicle_category || 'automobile') as VehicleCategory;
    const compatKey = categoryToCompatibilityKey(vehicleCat);
    return compat.includes(compatKey);
  }

  function getCompatibleTypesLabel(service: CatalogService): string {
    const compat = (service as { vehicle_compatibility?: string[] }).vehicle_compatibility;
    if (!compat || compat.length === 0) return '';
    const labels = compat.map((key: string) => {
      if (key === 'standard') return VEHICLE_CATEGORY_LABELS.automobile;
      return VEHICLE_CATEGORY_LABELS[key as VehicleCategory] || key;
    });
    return labels.join(', ');
  }

  function handleTapProduct(product: CatalogProduct) {
    if (onAddProduct) {
      onAddProduct(product);
      return;
    }
    setDetailProduct(product);
  }

  function handleTapService(service: CatalogService) {
    if (!isServiceCompatible(service)) {
      setCompatWarning({ service, mode: 'detail' });
      return;
    }
    setDetailService(service);
  }

  function handleTapServiceDirect(service: CatalogService) {
    if (!isServiceCompatible(service)) {
      setCompatWarning({ service, mode: 'direct' });
      return;
    }
    // Per-unit services always need the quantity picker
    if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
      setPickerService(service);
      return;
    }

    const pricing = service.pricing ?? [];

    // Quick-add helper
    function quickAdd(svc: CatalogService, p: ServicePricing, vsc: VehicleSizeClass | null) {
      if (onAddService) {
        onAddService(svc, p, vsc);
      } else if (dispatch) {
        dispatch({ type: 'ADD_SERVICE', service: svc, pricing: p, vehicleSizeClass: vsc });
      }
    }

    // Quick-add: single tier, not vehicle-size-aware
    if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
      quickAdd(service, pricing[0], vehicleSizeClass);
      if (!onAddService) toast.success(`Added ${service.name}`);
      return;
    }

    // Quick-add: flat price (no pricing tiers)
    if (pricing.length === 0 && service.flat_price != null) {
      const syntheticPricing: ServicePricing = {
        id: 'flat',
        service_id: service.id,
        tier_name: 'default',
        tier_label: null,
        price: service.flat_price,
        sale_price: null,
        display_order: 0,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        created_at: '',
      };
      quickAdd(service, syntheticPricing, vehicleSizeClass);
      if (!onAddService) toast.success(`Added ${service.name}`);
      return;
    }

    // Vehicle prequalification: auto-add when vehicle is set
    if (vehicleSizeClass) {
      const isVehicleSizeTiers = pricing.length > 1
        && pricing.every((t) => VEHICLE_SIZE_CLASSES.has(t.tier_name));
      if (isVehicleSizeTiers) {
        const matchingTier = pricing.find((t) => t.tier_name === vehicleSizeClass);
        if (matchingTier) {
          quickAdd(service, matchingTier, vehicleSizeClass);
          if (!onAddService) {
            const price = resolveServicePrice(matchingTier, vehicleSizeClass);
            toast.success(`Added ${service.name} — $${price.toFixed(2)}`);
          }
          return;
        }
      }
      if (pricing.length === 1 && pricing[0].is_vehicle_size_aware) {
        quickAdd(service, pricing[0], vehicleSizeClass);
        if (!onAddService) {
          const price = resolveServicePrice(pricing[0], vehicleSizeClass);
          toast.success(`Added ${service.name} — $${price.toFixed(2)}`);
        }
        return;
      }
    }

    // Fallback: open picker
    setPickerService(service);
  }

  function handlePricingSelect(
    pricing: ServicePricing,
    vsc: VehicleSizeClass | null,
    perUnitQty?: number
  ) {
    if (!pickerService) return;
    if (onAddService) {
      onAddService(pickerService, pricing, vsc, perUnitQty);
    } else if (dispatch) {
      dispatch({
        type: 'ADD_SERVICE',
        service: pickerService,
        pricing,
        vehicleSizeClass: vsc,
        perUnitQty,
      });
    }
    if (!onAddService) toast.success(`Added ${pickerService.name}`);
    setPickerService(null);
  }

  function handleCompatConfirm() {
    if (!compatWarning) return;
    const { service, mode } = compatWarning;
    setCompatWarning(null);
    if (mode === 'detail') {
      setDetailService(service);
    } else {
      // Re-run direct add logic without the compatibility check
      handleTapServiceDirectUnchecked(service);
    }
  }

  // Same as handleTapServiceDirect but without the compatibility check (used after user confirms)
  function handleTapServiceDirectUnchecked(service: CatalogService) {
    if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
      setPickerService(service);
      return;
    }
    const pricing = service.pricing ?? [];
    function quickAdd(svc: CatalogService, p: ServicePricing, vsc: VehicleSizeClass | null) {
      if (onAddService) { onAddService(svc, p, vsc); }
      else if (dispatch) { dispatch({ type: 'ADD_SERVICE', service: svc, pricing: p, vehicleSizeClass: vsc }); }
    }
    if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
      quickAdd(service, pricing[0], vehicleSizeClass);
      if (!onAddService) toast.success(`Added ${service.name}`);
      return;
    }
    if (pricing.length === 0 && service.flat_price != null) {
      const syntheticPricing: ServicePricing = {
        id: 'flat', service_id: service.id, tier_name: 'default', tier_label: null,
        price: service.flat_price, sale_price: null, display_order: 0, is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null, vehicle_size_truck_suv_price: null, vehicle_size_suv_van_price: null, created_at: '',
      };
      quickAdd(service, syntheticPricing, vehicleSizeClass);
      if (!onAddService) toast.success(`Added ${service.name}`);
      return;
    }
    if (vehicleSizeClass) {
      const isVehicleSizeTiers = pricing.length > 1 && pricing.every((t) => VEHICLE_SIZE_CLASSES.has(t.tier_name));
      if (isVehicleSizeTiers) {
        const matchingTier = pricing.find((t) => t.tier_name === vehicleSizeClass);
        if (matchingTier) {
          quickAdd(service, matchingTier, vehicleSizeClass);
          if (!onAddService) { const price = resolveServicePrice(matchingTier, vehicleSizeClass); toast.success(`Added ${service.name} — $${price.toFixed(2)}`); }
          return;
        }
      }
      if (pricing.length === 1 && pricing[0].is_vehicle_size_aware) {
        quickAdd(service, pricing[0], vehicleSizeClass);
        if (!onAddService) { const price = resolveServicePrice(pricing[0], vehicleSizeClass); toast.success(`Added ${service.name} — $${price.toFixed(2)}`); }
        return;
      }
    }
    setPickerService(service);
  }

  // Dialogs (rendered outside conditional branches so they're always available)
  const dialogs = (
    <>
      {/* Compatibility Warning Dialog */}
      {compatWarning && (
        <Dialog open={!!compatWarning} onOpenChange={(open) => { if (!open) setCompatWarning(null); }}>
          <DialogClose onClose={() => setCompatWarning(null)} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Service Compatibility Warning
              </h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong className="text-gray-900 dark:text-gray-100">{compatWarning.service.name}</strong> is designed for{' '}
              <strong className="text-gray-900 dark:text-gray-100">{getCompatibleTypesLabel(compatWarning.service)}</strong>.
              The vehicle on this ticket is{' '}
              {ticket.vehicle?.vehicle_category && ticket.vehicle.vehicle_category !== 'automobile' ? 'a ' : 'an '}
              <strong className="text-gray-900 dark:text-gray-100">
                {VEHICLE_CATEGORY_LABELS[(ticket.vehicle?.vehicle_category || 'automobile') as VehicleCategory]}
              </strong>. Add anyway?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCompatWarning(null)}>Cancel</Button>
              <Button onClick={handleCompatConfirm}>Add Anyway</Button>
            </div>
          </div>
        </Dialog>
      )}
      {pickerService && (
        <ServicePricingPicker
          open={!!pickerService}
          onClose={() => setPickerService(null)}
          service={pickerService}
          vehicleSizeClass={vehicleSizeClass as VehicleSizeClass | null}
          vehicleSpecialtyTier={vehicleSpecialtyTier}
          onSelect={handlePricingSelect}
        />
      )}
      {detailProduct && (
        <ProductDetail
          product={detailProduct}
          open={!!detailProduct}
          onClose={() => setDetailProduct(null)}
        />
      )}
      {detailService && (
        <ServiceDetailDialog
          service={detailService}
          open={!!detailService}
          onClose={() => setDetailService(null)}
          onAdd={onAddService}
          vehicleSizeOverride={vehicleSizeOverride}
          vehicleSpecialtyTierOverride={vehicleSpecialtyTierOverride}
        />
      )}
    </>
  );

  // Search results (flat list)
  if (search) {
    return (
      <div className="p-4">
        {type === 'products' ? (
          <ProductGrid
            products={searchResults as CatalogProduct[]}
            onTapProduct={handleTapProduct}
          />
        ) : (
          <ServiceGrid
            services={searchResults as CatalogService[]}
            vehicleSizeClass={vehicleSizeClass}
            onTapService={handleTapServiceDirect}
            addedServiceIds={addedServiceIds}
          />
        )}
        {dialogs}
      </div>
    );
  }

  // Items in category
  if (browseState.view === 'items') {
    return (
      <div className="flex h-full flex-col">
        <button
          onClick={() => setBrowseState({ view: 'categories' })}
          className="flex shrink-0 items-center gap-1.5 px-4 pt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          All Categories
        </button>
        <h3 className="px-4 pt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          {browseState.categoryName}
        </h3>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {type === 'products' ? (
            <ProductGrid
              products={categoryItems as CatalogProduct[]}
              onTapProduct={handleTapProduct}
            />
          ) : (
            <ServiceGrid
              services={categoryItems as CatalogService[]}
              vehicleSizeClass={vehicleSizeClass}
              onTapService={handleTapService}
              addedServiceIds={addedServiceIds}
            />
          )}
        </div>
        {dialogs}
      </div>
    );
  }

  // Categories view (default)
  return (
    <div className="p-4">
      {categories.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No {type} found
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {categories.map((cat) => (
            <CategoryTile
              key={cat.id}
              name={cat.name}
              itemCount={cat.count}
              imageUrl={cat.imageUrl}
              onClick={() =>
                setBrowseState({
                  view: 'items',
                  categoryId: cat.id,
                  categoryName: cat.name,
                })
              }
            />
          ))}
        </div>
      )}
      {dialogs}
    </div>
  );
}
