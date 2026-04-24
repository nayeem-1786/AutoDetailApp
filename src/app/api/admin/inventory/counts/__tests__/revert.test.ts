import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mocked layer state — adjust per-test to exercise error paths.
const state = {
  featureEnabled: true as boolean,
  employee: { id: 'emp-1' } as { id: string } | null,
  permissionDenied: null as { status: number } | null,
  rpcResult: null as unknown,
  rpcError: null as { message: string } | null,
  count: null as unknown,
};

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

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
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: state.rpcResult, error: state.rpcError };
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: state.count, error: null }),
        }),
      }),
    }),
  }),
}));

// Imported AFTER mocks.
import { POST } from '../[id]/revert/route';

function req(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/admin/inventory/counts/count-1/revert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'count-1' }) };

beforeEach(() => {
  state.featureEnabled = true;
  state.employee = { id: 'emp-1' };
  state.permissionDenied = null;
  state.rpcResult = null;
  state.rpcError = null;
  state.count = { id: 'count-1', status: 'cancelled' };
  rpcCalls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/inventory/counts/[id]/revert', () => {
  it('returns 200 on a clean revert (no drift)', async () => {
    state.rpcResult = {
      count_id: 'count-1',
      reversals_created: 3,
      drift_count: 0,
      drift_products: 0,
    };
    const res = await POST(req({ confirmed_drift: false }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reversals_created).toBe(3);
    expect(json.drift_count).toBe(0);
    expect(json.drift_products).toBe(0);
  });

  it('passes confirmed_drift through to the RPC', async () => {
    state.rpcResult = {
      count_id: 'count-1',
      reversals_created: 2,
      drift_count: 5,
      drift_products: 2,
    };
    const res = await POST(req({ confirmed_drift: true }), params);
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('revert_stock_count');
    expect(rpcCalls[0].args.p_confirmed_drift).toBe(true);
  });

  it('defaults confirmed_drift to false when omitted from body', async () => {
    state.rpcResult = {
      count_id: 'count-1',
      reversals_created: 1,
      drift_count: 0,
      drift_products: 0,
    };
    await POST(req({}), params);
    expect(rpcCalls[0].args.p_confirmed_drift).toBe(false);
  });

  it('returns 400 with requires_confirmation when drift detected and not confirmed', async () => {
    state.rpcError = {
      message:
        'Drift detected: 5 adjustment(s) on 2 product(s) since commit — confirm to proceed',
    };
    const res = await POST(req({ confirmed_drift: false }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.requires_confirmation).toBe(true);
    expect(json.drift_count).toBe(5);
    expect(json.drift_products).toBe(2);
  });

  it('returns 400 with product_id when revert would cause negative quantity', async () => {
    state.rpcError = {
      message:
        'Revert would set negative quantity for product 9b1c8e2a-1111-2222-3333-444455556666',
    };
    const res = await POST(req({ confirmed_drift: true }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Revert would set negative quantity');
    expect(json.product_id).toBe('9b1c8e2a-1111-2222-3333-444455556666');
  });

  it('returns 409 when count is not in committed status', async () => {
    state.rpcError = { message: 'Count not in revertable status: cancelled' };
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/Count is/);
  });

  it('returns 404 when count does not exist', async () => {
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

  it('returns 403 when permission is denied', async () => {
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
