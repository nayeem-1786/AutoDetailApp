/**
 * Item 15f Phase 1 Layer 8e — Admin Appointment dialog truncates
 * seconds-precise legacy `scheduled_*_time` values to HH:MM for the
 * native `<input type="time">` (step=60 validator rejects seconds).
 *
 * Pre-Layer-8e, walk-in path wrote HH:MM:SS rows. The Layer 8e backfill
 * normalizes existing rows to HH:MM:00, but the UI truncation is the
 * belt-and-suspenders guarantee: if a future creator path slips and
 * writes seconds again, the Admin dialog still renders + saves cleanly.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AppointmentDetailDialog } from '../appointment-detail-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/jobs/edit-mobile-modal', () => ({
  EditMobileModal: () => null,
}));
vi.mock('@/components/jobs/payment-mismatch-banner', () => ({
  PaymentMismatchBanner: () => null,
}));
vi.mock('@/components/appointments/modifier-summary', () => ({
  ModifierSummary: () => null,
}));

afterEach(cleanup);

function makeAppointment(overrides: Partial<{
  scheduled_start_time: string;
  scheduled_end_time: string;
}> = {}) {
  return {
    id: 'appt-time',
    status: 'pending' as const,
    scheduled_date: '2026-06-01',
    scheduled_start_time: '17:19:11', // legacy seconds-precision (broken on HTML5 input)
    scheduled_end_time: '18:19:11',
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
    appointment_services: [],
    vehicle: { size_class: 'sedan' },
    customer: { first_name: 'Jane', last_name: 'Doe' },
    channel: 'walk_in',
    ...overrides,
  };
}

describe('AppointmentDetailDialog — time input truncation (Item 15f Phase 1 Layer 8e)', () => {
  it('truncates seconds-precision scheduled_start_time to HH:MM for HTML5 time input', () => {
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

    const startInput = document.getElementById('detail-start') as HTMLInputElement;
    expect(startInput).toBeTruthy();
    // Truncated form — no seconds segment. HTML5 step=60 accepts this.
    expect(startInput.value).toBe('17:19');
    expect(startInput.value).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('renders cleanly when the input value is already minute-precise (HH:MM)', () => {
    const appt = makeAppointment({
      scheduled_start_time: '09:30',
      scheduled_end_time: '10:30',
    });
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={() => {}}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appointment={appt as any}
        employees={[]}
        onSave={vi.fn().mockResolvedValue(true)}
        onCancel={() => {}}
        canReschedule={true}
        canCancel={true}
      />,
    );

    const startInput = document.getElementById('detail-start') as HTMLInputElement;
    expect(startInput.value).toBe('09:30');
  });

  it('truncates HH:MM:00 (already minute-precise, just zero seconds) to HH:MM', () => {
    const appt = makeAppointment({
      scheduled_start_time: '14:00:00',
      scheduled_end_time: '15:00:00',
    });
    render(
      <AppointmentDetailDialog
        open
        onOpenChange={() => {}}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appointment={appt as any}
        employees={[]}
        onSave={vi.fn().mockResolvedValue(true)}
        onCancel={() => {}}
        canReschedule={true}
        canCancel={true}
      />,
    );

    const startInput = document.getElementById('detail-start') as HTMLInputElement;
    const endInput = document.getElementById('detail-end') as HTMLInputElement;
    expect(startInput.value).toBe('14:00');
    expect(endInput.value).toBe('15:00');
  });
});
