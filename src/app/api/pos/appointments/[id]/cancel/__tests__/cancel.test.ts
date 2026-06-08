/**
 * POS /api/pos/appointments/[id]/cancel route tests.
 *
 * Phase 3 Theme D.1: this route is now a thin wrapper around
 * `cancelAppointmentOrchestrated`. The orchestrator has its own deep test
 * coverage at `src/lib/appointments/__tests__/cancel-orchestration.test.ts`;
 * these tests verify the route's specific responsibilities:
 *   - POS HMAC auth (401 on missing)
 *   - `appointments.cancel` permission gate (403 on denied)
 *   - Body validation (400 on missing reason)
 *   - Orchestrator delegation with correct cancelledBy='staff_pos' actor
 *   - Pathway + fee_cents pass-through
 *   - notifyCustomer default = false (POS-specific)
 *   - cancel_result surface in response
 *   - Orchestrator failure → route returns the orchestrator's httpStatus
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  posEmployee: {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'admin',
    first_name: 'Pat',
    last_name: 'Admin',
    email: 'pat@example.com',
  } as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  cancelGranted: true,
  // Orchestrator stub state
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
  // Refetch stub
  refetchedAppt: { id: 'a1', status: 'cancelled' } as unknown,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async (
    _supabase: unknown,
    _role: string,
    _employeeId: string,
    _permissionKey: string
  ) => state.cancelGranted,
}));

vi.mock('@/lib/services/audit', () => ({
  getRequestIp: () => '127.0.0.1',
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
          single: async () => ({ data: state.refetchedAppt, error: null }),
        }),
      }),
    }),
  }),
}));

async function loadRoute() {
  vi.resetModules();
  return await import('../route');
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/pos/appointments/a1/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'admin',
    first_name: 'Pat',
    last_name: 'Admin',
    email: 'pat@example.com',
  };
  state.cancelGranted = true;
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
  state.refetchedAppt = { id: 'a1', status: 'cancelled' };
});

describe('POST /api/pos/appointments/[id]/cancel — auth + permission', () => {
  it('401 when POS auth missing', async () => {
    state.posEmployee = null;
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(401);
  });

  it('403 when appointments.cancel permission denied', async () => {
    state.cancelGranted = false;
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/pos/appointments/[id]/cancel — body validation', () => {
  it('400 when cancellation_reason is missing', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 when cancellation_reason is whitespace only', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: '   ' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/pos/appointments/[id]/cancel — orchestrator delegation', () => {
  it('delegates to orchestrator with cancelledBy=staff_pos', async () => {
    const { POST } = await loadRoute();
    await POST(
      makeRequest({ cancellation_reason: 'operator decision' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls).toHaveLength(1);
    expect(state.orchestratorCalls[0].appointmentId).toBe('a1');
    expect(state.orchestratorCalls[0].cancelledBy).toBe('staff_pos');
    expect(state.orchestratorCalls[0].reason).toBe('operator decision');
  });

  it('notifyCustomer defaults to false (POS-specific behavior)', async () => {
    const { POST } = await loadRoute();
    await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(state.orchestratorCalls[0].notifyCustomer).toBe(false);
  });

  it('notifyCustomer=true is forwarded when explicit', async () => {
    const { POST } = await loadRoute();
    await POST(
      makeRequest({ cancellation_reason: 'x', notify_customer: true }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].notifyCustomer).toBe(true);
  });

  it('pathway defaults to refund when omitted', async () => {
    const { POST } = await loadRoute();
    await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(state.orchestratorCalls[0].pathway).toBe('refund');
  });

  it('pathway=credit forwards through', async () => {
    const { POST } = await loadRoute();
    await POST(
      makeRequest({ cancellation_reason: 'x', pathway: 'credit' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].pathway).toBe('credit');
  });

  it('cancellation_fee_cents forwards through', async () => {
    const { POST } = await loadRoute();
    await POST(
      makeRequest({
        cancellation_reason: 'x',
        cancellation_fee_cents: 5000,
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(state.orchestratorCalls[0].cancellation_fee_cents).toBe(5000);
  });

  it('actor employeeId is the pos employee id (drives refunds.processed_by)', async () => {
    const { POST } = await loadRoute();
    await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    const actor = state.orchestratorCalls[0].actor as Record<string, unknown>;
    expect(actor.employeeId).toBe('emp-uuid-1');
  });
});

describe('POST /api/pos/appointments/[id]/cancel — response shape', () => {
  it('200 includes cancel_result with refund pathway summary', async () => {
    state.orchestratorResult = {
      ok: true,
      appointment_id: 'a1',
      pathway: 'refund',
      job_cancelled: true,
      amount_paid_cents: 5000,
      refund_amount_cents: 5000,
      stripe_refund_id: 're_abc',
      cancellation_fee_cents: 0,
    };
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cancel_result.pathway).toBe('refund');
    expect(json.cancel_result.refund_amount_cents).toBe(5000);
    expect(json.cancel_result.stripe_refund_id).toBe('re_abc');
    expect(json.cancel_result.job_cancelled).toBe(true);
  });

  it('200 includes cancel_result with credit pathway summary', async () => {
    state.orchestratorResult = {
      ok: true,
      appointment_id: 'a1',
      pathway: 'credit',
      job_cancelled: false,
      amount_paid_cents: 7500,
      credit_id: 'cred-x',
      credit_amount_cents: 7500,
    };
    const { POST } = await loadRoute();
    const res = await POST(
      makeRequest({ cancellation_reason: 'x', pathway: 'credit' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cancel_result.pathway).toBe('credit');
    expect(json.cancel_result.credit_id).toBe('cred-x');
    expect(json.cancel_result.credit_amount_cents).toBe(7500);
  });
});

describe('POST /api/pos/appointments/[id]/cancel — orchestrator failure pass-through', () => {
  it('returns orchestrator httpStatus on failure', async () => {
    state.orchestratorResult = {
      ok: false,
      httpStatus: 409,
      error: 'already_cancelled',
      message: 'Already cancelled',
    };
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Already cancelled');
    expect(json.error_code).toBe('already_cancelled');
  });

  it('surfaces partial_state when orchestrator returned it (Pathway A Stripe-succeeded-DB-failed)', async () => {
    state.orchestratorResult = {
      ok: false,
      httpStatus: 500,
      error: 'db_failed',
      message: 'Manual reconciliation needed',
      partial_state: { stripe_refund_id: 're_partial', refund_amount_cents: 5000 },
    };
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ cancellation_reason: 'x' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.partial_state).toEqual({
      stripe_refund_id: 're_partial',
      refund_amount_cents: 5000,
    });
  });
});
