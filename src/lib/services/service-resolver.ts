import { type SupabaseClient } from '@supabase/supabase-js';
import { getSaleStatus } from '@/lib/utils/sale-pricing';

// Money-Unify-3 (Family D): all money fields are integer cents.
// Internal computation, exported types, and the SELECT projection
// against services/service_pricing all use the *_cents columns.

export interface ResolvedService {
  id: string;
  name: string;
  pricing_model: string;
  flat_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  service_pricing: Array<{
    tier_name: string;
    price_cents: number | null;
    sale_price_cents: number | null;
    vehicle_size_sedan_price_cents: number | null;
    vehicle_size_truck_suv_price_cents: number | null;
    vehicle_size_suv_van_price_cents: number | null;
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
      id, name, pricing_model, flat_price_cents, sale_price_cents, sale_starts_at, sale_ends_at,
      service_pricing(tier_name, price_cents, sale_price_cents, vehicle_size_sedan_price_cents,
        vehicle_size_truck_suv_price_cents, vehicle_size_suv_van_price_cents, is_vehicle_size_aware)
    `)
    .ilike('name', name)
    .eq('is_active', true)
    .limit(1)
    .single();

  return data as ResolvedService | null;
}

export interface ResolvedPrice {
  /** Cents */
  priceCents: number;
  /** Cents */
  salePriceCents: number | null;
  tierName: string | null;
  isOnSale: boolean;
}

/** Resolve the correct price for a service given vehicle size class, with sale awareness (cents). */
export function resolvePrice(
  service: ResolvedService,
  sizeClass: string
): ResolvedPrice {
  const tiers = service.service_pricing || [];
  const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
  const { isOnSale: saleActive } = getSaleStatus(saleWindow);

  switch (service.pricing_model) {
    case 'flat': {
      const standardPriceCents = service.flat_price_cents ?? 0;
      const sp = service.sale_price_cents;
      const onSale = saleActive && sp != null && sp < standardPriceCents;
      return {
        priceCents: standardPriceCents,
        salePriceCents: onSale ? sp : null,
        tierName: null,
        isOnSale: onSale,
      };
    }

    case 'vehicle_size':
    case 'scope': {
      if (tiers.length === 0) {
        const standardPriceCents = service.flat_price_cents ?? 0;
        return { priceCents: standardPriceCents, salePriceCents: null, tierName: null, isOnSale: false };
      }

      // Prefer the vehicle-size-aware tier when a vehicle is known —
      // for scope services like Hot Shampoo, this selects "Complete Interior"
      // instead of "Floor Mats Only" (the first tier by display_order).
      const sizeAwareTier = tiers.find((t) => t.is_vehicle_size_aware && t.vehicle_size_sedan_price_cents != null);
      const matchingTier = tiers.find((t) => t.tier_name === sizeClass);
      const tier = sizeAwareTier || matchingTier || tiers[0];

      let standardPriceCents: number;
      if (tier.is_vehicle_size_aware && tier.vehicle_size_sedan_price_cents != null) {
        switch (sizeClass) {
          case 'truck_suv_2row':
            standardPriceCents = tier.vehicle_size_truck_suv_price_cents ?? tier.price_cents ?? 0;
            break;
          case 'suv_3row_van':
            standardPriceCents = tier.vehicle_size_suv_van_price_cents ?? tier.price_cents ?? 0;
            break;
          default:
            standardPriceCents = tier.vehicle_size_sedan_price_cents ?? tier.price_cents ?? 0;
            break;
        }
      } else {
        standardPriceCents = tier.price_cents ?? 0;
      }

      // Check tier-level sale price
      const sp = tier.sale_price_cents;
      const onSale = saleActive && sp != null && sp < standardPriceCents;
      return {
        priceCents: standardPriceCents,
        salePriceCents: onSale ? sp : null,
        tierName: tier.tier_name,
        isOnSale: onSale,
      };
    }

    default: {
      // per_unit, specialty, custom — first tier as fallback
      if (tiers.length > 0) {
        const tier = tiers[0];
        const standardPriceCents = tier.price_cents ?? 0;
        const sp = tier.sale_price_cents;
        const onSale = saleActive && sp != null && sp < standardPriceCents;
        return {
          priceCents: standardPriceCents,
          salePriceCents: onSale ? sp : null,
          tierName: tier.tier_name,
          isOnSale: onSale,
        };
      }
      return { priceCents: service.flat_price_cents ?? 0, salePriceCents: null, tierName: null, isOnSale: false };
    }
  }
}
