import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSms, sendMarketingSms } from '@/lib/utils/sms';

// Phase Normalization-1: these tests pin the chokepoint contract.
// sendSms() and sendMarketingSms() must reject any `to` value that
// normalizePhone() can't parse to E.164 — without calling Twilio and
// without inserting into sms_delivery_log.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'auth_test';
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test';
  process.env.TWILIO_PHONE_NUMBER = '+15555550000';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('sendSms — phone normalization at chokepoint', () => {
  it('rejects empty string without calling fetch or inserting log', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendSms('', 'hello');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/invalid/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects garbage like "abc" without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendSms('abc', 'hello');
    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects too-short digits (9 digits) without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendSms('310756478', 'hello');
    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('normalizes 10-digit "(310) 756-4789" to +13107564789 before POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM_test_123' }), { status: 200 })
    );
    const result = await sendSms('(310) 756-4789', 'hello');
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Inspect the URLSearchParams body Twilio receives
    const call = fetchSpy.mock.calls[0];
    const body = call[1]?.body as URLSearchParams;
    expect(body.get('To')).toBe('+13107564789');
  });

  it('normalizes 11-digit "13107564789" to +13107564789 before POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM_test_456' }), { status: 200 })
    );
    const result = await sendSms('13107564789', 'hello');
    expect(result.success).toBe(true);
    const call = fetchSpy.mock.calls[0];
    const body = call[1]?.body as URLSearchParams;
    expect(body.get('To')).toBe('+13107564789');
  });

  it('passes valid E.164 through unchanged', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM_test_789' }), { status: 200 })
    );
    const result = await sendSms('+13107564789', 'hello');
    expect(result.success).toBe(true);
    const call = fetchSpy.mock.calls[0];
    const body = call[1]?.body as URLSearchParams;
    expect(body.get('To')).toBe('+13107564789');
  });
});

describe('sendMarketingSms — phone normalization at chokepoint', () => {
  it('rejects invalid phone without contacting Supabase or Twilio', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendMarketingSms('not-a-phone', 'hello world');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/invalid/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects empty phone', async () => {
    const result = await sendMarketingSms('', 'hello');
    expect(result.success).toBe(false);
  });
});
