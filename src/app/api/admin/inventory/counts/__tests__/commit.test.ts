import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Toggle-able state for the mocked layers.
const state = {
  featureEnabled: true as boolean,
  employee: { id: 'emp-1' } as { id: string } | null,
  permissionDenied: null as { status: number } | null,
  rpcResult: null as unknown,
  rpcError: null as { message: string } | null,
  count: null as unknown,
};

vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: async () => state.featureEnabled,
}));

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () =>
    state.permissionDenied
      ? new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: state.permissionDenied.status,
        })
      : null,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (_fn: string, _args: Record<string, unknown>) => ({
      data: state.rpcResult,
      error: state.rpcError,
    }),
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: state.count, error: null }),
        }),
      }),
    }),
  }),
}));

// Imported AFTER mocks so it binds to them.
import { POST } from '../[id]/commit/route';

function req(): NextRequest {
  return new NextRequest('http://localhost/api/admin/inventory/counts/count-1/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

const params = { params: Promise.resolve({ id: 'count-1' }) };

beforeEach(() => {
  state.featureEnabled = true;
  state.employee = { id: 'emp-1' };
  state.permissionDenied = null;
  state.rpcResult = null;
  state.rpcError = null;
  state.count = { id: 'count-1', status: 'committed' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/inventory/counts/[id]/commit', () => {
  it('returns 200 with 0 adjustments for empty/zero-delta count (scenarios 1 & 4)', async () => {
    state.rpcResult = { count_id: 'count-1', adjustments_created: 0 };
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.adjustments_created).toBe(0);
    expect(json.count?.id).toBe('count-1');
  });

  it('returns 200 with 1 adjustment for a single positive delta (scenario 2)', async () => {
    state.rpcResult = { count_id: 'count-1', adjustments_created: 1 };
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.adjustments_created).toBe(1);
  });

  it('returns 200 with 1 adjustment for a single negative delta (scenario 3)', async () => {
    state.rpcResult = { count_id: 'count-1', adjustments_created: 1 };
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.adjustments_created).toBe(1);
  });

  it('returns 400 with product_id when RPC aborts on negative quantity (scenario 5)', async () => {
    state.rpcError = {
      message: 'Commit would set negative quantity for product 9b1c8e2a-1111-2222-3333-444455556666',
    };
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Commit would set negative quantity');
    expect(json.product_id).toBe('9b1c8e2a-1111-2222-3333-444455556666');
  });

  it('returns 409 when count is already committed (scenario 6)', async () => {
    state.rpcError = { message: 'Count not in committable status: committed' };
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/Count is/);
  });

  it('returns 200 with multiple adjustments for mixed deltas (scenario 7)', async () => {
    state.rpcResult = { count_id: 'count-1', adjustments_created: 3 };
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.adjustments_created).toBe(3);
  });

  it('returns 404 when the count does not exist', async () => {
    state.rpcError = { message: 'Count not found' };
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    state.employee = null;
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
  });

  it('returns 403 when feature flag is disabled', async () => {
    state.featureEnabled = false;
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
  });

  it('returns 403 when permission denied', async () => {
    state.permissionDenied = { status: 403 };
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
  });

  it('returns 500 for unknown RPC errors', async () => {
    state.rpcError = { message: 'some unexpected db error' };
    const res = await POST(req(), params);
    expect(res.status).toBe(500);
  });
});
