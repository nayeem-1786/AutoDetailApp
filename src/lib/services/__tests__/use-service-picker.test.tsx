/**
 * Item 15f Layer 1 — `useServicePicker` hook contract test.
 *
 * The hook wraps `<CatalogBrowser>` and `<ServicePricingPicker>`. Those
 * components depend on POS contexts (TicketContext, PosPermissionContext,
 * CatalogContext) and would crash without providers. To keep this test
 * focused on the hook's WIRING (not the wrapped components' behavior),
 * both wrapped components are vi-mocked with minimal stand-ins that
 * expose their props for assertion.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

// ─── Mocks (must be declared before importing the hook) ──────────────

const onAddServiceCaptured = vi.fn();

vi.mock('@/app/pos/components/catalog-browser', () => {
  return {
    CatalogBrowser: (props: {
      type: string;
      search: string;
      vehicleSizeOverride: VehicleSizeClass | null;
      vehicleSpecialtyTierOverride: string | null;
      addedServiceIds?: Set<string>;
      onAddService?: (
        s: CatalogService,
        p: ServicePricing,
        vsc: VehicleSizeClass | null,
        q?: number,
      ) => void;
    }) => {
      onAddServiceCaptured(props.onAddService);
      return (
        <div
          data-testid="mock-catalog-browser"
          data-type={props.type}
          data-search={props.search}
          data-vehicle-size={props.vehicleSizeOverride ?? 'null'}
          data-specialty-tier={props.vehicleSpecialtyTierOverride ?? 'null'}
          data-added-count={props.addedServiceIds?.size ?? 0}
        />
      );
    },
  };
});

vi.mock('@/app/pos/components/service-pricing-picker', () => {
  return {
    ServicePricingPicker: (props: {
      open: boolean;
      service: CatalogService;
      vehicleSizeClass: VehicleSizeClass | null;
      vehicleSpecialtyTier: string | null;
      onSelect: (
        p: ServicePricing,
        vsc: VehicleSizeClass | null,
        q?: number,
      ) => void;
      onClose: () => void;
    }) => (
      <div
        data-testid="mock-service-pricing-picker"
        data-open={String(props.open)}
        data-service-id={props.service.id}
        data-vehicle-size={props.vehicleSizeClass ?? 'null'}
        data-specialty-tier={props.vehicleSpecialtyTier ?? 'null'}
      />
    ),
  };
});

// Layer 2 — mock the custom-price dialog. The hook's ActiveDialog mounts
// this when `routeServiceTap` returns `open-custom-price-dialog`. The
// mock exposes its props for assertion AND provides a stable handle for
// simulating the operator's "Add Service" tap (via onSelect).
const customDialogOnSelectCaptured = vi.fn();
vi.mock('../custom-price-dialog', () => {
  return {
    CustomPriceDialog: (props: {
      open: boolean;
      service: CatalogService;
      vehicleSizeClass: VehicleSizeClass | null;
      onClose: () => void;
      onSelect: (
        p: ServicePricing,
        vsc: VehicleSizeClass | null,
        q?: number,
      ) => void;
    }) => {
      customDialogOnSelectCaptured(props.onSelect);
      return (
        <div
          data-testid="mock-custom-price-dialog"
          data-open={String(props.open)}
          data-service-id={props.service.id}
          data-vehicle-size={props.vehicleSizeClass ?? 'null'}
        />
      );
    },
    // The hook does not import buildCustomPricing, but the barrel
    // re-exports it. Keep a permissive stub so the module shape matches.
    buildCustomPricing: vi.fn(),
  };
});

// Imports must come after vi.mock declarations.
import { useServicePicker } from '../use-service-picker';

// ─── Fixtures ────────────────────────────────────────────────────────

function mockService(overrides: Partial<CatalogService> = {}): CatalogService {
  return {
    id: 'svc-1',
    name: 'Test Service',
    description: null,
    category_id: null,
    pricing_model: 'flat',
    classification: 'service',
    base_duration_minutes: 60,
    flat_price: 75,
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
    pricing: [],
    ...overrides,
  } as CatalogService;
}

function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: 'p1',
    service_id: 'svc-1',
    tier_name: 'default',
    tier_label: null,
    price: 75,
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

// ─── Test harness ────────────────────────────────────────────────────

interface HarnessProps {
  vehicleSizeClass: VehicleSizeClass | null;
  vehicleSpecialtyTier: string | null;
  selectedServiceIds: Set<string>;
  search?: string;
  onServiceSelected: (
    service: CatalogService,
    pricing: ServicePricing,
    vsc: VehicleSizeClass | null,
    perUnitQty?: number,
  ) => void;
  surfaceRef: {
    current: ReturnType<typeof useServicePicker> | null;
  };
}

function Harness({ surfaceRef, ...options }: HarnessProps) {
  const surface = useServicePicker(options);
  surfaceRef.current = surface;
  return (
    <>
      <surface.CatalogPane />
      <surface.ActiveDialog />
    </>
  );
}

beforeEach(() => {
  onAddServiceCaptured.mockClear();
  customDialogOnSelectCaptured.mockClear();
  cleanup();
});

describe('useServicePicker — Layer 1 contract', () => {
  it('returns the surface shape { CatalogPane, ActiveDialog, selectedServiceIds, reset }', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    const ids = new Set<string>(['existing-1']);
    render(
      <Harness
        vehicleSizeClass="sedan"
        vehicleSpecialtyTier={null}
        selectedServiceIds={ids}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    expect(surfaceRef.current).not.toBeNull();
    const s = surfaceRef.current!;
    expect(typeof s.CatalogPane).toBe('function');
    expect(typeof s.ActiveDialog).toBe('function');
    expect(typeof s.reset).toBe('function');
    expect(s.selectedServiceIds).toBe(ids);
  });

  it('renders the CatalogPane without crashing and forwards props to <CatalogBrowser>', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    render(
      <Harness
        vehicleSizeClass="exotic"
        vehicleSpecialtyTier="small_yacht"
        selectedServiceIds={new Set(['a', 'b'])}
        search="ceram"
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    const browser = screen.getByTestId('mock-catalog-browser');
    expect(browser).toBeDefined();
    expect(browser.getAttribute('data-type')).toBe('services');
    expect(browser.getAttribute('data-search')).toBe('ceram');
    expect(browser.getAttribute('data-vehicle-size')).toBe('exotic');
    expect(browser.getAttribute('data-specialty-tier')).toBe('small_yacht');
    expect(browser.getAttribute('data-added-count')).toBe('2');
  });

  it('renders null ActiveDialog when no service is active', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    expect(screen.queryByTestId('mock-service-pricing-picker')).toBeNull();
    expect(screen.queryByTestId('mock-custom-price-dialog')).toBeNull();
  });

  it('invokes onServiceSelected when <CatalogBrowser> emits onAddService (quick-add flow)', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    const onSelect = vi.fn();
    render(
      <Harness
        vehicleSizeClass="sedan"
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={onSelect}
        surfaceRef={surfaceRef}
      />,
    );
    // Pull the latest captured onAddService callback the mock browser received.
    const cb = onAddServiceCaptured.mock.calls.at(-1)?.[0] as (
      s: CatalogService,
      p: ServicePricing,
      vsc: VehicleSizeClass | null,
      q?: number,
    ) => void;
    expect(typeof cb).toBe('function');

    const svc = mockService();
    const pricing = mockTier();
    act(() => {
      cb(svc, pricing, 'sedan', undefined);
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(svc, pricing, 'sedan', undefined);
  });

  it('forwards perUnitQty when the browser passes one (per-unit flow)', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    const onSelect = vi.fn();
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={onSelect}
        surfaceRef={surfaceRef}
      />,
    );
    const cb = onAddServiceCaptured.mock.calls.at(-1)?.[0] as (
      s: CatalogService,
      p: ServicePricing,
      vsc: VehicleSizeClass | null,
      q?: number,
    ) => void;
    const svc = mockService({ pricing_model: 'per_unit', per_unit_price: 12.5 });
    const pricing = mockTier({ tier_name: 'default', price: 37.5 });
    act(() => {
      cb(svc, pricing, null, 3);
    });
    expect(onSelect).toHaveBeenCalledWith(svc, pricing, null, 3);
  });

  it('reset() is callable without throwing even when no dialog is open', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    expect(() => surfaceRef.current!.reset()).not.toThrow();
    // Still no dialog rendered after reset on already-empty state.
    expect(screen.queryByTestId('mock-service-pricing-picker')).toBeNull();
  });

  it('re-exposes the caller-supplied selectedServiceIds Set identity', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    const ids = new Set<string>(['x', 'y', 'z']);
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={ids}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    expect(surfaceRef.current!.selectedServiceIds).toBe(ids);
  });
});

// ─── Layer 2 — tapService imperative entry + custom dialog wiring ────

function mockCustomService(): CatalogService {
  return mockService({
    id: 'svc-flood',
    name: 'Flood Damage / Mold Extraction',
    pricing_model: 'custom',
    custom_starting_price: 475,
    flat_price: null,
    pricing: [],
  });
}

describe('useServicePicker — Layer 2 (custom pricing_model)', () => {
  it('exposes tapService on the surface', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    expect(typeof surfaceRef.current!.tapService).toBe('function');
  });

  it('tapService on a custom service opens <CustomPriceDialog>', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    render(
      <Harness
        vehicleSizeClass="exotic"
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    expect(screen.queryByTestId('mock-custom-price-dialog')).toBeNull();
    act(() => {
      surfaceRef.current!.tapService(mockCustomService());
    });
    const dialog = screen.getByTestId('mock-custom-price-dialog');
    expect(dialog.getAttribute('data-open')).toBe('true');
    expect(dialog.getAttribute('data-service-id')).toBe('svc-flood');
    expect(dialog.getAttribute('data-vehicle-size')).toBe('exotic');
    // Picker should NOT be mounted.
    expect(screen.queryByTestId('mock-service-pricing-picker')).toBeNull();
  });

  it('tapService on a flat-price service quick-adds without opening any dialog', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    const onSelect = vi.fn();
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={onSelect}
        surfaceRef={surfaceRef}
      />,
    );
    const flatSvc = mockService({
      id: 'svc-flat',
      pricing_model: 'flat',
      flat_price: 45,
      pricing: [],
    });
    act(() => {
      surfaceRef.current!.tapService(flatSvc);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [emittedSvc, emittedPricing, emittedVsc, emittedQty] = onSelect.mock.calls[0];
    expect(emittedSvc.id).toBe('svc-flat');
    expect(emittedPricing.price).toBe(45);
    expect(emittedPricing.tier_name).toBe('default');
    expect(emittedVsc).toBeNull();
    expect(emittedQty).toBeUndefined();
    expect(screen.queryByTestId('mock-custom-price-dialog')).toBeNull();
    expect(screen.queryByTestId('mock-service-pricing-picker')).toBeNull();
  });

  it('tapService on a per_unit service opens <ServicePricingPicker> (not the custom dialog)', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    const perUnitSvc = mockService({
      id: 'svc-per-unit',
      pricing_model: 'per_unit',
      per_unit_price: 12.5,
      per_unit_max: 10,
      per_unit_label: 'row',
      pricing: [],
    });
    act(() => {
      surfaceRef.current!.tapService(perUnitSvc);
    });
    expect(screen.getByTestId('mock-service-pricing-picker')).toBeDefined();
    expect(screen.queryByTestId('mock-custom-price-dialog')).toBeNull();
  });

  it('confirming the custom dialog emits onServiceSelected with the synthesized pricing row and closes the dialog', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    const onSelect = vi.fn();
    render(
      <Harness
        vehicleSizeClass="sedan"
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={onSelect}
        surfaceRef={surfaceRef}
      />,
    );
    const svc = mockCustomService();
    act(() => {
      surfaceRef.current!.tapService(svc);
    });
    // Dialog is now mounted; capture its onSelect callback and simulate
    // the operator confirming a price.
    const dialogOnSelect = customDialogOnSelectCaptured.mock.calls.at(-1)?.[0] as (
      p: ServicePricing,
      vsc: VehicleSizeClass | null,
      q?: number,
    ) => void;
    expect(typeof dialogOnSelect).toBe('function');

    // Build a synthetic ServicePricing row representing the operator's
    // entry (the real <CustomPriceDialog> does this internally via
    // buildCustomPricing — the mock leaves the synthesis to the test).
    const synthesized: ServicePricing = {
      id: 'custom-svc-flood-123',
      service_id: svc.id,
      tier_name: 'custom',
      tier_label: 'Custom Assessment',
      price: 525.5,
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
    };
    act(() => {
      dialogOnSelect(synthesized, 'sedan', undefined);
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(svc, synthesized, 'sedan', undefined);

    // Dialog closes after confirm.
    expect(screen.queryByTestId('mock-custom-price-dialog')).toBeNull();
  });

  it('reset() closes the custom dialog when open', () => {
    const surfaceRef: HarnessProps['surfaceRef'] = { current: null };
    render(
      <Harness
        vehicleSizeClass={null}
        vehicleSpecialtyTier={null}
        selectedServiceIds={new Set()}
        onServiceSelected={() => {}}
        surfaceRef={surfaceRef}
      />,
    );
    act(() => {
      surfaceRef.current!.tapService(mockCustomService());
    });
    expect(screen.getByTestId('mock-custom-price-dialog')).toBeDefined();

    act(() => {
      surfaceRef.current!.reset();
    });
    expect(screen.queryByTestId('mock-custom-price-dialog')).toBeNull();
  });
});
