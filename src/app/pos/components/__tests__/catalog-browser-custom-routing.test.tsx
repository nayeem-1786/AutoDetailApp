/**
 * Item 15f Layer 3e — `<CatalogBrowser>` routing for `pricing_model === 'custom'`.
 *
 * Pre-fix: tapping Flood Damage / Mold Extraction in POS New Sale or POS New
 * Quote opened `<ServiceDetailDialog>` with the "Add to Ticket" button
 * disabled (no tier / no flat_price). Layer 3e routes custom-pricing taps
 * directly to `<CustomPriceDialog>`, the same operator staff-assessment
 * prompt Layer 2 already wired into `useServicePicker`.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CatalogBrowser } from '../catalog-browser';
import type { CatalogService } from '../../types';

// ─── Context / hook mocks ─────────────────────────────────────────

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({
    ticket: {
      items: [],
      customer: { id: 'c1', name: 'Test' },
      vehicle: {
        id: 'v1',
        size_class: 'sedan',
        specialty_tier: null,
        vehicle_category: 'automobile',
      },
    },
    dispatch: vi.fn(),
  }),
}));

vi.mock('../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true }),
}));

vi.mock('../../hooks/use-prerequisite-check', () => ({
  usePrerequisiteCheck: () => ({
    warning: null,
    checkPrerequisites: vi.fn().mockResolvedValue({ canAdd: true }),
    clearWarning: vi.fn(),
  }),
}));

const FLOOD_SERVICE: CatalogService = {
  id: 'svc-flood',
  name: 'Flood Damage / Mold Extraction',
  slug: 'flood-damage',
  description: 'Specialty water-damage restoration.',
  category_id: 'cat-1',
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
  vehicle_compatibility: ['standard'],
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
} as unknown as CatalogService;

vi.mock('../../hooks/use-catalog', () => ({
  useCatalog: () => ({
    products: [],
    services: [FLOOD_SERVICE],
  }),
}));

afterEach(cleanup);

describe('<CatalogBrowser> — custom pricing_model routing (Item 15f Layer 3e)', () => {
  it('search-result tap on a custom service opens <CustomPriceDialog>', () => {
    const onAddService = vi.fn();
    render(
      <CatalogBrowser
        type="services"
        search="Flood"
        onAddService={onAddService}
      />,
    );

    // The flood service appears in the search results — tap it.
    const tile = screen.getByText('Flood Damage / Mold Extraction').closest('button');
    expect(tile).toBeDefined();
    fireEvent.click(tile!);

    // <CustomPriceDialog> opens. Its dialog title is the service name, but
    // since `<ServiceDetailDialog>` also titles by service name, we
    // disambiguate by looking for the "Final price ($)" input label that
    // only `<CustomPriceDialog>` renders.
    expect(screen.getByText('Final price ($)')).toBeDefined();
    expect(screen.getByText(/Starting from \$475\.00/)).toBeDefined();

    // The new flow does NOT auto-add — `onAddService` should not have fired.
    expect(onAddService).not.toHaveBeenCalled();
  });

  it('confirm in <CustomPriceDialog> emits a synthesized pricing row to onAddService', async () => {
    const onAddService = vi.fn();
    render(
      <CatalogBrowser
        type="services"
        search="Flood"
        onAddService={onAddService}
      />,
    );

    const tile = screen.getByText('Flood Damage / Mold Extraction').closest('button');
    fireEvent.click(tile!);

    // Enter $500 and submit.
    const input = screen.getByLabelText(/Final price/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '500' } });
    const addBtn = screen.getByText(/Add Service/).closest('button');
    fireEvent.click(addBtn!);

    // Confirm path is async: `handleCustomPriceSelect` awaits the
    // (mocked) prerequisite check before firing `onAddService`.
    await vi.waitFor(() => expect(onAddService).toHaveBeenCalledTimes(1));

    // The service is committed via the `onAddService` callback with a
    // synthesized ServicePricing row carrying $500.
    const [svc, pricing, vsc] = onAddService.mock.calls[0];
    expect(svc.id).toBe('svc-flood');
    expect(pricing.price).toBe(500);
    expect(pricing.tier_name).toBe('custom');
    expect(pricing.tier_label).toBe('Custom Assessment');
    expect(vsc).toBe('sedan');
  });

  it('cancel in <CustomPriceDialog> emits nothing to onAddService', () => {
    const onAddService = vi.fn();
    render(
      <CatalogBrowser
        type="services"
        search="Flood"
        onAddService={onAddService}
      />,
    );

    const tile = screen.getByText('Flood Damage / Mold Extraction').closest('button');
    fireEvent.click(tile!);

    // Press Cancel without entering anything.
    const cancelBtn = screen.getByText('Cancel').closest('button');
    fireEvent.click(cancelBtn!);

    expect(onAddService).not.toHaveBeenCalled();
  });
});
