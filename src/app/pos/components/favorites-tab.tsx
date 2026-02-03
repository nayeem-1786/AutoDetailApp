'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Users, DollarSign, Tag, Package, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFavorites } from '../hooks/use-favorites';
import { useCatalog } from '../hooks/use-catalog';
import { useTicket } from '../context/ticket-context';
import { ServicePricingPicker } from './service-pricing-picker';
import type { FavoriteItem, FavoriteColor, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

const COLOR_MAP: Record<FavoriteColor, { bg: string; text: string; hover: string }> = {
  blue:   { bg: 'bg-blue-500',   text: 'text-white', hover: 'hover:bg-blue-600' },
  green:  { bg: 'bg-green-500',  text: 'text-white', hover: 'hover:bg-green-600' },
  red:    { bg: 'bg-red-500',    text: 'text-white', hover: 'hover:bg-red-600' },
  purple: { bg: 'bg-purple-500', text: 'text-white', hover: 'hover:bg-purple-600' },
  orange: { bg: 'bg-orange-500', text: 'text-white', hover: 'hover:bg-orange-600' },
  amber:  { bg: 'bg-amber-500',  text: 'text-white', hover: 'hover:bg-amber-600' },
  teal:   { bg: 'bg-teal-500',   text: 'text-white', hover: 'hover:bg-teal-600' },
  pink:   { bg: 'bg-pink-500',   text: 'text-white', hover: 'hover:bg-pink-600' },
};

const TYPE_ICONS: Record<string, typeof Package> = {
  product: Package,
  service: Wrench,
  custom_amount: DollarSign,
  customer_lookup: Users,
  discount: Tag,
};

interface FavoritesTabProps {
  onSwitchToKeypad: () => void;
  onOpenCustomerLookup: () => void;
}

export function FavoritesTab({ onSwitchToKeypad, onOpenCustomerLookup }: FavoritesTabProps) {
  const { favorites, loading } = useFavorites();
  const { products, services } = useCatalog();
  const { ticket, dispatch } = useTicket();
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);

  const vehicleSizeClass = ticket.vehicle?.size_class ?? null;

  function handleTap(fav: FavoriteItem) {
    switch (fav.type) {
      case 'product': {
        const product = products.find((p) => p.id === fav.referenceId);
        if (product) {
          dispatch({ type: 'ADD_PRODUCT', product });
          toast.success(`Added ${product.name}`);
        } else {
          toast.error('Product not found');
        }
        break;
      }
      case 'service': {
        const service = services.find((s) => s.id === fav.referenceId);
        if (!service) {
          toast.error('Service not found');
          return;
        }
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
        break;
      }
      case 'custom_amount':
        onSwitchToKeypad();
        break;
      case 'customer_lookup':
        onOpenCustomerLookup();
        break;
      case 'discount':
        toast.info('Coupon input coming soon');
        break;
    }
  }

  function handlePricingSelect(pricing: ServicePricing, vsc: VehicleSizeClass | null) {
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
        <Package className="h-8 w-8" />
        <p className="text-sm">No favorites configured</p>
        <p className="text-xs">Add favorites in Admin &gt; Settings &gt; POS Favorites</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-3">
        {favorites.map((fav) => {
          const colors = COLOR_MAP[fav.color] ?? COLOR_MAP.blue;
          const Icon = TYPE_ICONS[fav.type] ?? Package;

          return (
            <button
              key={fav.id}
              onClick={() => handleTap(fav)}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-xl p-4 transition-all',
                'min-h-[100px] active:scale-[0.97]',
                colors.bg,
                colors.text,
                colors.hover
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-center text-sm font-semibold leading-tight">
                {fav.label}
              </span>
            </button>
          );
        })}
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
