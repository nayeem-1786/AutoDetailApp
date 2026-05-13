import { describe, it, expect } from 'vitest';
import { deriveCommPillState, type CommPillInput } from '../derive-comm-pill';

function input(overrides: Partial<CommPillInput>): CommPillInput {
  return {
    channel: 'sms',
    status: 'sent',
    error_message: null,
    twilio_sid: 'SM_abc',
    delivery_status: null,
    delivery_error_code: null,
    ...overrides,
  };
}

describe('deriveCommPillState — Twilio delivery overlay', () => {
  it('delivery_status=delivered → green Delivered', () => {
    expect(deriveCommPillState(input({ delivery_status: 'delivered' }))).toEqual({
      tone: 'green',
      label: 'Delivered',
      detail: null,
    });
  });

  it('delivery_status=sent → green Sent (terminal success, not in-flight)', () => {
    // Regression: was previously yellow "Sending…" — pill stuck indefinitely
    // for Twilio test numbers and carriers that don't emit delivery receipts.
    expect(deriveCommPillState(input({ delivery_status: 'sent' }))).toEqual({
      tone: 'green',
      label: 'Sent',
      detail: null,
    });
  });

  it.each(['queued', 'accepted', 'sending'] as const)(
    'delivery_status=%s → yellow Sending…',
    (status) => {
      expect(deriveCommPillState(input({ delivery_status: status }))).toMatchObject({
        tone: 'yellow',
        label: 'Sending…',
      });
    }
  );

  it('delivery_status=undelivered → red Undelivered with Twilio code', () => {
    expect(
      deriveCommPillState(
        input({ delivery_status: 'undelivered', delivery_error_code: '30005' })
      )
    ).toEqual({ tone: 'red', label: 'Undelivered', detail: 'Twilio 30005' });
  });

  it('delivery_status=failed → red Failed with Twilio code', () => {
    expect(
      deriveCommPillState(
        input({ delivery_status: 'failed', delivery_error_code: '30007' })
      )
    ).toEqual({ tone: 'red', label: 'Failed', detail: 'Twilio 30007' });
  });

  it('unknown delivery_status surfaces the raw status as yellow (defensive)', () => {
    expect(
      deriveCommPillState(input({ delivery_status: 'mystery_state' }))
    ).toMatchObject({ tone: 'yellow', label: 'mystery_state' });
  });
});

describe('deriveCommPillState — legacy / pre-webhook fallbacks', () => {
  it('SMS with twilio_sid but null delivery_status, status=sent → green Sent (optimistic)', () => {
    expect(
      deriveCommPillState(
        input({ twilio_sid: 'SM_legacy', delivery_status: null, status: 'sent' })
      )
    ).toEqual({ tone: 'green', label: 'Sent', detail: null });
  });

  it('SMS with twilio_sid but null delivery_status, status=failed → red Failed', () => {
    // Send-time outcome wins when there's no Twilio overlay.
    expect(
      deriveCommPillState(
        input({
          twilio_sid: 'SM_x',
          delivery_status: null,
          status: 'failed',
          error_message: 'Twilio 21610 (blocked)',
        })
      )
    ).toEqual({ tone: 'red', label: 'Failed', detail: 'Twilio 21610 (blocked)' });
  });

  it('SMS without twilio_sid (legacy row) renders plain green Sent', () => {
    expect(
      deriveCommPillState(input({ twilio_sid: null, delivery_status: null }))
    ).toEqual({ tone: 'green', label: 'Sent', detail: null });
  });
});

describe('deriveCommPillState — email + blocked + failed', () => {
  it('email row, status=sent → green Sent', () => {
    expect(
      deriveCommPillState(
        input({ channel: 'email', twilio_sid: null, status: 'sent' })
      )
    ).toEqual({ tone: 'green', label: 'Sent', detail: null });
  });

  it('blocked row → orange Blocked with reason', () => {
    expect(
      deriveCommPillState(
        input({
          status: 'blocked',
          error_message: 'Customer has no phone number',
          twilio_sid: null,
        })
      )
    ).toEqual({
      tone: 'orange',
      label: 'Blocked',
      detail: 'Customer has no phone number',
    });
  });

  it('failed row → red Failed with reason (even when twilio_sid present)', () => {
    expect(
      deriveCommPillState(
        input({
          status: 'failed',
          error_message: 'Twilio outage',
          twilio_sid: 'SM_x',
        })
      )
    ).toEqual({ tone: 'red', label: 'Failed', detail: 'Twilio outage' });
  });
});
