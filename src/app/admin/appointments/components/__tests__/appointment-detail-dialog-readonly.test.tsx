import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Session 1.1 — view-only mode (`readOnly={true}`). Closes parity audit
// b346d34b Target D Finding 2 (the dashboard quick-peek mount's
// `onSave={async () => false}` + `onCancel={() => {}}` no-op suppression
// anti-pattern). The dialog is now a true view-only surface when
// `readOnly={true}` — Save and Cancel-Appointment buttons are hidden,
// editable fields are disabled, and `onSave`/`onCancel` are statically
// unreachable (and may be omitted from the call site, which the
// dashboard mount now does).

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

describe('AppointmentDetailDialog — readOnly mode (Session 1.1)', () => {
  it('readOnly={true} hides Save Changes button', () => {
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
    expect(screen.queryByRole('button', { name: /Save Changes/i })).toBeNull();
  });

  it('readOnly={true} hides Cancel Appointment button even when canCancel=true', () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={vi.fn()}
        appointment={makeAppointment()}
        employees={[]}
        canReschedule={false}
        canCancel
        readOnly
      />
    );
    expect(screen.queryByRole('button', { name: /Cancel Appointment/i })).toBeNull();
  });

  it('readOnly={true} keeps Close button visible (the one editable affordance)', () => {
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
    // Two affordances carry "Close" accessible name — the DialogClose X icon
    // (top-right of the dialog header) AND the footer "Close" button. Both
    // should remain in readOnly mode (the only ways to dismiss). getAllByRole
    // tolerates both without overspecifying which.
    expect(screen.getAllByRole('button', { name: /Close/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('readOnly={true} disables Status select', () => {
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
    expect((screen.getByLabelText('Status') as HTMLSelectElement).disabled).toBe(true);
  });

  it('readOnly={true} disables Job Notes + Internal Notes textareas', () => {
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
    expect((screen.getByLabelText('Job Notes') as HTMLTextAreaElement).disabled).toBe(true);
    expect(
      (screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).disabled
    ).toBe(true);
  });

  it('readOnly={true} allows omitting onSave + onCancel (the dashboard mount shape)', () => {
    // If the TS prop shape forced these required, this render would not type-check.
    // The test is a behavioral assertion of the runtime shape: no crash on mount,
    // Close button still functional. Regression-locks against re-introducing the
    // `onSave={async () => false}` / `onCancel={() => {}}` no-ops at the call site.
    expect(() =>
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
      )
    ).not.toThrow();
    // Two affordances carry "Close" accessible name — the DialogClose X icon
    // (top-right of the dialog header) AND the footer "Close" button. Both
    // should remain in readOnly mode (the only ways to dismiss). getAllByRole
    // tolerates both without overspecifying which.
    expect(screen.getAllByRole('button', { name: /Close/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('readOnly={false} (default) preserves editable behavior — Save button visible', () => {
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
      />
    );
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeTruthy();
  });
});
