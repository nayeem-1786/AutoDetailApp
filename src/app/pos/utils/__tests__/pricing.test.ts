import { describe, it, expect } from 'vitest';
import { resolveServicePrice, resolveServicePriceWithSale } from '../pricing';
import type { ServicePricing } from '@/lib/supabase/types';

function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: 'p1',
    service_id: 's1',
    tier_name: 'sedan',
    tier_label: 'Sedan',
    price: 100,
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
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// resolveServicePrice — 5-value size_class parity
// ═══════════════════════════════════════════════════════════════

describe('resolveServicePrice', () => {
  it('non-size-aware tier returns base price regardless of size_class', () => {
    const tier = mockTier({ price: 150, is_vehicle_size_aware: false });
    expect(resolveServicePrice(tier, 'sedan')).toBe(150);
    expect(resolveServicePrice(tier, 'exotic')).toBe(150);
    expect(resolveServicePrice(tier, 'classic')).toBe(150);
    expect(resolveServicePrice(tier, null)).toBe(150);
  });

  it('size-aware tier returns sedan price for sedan vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price: 100,
      vehicle_size_truck_suv_price: 150,
      vehicle_size_suv_van_price: 200,
    });
    expect(resolveServicePrice(tier, 'sedan')).toBe(100);
  });

  it('size-aware tier returns truck_suv price for truck_suv_2row vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price: 100,
      vehicle_size_truck_suv_price: 150,
      vehicle_size_suv_van_price: 200,
    });
    expect(resolveServicePrice(tier, 'truck_suv_2row')).toBe(150);
  });

  it('size-aware tier returns suv_van price for suv_3row_van vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price: 100,
      vehicle_size_truck_suv_price: 150,
      vehicle_size_suv_van_price: 200,
    });
    expect(resolveServicePrice(tier, 'suv_3row_van')).toBe(200);
  });

  it('size-aware tier returns exotic price for exotic vehicle (Session 29)', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_exotic_price: 500,
    });
    expect(resolveServicePrice(tier, 'exotic')).toBe(500);
  });

  it('size-aware tier returns classic price for classic vehicle (Session 29)', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_classic_price: 350,
    });
    expect(resolveServicePrice(tier, 'classic')).toBe(350);
  });

  it('null vehicle_size_exotic_price falls through to base price', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 200,
      vehicle_size_exotic_price: null,
    });
    expect(resolveServicePrice(tier, 'exotic')).toBe(200);
  });

  it('null vehicle_size_classic_price falls through to base price', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price: 250,
      vehicle_size_classic_price: null,
    });
    expect(resolveServicePrice(tier, 'classic')).toBe(250);
  });

  it('null size_class returns base price', () => {
    const tier = mockTier({ is_vehicle_size_aware: true, price: 100 });
    expect(resolveServicePrice(tier, null)).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// resolveServicePriceWithSale — sale pricing is orthogonal to size_class
// ═══════════════════════════════════════════════════════════════

describe('resolveServicePriceWithSale', () => {
  it('exotic vehicle with active sale applies sale_price', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_exotic_price: 500,
      sale_price: 400,
    });
    const saleWindow = { sale_starts_at: null, sale_ends_at: null };
    const result = resolveServicePriceWithSale(tier, 'exotic', saleWindow);
    expect(result.isOnSale).toBe(true);
    expect(result.effectivePrice).toBe(400);
    expect(result.standardPrice).toBe(500);
  });

  it('classic vehicle without sale returns standard classic price', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_classic_price: 350,
      sale_price: null,
    });
    const result = resolveServicePriceWithSale(tier, 'classic', null);
    expect(result.isOnSale).toBe(false);
    expect(result.effectivePrice).toBe(350);
  });
});
