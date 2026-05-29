import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { CatalogService, QuoteState } from '../../../types';
import type { ServicePricing } from '@/lib/supabase/types';

/**
 * Track A — Quotes SEARCH path validation wiring.
 *
 * The quote search/picker handlers route through the shared
 * `useValidatedServiceAdd` helper bound to the QUOTE context. These prove the
 * prerequisite check fires (with quote customer/vehicle/line-items) and the
 * add-on-only gate fires on the search surface.
 */

const posFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/pos-fetch', () => ({ posFetch: posFetchMock }));

const dispatchMock = vi.hoisted(() => vi.fn());
const mockQuote = vi.hoisted(() => ({ value: null as unknown as QuoteState }));
const mockCatalog = vi.hoisted(() => ({ services: [] as CatalogService[] }));

vi.mock('../../../context/quote-context', () => ({
  useQuote: () => ({ quote: mockQuote.value, dispatch: dispatchMock, quoteValidityDays: 30 }),
}));
vi.mock('../../../hooks/use-catalog', () => ({
  useCatalog: () => ({ products: [], services: mockCatalog.services, loading: false }),
}));
vi.mock('@/lib/hooks/use-barcode-scanner', () => ({ useBarcodeScanner: () => {} }));
vi.mock('../../catalog-browser', () => ({ CatalogBrowser: () => null }));
vi.mock('../../service-pricing-picker', () => ({ ServicePricingPicker: () => null }));
vi.mock('../quote-ticket-panel', () => ({ QuoteTicketPanel: () => null }));
vi.mock('../../search-bar', () => ({
  SearchBar: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="searchbar" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../catalog-grid', () => ({
  ProductGrid: () => null,
  ServiceGrid: ({ services, onTapService }: { services: CatalogService[]; onTapService: (s: CatalogService) => void }) => (
    <div>
      {services.map((s) => (
        <button key={s.id} onClick={() => onTapService(s)}>{s.name}</button>
      ))}
    </div>
  ),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { QuoteBuilder } from '../quote-builder';

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

function makeQuote(overrides: Partial<QuoteState> = {}): QuoteState {
  return {
    items: [],
    customer: { id: 'quote-cust', name: 'Quote Customer' } as unknown as QuoteState['customer'],
    vehicle: { id: 'quote-veh', size_class: 'sedan', specialty_tier: null } as unknown as QuoteState['vehicle'],
    coupon: null,
    loyaltyPointsToRedeem: 0,
    loyaltyDiscount: 0,
    manualDiscount: null,
    notes: null,
    subtotal: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 0,
    quoteId: 'q-1',
    quoteNumber: 'Q-1',
    validUntil: null,
    status: 'draft',
    mobile: { isMobile: false, zoneId: null, address: '', surcharge: 0, zoneNameSnapshot: '', isCustom: false },
    ...overrides,
  } as QuoteState;
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

function search(term: string) {
  fireEvent.change(screen.getByTestId('searchbar'), { target: { value: term } });
}

beforeEach(() => {
  posFetchMock.mockReset();
  dispatchMock.mockReset();
  mockQuote.value = makeQuote();
  mockCatalog.services = [];
});
afterEach(cleanup);

describe('<QuoteBuilder> — search path validation', () => {
  it('prerequisite warning fires for an unmet prereq, posting the QUOTE context', async () => {
    posFetchMock.mockResolvedValue(unmetPrereq());
    const svc = makeService({ id: 'prep-1', name: 'Paint Correction Prep', classification: 'primary' });
    mockCatalog.services = [svc];
    mockQuote.value = makeQuote({ items: [{ itemType: 'service', serviceId: 'wash-on-quote' }] as QuoteState['items'] });

    render(<QuoteBuilder quoteId="q-1" onBack={() => {}} onSaved={() => {}} />);
    search('Paint');
    fireEvent.click(screen.getByText('Paint Correction Prep'));

    expect(await screen.findByRole('heading', { name: /Service Prerequisite Required/i })).toBeDefined();
    const body = JSON.parse(posFetchMock.mock.calls[0][1].body);
    expect(body.customer_id).toBe('quote-cust');
    expect(body.vehicle_id).toBe('quote-veh');
    expect(body.ticket_service_ids).toEqual(['wash-on-quote']);
    // No ADD_SERVICE while blocked by the prerequisite.
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
  });

  it('add-on-only solo search tap (service with NO prereqs) raises the add-on warning, no dispatch', async () => {
    posFetchMock.mockResolvedValue(noPrereqs());
    const addon = makeService({ id: 'addon-1', name: 'Pet Hair Removal', classification: 'addon_only' });
    mockCatalog.services = [addon];
    mockQuote.value = makeQuote({ items: [] });

    render(<QuoteBuilder quoteId="q-1" onBack={() => {}} onSaved={() => {}} />);
    search('Pet');
    fireEvent.click(screen.getByText('Pet Hair Removal'));

    expect(await screen.findByRole('heading', { name: /Add-On Service/i })).toBeDefined();
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
    // #122: prereq check runs first (learns there are no prereqs), then the add-on gate.
    expect(posFetchMock).toHaveBeenCalled();
  });

  it('addon_only WITH unmet prereqs shows the PREREQ dialog (quote context), not the add-on PIN (#122)', async () => {
    posFetchMock.mockResolvedValue(unmetPrereq());
    const addon = makeService({ id: 'prep-1', name: 'Paint Correction Prep', classification: 'addon_only' });
    mockCatalog.services = [addon];
    mockQuote.value = makeQuote({ items: [] });

    render(<QuoteBuilder quoteId="q-1" onBack={() => {}} onSaved={() => {}} />);
    search('Paint');
    fireEvent.click(screen.getByText('Paint Correction Prep'));

    expect(await screen.findByRole('heading', { name: /Service Prerequisite Required/i })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /Add-On Service/i })).toBeNull();
    const body = JSON.parse(posFetchMock.mock.calls[0][1].body);
    expect(body.customer_id).toBe('quote-cust');
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_SERVICE' }));
  });
});
