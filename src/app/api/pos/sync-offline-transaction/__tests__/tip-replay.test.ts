/**
 * Item 4 / 4a-cash — offline cash-tip replay (Session #165).
 *
 * Locked decision #8 / Appendix A bug #2 ("Data loss"): a cash tip captured
 * while offline must survive the sync replay. The client-side queue payload is
 * covered by cash-payment-tip-capture.test.tsx (UAT#4); THIS file covers the
 * second, higher-risk half — the route re-reading body.tip_amount and writing
 * it at BOTH grains (transaction + payment row, with tip_net = tip_amount for
 * cash). Before this slice the route re-hardcoded tip_amount: 0 on replay.
 *
 * Harness mirrors the proven transactions-route mock shape
 * (transactions/__tests__/loyalty-overspend-detection.test.ts): mock
 * authenticatePosRequest + createAdminClient via a chainable builder that
 * captures .insert() payloads per table.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const recorder = {
  transactionsInsert: null as Record<string, unknown> | null,
  paymentsInsert: null as Record<string, unknown> | null,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => ({
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'cash@example.com',
    role: 'cashier',
    first_name: 'Cash',
    last_name: 'Ier',
  }),
}));
vi.mock('@/lib/utils/feature-flags', () => ({ isFeatureEnabled: async () => false }));
vi.mock('@/lib/qbo/settings', () => ({
  isQboSyncEnabled: async () => false,
  getQboSetting: async () => null,
}));
vi.mock('@/lib/qbo/sync-transaction', () => ({ syncTransactionToQbo: async () => {} }));
vi.mock('@/lib/utils/stock-adjustments', () => ({ logStockAdjustment: async () => {} }));
vi.mock('@/lib/utils/receipt-number', () => ({
  generateReceiptNumber: async () => 'SD-TEST-OFFLINE',
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }));

type ChainCtx = { table: string; op: 'select' | 'insert' | 'update' | null; payload?: unknown };

function makeBuilder(table: string): unknown {
  const ctx: ChainCtx = { table, op: null };

  async function resolve(): Promise<{ data: unknown; error: unknown }> {
    if (ctx.op === 'insert') {
      if (table === 'transactions') {
        recorder.transactionsInsert = ctx.payload as Record<string, unknown>;
        return {
          data: { id: 'tx-offline-1', status: 'completed', receipt_number: 'SD-TEST-OFFLINE' },
          error: null,
        };
      }
      if (table === 'payments') {
        recorder.paymentsInsert = ctx.payload as Record<string, unknown>;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    // select / update / idempotency lookup — all benign (no prior synced row).
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => {
      ctx.op = ctx.op || 'select';
      return builder;
    },
    insert: (payload: unknown) => {
      ctx.op = 'insert';
      ctx.payload = payload;
      return builder;
    },
    update: (payload: unknown) => {
      ctx.op = 'update';
      ctx.payload = payload;
      return builder;
    },
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => resolve(),
    maybeSingle: async () => resolve(),
    then: (onfulfilled: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
      resolve().then(onfulfilled, onrejected),
  };

  return builder;
}

function makeAdminClient() {
  return {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => makeBuilder(table),
  };
}

function makeRequest(tip: number | undefined): NextRequest {
  const body: Record<string, unknown> = {
    id: 'offline-test-1',
    customer_id: null,
    vehicle_id: null,
    subtotal: 40,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: 40,
    items: [],
    cash_tendered: 50,
    cash_change: 10,
  };
  if (tip !== undefined) body.tip_amount = tip;
  return new NextRequest('http://localhost/api/pos/sync-offline-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

import { POST } from '../route';

beforeEach(() => {
  recorder.transactionsInsert = null;
  recorder.paymentsInsert = null;
});
afterEach(() => vi.clearAllMocks());

describe('sync-offline-transaction — cash tip replay (Item 4 / 4a-cash)', () => {
  it('persists a queued tip at both grains; tip_net = gross; change excludes the tip', async () => {
    const res = await POST(makeRequest(5));
    expect(res.status).toBe(201);

    // Transaction grain
    expect(recorder.transactionsInsert?.tip_amount).toBe(5);
    // Payment-row grain — cash takes no CC-fee deduction, so tip_net = tip_amount
    expect(recorder.paymentsInsert?.tip_amount).toBe(5);
    expect(recorder.paymentsInsert?.tip_net).toBe(5);
    // Locked change-math decision #7: change is service-total - tendered (50-40),
    // NOT (service total + tip). amount stays the service total.
    expect(recorder.paymentsInsert?.amount).toBe(40);
    expect(recorder.paymentsInsert?.change_given).toBe(10);
  });

  it('defaults a missing tip_amount to 0 (legacy records queued before the field existed)', async () => {
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(201);
    expect(recorder.transactionsInsert?.tip_amount).toBe(0);
    expect(recorder.paymentsInsert?.tip_amount).toBe(0);
    expect(recorder.paymentsInsert?.tip_net).toBe(0);
  });

  it('clamps a negative/garbage tip_amount to 0 at both grains', async () => {
    const res = await POST(makeRequest(-3));
    expect(res.status).toBe(201);
    expect(recorder.transactionsInsert?.tip_amount).toBe(0);
    expect(recorder.paymentsInsert?.tip_amount).toBe(0);
    expect(recorder.paymentsInsert?.tip_net).toBe(0);
  });
});
