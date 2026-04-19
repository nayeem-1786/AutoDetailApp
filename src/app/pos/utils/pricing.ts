import type { Service, ServicePricing, Vehicle, VehicleSizeClass } from '@/lib/supabase/types';
import { getSaleStatus, type SaleWindow } from '@/lib/utils/sale-pricing';

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
  ];

  return [Math.min(...prices), Math.max(...prices)];
}

// ---------------------------------------------------------------------------
// Specialty vehicle tier selection — exotic/classic pricing
// ---------------------------------------------------------------------------

/**
 * Select the correct service_pricing tier row for a specialty vehicle.
 * For exotic vehicles: looks for tier_name = 'exotic'.
 * For classic vehicles: looks for tier_name = 'classic'.
 * Returns null if tier doesn't exist or has price <= 0 (modal should open).
 * Dual-flag vehicles should never reach here (gate opens modal for them).
 */
export function selectPricingTierForVehicle(
  service: Service & { pricing?: ServicePricing[] },
  vehicle: Vehicle | null
): ServicePricing | null {
  if (!service.pricing) return null;

  if (vehicle?.is_exotic && !vehicle.is_classic) {
    const row = service.pricing.find(p => p.tier_name === 'exotic');
    return row && row.price > 0 ? row : null;
  }

  if (vehicle?.is_classic && !vehicle.is_exotic) {
    const row = service.pricing.find(p => p.tier_name === 'classic');
    return row && row.price > 0 ? row : null;
  }

  // Dual-flag should never reach here
  return null;
}

/**
 * Determine whether the custom pricing modal should open for this vehicle + service combo.
 * Returns true (open modal) when:
 *   - Dual-flag vehicle (is_exotic AND is_classic): always
 *   - Single-flag vehicle with no matching tier row or price <= 0
 * Returns false (skip modal, use tier price) when:
 *   - Normal vehicle (no requires_custom_quote)
 *   - Single-flag vehicle with valid tier row (price > 0)
 */
export function shouldOpenSpecialtyModal(
  vehicle: Vehicle | null,
  service: Service & { pricing?: ServicePricing[] }
): boolean {
  if (!vehicle?.requires_custom_quote) return false;
  if (vehicle.is_exotic && vehicle.is_classic) return true; // dual-flag: always modal

  const tierName = vehicle.is_exotic ? 'exotic' : 'classic';
  const tierRow = service.pricing?.find(p => p.tier_name === tierName);
  if (!tierRow || tierRow.price <= 0) return true; // missing/invalid tier: modal

  return false; // single-flag, valid tier: skip modal
}
