import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Item 15e Phase 2C-β-2 — admin dialog un-materialize Save intercept.
// Verifies the load-bearing guarantee: the intercept fires ONLY for the
// 3-condition match (status changed + earlier state + active job); every other
// save is byte-identical (parent onSave called, no modal). The shared modal +
// the heavy child components are mocked — this isolates the intercept decision.

let lastModalProps: Record<string, unknown> | null = null;

vi.mock('@/components/appointments/un-materialize-confirmation-dialog', () => ({
  UnMaterializeConfirmationDialog: (props: Record<string, unknown>) => {
    lastModalProps = props;
    return <div data-testid="unmaterialize-modal" />;
  },
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
import type { AppointmentUpdateInput } from '@/lib/utils/validation';

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
    has_active_job: true,
    ...overrides,
  } as unknown as AppointmentWithRelations;
}

let onSave: (id: string, data: AppointmentUpdateInput) => Promise<boolean>;
let onCancel: (appointment: AppointmentWithRelations) => void;
let onOpenChange: (open: boolean) => void;

function renderDialog(appointment: AppointmentWithRelations) {
  return render(
    <AppointmentDetailDialog
      open
      onOpenChange={onOpenChange}
      appointment={appointment}
      employees={[]}
      onSave={onSave}
      onCancel={onCancel}
      canReschedule
      canCancel
      canAddNotes
    />
  );
}

function setStatus(value: string) {
  fireEvent.change(screen.getByLabelText('Status'), { target: { value } });
}
function clickSave() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

beforeEach(() => {
  lastModalProps = null;
  onSave = vi.fn(async () => true);
  onCancel = vi.fn();
  onOpenChange = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppointmentDetailDialog — un-materialize Save intercept', () => {
  it('reverting status to earlier state WITH active job → opens modal, does NOT call onSave', async () => {
    renderDialog(makeAppointment({ status: 'confirmed', has_active_job: true }));
    setStatus('pending');
    clickSave();
    await waitFor(() => expect(screen.queryByTestId('unmaterialize-modal')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
    expect(lastModalProps?.context).toBe('admin');
  });

  // Session 1.1 — fixes HIGH-severity parity audit b346d34b Target D Finding 1.
  // Pre-fix, `<UnMaterializeConfirmationDialog context="admin" />` was hardcoded,
  // so the POS Schedule mount routed un-materialize through `adminFetch` → 401 →
  // admin-login redirect (operator booted from POS). After Session 1.1 the
  // `context` threads from `hostContext`.
  it('with hostContext="pos" → un-materialize modal receives context="pos" (Session 1.1 HIGH fix)', async () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={onOpenChange}
        appointment={makeAppointment({ status: 'confirmed', has_active_job: true })}
        employees={[]}
        onSave={onSave}
        onCancel={onCancel}
        canReschedule
        canCancel
        canAddNotes
        hostContext="pos"
      />
    );
    setStatus('pending');
    clickSave();
    await waitFor(() => expect(screen.queryByTestId('unmaterialize-modal')).toBeTruthy());
    expect(lastModalProps?.context).toBe('pos');
  });

  it('reverting status to earlier state WITHOUT active job → normal save, no modal', async () => {
    renderDialog(makeAppointment({ status: 'confirmed', has_active_job: false }));
    setStatus('pending');
    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('unmaterialize-modal')).toBeNull();
  });

  it('changing status to a LATER state → normal save, no modal', async () => {
    renderDialog(makeAppointment({ status: 'confirmed', has_active_job: true }));
    setStatus('in_progress');
    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('unmaterialize-modal')).toBeNull();
  });

  it('status unchanged → normal save, no modal (byte-identical)', async () => {
    renderDialog(makeAppointment({ status: 'confirmed', has_active_job: true }));
    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('unmaterialize-modal')).toBeNull();
  });

  it('changing status to cancelled → cancel short-circuit (onCancel, not modal/onSave)', async () => {
    renderDialog(makeAppointment({ status: 'confirmed', has_active_job: true }));
    setStatus('cancelled');
    clickSave();
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByTestId('unmaterialize-modal')).toBeNull();
  });
});
