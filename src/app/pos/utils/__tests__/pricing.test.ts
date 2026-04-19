import { describe, it, expect } from 'vitest';
import { selectPricingTierForVehicle, shouldOpenSpecialtyModal } from '../pricing';
import type { Vehicle, Service, ServicePricing } from '@/lib/supabase/types';

// Minimal mock builders
function mockVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1', customer_id: 'c1', vehicle_type: 'standard', vehicle_category: 'automobile',
    size_class: 'sedan', specialty_tier: null, is_exotic: false, is_classic: false,
    requires_custom_quote: false, year: 2023, make: 'Honda', model: 'Civic', color: 'White',
    vin: null, license_plate: null, notes: null, is_incomplete: false,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

function mockServiceWithPricing(tiers: Partial<ServicePricing>[] = []): Service & { pricing: ServicePricing[] } {
  return {
    id: 's1', name: 'Interior Detail', slug: 'interior-detail', description: null,
    category_id: null, pricing_model: 'vehicle_size', classification: 'primary',
    base_duration_minutes: 60, flat_price: null, custom_starting_price: null,
    per_unit_price: null, per_unit_max: null, per_unit_label: null,
    mobile_eligible: false, online_bookable: true, staff_assessed: false,
    is_taxable: false, vehicle_compatibility: ['standard'],
    special_requirements: null, image_url: null, image_alt: null,
    is_active: true, show_on_website: true, is_featured: false, display_order: 0,
    sale_price: null, sale_starts_at: null, sale_ends_at: null,
    created_at: '', updated_at: '',
    pricing: tiers.map((t, i) => ({
      id: `p${i}`, service_id: 's1', tier_name: 'sedan', tier_label: 'Sedan',
      price: 100, sale_price: null, display_order: i,
      is_vehicle_size_aware: false,
      vehicle_size_sedan_price: null, vehicle_size_truck_suv_price: null,
      vehicle_size_suv_van_price: null, max_qty: null, qty_label: null,
      created_at: '',
      ...t,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// selectPricingTierForVehicle
// ═══════════════════════════════════════════════════════════════

describe('selectPricingTierForVehicle', () => {
  it('exotic vehicle + valid exotic tier → returns exotic row', () => {
    const vehicle = mockVehicle({ is_exotic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([
      { tier_name: 'sedan', price: 100 },
      { tier_name: 'exotic', tier_label: 'Exotic', price: 500 },
    ]);
    const result = selectPricingTierForVehicle(service, vehicle);
    expect(result).not.toBeNull();
    expect(result!.tier_name).toBe('exotic');
    expect(result!.price).toBe(500);
  });

  it('classic vehicle + valid classic tier → returns classic row', () => {
    const vehicle = mockVehicle({ is_classic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([
      { tier_name: 'sedan', price: 100 },
      { tier_name: 'classic', tier_label: 'Classic', price: 350 },
    ]);
    const result = selectPricingTierForVehicle(service, vehicle);
    expect(result).not.toBeNull();
    expect(result!.tier_name).toBe('classic');
    expect(result!.price).toBe(350);
  });

  it('exotic vehicle + no exotic tier → returns null', () => {
    const vehicle = mockVehicle({ is_exotic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([{ tier_name: 'sedan', price: 100 }]);
    expect(selectPricingTierForVehicle(service, vehicle)).toBeNull();
  });

  it('exotic vehicle + exotic tier with price: 0 → returns null', () => {
    const vehicle = mockVehicle({ is_exotic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([
      { tier_name: 'sedan', price: 100 },
      { tier_name: 'exotic', price: 0 },
    ]);
    expect(selectPricingTierForVehicle(service, vehicle)).toBeNull();
  });

  it('dual-flag vehicle → returns null (gate should open modal)', () => {
    const vehicle = mockVehicle({ is_exotic: true, is_classic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([
      { tier_name: 'exotic', price: 500 },
      { tier_name: 'classic', price: 350 },
    ]);
    expect(selectPricingTierForVehicle(service, vehicle)).toBeNull();
  });

  it('normal vehicle → returns null (not a specialty vehicle)', () => {
    const vehicle = mockVehicle();
    const service = mockServiceWithPricing([{ tier_name: 'sedan', price: 100 }]);
    expect(selectPricingTierForVehicle(service, vehicle)).toBeNull();
  });

  it('undefined service.pricing → returns null', () => {
    const vehicle = mockVehicle({ is_exotic: true, requires_custom_quote: true });
    const service = { ...mockServiceWithPricing(), pricing: undefined };
    expect(selectPricingTierForVehicle(service, vehicle)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// shouldOpenSpecialtyModal
// ═══════════════════════════════════════════════════════════════

describe('shouldOpenSpecialtyModal', () => {
  it('normal vehicle → false (no modal)', () => {
    const vehicle = mockVehicle();
    const service = mockServiceWithPricing();
    expect(shouldOpenSpecialtyModal(vehicle, service)).toBe(false);
  });

  it('exotic vehicle with valid exotic tier → false (skip modal)', () => {
    const vehicle = mockVehicle({ is_exotic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([
      { tier_name: 'sedan', price: 100 },
      { tier_name: 'exotic', price: 500 },
    ]);
    expect(shouldOpenSpecialtyModal(vehicle, service)).toBe(false);
  });

  it('exotic vehicle without exotic tier → true (open modal)', () => {
    const vehicle = mockVehicle({ is_exotic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([{ tier_name: 'sedan', price: 100 }]);
    expect(shouldOpenSpecialtyModal(vehicle, service)).toBe(true);
  });

  it('exotic vehicle with exotic tier price: 0 → true (treat as unset)', () => {
    const vehicle = mockVehicle({ is_exotic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([{ tier_name: 'exotic', price: 0 }]);
    expect(shouldOpenSpecialtyModal(vehicle, service)).toBe(true);
  });

  it('dual-flag vehicle → true even with both tiers populated', () => {
    const vehicle = mockVehicle({ is_exotic: true, is_classic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([
      { tier_name: 'exotic', price: 500 },
      { tier_name: 'classic', price: 350 },
    ]);
    expect(shouldOpenSpecialtyModal(vehicle, service)).toBe(true);
  });

  it('null vehicle → false', () => {
    const service = mockServiceWithPricing();
    expect(shouldOpenSpecialtyModal(null, service)).toBe(false);
  });

  it('classic vehicle with valid classic tier → false', () => {
    const vehicle = mockVehicle({ is_classic: true, requires_custom_quote: true });
    const service = mockServiceWithPricing([{ tier_name: 'classic', price: 350 }]);
    expect(shouldOpenSpecialtyModal(vehicle, service)).toBe(false);
  });
});
