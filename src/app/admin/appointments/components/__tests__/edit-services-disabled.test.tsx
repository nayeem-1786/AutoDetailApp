/**
 * Item 15f Layer 4 — Admin Appointment dialog: "Edit" services trigger is
 * disabled, modal does not open.
 *
 * Architectural decision (Layer 4): rather than patch the bespoke
 * `resolveServicePrice` inside `<EditServicesModal>` (a surface scheduled
 * for full deletion in Phase 1 Layer 8e), the Admin entry point is
 * disabled — operators edit appointment services via the POS Jobs card,
 * which already routes through the canonical engine.
 *
 * This test pins:
 *  - The "Edit" trigger renders with `disabled` + `aria-disabled="true"`.
 *  - Clicking it does NOT open `<EditServicesModal>` (the modal stays
 *    mounted-but-unreachable; `open={false}` means it returns `null`).
 *  - The operator message is surfaced via the button's title tooltip.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppointmentDetailDialog } from '../appointment-detail-dialog';

// Heavy child components are mocked — the test only cares about the
// "Edit" trigger's disabled state and the modal's open prop, not the
// surrounding mobile-edit / payment / status UI.
vi.mock('@/components/jobs/edit-mobile-modal', () => ({
  EditMobileModal: () => null,
}));
vi.mock('@/components/jobs/payment-mismatch-banner', () => ({
  PaymentMismatchBanner: () => null,
}));
vi.mock('@/components/appointments/modifier-summary', () => ({
  ModifierSummary: () => null,
}));
vi.mock('@/components/appointments/edit-services-modal', () => ({
  EditServicesModal: ({ open }: { open: boolean }) =>
    // Render a sentinel only when open=true so the test can assert
    // the modal does NOT mount (heading absent).
    open ? <div data-testid="edit-services-modal">Edit Services</div> : null,
}));

afterEach(cleanup);

function makeAppointment() {
  return {
    id: 'appt-1',
    status: 'pending' as const,
    scheduled_date: '2026-06-01',
    scheduled_start_time: '09:00:00',
    scheduled_end_time: '10:00:00',
    employee_id: null,
    job_notes: '',
    internal_notes: '',
    total_amount: 200,
    subtotal: 200,
    discount_amount: 0,
    coupon_code: null,
    coupon_discount: 0,
    loyalty_points_redeemed: 0,
    loyalty_discount: 0,
    manual_discount_value: null,
    manual_discount_label: null,
    appointment_services: [
      {
        id: 'as-1',
        service_id: 'svc-1',
        price_at_booking: 200,
        tier_name: null,
        service: { id: 'svc-1', name: 'Test Service' },
      },
    ],
    vehicle: { size_class: 'sedan' },
    customer: { first_name: 'A', last_name: 'B' },
    channel: 'online',
  };
}

describe('AppointmentDetailDialog — Edit Services trigger disabled (Item 15f Layer 4)', () => {
  it('renders the Edit button with disabled + aria-disabled when canReschedule', () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={() => {}}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appointment={makeAppointment() as any}
        employees={[]}
        onSave={vi.fn().mockResolvedValue(true)}
        onCancel={() => {}}
        canReschedule={true}
        canCancel={true}
      />,
    );

    // The Edit trigger is rendered (canReschedule + non-terminal status),
    // but disabled.
    const editBtn = screen.getByRole('button', { name: 'Edit' });
    expect((editBtn as HTMLButtonElement).disabled).toBe(true);
    expect(editBtn.getAttribute('aria-disabled')).toBe('true');
    expect(editBtn.getAttribute('title')).toContain('POS Jobs card');
  });

  it('clicking the disabled Edit button does NOT mount the EditServicesModal', () => {
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={() => {}}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appointment={makeAppointment() as any}
        employees={[]}
        onSave={vi.fn().mockResolvedValue(true)}
        onCancel={() => {}}
        canReschedule={true}
        canCancel={true}
      />,
    );

    const editBtn = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(editBtn);

    // <EditServicesModal> sentinel is absent — the disabled button's
    // onClick (none) cannot open it.
    expect(screen.queryByTestId('edit-services-modal')).toBeNull();
  });
});
