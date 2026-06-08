/**
 * Phase 3 Theme B.2 (AC-11 completion) — voice-agent /send-payment-link route.
 *
 * This is the 14th voice-agent endpoint. It wraps the shared
 * `sendPaymentLink()` helper with Bearer voice_agent_api_key auth and the
 * channels array → method string translation. The dispatcher
 * (`tool-dispatcher.ts → callSendPaymentLink`) hits this route.
 *
 * Tests focus on the route's distinct contract (auth + body validation +
 * channel translation + LLM-friendly response shaping); the underlying
 * helper has its own test file (`src/lib/payment-link/__tests__/send.test.ts`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the shared helper — the route is responsible for translating inputs
// + auth, NOT for replaying the helper's behavior.
const sendPaymentLinkMock = vi.fn();
vi.mock('@/lib/payment-link/send', async () => {
  const actual = await vi.importActual<typeof import('@/lib/payment-link/send')>(
    '@/lib/payment-link/send',
  );
  return {
    ...actual,
    sendPaymentLink: (...args: unknown[]) => sendPaymentLinkMock(...args),
  };
});

// Mock the auth wrapper
const validateApiKeyMock = vi.fn();
vi.mock('@/lib/auth/api-key', () => ({
  validateApiKey: (...args: unknown[]) => validateApiKeyMock(...args),
}));

// Mock createAdminClient — the route just passes the client through to the
// helper (which we've mocked), so the sentinel is enough.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ __sentinel: 'admin-client' }),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/voice-agent/send-payment-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sendPaymentLinkMock.mockReset();
  validateApiKeyMock.mockReset();
  validateApiKeyMock.mockResolvedValue({ valid: true });
});

describe('POST /api/voice-agent/send-payment-link — auth', () => {
  it('returns 401 when validateApiKey reports invalid', async () => {
    validateApiKeyMock.mockResolvedValueOnce({
      valid: false,
      error: 'Missing or invalid Authorization header',
    });
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(makeRequest({ appointment_id: 'appt-1' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Authorization');
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/voice-agent/send-payment-link — body validation', () => {
  it('returns 400 when appointment_id is missing', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(makeRequest({ amount_cents: 5000 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('appointment_id is required');
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it('returns 400 when appointment_id is an empty string', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(makeRequest({ appointment_id: '   ' }));
    expect(res.status).toBe(400);
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it('returns 422 when amount_cents is non-integer', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({ appointment_id: 'appt-1', amount_cents: 49.5 }),
    );
    expect(res.status).toBe(422);
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it('returns 422 when amount_cents is below the Stripe minimum', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({ appointment_id: 'appt-1', amount_cents: 49 }),
    );
    expect(res.status).toBe(422);
  });

  it('returns 400 when channels is a non-array', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({ appointment_id: 'appt-1', channels: 'sms' }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('array');
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it('returns 400 when channels contains no recognized values (LLM hallucinated channel names)', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({
        appointment_id: 'appt-1',
        channels: ['twilio', 'voice'],
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('sms');
    expect(json.error).toContain('email');
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/voice-agent/send-payment-link — channels → method translation', () => {
  beforeEach(() => {
    sendPaymentLinkMock.mockResolvedValue({
      success: true,
      channels: { sms: 'sent', email: 'sent' },
      payment_link_token: 'TOK_1',
      pay_url: 'https://x/pay/TOK_1',
    });
  });

  it('defaults to method=both when channels is omitted', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(makeRequest({ appointment_id: 'appt-1' }));
    expect(sendPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'both', appointmentId: 'appt-1' }),
    );
  });

  it('translates channels=["sms"] to method="sms"', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(
      makeRequest({ appointment_id: 'appt-1', channels: ['sms'] }),
    );
    expect(sendPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'sms' }),
    );
  });

  it('translates channels=["email"] to method="email"', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(
      makeRequest({ appointment_id: 'appt-1', channels: ['email'] }),
    );
    expect(sendPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'email' }),
    );
  });

  it('translates channels=["sms","email"] to method="both"', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(
      makeRequest({
        appointment_id: 'appt-1',
        channels: ['sms', 'email'],
      }),
    );
    expect(sendPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'both' }),
    );
  });

  it('dedupes duplicate channels (defensive against LLM repeats)', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(
      makeRequest({
        appointment_id: 'appt-1',
        channels: ['sms', 'sms', 'email'],
      }),
    );
    expect(sendPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'both' }),
    );
  });

  it('filters unrecognized channel values, keeping only "sms"/"email"', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(
      makeRequest({
        appointment_id: 'appt-1',
        channels: ['sms', 'voice', 'fax'],
      }),
    );
    expect(sendPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'sms' }),
    );
  });
});

describe('POST /api/voice-agent/send-payment-link — success response shape', () => {
  it('returns 200 with payment_link_url + channels_dispatched array on success', async () => {
    sendPaymentLinkMock.mockResolvedValueOnce({
      success: true,
      channels: { sms: 'sent', email: 'sent' },
      payment_link_token: 'TOK_xyz',
      pay_url: 'https://smartdetails.test/pay/TOK_xyz',
    });
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({ appointment_id: 'appt-1', channels: ['sms', 'email'] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.payment_link_url).toBe('https://smartdetails.test/pay/TOK_xyz');
    expect(json.payment_link_token).toBe('TOK_xyz');
    expect(json.channels_dispatched).toEqual(['sms', 'email']);
    expect(json.channels).toEqual({ sms: 'sent', email: 'sent' });
  });

  it('reflects partial dispatch in channels_dispatched (sms sent, email failed → only sms)', async () => {
    sendPaymentLinkMock.mockResolvedValueOnce({
      success: true,
      channels: { sms: 'sent', email: 'failed' },
      payment_link_token: 'TOK_partial',
      pay_url: 'https://x/pay/TOK_partial',
      partial_errors: ['email send threw'],
    });
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({ appointment_id: 'appt-1', channels: ['sms', 'email'] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.channels_dispatched).toEqual(['sms']);
    expect(json.partial_errors).toEqual(['email send threw']);
  });

  it('surfaces channels.sms=skipped without listing it in channels_dispatched', async () => {
    sendPaymentLinkMock.mockResolvedValueOnce({
      success: true,
      channels: { sms: 'skipped', email: 'sent' },
      payment_link_token: 'TOK_e',
      pay_url: 'https://x/pay/TOK_e',
      partial_errors: ['SMS template inactive'],
    });
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({ appointment_id: 'appt-1', channels: ['sms', 'email'] }),
    );
    const json = await res.json();
    expect(json.channels_dispatched).toEqual(['email']);
  });
});

describe('POST /api/voice-agent/send-payment-link — error pass-through', () => {
  it('passes through helper-returned status + error (404 → 404)', async () => {
    sendPaymentLinkMock.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: 'Appointment not found',
    });
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(makeRequest({ appointment_id: 'nonexistent' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Appointment not found');
  });

  it('passes through 409 already-paid with appointment status semantics', async () => {
    sendPaymentLinkMock.mockResolvedValueOnce({
      success: false,
      status: 409,
      error: 'Appointment is already paid',
    });
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(makeRequest({ appointment_id: 'appt-paid' }));
    expect(res.status).toBe(409);
  });

  it('passes through 422 with channels + errors when all channels fail', async () => {
    sendPaymentLinkMock.mockResolvedValueOnce({
      success: false,
      status: 500,
      error: 'All channels failed',
      channels: { sms: 'failed', email: 'failed' },
      errors: ['twilio down', 'mailgun down'],
    });
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    const res = await POST(
      makeRequest({ appointment_id: 'appt-1', channels: ['sms', 'email'] }),
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('All channels failed');
    expect(json.channels).toEqual({ sms: 'failed', email: 'failed' });
    expect(json.errors).toEqual(['twilio down', 'mailgun down']);
  });
});

describe('POST /api/voice-agent/send-payment-link — amount_cents forwarding', () => {
  beforeEach(() => {
    sendPaymentLinkMock.mockResolvedValue({
      success: true,
      channels: { sms: 'sent' },
      payment_link_token: 'TOK_a',
      pay_url: 'https://x/pay/TOK_a',
    });
  });

  it('forwards amount_cents to helper when provided', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(
      makeRequest({ appointment_id: 'appt-1', amount_cents: 5000 }),
    );
    expect(sendPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 5000 }),
    );
  });

  it('forwards amountCents=undefined to helper when omitted (legacy full-remaining semantic)', async () => {
    const { POST } = await import('@/app/api/voice-agent/send-payment-link/route');
    await POST(makeRequest({ appointment_id: 'appt-1' }));
    const callArgs = sendPaymentLinkMock.mock.calls[0][0];
    expect(callArgs.amountCents).toBeUndefined();
  });
});
