import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ServiceDetailDialog } from '../service-detail-dialog';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import type { CatalogService } from '../../types';

// Mock useTicket — ServiceDetailDialog consumes TicketContext
vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({
    ticket: { items: [], customer: null, vehicle: null },
    dispatch: vi.fn(),
  }),
}));

afterEach(cleanup);

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

function mockService(pricing: ServicePricing[], overrides: Partial<CatalogService> = {}): CatalogService {
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
    ...overrides,
  };
}

const ALL_5_TIERS = [
  mockTier({ tier_name: 'sedan', tier_label: 'Sedan', price_cents: 10000, display_order: 0 }),
  mockTier({ tier_name: 'truck_suv_2row', tier_label: 'Truck/SUV (2-Row)', price_cents: 15000, display_order: 1 }),
  mockTier({ tier_name: 'suv_3row_van', tier_label: 'SUV (3-Row) / Van', price_cents: 20000, display_order: 2 }),
  mockTier({ tier_name: 'exotic', tier_label: 'Exotic', price_cents: 50000, display_order: 3 }),
  mockTier({ tier_name: 'classic', tier_label: 'Classic', price_cents: 35000, display_order: 4 }),
];

describe('ServiceDetailDialog — tier disable logic (Session 29)', () => {
  it('sedan vehicle: Sedan enabled, other 4 disabled', () => {
    render(
      <ServiceDetailDialog
        service={mockService(ALL_5_TIERS)}
        open={true}
        onClose={vi.fn()}
        vehicleSizeOverride={'sedan' as VehicleSizeClass}
      />
    );
    const buttons = screen.getAllByRole('button');
    const sedanBtn = buttons.find(b => b.textContent?.includes('Sedan'));
    const exoticBtn = buttons.find(b => b.textContent?.includes('Exotic'));
    const classicBtn = buttons.find(b => b.textContent?.includes('Classic'));
    const truckBtn = buttons.find(b => b.textContent?.includes('Truck/SUV'));

    expect((sedanBtn as HTMLButtonElement).disabled).toBe(false);
    expect((exoticBtn as HTMLButtonElement).disabled).toBe(true);
    expect((classicBtn as HTMLButtonElement).disabled).toBe(true);
    expect((truckBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('exotic vehicle: Exotic enabled, other 4 disabled', () => {
    render(
      <ServiceDetailDialog
        service={mockService(ALL_5_TIERS)}
        open={true}
        onClose={vi.fn()}
        vehicleSizeOverride={'exotic' as VehicleSizeClass}
      />
    );
    const buttons = screen.getAllByRole('button');
    const exoticBtn = buttons.find(b => b.textContent?.includes('Exotic'));
    const sedanBtn = buttons.find(b => b.textContent?.includes('Sedan'));

    expect((exoticBtn as HTMLButtonElement).disabled).toBe(false);
    expect((sedanBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('classic vehicle: Classic enabled, other 4 disabled', () => {
    render(
      <ServiceDetailDialog
        service={mockService(ALL_5_TIERS)}
        open={true}
        onClose={vi.fn()}
        vehicleSizeOverride={'classic' as VehicleSizeClass}
      />
    );
    const buttons = screen.getAllByRole('button');
    const classicBtn = buttons.find(b => b.textContent?.includes('Classic'));
    const sedanBtn = buttons.find(b => b.textContent?.includes('Sedan'));

    expect((classicBtn as HTMLButtonElement).disabled).toBe(false);
    expect((sedanBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('no vehicle: no tiers disabled', () => {
    render(
      <ServiceDetailDialog
        service={mockService(ALL_5_TIERS)}
        open={true}
        onClose={vi.fn()}
        vehicleSizeOverride={null}
      />
    );
    const buttons = screen.getAllByRole('button');
    const tierButtons = buttons.filter(b =>
      ['Sedan', 'Truck/SUV', 'SUV (3-Row)', 'Exotic', 'Classic'].some(l => b.textContent?.includes(l))
    );
    tierButtons.forEach(btn => {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('scope-model tiers with custom names: none disabled', () => {
    const scopeTiers = [
      mockTier({ tier_name: 'complete_interior', tier_label: 'Complete Interior', price_cents: 20000, display_order: 0 }),
      mockTier({ tier_name: 'floor_mats', tier_label: 'Floor Mats Only', price_cents: 8000, display_order: 1 }),
    ];
    render(
      <ServiceDetailDialog
        service={mockService(scopeTiers, { pricing_model: 'scope' })}
        open={true}
        onClose={vi.fn()}
        vehicleSizeOverride={'sedan' as VehicleSizeClass}
      />
    );
    const buttons = screen.getAllByRole('button');
    const interiorBtn = buttons.find(b => b.textContent?.includes('Complete Interior'));
    const matsBtn = buttons.find(b => b.textContent?.includes('Floor Mats Only'));

    expect((interiorBtn as HTMLButtonElement).disabled).toBe(false);
    expect((matsBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
