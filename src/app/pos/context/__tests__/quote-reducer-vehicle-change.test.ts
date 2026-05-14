import { describe, it, expect, vi } from 'vitest';
import { quoteReducer, initialQuoteState } from '../quote-reducer';
import type { QuoteState, TicketItem } from '../../types';
import type { Service, ServicePricing, Vehicle } from '@/lib/supabase/types';
import { VEHICLE_SIZE_CLASS_KEYS } from '@/lib/utils/constants';

// ─── Fixtures (mirror ticket-reducer test fixtures; quotes share TicketItem) ─

// Phase Money-Unify-3: all fixture money values are integer cents
// (× 100 of the pre-migration dollar fixtures).
function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: 'tier-1',
    service_id: 'svc-1',
    tier_name: 'default',
    tier_label: 'Default',
    price_cents: 10000,
    sale_price_cents: null,
    display_order: 0,
    is_vehicle_size_aware: true,
    vehicle_size_sedan_price_cents: 14000,
    vehicle_size_truck_suv_price_cents: 15000,
    vehicle_size_suv_van_price_cents: 16000,
    vehicle_size_exotic_price_cents: 20000,
    vehicle_size_classic_price_cents: 18000,
    max_qty: null,
    qty_label: null,
    created_at: '',
    ...overrides,
  };
}

function mockService(overrides: Partial<Service> & { pricing?: ServicePricing[] } = {}): Service & { pricing: ServicePricing[] } {
  const pricing = overrides.pricing ?? [mockTier({ tier_name: 'default', tier_label: 'Default' })];
  return {
    id: 'svc-1',
    name: 'Express Interior Clean',
    slug: 'express-interior-clean',
    description: null,
    category_id: null,
    is_active: true,
    display_order: 0,
    is_taxable: false,
    pricing_model: 'scope',
    flat_price_cents: null,
    per_unit_price_cents: null,
    per_unit_label: null,
    per_unit_max: null,
    base_duration_minutes: 30,
    sale_starts_at: null,
    sale_ends_at: null,
    sale_price_cents: null,
    classification: 'primary',
    ...overrides,
    pricing,
  } as Service & { pricing: ServicePricing[] };
}

function mockVehicle(size_class: Vehicle['size_class'] = 'sedan'): Vehicle {
  return {
    id: 'veh-1',
    customer_id: 'cust-1',
    vehicle_category: 'automobile',
    vehicle_type: 'standard',
    size_class,
    specialty_tier: null,
    year: 2020,
    make: 'Honda',
    model: 'Civic',
    color: 'Blue',
    vin: null,
    license_plate: null,
    notes: null,
    is_active: true,
    is_incomplete: false,
    created_at: '',
    updated_at: '',
    size_class_manual_override: false,
  } as Vehicle;
}

function mockServiceItem(overrides: Partial<TicketItem> = {}): TicketItem {
  return {
    id: 'item-1',
    itemType: 'service',
    productId: null,
    serviceId: 'svc-1',
    categoryId: null,
    itemName: 'Express Interior Clean',
    quantity: 1,
    unitPrice: 140,
    totalPrice: 140,
    taxAmount: 0,
    isTaxable: false,
    tierName: 'default',
    vehicleSizeClass: 'sedan',
    notes: null,
    perUnitQty: null,
    perUnitLabel: null,
    perUnitPrice: null,
    perUnitMax: null,
    parentItemId: null,
    standardPrice: 140,
    pricingType: 'standard',
    comboSourcePrimaryId: null,
    saleEffectivePrice: null,
    prerequisiteNote: null,
    prerequisiteForServiceId: null,
    ...overrides,
  };
}

function stateWithItems(items: TicketItem[], vehicle: Vehicle | null = mockVehicle('sedan')): QuoteState {
  return {
    ...initialQuoteState,
    items,
    vehicle,
    subtotal: items.reduce((sum, i) => sum + i.totalPrice, 0),
    total: items.reduce((sum, i) => sum + i.totalPrice, 0),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('quoteReducer SET_VEHICLE (Session 31 silent reprice)', () => {
  it('1. sedan→exotic swap reprices to exotic tier', () => {
    const service = mockService();
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, standardPrice: 140 })]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(200);
    expect(next.items[0].standardPrice).toBe(200);
    expect(next.items[0].vehicleSizeClass).toBe('exotic');
  });

  it('2. sedan→classic swap reprices to classic tier', () => {
    const service = mockService();
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, standardPrice: 140 })]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('classic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(180);
    expect(next.items[0].vehicleSizeClass).toBe('classic');
  });

  it('3. exotic→sedan swap reprices back down', () => {
    const service = mockService();
    const state = stateWithItems(
      [mockServiceItem({ unitPrice: 200, standardPrice: 200, vehicleSizeClass: 'exotic' })],
      mockVehicle('exotic')
    );
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('sedan'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].vehicleSizeClass).toBe('sedan');
  });

  it('4. swap with no-matching-tier falls back to pricing.price', () => {
    const service = mockService({
      pricing: [
        mockTier({
          price_cents: 9900,
          vehicle_size_sedan_price_cents: 14000,
          vehicle_size_truck_suv_price_cents: 15000,
          vehicle_size_suv_van_price_cents: 16000,
          vehicle_size_exotic_price_cents: null,
          vehicle_size_classic_price_cents: null,
        }),
      ],
    });
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, standardPrice: 140 })]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(99);
    expect(next.items[0].standardPrice).toBe(99);
  });

  it('5. swap preserves combo when combo price is still lowest', () => {
    const service = mockService();
    const comboItem = mockServiceItem({
      id: 'combo-child',
      unitPrice: 80,
      standardPrice: 140,
      pricingType: 'combo',
      comboSourcePrimaryId: 'primary-1',
      parentItemId: 'primary-1',
    });
    const state = stateWithItems([comboItem]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(80);
    expect(next.items[0].pricingType).toBe('combo');
    expect(next.items[0].comboSourcePrimaryId).toBe('primary-1');
  });

  it('5b. swap drops combo when new resolved price is lower than combo', () => {
    const service = mockService();
    const comboItem = mockServiceItem({
      id: 'combo-child',
      unitPrice: 150,
      standardPrice: 200,
      vehicleSizeClass: 'exotic',
      pricingType: 'combo',
      comboSourcePrimaryId: 'primary-1',
      parentItemId: 'primary-1',
    });
    const state = stateWithItems([comboItem], mockVehicle('exotic'));
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('sedan'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].pricingType).toBe('standard');
    expect(next.items[0].comboSourcePrimaryId).toBeNull();
  });

  it('6. swap with expired sale clears sale snapshot', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const veryPastDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const service = mockService({
      sale_starts_at: veryPastDate,
      sale_ends_at: pastDate,
    });
    const saleItem = mockServiceItem({
      unitPrice: 120,
      standardPrice: 140,
      pricingType: 'sale',
      saleEffectivePrice: 120,
    });
    const state = stateWithItems([saleItem]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('sedan'),
      services: [service],
    });
    expect(next.items[0].pricingType).toBe('standard');
    expect(next.items[0].saleEffectivePrice).toBeNull();
    expect(next.items[0].unitPrice).toBe(140);
  });

  it('7. swap skips per-unit items', () => {
    const service = mockService({ pricing_model: 'per_unit', per_unit_price_cents: 2500, per_unit_label: 'panel' });
    const perUnitItem = mockServiceItem({
      unitPrice: 50,
      standardPrice: 50,
      perUnitQty: 2,
      perUnitPrice: 25,
      perUnitLabel: 'panel',
    });
    const state = stateWithItems([perUnitItem]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(50);
    expect(next.items[0].perUnitQty).toBe(2);
  });

  it('8. swap skips custom-priced items', () => {
    const service = mockService();
    const customItem = mockServiceItem({
      unitPrice: 99.99,
      standardPrice: 99.99,
      isCustomPrice: true,
    });
    const state = stateWithItems([customItem]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(99.99);
    expect(next.items[0].isCustomPrice).toBe(true);
  });

  it('9. swap blocked by payment returns state unchanged (parity with ticket-reducer)', () => {
    // Quotes do not normally pass blockedByPayment: true, but the guard behavior is mirrored.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = mockService();
    const state = stateWithItems([mockServiceItem({ unitPrice: 140 })]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
      blockedByPayment: true,
    });
    expect(next).toBe(state);
    expect(warn).toHaveBeenCalledWith('[SET_VEHICLE] Refused: payment in flight');
    warn.mockRestore();
  });

  it('10. swap with null vehicle clears without crash and preserves items', () => {
    const service = mockService();
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, vehicleSizeClass: 'sedan' })]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: null,
      services: [service],
    });
    expect(next.vehicle).toBeNull();
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].vehicleSizeClass).toBe('sedan');
  });

  // ─── Session 32: vehicle_size pricing_model reprice (mirror of ticket-reducer tests) ─

  // Phase Money-Unify-3: vsTier accepts DOLLAR args for terse fixture syntax,
  // converts to integer cents internally.
  function vsTier(
    size: 'sedan' | 'truck_suv_2row' | 'suv_3row_van' | 'exotic' | 'classic',
    priceDollars: number,
    salePriceDollars: number | null = null,
    displayOrder = 0,
  ): ServicePricing {
    const labelMap: Record<string, string> = {
      sedan: 'Sedan',
      truck_suv_2row: 'Truck/SUV (2-Row)',
      suv_3row_van: 'SUV (3-Row) / Van',
      exotic: 'Exotic',
      classic: 'Classic',
    };
    return {
      id: `tier-${size}`,
      service_id: 'svc-1',
      tier_name: size,
      tier_label: labelMap[size],
      price_cents: Math.round(priceDollars * 100),
      sale_price_cents: salePriceDollars != null ? Math.round(salePriceDollars * 100) : null,
      display_order: displayOrder,
      is_vehicle_size_aware: false,
      vehicle_size_sedan_price_cents: null,
      vehicle_size_truck_suv_price_cents: null,
      vehicle_size_suv_van_price_cents: null,
      vehicle_size_exotic_price_cents: null,
      vehicle_size_classic_price_cents: null,
      max_qty: null,
      qty_label: null,
      created_at: '',
    };
  }

  it('11. vehicle_size: sedan→exotic swap reprices to EXOTIC row price (not sedan row)', () => {
    const service = mockService({
      pricing_model: 'vehicle_size',
      pricing: [vsTier('sedan', 140, null, 0), vsTier('exotic', 200, null, 3)],
    });
    const state = stateWithItems([
      mockServiceItem({
        unitPrice: 140,
        standardPrice: 140,
        vehicleSizeClass: 'sedan',
        tierName: 'Sedan',
      }),
    ]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(200);
    expect(next.items[0].standardPrice).toBe(200);
    expect(next.items[0].tierName).toBe('Exotic');
    expect(next.items[0].vehicleSizeClass).toBe('exotic');
    expect(next.items[0].repriceFailed).toBeUndefined();
  });

  it('13. vehicle_size: sedan→classic swap reprices to classic row (all 5 rows populated)', () => {
    const service = mockService({
      pricing_model: 'vehicle_size',
      pricing: [
        vsTier('sedan', 140, null, 0),
        vsTier('truck_suv_2row', 150, null, 1),
        vsTier('suv_3row_van', 160, null, 2),
        vsTier('exotic', 200, null, 3),
        vsTier('classic', 180, null, 4),
      ],
    });
    const state = stateWithItems([
      mockServiceItem({
        unitPrice: 140,
        standardPrice: 140,
        vehicleSizeClass: 'sedan',
        tierName: 'Sedan',
      }),
    ]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('classic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(180);
    expect(next.items[0].tierName).toBe('Classic');
    expect(next.items[0].vehicleSizeClass).toBe('classic');
  });

  it('14. vehicle_size: reprice keeps sale price when new tier has active sale_price', () => {
    const service = mockService({
      sale_starts_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      sale_ends_at: null,
      pricing_model: 'vehicle_size',
      pricing: [vsTier('sedan', 140, null, 0), vsTier('exotic', 200, 170, 3)],
    });
    const state = stateWithItems([
      mockServiceItem({
        unitPrice: 140,
        standardPrice: 140,
        vehicleSizeClass: 'sedan',
        tierName: 'Sedan',
      }),
    ]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(170);
    expect(next.items[0].saleEffectivePrice).toBe(170);
    expect(next.items[0].pricingType).toBe('sale');
    expect(next.items[0].standardPrice).toBe(200);
  });

  it('15. vehicle_size: no tier row for new size sets repriceFailed and keeps old price', () => {
    const service = mockService({
      pricing_model: 'vehicle_size',
      pricing: [vsTier('sedan', 140, null, 0), vsTier('truck_suv_2row', 150, null, 1)],
    });
    const state = stateWithItems([
      mockServiceItem({
        unitPrice: 140,
        standardPrice: 140,
        vehicleSizeClass: 'sedan',
        tierName: 'Sedan',
      }),
    ]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].vehicleSizeClass).toBe('exotic');
    expect(next.items[0].repriceFailed).toEqual({
      reason: 'no_tier_for_size',
      attemptedSize: 'exotic',
      previousSize: 'sedan',
      previousTierName: 'Sedan',
    });
  });

  it('16. vehicle_size: repriceFailed clears on subsequent successful reprice (swap back)', () => {
    const service = mockService({
      pricing_model: 'vehicle_size',
      pricing: [vsTier('sedan', 140, null, 0), vsTier('truck_suv_2row', 150, null, 1)],
    });
    let state = stateWithItems([
      mockServiceItem({
        unitPrice: 140,
        standardPrice: 140,
        vehicleSizeClass: 'sedan',
        tierName: 'Sedan',
      }),
    ]);
    state = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(state.items[0].repriceFailed?.reason).toBe('no_tier_for_size');

    const recovered = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('sedan'),
      services: [service],
    });
    expect(recovered.items[0].repriceFailed).toBeUndefined();
    expect(recovered.items[0].unitPrice).toBe(140);
    expect(recovered.items[0].vehicleSizeClass).toBe('sedan');
  });

  it('12. vehicle-size-aware scope tier reprices when tierName stored as label', () => {
    const service = mockService({
      pricing_model: 'scope',
      pricing: [
        {
          id: 'tier-complete',
          service_id: 'svc-1',
          tier_name: 'complete_interior',
          tier_label: 'Complete Interior',
          price_cents: 10000,
          sale_price_cents: null,
          display_order: 0,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price_cents: 14000,
          vehicle_size_truck_suv_price_cents: 15000,
          vehicle_size_suv_van_price_cents: 16000,
          vehicle_size_exotic_price_cents: 22000,
          vehicle_size_classic_price_cents: 18000,
          max_qty: null,
          qty_label: null,
          created_at: '',
        },
      ],
    });
    const state = stateWithItems([
      mockServiceItem({
        unitPrice: 140,
        standardPrice: 140,
        vehicleSizeClass: 'sedan',
        tierName: 'Complete Interior',
      }),
    ]);
    const next = quoteReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(220);
    expect(next.items[0].standardPrice).toBe(220);
    expect(next.items[0].vehicleSizeClass).toBe('exotic');
  });

  it('uses canonical VEHICLE_SIZE_CLASS_KEYS constant (no hardcoded arrays in test fixtures)', () => {
    expect(VEHICLE_SIZE_CLASS_KEYS).toContain('sedan');
    expect(VEHICLE_SIZE_CLASS_KEYS).toContain('exotic');
    expect(VEHICLE_SIZE_CLASS_KEYS).toContain('classic');
    expect(VEHICLE_SIZE_CLASS_KEYS.length).toBe(5);
  });
});
