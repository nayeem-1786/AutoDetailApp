/**
 * Phase 3 Theme D.2 (AC-14) — admin cancellation-fee-default GET endpoint tests.
 *
 * Verifies the endpoint's specific responsibilities:
 *   - Session auth (401 missing employee)
 *   - Returns the orchestrator-helper's value on success
 *   - Returns 0 on internal error (graceful — never blocks the dialog)
 *
 * The underlying read logic (`getDefaultCancellationFeeCents`) is tested in
 * `src/lib/appointments/__tests__/cancel-orchestration.test.ts`; this file
 * tests only the route layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  employee: {
    id: 'emp-1',
  } as null | { id: string },
  helperResult: 5000 as number | null,
  helperShouldThrow: null as null | string,
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/appointments/cancel-orchestration', () => ({
  getDefaultCancellationFeeCents: async () => {
    if (state.helperShouldThrow) {
      throw new Error(state.helperShouldThrow);
    }
    return state.helperResult ?? 0;
  },
}));

import { GET } from '../route';

beforeEach(() => {
  state.employee = { id: 'emp-1' };
  state.helperResult = 5000;
  state.helperShouldThrow = null;
});

function makeRequest(): NextRequest {
  return {
    headers: { get: () => null },
    url: 'http://localhost/api/admin/settings/cancellation-fee-default',
  } as unknown as NextRequest;
}

describe('GET /api/admin/settings/cancellation-fee-default', () => {
  it('returns 401 when no authenticated employee', async () => {
    state.employee = null;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns the configured default_cents on success', async () => {
    state.helperResult = 5000;
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { default_cents: number };
    expect(body.default_cents).toBe(5000);
  });

  it('returns 0 when the helper returns 0 (row missing / unconfigured)', async () => {
    state.helperResult = 0;
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { default_cents: number };
    expect(body.default_cents).toBe(0);
  });

  it('returns a different configured value when the operator has customized', async () => {
    state.helperResult = 12500;
    const res = await GET(makeRequest());
    const body = (await res.json()) as { default_cents: number };
    expect(body.default_cents).toBe(12500);
  });

  it('returns 200 with default_cents=0 on internal error (graceful, never blocks dialog)', async () => {
    state.helperShouldThrow = 'Supabase exploded';
    const res = await GET(makeRequest());
    // The endpoint catches its own error and returns the safe default so the
    // dialog can still open. Strict 5xx would block the cancel UX entirely.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { default_cents: number };
    expect(body.default_cents).toBe(0);
  });
});
