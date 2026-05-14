import { describe, it, expect } from 'vitest';
import { resolveServicePrice, resolveServicePriceWithSale } from '../pricing';
import type { ServicePricing } from '@/lib/supabase/types';

// Phase Money-Unify-3: all fixture values are integer cents (× 100 of the
// pre-migration dollar fixtures). resolveServicePrice + resolveServicePriceWithSale
// return cents directly.
function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: 'p1',
    service_id: 's1',
    tier_name: 'sedan',
    tier_label: 'Sedan',
    price_cents: 10000,
    sale_price_cents: null,
    display_order: 0,
    is_vehicle_size_aware: false,
    vehicle_size_sedan_price_cents: null,
    vehicle_size_truck_suv_price_cents: null,
    vehicle_size_suv_van_price_cents: null,
    vehicle_size_exotic_price_cents: null,
    vehicle_size_classic_price_cents: null,
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
    const tier = mockTier({ price_cents: 15000, is_vehicle_size_aware: false });
    expect(resolveServicePrice(tier, 'sedan')).toBe(15000);
    expect(resolveServicePrice(tier, 'exotic')).toBe(15000);
    expect(resolveServicePrice(tier, 'classic')).toBe(15000);
    expect(resolveServicePrice(tier, null)).toBe(15000);
  });

  it('size-aware tier returns sedan price for sedan vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price_cents: 10000,
      vehicle_size_truck_suv_price_cents: 15000,
      vehicle_size_suv_van_price_cents: 20000,
    });
    expect(resolveServicePrice(tier, 'sedan')).toBe(10000);
  });

  it('size-aware tier returns truck_suv price for truck_suv_2row vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price_cents: 10000,
      vehicle_size_truck_suv_price_cents: 15000,
      vehicle_size_suv_van_price_cents: 20000,
    });
    expect(resolveServicePrice(tier, 'truck_suv_2row')).toBe(15000);
  });

  it('size-aware tier returns suv_van price for suv_3row_van vehicle', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_sedan_price_cents: 10000,
      vehicle_size_truck_suv_price_cents: 15000,
      vehicle_size_suv_van_price_cents: 20000,
    });
    expect(resolveServicePrice(tier, 'suv_3row_van')).toBe(20000);
  });

  it('size-aware tier returns exotic price for exotic vehicle (Session 29)', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_exotic_price_cents: 50000,
    });
    expect(resolveServicePrice(tier, 'exotic')).toBe(50000);
  });

  it('size-aware tier returns classic price for classic vehicle (Session 29)', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_classic_price_cents: 35000,
    });
    expect(resolveServicePrice(tier, 'classic')).toBe(35000);
  });

  it('null vehicle_size_exotic_price_cents falls through to base price', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price_cents: 20000,
      vehicle_size_exotic_price_cents: null,
    });
    expect(resolveServicePrice(tier, 'exotic')).toBe(20000);
  });

  it('null vehicle_size_classic_price_cents falls through to base price', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      price_cents: 25000,
      vehicle_size_classic_price_cents: null,
    });
    expect(resolveServicePrice(tier, 'classic')).toBe(25000);
  });

  it('null size_class returns base price', () => {
    const tier = mockTier({ is_vehicle_size_aware: true, price_cents: 10000 });
    expect(resolveServicePrice(tier, null)).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════════
// resolveServicePriceWithSale — sale pricing is orthogonal to size_class
// ═══════════════════════════════════════════════════════════════

describe('resolveServicePriceWithSale', () => {
  it('exotic vehicle with active sale applies sale_price_cents', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_exotic_price_cents: 50000,
      sale_price_cents: 40000,
    });
    const saleWindow = { sale_starts_at: null, sale_ends_at: null };
    const result = resolveServicePriceWithSale(tier, 'exotic', saleWindow);
    expect(result.isOnSale).toBe(true);
    expect(result.effectivePrice).toBe(40000);
    expect(result.standardPrice).toBe(50000);
  });

  it('classic vehicle without sale returns standard classic price', () => {
    const tier = mockTier({
      is_vehicle_size_aware: true,
      vehicle_size_classic_price_cents: 35000,
      sale_price_cents: null,
    });
    const result = resolveServicePriceWithSale(tier, 'classic', null);
    expect(result.isOnSale).toBe(false);
    expect(result.effectivePrice).toBe(35000);
  });
});
