/**
 * Item 15f Phase 1 Layer 8d — Admin Appointment dialog: "Edit Services"
 * trigger is RE-ENABLED and routes to POS edit mode.
 *
 * Architectural arc:
 *  - Layer 4 (2026-05-17, earlier): disabled the inline Admin Edit
 *    trigger because `<EditServicesModal>`'s bespoke `resolveServicePrice`
 *    silently mispriced exotic/classic. Modal was deletion-scheduled.
 *  - Layer 8d (this layer): re-enables the trigger as a `router.push` to
 *    `/pos?source=appointment&id=...&returnTo=/admin/appointments`. The
 *    canonical edit surface is now the POS Sale tab (Layers 8a-8c). The
 *    `<EditServicesModal>` mount stays inert as dead code until Layer 8e
 *    deletes it.
 *
 * This test pins:
 *  - The "Edit" trigger renders enabled (no `disabled` attribute).
 *  - Clicking it calls `router.push` with the correct deep-link URL.
 *  - Clicking it does NOT open the (still-mounted) `<EditServicesModal>`.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppointmentDetailDialog } from '../appointment-detail-dialog';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

// Heavy child components are mocked — the test only cares about the
// "Edit" trigger's navigation, not the surrounding mobile-edit / payment
// / status UI.
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
    open ? <div data-testid="edit-services-modal">Edit Services</div> : null,
}));

afterEach(() => {
  cleanup();
  mockPush.mockReset();
});

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

describe('AppointmentDetailDialog — Edit Services trigger routes to POS (Item 15f Phase 1 Layer 8d)', () => {
  it('renders the Edit button enabled (no disabled attribute) when canReschedule', () => {
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

    const editBtn = screen.getByRole('button', { name: /Edit in POS/i });
    expect((editBtn as HTMLButtonElement).disabled).toBe(false);
    expect(editBtn.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('clicking Edit calls router.push with /pos?source=appointment&id=...&returnTo=/admin/appointments', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Edit in POS/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const url = mockPush.mock.calls[0][0];
    expect(url).toContain('/pos?source=appointment');
    expect(url).toContain('id=appt-1');
    expect(url).toContain(`returnTo=${encodeURIComponent('/admin/appointments')}`);
  });

  it('clicking Edit does NOT mount the legacy <EditServicesModal>', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Edit in POS/i }));

    // The dead `<EditServicesModal>` stays mounted (open={false}, renders
    // null) — Layer 8e deletes it. Confirm it does NOT open from this click.
    expect(screen.queryByTestId('edit-services-modal')).toBeNull();
  });
});
