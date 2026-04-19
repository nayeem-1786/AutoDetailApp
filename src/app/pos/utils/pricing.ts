import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { getSaleStatus, type SaleWindow } from '@/lib/utils/sale-pricing';

/**
 * Resolve the correct price from a ServicePricing tier based on vehicle size.
 * Falls back to the base tier price if no vehicle-size-specific price exists.
 *
 * Session 29: size_class is 5-value ('sedan' | 'truck_suv_2row' | 'suv_3row_van' |
 * 'exotic' | 'classic'). Exotic and classic are first-class members — no special
 * dispatch needed. A missing per-size column (e.g., vehicle_size_exotic_price on a
 * service that only has sedan/truck/van fan-out configured) falls back to pricing.price.
 */
export function resolveServicePrice(
  pricing: ServicePricing,
  vehicleSizeClass: VehicleSizeClass | null
): number {
  if (!pricing.is_vehicle_size_aware || !vehicleSizeClass) {
    return pricing.price;
  }

  switch (vehicleSizeClass) {
    case 'sedan':
      return pricing.vehicle_size_sedan_price ?? pricing.price;
    case 'truck_suv_2row':
      return pricing.vehicle_size_truck_suv_price ?? pricing.price;
    case 'suv_3row_van':
      return pricing.vehicle_size_suv_van_price ?? pricing.price;
    case 'exotic':
      return pricing.vehicle_size_exotic_price ?? pricing.price;
    case 'classic':
      return pricing.vehicle_size_classic_price ?? pricing.price;
    default:
      return pricing.price;
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
  if (!saleWindow || !pricing.sale_price) {
    return { standardPrice, effectivePrice: standardPrice, isOnSale: false, saleSavings: 0 };
  }
  const { isOnSale } = getSaleStatus(saleWindow);
  if (isOnSale && pricing.sale_price < standardPrice) {
    return {
      standardPrice,
      effectivePrice: pricing.sale_price,
      isOnSale: true,
      saleSavings: standardPrice - pricing.sale_price,
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
    return [pricing.price, pricing.price];
  }

  const prices = [
    pricing.vehicle_size_sedan_price ?? pricing.price,
    pricing.vehicle_size_truck_suv_price ?? pricing.price,
    pricing.vehicle_size_suv_van_price ?? pricing.price,
    pricing.vehicle_size_exotic_price ?? pricing.price,
    pricing.vehicle_size_classic_price ?? pricing.price,
  ];

  return [Math.min(...prices), Math.max(...prices)];
}
