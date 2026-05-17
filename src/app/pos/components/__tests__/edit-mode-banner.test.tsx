import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EditModeBanner } from '../edit-mode-banner';
import type { TicketState } from '../../types';

/**
 * Item 15f Phase 1 Layer 8c — visual indicator tests for `<EditModeBanner>`.
 *
 * Covers:
 *   - No render when `ticket.editMode === false`
 *   - Renders friendly label for appointment source
 *   - Renders friendly label for job source
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
    ...overrides,
  };
}

beforeEach(() => {
  mockTicket.value = makeTicket({ editMode: false, source: 'new', sourceId: null, returnTo: null });
});

afterEach(cleanup);

describe('EditModeBanner', () => {
  it('renders nothing when editMode is false', () => {
    const { container } = render(<EditModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Editing Appointment #XXX" with first 8 chars of UUID', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
    });
    render(<EditModeBanner />);
    // "aaaaaaaa" is the first 8 hex chars of APPT_UUID.
    expect(screen.getByText(/Editing Appointment #aaaaaaaa/i)).toBeTruthy();
  });

  it('renders "Editing Job #XXX" for source=job', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'job',
      sourceId: JOB_UUID,
      returnTo: '/pos/jobs/' + JOB_UUID,
    });
    render(<EditModeBanner />);
    expect(screen.getByText(/Editing Job #bbbbbbbb/i)).toBeTruthy();
  });

  it('does NOT show "Unsaved changes" when current state matches snapshot', () => {
    // Snapshot must match the live serialization. Easiest: hydrate a minimal
    // ticket, then mirror the serializer to produce a matching snapshot.
    const baseline = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
    });
    baseline.editInitialSnapshot = JSON.stringify({
      items: [],
      customerId: null,
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
      returnTo: '/admin/appointments/' + APPT_UUID,
      // Snapshot pretends the cart started with no loyalty, but the live
      // state has 50 loyalty points → dirty.
      loyaltyPointsToRedeem: 50,
      loyaltyDiscount: 2.5,
      editInitialSnapshot: JSON.stringify({
        items: [],
        customerId: null,
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

  it('does NOT show "Unsaved changes" when snapshot is null (drain has not finished MARK)', () => {
    mockTicket.value = makeTicket({
      editMode: true,
      source: 'appointment',
      sourceId: APPT_UUID,
      returnTo: '/admin/appointments/' + APPT_UUID,
      editInitialSnapshot: null, // pre-MARK state
    });
    render(<EditModeBanner />);
    // No snapshot → no dirty signal (avoids flashing "Unsaved changes" during
    // the drain's brief 0-200ms window before MARK fires).
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
  });
});
