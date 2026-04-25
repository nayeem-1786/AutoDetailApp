import { describe, it, expect, beforeEach, vi } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Tests for buildAppointmentConfirmationSms (Session 42AB).
//
// The helper now builds an {appointment_summary} caller-side composite chip and
// passes a 4-key vars object to renderSmsTemplate('appointment_confirmed', ...):
//   business_name, first_name, appointment_summary, business_phone — all required
//   per the new chip-by-default contract.
//
// We mock renderSmsTemplate to capture the exact vars constructed, then assert
// the composite-chip shape across all conditional combinations of serviceName
// and total.
// ──────────────────────────────────────────────────────────────────────────────

interface RenderInvocation {
  slug: string;
  vars: Record<string, string | undefined>;
  fallback: string;
}

const recorder = {
  invocations: [] as RenderInvocation[],
};

vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: async (
    slug: string,
    vars: Record<string, string | undefined>,
    fallback: string,
  ) => {
    recorder.invocations.push({ slug, vars, fallback });
    return {
      body: 'mock-body',
      isActive: true,
      canSilence: false,
      recipientType: 'customer' as const,
      recipientPhones: null,
    };
  },
}));

import { buildAppointmentConfirmationSms } from '../sms';

beforeEach(() => {
  recorder.invocations = [];
});

describe('buildAppointmentConfirmationSms — appointment_summary composite (Session 42AB)', () => {
  const baseParams = {
    businessName: 'Smart Details',
    businessPhone: '+15551234567',
    date: 'Monday, March 28, 2026',
    time: '10:30 AM',
  };

  it('all fields present → summary contains "Your appointment is scheduled:" + service + date/time + total', async () => {
    await buildAppointmentConfirmationSms({
      ...baseParams,
      serviceName: 'Ceramic Coating',
      customerFirstName: 'Sarah',
      total: '$299.00',
    });

    expect(recorder.invocations).toHaveLength(1);
    const { vars } = recorder.invocations[0];
    expect(vars.appointment_summary).toBe(
      'Your appointment is scheduled:\nCeramic Coating\nMonday, March 28, 2026 at 10:30 AM\nTotal: $299.00',
    );
  });

  it('no service name → summary omits service line, no orphan blank line', async () => {
    await buildAppointmentConfirmationSms({
      ...baseParams,
      customerFirstName: 'Sarah',
      total: '$299.00',
    });

    const { vars } = recorder.invocations[0];
    expect(vars.appointment_summary).toBe(
      'Your appointment is scheduled:\nMonday, March 28, 2026 at 10:30 AM\nTotal: $299.00',
    );
    expect(vars.appointment_summary).not.toMatch(/\n\n/);
  });

  it('no total → summary omits total line', async () => {
    await buildAppointmentConfirmationSms({
      ...baseParams,
      serviceName: 'Ceramic Coating',
      customerFirstName: 'Sarah',
    });

    const { vars } = recorder.invocations[0];
    expect(vars.appointment_summary).toBe(
      'Your appointment is scheduled:\nCeramic Coating\nMonday, March 28, 2026 at 10:30 AM',
    );
    expect(vars.appointment_summary).not.toContain('Total:');
  });

  it('only date/time → minimal summary', async () => {
    await buildAppointmentConfirmationSms({
      ...baseParams,
      customerFirstName: 'Sarah',
    });

    const { vars } = recorder.invocations[0];
    expect(vars.appointment_summary).toBe(
      'Your appointment is scheduled:\nMonday, March 28, 2026 at 10:30 AM',
    );
  });

  it('first_name defaults to "there" when customerFirstName is undefined (engine would otherwise hard-skip)', async () => {
    await buildAppointmentConfirmationSms({
      ...baseParams,
      serviceName: 'Ceramic Coating',
      total: '$299.00',
    });

    const { vars } = recorder.invocations[0];
    expect(vars.first_name).toBe('there');
  });

  it('vars contract: exactly 4 keys (business_name, first_name, appointment_summary, business_phone); no service_name/date/time/total/detailer_first_name', async () => {
    await buildAppointmentConfirmationSms({
      ...baseParams,
      serviceName: 'Ceramic Coating',
      customerFirstName: 'Sarah',
      total: '$299.00',
      detailerFirstName: 'Mike',
    });

    const { vars } = recorder.invocations[0];
    expect(Object.keys(vars).sort()).toEqual([
      'appointment_summary',
      'business_name',
      'business_phone',
      'first_name',
    ]);
    // Removed by 42AB — folded into composite or moved to template-level skeleton
    expect(vars).not.toHaveProperty('service_name');
    expect(vars).not.toHaveProperty('appointment_date');
    expect(vars).not.toHaveProperty('appointment_time');
    expect(vars).not.toHaveProperty('service_total');
    expect(vars).not.toHaveProperty('detailer_first_name');
  });

  it('disaster-recovery fallback string mirrors the template body shape (no orphan punctuation)', async () => {
    await buildAppointmentConfirmationSms({
      ...baseParams,
      serviceName: 'Ceramic Coating',
      customerFirstName: 'Sarah',
      total: '$299.00',
    });

    const { fallback } = recorder.invocations[0];
    expect(fallback).toContain('Smart Details — Appointment Confirmed');
    expect(fallback).toContain('Hi Sarah!');
    expect(fallback).toContain('Your appointment is scheduled:');
    expect(fallback).toContain('Questions? Call +15551234567');
    expect(fallback).not.toMatch(/  /); // no double spaces
  });
});
