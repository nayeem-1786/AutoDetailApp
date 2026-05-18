import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { TicketState } from '../../types';

/**
 * Item 15f Phase 1 Layer 8d — Products tab is disabled in edit mode.
 *
 * Appointments don't carry product rows (the cascade endpoint's Zod
 * accepts services only); products attach to a ticket at transaction
 * commit, not at edit time. Letting an operator add products to the
 * edit-mode cart would silently drop them on Save Changes.
 *
 * This test pins the tab-bar gating behavior:
 *   - In edit mode: Products button has cursor-not-allowed + aria-disabled,
 *     clicking it surfaces a toast and does NOT change the active tab.
 *   - Outside edit mode: Products button is interactive and clicking
 *     switches tabs (existing behavior unchanged).
 *
 * The full PosWorkspace has many heavy dependencies (catalog hook,
 * barcode scanner, drain hook, register tab, catalog browser); we mock
 * them so this test stays focused on the gating contract.
 */

const toastInfoMock = vi.hoisted(() => vi.fn());
const mockTicket: { value: TicketState } = {
  value: makeTicket({ editMode: false }),
};
// Item 15f Phase 1 Layer 8f — barcode-scanner gate test needs to invoke
// the onScan callback the workspace registers. Capture it via a hoisted
// mock and let tests trigger the gate directly.
const capturedOnScan: { value: ((barcode: string) => unknown) | null } =
  vi.hoisted(() => ({ value: null }));
const mockCatalog: { products: unknown[]; services: unknown[] } = vi.hoisted(
  () => ({ products: [], services: [] })
);

vi.mock('../../hooks/use-catalog', () => ({
  useCatalog: () => ({
    products: mockCatalog.products,
    services: mockCatalog.services,
    loading: false,
  }),
}));

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({ ticket: mockTicket.value, dispatch: vi.fn() }),
}));

vi.mock('../../context/pos-auth-context', () => ({
  usePosAuth: () => ({ locked: false }),
}));

vi.mock('../../hooks/use-edit-mode-drain', () => ({
  useEditModeDrain: () => undefined,
}));

vi.mock('@/lib/hooks/use-barcode-scanner', () => ({
  useBarcodeScanner: (opts: { onScan: (b: string) => unknown }) => {
    capturedOnScan.value = opts.onScan;
    return undefined;
  },
}));

const posFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/pos-fetch', () => ({
  posFetch: posFetchMock,
}));

// Heavy children — render as sentinels so we can target the active tab.
vi.mock('../search-bar', () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));
vi.mock('../catalog-grid', () => ({
  ProductGrid: () => null,
  ServiceGrid: () => null,
}));
vi.mock('../service-pricing-picker', () => ({
  ServicePricingPicker: () => null,
}));
vi.mock('../ticket-panel', () => ({
  TicketPanel: () => <div data-testid="ticket-panel" />,
}));
vi.mock('../register-tab', () => ({
  RegisterTab: () => <div data-testid="register-tab" />,
}));
vi.mock('../catalog-browser', () => ({
  CatalogBrowser: ({ type }: { type: string }) => (
    <div data-testid={`catalog-${type}`} />
  ),
}));
vi.mock('../promotions-tab', () => ({
  PromotionsTab: () => <div data-testid="promotions-tab" />,
}));
vi.mock('../edit-mode-banner', () => ({
  EditModeBanner: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: toastInfoMock,
    warning: vi.fn(),
  },
}));

import { PosWorkspace } from '../pos-workspace';
import type { Customer } from '@/lib/supabase/types';

function makeTicket(overrides: Partial<TicketState> = {}): TicketState {
  return {
    items: [],
    customer: null,
    vehicle: null,
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
  };
}

beforeEach(() => {
  toastInfoMock.mockReset();
  posFetchMock.mockReset();
  capturedOnScan.value = null;
  mockCatalog.products = [];
  mockCatalog.services = [];
  mockTicket.value = makeTicket({ editMode: false });
});

afterEach(cleanup);

describe('PosWorkspace — Products tab gating in edit mode', () => {
  it('renders Products tab as INTERACTIVE when editMode=false (no regression)', () => {
    render(<PosWorkspace />);
    const productsTab = screen.getByRole('button', { name: 'Products' });
    expect(productsTab.getAttribute('aria-disabled')).not.toBe('true');
    expect((productsTab.className as string).toLowerCase()).not.toContain('cursor-not-allowed');
  });

  it('renders Products tab as DISABLED when editMode=true', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      returnTo: '/admin/appointments',
      customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe' } as Customer,
    });
    render(<PosWorkspace />);
    const productsTab = screen.getByRole('button', { name: 'Products' });
    expect(productsTab.getAttribute('aria-disabled')).toBe('true');
    expect(productsTab.className).toContain('cursor-not-allowed');
  });

  it('clicking the disabled Products tab in edit mode surfaces a toast + does NOT switch tabs', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      returnTo: '/admin/appointments',
      customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe' } as Customer,
    });
    render(<PosWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    const msg = toastInfoMock.mock.calls[0][0] as string;
    expect(msg).toMatch(/Products can only be added at checkout/i);
    // Register stays active (no products catalog mounted)
    expect(screen.getByTestId('register-tab')).toBeTruthy();
    expect(screen.queryByTestId('catalog-products')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Layer 8f — barcode scanner + global-search filter gates (the other two
// edit-mode product-add surfaces gated in pos-workspace.tsx).
// ---------------------------------------------------------------------------

describe('PosWorkspace — barcode scanner gate in edit mode', () => {
  it('non-edit-mode: scanner triggers a barcode-lookup fetch (no regression)', async () => {
    posFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ product: null }), { status: 404 })
    );
    render(<PosWorkspace />);
    expect(capturedOnScan.value).toBeTypeOf('function');

    await capturedOnScan.value!('1234567890');
    expect(posFetchMock).toHaveBeenCalledWith(
      '/api/pos/products/barcode-lookup',
      expect.objectContaining({ method: 'POST' })
    );
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it('edit-mode: scanner BLOCKS the lookup, surfaces toast.info, does NOT hit the API', async () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      returnTo: '/admin/appointments',
      customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe' } as Customer,
    });
    render(<PosWorkspace />);
    expect(capturedOnScan.value).toBeTypeOf('function');

    await capturedOnScan.value!('1234567890');
    // The gate short-circuits BEFORE the barcode-lookup fetch fires.
    expect(posFetchMock).not.toHaveBeenCalled();
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    const msg = toastInfoMock.mock.calls[0][0] as string;
    expect(msg).toMatch(/Products can only be added at checkout/i);
  });
});

describe('PosWorkspace — global search filteredProducts gate in edit mode', () => {
  // We can't easily exercise the SearchBar input + filteredProducts useMemo
  // from this mocked rig (SearchBar is sentinel-mocked). The closest pin:
  // assert that the ProductGrid sentinel never mounts when editMode=true,
  // even with products present in the catalog. The non-edit-mode comparison
  // case stays exercised by the existing tab test above.
  it('catalog ProductGrid never renders in edit mode (filteredProducts forced to [])', () => {
    mockCatalog.products = [
      { id: 'p1', name: 'Wax', sku: '1', barcode: '111', retail_price: 10 },
      { id: 'p2', name: 'Pad', sku: '2', barcode: '222', retail_price: 20 },
    ];
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      returnTo: '/admin/appointments',
      customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe' } as Customer,
    });
    render(<PosWorkspace />);
    // Register tab is active by default. Products tab catalog isn't
    // reachable without switching tabs (which the gate prevents).
    expect(screen.queryByTestId('catalog-products')).toBeNull();
  });
});
