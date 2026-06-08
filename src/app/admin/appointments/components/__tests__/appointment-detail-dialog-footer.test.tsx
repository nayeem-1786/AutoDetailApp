import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Session #145 (Ian-Austria-unblock) — AppointmentDetailDialog footer redesign.
// Pre-#145 the editable footer was [Cancel Appointment (red)] [Close] [Save
// Changes (dark)]. Post-#145 the Close button is removed (the DialogClose
// `<X>` icon + Esc remain) and a green Send Payment Link button surfaces in
// the middle slot when the parent passes `onSendPaymentLink` AND the shared
// `canSendPaymentLink` predicate evaluates true. readOnly mode retains the
// pre-#145 [Close] solo footer.

vi.mock('@/components/appointments/un-materialize-confirmation-dialog', () => ({
  UnMaterializeConfirmationDialog: () => <div data-testid="unmaterialize-modal" />,
}));
vi.mock('@/components/jobs/edit-mobile-modal', () => ({
  EditMobileModal: () => <div data-testid="edit-mobile-modal" />,
}));
vi.mock('@/components/jobs/payment-mismatch-banner', () => ({
  PaymentMismatchBanner: () => <div />,
}));
vi.mock('@/components/appointments/modifier-summary', () => ({
  ModifierSummary: () => null,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { AppointmentDetailDialog } from '../appointment-detail-dialog';
import type { AppointmentWithRelations } from '@/lib/appointments/types';

function makeAppointment(
  overrides: Partial<AppointmentWithRelations> = {}
): AppointmentWithRelations {
  return {
    id: 'apt-1',
    status: 'confirmed',
    scheduled_date: '2026-06-10',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    employee_id: null,
    job_notes: '',
    internal_notes: '',
    total_amount: 535,
    deposit_amount: null,
    channel: 'customer_accept',
    is_mobile: true,
    payment_status: 'unpaid',
    cancellation_reason: null,
    customer: {
      id: 'c1',
      first_name: 'Ian',
      last_name: 'Austria',
      phone: '+18583355004',
      email: 'iaustria77@example.com',
    },
    vehicle: null,
    employee: null,
    appointment_services: [],
    has_active_job: false,
    ...overrides,
  } as unknown as AppointmentWithRelations;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppointmentDetailDialog footer — editable mode (Session #145)', () => {
  const baseProps = {
    open: true as const,
    onOpenChange: vi.fn(),
    employees: [],
    canReschedule: true,
    canCancel: true,
    canAddNotes: true,
    canUpdateStatus: true,
  };

  it('removes the explicit Close button from the editable footer (per Session #145 spec)', () => {
    render(
      <AppointmentDetailDialog
        {...baseProps}
        appointment={makeAppointment()}
        onSave={async () => true}
        onCancel={vi.fn()}
      />
    );
    // The dialog ALWAYS renders the DialogClose `<X>` icon top-right (its
    // sr-only label is "Close" — same accessible name as the removed text
    // button). Editable mode must show exactly ONE "Close" button (the icon
    // only); readOnly mode shows TWO (icon + explicit text button — pinned
    // separately below). The count differential is the precise invariant.
    const closeButtons = screen.queryAllByRole('button', { name: 'Close' });
    expect(closeButtons).toHaveLength(1);
  });

  it('keeps the Cancel Appointment + Save Changes buttons in the editable footer', () => {
    render(
      <AppointmentDetailDialog
        {...baseProps}
        appointment={makeAppointment()}
        onSave={async () => true}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Cancel Appointment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
  });

  it('renders Send Payment Link when onSendPaymentLink is provided AND predicate passes', () => {
    render(
      <AppointmentDetailDialog
        {...baseProps}
        appointment={makeAppointment()}
        onSave={async () => true}
        onCancel={vi.fn()}
        onSendPaymentLink={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Send Payment Link' })).toBeTruthy();
  });

  it('does NOT render Send Payment Link when onSendPaymentLink is omitted (admin default path)', () => {
    render(
      <AppointmentDetailDialog
        {...baseProps}
        appointment={makeAppointment()}
        onSave={async () => true}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Send Payment Link' })).toBeNull();
  });

  it('does NOT render Send Payment Link when predicate fails (already paid)', () => {
    render(
      <AppointmentDetailDialog
        {...baseProps}
        appointment={makeAppointment({ payment_status: 'paid' } as Partial<AppointmentWithRelations>)}
        onSave={async () => true}
        onCancel={vi.fn()}
        onSendPaymentLink={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Send Payment Link' })).toBeNull();
  });

  it('does NOT render Send Payment Link when customer has no contact channels', () => {
    render(
      <AppointmentDetailDialog
        {...baseProps}
        appointment={makeAppointment({
          customer: { id: 'c1', first_name: 'Ian', last_name: 'Austria', phone: null, email: null },
        })}
        onSave={async () => true}
        onCancel={vi.fn()}
        onSendPaymentLink={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Send Payment Link' })).toBeNull();
  });

  it('clicking Send Payment Link closes the dialog and invokes the callback with the appointment', () => {
    const onOpenChange = vi.fn();
    const onSendPaymentLink = vi.fn();
    const appointment = makeAppointment();
    render(
      <AppointmentDetailDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        appointment={appointment}
        onSave={async () => true}
        onCancel={vi.fn()}
        onSendPaymentLink={onSendPaymentLink}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send Payment Link' }));
    // Same handoff shape as onCancel: dialog closes first, then parent mounts
    // its modal chain (or invokes the cancel dialog). Mirrors the
    // onOpenChange(false) + onCancel(appointment) pattern at line 615-617.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSendPaymentLink).toHaveBeenCalledWith(appointment);
  });
});

describe('AppointmentDetailDialog footer — readOnly mode (unchanged from Session 1.1)', () => {
  it('readOnly retains the Close button (only dismiss affordance in the empty-footer case)', () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment()}
        employees={[]}
        canReschedule={false}
        canCancel={false}
        readOnly
      />
    );
    // Two "Close" buttons in readOnly: the DialogClose `<X>` icon top-right
    // (sr-only label "Close") AND the explicit footer text button.
    const closeButtons = screen.queryAllByRole('button', { name: 'Close' });
    expect(closeButtons).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Cancel Appointment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send Payment Link' })).toBeNull();
  });
});
