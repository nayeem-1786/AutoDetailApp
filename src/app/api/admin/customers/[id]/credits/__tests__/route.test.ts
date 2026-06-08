/**
 * Phase 3 Theme E.3 — admin customer-credits endpoint tests.
 *
 * Mocked-layer pattern mirrors apply-credit/route.test.ts (E.2). Live DB
 * coverage of the underlying repository lives in
 * src/lib/credits/__tests__/repository.test.ts; this file pins auth,
 * permission, validation, audit, and the repository wiring for both verbs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = {
  employee: null as
    | {
        id: string;
        auth_user_id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
      }
    | null,
  permissionDenied: null as ReturnType<typeof NextResponse.json> | null,
  createdCredit: null as Record<string, unknown> | null,
  balance: null as Record<string, unknown> | null,
  createError: null as Error | null,
  balanceError: null as Error | null,
};

const createCalls: Array<Record<string, unknown>> = [];
const auditCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () => state.permissionDenied,
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (params: Record<string, unknown>) => {
    auditCalls.push(params);
  },
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/credits/repository', () => ({
  createCustomerCredit: async (
    _supabase: unknown,
    input: Record<string, unknown>
  ) => {
    createCalls.push(input);
    if (state.createError) throw state.createError;
    return state.createdCredit;
  },
  getCustomerCreditBalance: async () => {
    if (state.balanceError) throw state.balanceError;
    return state.balance;
  },
}));

import { GET, POST } from '../route';

function postReq(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(
    'http://localhost/api/admin/customers/cust-1/credits',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function getReq(): NextRequest {
  return new NextRequest(
    'http://localhost/api/admin/customers/cust-1/credits',
    { method: 'GET' }
  );
}

const params = { params: Promise.resolve({ id: 'cust-1' }) };

beforeEach(() => {
  state.employee = {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'admin@example.com',
    first_name: 'Ad',
    last_name: 'Min',
    role: 'admin',
  };
  state.permissionDenied = null;
  state.createError = null;
  state.balanceError = null;
  state.createdCredit = {
    id: 'credit-1',
    customer_id: 'cust-1',
    amount_cents: 2500,
    reason: 'goodwill',
    reason_note: null,
    source_appointment_id: null,
    source_transaction_id: null,
    applied_at: null,
    applied_to_appointment_id: null,
    applied_to_transaction_id: null,
    applied_amount_cents: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    created_by_employee_id: 'emp-1',
    updated_at: new Date().toISOString(),
  };
  state.balance = {
    customer_id: 'cust-1',
    total_issued_cents: 5000,
    total_applied_cents: 2000,
    available_balance_cents: 3000,
    unapplied_credits: [],
  };
  createCalls.length = 0;
  auditCalls.length = 0;
});

describe('POST /api/admin/customers/[id]/credits', () => {
  it('returns 201 + persists credit + writes audit row', async () => {
    const res = await POST(
      postReq({ amount_cents: 2500, reason: 'goodwill', reason_note: 'redo' }),
      params
    );
    expect(res.status).toBe(201);
    expect(createCalls.length).toBe(1);
    expect(createCalls[0]!.amount_cents).toBe(2500);
    expect(createCalls[0]!.reason).toBe('goodwill');
    expect(createCalls[0]!.reason_note).toBe('redo');
    expect(createCalls[0]!.created_by_employee_id).toBe('emp-1');
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0]!.entityType).toBe('customer_credit');
    expect(auditCalls[0]!.action).toBe('create');
    expect(auditCalls[0]!.entityId).toBe('credit-1');
  });

  it('returns 401 when no employee session', async () => {
    state.employee = null;
    const res = await POST(
      postReq({ amount_cents: 2500, reason: 'goodwill' }),
      params
    );
    expect(res.status).toBe(401);
    expect(createCalls.length).toBe(0);
    expect(auditCalls.length).toBe(0);
  });

  it('returns 403 when permission denied', async () => {
    state.permissionDenied = NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
    const res = await POST(
      postReq({ amount_cents: 2500, reason: 'goodwill' }),
      params
    );
    expect(res.status).toBe(403);
    expect(createCalls.length).toBe(0);
    expect(auditCalls.length).toBe(0);
  });

  it('returns 400 on negative or zero amount_cents', async () => {
    let res = await POST(
      postReq({ amount_cents: 0, reason: 'goodwill' }),
      params
    );
    expect(res.status).toBe(400);
    res = await POST(
      postReq({ amount_cents: -500, reason: 'goodwill' }),
      params
    );
    expect(res.status).toBe(400);
    expect(createCalls.length).toBe(0);
  });

  it('returns 400 on non-integer amount_cents', async () => {
    const res = await POST(
      postReq({ amount_cents: 25.5, reason: 'goodwill' }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing or invalid reason', async () => {
    let res = await POST(postReq({ amount_cents: 2500 }), params);
    expect(res.status).toBe(400);
    res = await POST(
      postReq({ amount_cents: 2500, reason: 'cancellation_refund' }),
      params
    );
    // cancellation_refund is reserved for the cancel flow, not manual issuance.
    expect(res.status).toBe(400);
  });

  it('passes through optional expires_at when provided', async () => {
    const expiresAt = new Date('2026-12-31T23:59:59Z').toISOString();
    const res = await POST(
      postReq({
        amount_cents: 2500,
        reason: 'promotional',
        expires_at: expiresAt,
      }),
      params
    );
    expect(res.status).toBe(201);
    expect(createCalls[0]!.expires_at).toBe(expiresAt);
  });
});

describe('GET /api/admin/customers/[id]/credits', () => {
  it('returns balance for authenticated employee', async () => {
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { available_balance_cents: number };
    expect(json.available_balance_cents).toBe(3000);
  });

  it('returns 401 when no session', async () => {
    state.employee = null;
    const res = await GET(getReq(), params);
    expect(res.status).toBe(401);
  });

  it('returns 500 when repository throws', async () => {
    state.balanceError = new Error('db boom');
    const res = await GET(getReq(), params);
    expect(res.status).toBe(500);
  });
});
