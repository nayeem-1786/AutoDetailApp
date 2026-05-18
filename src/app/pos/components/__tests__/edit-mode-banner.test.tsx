import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EditModeBanner, buildEditLabel } from '../edit-mode-banner';
import type { TicketState } from '../../types';
import type { Customer } from '@/lib/supabase/types';

/**
 * Item 15f Phase 1 Layer 8c (initial) / Layer 8d (label revamp) — banner
 * tests.
 *
 * Covers:
 *   - No render when `ticket.editMode === false`
 *   - "Editing Appointment: {customer} — {date}" preferred format
 *   - "Editing Job: ..." for source=job
 *   - Customer-only fallback when scheduled_date missing
 *   - UUID-prefix safety net when both customer + date missing
 *   - "Unsaved changes" badge surfaces only when serialized state ≠ snapshot
 */

const APPT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mockTicket: { value: TicketState } = {
  value: makeTicket({ editMode: false, source: 'new', sourceId: null, returnTo: null }),
};

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({ ticket: mockTicket.value, dispatch: vi.fn() }),
}));

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

function mockCustomer(first = 'Jane', last = 'Doe'): Customer {
  return {
    id: 'cust-1',
    first_name: first,
    last_name: last,
  } as Customer;
}

beforeEach(() => {
  mockTicket.value = makeTicket({ editMode: false, source: 'new', sourceId: null, returnTo: null });
});

afterEach(cleanup);

describe('EditModeBanner — render gating', () => {
  it('renders nothing when editMode is false', () => {
    const { container } = render(<EditModeBanner />);
    expect(container.firstChild).toBeNull();
  });
});

describe('EditModeBanner — Layer 8d customer + date label', () => {
  it('renders "Editing Appointment: Jane Doe — Sat, May 16" when customer + date present', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments',
      customer: mockCustomer(),
      editSourceScheduledDate: '2026-05-16',
    });
    render(<EditModeBanner />);
    expect(screen.getByText(/Editing Appointment: Jane Doe — Sat, May 16/)).toBeTruthy();
  });

  it('renders "Editing Job: ..." for source=job', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'job',
      sourceId: JOB_UUID,
      returnTo: '/pos/jobs',
      customer: mockCustomer('Nayeem', 'Khan'),
      editSourceScheduledDate: '2026-05-17',
    });
    render(<EditModeBanner />);
    expect(screen.getByText(/Editing Job: Nayeem Khan — Sun, May 17/)).toBeTruthy();
  });
});

describe('EditModeBanner — fallback hierarchy', () => {
  it('customer-only fallback when scheduled_date missing', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments',
      customer: mockCustomer(),
      editSourceScheduledDate: null,
    });
    render(<EditModeBanner />);
    expect(screen.getByText('Editing Appointment: Jane Doe')).toBeTruthy();
  });

  it('UUID-prefix safety net when both customer + date missing', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments',
      customer: null,
      editSourceScheduledDate: null,
    });
    render(<EditModeBanner />);
    expect(screen.getByText('Editing Appointment #aaaaaaaa')).toBeTruthy();
  });
});

describe('EditModeBanner — dirty badge', () => {
  it('does NOT show "Unsaved changes" when current state matches snapshot', () => {
    const baseline = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments',
      customer: mockCustomer(),
      editSourceScheduledDate: '2026-05-16',
    });
    baseline.editInitialSnapshot = JSON.stringify({
      items: [],
      customerId: 'cust-1',
      vehicleId: null,
      coupon: null,
      loyaltyPointsToRedeem: 0,
      loyaltyDiscount: 0,
      manualDiscount: null,
    });
    mockTicket.value = baseline;
    render(<EditModeBanner />);
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
  });

  it('shows "Unsaved changes" when serialized state diverges from snapshot', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments',
      customer: mockCustomer(),
      editSourceScheduledDate: '2026-05-16',
      loyaltyPointsToRedeem: 50,
      loyaltyDiscount: 2.5,
      editInitialSnapshot: JSON.stringify({
        items: [],
        customerId: 'cust-1',
        vehicleId: null,
        coupon: null,
        loyaltyPointsToRedeem: 0,
        loyaltyDiscount: 0,
        manualDiscount: null,
      }),
    });
    render(<EditModeBanner />);
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy();
  });

  it('does NOT show "Unsaved changes" when snapshot is null (drain mid-MARK)', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments',
      customer: mockCustomer(),
      editSourceScheduledDate: '2026-05-16',
      editInitialSnapshot: null,
    });
    render(<EditModeBanner />);
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// `buildEditLabel` — pure function unit tests
// ---------------------------------------------------------------------------

describe('buildEditLabel — pure fallback hierarchy', () => {
  it('preferred: customer + date for appointment', () => {
    expect(
      buildEditLabel({
        source: 'appointment',
        sourceId: APPT_UUID,
        customer: { first_name: 'Jane', last_name: 'Doe' },
        editSourceScheduledDate: '2026-05-16',
      })
    ).toBe('Editing Appointment: Jane Doe — Sat, May 16');
  });

  it('preferred: customer + date for job', () => {
    expect(
      buildEditLabel({
        source: 'job',
        sourceId: JOB_UUID,
        customer: { first_name: 'Sam', last_name: 'D' },
        editSourceScheduledDate: '2026-05-17',
      })
    ).toBe('Editing Job: Sam D — Sun, May 17');
  });

  it('customer-only when scheduled_date null', () => {
    expect(
      buildEditLabel({
        source: 'appointment',
        sourceId: APPT_UUID,
        customer: { first_name: 'Jane', last_name: 'Doe' },
        editSourceScheduledDate: null,
      })
    ).toBe('Editing Appointment: Jane Doe');
  });

  it('date-only when customer null (soft-delete edge case)', () => {
    expect(
      buildEditLabel({
        source: 'appointment',
        sourceId: APPT_UUID,
        customer: null,
        editSourceScheduledDate: '2026-05-16',
      })
    ).toBe('Editing Appointment: Sat, May 16');
  });

  it('UUID-prefix safety net when both null', () => {
    expect(
      buildEditLabel({
        source: 'appointment',
        sourceId: APPT_UUID,
        customer: null,
        editSourceScheduledDate: null,
      })
    ).toBe('Editing Appointment #aaaaaaaa');
  });

  it('handles last_name="" without leaving trailing whitespace', () => {
    expect(
      buildEditLabel({
        source: 'appointment',
        sourceId: APPT_UUID,
        customer: { first_name: 'Cher', last_name: '' },
        editSourceScheduledDate: '2026-05-16',
      })
    ).toBe('Editing Appointment: Cher — Sat, May 16');
  });
});
