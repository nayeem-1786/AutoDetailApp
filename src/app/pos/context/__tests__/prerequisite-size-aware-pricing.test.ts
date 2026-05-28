import { describe, it, expect } from 'vitest';
import { ticketReducer, initialTicketState } from '../ticket-reducer';
import { quoteReducer, initialQuoteState } from '../quote-reducer';
import { selectPricingTierForVehicle } from '@/lib/services/picker-engine';
import type { Service, ServicePricing } from '@/lib/supabase/types';

/**
 * Regression lock for the POS prerequisite auto-add size-aware pricing bug
 * (docs/dev/POS_PREREQUISITE_PRICING_AUDIT.md).
 *
 * Before the fix, the prerequisite auto-add path grabbed `prereqPricing[0]`
 * (always the sedan/first tier). For a Suburban (suv_3row_van) the auto-added
 * "Express Exterior Wash" prerequisite was priced at $75 (sedan) instead of
 * $110 (suv_3row_van). The fix routes the prereq through the canonical
 * `selectPricingTierForVehicle`, exactly like the normal-add path.
 *
 * These tests assert that the tier the prerequisite path now selects, when
 * dispatched into each reducer (the same ADD_SERVICE the components fire),
 * lands the size-correct price — and that the old [0] would have been wrong.
 */

// "Express Exterior Wash" — real row-based vehicle_size pricing (audit live data).
// One row per size_class; each is_vehicle_size_aware=false (price is the flat
// column on that row, NOT a per-size column).
function expressExteriorWashTiers(): ServicePricing[] {
  const base: Omit<ServicePricing, 'id' | 'tier_name' | 'tier_label' | 'price' | 'display_order'> = {
    service_id: 'prereq-svc',
    sale_price: null,
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
  return [
    { ...base, id: 'sedan', tier_name: 'sedan', tier_label: 'Sedan', price: 75, display_order: 0 },
    { ...base, id: 'truck', tier_name: 'truck_suv_2row', tier_label: 'Truck/SUV (2-Row)', price: 90, display_order: 1 },
    { ...base, id: 'suvvan', tier_name: 'suv_3row_van', tier_label: 'SUV (3-Row) / Van', price: 110, display_order: 2 },
    { ...base, id: 'exotic', tier_name: 'exotic', tier_label: 'Exotic', price: 150, display_order: 3 },
    { ...base, id: 'classic', tier_name: 'classic', tier_label: 'Classic', price: 175, display_order: 4 },
  ];
}

function prereqService(pricing: ServicePricing[]): Service & { pricing: ServicePricing[] } {
  return {
    id: 'prereq-svc',
    name: 'Express Exterior Wash',
    slug: 'express-exterior-wash',
    description: null,
    category_id: null,
    is_active: true,
    display_order: 0,
    is_taxable: false,
    pricing_model: 'vehicle_size',
    flat_price: null,
    per_unit_price: null,
    per_unit_label: null,
    per_unit_max: null,
    base_duration_minutes: 30,
    sale_starts_at: null,
    sale_ends_at: null,
    sale_price: null,
    classification: 'primary',
    pricing,
  } as Service & { pricing: ServicePricing[] };
}

describe('prerequisite auto-add — size-aware tier selection', () => {
  it('selects the suv_3row_van tier ($110), not [0]/sedan ($75)', () => {
    const tiers = expressExteriorWashTiers();
    const tier = selectPricingTierForVehicle(tiers, 'suv_3row_van');
    expect(tier?.price).toBe(110);
    // The pre-fix code used tiers[0] — prove that would have been wrong.
    expect(tiers[0].price).toBe(75);
  });

  it('ticket reducer: dispatched prereq ADD_SERVICE for a suv_3row_van vehicle lands $110', () => {
    const svc = prereqService(expressExteriorWashTiers());
    const tier = selectPricingTierForVehicle(svc.pricing, 'suv_3row_van')!;
    const next = ticketReducer(initialTicketState, {
      type: 'ADD_SERVICE',
      service: svc,
      pricing: tier,
      vehicleSizeClass: 'suv_3row_van',
      prerequisiteForServiceId: 'addon-1',
    });
    const item = next.items[next.items.length - 1];
    expect(item.unitPrice).toBe(110);
    expect(item.totalPrice).toBe(110);
    expect(item.tierName).toBe('SUV (3-Row) / Van');
    expect(item.prerequisiteForServiceId).toBe('addon-1');
  });

  it('ticket reducer: the OLD [0] tier would have mispriced the prereq at $75 (regression direction)', () => {
    const svc = prereqService(expressExteriorWashTiers());
    const next = ticketReducer(initialTicketState, {
      type: 'ADD_SERVICE',
      service: svc,
      pricing: svc.pricing[0], // the pre-fix bug: always tier [0] = sedan
      vehicleSizeClass: 'suv_3row_van',
      prerequisiteForServiceId: 'addon-1',
    });
    expect(next.items[next.items.length - 1].unitPrice).toBe(75);
  });

  it('quote reducer: dispatched prereq ADD_SERVICE for a suv_3row_van vehicle lands $110', () => {
    const svc = prereqService(expressExteriorWashTiers());
    const tier = selectPricingTierForVehicle(svc.pricing, 'suv_3row_van')!;
    const next = quoteReducer(initialQuoteState, {
      type: 'ADD_SERVICE',
      service: svc,
      pricing: tier,
      vehicleSizeClass: 'suv_3row_van',
      prerequisiteForServiceId: 'addon-1',
    });
    const item = next.items[next.items.length - 1];
    expect(item.unitPrice).toBe(110);
    expect(item.prerequisiteForServiceId).toBe('addon-1');
  });

  it('every size class resolves to its own tier price (no cross-talk)', () => {
    const svc = prereqService(expressExteriorWashTiers());
    const expected: Record<string, number> = {
      sedan: 75,
      truck_suv_2row: 90,
      suv_3row_van: 110,
      exotic: 150,
      classic: 175,
    };
    for (const [size, price] of Object.entries(expected)) {
      const tier = selectPricingTierForVehicle(svc.pricing, size as never)!;
      const next = ticketReducer(initialTicketState, {
        type: 'ADD_SERVICE',
        service: svc,
        pricing: tier,
        vehicleSizeClass: size as never,
        prerequisiteForServiceId: 'addon-1',
      });
      expect(next.items[0].unitPrice).toBe(price);
    }
  });

  it('no-match (data gap) → selector returns null, which drives the block (no add)', () => {
    // A row-based prereq missing the vehicle's size tier. The component blocks
    // with a warning and adds nothing; here we lock the selector contract that
    // drives that block.
    const tiers = expressExteriorWashTiers().filter((t) => t.tier_name !== 'exotic');
    expect(selectPricingTierForVehicle(tiers, 'exotic')).toBeNull();
  });
});
