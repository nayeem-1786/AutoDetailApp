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

vi.mock('../../hooks/use-catalog', () => ({
  useCatalog: () => ({ products: [], services: [], loading: false }),
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
  useBarcodeScanner: () => undefined,
}));

vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(),
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
