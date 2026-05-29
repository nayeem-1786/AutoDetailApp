'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Package, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFavorites } from '../hooks/use-favorites';
import { useCatalog } from '../hooks/use-catalog';
import { useTicket } from '../context/ticket-context';
import { usePosPermission } from '../context/pos-permission-context';
import { usePosTheme } from '../context/pos-theme-context';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { useValidatedServiceAdd, type ValidatedAddOpts } from '../hooks/use-validated-service-add';
import { ServicePricingPicker } from './service-pricing-picker';
import { PinPad } from './pin-pad';
import { resolveServicePriceWithSale } from '../utils/pricing';
import { selectPricingTierForVehicle } from '@/lib/services/picker-engine';
import { getTileColors, TYPE_ICONS } from '@/lib/pos/tile-colors';
import type { FavoriteItem, CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/** Resolve sale-aware price for toast messages */
function getToastPrice(service: CatalogService, tier: ServicePricing, vsc: VehicleSizeClass | null): number {
  // Always pass window — null dates = no time limit
  const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
  return resolveServicePriceWithSale(tier, vsc, saleWindow).effectivePrice;
}

interface RegisterTabProps {
  onOpenCustomerLookup: () => void;
}

export function RegisterTab({ onOpenCustomerLookup }: RegisterTabProps) {
  const { favorites, loading: favLoading } = useFavorites();
  const { products, services } = useCatalog();
  const { ticket, dispatch } = useTicket();
  const { granted: canCreateTickets } = usePosPermission('pos.create_tickets');
  const { granted: canAddItems } = usePosPermission('pos.add_items');
  const { resolvedTheme } = usePosTheme();

  // Items cannot be added if:
  // 1. pos.add_items is denied (always blocked), OR
  // 2. pos.create_tickets is denied AND ticket is empty (can't start a new ticket)
  const ticketIsEmpty = ticket.items.length === 0;
  const addDisabled = !canAddItems || (!canCreateTickets && ticketIsEmpty);
  const [pickerService, setPickerService] = useState<CatalogService | null>(null);

  // Keypad state
  const [cents, setCents] = useState(0);
  const [note, setNote] = useState('');
  const keypadRef = useRef<HTMLDivElement>(null);

  const vehicleSizeClass = ticket.vehicle?.size_class ?? null;
  const vehicleSpecialtyTier = ticket.vehicle?.specialty_tier ?? null;
  const dollars = cents / 100;
  const display = dollars.toFixed(2);
  const enterSubmitNote = useEnterSubmit(handleAddToTicket, cents > 0);

  // Canonical add-time validation (CLAUDE.md Rule 22). The favorite quick-add
  // and the pricing picker route through this — the register tab previously
  // dispatched ADD_SERVICE directly with ZERO prerequisite or add-on-only
  // gating (POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md). `onAdd` is a plain
  // dispatch (no dup-check, matching the tab's prior behavior); the caller
  // shows the success toast, so `onAddHandlesToast` stays false.
  const ticketServiceIds = useMemo(
    () => ticket.items.filter((i) => i.itemType === 'service' && i.serviceId).map((i) => i.serviceId!),
    [ticket.items]
  );
  const commitAdd = useCallback((
    svc: CatalogService,
    p: ServicePricing,
    vsc: VehicleSizeClass | null,
    perUnitQty?: number,
    opts?: ValidatedAddOpts,
  ) => {
    dispatch({ type: 'ADD_SERVICE', service: svc, pricing: p, vehicleSizeClass: vsc, perUnitQty, prerequisiteNote: opts?.prerequisiteNote, prerequisiteForServiceId: opts?.prerequisiteForServiceId });
  }, [dispatch]);
  const { addService, dialogs: validationDialogs } = useValidatedServiceAdd({
    customerId: ticket.customer?.id ?? null,
    vehicleId: ticket.vehicle?.id ?? null,
    serviceIds: ticketServiceIds,
    services,
    vehicleSizeClass,
    onAdd: commitAdd,
    onAddHandlesToast: false,
  });

  // ─── Favorites handlers ────────────────────────────────────

  async function handleTapFavorite(fav: FavoriteItem) {
    // Allow non-item favorites (customer_lookup) through, but block item-adding ones
    const isItemFavorite = fav.type === 'product' || fav.type === 'service' || fav.type === 'custom_amount' || fav.type === 'surcharge';
    if (isItemFavorite && addDisabled) {
      toast.error(!canAddItems ? 'You do not have permission to add items' : 'You do not have permission to create tickets');
      return;
    }
    // Item 15f Phase 1 Layer 8d-bis — 4th product-add surface. Layer 8d
    // gated the Products tab, global search, and the barcode scanner; the
    // Register tab's favorite/quick-add buttons were missed. Product
    // favorites are colored buttons in the same grid as service favorites,
    // so the visual gating is per-button (service favorites continue to
    // work). Same toast text as the Layer 8d Products-tab gate for parity.
    if (ticket.editMode && fav.type === 'product') {
      toast.info(
        'Products can only be added at checkout. Save your service changes first, then add products during checkout.'
      );
      return;
    }
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
        // Require customer + vehicle before adding services
        if (!ticket.customer) {
          toast.error('Please select a customer first');
          return;
        }
        if (!ticket.vehicle) {
          window.dispatchEvent(new CustomEvent('pos-vehicle-needed', { detail: { service } }));
          toast.info('Please select a vehicle first');
          return;
        }
        // Per-unit services always need the quantity picker
        if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
          setPickerService(service);
          break;
        }
        const pricing = service.pricing ?? [];

        // Quick-add: single tier, not vehicle-size-aware. Routes through the
        // canonical helper (add-on gate → prereq → dispatch).
        if (pricing.length === 1 && !pricing[0].is_vehicle_size_aware) {
          if (await addService(service, pricing[0], vehicleSizeClass)) {
            toast.success(`Added ${service.name}`);
          }
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
          if (await addService(service, syntheticPricing, vehicleSizeClass)) {
            toast.success(`Added ${service.name}`);
          }
          return;
        }

        // Vehicle prequalification: auto-add the size-matched tier when one
        // resolves (canonical selection — CLAUDE.md Rule 22). Covers both
        // row-based size tiers (match by tier_name) and a single
        // vehicle-size-aware row (resolver reads the column). The single
        // non-size-aware + flat branches above already returned.
        const tier = selectPricingTierForVehicle(pricing, vehicleSizeClass);
        if (tier) {
          const price = getToastPrice(service, tier, vehicleSizeClass);
          if (await addService(service, tier, vehicleSizeClass)) {
            toast.success(`Added ${service.name} — $${price.toFixed(2)}`);
          }
          return;
        }

        // Fallback: open picker for multi-tier non-vehicle or no vehicle set
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

  async function handlePricingSelect(pricing: ServicePricing, vsc: VehicleSizeClass | null, perUnitQty?: number) {
    if (!pickerService) return;
    const svc = pickerService;
    setPickerService(null);
    if (await addService(svc, pricing, vsc, perUnitQty)) {
      toast.success(`Added ${svc.name}`);
    }
  }

  // ─── Keypad handlers ────────────────────────────────────────

  function handleDigit(d: string) {
    if (d === '.') return; // Defensive — `.` is no longer rendered in amount layout, kept as a guard.
    const next = d === '00' ? cents * 100 : cents * 10 + parseInt(d, 10);
    if (next > 9999999) return; // Cap at $99,999.99
    setCents(next);
  }

  function handleBackspace() {
    setCents(Math.floor(cents / 10));
  }

  function handleAddToTicket() {
    if (addDisabled) {
      toast.error(!canAddItems ? 'You do not have permission to add items' : 'You do not have permission to create tickets');
      return;
    }
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
      <div className="pos-register-layout grid flex-1 grid-cols-2 gap-4">
        {/* Left — Favorites (3 cols) */}
        <div className="flex flex-col">
          {/* Spacer to align favorites top with description input */}
          <div className="mb-3 flex items-center justify-center py-4">
            <span className="text-6xl font-bold text-transparent select-none" aria-hidden="true">&nbsp;</span>
          </div>
          {favLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
            </div>
          ) : favorites.length > 0 ? (
            <div className="pos-favorites-grid grid grid-cols-3 gap-2" style={{ gridAutoRows: 'minmax(64px, 1fr)' }}>
              {favorites.slice(0, 15).map((fav) => {
                // Use dark override color when in dark mode and override is set
                const useColor = (resolvedTheme === 'dark' && fav.darkColor) ? fav.darkColor : fav.color;
                const useShade = (resolvedTheme === 'dark' && fav.darkColor) ? (fav.darkColorShade ?? 80) : fav.colorShade;
                const colors = getTileColors(useColor, useShade);
                const Icon = TYPE_ICONS[fav.type] ?? Package;
                // Item 15f Phase 1 Layer 8d-bis — product favorites are
                // gated in edit mode (cascade endpoint accepts services
                // only). Visual treatment mirrors the disabled Products
                // tab — opacity-40 + cursor-not-allowed. The click handler
                // still surfaces the toast for accessibility (operator
                // can tap to see WHY it's disabled).
                const isProductGated = ticket.editMode && fav.type === 'product';
                return (
                  <button
                    key={fav.id}
                    onClick={() => handleTapFavorite(fav)}
                    aria-disabled={isProductGated || undefined}
                    title={
                      isProductGated
                        ? 'Products are added at checkout, not in edit mode'
                        : undefined
                    }
                    className={cn(
                      'flex h-full flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-3 transition-all',
                      'active:scale-[0.97]',
                      colors.bg,
                      colors.text,
                      colors.hover,
                      isProductGated && 'opacity-40 cursor-not-allowed'
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
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-400 dark:text-gray-500">
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
                cents === 0 ? 'text-gray-300 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100',
                display.length > 8 ? 'text-4xl' : 'text-6xl'
              )}
            >
              ${display}
            </span>
          </div>
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              {...enterSubmitNote}
              placeholder="Description..."
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none"
              maxLength={100}
            />
            {note && (
              <button
                onClick={() => setNote('')}
                className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
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
              layoutVariant="amount"
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
          vehicleSpecialtyTier={vehicleSpecialtyTier}
          onSelect={handlePricingSelect}
        />
      )}

      {/* Add-time validation dialogs (prerequisite + add-on-solo) */}
      {validationDialogs}
    </div>
  );
}
