'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCatalog } from '../hooks/use-catalog';
import { useBarcodeScanner } from '../hooks/use-barcode-scanner';
import { useTicket } from '../context/ticket-context';
import type { CatalogProduct, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { SearchBar } from './search-bar';
import { CategoryTabs } from './category-tabs';
import { ProductGrid, ServiceGrid } from './catalog-grid';
import { ServicePricingPicker } from './service-pricing-picker';

export function CatalogPanel() {
  const { products, services, loading } = useCatalog();
  const { ticket, dispatch } = useTicket();

  const [tab, setTab] = useState('products');
  const [search, setSearch] = useState('');
  const [productCategoryId, setProductCategoryId] = useState<string | null>(null);
  const [serviceCategoryId, setServiceCategoryId] = useState<string | null>(null);

  // Service pricing picker state
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);

  // Barcode scanner
  useBarcodeScanner({
    onScan: (barcode) => {
      const product = products.find(
        (p) => p.barcode === barcode || p.sku === barcode
      );
      if (product) {
        dispatch({ type: 'ADD_PRODUCT', product });
        toast.success(`Added ${product.name}`);
      } else {
        toast.error(`No product found for barcode: ${barcode}`);
      }
    },
  });

  // Derive unique categories from products/services
  const productCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    products.forEach((p) => {
      if (p.category) map.set(p.category.id, { id: p.category.id, name: p.category.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const serviceCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    services.forEach((s) => {
      if (s.category) map.set(s.category.id, { id: s.category.id, name: s.category.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [services]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let list = products;
    if (productCategoryId) {
      list = list.filter((p) => p.category_id === productCategoryId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, productCategoryId, search]);

  // Filter services
  const filteredServices = useMemo(() => {
    let list = services;
    if (serviceCategoryId) {
      list = list.filter((s) => s.category_id === serviceCategoryId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [services, serviceCategoryId, search]);

  // Handlers
  function handleTapProduct(product: CatalogProduct) {
    dispatch({ type: 'ADD_PRODUCT', product });
    toast.success(`Added ${product.name}`);
  }

  function handleTapService(service: CatalogService) {
    const pricing = service.pricing ?? [];

    // Single tier with no vehicle-size pricing: add directly
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

    // Flat price service with no tiers: add directly
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
      dispatch({
        type: 'ADD_SERVICE',
        service,
        pricing: syntheticPricing,
        vehicleSizeClass: ticket.vehicle?.size_class ?? null,
      });
      toast.success(`Added ${service.name}`);
      return;
    }

    // Multiple tiers or vehicle-size pricing: open picker
    setPickerService(service);
  }

  function handlePricingSelect(
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null
  ) {
    if (!pickerService) return;
    dispatch({
      type: 'ADD_SERVICE',
      service: pickerService,
      pricing,
      vehicleSizeClass,
    });
    toast.success(`Added ${pickerService.name}`);
    setPickerService(null);
  }

  const vehicleSizeClass = ticket.vehicle?.size_class ?? null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <SearchBar value={search} onChange={setSearch} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="flex flex-col gap-3">
          <CategoryTabs
            categories={productCategories}
            selected={productCategoryId}
            onSelect={setProductCategoryId}
          />
          <div className="flex-1 overflow-y-auto">
            <ProductGrid
              products={filteredProducts}
              onTapProduct={handleTapProduct}
            />
          </div>
        </TabsContent>

        <TabsContent value="services" className="flex flex-col gap-3">
          <CategoryTabs
            categories={serviceCategories}
            selected={serviceCategoryId}
            onSelect={setServiceCategoryId}
          />
          <div className="flex-1 overflow-y-auto">
            <ServiceGrid
              services={filteredServices}
              vehicleSizeClass={vehicleSizeClass}
              onTapService={handleTapService}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Service Pricing Picker Dialog */}
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
