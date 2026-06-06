import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Session 1.3 — canUpdateStatus prop. Parity audit b346d34b Target B.12:
// the dialog accepted canReschedule / canCancel / canAddNotes but NOT
// canUpdateStatus; an operator without `appointments.update_status` saw a
// fully-rendered dropdown that 403'd on Save. When `canUpdateStatus === false`
// the dialog now renders the current status as a read-only <dd> block.

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
    scheduled_date: '2026-06-01',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    employee_id: null,
    job_notes: '',
    internal_notes: '',
    total_amount: 120,
    deposit_amount: null,
    channel: 'online',
    is_mobile: false,
    cancellation_reason: null,
    customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null },
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

describe('AppointmentDetailDialog — canUpdateStatus prop (Session 1.3)', () => {
  it('canUpdateStatus omitted (default true) — status renders as editable <select>', () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment()}
        employees={[]}
        onSave={vi.fn(async () => true)}
        onCancel={vi.fn()}
        canReschedule={false}
        canCancel
      />
    );
    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(status.tagName).toBe('SELECT');
    expect(status.disabled).toBe(false);
  });

  it('canUpdateStatus={true} — status renders as editable <select>', () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment()}
        employees={[]}
        onSave={vi.fn(async () => true)}
        onCancel={vi.fn()}
        canReschedule={false}
        canCancel
        canUpdateStatus
      />
    );
    expect((screen.getByLabelText('Status') as HTMLElement).tagName).toBe('SELECT');
  });

  it('canUpdateStatus={false} — status renders as read-only block (no <select>)', () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment({ status: 'in_progress' })}
        employees={[]}
        onSave={vi.fn(async () => true)}
        onCancel={vi.fn()}
        canReschedule={false}
        canCancel
        canUpdateStatus={false}
      />
    );
    // No accessible Status form control anymore.
    expect(screen.queryByLabelText('Status')).toBeNull();
    // But the current status label is visible in the read-only block.
    // APPOINTMENT_STATUS_LABELS.in_progress = 'In Progress'.
    expect(screen.getByText(/In Progress/i)).toBeTruthy();
  });

  it('canUpdateStatus={false} — Save Changes button is still visible (operator can edit OTHER fields)', () => {
    // The status field becoming read-only must NOT hide Save Changes —
    // the operator may still have canReschedule or canAddNotes and should
    // be able to commit those edits. Save's other gates (readOnly) are
    // unchanged; canUpdateStatus only controls the status field.
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment()}
        employees={[]}
        onSave={vi.fn(async () => true)}
        onCancel={vi.fn()}
        canReschedule
        canCancel
        canAddNotes
        canUpdateStatus={false}
      />
    );
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeTruthy();
  });

  it('canUpdateStatus={false} + readOnly={true} — both gates compose; status is read-only either way', () => {
    // Session 1.1's readOnly prop is the broader gate (entire dialog
    // view-only). canUpdateStatus is the narrower field gate. They are
    // independent — but when both are set, the result is byte-equivalent
    // to the strictest gate: no editable status, no Save button. Regression
    // pin: these props don't fight each other.
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment()}
        employees={[]}
        canReschedule={false}
        canCancel={false}
        canUpdateStatus={false}
        readOnly
      />
    );
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.queryByRole('button', { name: /Save Changes/i })).toBeNull();
  });

  it('canUpdateStatus={true} + readOnly={true} — readOnly dominates: status select is disabled, not hidden', () => {
    // readOnly={true} should keep the <select> rendered (for parity with
    // existing Session 1.1 readOnly tests) but disabled. canUpdateStatus
    // doesn't override this — readOnly is the broader gate.
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment()}
        employees={[]}
        canReschedule={false}
        canCancel={false}
        canUpdateStatus
        readOnly
      />
    );
    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(status.tagName).toBe('SELECT');
    expect(status.disabled).toBe(true);
  });
});
