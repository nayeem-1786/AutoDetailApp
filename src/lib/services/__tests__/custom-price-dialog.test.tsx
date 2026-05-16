/**
 * Item 15f Layer 2 — `<CustomPriceDialog>` component tests.
 *
 * Canonical fixture: "Flood Damage / Mold Extraction" — the only
 * production service today with `pricing_model: 'custom'` and a
 * `custom_starting_price` of $475.00 with no `service_pricing` rows.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { CustomPriceDialog, buildCustomPricing } from '../custom-price-dialog';
import type { CatalogService } from '@/app/pos/types';

function mockCustomService(
  overrides: Partial<CatalogService> = {},
): CatalogService {
  return {
    id: 'svc-flood',
    name: 'Flood Damage / Mold Extraction',
    description:
      'Specialty water-damage restoration with mold remediation. Pricing depends on severity, square footage, and treatment scope.',
    category_id: null,
    pricing_model: 'custom',
    classification: 'service',
    base_duration_minutes: 180,
    flat_price: null,
    custom_starting_price: 475,
    per_unit_price: null,
    per_unit_max: null,
    per_unit_label: null,
    mobile_eligible: false,
    online_bookable: false,
    staff_assessed: true,
    is_taxable: true,
    vehicle_compatibility: [],
    special_requirements: null,
    image_url: null,
    image_alt: null,
    is_active: true,
    show_on_website: false,
    is_featured: false,
    display_order: 0,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    created_at: '',
    updated_at: '',
    pricing: [],
    ...overrides,
  } as CatalogService;
}

beforeEach(() => {
  cleanup();
});

describe('<CustomPriceDialog>', () => {
  it('renders service name, description, and starting-price reference', () => {
    const svc = mockCustomService();
    render(
      <CustomPriceDialog
        open
        service={svc}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Flood Damage / Mold Extraction')).toBeDefined();
    expect(
      screen.getByText(/Specialty water-damage restoration/),
    ).toBeDefined();
    expect(screen.getByText('Starting from $475.00')).toBeDefined();
    expect(screen.getByText(/staff assessment required/)).toBeDefined();
  });

  it('omits starting-price line and shows generic prompt when custom_starting_price is null', () => {
    const svc = mockCustomService({ custom_starting_price: null });
    render(
      <CustomPriceDialog
        open
        service={svc}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText(/Starting from/)).toBeNull();
    expect(
      screen.getByText('Staff assessment required — enter the final price'),
    ).toBeDefined();
  });

  it('Add button is disabled until a valid amount is entered', () => {
    render(
      <CustomPriceDialog
        open
        service={mockCustomService()}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    const addBtn = screen.getByRole('button', { name: /Add Service/ });
    expect(addBtn.hasAttribute('disabled')).toBe(true);

    const input = screen.getByLabelText(/Final price/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '525.50' } });

    expect(addBtn.hasAttribute('disabled')).toBe(false);
    expect(addBtn.textContent).toContain('$525.50');
  });

  it('rejects negative amounts with an inline error', () => {
    render(
      <CustomPriceDialog
        open
        service={mockCustomService()}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    const input = screen.getByLabelText(/Final price/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-10' } });
    expect(screen.getByRole('alert').textContent).toMatch(/greater than \$0/);
    expect(
      screen.getByRole('button', { name: /Add Service/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('rejects zero with an inline error', () => {
    render(
      <CustomPriceDialog
        open
        service={mockCustomService()}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Final price/), {
      target: { value: '0' },
    });
    expect(screen.getByRole('alert').textContent).toMatch(/greater than \$0/);
  });

  it('rejects amounts below the Stripe minimum ($0.50)', () => {
    render(
      <CustomPriceDialog
        open
        service={mockCustomService()}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Final price/), {
      target: { value: '0.25' },
    });
    expect(screen.getByRole('alert').textContent).toMatch(/at least \$0\.50/);
    expect(
      screen.getByRole('button', { name: /Add Service/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('rejects non-numeric input', () => {
    render(
      <CustomPriceDialog
        open
        service={mockCustomService()}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    // Native number inputs filter most non-numeric characters; jsdom
    // however accepts arbitrary strings, so this verifies the inline
    // numeric guard catches an unparseable value.
    fireEvent.change(screen.getByLabelText(/Final price/), {
      target: { value: 'abc' },
    });
    // With an unparseable value, the number input yields an empty
    // .value in jsdom, which the validator treats as "not yet entered".
    // Either path is acceptable — assert the Add button stays disabled.
    expect(
      screen.getByRole('button', { name: /Add Service/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('accepts the Stripe-minimum boundary value ($0.50)', () => {
    render(
      <CustomPriceDialog
        open
        service={mockCustomService()}
        vehicleSizeClass={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Final price/), {
      target: { value: '0.50' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /Add Service/ })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('Confirm emits onSelect with a synthetic ServicePricing row carrying the entered amount', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const svc = mockCustomService();
    render(
      <CustomPriceDialog
        open
        service={svc}
        vehicleSizeClass="exotic"
        onClose={onClose}
        onSelect={onSelect}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Final price/), {
      target: { value: '525.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Service/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [pricing, vsc, qty] = onSelect.mock.calls[0];
    expect(pricing.price).toBe(525.5);
    expect(pricing.tier_name).toBe('custom');
    expect(pricing.tier_label).toBe('Custom Assessment');
    expect(pricing.is_vehicle_size_aware).toBe(false);
    expect(pricing.sale_price).toBeNull();
    expect(pricing.service_id).toBe(svc.id);
    expect(pricing.id).toMatch(/^custom-svc-flood-\d+$/);
    expect(vsc).toBe('exotic');
    expect(qty).toBeUndefined();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes the dialog without emitting onSelect', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomPriceDialog
        open
        service={mockCustomService()}
        vehicleSizeClass={null}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Final price/), {
      target: { value: '475' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────
// buildCustomPricing — pure helper unit test
// ───────────────────────────────────────────────────────────────

describe('buildCustomPricing', () => {
  it('synthesizes a non-size-aware row with the entered amount', () => {
    const svc = mockCustomService();
    const row = buildCustomPricing(svc, 525.5);
    expect(row.service_id).toBe(svc.id);
    expect(row.price).toBe(525.5);
    expect(row.tier_name).toBe('custom');
    expect(row.tier_label).toBe('Custom Assessment');
    expect(row.is_vehicle_size_aware).toBe(false);
    expect(row.vehicle_size_sedan_price).toBeNull();
    expect(row.vehicle_size_truck_suv_price).toBeNull();
    expect(row.vehicle_size_suv_van_price).toBeNull();
    expect(row.vehicle_size_exotic_price).toBeNull();
    expect(row.vehicle_size_classic_price).toBeNull();
    expect(row.max_qty).toBeNull();
    expect(row.qty_label).toBeNull();
    expect(row.sale_price).toBeNull();
    expect(row.display_order).toBe(0);
    expect(row.id).toMatch(/^custom-svc-flood-\d+$/);
  });
});
