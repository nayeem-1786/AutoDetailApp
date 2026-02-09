'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Users, DollarSign, Tag, Package, Wrench, Percent, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFavorites } from '../hooks/use-favorites';
import { useCatalog } from '../hooks/use-catalog';
import { useTicket } from '../context/ticket-context';
import { ServicePricingPicker } from './service-pricing-picker';
import { PinPad } from './pin-pad';
import type { FavoriteItem, FavoriteColor, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

// Explicit Tailwind class map — 12 colors × 6 shades for JIT detection
const TILE_COLORS: Record<string, { bg: string; text: string; hover: string }> = {
  'red-10': { bg: 'bg-red-100', text: 'text-red-900', hover: 'hover:bg-red-200' },
  'red-25': { bg: 'bg-red-200', text: 'text-red-900', hover: 'hover:bg-red-300' },
  'red-40': { bg: 'bg-red-300', text: 'text-red-900', hover: 'hover:bg-red-400' },
  'red-60': { bg: 'bg-red-400', text: 'text-white', hover: 'hover:bg-red-500' },
  'red-80': { bg: 'bg-red-500', text: 'text-white', hover: 'hover:bg-red-600' },
  'red-100': { bg: 'bg-red-600', text: 'text-white', hover: 'hover:bg-red-700' },
  'orange-10': { bg: 'bg-orange-100', text: 'text-orange-900', hover: 'hover:bg-orange-200' },
  'orange-25': { bg: 'bg-orange-200', text: 'text-orange-900', hover: 'hover:bg-orange-300' },
  'orange-40': { bg: 'bg-orange-300', text: 'text-orange-900', hover: 'hover:bg-orange-400' },
  'orange-60': { bg: 'bg-orange-400', text: 'text-white', hover: 'hover:bg-orange-500' },
  'orange-80': { bg: 'bg-orange-500', text: 'text-white', hover: 'hover:bg-orange-600' },
  'orange-100': { bg: 'bg-orange-600', text: 'text-white', hover: 'hover:bg-orange-700' },
  'fuchsia-10': { bg: 'bg-fuchsia-100', text: 'text-fuchsia-900', hover: 'hover:bg-fuchsia-200' },
  'fuchsia-25': { bg: 'bg-fuchsia-200', text: 'text-fuchsia-900', hover: 'hover:bg-fuchsia-300' },
  'fuchsia-40': { bg: 'bg-fuchsia-300', text: 'text-fuchsia-900', hover: 'hover:bg-fuchsia-400' },
  'fuchsia-60': { bg: 'bg-fuchsia-400', text: 'text-white', hover: 'hover:bg-fuchsia-500' },
  'fuchsia-80': { bg: 'bg-fuchsia-500', text: 'text-white', hover: 'hover:bg-fuchsia-600' },
  'fuchsia-100': { bg: 'bg-fuchsia-600', text: 'text-white', hover: 'hover:bg-fuchsia-700' },
  'lime-10': { bg: 'bg-lime-100', text: 'text-lime-900', hover: 'hover:bg-lime-200' },
  'lime-25': { bg: 'bg-lime-200', text: 'text-lime-900', hover: 'hover:bg-lime-300' },
  'lime-40': { bg: 'bg-lime-300', text: 'text-lime-900', hover: 'hover:bg-lime-400' },
  'lime-60': { bg: 'bg-lime-400', text: 'text-white', hover: 'hover:bg-lime-500' },
  'lime-80': { bg: 'bg-lime-500', text: 'text-white', hover: 'hover:bg-lime-600' },
  'lime-100': { bg: 'bg-lime-600', text: 'text-white', hover: 'hover:bg-lime-700' },
  'cyan-10': { bg: 'bg-cyan-100', text: 'text-cyan-900', hover: 'hover:bg-cyan-200' },
  'cyan-25': { bg: 'bg-cyan-200', text: 'text-cyan-900', hover: 'hover:bg-cyan-300' },
  'cyan-40': { bg: 'bg-cyan-300', text: 'text-cyan-900', hover: 'hover:bg-cyan-400' },
  'cyan-60': { bg: 'bg-cyan-400', text: 'text-white', hover: 'hover:bg-cyan-500' },
  'cyan-80': { bg: 'bg-cyan-500', text: 'text-white', hover: 'hover:bg-cyan-600' },
  'cyan-100': { bg: 'bg-cyan-600', text: 'text-white', hover: 'hover:bg-cyan-700' },
  'rose-10': { bg: 'bg-rose-100', text: 'text-rose-900', hover: 'hover:bg-rose-200' },
  'rose-25': { bg: 'bg-rose-200', text: 'text-rose-900', hover: 'hover:bg-rose-300' },
  'rose-40': { bg: 'bg-rose-300', text: 'text-rose-900', hover: 'hover:bg-rose-400' },
  'rose-60': { bg: 'bg-rose-400', text: 'text-white', hover: 'hover:bg-rose-500' },
  'rose-80': { bg: 'bg-rose-500', text: 'text-white', hover: 'hover:bg-rose-600' },
  'rose-100': { bg: 'bg-rose-600', text: 'text-white', hover: 'hover:bg-rose-700' },
  'teal-10': { bg: 'bg-teal-100', text: 'text-teal-900', hover: 'hover:bg-teal-200' },
  'teal-25': { bg: 'bg-teal-200', text: 'text-teal-900', hover: 'hover:bg-teal-300' },
  'teal-40': { bg: 'bg-teal-300', text: 'text-teal-900', hover: 'hover:bg-teal-400' },
  'teal-60': { bg: 'bg-teal-400', text: 'text-white', hover: 'hover:bg-teal-500' },
  'teal-80': { bg: 'bg-teal-500', text: 'text-white', hover: 'hover:bg-teal-600' },
  'teal-100': { bg: 'bg-teal-600', text: 'text-white', hover: 'hover:bg-teal-700' },
  'blue-10': { bg: 'bg-blue-100', text: 'text-blue-900', hover: 'hover:bg-blue-200' },
  'blue-25': { bg: 'bg-blue-200', text: 'text-blue-900', hover: 'hover:bg-blue-300' },
  'blue-40': { bg: 'bg-blue-300', text: 'text-blue-900', hover: 'hover:bg-blue-400' },
  'blue-60': { bg: 'bg-blue-400', text: 'text-white', hover: 'hover:bg-blue-500' },
  'blue-80': { bg: 'bg-blue-500', text: 'text-white', hover: 'hover:bg-blue-600' },
  'blue-100': { bg: 'bg-blue-600', text: 'text-white', hover: 'hover:bg-blue-700' },
  'indigo-10': { bg: 'bg-indigo-100', text: 'text-indigo-900', hover: 'hover:bg-indigo-200' },
  'indigo-25': { bg: 'bg-indigo-200', text: 'text-indigo-900', hover: 'hover:bg-indigo-300' },
  'indigo-40': { bg: 'bg-indigo-300', text: 'text-indigo-900', hover: 'hover:bg-indigo-400' },
  'indigo-60': { bg: 'bg-indigo-400', text: 'text-white', hover: 'hover:bg-indigo-500' },
  'indigo-80': { bg: 'bg-indigo-500', text: 'text-white', hover: 'hover:bg-indigo-600' },
  'indigo-100': { bg: 'bg-indigo-600', text: 'text-white', hover: 'hover:bg-indigo-700' },
  'purple-10': { bg: 'bg-purple-100', text: 'text-purple-900', hover: 'hover:bg-purple-200' },
  'purple-25': { bg: 'bg-purple-200', text: 'text-purple-900', hover: 'hover:bg-purple-300' },
  'purple-40': { bg: 'bg-purple-300', text: 'text-purple-900', hover: 'hover:bg-purple-400' },
  'purple-60': { bg: 'bg-purple-400', text: 'text-white', hover: 'hover:bg-purple-500' },
  'purple-80': { bg: 'bg-purple-500', text: 'text-white', hover: 'hover:bg-purple-600' },
  'purple-100': { bg: 'bg-purple-600', text: 'text-white', hover: 'hover:bg-purple-700' },
  'pink-10': { bg: 'bg-pink-100', text: 'text-pink-900', hover: 'hover:bg-pink-200' },
  'pink-25': { bg: 'bg-pink-200', text: 'text-pink-900', hover: 'hover:bg-pink-300' },
  'pink-40': { bg: 'bg-pink-300', text: 'text-pink-900', hover: 'hover:bg-pink-400' },
  'pink-60': { bg: 'bg-pink-400', text: 'text-white', hover: 'hover:bg-pink-500' },
  'pink-80': { bg: 'bg-pink-500', text: 'text-white', hover: 'hover:bg-pink-600' },
  'pink-100': { bg: 'bg-pink-600', text: 'text-white', hover: 'hover:bg-pink-700' },
  'slate-10': { bg: 'bg-slate-100', text: 'text-slate-900', hover: 'hover:bg-slate-200' },
  'slate-25': { bg: 'bg-slate-200', text: 'text-slate-900', hover: 'hover:bg-slate-300' },
  'slate-40': { bg: 'bg-slate-300', text: 'text-slate-900', hover: 'hover:bg-slate-400' },
  'slate-60': { bg: 'bg-slate-400', text: 'text-white', hover: 'hover:bg-slate-500' },
  'slate-80': { bg: 'bg-slate-500', text: 'text-white', hover: 'hover:bg-slate-600' },
  'slate-100': { bg: 'bg-slate-600', text: 'text-white', hover: 'hover:bg-slate-700' },
};

const DEFAULT_TILE = { bg: 'bg-blue-500', text: 'text-white', hover: 'hover:bg-blue-600' };

function getTileColors(color: FavoriteColor, shade: number = 80) {
  return TILE_COLORS[`${color}-${shade}`] ?? TILE_COLORS[`${color}-80`] ?? DEFAULT_TILE;
}

const TYPE_ICONS: Record<string, typeof Package> = {
  product: Package,
  service: Wrench,
  custom_amount: DollarSign,
  customer_lookup: Users,
  discount: Tag,
  surcharge: Percent,
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
        // Per-unit services always need the quantity picker
        if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
          setPickerService(service);
          break;
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
      case 'surcharge': {
        const pct = Number(fav.percentage);
        if (!pct || pct <= 0) {
          toast.error('Surcharge percentage not configured — edit this favorite in Admin > Settings');
          return;
        }
        const subtotal = ticket.subtotal;
        if (subtotal <= 0) {
          toast.error('Add items before applying a surcharge');
          return;
        }
        const rate = pct / 100;
        const amount = Math.round(subtotal * rate * 100) / 100;
        dispatch({
          type: 'ADD_CUSTOM_ITEM',
          name: fav.label,
          price: amount,
          isTaxable: false,
        });
        toast.success(`Added ${fav.label}: $${amount.toFixed(2)}`);
        break;
      }
      case 'discount':
        toast.info('Coupon input coming soon');
        break;
    }
  }

  function handlePricingSelect(pricing: ServicePricing, vsc: VehicleSizeClass | null, perUnitQty?: number) {
    if (!pickerService) return;
    dispatch({ type: 'ADD_SERVICE', service: pickerService, pricing, vehicleSizeClass: vsc, perUnitQty });
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
      {/* Main grid: favorites + (dollar display + description + numpad) */}
      <div className="grid flex-1 grid-cols-2 gap-4">
        {/* Left — Favorites (3 cols) */}
        <div className="flex flex-col">
          {/* Spacer to align favorites top with description input */}
          <div className="mb-3 flex items-center justify-center py-4">
            <span className="text-6xl font-bold text-transparent select-none" aria-hidden="true">&nbsp;</span>
          </div>
          {favLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : favorites.length > 0 ? (
            <div className="grid grid-cols-3 gap-2" style={{ gridAutoRows: 'minmax(64px, 1fr)' }}>
              {favorites.slice(0, 15).map((fav) => {
                const colors = getTileColors(fav.color, fav.colorShade);
                const Icon = TYPE_ICONS[fav.type] ?? Package;
                return (
                  <button
                    key={fav.id}
                    onClick={() => handleTapFavorite(fav)}
                    className={cn(
                      'flex h-full flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-3 transition-all',
                      'active:scale-[0.97]',
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

        {/* Right — Dollar display + description + numpad */}
        <div>
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
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-3">
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
