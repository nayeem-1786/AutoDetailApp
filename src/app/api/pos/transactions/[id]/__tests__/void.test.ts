import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mocked layer state — adjust per-test to exercise error paths.
const state = {
  employeeId: 'emp-1' as string | null,
  posEmployee: null as
    | { employee_id: string; auth_user_id: string; email: string; first_name: string; last_name: string }
    | null,
  permissionDenied: null as { status: number } | null,
  rpcResult: null as unknown,
  rpcError: null as { message: string } | null,
  transactionRow: null as unknown,
};

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const notifyCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.employeeId ? { id: 'auth-1' } : null } }) },
  }),
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () =>
    state.permissionDenied
      ? new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: state.permissionDenied.status,
        })
      : null,
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: () => {},
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/data/receipt-config', () => ({
  fetchReceiptConfig: async () => ({ merged: {} }),
}));

vi.mock('@/lib/email/send-void-notification', () => ({
  notifyTransactionVoided: async (input: Record<string, unknown>) => {
    notifyCalls.push(input);
    return { emailSent: true, smsSent: true };
  },
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
          eq: () => ({
            single: async () => ({ data: state.transactionRow, error: null }),
          }),
          single: async () => ({ data: state.transactionRow, error: null }),
        }),
      }),
    }),
  }),
}));

// Imported AFTER mocks.
import { PATCH } from '../route';

function req(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/pos/transactions/tx-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'tx-1' }) };

beforeEach(() => {
  state.employeeId = 'emp-1';
  state.posEmployee = {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'cashier@example.com',
    first_name: 'Cash',
    last_name: 'Ier',
  };
  state.permissionDenied = null;
  state.rpcResult = null;
  state.rpcError = null;
  state.transactionRow = { id: 'tx-1', status: 'voided' };
  rpcCalls.length = 0;
  notifyCalls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/pos/transactions/[id] action=void', () => {
  it('calls void_transaction RPC with correct args', async () => {
    state.rpcResult = {
      status: 'success',
      transaction_id: 'tx-1',
      items_restored: 2,
      units_restored: 5,
      loyalty_restored: 0,
      loyalty_clawed: 10,
      coupon_reversed: false,
      campaign_reversed: false,
      job_cancelled: false,
      job_id: null,
      customer_id: null,
    };

    const res = await PATCH(req({ action: 'void', reason: 'Wrong item' }), params);
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('void_transaction');
    expect(rpcCalls[0].args).toEqual({
      p_transaction_id: 'tx-1',
      p_user_id: 'emp-1',
      p_reason: 'Wrong item',
    });
  });

  it('returns 200 with void_result on success', async () => {
    state.rpcResult = {
      status: 'success',
      transaction_id: 'tx-1',
      items_restored: 3,
      units_restored: 7,
      loyalty_restored: 5,
      loyalty_clawed: 12,
      coupon_reversed: true,
      campaign_reversed: true,
      job_cancelled: false,
      customer_id: 'cust-1',
    };

    const res = await PATCH(req({ action: 'void' }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.void_result).toEqual({
      items_restored: 3,
      units_restored: 7,
      loyalty_restored: 5,
      loyalty_clawed: 12,
      coupon_reversed: true,
      campaign_reversed: true,
      job_cancelled: false,
    });
  });

  it('fires customer notification when job was cancelled', async () => {
    state.rpcResult = {
      status: 'success',
      transaction_id: 'tx-1',
      items_restored: 0,
      units_restored: 0,
      loyalty_restored: 0,
      loyalty_clawed: 0,
      coupon_reversed: false,
      campaign_reversed: false,
      job_cancelled: true,
      job_id: 'job-1',
      customer_id: 'cust-1',
    };

    const res = await PATCH(req({ action: 'void', reason: 'Customer cancelled' }), params);
    expect(res.status).toBe(200);
    // Yield to allow fire-and-forget promise to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0]).toMatchObject({
      customerId: 'cust-1',
      transactionId: 'tx-1',
      jobCancelled: true,
      reason: 'Customer cancelled',
    });
  });

  it('does NOT fire notification when no job was cancelled', async () => {
    state.rpcResult = {
      status: 'success',
      transaction_id: 'tx-1',
      items_restored: 1,
      units_restored: 1,
      loyalty_restored: 0,
      loyalty_clawed: 0,
      coupon_reversed: false,
      campaign_reversed: false,
      job_cancelled: false,
      customer_id: 'cust-1',
    };

    await PATCH(req({ action: 'void' }), params);
    await new Promise((r) => setTimeout(r, 0));
    expect(notifyCalls).toHaveLength(0);
  });

  it('does NOT fire notification on walk-in (no customer_id)', async () => {
    state.rpcResult = {
      status: 'success',
      job_cancelled: true,
      customer_id: null,
    };

    await PATCH(req({ action: 'void' }), params);
    await new Promise((r) => setTimeout(r, 0));
    expect(notifyCalls).toHaveLength(0);
  });

  it('returns 404 when RPC returns NOT_FOUND', async () => {
    state.rpcResult = { status: 'error', error_code: 'NOT_FOUND' };
    const res = await PATCH(req({ action: 'void' }), params);
    expect(res.status).toBe(404);
  });

  it('returns 400 when RPC returns NOT_VOIDABLE with current_status', async () => {
    state.rpcResult = {
      status: 'error',
      error_code: 'NOT_VOIDABLE',
      current_status: 'partial_refund',
    };
    const res = await PATCH(req({ action: 'void' }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('partial_refund');
    expect(json.current_status).toBe('partial_refund');
  });

  it('returns 500 on RPC error', async () => {
    state.rpcError = { message: 'connection refused' };
    const res = await PATCH(req({ action: 'void' }), params);
    expect(res.status).toBe(500);
  });

  it('returns 401 when unauthenticated', async () => {
    state.employeeId = null;
    state.posEmployee = null;
    const res = await PATCH(req({ action: 'void' }), params);
    expect(res.status).toBe(401);
  });

  it('returns 403 when permission denied', async () => {
    state.permissionDenied = { status: 403 };
    const res = await PATCH(req({ action: 'void' }), params);
    expect(res.status).toBe(403);
  });

  it('returns 400 on unknown action', async () => {
    const res = await PATCH(req({ action: 'mystery' }), params);
    expect(res.status).toBe(400);
  });

  it('passes null reason when not provided', async () => {
    state.rpcResult = { status: 'success', customer_id: null, job_cancelled: false };
    await PATCH(req({ action: 'void' }), params);
    expect(rpcCalls[0].args.p_reason).toBeNull();
  });
});
