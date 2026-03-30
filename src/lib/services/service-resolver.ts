import { type SupabaseClient } from '@supabase/supabase-js';
import { getSaleStatus } from '@/lib/utils/sale-pricing';

export interface ResolvedService {
  id: string;
  name: string;
  pricing_model: string;
  flat_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  service_pricing: Array<{
    tier_name: string;
    price: number;
    sale_price: number | null;
    vehicle_size_sedan_price: number | null;
    vehicle_size_truck_suv_price: number | null;
    vehicle_size_suv_van_price: number | null;
    is_vehicle_size_aware: boolean;
  }>;
}

/** Case-insensitive service lookup with pricing tiers */
export async function resolveServiceByName(
  admin: SupabaseClient,
  name: string
): Promise<ResolvedService | null> {
  const { data } = await admin
    .from('services')
    .select(`
      id, name, pricing_model, flat_price, sale_price, sale_starts_at, sale_ends_at,
      service_pricing(tier_name, price, sale_price, vehicle_size_sedan_price,
        vehicle_size_truck_suv_price, vehicle_size_suv_van_price, is_vehicle_size_aware)
    `)
    .ilike('name', name)
    .eq('is_active', true)
    .limit(1)
    .single();

  return data as ResolvedService | null;
}

export interface ResolvedPrice {
  price: number;
  salePrice: number | null;
  tierName: string | null;
  isOnSale: boolean;
}

/** Resolve the correct price for a service given vehicle size class, with sale awareness */
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string
): ResolvedPrice {
  const tiers = service.service_pricing || [];
  const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
  const { isOnSale: saleActive } = getSaleStatus(saleWindow);

  switch (service.pricing_model) {
    case 'flat': {
      const standardPrice = service.flat_price ?? 0;
      const sp = service.sale_price;
      const onSale = saleActive && sp != null && sp < standardPrice;
      return {
        price: standardPrice,
        salePrice: onSale ? sp : null,
        tierName: null,
        isOnSale: onSale,
      };
    }

    case 'vehicle_size':
    case 'scope': {
      if (tiers.length === 0) {
        const standardPrice = service.flat_price ?? 0;
        return { price: standardPrice, salePrice: null, tierName: null, isOnSale: false };
      }

      // Prefer the vehicle-size-aware tier when a vehicle is known —
      // for scope services like Hot Shampoo, this selects "Complete Interior"
      // instead of "Floor Mats Only" (the first tier by display_order).
      const sizeAwareTier = tiers.find((t) => t.is_vehicle_size_aware && t.vehicle_size_sedan_price != null);
      const tier = sizeAwareTier || tiers[0];

      let standardPrice: number;
      if (tier.is_vehicle_size_aware && tier.vehicle_size_sedan_price != null) {
        switch (sizeClass) {
          case 'truck_suv_2row':
            standardPrice = tier.vehicle_size_truck_suv_price ?? tier.price;
            break;
          case 'suv_3row_van':
            standardPrice = tier.vehicle_size_suv_van_price ?? tier.price;
            break;
          default:
            standardPrice = tier.vehicle_size_sedan_price ?? tier.price;
            break;
        }
      } else {
        standardPrice = tier.price;
      }

      // Check tier-level sale price
      const sp = tier.sale_price;
      const onSale = saleActive && sp != null && sp < standardPrice;
      return {
        price: standardPrice,
        salePrice: onSale ? sp : null,
        tierName: tier.tier_name,
        isOnSale: onSale,
      };
    }

    default: {
      // per_unit, specialty, custom — first tier as fallback
      if (tiers.length > 0) {
        const tier = tiers[0];
        const standardPrice = tier.price;
        const sp = tier.sale_price;
        const onSale = saleActive && sp != null && sp < standardPrice;
        return {
          price: standardPrice,
          salePrice: onSale ? sp : null,
          tierName: tier.tier_name,
          isOnSale: onSale,
        };
      }
      return { price: service.flat_price ?? 0, salePrice: null, tierName: null, isOnSale: false };
    }
  }
}
