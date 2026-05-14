import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { getSaleStatus, type SaleWindow } from '@/lib/utils/sale-pricing';

/**
 * Resolve the correct price from a ServicePricing tier based on vehicle size.
 * Falls back to the base tier price if no vehicle-size-specific price exists.
 *
 * Session 29: size_class is 5-value ('sedan' | 'truck_suv_2row' | 'suv_3row_van' |
 * 'exotic' | 'classic'). Exotic and classic are first-class members — no special
 * dispatch needed. A missing per-size column (e.g., vehicle_size_exotic_price_cents on a
 * service that only has sedan/truck/van fan-out configured) falls back to pricing.price_cents.
 */
export function resolveServicePrice(
  pricing: ServicePricing,
  vehicleSizeClass: VehicleSizeClass | null
): number {
  if (!pricing.is_vehicle_size_aware || !vehicleSizeClass) {
    return pricing.price_cents;
  }

  switch (vehicleSizeClass) {
    case 'sedan':
      return pricing.vehicle_size_sedan_price_cents ?? pricing.price_cents;
    case 'truck_suv_2row':
      return pricing.vehicle_size_truck_suv_price_cents ?? pricing.price_cents;
    case 'suv_3row_van':
      return pricing.vehicle_size_suv_van_price_cents ?? pricing.price_cents;
    case 'exotic':
      return pricing.vehicle_size_exotic_price_cents ?? pricing.price_cents;
    case 'classic':
      return pricing.vehicle_size_classic_price_cents ?? pricing.price_cents;
    default:
      return pricing.price_cents;
  }
}

/**
 * Resolve the correct price with sale pricing awareness.
 * Returns both the standard price and the effective (possibly discounted) price.
 */
export interface ResolvedPrice {
  standardPrice: number;
  effectivePrice: number;
  isOnSale: boolean;
  saleSavings: number;
}

export function resolveServicePriceWithSale(
  pricing: ServicePricing,
  vehicleSizeClass: VehicleSizeClass | null,
  saleWindow: SaleWindow | null
): ResolvedPrice {
  const standardPrice = resolveServicePrice(pricing, vehicleSizeClass);
  if (!saleWindow || !pricing.sale_price_cents) {
    return { standardPrice, effectivePrice: standardPrice, isOnSale: false, saleSavings: 0 };
  }
  const { isOnSale } = getSaleStatus(saleWindow);
  if (isOnSale && pricing.sale_price_cents < standardPrice) {
    return {
      standardPrice,
      effectivePrice: pricing.sale_price_cents,
      isOnSale: true,
      saleSavings: standardPrice - pricing.sale_price_cents,
    };
  }
  return { standardPrice, effectivePrice: standardPrice, isOnSale: false, saleSavings: 0 };
}

/**
 * Get the display price range for a service pricing tier.
 * Returns [min, max] or [price, price] if all the same.
 */
export function getServicePriceRange(pricing: ServicePricing): [number, number] {
  if (!pricing.is_vehicle_size_aware) {
    return [pricing.price_cents, pricing.price_cents];
  }

  const prices = [
    pricing.vehicle_size_sedan_price_cents ?? pricing.price_cents,
    pricing.vehicle_size_truck_suv_price_cents ?? pricing.price_cents,
    pricing.vehicle_size_suv_van_price_cents ?? pricing.price_cents,
    pricing.vehicle_size_exotic_price_cents ?? pricing.price_cents,
    pricing.vehicle_size_classic_price_cents ?? pricing.price_cents,
  ];

  return [Math.min(...prices), Math.max(...prices)];
}
