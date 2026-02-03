'use client';

import { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useCatalog } from '../hooks/use-catalog';
import { useTicket } from '../context/ticket-context';
import type { CatalogProduct, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { CategoryTile } from './category-tile';
import { ProductGrid, ServiceGrid } from './catalog-grid';
import { ProductDetail } from './product-detail';
import { ServiceDetail } from './service-detail';
import { ServicePricingPicker } from './service-pricing-picker';

type BrowseState =
  | { view: 'categories' }
  | { view: 'items'; categoryId: string; categoryName: string }
  | { view: 'product-detail'; product: CatalogProduct; categoryName: string }
  | { view: 'service-detail'; service: CatalogService; categoryName: string };

interface CatalogBrowserProps {
  type: 'products' | 'services';
  search: string;
}

export function CatalogBrowser({ type, search }: CatalogBrowserProps) {
  const { products, services } = useCatalog();
  const { ticket, dispatch } = useTicket();
  const [browseState, setBrowseState] = useState<BrowseState>({ view: 'categories' });
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);

  const items = type === 'products' ? products : services;
  const vehicleSizeClass = ticket.vehicle?.size_class ?? null;

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
        // Use first available image
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

    // Add uncategorized items
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

  function handleTapProduct(product: CatalogProduct) {
    const catName =
      browseState.view === 'items'
        ? browseState.categoryName
        : product.category?.name ?? 'Products';
    setBrowseState({ view: 'product-detail', product, categoryName: catName });
  }

  function handleTapProductDirect(product: CatalogProduct) {
    dispatch({ type: 'ADD_PRODUCT', product });
    toast.success(`Added ${product.name}`);
  }

  function handleTapService(service: CatalogService) {
    const catName =
      browseState.view === 'items'
        ? browseState.categoryName
        : service.category?.name ?? 'Services';
    setBrowseState({ view: 'service-detail', service, categoryName: catName });
  }

  function handleTapServiceDirect(service: CatalogService) {
    const pricing = service.pricing ?? [];
    if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
      dispatch({
        type: 'ADD_SERVICE',
        service,
        pricing: pricing[0],
        vehicleSizeClass,
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
        vehicleSizeClass,
      });
      toast.success(`Added ${service.name}`);
      return;
    }
    setPickerService(service);
  }

  function handlePricingSelect(
    pricing: ServicePricing,
    vsc: VehicleSizeClass | null
  ) {
    if (!pickerService) return;
    dispatch({
      type: 'ADD_SERVICE',
      service: pickerService,
      pricing,
      vehicleSizeClass: vsc,
    });
    toast.success(`Added ${pickerService.name}`);
    setPickerService(null);
  }

  // If search is active, show flat list
  if (search) {
    return (
      <div className="p-4">
        {type === 'products' ? (
          <ProductGrid
            products={searchResults as CatalogProduct[]}
            onTapProduct={handleTapProductDirect}
          />
        ) : (
          <ServiceGrid
            services={searchResults as CatalogService[]}
            vehicleSizeClass={vehicleSizeClass}
            onTapService={handleTapServiceDirect}
          />
        )}

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

  // Product detail
  if (browseState.view === 'product-detail') {
    return (
      <ProductDetail
        product={browseState.product}
        categoryName={browseState.categoryName}
        onBack={() =>
          setBrowseState({
            view: 'items',
            categoryId:
              browseState.product.category_id ?? '__uncategorized__',
            categoryName: browseState.categoryName,
          })
        }
      />
    );
  }

  // Service detail
  if (browseState.view === 'service-detail') {
    return (
      <ServiceDetail
        service={browseState.service}
        categoryName={browseState.categoryName}
        onBack={() =>
          setBrowseState({
            view: 'items',
            categoryId:
              browseState.service.category_id ?? '__uncategorized__',
            categoryName: browseState.categoryName,
          })
        }
      />
    );
  }

  // Items in category
  if (browseState.view === 'items') {
    return (
      <div className="flex h-full flex-col">
        <button
          onClick={() => setBrowseState({ view: 'categories' })}
          className="flex shrink-0 items-center gap-1.5 px-4 pt-4 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          All Categories
        </button>
        <h3 className="px-4 pt-2 text-base font-semibold text-gray-900">
          {browseState.categoryName}
        </h3>
        <div className="flex-1 overflow-y-auto p-4">
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
            />
          )}
        </div>

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

  // Categories view (default)
  return (
    <div className="p-4">
      {categories.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">
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
    </div>
  );
}
