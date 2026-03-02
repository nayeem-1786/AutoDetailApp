'use client';

import { useState, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { useCatalog } from '../hooks/use-catalog';
import { useBarcodeScanner } from '../hooks/use-barcode-scanner';
import { useTicket } from '../context/ticket-context';
import type { CatalogProduct, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { SearchBar } from './search-bar';
import { ProductGrid, ServiceGrid } from './catalog-grid';
import { ServicePricingPicker } from './service-pricing-picker';
import { TicketPanel } from './ticket-panel';
import { RegisterTab } from './register-tab';
import { CatalogBrowser } from './catalog-browser';
import { PromotionsTab } from './promotions-tab';

type PosTab = 'register' | 'products' | 'services' | 'promotions';

const TABS: { key: PosTab; label: string }[] = [
  { key: 'register', label: 'Register' },
  { key: 'products', label: 'Products' },
  { key: 'services', label: 'Services' },
  { key: 'promotions', label: 'Promos' },
];

export function PosWorkspace() {
  const { products, services, loading } = useCatalog();
  const { ticket, dispatch } = useTicket();

  const [tab, setTab] = useState<PosTab>('register');
  const [search, setSearch] = useState('');
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);

  // Listen for Sale tab reset event from bottom nav
  useEffect(() => {
    const handler = () => {
      setTab('register');
      setSearch('');
    };
    window.addEventListener('pos-reset-register', handler);
    return () => window.removeEventListener('pos-reset-register', handler);
  }, []);

  // Barcode scanner
  useBarcodeScanner({
    onScan: (barcode) => {
      // 1. Exact match on barcode or SKU field
      const product = products.find(
        (p) => p.barcode === barcode || p.sku === barcode
      );

      if (product) {
        dispatch({ type: 'ADD_PRODUCT', product });
        toast.success(`Added ${product.name}`);
        setSearch('');
        return;
      }

      // 2. No exact match — check if text search has results
      //    (search bar already has the barcode text from scanner typing)
      const q = barcode.toLowerCase();
      const hasTextResults = products.some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      );

      if (hasTextResults) {
        // Text search found something — stay silent, let user pick from results
        return;
      }

      // 3. Nothing found anywhere — show error
      toast.error(`No product found for barcode: ${barcode}`);
    },
  });

  // Determine search scope
  const searchScope = tab === 'products' ? 'products' : tab === 'services' ? 'services' : 'all';

  // Filter products for global search
  const filteredProducts = useMemo(() => {
    if (!search || searchScope === 'services') return [];
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [products, search, searchScope]);

  // Filter services for global search
  const filteredServices = useMemo(() => {
    if (!search || searchScope === 'products') return [];
    const q = search.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, search, searchScope]);

  // Global search handlers
  function handleTapProduct(product: CatalogProduct) {
    dispatch({ type: 'ADD_PRODUCT', product });
    toast.success(`Added ${product.name}`);
  }

  function handleTapService(service: CatalogService) {
    // Per-unit services always need the quantity picker
    if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
      setPickerService(service);
      return;
    }

    const pricing = service.pricing ?? [];
    if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
      dispatch({
        type: 'ADD_SERVICE',
        service,
        pricing: pricing[0],
        vehicleSizeClass: ticket.vehicle?.size_class ?? null,
      });
      toast.success(`Added ${service.name}`);
      return;
    }
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
      dispatch({
        type: 'ADD_SERVICE',
        service,
        pricing: syntheticPricing,
        vehicleSizeClass: ticket.vehicle?.size_class ?? null,
      });
      toast.success(`Added ${service.name}`);
      return;
    }
    setPickerService(service);
  }

  function handlePricingSelect(
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null,
    perUnitQty?: number
  ) {
    if (!pickerService) return;
    dispatch({
      type: 'ADD_SERVICE',
      service: pickerService,
      pricing,
      vehicleSizeClass,
      perUnitQty,
    });
    toast.success(`Added ${pickerService.name}`);
    setPickerService(null);
  }

  const vehicleSizeClass = ticket.vehicle?.size_class ?? null;
  const vehicleSpecialtyTier = ticket.vehicle?.specialty_tier ?? null;
  const isGlobalSearch = search && tab === 'register';

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_380px] grid-rows-[1fr]">
      {/* Left panel */}
      <div className="flex min-w-0 flex-col overflow-hidden">
        {/* Search bar */}
        <div className="shrink-0 px-4 pt-4">
          <SearchBar value={search} onChange={setSearch} />
        </div>

        {/* Tab bar */}
        <div className="shrink-0 px-4 pt-3">
          <div className="flex gap-1 rounded-lg bg-gray-200 dark:bg-gray-800 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  if (t.key === 'promotions' && !ticket.customer) {
                    setShowCustomerLookup(true);
                  }
                  setTab(t.key);
                  setSearch('');
                }}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all',
                  tab === t.key
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-gray-950/30'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
            </div>
          ) : isGlobalSearch ? (
            // Global search results (from Register tab)
            <div className="space-y-4 p-4">
              {filteredProducts.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Products</h3>
                  <ProductGrid products={filteredProducts} onTapProduct={handleTapProduct} />
                </div>
              )}
              {filteredServices.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Services</h3>
                  <ServiceGrid
                    services={filteredServices}
                    vehicleSizeClass={vehicleSizeClass}
                    onTapService={handleTapService}
                  />
                </div>
              )}
              {filteredProducts.length === 0 && filteredServices.length === 0 && (
                <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                  No results for &quot;{search}&quot;
                </div>
              )}
            </div>
          ) : tab === 'register' ? (
            <RegisterTab
              onOpenCustomerLookup={() => setShowCustomerLookup(true)}
            />
          ) : tab === 'products' ? (
            <CatalogBrowser key="products" type="products" search={search} />
          ) : tab === 'services' ? (
            <CatalogBrowser key="services" type="services" search={search} />
          ) : tab === 'promotions' ? (
            <PromotionsTab
              onOpenCustomerLookup={() => setShowCustomerLookup(true)}
            />
          ) : null}
        </div>
      </div>

      {/* Right panel — Ticket */}
      <TicketPanel
        customerLookupOpen={showCustomerLookup}
        onCustomerLookupChange={setShowCustomerLookup}
      />

      {/* Service Pricing Picker Dialog (for global search results) */}
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
    </div>
  );
}
