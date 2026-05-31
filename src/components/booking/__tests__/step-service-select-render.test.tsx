/**
 * N1 + W6 (Unit B audit, 2026-05-30) — render tests for StepServiceSelect.
 *
 *   N1 — explicit Back button mirroring step-schedule.tsx:285. Renders
 *        only when `onBack` is provided; clicking invokes it. Operator
 *        confirmed Step 2 read as "no way back" pre-fix.
 *   W6 — `services.special_requirements` text surfaced on the service
 *        card so customers see preparation/access notes BEFORE picking.
 *        Pre-fix the field was admin-only despite being customer-relevant.
 *
 * The companion file `step-service-select.test.tsx` covers pure unit
 * tests on `computePrice` / `getServicePriceDisplay`; this file owns
 * the render-side behavior so each layer's tests stay separable.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { StepServiceSelect } from '../step-service-select';
import type { BookableCategory, BookableService } from '@/lib/data/booking';
import type { ServicePricing, MobileZone } from '@/lib/supabase/types';

// ───────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────

function tier(overrides: Partial<ServicePricing> = {}): ServicePricing {
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

function service(overrides: Partial<BookableService> = {}): BookableService {
  return {
    id: 'svc-1',
    name: 'Express Wash',
    slug: 'express-wash',
    description: 'Quick exterior wash and dry.',
    category_id: 'cat-1',
    pricing_model: 'flat',
    classification: 'primary',
    base_duration_minutes: 30,
    flat_price: 50,
    custom_starting_price: null,
    per_unit_price: null,
    per_unit_max: null,
    per_unit_label: null,
    mobile_eligible: true,
    online_bookable: true,
    staff_assessed: false,
    is_taxable: true,
    vehicle_compatibility: [],
    special_requirements: null,
    image_url: null,
    image_alt: null,
    is_active: true,
    show_on_website: true,
    is_featured: false,
    display_order: 0,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    created_at: '',
    updated_at: '',
    service_pricing: [tier({ tier_name: 'flat', price: 50 })],
    service_addon_suggestions: [],
    ...overrides,
  } as BookableService;
}

function category(overrides: Partial<BookableCategory['category']> = {}, services: BookableService[] = [service()]): BookableCategory {
  return {
    category: {
      id: 'cat-1',
      name: 'Exterior',
      slug: 'exterior',
      description: null,
      display_order: 0,
      icon: null,
      image_url: null,
      is_active: true,
      created_at: '',
      updated_at: '',
      ...overrides,
    } as BookableCategory['category'],
    services,
  };
}

const baseMobileZones: MobileZone[] = [];

afterEach(() => {
  cleanup();
});

// ───────────────────────────────────────────────────────────────
// N1 — explicit Back button
// ───────────────────────────────────────────────────────────────

describe('N1 — Step 2 Back button', () => {
  it('renders a "Back" button when `onBack` is provided', () => {
    render(
      <StepServiceSelect
        categories={[category()]}
        selectedServiceId={null}
        onSelect={vi.fn()}
        mobileZones={baseMobileZones}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /^Back$/i })).toBeTruthy();
  });

  it('does NOT render "Back" when `onBack` is omitted (edit-from-Step-4 mode)', () => {
    render(
      <StepServiceSelect
        categories={[category()]}
        selectedServiceId={null}
        onSelect={vi.fn()}
        mobileZones={baseMobileZones}
      />
    );
    expect(screen.queryByRole('button', { name: /^Back$/i })).toBeNull();
  });

  it('invokes the `onBack` callback when clicked', () => {
    const onBack = vi.fn();
    render(
      <StepServiceSelect
        categories={[category()]}
        selectedServiceId={null}
        onSelect={vi.fn()}
        mobileZones={baseMobileZones}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────
// W6 — special_requirements display on service card
// ───────────────────────────────────────────────────────────────

describe('W6 — special_requirements on service card', () => {
  it('renders requirements text when `service.special_requirements` is set', () => {
    const svc = service({
      special_requirements: 'Vehicle must be parked outdoors with hose access.',
    });
    render(
      <StepServiceSelect
        categories={[category({}, [svc])]}
        selectedServiceId={null}
        onSelect={vi.fn()}
        mobileZones={baseMobileZones}
      />
    );
    // Note label + body text both render
    expect(screen.getByText('Note:')).toBeTruthy();
    expect(
      screen.getByText(/Vehicle must be parked outdoors with hose access\./)
    ).toBeTruthy();
  });

  it('does NOT render the Note label when special_requirements is null', () => {
    const svc = service({ special_requirements: null });
    render(
      <StepServiceSelect
        categories={[category({}, [svc])]}
        selectedServiceId={null}
        onSelect={vi.fn()}
        mobileZones={baseMobileZones}
      />
    );
    expect(screen.queryByText('Note:')).toBeNull();
  });

  it('does NOT render the Note label when special_requirements is empty string', () => {
    // Falsy guard — empty string should be treated as "no note"
    const svc = service({ special_requirements: '' });
    render(
      <StepServiceSelect
        categories={[category({}, [svc])]}
        selectedServiceId={null}
        onSelect={vi.fn()}
        mobileZones={baseMobileZones}
      />
    );
    expect(screen.queryByText('Note:')).toBeNull();
  });
});
