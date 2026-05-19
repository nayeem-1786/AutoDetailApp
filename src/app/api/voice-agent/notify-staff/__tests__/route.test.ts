/**
 * Behavior-preservation test for POST /api/voice-agent/notify-staff.
 *
 * Layer 1+2 refactored the endpoint to be a thin HTTP wrapper around
 * notifyStaff(). The HTTP contract MUST be unchanged for existing voice-agent
 * callers. These tests pin the contract from the operator's perspective:
 *
 *   - 401 on bad auth
 *   - 200 + { success: false } on invalid reason
 *   - 200 + { success: false } on missing details
 *   - 200 + { success: true } on success (template inactive counts as success too —
 *     preserves original endpoint behavior where templateInactive was returned as
 *     { success: true } so the voice agent didn't retry on operator opt-out)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authState = { valid: true as boolean };

vi.mock('@/lib/auth/api-key', () => ({
  validateApiKey: async () => ({
    valid: authState.valid,
    error: authState.valid ? undefined : 'Invalid API key',
  }),
}));

const notifyStaffMock = vi.fn(async () => ({
  success: true as boolean,
  recipientsNotified: 1,
  errors: [] as string[],
  templateInactive: false as boolean | undefined,
  noRecipients: false as boolean | undefined,
}));

vi.mock('@/lib/services/staff-notification', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/staff-notification')>(
    '@/lib/services/staff-notification',
  );
  return {
    ...actual,
    notifyStaff: (...args: Parameters<typeof actual.notifyStaff>) => notifyStaffMock(...args),
  };
});

import { POST } from '@/app/api/voice-agent/notify-staff/route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voice-agent/notify-staff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-key',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authState.valid = true;
  notifyStaffMock.mockClear();
  notifyStaffMock.mockImplementation(async () => ({
    success: true,
    recipientsNotified: 1,
    errors: [],
    templateInactive: false,
    noRecipients: false,
  }));
});

describe('POST /api/voice-agent/notify-staff — HTTP contract preserved post-refactor', () => {
  it('401 when auth invalid', async () => {
    authState.valid = false;
    const res = await POST(buildRequest({
      customer_name: 'Alice',
      customer_phone: '+14245551234',
      reason: 'custom_quote',
      details: 'x',
    }));
    expect(res.status).toBe(401);
  });

  it('200 { success: false } on invalid reason (no retry from agent)', async () => {
    const res = await POST(buildRequest({
      customer_name: 'Alice',
      customer_phone: '+14245551234',
      reason: 'not-a-reason',
      details: 'x',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: false });
    expect(notifyStaffMock).not.toHaveBeenCalled();
  });

  it('200 { success: false } on missing details', async () => {
    const res = await POST(buildRequest({
      customer_name: 'Alice',
      customer_phone: '+14245551234',
      reason: 'custom_quote',
      details: '   ', // whitespace-only counts as missing
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: false });
    expect(notifyStaffMock).not.toHaveBeenCalled();
  });

  it('200 { success: true } on successful notify', async () => {
    const res = await POST(buildRequest({
      customer_name: 'Alice',
      customer_phone: '+14245551234',
      reason: 'transfer_request',
      details: 'wants a human',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
    expect(notifyStaffMock).toHaveBeenCalledWith({
      reason: 'transfer_request',
      customerName: 'Alice',
      customerPhone: '+14245551234',
      details: 'wants a human',
      source: 'voice_agent',
    });
  });

  it('forwards new human_handoff reason to the helper (forward-compatible)', async () => {
    const res = await POST(buildRequest({
      customer_name: 'Bob',
      customer_phone: '+14245551234',
      reason: 'human_handoff',
      details: 'expressed frustration',
    }));
    expect(res.status).toBe(200);
    expect(notifyStaffMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'human_handoff' }),
    );
  });

  it('200 { success: true } when template is inactive (matches pre-refactor behavior)', async () => {
    notifyStaffMock.mockImplementationOnce(async () => ({
      success: true,
      recipientsNotified: 0,
      errors: [],
      templateInactive: true,
      noRecipients: false,
    }));
    const res = await POST(buildRequest({
      customer_name: 'Carol',
      customer_phone: '+14245551234',
      reason: 'other',
      details: 'noise',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });

  it('200 { success: false } when no recipients configured', async () => {
    notifyStaffMock.mockImplementationOnce(async () => ({
      success: false,
      recipientsNotified: 0,
      errors: ['no_recipient_phones'],
      templateInactive: false,
      noRecipients: true,
    }));
    const res = await POST(buildRequest({
      customer_name: 'Dave',
      customer_phone: '+14245551234',
      reason: 'other',
      details: 'noise',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: false });
  });

  it('all 6 original reasons still accepted', async () => {
    const originalReasons = [
      'appointment_change',
      'custom_quote',
      'beyond_scope',
      'transfer_request',
      'mobile_distance',
      'other',
    ];
    for (const reason of originalReasons) {
      notifyStaffMock.mockClear();
      const res = await POST(buildRequest({
        customer_name: 'X',
        customer_phone: '+14245551234',
        reason,
        details: 'd',
      }));
      expect(res.status).toBe(200);
      expect(notifyStaffMock).toHaveBeenCalledTimes(1);
      const json = await res.json();
      expect(json.success).toBe(true);
    }
  });
});
