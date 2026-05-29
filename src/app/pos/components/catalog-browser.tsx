'use client';

import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCatalog } from '../hooks/use-catalog';
import { useTicket } from '../context/ticket-context';
import { useValidatedServiceAdd, type ValidatedAddOpts } from '../hooks/use-validated-service-add';
import type { CatalogProduct, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { usePosPermission } from '../context/pos-permission-context';
import { CategoryTile } from './category-tile';
import { ProductGrid, ServiceGrid } from './catalog-grid';
import { ProductDetail } from './product-detail';
import { ServiceDetailDialog } from './service-detail-dialog';
import { ServicePricingPicker } from './service-pricing-picker';
import { CustomPriceDialog } from '@/lib/services/custom-price-dialog';
import { resolveServicePriceWithSale } from '../utils/pricing';
import { selectPricingTierForVehicle } from '@/lib/services/picker-engine';
import { categoryToCompatibilityKey, VEHICLE_CATEGORY_LABELS, type VehicleCategory } from '@/lib/utils/vehicle-categories';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Resolve sale-aware price for toast messages */
function getToastPrice(service: CatalogService, tier: ServicePricing, vsc: VehicleSizeClass | null): number {
  // Always pass window — null dates = no time limit
  const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
  return resolveServicePriceWithSale(tier, vsc, saleWindow).effectivePrice;
}

type BrowseState =
  | { view: 'categories' }
  | { view: 'items'; categoryId: string; categoryName: string };

interface CatalogBrowserProps {
  type: 'products' | 'services';
  search: string;
  /** When provided, use this callback instead of dispatching to ticket context */
  onAddProduct?: (product: CatalogProduct) => void;
  /** When provided, use this callback instead of dispatching to ticket context */
  onAddService?: (service: CatalogService, pricing: ServicePricing, vehicleSizeClass: VehicleSizeClass | null, perUnitQty?: number, opts?: ValidatedAddOpts) => void;
  /** Override vehicle size class (for quote builder where vehicle is in a different context) */
  vehicleSizeOverride?: VehicleSizeClass | null;
  /** Override specialty tier (for quote builder where vehicle is in a different context) */
  vehicleSpecialtyTierOverride?: string | null;
  /** Set of service IDs already on the ticket — shows checkmark indicator */
  addedServiceIds?: Set<string>;
  /**
   * Prerequisite/add-on context overrides (for quote builder). Without these
   * the add-time validation reads the Sale ticket via `useTicket()` — the G5
   * wrong-context bug when this browser is mounted inside a quote. When the
   * quote builder mounts CatalogBrowser it passes the quote's customer/vehicle/
   * line-item ids so the same `useValidatedServiceAdd` helper validates against
   * the quote instead. `undefined` = fall back to the Sale ticket (default).
   */
  customerIdOverride?: string | null;
  vehicleIdOverride?: string | null;
  serviceIdsOverride?: string[];
}

export function CatalogBrowser({ type, search, onAddProduct, onAddService, vehicleSizeOverride, vehicleSpecialtyTierOverride, addedServiceIds, customerIdOverride, vehicleIdOverride, serviceIdsOverride }: CatalogBrowserProps) {
  const { products, services } = useCatalog();
  const { ticket, dispatch: ticketDispatch } = useTicket();
  const { granted: canCreateTickets } = usePosPermission('pos.create_tickets');
  const { granted: canAddItems } = usePosPermission('pos.add_items');
  const hasCallbacks = !!onAddProduct || !!onAddService;
  const dispatch = hasCallbacks ? undefined : ticketDispatch;

  // Items cannot be added if:
  // 1. pos.add_items is denied (always blocked), OR
  // 2. pos.create_tickets is denied AND ticket is empty (can't start a new ticket)
  const ticketIsEmpty = ticket.items.length === 0;
  const addDisabled = !canAddItems || (!canCreateTickets && ticketIsEmpty);
  const [browseState, setBrowseState] = useState<BrowseState>({ view: 'categories' });
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);
  const [customPriceService, setCustomPriceService] = useState<CatalogService | null>(null);
  const [detailProduct, setDetailProduct] = useState<CatalogProduct | null>(null);
  const [detailService, setDetailService] = useState<CatalogService | null>(null);
  const [compatWarning, setCompatWarning] = useState<{ service: CatalogService; mode: 'direct' | 'detail' } | null>(null);

  // Prerequisite/add-on context — the live Sale ticket by default, overridden
  // by the quote builder so the SAME validation helper runs against the quote
  // (fixes the G5 wrong-context bug).
  const ticketServiceIds = useMemo(
    () => ticket.items.filter((i) => i.itemType === 'service' && i.serviceId).map((i) => i.serviceId!),
    [ticket.items]
  );
  const validationCustomerId = customerIdOverride !== undefined ? customerIdOverride : (ticket.customer?.id ?? null);
  const validationVehicleId = vehicleIdOverride !== undefined ? vehicleIdOverride : (ticket.vehicle?.id ?? null);
  const validationServiceIds = serviceIdsOverride !== undefined ? serviceIdsOverride : ticketServiceIds;

  // Auto-compute addedServiceIds from ticket when no external prop provided
  const resolvedAddedServiceIds = useMemo(() => {
    if (addedServiceIds) return addedServiceIds;
    if (!dispatch) return undefined; // callback mode — caller controls it
    return new Set(
      ticket.items
        .filter((i) => i.itemType === 'service' && i.serviceId && !i.parentItemId)
        .map((i) => i.serviceId!)
    );
  }, [addedServiceIds, dispatch, ticket.items]);

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

  /**
   * Commit primitive for the validation helper. Owns the POS-ticket
   * duplicate-check + per-unit-increment + dispatch (dispatch mode), or
   * forwards to the caller's callback (quote builder). The helper calls this
   * only AFTER its add-on + prerequisite gates pass (or after an override) —
   * the gates themselves moved into `useValidatedServiceAdd`.
   */
  const commitAdd = useCallback((
    svc: CatalogService,
    p: ServicePricing,
    vsc: VehicleSizeClass | null,
    perUnitQty?: number,
    opts?: ValidatedAddOpts,
  ) => {
    if (onAddService) {
      onAddService(svc, p, vsc, perUnitQty, opts);
      return;
    }
    if (!dispatch) return;
    // Duplicate check for POS ticket path
    const useTierMatching = svc.pricing_model === 'scope' || svc.pricing_model === 'specialty';
    const tierName = p ? (p.tier_label || p.tier_name) : null;
    const existingItem = ticket.items.find(
      (i) => i.itemType === 'service' && i.serviceId === svc.id && !i.parentItemId && (!useTierMatching || !tierName || i.tierName === tierName)
    );
    if (existingItem) {
      const isPerUnit = existingItem.perUnitQty != null && existingItem.perUnitPrice != null;
      if (isPerUnit) {
        const max = existingItem.perUnitMax ?? svc.per_unit_max ?? 10;
        if (existingItem.perUnitQty! >= max) {
          const label = existingItem.perUnitLabel || svc.per_unit_label || 'unit';
          toast.warning(`${svc.name} is already at maximum (${max} ${label}${max > 1 ? 's' : ''})`);
        } else {
          const newQty = perUnitQty ?? (existingItem.perUnitQty! + 1);
          dispatch({ type: 'UPDATE_PER_UNIT_QTY', itemId: existingItem.id, perUnitQty: newQty });
          const label = existingItem.perUnitLabel || svc.per_unit_label || 'unit';
          toast.success(`${svc.name} — ${newQty} ${label}${newQty > 1 ? 's' : ''}`);
        }
      } else {
        toast.warning('Already on ticket');
      }
      return;
    }
    dispatch({ type: 'ADD_SERVICE', service: svc, pricing: p, vehicleSizeClass: vsc, perUnitQty, prerequisiteNote: opts?.prerequisiteNote, prerequisiteForServiceId: opts?.prerequisiteForServiceId });
  }, [onAddService, dispatch, ticket.items]);

  // Canonical add-time validation (CLAUDE.md Rule 22): add-on-only gate →
  // prerequisite check → commit. Same helper drives Sale, Quotes, and the
  // register tab. `onAddHandlesToast` is true in callback (quote) mode where
  // the caller's `onAddService` shows its own success toast.
  const { addService: addServiceChecked, runValidations, dialogs: validationDialogs } = useValidatedServiceAdd({
    customerId: validationCustomerId,
    vehicleId: validationVehicleId,
    serviceIds: validationServiceIds,
    services,
    vehicleSizeClass,
    onAdd: commitAdd,
    onAddHandlesToast: hasCallbacks,
  });

  function handleTapProduct(product: CatalogProduct) {
    if (addDisabled) {
      toast.error(!canAddItems ? 'You do not have permission to add items' : 'You do not have permission to create tickets');
      return;
    }
    if (onAddProduct) {
      onAddProduct(product);
      return;
    }
    setDetailProduct(product);
  }

  function handleTapService(service: CatalogService) {
    if (addDisabled) {
      toast.error(!canAddItems ? 'You do not have permission to add items' : 'You do not have permission to create tickets');
      return;
    }
    // No customer/vehicle guard here — browsing service details is always allowed.
    // The guard fires inside ServiceDetailDialog:handleAdd when the user taps "Add to Ticket".
    if (!isServiceCompatible(service)) {
      setCompatWarning({ service, mode: 'detail' });
      return;
    }
    // Item 15f Layer 3e: pricing_model === 'custom' bypasses <ServiceDetailDialog>
    // (whose "Add to Ticket" button would be disabled because no pricing row
    // / flat_price exists). Open <CustomPriceDialog> directly so the operator
    // can enter a staff-assessed final price. routeServiceTap returns the
    // same `open-custom-price-dialog` action for this case — see picker-engine.ts.
    if (service.pricing_model === 'custom') {
      setCustomPriceService(service);
      return;
    }
    setDetailService(service);
  }

  function handleTapServiceDirect(service: CatalogService) {
    if (addDisabled) {
      toast.error(!canAddItems ? 'You do not have permission to add items' : 'You do not have permission to create tickets');
      return;
    }
    // Require customer + vehicle before adding services (skip in quote builder mode)
    if (!onAddService) {
      if (!ticket.customer) {
        toast.error('Please select a customer first');
        return;
      }
      if (!ticket.vehicle) {
        window.dispatchEvent(new CustomEvent('pos-vehicle-needed', { detail: { service } }));
        toast.info('Please select a vehicle first');
        return;
      }
    }
    if (!isServiceCompatible(service)) {
      setCompatWarning({ service, mode: 'direct' });
      return;
    }
    // Item 15f Layer 3e: pricing_model === 'custom' always opens the
    // operator staff-assessment dialog (same branch as routeServiceTap's
    // `open-custom-price-dialog`). Fires regardless of vehicle and
    // regardless of any `flat_price` / `pricing` row state — `custom` means
    // "operator assesses the final price," so we never quick-add a stale
    // value. Layer 2's `<CustomPriceDialog>` synthesizes the
    // `ServicePricing` row on confirm.
    if (service.pricing_model === 'custom') {
      setCustomPriceService(service);
      return;
    }
    // Per-unit services always need the quantity picker
    if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
      setPickerService(service);
      return;
    }

    const pricing = service.pricing ?? [];

    // Quick-add via prerequisite-aware addServiceChecked
    async function quickAdd(svc: CatalogService, p: ServicePricing, vsc: VehicleSizeClass | null, toastMsg?: string) {
      const added = await addServiceChecked(svc, p, vsc);
      if (added && !onAddService) toast.success(toastMsg || `Added ${svc.name}`);
    }

    // Quick-add: single tier, not vehicle-size-aware
    if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
      quickAdd(service, pricing[0], vehicleSizeClass);
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
        sale_price: service.sale_price ?? null,
        display_order: 0,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        vehicle_size_exotic_price: null,
        vehicle_size_classic_price: null,
        max_qty: null,
        qty_label: null,
        created_at: '',
      };
      quickAdd(service, syntheticPricing, vehicleSizeClass);
      return;
    }

    // Vehicle prequalification: auto-add the size-matched tier when one
    // resolves (canonical selection — CLAUDE.md Rule 22). The single
    // non-size-aware + flat branches above already returned, so a non-null
    // tier here is always a size-aware / size-tier match (price toast).
    const tier = selectPricingTierForVehicle(pricing, vehicleSizeClass);
    if (tier) {
      const price = getToastPrice(service, tier, vehicleSizeClass);
      quickAdd(service, tier, vehicleSizeClass, `Added ${service.name} — $${price.toFixed(2)}`);
      return;
    }

    // Fallback: open picker
    setPickerService(service);
  }

  async function handlePricingSelect(
    pricing: ServicePricing,
    vsc: VehicleSizeClass | null,
    perUnitQty?: number
  ) {
    if (!pickerService) return;
    const svc = pickerService;
    setPickerService(null);
    const added = await addServiceChecked(svc, pricing, vsc, perUnitQty);
    if (added && !onAddService) toast.success(`Added ${svc.name}`);
  }

  function handleCompatConfirm() {
    if (!compatWarning) return;
    const { service, mode } = compatWarning;
    setCompatWarning(null);
    if (mode === 'detail') {
      // Item 15f Layer 3e: mirror handleTapService's custom branch here.
      if (service.pricing_model === 'custom') {
        setCustomPriceService(service);
      } else {
        setDetailService(service);
      }
    } else {
      // Re-run direct add logic without the compatibility check
      handleTapServiceDirectUnchecked(service);
    }
  }

  async function handleCustomPriceSelect(
    pricing: ServicePricing,
    vsc: VehicleSizeClass | null,
  ) {
    if (!customPriceService) return;
    const svc = customPriceService;
    setCustomPriceService(null);
    const added = await addServiceChecked(svc, pricing, vsc);
    if (added && !onAddService) toast.success(`Added ${svc.name} — $${pricing.price.toFixed(2)}`);
  }

  // Same as handleTapServiceDirect but without the vehicle compatibility check (used after user confirms compat warning)
  function handleTapServiceDirectUnchecked(service: CatalogService) {
    // Item 15f Layer 3e: mirror the custom branch from `handleTapServiceDirect`.
    if (service.pricing_model === 'custom') {
      setCustomPriceService(service);
      return;
    }
    if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
      setPickerService(service);
      return;
    }
    const pricing = service.pricing ?? [];

    async function quickAdd(svc: CatalogService, p: ServicePricing, vsc: VehicleSizeClass | null, toastMsg?: string) {
      const added = await addServiceChecked(svc, p, vsc);
      if (added && !onAddService) toast.success(toastMsg || `Added ${svc.name}`);
    }

    if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
      quickAdd(service, pricing[0], vehicleSizeClass);
      return;
    }
    if (pricing.length === 0 && service.flat_price != null) {
      const syntheticPricing: ServicePricing = {
        id: 'flat', service_id: service.id, tier_name: 'default', tier_label: null,
        price: service.flat_price, sale_price: service.sale_price ?? null, display_order: 0, is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null, vehicle_size_truck_suv_price: null, vehicle_size_suv_van_price: null, vehicle_size_exotic_price: null, vehicle_size_classic_price: null, max_qty: null, qty_label: null, created_at: '',
      };
      quickAdd(service, syntheticPricing, vehicleSizeClass);
      return;
    }
    // Vehicle prequalification: same canonical selection as handleTapServiceDirect.
    const tier = selectPricingTierForVehicle(pricing, vehicleSizeClass);
    if (tier) {
      const price = getToastPrice(service, tier, vehicleSizeClass);
      quickAdd(service, tier, vehicleSizeClass, `Added ${service.name} — $${price.toFixed(2)}`);
      return;
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
      {customPriceService && (
        <CustomPriceDialog
          open={!!customPriceService}
          onClose={() => setCustomPriceService(null)}
          service={customPriceService}
          vehicleSizeClass={vehicleSizeClass as VehicleSizeClass | null}
          onSelect={handleCustomPriceSelect}
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
          onPrerequisiteCheck={runValidations}
        />
      )}
      {validationDialogs}
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
            addedServiceIds={resolvedAddedServiceIds}
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
              addedServiceIds={resolvedAddedServiceIds}
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
        <div className="pos-category-grid grid grid-cols-3 gap-3">
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
