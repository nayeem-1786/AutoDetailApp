'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { useQuote } from '../../context/quote-context';
import { useCatalog } from '../../hooks/use-catalog';
import { posFetch } from '../../lib/pos-fetch';
import { SearchBar } from '../search-bar';
import { CatalogBrowser } from '../catalog-browser';
import { ProductGrid, ServiceGrid } from '../catalog-grid';
import { ServicePricingPicker } from '../service-pricing-picker';
import { QuoteTicketPanel } from './quote-ticket-panel';
import type { CatalogProduct, CatalogService, TicketItem, QuoteState } from '../../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { calculateItemTax } from '../../utils/tax';

type CatalogTab = 'products' | 'services';

interface QuoteBuilderProps {
  quoteId: string | null;
  walkInMode?: boolean;
  onBack: () => void;
  onSaved: (quoteId: string) => void;
}

export function QuoteBuilder({ quoteId, walkInMode, onBack, onSaved }: QuoteBuilderProps) {
  const { quote, dispatch } = useQuote();
  const { products, services, loading: catalogLoading } = useCatalog();
  const [tab, setTab] = useState<CatalogTab>('services');
  const [search, setSearch] = useState('');
  const [loadingQuote, setLoadingQuote] = useState(!!quoteId);
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);

  // Load existing quote into state
  useEffect(() => {
    if (!quoteId) {
      // New quote — always start fresh (clears stale items from unsaved quotes)
      dispatch({ type: 'CLEAR_QUOTE' });
      return;
    }

    // Don't re-fetch if already loaded
    if (quote.quoteId === quoteId) {
      setLoadingQuote(false);
      return;
    }

    async function loadQuote() {
      try {
        const res = await posFetch(`/api/pos/quotes/${quoteId}`);
        if (!res.ok) throw new Error('Failed to fetch quote');
        const data = await res.json();
        const q = data.quote;

        // Map API items to TicketItem format
        const items: TicketItem[] = (q.items || []).map((item: {
          id: string;
          service_id: string | null;
          product_id: string | null;
          item_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          tier_name: string | null;
          notes: string | null;
        }) => ({
          id: item.id,
          itemType: item.product_id ? 'product' : item.service_id ? 'service' : 'custom',
          productId: item.product_id,
          serviceId: item.service_id,
          itemName: item.item_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
          taxAmount: item.product_id ? calculateItemTax(item.total_price, true) : 0,
          isTaxable: !!item.product_id,
          tierName: item.tier_name,
          vehicleSizeClass: q.vehicle?.size_class ?? null,
          notes: item.notes,
          perUnitQty: null,
          perUnitLabel: null,
          perUnitPrice: null,
          perUnitMax: null,
        } as TicketItem));

        const loadState: QuoteState = {
          items,
          customer: q.customer || null,
          vehicle: q.vehicle || null,
          coupon: null,
          loyaltyPointsToRedeem: 0,
          loyaltyDiscount: 0,
          manualDiscount: null,
          notes: q.notes,
          subtotal: q.subtotal,
          taxAmount: q.tax_amount,
          discountAmount: 0,
          total: q.total_amount,
          quoteId: q.id,
          quoteNumber: q.quote_number,
          validUntil: q.valid_until,
          status: q.status,
        };

        dispatch({ type: 'LOAD_QUOTE', state: loadState });
      } catch {
        toast.error('Failed to load quote');
        onBack();
      } finally {
        setLoadingQuote(false);
      }
    }

    loadQuote();
  }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const vehicleSizeClass = quote.vehicle?.size_class ?? null;

  // Track which services are already on the ticket for visual indicators
  const addedServiceIds = useMemo(
    () => new Set(quote.items.filter((i) => i.itemType === 'service' && i.serviceId).map((i) => i.serviceId!)),
    [quote.items]
  );

  // Callbacks for catalog browser to dispatch to quote context
  const handleAddProduct = useCallback((product: CatalogProduct) => {
    dispatch({ type: 'ADD_PRODUCT', product });
    toast.success(`Added ${product.name}`);
  }, [dispatch]);

  const handleAddService = useCallback((service: CatalogService, pricing: ServicePricing, vsc: VehicleSizeClass | null, perUnitQty?: number) => {
    // Check if this service is already on the ticket
    const existing = quote.items.find(
      (i) => i.itemType === 'service' && i.serviceId === service.id
    );

    if (existing) {
      const isPerUnit = service.pricing_model === 'per_unit' && existing.perUnitQty != null && existing.perUnitPrice != null;

      if (isPerUnit) {
        const max = service.per_unit_max ?? 10;
        if (existing.perUnitQty! >= max) {
          const label = service.per_unit_label || 'unit';
          toast.warning(`${service.name} is already at maximum (${max} ${label}${max > 1 ? 's' : ''})`);
        } else {
          dispatch({ type: 'UPDATE_PER_UNIT_QTY', itemId: existing.id, perUnitQty: existing.perUnitQty! + 1 });
          const label = service.per_unit_label || 'unit';
          const newQty = existing.perUnitQty! + 1;
          toast.success(`${service.name} — ${newQty} ${label}${newQty > 1 ? 's' : ''}`);
        }
      } else {
        toast.warning('Already added — remove it first to swap');
      }
      return;
    }

    dispatch({ type: 'ADD_SERVICE', service, pricing, vehicleSizeClass: vsc, perUnitQty });
    toast.success(`Added ${service.name}`);
  }, [dispatch, quote.items]);

  // Global search handlers (for search in the Register-like view)
  const searchLower = search.toLowerCase();

  const filteredProducts = search
    ? products.filter((p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.sku?.toLowerCase().includes(searchLower) ||
        p.barcode?.toLowerCase().includes(searchLower)
      )
    : [];

  const filteredServices = search
    ? services.filter((s) => s.name.toLowerCase().includes(searchLower))
    : [];

  function handleTapServiceSearch(service: CatalogService) {
    // Per-unit services always need the quantity picker
    if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
      setPickerService(service);
      return;
    }

    const pricing = service.pricing ?? [];
    if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
      handleAddService(service, pricing[0], vehicleSizeClass);
      return;
    }
    if (pricing.length === 0 && service.flat_price != null) {
      const syntheticPricing: ServicePricing = {
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
      };
      handleAddService(service, syntheticPricing, vehicleSizeClass);
      return;
    }
    setPickerService(service);
  }

  function handlePricingSelect(pricing: ServicePricing, vsc: VehicleSizeClass | null, perUnitQty?: number) {
    if (!pickerService) return;
    handleAddService(pickerService, pricing, vsc, perUnitQty);
    setPickerService(null);
  }

  if (loadingQuote) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px]">
      {/* Left panel — Catalog */}
      <div className="flex min-w-0 flex-col overflow-hidden">
        {/* Back + Search bar */}
        <div className="shrink-0 px-4 pt-4">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <h1 className="text-base font-semibold text-gray-900">
              {walkInMode ? 'New Walk-In' : quoteId ? 'Edit Quote' : 'New Quote'}
            </h1>
          </div>
          <SearchBar value={search} onChange={setSearch} />
        </div>

        {/* Tab bar */}
        <div className="shrink-0 px-4 pt-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(['products', 'services'] as CatalogTab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setSearch('');
                }}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition-all',
                  tab === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {catalogLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : search ? (
            // Search results
            <div className="space-y-4 p-4">
              {tab === 'products' && filteredProducts.length > 0 && (
                <ProductGrid products={filteredProducts} onTapProduct={handleAddProduct} />
              )}
              {tab === 'services' && filteredServices.length > 0 && (
                <ServiceGrid
                  services={filteredServices}
                  vehicleSizeClass={vehicleSizeClass}
                  onTapService={handleTapServiceSearch}
                  addedServiceIds={addedServiceIds}
                />
              )}
              {((tab === 'products' && filteredProducts.length === 0) ||
                (tab === 'services' && filteredServices.length === 0)) && (
                <div className="flex h-40 items-center justify-center text-sm text-gray-400">
                  No results for &quot;{search}&quot;
                </div>
              )}
            </div>
          ) : (
            <CatalogBrowser
              key={tab}
              type={tab}
              search=""
              onAddProduct={handleAddProduct}
              onAddService={handleAddService}
              vehicleSizeOverride={vehicleSizeClass}
              addedServiceIds={addedServiceIds}
            />
          )}
        </div>
      </div>

      {/* Right panel — Quote Ticket */}
      <QuoteTicketPanel onSaved={onSaved} walkInMode={walkInMode} />

      {/* Service Pricing Picker Dialog (for search results) */}
      {pickerService && (
        <ServicePricingPicker
          open={!!pickerService}
          onClose={() => setPickerService(null)}
          service={pickerService}
          vehicleSizeClass={vehicleSizeClass as VehicleSizeClass | null}
          onSelect={handlePricingSelect}
        />
      )}
    </div>
  );
}
