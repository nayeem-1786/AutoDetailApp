import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { TicketState, FavoriteItem, CatalogService } from '../../types';
import type { ServicePricing } from '@/lib/supabase/types';

/**
 * Track A — register-tab favorite quick-add now routes through the shared
 * `useValidatedServiceAdd` helper. Before this, the register tab dispatched
 * ADD_SERVICE directly with ZERO prerequisite or add-on-only gating
 * (POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md). These lock the gates it gained.
 */

const posFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/pos-fetch', () => ({ posFetch: posFetchMock }));

const dispatchMock = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => ({ value: [] as FavoriteItem[] }));
const mockTicket = vi.hoisted(() => ({ value: null as unknown as TicketState }));
const mockCatalog = vi.hoisted(() => ({ services: [] as CatalogService[] }));

vi.mock('../../hooks/use-favorites', () => ({
  useFavorites: () => ({ favorites: mockFavorites.value, loading: false }),
}));
vi.mock('../../hooks/use-catalog', () => ({
  useCatalog: () => ({ products: [], services: mockCatalog.services, loading: false }),
}));
vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({ ticket: mockTicket.value, dispatch: dispatchMock }),
}));
vi.mock('../../context/pos-permission-context', () => ({ usePosPermission: () => ({ granted: true }) }));
vi.mock('../../context/pos-theme-context', () => ({ usePosTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('@/lib/hooks/use-enter-submit', () => ({ useEnterSubmit: () => ({}) }));
vi.mock('../service-pricing-picker', () => ({ ServicePricingPicker: () => null }));
vi.mock('../pin-pad', () => ({ PinPad: () => null }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { RegisterTab } from '../register-tab';

function makeTicket(overrides: Partial<TicketState> = {}): TicketState {
  return {
    items: [],
    customer: { id: 'cust-1', name: 'Test' } as unknown as TicketState['customer'],
    vehicle: { id: 'veh-1', size_class: 'sedan', specialty_tier: null } as unknown as TicketState['vehicle'],
    coupon: null,
    loyaltyPointsToRedeem: 0,
    loyaltyDiscount: 0,
    manualDiscount: null,
    depositCredit: 0,
    depositDate: null,
    priorPayments: [],
    priorPaymentsTotal: 0,
    notes: null,
    subtotal: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 0,
    source: 'new',
    sourceId: null,
    returnTo: null,
    editMode: false,
    editInitialSnapshot: null,
    editSourceScheduledDate: null,
    ...overrides,
  } as TicketState;
}

function singleTier(serviceId: string): ServicePricing {
  return {
    id: `${serviceId}-p`, service_id: serviceId, tier_name: 'default', tier_label: null,
    price: 100, sale_price: null, display_order: 0, is_vehicle_size_aware: false,
    vehicle_size_sedan_price: null, vehicle_size_truck_suv_price: null, vehicle_size_suv_van_price: null,
    vehicle_size_exotic_price: null, vehicle_size_classic_price: null, max_qty: null, qty_label: null, created_at: '',
  };
}

function makeService(overrides: Partial<CatalogService> = {}): CatalogService {
  const id = (overrides.id as string) ?? 'svc-1';
  return {
    id, name: 'Test Service', slug: 'test', description: null, category_id: 'cat-1',
    pricing_model: 'flat', classification: 'primary', base_duration_minutes: 60,
    flat_price: null, custom_starting_price: null, per_unit_price: null, per_unit_max: null, per_unit_label: null,
    mobile_eligible: false, online_bookable: false, staff_assessed: false, is_taxable: true,
    vehicle_compatibility: ['standard'], special_requirements: null, image_url: null, image_alt: null,
    is_active: true, show_on_website: false, is_featured: false, display_order: 0,
    sale_price: null, sale_starts_at: null, sale_ends_at: null, created_at: '', updated_at: '',
    pricing: [singleTier(id)], ...overrides,
  } as unknown as CatalogService;
}

function serviceFavorite(referenceId: string, label: string): FavoriteItem {
  return { id: `fav-${referenceId}`, type: 'service', referenceId, label, color: 'lime', colorShade: 80 };
}

function noPrereqs() {
  return { ok: true, json: async () => ({ has_prerequisites: false, satisfied: true, prerequisites: [] }) };
}
function unmetPrereq() {
  return {
    ok: true,
    json: async () => ({
      has_prerequisites: true, satisfied: false,
      prerequisites: [{ service_name: 'Express Exterior Wash', enforcement: 'required_same_ticket', required_within_days: null, warning_message: null }],
    }),
  };
}

beforeEach(() => {
  posFetchMock.mockReset();
  dispatchMock.mockReset();
  mockFavorites.value = [];
  mockTicket.value = makeTicket();
  mockCatalog.services = [];
});
afterEach(cleanup);

describe('RegisterTab — favorite quick-add validation', () => {
  it('add-on-only solo favorite raises the add-on warning and does NOT dispatch', async () => {
    posFetchMock.mockResolvedValue(noPrereqs());
    const addon = makeService({ id: 'addon-1', name: 'Pet Hair Removal', classification: 'addon_only' });
    mockCatalog.services = [addon];
    mockFavorites.value = [serviceFavorite('addon-1', 'Pet Hair Removal')];
    mockTicket.value = makeTicket({ items: [] });

    render(<RegisterTab onOpenCustomerLookup={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Pet Hair Removal/i }));

    expect(await screen.findByRole('heading', { name: /Add-On Service/i })).toBeDefined();
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
    expect(posFetchMock).not.toHaveBeenCalled();
  });

  it('prerequisite warning fires for an unmet prereq on a favorite (no dispatch)', async () => {
    posFetchMock.mockResolvedValue(unmetPrereq());
    const svc = makeService({ id: 'prep-1', name: 'Paint Correction Prep', classification: 'primary' });
    mockCatalog.services = [svc];
    mockFavorites.value = [serviceFavorite('prep-1', 'Paint Correction Prep')];

    render(<RegisterTab onOpenCustomerLookup={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Paint Correction Prep/i }));

    expect(await screen.findByRole('heading', { name: /Service Prerequisite Required/i })).toBeDefined();
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
  });

  it('a normal primary service favorite with no prereqs dispatches ADD_SERVICE', async () => {
    posFetchMock.mockResolvedValue(noPrereqs());
    const svc = makeService({ id: 'wash-1', name: 'Express Wash', classification: 'primary' });
    mockCatalog.services = [svc];
    mockFavorites.value = [serviceFavorite('wash-1', 'Express Wash')];

    render(<RegisterTab onOpenCustomerLookup={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Express Wash/i }));

    await vi.waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' })),
    );
  });
});
