import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TicketActions } from '../ticket-actions';
import type { TicketState, TicketItem } from '../../types';
import type { Customer } from '@/lib/supabase/types';

/**
 * Item 15f Phase 1 Layer 8c — edit-mode UX tests for `<TicketActions>`.
 *
 * Covers the editMode branch (rendered when `ticket.editMode === true`):
 *   - Action buttons swap: Save Changes + Cancel (no Hold, no Checkout)
 *   - Save handler POSTs to cascade endpoint with services + modifier payload
 *   - Save success: dispatches EXIT_EDIT_MODE + CLEAR_TICKET + navigates returnTo
 *   - Cancel without dirty: dispatches EXIT_EDIT_MODE + navigates returnTo
 *   - Cancel with dirty: shows confirmation dialog; Discard navigates, Keep stays
 */

const APPT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RETURN_TO = '/admin/appointments/' + APPT_UUID;

const mockDispatch = vi.fn();
const mockRouterPush = vi.fn();
const mockPosFetch = vi.fn();

const mockTicket: { value: TicketState } = {
  value: emptyEditTicket(),
};

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({ ticket: mockTicket.value, dispatch: mockDispatch }),
}));

vi.mock('../../context/checkout-context', () => ({
  useCheckout: () => ({ openCheckout: vi.fn(), setComplete: vi.fn(), isOpen: false, processing: false }),
}));

vi.mock('../../context/held-tickets-context', () => ({
  useHeldTickets: () => ({ holdTicket: vi.fn(), heldTickets: [] }),
}));

vi.mock('../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true, loading: false }),
}));

vi.mock('../customer-type-prompt', () => ({
  CustomerTypePrompt: () => null,
}));

vi.mock('../../lib/pos-fetch', () => ({
  posFetch: (...args: unknown[]) => mockPosFetch(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function mockItem(overrides: Partial<TicketItem> = {}): TicketItem {
  return {
    id: 'item-1',
    itemType: 'service',
    productId: null,
    serviceId: 'svc-1',
    categoryId: null,
    itemName: 'Full Detail',
    quantity: 1,
    unitPrice: 200,
    totalPrice: 200,
    taxAmount: 0,
    isTaxable: false,
    tierName: 'sedan',
    vehicleSizeClass: null,
    notes: null,
    perUnitQty: null,
    perUnitLabel: null,
    perUnitPrice: null,
    perUnitMax: null,
    parentItemId: null,
    standardPrice: 200,
    pricingType: 'standard',
    comboSourcePrimaryId: null,
    saleEffectivePrice: null,
    prerequisiteNote: null,
    prerequisiteForServiceId: null,
    ...overrides,
  };
}

function emptyEditTicket(): TicketState {
  return {
    items: [mockItem()],
    customer: { id: 'cust-1', first_name: 'Jane' } as Customer,
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
    subtotal: 200,
    taxAmount: 0,
    discountAmount: 0,
    total: 200,
    source: 'appointment',
    sourceId: APPT_UUID,
    returnTo: RETURN_TO,
    editMode: true,
    editInitialSnapshot: null, // set per-test
  };
}

function setTicketWithSnapshot(overrides: Partial<TicketState> = {}) {
  const next: TicketState = { ...emptyEditTicket(), ...overrides };
  // Pretend the drain has fired MARK_EDIT_INITIAL_STATE — stamp current
  // serialization as the baseline so the cart starts "clean."
  const editInitialSnapshot = overrides.editInitialSnapshot ?? (() => {
    // Inlined mirror of serializeTicketEditSlice; keeping the test
    // self-contained avoids cross-file coupling and matches the live
    // contract from `src/app/pos/context/ticket-reducer.ts`.
    return JSON.stringify({
      items: next.items.map((i) => ({
        itemName: i.itemName,
        itemType: i.itemType,
        productId: i.productId,
        serviceId: i.serviceId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        tierName: i.tierName,
        perUnitQty: i.perUnitQty,
      })),
      customerId: next.customer?.id ?? null,
      vehicleId: next.vehicle?.id ?? null,
      coupon: next.coupon
        ? { code: next.coupon.code, discount: next.coupon.discount }
        : null,
      loyaltyPointsToRedeem: next.loyaltyPointsToRedeem,
      loyaltyDiscount: next.loyaltyDiscount,
      manualDiscount: next.manualDiscount
        ? {
            type: next.manualDiscount.type,
            value: next.manualDiscount.value,
            label: next.manualDiscount.label,
          }
        : null,
    });
  })();
  mockTicket.value = { ...next, editInitialSnapshot };
}

beforeEach(() => {
  mockDispatch.mockReset();
  mockRouterPush.mockReset();
  mockPosFetch.mockReset();
  setTicketWithSnapshot();
});

afterEach(cleanup);

describe('TicketActions — edit-mode button swap', () => {
  it('renders Save Changes + Cancel buttons (NO Checkout, NO Hold) when editMode=true', () => {
    render(<TicketActions />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^checkout$/i })).toBeNull();
    // The Hold icon button uses title="Hold ticket" — confirm absent.
    expect(screen.queryByTitle('Hold ticket')).toBeNull();
  });

  it('renders Checkout + Hold + Clear (no Save Changes, no Cancel) when editMode=false', () => {
    setTicketWithSnapshot({ editMode: false, source: 'new', sourceId: null, returnTo: null });
    render(<TicketActions />);
    expect(screen.getByRole('button', { name: /^checkout$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /clear/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });
});

describe('TicketActions — Save Changes handler', () => {
  it('POSTs services + modifier payload to the cascade endpoint', async () => {
    setTicketWithSnapshot({
      coupon: { id: 'c1', code: 'SUMMER10', discount: 20 },
      loyaltyPointsToRedeem: 50,
      loyaltyDiscount: 2.5,
      manualDiscount: { type: 'dollar', value: 10, label: 'VIP' },
    });
    mockPosFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    );

    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockPosFetch).toHaveBeenCalled();
    });
    const [url, init] = mockPosFetch.mock.calls[0];
    expect(url).toBe(`/api/pos/appointments/${APPT_UUID}/services`);
    expect((init as RequestInit).method).toBe('PUT');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.services).toHaveLength(1);
    expect(body.services[0]).toMatchObject({
      service_id: 'svc-1',
      price_at_booking: 200,
      tier_name: 'sedan',
    });
    expect(body.coupon_code).toBe('SUMMER10');
    expect(body.coupon_discount).toBe(20);
    expect(body.loyalty_points_to_redeem).toBe(50);
    expect(body.loyalty_discount).toBe(2.5);
    expect(body.manual_discount_value).toBe(10);
    expect(body.manual_discount_label).toBe('VIP');
  });

  it('on success dispatches EXIT_EDIT_MODE + CLEAR_TICKET and navigates to returnTo', async () => {
    mockPosFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    );
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(RETURN_TO);
    });
    const types = mockDispatch.mock.calls.map((c) => c[0].type);
    expect(types).toContain('EXIT_EDIT_MODE');
    expect(types).toContain('CLEAR_TICKET');
  });

  it('on error does NOT navigate or dispatch EXIT_EDIT_MODE', async () => {
    mockPosFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'whoops' }), { status: 500 })
    );
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(mockPosFetch).toHaveBeenCalled();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockDispatch.mock.calls.find((c) => c[0].type === 'EXIT_EDIT_MODE')).toBeUndefined();
  });

  it('resolves percent manual discount to dollar amount in the payload', async () => {
    setTicketWithSnapshot({
      subtotal: 200,
      manualDiscount: { type: 'percent', value: 10, label: 'Promo' },
    });
    mockPosFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    );
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(mockPosFetch).toHaveBeenCalled();
    });
    const body = JSON.parse(mockPosFetch.mock.calls[0][1].body);
    // 10% of 200 = 20
    expect(body.manual_discount_value).toBe(20);
    expect(body.manual_discount_label).toBe('Promo');
  });

  it('sends manual_discount_value=null when no manual discount applied', async () => {
    mockPosFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    );
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(mockPosFetch).toHaveBeenCalled();
    });
    const body = JSON.parse(mockPosFetch.mock.calls[0][1].body);
    expect(body.manual_discount_value).toBeNull();
    expect(body.manual_discount_label).toBeNull();
  });
});

describe('TicketActions — Cancel handler + dirty detection', () => {
  it('clean cancel (no dirty changes) → no confirmation, dispatch EXIT_EDIT_MODE + navigate', () => {
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    // No confirmation dialog rendered
    expect(screen.queryByText(/discard unsaved changes/i)).toBeNull();
    const types = mockDispatch.mock.calls.map((c) => c[0].type);
    expect(types).toContain('EXIT_EDIT_MODE');
    expect(types).toContain('CLEAR_TICKET');
    expect(mockRouterPush).toHaveBeenCalledWith(RETURN_TO);
  });

  it('dirty cancel (changes diverge from snapshot) → shows confirmation dialog, does NOT navigate yet', () => {
    // Stamp snapshot with empty cart but the live ticket has 1 item.
    setTicketWithSnapshot({ editInitialSnapshot: JSON.stringify({ items: [], customerId: 'cust-1', vehicleId: null, coupon: null, loyaltyPointsToRedeem: 0, loyaltyDiscount: 0, manualDiscount: null }) });
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByText(/discard unsaved changes/i)).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockDispatch.mock.calls.find((c) => c[0].type === 'EXIT_EDIT_MODE')).toBeUndefined();
  });

  it('dirty cancel → Keep editing dismisses dialog, stays in edit mode', () => {
    setTicketWithSnapshot({ editInitialSnapshot: JSON.stringify({ items: [], customerId: 'cust-1', vehicleId: null, coupon: null, loyaltyPointsToRedeem: 0, loyaltyDiscount: 0, manualDiscount: null }) });
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.queryByText(/discard unsaved changes/i)).toBeNull();
    expect(mockDispatch.mock.calls.find((c) => c[0].type === 'EXIT_EDIT_MODE')).toBeUndefined();
  });

  it('dirty cancel → Discard dispatches EXIT_EDIT_MODE + navigates', () => {
    setTicketWithSnapshot({ editInitialSnapshot: JSON.stringify({ items: [], customerId: 'cust-1', vehicleId: null, coupon: null, loyaltyPointsToRedeem: 0, loyaltyDiscount: 0, manualDiscount: null }) });
    render(<TicketActions />);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    const types = mockDispatch.mock.calls.map((c) => c[0].type);
    expect(types).toContain('EXIT_EDIT_MODE');
    expect(mockRouterPush).toHaveBeenCalledWith(RETURN_TO);
  });
});
