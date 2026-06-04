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
 *  - Layer 8e: `<EditServicesModal>` deleted. The legacy mount
 *    is gone, so the prior "does NOT open the still-mounted modal" case
 *    is retired — its premise no longer exists.
 *  - Post-Phase-2B fix (current): the `onEditInPos` no-op suppression prop
 *    was replaced by `returnToPath` parameterization so admin AND POS
 *    Schedule hosts share one handler. Admin still returns to
 *    `/admin/appointments`; POS Schedule returns to `/pos/jobs`. The
 *    render gate now uses the shared `isServiceEditableStatus` predicate
 *    so `no_show` is excluded in lockstep with the load endpoint. See
 *    `docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md`.
 *
 * This test pins:
 *  - The "Edit in POS" trigger renders enabled (no `disabled` attribute).
 *  - Clicking it calls `router.push` with the correct deep-link URL.
 *  - `returnToPath` defaults to `/admin/appointments` and is forwarded
 *    verbatim into the URL when overridden (POS Schedule passes
 *    `/pos/jobs`).
 *  - The button is HIDDEN for terminal statuses (`completed`,
 *    `cancelled`, `no_show`) per the shared `isServiceEditableStatus`
 *    predicate — locks the no_show gap closed.
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

function makeAppointment(status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' = 'pending') {
  return {
    id: 'appt-1',
    status,
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

describe('AppointmentDetailDialog — Edit in POS trigger (Item 15f Phase 1 Layer 8d/8d-bis/8e + post-2B fix)', () => {
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

  it('clicking Edit (default returnToPath) navigates to /pos?source=appointment&id=...&returnTo=/admin/appointments', () => {
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

  // Post-Phase-2B fix: the prior `onEditInPos` no-op pattern is replaced by
  // `returnToPath` parameterization. The POS Schedule host passes
  // `/pos/jobs` so Save Changes returns to Schedule instead of admin.
  it('clicking Edit with returnToPath="/pos/jobs" routes Save back to Schedule', () => {
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
        returnToPath="/pos/jobs"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit in POS/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const url = mockPush.mock.calls[0][0];
    expect(url).toContain('/pos?source=appointment');
    expect(url).toContain('id=appt-1');
    expect(url).toContain(`returnTo=${encodeURIComponent('/pos/jobs')}`);
    // Lock the no-op regression: the URL must NOT default back to admin
    // when a POS returnToPath was provided.
    expect(url).not.toContain(encodeURIComponent('/admin/appointments'));
  });

  // Render-gate coverage — single source of truth via
  // `isServiceEditableStatus` (status-transitions.ts).
  it.each(['pending', 'confirmed', 'in_progress'] as const)(
    'renders the Edit button for service-editable status: %s',
    (status) => {
      render(
        <AppointmentDetailDialog
          open
          onOpenChange={() => {}}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          appointment={makeAppointment(status) as any}
          employees={[]}
          onSave={vi.fn().mockResolvedValue(true)}
          onCancel={() => {}}
          canReschedule={true}
          canCancel={true}
        />,
      );

      expect(screen.queryByRole('button', { name: /Edit in POS/i })).toBeTruthy();
    },
  );

  it.each(['completed', 'cancelled', 'no_show'] as const)(
    'does NOT render the Edit button for terminal status: %s (lockstep with service-edit refusal set)',
    (status) => {
      render(
        <AppointmentDetailDialog
          open
          onOpenChange={() => {}}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          appointment={makeAppointment(status) as any}
          employees={[]}
          onSave={vi.fn().mockResolvedValue(true)}
          onCancel={() => {}}
          canReschedule={true}
          canCancel={true}
        />,
      );

      expect(screen.queryByRole('button', { name: /Edit in POS/i })).toBeNull();
    },
  );

});
