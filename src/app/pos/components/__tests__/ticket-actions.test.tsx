import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TicketActions } from '../ticket-actions';
import type { TicketState } from '../../types';
import type { Customer, Vehicle } from '@/lib/supabase/types';

// ─── Mocks ──────────────────────────────────────────────────────────────

// Mutable mock state so each test can supply its own ticket slice.
const mockTicket: { value: TicketState } = {
  value: {
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
  },
};

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({
    ticket: mockTicket.value,
    dispatch: vi.fn(),
  }),
}));

vi.mock('../../context/checkout-context', () => ({
  useCheckout: () => ({
    openCheckout: vi.fn(),
    setComplete: vi.fn(),
    isOpen: false,
    processing: false,
  }),
}));

vi.mock('../../context/held-tickets-context', () => ({
  useHeldTickets: () => ({
    holdTicket: vi.fn(),
    heldTickets: [],
  }),
}));

vi.mock('../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true, loading: false }),
}));

vi.mock('../customer-type-prompt', () => ({
  CustomerTypePrompt: () => null,
}));

vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(),
}));

// Item 15f Phase 1 Layer 8c — `next/navigation`'s `useRouter` is mounted
// from `<TicketActions>` for the Save Changes / Cancel handlers. The
// jsdom test environment doesn't ship an app-router context, so mock it.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────

function mockCustomer(): Customer {
  return {
    id: 'c1',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '5551234567',
    email: null,
    customer_type: null,
    tags: [],
    loyalty_points_balance: 0,
    visit_count: 0,
  } as unknown as Customer;
}

function mockVehicle(): Vehicle {
  return {
    id: 'v1',
    customer_id: 'c1',
    year: 2020,
    make: 'Toyota',
    model: 'Camry',
    color: 'Blue',
  } as unknown as Vehicle;
}

function setTicket(overrides: Partial<TicketState>) {
  mockTicket.value = {
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
    ...overrides,
  };
}

afterEach(cleanup);

// ─── Tests ───────────────────────────────────────────────────────────────

describe('TicketActions — Clear button enable gate (Session 42G)', () => {
  it('is disabled when ticket is empty (no items, no customer, no vehicle)', () => {
    setTicket({});
    render(<TicketActions />);
    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect((clearBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('is enabled when only a customer is selected', () => {
    setTicket({ customer: mockCustomer() });
    render(<TicketActions />);
    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect((clearBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('is enabled when only a vehicle is selected', () => {
    setTicket({ vehicle: mockVehicle() });
    render(<TicketActions />);
    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect((clearBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('is enabled when customer AND vehicle are selected but no items', () => {
    setTicket({ customer: mockCustomer(), vehicle: mockVehicle() });
    render(<TicketActions />);
    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect((clearBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
