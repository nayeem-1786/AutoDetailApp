import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { CatalogService } from '../../types';
import type { ServicePricing } from '@/lib/supabase/types';

/**
 * Track A — Sale & Quote add-time validation wiring through <CatalogBrowser>.
 *
 * Proves the shared `useValidatedServiceAdd` helper is wired with the correct
 * context on both add surfaces this component serves:
 *   - SALE (dispatch mode, no onAddService): add-on-only gate fires for a solo
 *     addon, and the prerequisite warning fires for an unmet prereq — against
 *     the live Sale ticket.
 *   - QUOTE BROWSE (callback mode + context-override props): the prerequisite
 *     check posts the QUOTE's customer/vehicle/line-items, NOT the Sale
 *     ticket's. This is the G5 wrong-context bug, now fixed.
 */

const posFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/pos-fetch', () => ({ posFetch: posFetchMock }));

const dispatchMock = vi.hoisted(() => vi.fn());
const mockTicket = vi.hoisted(() => ({ value: null as unknown as Record<string, unknown> }));
const mockCatalog = vi.hoisted(() => ({ services: [] as CatalogService[] }));

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({ ticket: mockTicket.value, dispatch: dispatchMock }),
}));
vi.mock('../../hooks/use-catalog', () => ({
  useCatalog: () => ({ products: [], services: mockCatalog.services, loading: false }),
}));
vi.mock('../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { CatalogBrowser } from '../catalog-browser';

function singleTier(serviceId: string): ServicePricing {
  return {
    id: `${serviceId}-p`,
    service_id: serviceId,
    tier_name: 'default',
    tier_label: null,
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
  };
}

function makeService(overrides: Partial<CatalogService> = {}): CatalogService {
  const id = (overrides.id as string) ?? 'svc-1';
  return {
    id,
    name: 'Test Service',
    slug: 'test-service',
    description: null,
    category_id: 'cat-1',
    pricing_model: 'flat',
    classification: 'primary',
    base_duration_minutes: 60,
    flat_price: null,
    custom_starting_price: null,
    per_unit_price: null,
    per_unit_max: null,
    per_unit_label: null,
    mobile_eligible: false,
    online_bookable: false,
    staff_assessed: false,
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
    pricing: [singleTier(id)],
    ...overrides,
  } as unknown as CatalogService;
}

function saleTicket(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    customer: { id: 'sale-cust', name: 'Sale Customer' },
    vehicle: { id: 'sale-veh', size_class: 'sedan', specialty_tier: null, vehicle_category: 'automobile' },
    ...overrides,
  };
}

function noPrereqs() {
  return { ok: true, json: async () => ({ has_prerequisites: false, satisfied: true, prerequisites: [] }) };
}
function unmetPrereq() {
  return {
    ok: true,
    json: async () => ({
      has_prerequisites: true,
      satisfied: false,
      prerequisites: [{ service_name: 'Express Exterior Wash', enforcement: 'required_same_ticket', required_within_days: null, warning_message: null }],
    }),
  };
}

beforeEach(() => {
  posFetchMock.mockReset();
  dispatchMock.mockReset();
  mockTicket.value = saleTicket();
  mockCatalog.services = [];
});
afterEach(cleanup);

describe('<CatalogBrowser> — Sale add-time validation', () => {
  it('add-on-only solo tap (service with NO prereqs) raises the add-on warning and does NOT dispatch', async () => {
    posFetchMock.mockResolvedValue(noPrereqs());
    const addon = makeService({ id: 'addon-1', name: 'Pet Hair Removal', classification: 'addon_only' });
    mockCatalog.services = [addon];
    mockTicket.value = saleTicket({ items: [] });

    render(<CatalogBrowser type="services" search="Pet" />);
    fireEvent.click(screen.getByText('Pet Hair Removal').closest('button')!);

    expect(await screen.findByRole('heading', { name: /Add-On Service/i })).toBeDefined();
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
    // #122: the prereq check runs FIRST (it's how we learn there are no prereqs),
    // then the add-on gate fires.
    expect(posFetchMock).toHaveBeenCalled();
  });

  it('addon_only WITH unmet prereqs shows the PREREQ dialog, not the add-on PIN (#122 gate order)', async () => {
    posFetchMock.mockResolvedValue(unmetPrereq());
    const addon = makeService({ id: 'prep-1', name: 'Paint Correction Prep', classification: 'addon_only' });
    mockCatalog.services = [addon];
    mockTicket.value = saleTicket({ items: [] });

    render(<CatalogBrowser type="services" search="Paint" />);
    fireEvent.click(screen.getByText('Paint Correction Prep').closest('button')!);

    expect(await screen.findByRole('heading', { name: /Service Prerequisite Required/i })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /Add-On Service/i })).toBeNull();
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
  });

  it('prerequisite warning fires for an unmet required_same_ticket prereq (no dispatch)', async () => {
    posFetchMock.mockResolvedValue(unmetPrereq());
    const svc = makeService({ id: 'prep-1', name: 'Paint Correction Prep', classification: 'primary' });
    mockCatalog.services = [svc];

    render(<CatalogBrowser type="services" search="Paint" />);
    fireEvent.click(screen.getByText('Paint Correction Prep').closest('button')!);

    expect(await screen.findByRole('heading', { name: /Service Prerequisite Required/i })).toBeDefined();
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
  });

  it('parity guard: a primary service with no prereqs still dispatches ADD_SERVICE (reference happy-path unchanged)', async () => {
    posFetchMock.mockResolvedValue(noPrereqs());
    const svc = makeService({ id: 'wash-1', name: 'Express Wash', classification: 'primary' });
    mockCatalog.services = [svc];

    render(<CatalogBrowser type="services" search="Express" />);
    fireEvent.click(screen.getByText('Express Wash').closest('button')!);

    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ADD_SERVICE', service: expect.objectContaining({ id: 'wash-1' }) }),
      ),
    );
    expect(screen.queryByRole('heading', { name: /Service Prerequisite Required/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Add-On Service/i })).toBeNull();
  });
});

describe('<CatalogBrowser> — Quote browse context binding (G5 fix)', () => {
  it('validates against the QUOTE context (override props), NOT the Sale ticket', async () => {
    posFetchMock.mockResolvedValue(noPrereqs());
    const onAddService = vi.fn();
    const svc = makeService({ id: 'prep-1', name: 'Paint Correction Prep', classification: 'primary' });
    mockCatalog.services = [svc];
    // Sale ticket has a DIFFERENT customer and a line item — if the helper read
    // the Sale ticket (the old G5 bug) the POST would carry these instead.
    mockTicket.value = saleTicket({
      customer: { id: 'sale-cust' },
      items: [{ itemType: 'service', serviceId: 'sale-svc-y' }],
    });

    render(
      <CatalogBrowser
        type="services"
        search="Paint"
        onAddService={onAddService}
        customerIdOverride="quote-cust"
        vehicleIdOverride="quote-veh"
        serviceIdsOverride={['quote-svc-x']}
      />,
    );
    fireEvent.click(screen.getByText('Paint Correction Prep').closest('button')!);

    await waitFor(() => expect(posFetchMock).toHaveBeenCalled());
    const body = JSON.parse(posFetchMock.mock.calls[0][1].body);
    expect(body.customer_id).toBe('quote-cust');
    expect(body.vehicle_id).toBe('quote-veh');
    expect(body.ticket_service_ids).toEqual(['quote-svc-x']);
    // And it committed via the quote callback, not a ticket dispatch.
    await waitFor(() => expect(onAddService).toHaveBeenCalledTimes(1));
  });
});
