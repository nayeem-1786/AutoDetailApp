import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Resolve the correct price from a ServicePricing tier based on vehicle size.
 * Falls back to the base tier price if no vehicle-size-specific price exists.
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
    default:
      return pricing.price;
  }
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
  ];

  return [Math.min(...prices), Math.max(...prices)];
}
