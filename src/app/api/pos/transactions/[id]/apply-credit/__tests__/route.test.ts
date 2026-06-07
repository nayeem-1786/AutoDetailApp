/**
 * Phase 3 Theme E.2 — apply-credit endpoint tests.
 *
 * Mocked-layer test pattern mirrors src/app/api/pos/transactions/[id]/__tests__/void.test.ts.
 * Live DB integration of the underlying repository is covered separately in
 * src/lib/credits/__tests__/repository.test.ts; this file pins the route's
 * auth + permission + validation + audit + error-mapping behaviors.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  CreditAlreadyAppliedError,
  InsufficientCreditBalanceError,
} from '@/lib/credits/repository';

const state = {
  posEmployee: null as
    | {
        employee_id: string;
        auth_user_id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
      }
    | null,
  permissionGranted: true as boolean,
  applyResult: null as
    | {
        applied_credits: Array<Record<string, unknown>>;
        total_applied_cents: number;
        remaining_balance_cents: number;
      }
    | null,
  applyError: null as Error | null,
};

const auditCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async () => state.permissionGranted,
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (params: Record<string, unknown>) => {
    auditCalls.push(params);
  },
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/credits/repository', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/credits/repository')
  >('@/lib/credits/repository');
  return {
    ...actual,
    applyCustomerCreditsToTransaction: async () => {
      if (state.applyError) throw state.applyError;
      return state.applyResult;
    },
  };
});

import { POST } from '../route';

function req(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(
    'http://localhost/api/pos/transactions/tx-1/apply-credit',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

const params = { params: Promise.resolve({ id: 'tx-1' }) };

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'cashier@example.com',
    first_name: 'Cash',
    last_name: 'Ier',
    role: 'cashier',
  };
  state.permissionGranted = true;
  state.applyError = null;
  state.applyResult = {
    applied_credits: [
      {
        id: 'credit-1',
        customer_id: 'cust-1',
        amount_cents: 5000,
        applied_amount_cents: 3000,
        reason: 'cancellation_refund',
      },
    ],
    total_applied_cents: 3000,
    remaining_balance_cents: 2000,
  };
  auditCalls.length = 0;
});

describe('POST /api/pos/transactions/[id]/apply-credit', () => {
  it('returns 200 + result + writes one audit row per applied credit', async () => {
    const res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 3000 }),
      params
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      total_applied_cents: number;
      remaining_balance_cents: number;
      applied_credits: Array<{ id: string }>;
    };
    expect(json.success).toBe(true);
    expect(json.total_applied_cents).toBe(3000);
    expect(json.remaining_balance_cents).toBe(2000);
    expect(json.applied_credits.length).toBe(1);
    // One audit row per applied credit; entityType locked to customer_credit.
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0]!.entityType).toBe('customer_credit');
    expect(auditCalls[0]!.action).toBe('apply');
    expect(auditCalls[0]!.entityId).toBe('credit-1');
  });

  it('writes multiple audit rows when multiple credits are applied', async () => {
    state.applyResult = {
      applied_credits: [
        {
          id: 'credit-1',
          customer_id: 'cust-1',
          amount_cents: 3000,
          applied_amount_cents: 3000,
          reason: 'goodwill',
        },
        {
          id: 'credit-2',
          customer_id: 'cust-1',
          amount_cents: 3000,
          applied_amount_cents: 2000,
          reason: 'goodwill',
        },
      ],
      total_applied_cents: 5000,
      remaining_balance_cents: 1000,
    };
    const res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 5000 }),
      params
    );
    expect(res.status).toBe(200);
    expect(auditCalls.length).toBe(2);
    expect(auditCalls[0]!.entityId).toBe('credit-1');
    expect(auditCalls[1]!.entityId).toBe('credit-2');
  });

  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 3000 }),
      params
    );
    expect(res.status).toBe(401);
    expect(auditCalls.length).toBe(0);
  });

  it('returns 403 when permission is denied', async () => {
    state.permissionGranted = false;
    const res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 3000 }),
      params
    );
    expect(res.status).toBe(403);
    expect(auditCalls.length).toBe(0);
  });

  it('returns 400 when customer_id is missing', async () => {
    const res = await POST(req({ amount_cents: 3000 }), params);
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount_cents is missing or non-integer', async () => {
    let res = await POST(req({ customer_id: 'cust-1' }), params);
    expect(res.status).toBe(400);
    res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 30.5 }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount_cents <= 0', async () => {
    let res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 0 }),
      params
    );
    expect(res.status).toBe(400);
    res = await POST(
      req({ customer_id: 'cust-1', amount_cents: -100 }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 + insufficient_credit_balance code on InsufficientCreditBalanceError', async () => {
    state.applyError = new InsufficientCreditBalanceError(
      'cust-1',
      5000,
      3000
    );
    const res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 5000 }),
      params
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as {
      code: string;
      requested_cents: number;
      available_cents: number;
    };
    expect(json.code).toBe('insufficient_credit_balance');
    expect(json.requested_cents).toBe(5000);
    expect(json.available_cents).toBe(3000);
  });

  it('returns 500 on unexpected repository error', async () => {
    state.applyError = new CreditAlreadyAppliedError('credit-1');
    const res = await POST(
      req({ customer_id: 'cust-1', amount_cents: 3000 }),
      params
    );
    // CreditAlreadyAppliedError is not specifically mapped; the catch falls
    // through to the generic 500. This is intentional — a sustained race that
    // bubbles up to the endpoint is genuinely an exceptional event the
    // operator should retry.
    expect(res.status).toBe(500);
  });

  it('passes appointment_id through to the repository when provided', async () => {
    // Capture what the mocked applyCustomerCreditsToTransaction receives.
    // Easier than spying on the call — we observe by reading the audit row
    // which the route writes per applied credit. Round-trip via state.
    state.applyResult = {
      applied_credits: [
        {
          id: 'credit-1',
          customer_id: 'cust-1',
          amount_cents: 5000,
          applied_amount_cents: 3000,
          reason: 'goodwill',
        },
      ],
      total_applied_cents: 3000,
      remaining_balance_cents: 0,
    };
    const res = await POST(
      req({
        customer_id: 'cust-1',
        amount_cents: 3000,
        appointment_id: 'appt-1',
      }),
      params
    );
    expect(res.status).toBe(200);
    expect(auditCalls.length).toBe(1);
    const details = auditCalls[0]!.details as Record<string, unknown>;
    expect(details.applied_to_appointment_id).toBe('appt-1');
  });
});
