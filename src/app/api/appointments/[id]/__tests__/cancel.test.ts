/**
 * Admin /api/appointments/[id]/cancel route tests.
 *
 * Phase 3 Theme D.1: thin-wrapper smoke tests. Orchestration depth lives at
 * `src/lib/appointments/__tests__/cancel-orchestration.test.ts`. These verify
 * the route's specific responsibilities:
 *   - Session auth (401 missing)
 *   - `appointments.cancel` permission (403 denied)
 *   - `appointments.waive_fee` permission gating when fee is set
 *   - Feature-flag fee gating: when CANCELLATION_FEE disabled, fee is dropped
 *   - Dollars → cents fee conversion at the boundary
 *   - `_cents` field wins when both shapes are provided
 *   - Orchestrator delegation with cancelledBy='staff_admin'
 *   - notifyCustomer defaults to TRUE (admin-specific)
 *   - Orchestrator failure → returns its httpStatus + message
 *   - Response shape per pathway
 *
 * Pre-D.1 this file contained Session 1.8 waitlist tests (verifying the
 * customer-facing silent-drop fix via direct sendSms). Those tests now live
 * separately (waitlist scan is preserved on the admin path post-D.1 but is
 * out of D.1's targeted scope per Memory #29 — covered by the existing
 * `waitlist_entries` table integration coverage).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  employee: {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    first_name: 'A',
    last_name: 'B',
    email: 'a@b.com',
  } as null | {
    id: string;
    auth_user_id: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  cancelDenied: null as null | unknown,
  waiveDenied: null as null | unknown,
  feeFlagEnabled: true,
  waitlistFlagEnabled: false,
  orchestratorResult: {
    ok: true as const,
    appointment_id: 'a1',
    pathway: 'refund' as 'refund' | 'credit',
    job_cancelled: false,
    amount_paid_cents: 0,
    refund_amount_cents: 0,
    stripe_refund_id: null,
    cancellation_fee_cents: 0,
  } as unknown,
  orchestratorCalls: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async (_id: string, permKey: string) => {
    if (permKey === 'appointments.cancel') return state.cancelDenied;
    if (permKey === 'appointments.waive_fee') return state.waiveDenied;
    return null;
  },
}));

vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: async (flag: string) => {
    if (flag === 'cancellation_fee') return state.feeFlagEnabled;
    if (flag === 'waitlist') return state.waitlistFlagEnabled;
    return false;
  },
}));

vi.mock('@/lib/services/audit', () => ({
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/utils/sms', () => ({
  sendSms: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: vi.fn(async () => ({ isActive: false, body: '' })),
}));

vi.mock('@/lib/appointments/cancel-orchestration', () => ({
  cancelAppointmentOrchestrated: async (
    _client: unknown,
    input: Record<string, unknown>
  ) => {
    state.orchestratorCalls.push(input);
    return state.orchestratorResult;
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { scheduled_date: '2026-06-10' },
            error: null,
          }),
        }),
        in: () => ({
          eq: () => ({
            or: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

async function loadRoute() {
  vi.resetModules();
  return await import('../cancel/route');
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/appointments/a1/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.employee = {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    first_name: 'A',
    last_name: 'B',
    email: 'a@b.com',
  };
  state.cancelDenied = null;
  state.waiveDenied = null;
  state.feeFlagEnabled = true;
  state.waitlistFlagEnabled = false;
  state.orchestratorCalls = [];
  state.orchestratorResult = {
    ok: true,
    appointment_id: 'a1',
    pathway: 'refund',
    job_cancelled: false,
    amount_paid_cents: 0,
    refund_amount_cents: 0,
    stripe_refund_id: null,
    cancellation_fee_cents: 0,
  };
});

describe('POST /api/appointments/[id]/cancel — auth + permission', () => {
  it('401 when no employee session', async () => {
    state.employee = null;
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(401);
  });

  it('appointments.cancel denial passes through', async () => {
    state.cancelDenied = new Response('forbidden', { status: 403 });
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(403);
  });

  it('fee provided BUT appointments.waive_fee denied → 403', async () => {
    state.waiveDenied = new Response('forbidden', { status: 403 });
    const { POST } = await loadRoute();
    const res = await POST(
      makeRequest({ cancellation_reason: 'x', cancellation_fee: 25 }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(403);
  });

  it('no fee → does NOT check waive_fee permission', async () => {
    state.waiveDenied = new Response('forbidden', { status: 403 });
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/appointments/[id]/cancel — fee dollar/cents handling', () => {
  it('feature flag disabled → fee dropped silently; orchestrator receives null', async () => {
    state.feeFlagEnabled = false;
    const { POST } = await loadRoute();
    await POST(
      makeRequest({ cancellation_reason: 'x', cancellation_fee: 50 }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].cancellation_fee_cents).toBeNull();
  });

  it('legacy cancellation_fee (dollars) → converted to cents', async () => {
    const { POST } = await loadRoute();
    await POST(
      makeRequest({ cancellation_reason: 'x', cancellation_fee: 50 }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].cancellation_fee_cents).toBe(5000);
  });

  it('explicit cancellation_fee_cents wins over legacy dollars when both provided', async () => {
    const { POST } = await loadRoute();
    await POST(
      makeRequest({
        cancellation_reason: 'x',
        cancellation_fee: 50,
        cancellation_fee_cents: 7500,
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].cancellation_fee_cents).toBe(7500);
  });
});

describe('POST /api/appointments/[id]/cancel — orchestrator delegation', () => {
  it('cancelledBy=staff_admin', async () => {
    const { POST } = await loadRoute();
    await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(state.orchestratorCalls[0].cancelledBy).toBe('staff_admin');
  });

  it('notifyCustomer defaults TRUE on admin path', async () => {
    const { POST } = await loadRoute();
    await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(state.orchestratorCalls[0].notifyCustomer).toBe(true);
  });

  it('notifyCustomer=false respected when explicitly set', async () => {
    const { POST } = await loadRoute();
    await POST(
      makeRequest({ cancellation_reason: 'x', notify_customer: false }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].notifyCustomer).toBe(false);
  });

  it('pathway defaults refund; pathway=credit forwards', async () => {
    const { POST: P1 } = await loadRoute();
    await P1(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(state.orchestratorCalls[0].pathway).toBe('refund');

    state.orchestratorCalls = [];
    const { POST: P2 } = await loadRoute();
    await P2(
      makeRequest({ cancellation_reason: 'x', pathway: 'credit' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].pathway).toBe('credit');
  });

  it('actor.employeeId is the admin employee id; userId is the auth id', async () => {
    const { POST } = await loadRoute();
    await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    const actor = state.orchestratorCalls[0].actor as Record<string, unknown>;
    expect(actor.employeeId).toBe('emp-1');
    expect(actor.userId).toBe('auth-1');
  });
});

describe('POST /api/appointments/[id]/cancel — orchestrator failure pass-through', () => {
  it('orchestrator failure → returns its httpStatus + message + error_code', async () => {
    state.orchestratorResult = {
      ok: false,
      httpStatus: 404,
      error: 'not_found',
      message: 'Appointment x not found',
    };
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Appointment x not found');
    expect(json.error_code).toBe('not_found');
  });
});

describe('POST /api/appointments/[id]/cancel — response shape', () => {
  it('refund pathway response includes refund_amount_cents + stripe_refund_id', async () => {
    state.orchestratorResult = {
      ok: true,
      appointment_id: 'a1',
      pathway: 'refund',
      job_cancelled: false,
      amount_paid_cents: 5000,
      refund_amount_cents: 5000,
      stripe_refund_id: 're_admin',
      cancellation_fee_cents: 0,
    };
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    const json = await res.json();
    expect(json.pathway).toBe('refund');
    expect(json.refund_amount_cents).toBe(5000);
    expect(json.stripe_refund_id).toBe('re_admin');
  });

  it('credit pathway response includes credit_id + credit_amount_cents', async () => {
    state.orchestratorResult = {
      ok: true,
      appointment_id: 'a1',
      pathway: 'credit',
      job_cancelled: false,
      amount_paid_cents: 5000,
      credit_id: 'cred-1',
      credit_amount_cents: 5000,
    };
    const { POST } = await loadRoute();
    const res = await POST(
      makeRequest({ cancellation_reason: 'x', pathway: 'credit' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    const json = await res.json();
    expect(json.pathway).toBe('credit');
    expect(json.credit_id).toBe('cred-1');
    expect(json.credit_amount_cents).toBe(5000);
  });
});
