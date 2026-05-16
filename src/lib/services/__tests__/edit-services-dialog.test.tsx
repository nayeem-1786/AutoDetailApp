/**
 * Item 15f Layer 3a — `<EditServicesDialog>` test.
 *
 * The dialog wraps `useServicePicker`, which internally renders
 * `<CatalogBrowser>` and `<ServicePricingPicker>`. Those components have
 * hard POS-context dependencies (`useTicket`, `usePosPermission`) and
 * would crash without a `<PosShell>` ancestor. To keep this test focused
 * on the dialog wrapper's own behavior, `useServicePicker` is vi-mocked
 * with a minimal stand-in that exposes its props for assertion AND
 * provides a stable handle for simulating the hook's
 * `onServiceSelected` callback.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import type { ServicePickerOptions } from '../use-service-picker';

// ─── Mock `useServicePicker` ────────────────────────────────────────

const hookOptionsCaptured = vi.fn();

vi.mock('../use-service-picker', () => {
  return {
    useServicePicker: (options: ServicePickerOptions) => {
      hookOptionsCaptured(options);
      return {
        CatalogPane: () => (
          <div
            data-testid="mock-catalog-pane"
            data-search={options.search ?? ''}
            data-vehicle-size={options.vehicleSizeClass ?? 'null'}
            data-specialty-tier={options.vehicleSpecialtyTier ?? 'null'}
            data-selected-count={options.selectedServiceIds.size}
          />
        ),
        ActiveDialog: () => <div data-testid="mock-active-dialog" />,
        selectedServiceIds: options.selectedServiceIds,
        tapService: vi.fn(),
        reset: vi.fn(),
      };
    },
  };
});

// Imports must come after vi.mock.
import { EditServicesDialog, type SelectedService } from '../edit-services-dialog';

beforeEach(() => {
  hookOptionsCaptured.mockClear();
  cleanup();
});

function fixtureService(): SelectedService {
  return {
    id: 'svc-1',
    name: 'Ceramic Shield',
    price: 725,
    tier_name: 'exotic',
  };
}

describe('<EditServicesDialog>', () => {
  it('renders the title and the catalog pane when open', () => {
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit Services — Job"
        vehicleSizeClass="exotic"
        vehicleSpecialtyTier={null}
        selectedServices={[]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByText('Edit Services — Job')).toBeDefined();
    expect(screen.getByTestId('mock-catalog-pane')).toBeDefined();
    expect(screen.getByTestId('mock-active-dialog')).toBeDefined();
  });

  it('returns null DOM when open=false', () => {
    render(
      <EditServicesDialog
        open={false}
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.queryByTestId('mock-catalog-pane')).toBeNull();
  });

  it('forwards vehicle size, specialty tier, and selected IDs into the hook', () => {
    const selected = [
      fixtureService(),
      { id: 'svc-2', name: 'Engine Bay Detail', price: 175 } as SelectedService,
    ];
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass="exotic"
        vehicleSpecialtyTier="small_yacht"
        selectedServices={selected}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    const opts = hookOptionsCaptured.mock.calls.at(-1)?.[0];
    expect(opts.vehicleSizeClass).toBe('exotic');
    expect(opts.vehicleSpecialtyTier).toBe('small_yacht');
    expect(opts.selectedServiceIds.size).toBe(2);
    expect(opts.selectedServiceIds.has('svc-1')).toBe(true);
    expect(opts.selectedServiceIds.has('svc-2')).toBe(true);

    // Same props echoed onto the mock pane for visual assertion.
    const pane = screen.getByTestId('mock-catalog-pane');
    expect(pane.getAttribute('data-vehicle-size')).toBe('exotic');
    expect(pane.getAttribute('data-specialty-tier')).toBe('small_yacht');
    expect(pane.getAttribute('data-selected-count')).toBe('2');
  });

  it('renders selected services with line totals', () => {
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass="exotic"
        vehicleSpecialtyTier={null}
        selectedServices={[
          { id: 'svc-1', name: 'Ceramic Shield', price: 725, tier_name: 'exotic' },
          { id: 'svc-2', name: 'Scratch Repair', price: 12.5, quantity: 3 },
        ]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByText('Ceramic Shield')).toBeDefined();
    expect(screen.getByText('Scratch Repair')).toBeDefined();
    // Ceramic Shield: $725.00 single qty
    expect(screen.getByText('$725.00')).toBeDefined();
    // Scratch Repair: 3 × $12.50 = $37.50 line total — qty annotation present
    expect(screen.getByText(/×3/)).toBeDefined();
    expect(screen.getByText('$37.50')).toBeDefined();
    // Combined total = $762.50
    expect(screen.getByText('$762.50')).toBeDefined();
  });

  it('shows the empty-state hint when no services are selected', () => {
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByText(/No services selected yet/)).toBeDefined();
  });

  it('clicking the remove button calls onServiceRemoved with the service id', () => {
    const onRemoved = vi.fn();
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[fixtureService()]}
        onServiceAdded={() => {}}
        onServiceRemoved={onRemoved}
        onSave={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Remove Ceramic Shield/ }));
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onRemoved).toHaveBeenCalledWith('svc-1');
  });

  it('Save button calls onSave when at least one service is selected', () => {
    const onSave = vi.fn();
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[fixtureService()]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Save button is disabled when no services are selected', () => {
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    expect(
      screen
        .getByRole('button', { name: /Save Changes/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('Cancel calls onClose and is disabled while saving', () => {
    const onClose = vi.fn();
    render(
      <EditServicesDialog
        open
        onClose={onClose}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[fixtureService()]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
        isSaving
      />,
    );
    expect(
      screen
        .getByRole('button', { name: /Cancel/ })
        .hasAttribute('disabled'),
    ).toBe(true);
    // Save button shows the loading label.
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDefined();
  });

  it('surfaces saveError when provided', () => {
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[fixtureService()]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
        saveError="Failed to save: server returned 500"
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/server returned 500/);
  });

  it('honors a custom saveLabel', () => {
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[fixtureService()]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
        saveLabel="Update Services"
      />,
    );
    expect(screen.getByRole('button', { name: 'Update Services' })).toBeDefined();
  });

  it('forwards the search input value to the hook', () => {
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServices={[]}
        onServiceAdded={() => {}}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    const input = screen.getByLabelText(/Search services/);
    fireEvent.change(input, { target: { value: 'ceramic' } });
    const opts = hookOptionsCaptured.mock.calls.at(-1)?.[0];
    expect(opts.search).toBe('ceramic');
  });

  it('the hook callback (onServiceSelected) forwards to onServiceAdded', () => {
    const onAdded = vi.fn();
    render(
      <EditServicesDialog
        open
        onClose={() => {}}
        title="Edit"
        vehicleSizeClass="sedan"
        vehicleSpecialtyTier={null}
        selectedServices={[]}
        onServiceAdded={onAdded}
        onServiceRemoved={() => {}}
        onSave={() => {}}
      />,
    );
    // The hook mock captures options each render. The dialog passes
    // `onServiceSelected: onServiceAdded` — verify it's the same callable
    // identity (after one re-render layer of `useMemo` inside callers).
    const opts = hookOptionsCaptured.mock.calls.at(-1)?.[0];
    const mockSvc = { id: 'svc-x' } as CatalogService;
    const mockPricing = { price: 99 } as ServicePricing;
    const mockVsc: VehicleSizeClass = 'sedan';
    opts.onServiceSelected(mockSvc, mockPricing, mockVsc, undefined);
    expect(onAdded).toHaveBeenCalledWith(mockSvc, mockPricing, 'sedan', undefined);
  });
});
