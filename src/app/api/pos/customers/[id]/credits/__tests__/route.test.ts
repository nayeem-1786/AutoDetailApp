/**
 * Phase 3 Theme E.3 follow-up — POS-auth variant of the admin
 * customer-credits GET endpoint.
 *
 * Tests the route-layer responsibilities:
 *   - POS auth gate (401 ONLY when `authenticatePosRequest` returns null —
 *     regression guard for the credit-loop bug where the admin endpoint's
 *     401 trapped the operator in a login loop on JobDetail mount)
 *   - Repository-helper delegation (200 with `CustomerCreditBalance` shape)
 *   - Graceful error fallback (200 with empty balance — mirrors D.2's pattern;
 *     never surfaces a 5xx that would trap the badge/dialog)
 *   - Payload-shape parity with the admin endpoint (same repository helper,
 *     same response shape — both routes are byte-symmetric clients of
 *     `getCustomerCreditBalance`)
 *
 * The underlying balance derivation (`getCustomerCreditBalance`) is integration-
 * tested elsewhere (live-DB integration tests in src/lib/credits); this file
 * tests only the route-layer auth + shape contract.
 *
 * Parallel structure:
 *   - src/app/api/admin/settings/cancellation-fee-default/__tests__/route.test.ts
 *     (D.2 admin variant — the test-shape precedent this file mirrors)
 *   - src/app/api/admin/customers/[id]/credits/__tests__/route.test.ts
 *     (admin variant — the byte-symmetric sibling on the other auth surface)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { CustomerCreditBalance } from '@/lib/credits/types';

const VALID_POS_EMPLOYEE = {
  employee_id: 'emp-1',
  auth_user_id: 'user-1',
  role: 'admin',
  first_name: 'Test',
  last_name: 'Operator',
  email: 'op@example.com',
};

const state = {
  posEmployee: VALID_POS_EMPLOYEE as null | typeof VALID_POS_EMPLOYEE,
  helperResult: {
    customer_id: 'cust-1',
    total_issued_cents: 5000,
    total_applied_cents: 2000,
    available_balance_cents: 3000,
    unapplied_credits: [],
  } as CustomerCreditBalance,
  helperShouldThrow: null as null | string,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/credits/repository', () => ({
  getCustomerCreditBalance: async (): Promise<CustomerCreditBalance> => {
    if (state.helperShouldThrow) {
      throw new Error(state.helperShouldThrow);
    }
    return state.helperResult;
  },
}));

import { GET } from '../route';

beforeEach(() => {
  state.posEmployee = VALID_POS_EMPLOYEE;
  state.helperResult = {
    customer_id: 'cust-1',
    total_issued_cents: 5000,
    total_applied_cents: 2000,
    available_balance_cents: 3000,
    unapplied_credits: [],
  };
  state.helperShouldThrow = null;
});

function makeRequest(): NextRequest {
  return {
    headers: { get: () => null },
    url: 'http://localhost/api/pos/customers/cust-1/credits',
  } as unknown as NextRequest;
}

const PARAMS = () => Promise.resolve({ id: 'cust-1' });

describe('GET /api/pos/customers/[id]/credits', () => {
  it('returns 401 when authenticatePosRequest returns null (regression guard for the credit-loop bug)', async () => {
    state.posEmployee = null;
    const res = await GET(makeRequest(), { params: PARAMS() });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('returns the repository-helper balance on success', async () => {
    const res = await GET(makeRequest(), { params: PARAMS() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CustomerCreditBalance;
    expect(body).toEqual({
      customer_id: 'cust-1',
      total_issued_cents: 5000,
      total_applied_cents: 2000,
      available_balance_cents: 3000,
      unapplied_credits: [],
    });
  });

  it('returns zero balance on success when customer has no credits (steady state)', async () => {
    state.helperResult = {
      customer_id: 'cust-1',
      total_issued_cents: 0,
      total_applied_cents: 0,
      available_balance_cents: 0,
      unapplied_credits: [],
    };
    const res = await GET(makeRequest(), { params: PARAMS() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CustomerCreditBalance;
    expect(body.available_balance_cents).toBe(0);
    expect(body.unapplied_credits).toEqual([]);
  });

  it('returns 200 with empty CustomerCreditBalance on internal error (graceful — never traps badge/dialog)', async () => {
    state.helperShouldThrow = 'Supabase exploded';
    const res = await GET(makeRequest(), { params: PARAMS() });
    // Critical: a 5xx would surface as an error toast in the dialog AND would
    // not satisfy the badge's `if (!res.ok) return;` graceful path. The
    // empty-balance fallback mirrors D.2's parallel pattern at
    // /api/pos/settings/cancellation-fee-default (returns the safe default
    // rather than a 5xx).
    expect(res.status).toBe(200);
    const body = (await res.json()) as CustomerCreditBalance;
    expect(body).toEqual({
      customer_id: 'cust-1',
      total_issued_cents: 0,
      total_applied_cents: 0,
      available_balance_cents: 0,
      unapplied_credits: [],
    });
  });

  it('payload shape matches CustomerCreditBalance contract (parity with admin endpoint)', async () => {
    // Both the POS and admin endpoints delegate to the same repository helper
    // (`getCustomerCreditBalance`), so they return byte-symmetric responses
    // for the same customer. If the admin endpoint's response shape changes,
    // this test catches drift here too. The admin endpoint test at
    // src/app/api/admin/customers/[id]/credits/__tests__/route.test.ts
    // pins the same contract from the other side.
    const res = await GET(makeRequest(), { params: PARAMS() });
    const body = (await res.json()) as CustomerCreditBalance;
    expect(Object.keys(body).sort()).toEqual([
      'available_balance_cents',
      'customer_id',
      'total_applied_cents',
      'total_issued_cents',
      'unapplied_credits',
    ]);
  });
});
