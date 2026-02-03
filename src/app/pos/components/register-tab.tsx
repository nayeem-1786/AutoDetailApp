'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Users, DollarSign, Tag, Package, Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFavorites } from '../hooks/use-favorites';
import { useCatalog } from '../hooks/use-catalog';
import { useTicket } from '../context/ticket-context';
import { ServicePricingPicker } from './service-pricing-picker';
import { PinPad } from './pin-pad';
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

interface RegisterTabProps {
  onOpenCustomerLookup: () => void;
}

export function RegisterTab({ onOpenCustomerLookup }: RegisterTabProps) {
  const { favorites, loading: favLoading } = useFavorites();
  const { products, services } = useCatalog();
  const { ticket, dispatch } = useTicket();
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);

  // Keypad state
  const [cents, setCents] = useState(0);
  const [note, setNote] = useState('');
  const keypadRef = useRef<HTMLDivElement>(null);

  const vehicleSizeClass = ticket.vehicle?.size_class ?? null;
  const dollars = cents / 100;
  const display = dollars.toFixed(2);

  // ─── Favorites handlers ────────────────────────────────────

  function handleTapFavorite(fav: FavoriteItem) {
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
          dispatch({ type: 'ADD_SERVICE', service, pricing: pricing[0], vehicleSizeClass });
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
          dispatch({ type: 'ADD_SERVICE', service, pricing: syntheticPricing, vehicleSizeClass });
          toast.success(`Added ${service.name}`);
          return;
        }
        setPickerService(service);
        break;
      }
      case 'custom_amount':
        // Scroll to keypad section on same page
        keypadRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    dispatch({ type: 'ADD_SERVICE', service: pickerService, pricing, vehicleSizeClass: vsc });
    toast.success(`Added ${pickerService.name}`);
    setPickerService(null);
  }

  // ─── Keypad handlers ────────────────────────────────────────

  function handleDigit(d: string) {
    if (d === '.') return; // Ignore decimal — cents-based input
    const next = cents * 10 + parseInt(d, 10);
    if (next > 9999999) return; // Cap at $99,999.99
    setCents(next);
  }

  function handleBackspace() {
    setCents(Math.floor(cents / 10));
  }

  function handleAddToTicket() {
    if (cents === 0) {
      toast.error('Enter an amount');
      return;
    }
    dispatch({
      type: 'ADD_CUSTOM_ITEM',
      name: note.trim() || 'Custom Item',
      price: dollars,
      isTaxable: false,
    });
    toast.success(`Added $${display}`);
    setCents(0);
    setNote('');
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {/* Header row: dollar display + note input, right-aligned to keypad column */}
      <div className="mb-2 flex justify-end">
        <div className="w-1/2 pl-2">
          <div className="mb-3 flex items-center justify-center py-4">
            <span
              className={cn(
                'tabular-nums font-bold',
                cents === 0 ? 'text-gray-300' : 'text-gray-900',
                display.length > 8 ? 'text-4xl' : 'text-6xl'
              )}
            >
              ${display}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Description..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              maxLength={100}
            />
            {note && (
              <button
                onClick={() => setNote('')}
                className="shrink-0 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main grid: favorites + numpad aligned */}
      <div className="grid flex-1 grid-cols-2 gap-4">
        {/* Left — Favorites (3 cols) */}
        <div>
          {favLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : favorites.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {favorites.slice(0, 15).map((fav) => {
                const colors = COLOR_MAP[fav.color] ?? COLOR_MAP.blue;
                const Icon = TYPE_ICONS[fav.type] ?? Package;
                return (
                  <button
                    key={fav.id}
                    onClick={() => handleTapFavorite(fav)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-3 transition-all',
                      'min-h-[64px] active:scale-[0.97]',
                      colors.bg,
                      colors.text,
                      colors.hover
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="line-clamp-2 text-center text-xs font-semibold leading-tight">
                      {fav.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
              No favorites configured — add via Admin &gt; Settings
            </div>
          )}
        </div>

        {/* Right — Numpad */}
        <div ref={keypadRef}>
          <PinPad
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onAction={handleAddToTicket}
            actionLabel="Add to Ticket"
            size="default"
          />
        </div>
      </div>

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
