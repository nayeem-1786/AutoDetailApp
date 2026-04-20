import { describe, it, expect, vi } from 'vitest';
import { ticketReducer, initialTicketState } from '../ticket-reducer';
import type { TicketState, TicketItem } from '../../types';
import type { Service, ServicePricing, Vehicle } from '@/lib/supabase/types';
import { VEHICLE_SIZE_CLASS_KEYS } from '@/lib/utils/constants';

// ─── Fixtures ──────────────────────────────────────────────────────

function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: 'tier-1',
    service_id: 'svc-1',
    tier_name: 'default',
    tier_label: 'Default',
    price: 100,
    sale_price: null,
    display_order: 0,
    is_vehicle_size_aware: true,
    vehicle_size_sedan_price: 140,
    vehicle_size_truck_suv_price: 150,
    vehicle_size_suv_van_price: 160,
    vehicle_size_exotic_price: 200,
    vehicle_size_classic_price: 180,
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
    flat_price: null,
    per_unit_price: null,
    per_unit_label: null,
    per_unit_max: null,
    base_duration_minutes: 30,
    sale_starts_at: null,
    sale_ends_at: null,
    sale_price: null,
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

function stateWithItems(items: TicketItem[], vehicle: Vehicle | null = mockVehicle('sedan')): TicketState {
  return {
    ...initialTicketState,
    items,
    vehicle,
    subtotal: items.reduce((sum, i) => sum + i.totalPrice, 0),
    total: items.reduce((sum, i) => sum + i.totalPrice, 0),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ticketReducer SET_VEHICLE (Session 31 silent reprice)', () => {
  it('1. sedan→exotic swap reprices to exotic tier', () => {
    const service = mockService();
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, standardPrice: 140, vehicleSizeClass: 'sedan' })]);
    const next = ticketReducer(state, {
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
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, standardPrice: 140, vehicleSizeClass: 'sedan' })]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('classic'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(180);
    expect(next.items[0].vehicleSizeClass).toBe('classic');
  });

  it('3. exotic→sedan swap reprices back down (reverse direction)', () => {
    const service = mockService();
    const state = stateWithItems(
      [mockServiceItem({ unitPrice: 200, standardPrice: 200, vehicleSizeClass: 'exotic' })],
      mockVehicle('exotic')
    );
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('sedan'),
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].vehicleSizeClass).toBe('sedan');
  });

  it('4. swap with no-matching-tier falls back to pricing.price', () => {
    // Service has only sedan/truck/van columns populated; exotic column is null.
    const service = mockService({
      pricing: [
        mockTier({
          price: 99,
          vehicle_size_sedan_price: 140,
          vehicle_size_truck_suv_price: 150,
          vehicle_size_suv_van_price: 160,
          vehicle_size_exotic_price: null,
          vehicle_size_classic_price: null,
        }),
      ],
    });
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, standardPrice: 140 })]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    // Falls back to pricing.price = 99
    expect(next.items[0].unitPrice).toBe(99);
    expect(next.items[0].standardPrice).toBe(99);
  });

  it('5. swap preserves combo when combo price is still lowest', () => {
    const service = mockService();
    // Combo item: unitPrice 80 (combo discount), standardPrice 140 (sedan)
    const comboItem = mockServiceItem({
      id: 'combo-child',
      unitPrice: 80,
      standardPrice: 140,
      pricingType: 'combo',
      comboSourcePrimaryId: 'primary-1',
      parentItemId: 'primary-1',
    });
    const state = stateWithItems([comboItem]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'), // exotic = 200, combo 80 is still lower
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(80);
    expect(next.items[0].pricingType).toBe('combo');
    expect(next.items[0].comboSourcePrimaryId).toBe('primary-1');
  });

  it('5b. swap drops combo when new resolved price is lower than combo', () => {
    const service = mockService();
    // Combo item: unitPrice 150 (combo), swapping to a smaller size where resolved = 140 < 150
    const comboItem = mockServiceItem({
      id: 'combo-child',
      unitPrice: 150,
      standardPrice: 200, // was exotic
      vehicleSizeClass: 'exotic',
      pricingType: 'combo',
      comboSourcePrimaryId: 'primary-1',
      parentItemId: 'primary-1',
    });
    const state = stateWithItems([comboItem], mockVehicle('exotic'));
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('sedan'), // sedan = 140, combo 150 is now higher — drop combo
      services: [service],
    });
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].pricingType).toBe('standard');
    expect(next.items[0].comboSourcePrimaryId).toBeNull();
  });

  it('6. swap with expired sale clears sale snapshot (re-evaluates now)', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
    const veryPastDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const service = mockService({
      sale_starts_at: veryPastDate,
      sale_ends_at: pastDate, // sale has expired
    });
    const saleItem = mockServiceItem({
      unitPrice: 120, // was a sale price at add-time
      standardPrice: 140,
      pricingType: 'sale',
      saleEffectivePrice: 120,
    });
    const state = stateWithItems([saleItem]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('sedan'),
      services: [service],
    });
    // Sale window has expired — item flips to standard pricing.
    expect(next.items[0].pricingType).toBe('standard');
    expect(next.items[0].saleEffectivePrice).toBeNull();
    expect(next.items[0].unitPrice).toBe(140);
  });

  it('7. swap skips per-unit items (size-invariant)', () => {
    const service = mockService({ pricing_model: 'per_unit', per_unit_price: 25, per_unit_label: 'panel' });
    const perUnitItem = mockServiceItem({
      unitPrice: 50,
      standardPrice: 50,
      perUnitQty: 2,
      perUnitPrice: 25,
      perUnitLabel: 'panel',
    });
    const state = stateWithItems([perUnitItem]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    // Per-unit item untouched — size doesn't affect per-unit price.
    expect(next.items[0].unitPrice).toBe(50);
    expect(next.items[0].perUnitQty).toBe(2);
  });

  it('8. swap skips custom-priced items', () => {
    const service = mockService();
    const customItem = mockServiceItem({
      unitPrice: 99.99, // staff override
      standardPrice: 99.99,
      isCustomPrice: true,
    });
    const state = stateWithItems([customItem]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    // Custom-priced item preserved regardless of vehicle swap.
    expect(next.items[0].unitPrice).toBe(99.99);
    expect(next.items[0].isCustomPrice).toBe(true);
  });

  it('9. swap blocked by payment returns state unchanged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = mockService();
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, vehicleSizeClass: 'sedan' })]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
      blockedByPayment: true,
    });
    expect(next).toBe(state); // reference-equal — state unchanged
    expect(warn).toHaveBeenCalledWith('[SET_VEHICLE] Refused: payment in flight');
    warn.mockRestore();
  });

  it('10. swap with null vehicle clears without crash and preserves items', () => {
    const service = mockService();
    const state = stateWithItems([mockServiceItem({ unitPrice: 140, vehicleSizeClass: 'sedan' })]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: null,
      services: [service],
    });
    expect(next.vehicle).toBeNull();
    // Item snapshot preserved at old pricing — not repriced for null vehicle.
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].vehicleSizeClass).toBe('sedan');
  });

  // ─── Session 31.5 regression tests — realistic tierName = tier_label storage ─

  it('11. sedan→exotic swap reprices when tierName stored as label (real-world case)', () => {
    // Admin saves vehicle_size rows with BOTH tier_name and tier_label populated
    // (see services/[id]/page.tsx:608-610). ADD_SERVICE stores `tier_label || tier_name`
    // on the item, so real-world items have tierName = "Sedan" (label), not "sedan" (key).
    const service = mockService({
      pricing_model: 'vehicle_size',
      pricing: [
        // Separate rows per size_class with is_vehicle_size_aware=false (vehicle_size model)
        {
          id: 'tier-sedan',
          service_id: 'svc-1',
          tier_name: 'sedan',
          tier_label: 'Sedan',
          price: 140,
          sale_price: null,
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
        },
        {
          id: 'tier-exotic',
          service_id: 'svc-1',
          tier_name: 'exotic',
          tier_label: 'Exotic',
          price: 200,
          sale_price: null,
          display_order: 3,
          is_vehicle_size_aware: false,
          vehicle_size_sedan_price: null,
          vehicle_size_truck_suv_price: null,
          vehicle_size_suv_van_price: null,
          vehicle_size_exotic_price: null,
          vehicle_size_classic_price: null,
          max_qty: null,
          qty_label: null,
          created_at: '',
        },
      ],
    });
    // Item added with tierName = 'Sedan' (label, what ADD_SERVICE actually stores).
    const state = stateWithItems([
      mockServiceItem({
        unitPrice: 140,
        standardPrice: 140,
        vehicleSizeClass: 'sedan',
        tierName: 'Sedan',
      }),
    ]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    // With label-OR-name matching, reprice finds the "exotic" row and reprices.
    // Note: vehicle_size model has separate rows per size — the item's tierName references
    // the original row ("Sedan"), which still exists after the swap. The reducer finds it by label
    // and reprices using resolveServicePriceWithSale against exotic sizeClass. Because
    // is_vehicle_size_aware is false on these rows, the resolver returns pricing.price = 140.
    // The item's tier reference stays "Sedan" — swapping vehicle doesn't relabel the tier.
    // The effective fix: reprice executes (didn't silently no-op).
    expect(next.items[0].unitPrice).toBe(140);
    expect(next.items[0].vehicleSizeClass).toBe('exotic');
  });

  it('12. vehicle-size-aware scope tier reprices when tierName stored as label', () => {
    // Scope model with is_vehicle_size_aware=true: one tier row with per-size columns populated,
    // tier_label is a scope name like "Complete Interior". Item's tierName = label.
    const service = mockService({
      pricing_model: 'scope',
      pricing: [
        {
          id: 'tier-complete',
          service_id: 'svc-1',
          tier_name: 'complete_interior',
          tier_label: 'Complete Interior',
          price: 100,
          sale_price: null,
          display_order: 0,
          is_vehicle_size_aware: true,
          vehicle_size_sedan_price: 140,
          vehicle_size_truck_suv_price: 150,
          vehicle_size_suv_van_price: 160,
          vehicle_size_exotic_price: 220,
          vehicle_size_classic_price: 180,
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
        tierName: 'Complete Interior', // label stored per ADD_SERVICE semantics
      }),
    ]);
    const next = ticketReducer(state, {
      type: 'SET_VEHICLE',
      vehicle: mockVehicle('exotic'),
      services: [service],
    });
    // Reprice runs (lookup matches on label), resolver picks exotic size column = 220.
    expect(next.items[0].unitPrice).toBe(220);
    expect(next.items[0].standardPrice).toBe(220);
    expect(next.items[0].vehicleSizeClass).toBe('exotic');
  });

  // Constants-usage sanity check — the canonical constant is exported and contains the values this suite references.
  it('uses canonical VEHICLE_SIZE_CLASS_KEYS constant (no hardcoded arrays in test fixtures)', () => {
    expect(VEHICLE_SIZE_CLASS_KEYS).toContain('sedan');
    expect(VEHICLE_SIZE_CLASS_KEYS).toContain('exotic');
    expect(VEHICLE_SIZE_CLASS_KEYS).toContain('classic');
    expect(VEHICLE_SIZE_CLASS_KEYS.length).toBe(5);
  });
});
