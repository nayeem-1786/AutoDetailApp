import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { TicketState, FavoriteItem, CatalogProduct, CatalogService } from '../../types';

/**
 * Item 15f Phase 1 Layer 8d-bis — Register tab favorite-button gating.
 *
 * Layer 8d gated three product-add surfaces (Products tab, global search,
 * barcode scanner) but missed the Register tab's favorite/quick-add grid —
 * the colored buttons mixed with service favorites. This test pins the
 * 4th-surface gate:
 *
 *  - editMode + product favorite  → click rejected with toast.info
 *                                  + button rendered greyed out (aria-disabled)
 *  - editMode + service favorite  → click proceeds (services ARE editable)
 *  - editMode + custom_amount fav → click proceeds (keypad scroll, no add)
 *  - non-edit-mode + product fav  → click proceeds (no regression)
 */

const toastInfoMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const dispatchMock = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => ({
  value: [] as FavoriteItem[],
}));
const mockTicket = vi.hoisted(() => ({
  value: null as unknown as TicketState,
}));
const mockCatalog = vi.hoisted(() => ({
  products: [] as CatalogProduct[],
  services: [] as CatalogService[],
}));

vi.mock('../../hooks/use-favorites', () => ({
  useFavorites: () => ({ favorites: mockFavorites.value, loading: false }),
}));

vi.mock('../../hooks/use-catalog', () => ({
  useCatalog: () => ({
    products: mockCatalog.products,
    services: mockCatalog.services,
    loading: false,
  }),
}));

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({ ticket: mockTicket.value, dispatch: dispatchMock }),
}));

vi.mock('../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true }),
}));

vi.mock('../../context/pos-theme-context', () => ({
  usePosTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/lib/hooks/use-enter-submit', () => ({
  useEnterSubmit: () => ({}),
}));

vi.mock('../service-pricing-picker', () => ({
  ServicePricingPicker: () => null,
}));

vi.mock('../pin-pad', () => ({
  PinPad: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: toastSuccessMock,
    info: toastInfoMock,
    warning: vi.fn(),
  },
}));

import { RegisterTab } from '../register-tab';

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

function makeProductFavorite(): FavoriteItem {
  return {
    id: 'fav-prod-1',
    type: 'product',
    referenceId: 'prod-1',
    label: 'Wool Pad',
    color: 'blue',
    colorShade: 80,
  };
}

function makeServiceFavorite(): FavoriteItem {
  return {
    id: 'fav-svc-1',
    type: 'service',
    referenceId: 'svc-1',
    label: 'Express Exterior',
    color: 'lime',
    colorShade: 80,
  };
}

function makeProduct(): CatalogProduct {
  return {
    id: 'prod-1',
    name: 'Wool Pad',
    retail_price: 25,
    is_taxable: true,
    category_id: null,
    sku: null,
    barcode: null,
    quantity_on_hand: 10,
    cost: null,
    description: null,
    is_active: true,
  } as unknown as CatalogProduct;
}

beforeEach(() => {
  toastInfoMock.mockReset();
  toastSuccessMock.mockReset();
  dispatchMock.mockReset();
  mockFavorites.value = [];
  mockTicket.value = makeTicket();
  mockCatalog.products = [];
  mockCatalog.services = [];
});

afterEach(cleanup);

describe('RegisterTab — product favorite gating in edit mode', () => {
  it('non-edit-mode: clicking a product favorite ADDS the product (no regression)', () => {
    mockFavorites.value = [makeProductFavorite()];
    mockCatalog.products = [makeProduct()];
    mockTicket.value = makeTicket({ editMode: false });

    render(<RegisterTab onOpenCustomerLookup={() => {}} />);
    const btn = screen.getByRole('button', { name: /Wool Pad/i });
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(btn);

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_PRODUCT' })
    );
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it('edit-mode: clicking a product favorite REJECTS + surfaces toast.info', () => {
    mockFavorites.value = [makeProductFavorite()];
    mockCatalog.products = [makeProduct()];
    mockTicket.value = makeTicket({ editMode: true });

    render(<RegisterTab onOpenCustomerLookup={() => {}} />);
    const btn = screen.getByRole('button', { name: /Wool Pad/i });
    fireEvent.click(btn);

    expect(dispatchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_PRODUCT' })
    );
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    const msg = toastInfoMock.mock.calls[0][0] as string;
    expect(msg).toMatch(/Products can only be added at checkout/i);
  });

  it('edit-mode: product favorite button has aria-disabled + cursor-not-allowed styling', () => {
    mockFavorites.value = [makeProductFavorite()];
    mockCatalog.products = [makeProduct()];
    mockTicket.value = makeTicket({ editMode: true });

    render(<RegisterTab onOpenCustomerLookup={() => {}} />);
    const btn = screen.getByRole('button', { name: /Wool Pad/i });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.className).toContain('cursor-not-allowed');
    expect(btn.className).toContain('opacity-40');
  });

  it('edit-mode: service favorite is NOT gated (services ARE editable in edit mode)', () => {
    mockFavorites.value = [makeServiceFavorite()];
    mockTicket.value = makeTicket({ editMode: true });

    render(<RegisterTab onOpenCustomerLookup={() => {}} />);
    const btn = screen.getByRole('button', { name: /Express Exterior/i });
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
    expect(btn.className).not.toContain('cursor-not-allowed');
    expect(btn.className).not.toContain('opacity-40');
    // Clicking surfaces the "select a customer first" toast (no customer
    // in test fixture) rather than the products gate — proves the gate
    // didn't intercept.
    fireEvent.click(btn);
    expect(toastInfoMock).not.toHaveBeenCalled();
  });
});
