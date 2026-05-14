import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ServicePricingPicker } from '../service-pricing-picker';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import type { CatalogService } from '../../types';

afterEach(cleanup);

// Phase Money-Unify-3: all fixture money values are integer cents
// (× 100 of the pre-migration dollar fixtures).
function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: `p-${Math.random()}`,
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

function mockService(pricing: ServicePricing[] = []): CatalogService {
  return {
    id: 's1', name: 'Interior Detail', slug: 'interior-detail', description: null,
    category_id: null, pricing_model: 'vehicle_size', classification: 'primary',
    base_duration_minutes: 60, flat_price_cents: null, custom_starting_price_cents: null,
    per_unit_price_cents: null, per_unit_max: null, per_unit_label: null,
    mobile_eligible: false, online_bookable: true, staff_assessed: false,
    is_taxable: false, vehicle_compatibility: ['standard'],
    special_requirements: null, image_url: null, image_alt: null,
    is_active: true, show_on_website: true, is_featured: false, display_order: 0,
    sale_price_cents: null, sale_starts_at: null, sale_ends_at: null,
    created_at: '', updated_at: '',
    pricing,
  };
}

const ALL_5_TIERS = [
  mockTier({ tier_name: 'sedan', tier_label: 'Sedan', price_cents: 10000, display_order: 0 }),
  mockTier({ tier_name: 'truck_suv_2row', tier_label: 'Truck/SUV (2-Row)', price_cents: 15000, display_order: 1 }),
  mockTier({ tier_name: 'suv_3row_van', tier_label: 'SUV (3-Row) / Van', price_cents: 20000, display_order: 2 }),
  mockTier({ tier_name: 'exotic', tier_label: 'Exotic', price_cents: 50000, display_order: 3 }),
  mockTier({ tier_name: 'classic', tier_label: 'Classic', price_cents: 35000, display_order: 4 }),
];

function renderPicker(vehicleSizeClass: VehicleSizeClass | null, tiers: ServicePricing[] = ALL_5_TIERS) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <ServicePricingPicker
      open={true}
      onClose={onClose}
      service={mockService(tiers)}
      vehicleSizeClass={vehicleSizeClass}
      vehicleSpecialtyTier={null}
      onSelect={onSelect}
    />
  );
  return { onSelect, onClose };
}

describe('ServicePricingPicker — tier disable logic', () => {
  it('sedan vehicle: only Sedan enabled, other 4 disabled', () => {
    renderPicker('sedan');
    const buttons = screen.getAllByRole('button');
    const tierButtons = buttons.filter(b => ['Sedan', 'Truck/SUV (2-Row)', 'SUV (3-Row) / Van', 'Exotic', 'Classic'].some(l => b.textContent?.includes(l)));

    const sedanBtn = tierButtons.find(b => b.textContent?.includes('Sedan'));
    const exoticBtn = tierButtons.find(b => b.textContent?.includes('Exotic'));
    const classicBtn = tierButtons.find(b => b.textContent?.includes('Classic'));
    const truckBtn = tierButtons.find(b => b.textContent?.includes('Truck/SUV'));
    const vanBtn = tierButtons.find(b => b.textContent?.includes('SUV (3-Row)'));

    expect(sedanBtn).toBeTruthy();
    expect((sedanBtn as HTMLButtonElement).disabled).toBe(false);
    expect((exoticBtn as HTMLButtonElement).disabled).toBe(true);
    expect((classicBtn as HTMLButtonElement).disabled).toBe(true);
    expect((truckBtn as HTMLButtonElement).disabled).toBe(true);
    expect((vanBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('exotic vehicle: only Exotic enabled, other 4 disabled', () => {
    renderPicker('exotic');
    const buttons = screen.getAllByRole('button');
    const exoticBtn = buttons.find(b => b.textContent?.includes('Exotic') && !b.textContent?.includes('('));
    const sedanBtn = buttons.find(b => b.textContent?.includes('Sedan'));

    expect(exoticBtn).toBeTruthy();
    expect((exoticBtn as HTMLButtonElement).disabled).toBe(false);
    expect((sedanBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('classic vehicle: only Classic enabled, other 4 disabled', () => {
    renderPicker('classic');
    const buttons = screen.getAllByRole('button');
    const classicBtn = buttons.find(b => b.textContent?.includes('Classic'));
    const sedanBtn = buttons.find(b => b.textContent?.includes('Sedan'));

    expect(classicBtn).toBeTruthy();
    expect((classicBtn as HTMLButtonElement).disabled).toBe(false);
    expect((sedanBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('no vehicle (null): all 5 rendered and enabled', () => {
    renderPicker(null);
    const buttons = screen.getAllByRole('button');
    const tierButtons = buttons.filter(b => ['Sedan', 'Truck/SUV (2-Row)', 'SUV (3-Row) / Van', 'Exotic', 'Classic'].some(l => b.textContent?.includes(l)));

    expect(tierButtons.length).toBe(5);
    tierButtons.forEach(btn => {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('sedan vehicle + only 3 tier rows: Sedan enabled, truck/van disabled, no exotic/classic rendered', () => {
    const threeTiers = ALL_5_TIERS.slice(0, 3);
    renderPicker('sedan', threeTiers);
    const buttons = screen.getAllByRole('button');
    const sedanBtn = buttons.find(b => b.textContent?.includes('Sedan'));
    const truckBtn = buttons.find(b => b.textContent?.includes('Truck/SUV'));

    expect((sedanBtn as HTMLButtonElement).disabled).toBe(false);
    expect((truckBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Exotic')).toBeNull();
    expect(screen.queryByText('Classic')).toBeNull();
  });

  it('scope-model tiers with custom names are never disabled', () => {
    const scopeTiers = [
      mockTier({ tier_name: 'complete_interior', tier_label: 'Complete Interior', price_cents: 20000 }),
      mockTier({ tier_name: 'floor_mats', tier_label: 'Floor Mats Only', price_cents: 8000 }),
    ];
    const service = mockService(scopeTiers);
    service.pricing_model = 'scope';

    render(
      <ServicePricingPicker
        open={true}
        onClose={vi.fn()}
        service={service}
        vehicleSizeClass="sedan"
        vehicleSpecialtyTier={null}
        onSelect={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    const interiorBtn = buttons.find(b => b.textContent?.includes('Complete Interior'));
    const matsBtn = buttons.find(b => b.textContent?.includes('Floor Mats Only'));

    expect((interiorBtn as HTMLButtonElement).disabled).toBe(false);
    expect((matsBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
