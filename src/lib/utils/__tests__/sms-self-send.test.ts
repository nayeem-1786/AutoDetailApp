/**
 * Session #139 — Concern 4: self-send chokepoint in sendSms().
 *
 * Pins the contract:
 *   - When `to` normalizes to the SAME E.164 as TWILIO_PHONE_NUMBER,
 *     sendSms refuses + warn-logs + returns { success: false, error: ... }.
 *   - When TWILIO_PHONE_NUMBER env is unset/empty, the check is skipped
 *     (no false-positives in test environments).
 *   - Sends to any other number proceed normally.
 *   - The block fires BEFORE the Twilio fetch — fetchSpy must not be
 *     called.
 *
 * Context: pre-#139 the /api/public/specialty-callback route's
 * staff_assessed_service branch fell back to [biz.phone] for recipients;
 * biz.phone IS TWILIO_PHONE_NUMBER on production, so every staff SMS
 * for the new variant tried to self-send. This chokepoint is the
 * defense-in-depth so a similar future caller is protected even if the
 * route-level fix in commit 2 is later regressed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSms } from '@/lib/utils/sms';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'auth_test';
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test';
  process.env.TWILIO_PHONE_NUMBER = '+14244010094'; // simulate production Twilio number
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('sendSms — Concern 4: self-send chokepoint', () => {
  it('blocks self-send when to == TWILIO_PHONE_NUMBER (E.164 input)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendSms('+14244010094', 'staff notification');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Self-send blocked/i);
      expect(result.error).toMatch(/TWILIO_PHONE_NUMBER/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();

    // Warn-log surfaces the caller-misconfiguration hint
    const warnText = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warnText).toMatch(/Self-send blocked/i);
    expect(warnText).toMatch(/recipient_phones/);
  });

  it('blocks self-send when to is a non-E.164 representation of TWILIO_PHONE_NUMBER', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // "(424) 401-0094" normalizes to "+14244010094"
    const result = await sendSms('(424) 401-0094', 'staff notification');

    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks self-send when to is the 10-digit form of TWILIO_PHONE_NUMBER', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendSms('4244010094', 'body');

    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks self-send when to is the 11-digit form of TWILIO_PHONE_NUMBER', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendSms('14244010094', 'body');

    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks self-send when TWILIO_PHONE_NUMBER itself is non-E.164 (defense against malformed env)', async () => {
    process.env.TWILIO_PHONE_NUMBER = '(424) 401-0094';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendSms('+14244010094', 'body');

    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows send to any number other than TWILIO_PHONE_NUMBER', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM_ok' }), { status: 200 })
    );

    const result = await sendSms('+13105551234', 'hi');

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = fetchSpy.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('To')).toBe('+13105551234');
  });

  it('allows send when TWILIO_PHONE_NUMBER env is unset (no false-positive in test env)', async () => {
    delete process.env.TWILIO_PHONE_NUMBER;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM_ok' }), { status: 200 })
    );

    // This number would have matched the production TWILIO_PHONE_NUMBER, but
    // without the env set, the chokepoint skips the check.
    const result = await sendSms('+14244010094', 'hi');

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('allows send when TWILIO_PHONE_NUMBER env is empty string', async () => {
    process.env.TWILIO_PHONE_NUMBER = '';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM_ok' }), { status: 200 })
    );

    const result = await sendSms('+14244010094', 'hi');

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not insert sms_delivery_log row when self-send is blocked', async () => {
    // Mock Supabase admin so we can detect any insert attempts
    const insertSpy = vi.fn(async () => ({ data: null, error: null }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: () => ({ insert: insertSpy }) }),
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendSms('+14244010094', 'body');

    expect(result.success).toBe(false);
    // No tracking row is written for a blocked self-send (no Twilio SID exists)
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('self-send check runs AFTER invalid-phone rejection (chained order)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Invalid phone — should fail with "Invalid phone number format",
    // NOT "Self-send blocked", because normalizePhone returns null first.
    const result = await sendSms('not-a-phone', 'body');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid/i);
      expect(result.error).not.toMatch(/self-send/i);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
