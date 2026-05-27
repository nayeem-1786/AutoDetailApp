import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Item 15e Phase 2C — POS un-materialize endpoint. The executor
// (executeUnMaterialize) is unit-tested in lifecycle-sync.test.ts; here we test
// the endpoint's wiring: HMAC auth, appointments.cancel permission, and that the
// executor's result.httpStatus/error/data is passed through unchanged.

const state = {
  posEmployee: {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'detailer',
    first_name: 'Dee',
    last_name: 'Tailer',
    email: 'dee@example.com',
  } as null | Record<string, string>,
  cancelGranted: true,
  execResult: { ok: true, httpStatus: 200, data: { jobId: 'job-1' }, deletedPhotos: 0 } as Record<
    string,
    unknown
  >,
  execArgs: null as null | { appointmentId: string; options: Record<string, unknown> },
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async (_s: unknown, _r: string, _e: string, key: string) =>
    key === 'appointments.cancel' ? state.cancelGranted : true,
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
  return new NextRequest('http://localhost/api/pos/appointments/apt-1/unmaterialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: 'apt-1' });

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'detailer',
    first_name: 'Dee',
    last_name: 'Tailer',
    email: 'dee@example.com',
  };
  state.cancelGranted = true;
  state.execResult = { ok: true, httpStatus: 200, data: { jobId: 'job-1' }, deletedPhotos: 0 };
  state.execArgs = null;
});

describe('POST /api/pos/appointments/[id]/unmaterialize', () => {
  it('401 without auth', async () => {
    state.posEmployee = null;
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it('403 without appointments.cancel permission', async () => {
    state.cancelGranted = false;
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(403);
  });

  it('passes confirmString + pos source/actor to the executor', async () => {
    await POST(makeReq({ confirmString: 'DELETE' }), { params });
    expect(state.execArgs?.appointmentId).toBe('apt-1');
    expect(state.execArgs?.options.confirmString).toBe('DELETE');
    expect(state.execArgs?.options.source).toBe('pos');
    expect((state.execArgs?.options.actor as Record<string, unknown>).userId).toBe('auth-1');
  });

  it('forwards dryRun:true to the executor (modal preview)', async () => {
    await POST(makeReq({ dryRun: true }), { params });
    expect(state.execArgs?.options.dryRun).toBe(true);
  });

  it('passes through 409 transaction_linked', async () => {
    state.execResult = { ok: false, httpStatus: 409, error: 'transaction_linked' };
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('transaction_linked');
  });

  it('passes through 422 confirm_required WITH data enumeration', async () => {
    state.execResult = {
      ok: false,
      httpStatus: 422,
      error: 'confirm_required',
      data: { jobId: 'job-1', photoCount: 3, addonCount: 1, confirmRequired: true },
    };
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('confirm_required');
    expect(json.data.photoCount).toBe(3);
  });

  it('200 on success with counts', async () => {
    state.execResult = {
      ok: true,
      httpStatus: 200,
      data: { jobId: 'job-1' },
      deletedPhotos: 2,
      deletedAddons: 1,
      storageFilesDeleted: 4,
    };
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deletedPhotos).toBe(2);
    expect(json.storageFilesDeleted).toBe(4);
  });
});
