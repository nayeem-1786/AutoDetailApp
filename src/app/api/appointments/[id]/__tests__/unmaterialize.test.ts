import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Item 15e Phase 2C — Admin un-materialize endpoint. Mirrors the POS endpoint
// but with cookie auth (getEmployeeFromSession + requirePermission). Executor is
// unit-tested separately; here we test the admin auth/permission wiring +
// result pass-through.

const state = {
  employee: { id: 'emp-1', auth_user_id: 'auth-1', email: 'admin@example.com', first_name: 'Ada', last_name: 'Min' } as
    | null
    | Record<string, string>,
  denied: false,
  execResult: { ok: true, httpStatus: 200, data: { jobId: 'job-1' } } as Record<string, unknown>,
  execArgs: null as null | { appointmentId: string; options: Record<string, unknown> },
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async (_id: string, _key: string) =>
    state.denied
      ? new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      : null,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/services/audit', () => ({
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/appointments/lifecycle-sync', () => ({
  executeUnMaterialize: vi.fn(async (_s: unknown, appointmentId: string, options: Record<string, unknown>) => {
    state.execArgs = { appointmentId, options };
    return state.execResult;
  }),
}));

import { POST } from '../unmaterialize/route';

function makeReq(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/appointments/apt-1/unmaterialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: 'apt-1' });

beforeEach(() => {
  state.employee = { id: 'emp-1', auth_user_id: 'auth-1', email: 'admin@example.com', first_name: 'Ada', last_name: 'Min' };
  state.denied = false;
  state.execResult = { ok: true, httpStatus: 200, data: { jobId: 'job-1' } };
  state.execArgs = null;
});

describe('POST /api/appointments/[id]/unmaterialize', () => {
  it('401 without session', async () => {
    state.employee = null;
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it('403 when requirePermission denies', async () => {
    state.denied = true;
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(403);
  });

  it('passes admin source/actor to the executor', async () => {
    await POST(makeReq({ confirmString: 'DELETE' }), { params });
    expect(state.execArgs?.options.source).toBe('admin');
    expect(state.execArgs?.options.confirmString).toBe('DELETE');
    expect((state.execArgs?.options.actor as Record<string, unknown>).employeeName).toBe('Ada Min');
  });

  it('passes through 422 confirm_required with data', async () => {
    state.execResult = {
      ok: false,
      httpStatus: 422,
      error: 'confirm_required',
      data: { jobId: 'job-1', confirmRequired: true, photoCount: 0 },
    };
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('confirm_required');
  });

  it('200 on success', async () => {
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).data.jobId).toBe('job-1');
  });
});
