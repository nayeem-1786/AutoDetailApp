import { type SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedService {
  id: string;
  name: string;
  pricing_model: string;
  flat_price: number | null;
  service_pricing: Array<{
    tier_name: string;
    price: number;
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
      id, name, pricing_model, flat_price,
      service_pricing(tier_name, price, vehicle_size_sedan_price,
        vehicle_size_truck_suv_price, vehicle_size_suv_van_price, is_vehicle_size_aware)
    `)
    .ilike('name', name)
    .eq('is_active', true)
    .limit(1)
    .single();

  return data as ResolvedService | null;
}

/** Resolve the correct price for a service given vehicle size class */
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string
): { price: number; tierName: string | null } {
  const tiers = service.service_pricing || [];

  switch (service.pricing_model) {
    case 'flat':
      return { price: service.flat_price ?? 0, tierName: null };

    case 'vehicle_size':
    case 'scope': {
      if (tiers.length === 0) return { price: service.flat_price ?? 0, tierName: null };

      // Prefer the vehicle-size-aware tier when a vehicle is known —
      // for scope services like Hot Shampoo, this selects "Complete Interior"
      // instead of "Floor Mats Only" (the first tier by display_order).
      const sizeAwareTier = tiers.find((t) => t.is_vehicle_size_aware && t.vehicle_size_sedan_price != null);
      const tier = sizeAwareTier || tiers[0];

      if (tier.is_vehicle_size_aware && tier.vehicle_size_sedan_price != null) {
        switch (sizeClass) {
          case 'truck_suv_2row':
            return { price: tier.vehicle_size_truck_suv_price ?? tier.price, tierName: tier.tier_name };
          case 'suv_3row_van':
            return { price: tier.vehicle_size_suv_van_price ?? tier.price, tierName: tier.tier_name };
          default:
            return { price: tier.vehicle_size_sedan_price ?? tier.price, tierName: tier.tier_name };
        }
      }
      return { price: tier.price, tierName: tier.tier_name };
    }

    default:
      // per_unit, specialty, custom — first tier as fallback
      if (tiers.length > 0) return { price: tiers[0].price, tierName: tiers[0].tier_name };
      return { price: service.flat_price ?? 0, tierName: null };
  }
}
