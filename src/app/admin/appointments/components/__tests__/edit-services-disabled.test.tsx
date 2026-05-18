/**
 * Item 15f Phase 1 Layer 8d / 8e — Admin Appointment dialog: "Edit in POS"
 * trigger routes to POS edit mode.
 *
 * Architectural arc:
 *  - Layer 4 (2026-05-17, earlier): disabled the inline Admin Edit
 *    trigger because `<EditServicesModal>`'s bespoke `resolveServicePrice`
 *    silently mispriced exotic/classic. Modal was deletion-scheduled.
 *  - Layer 8d (this layer): re-enabled the trigger as a `router.push` to
 *    `/pos?source=appointment&id=...&returnTo=/admin/appointments`. The
 *    canonical edit surface is the POS Sale tab (Layers 8a-8c).
 *  - Layer 8d-bis: button restyled to match admin shell's "Open POS"
 *    pattern; label changed to "Edit in POS"; positioned top-right.
 *  - Layer 8e (current): `<EditServicesModal>` deleted. The legacy mount
 *    is gone, so the prior "does NOT open the still-mounted modal" case
 *    is retired — its premise no longer exists.
 *
 * This test pins:
 *  - The "Edit in POS" trigger renders enabled (no `disabled` attribute).
 *  - Clicking it calls `router.push` with the correct deep-link URL.
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
// "Edit in POS" trigger's navigation, not the surrounding mobile-edit /
// payment / status UI.
vi.mock('@/components/jobs/edit-mobile-modal', () => ({
  EditMobileModal: () => null,
}));
vi.mock('@/components/jobs/payment-mismatch-banner', () => ({
  PaymentMismatchBanner: () => null,
}));
vi.mock('@/components/appointments/modifier-summary', () => ({
  ModifierSummary: () => null,
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

describe('AppointmentDetailDialog — Edit in POS trigger (Item 15f Phase 1 Layer 8d/8d-bis/8e)', () => {
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

});
