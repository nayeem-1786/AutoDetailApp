/**
 * Q2 — Close-out loyalty overspend detection (observational).
 *
 * Integration pins for the wiring in `api/pos/transactions/route.ts` (the pure
 * decision logic is locked in
 * `src/lib/loyalty/__tests__/redemption-guard.test.ts`):
 *   1. redemption EXCEEDING the live balance (the double-spend signature) →
 *      a `loyalty_overspend_detected` audit_log row is written, and close-out
 *      STILL succeeds (observational, not enforcement — the existing
 *      Math.max(0, ...) clamp is unchanged).
 *   2. redemption within the live balance → NO overspend audit_log row.
 *   3. balance drained to 0 between booking and close-out → overspend flagged
 *      with delta == full redeemed amount.
 *
 * The balance debit is NOT moved or blocked here — the structural fix is
 * deferred to Option A Phase 3. This makes the previously-silent over-
 * redemption queryable. See
 * docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md Q2 follow-up.
 *
 * Harness mirrors `auto-receipt-interlock.test.ts` (the proven transactions-
 * route mock shape).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface AuditLogRow {
  action: string;
  entity_type: string;
  entity_id: string;
  source: string;
  details: Record<string, unknown>;
}

const recorder = {
  auditLogInserts: [] as AuditLogRow[],
};

const state = {
  balance: 100,
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
vi.mock('@/lib/pos/check-permission', () => ({ checkPosPermission: async () => true }));
// Only LOYALTY_REWARDS is read in this route; enabling it runs the loyalty block.
vi.mock('@/lib/utils/feature-flags', () => ({ isFeatureEnabled: async () => true }));
vi.mock('@/lib/qbo/settings', () => ({
  isQboSyncEnabled: async () => false,
  getQboSetting: async () => null,
}));
vi.mock('@/lib/qbo/sync-transaction', () => ({ syncTransactionToQbo: async () => {} }));
vi.mock('@/lib/utils/receipt-number', () => ({
  generateReceiptNumber: vi.fn(async () => 'SD-TEST-10001'),
}));
vi.mock('@/lib/services/audit', () => ({ logAudit: async () => {}, getRequestIp: () => '127.0.0.1' }));
vi.mock('@/lib/utils/sms', () => ({ sendSms: async () => ({ success: true, sid: 'SM-test' }) }));
vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: async (_slug: string, _vars: unknown, fallback: string) => ({
    body: fallback,
    isActive: true,
    canSilence: true,
    recipientType: 'customer' as const,
    recipientPhones: null,
  }),
}));
vi.mock('@/lib/sms/composites', () => ({ buildTransactionGreeting: () => 'Hi' }));
vi.mock('@/lib/utils/short-link', () => ({
  createShortLink: async (url: string) => `https://short/${url.length}`,
}));
vi.mock('@/lib/utils/vehicle-helpers', () => ({
  cleanVehicleDescription: () => 'veh',
}));
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({
    name: 'Smart Details',
    phone: '+15551234567',
    address: '123 Main St',
    email: 'hi@example.com',
    logo_url: null,
  }),
}));
vi.mock('@/lib/utils/stock-adjustments', () => ({ logStockAdjustment: async () => {} }));
vi.mock('@/lib/utils/validation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/validation')>(
    '@/lib/utils/validation'
  );
  return actual;
});
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }));

type ChainCtx = { table: string; op: 'select' | 'insert' | 'update' | null; payload?: unknown };

function makeBuilder(table: string): unknown {
  const ctx: ChainCtx = { table, op: null };

  async function resolve(): Promise<{ data: unknown; error: unknown }> {
    if (ctx.op === 'select') {
      if (table === 'customers') {
        return {
          data: {
            loyalty_points_balance: state.balance,
            phone: '+15558881111',
            first_name: 'Sarah',
            last_name: 'K',
            email: 's@example.com',
          },
          error: null,
        };
      }
      if (table === 'products') return { data: null, error: null };
      if (table === 'transactions') {
        return { data: { status: 'completed', loyalty_points_earned: 0 }, error: null };
      }
      if (table === 'employees') return { data: { id: 'emp-1', role: 'cashier' }, error: null };
      if (table === 'messages') return { data: null, error: null };
      return { data: null, error: null };
    }
    if (ctx.op === 'insert') {
      if (table === 'audit_log') {
        const payload = ctx.payload;
        if (Array.isArray(payload)) {
          for (const p of payload) recorder.auditLogInserts.push(p as AuditLogRow);
        } else if (payload) {
          recorder.auditLogInserts.push(payload as AuditLogRow);
        }
        return { data: null, error: null };
      }
      if (table === 'transactions') {
        return {
          data: {
            id: 'tx-q2-co',
            appointment_id: 'appt-q2-co',
            access_token: 'tok-1',
            receipt_number: 'SD-001',
            status: 'completed',
            loyalty_points_earned: 0,
            total_amount: 100,
            tip_amount: 0,
          },
          error: null,
        };
      }
      // loyalty_ledger, transaction_items, etc. — benign.
      return { data: null, error: null };
    }
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
    delete: () => {
      ctx.op = 'update';
      return builder;
    },
    eq: () => builder,
    neq: () => builder,
    is: () => builder,
    in: () => builder,
    contains: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    or: () => builder,
    not: () => builder,
    gte: () => builder,
    lte: () => builder,
    gt: () => builder,
    lt: () => builder,
    ilike: () => builder,
    like: () => builder,
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

function makeRequest(loyaltyPointsRedeemed: number): NextRequest {
  const body: Record<string, unknown> = {
    customer_id: '11111111-1111-4111-8111-111111111111',
    payment_method: 'cash',
    items: [
      {
        item_type: 'product',
        item_name: 'Test Product',
        quantity: 1,
        unit_price: 100,
        total_price: 100,
        tax_amount: 0,
        is_taxable: false,
      },
    ],
    subtotal: 100,
    tax_amount: 0,
    tip_amount: 0,
    discount_amount: 0,
    total_amount: 100,
    loyalty_points_redeemed: loyaltyPointsRedeemed,
    loyalty_discount: 0,
    payments: [{ method: 'cash', amount: 100 }],
  };
  return new NextRequest('http://localhost/api/pos/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

import { POST } from '../route';

function overspendRows(): AuditLogRow[] {
  return recorder.auditLogInserts.filter((r) => r.action === 'loyalty_overspend_detected');
}

beforeEach(() => {
  recorder.auditLogInserts = [];
  state.balance = 100;
  vi.useFakeTimers(); // auto-receipt setTimeout registers but never fires (not advanced)
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Q2 close-out — loyalty overspend detection', () => {
  it('redemption EXCEEDING balance → audit_log row written, close-out still succeeds', async () => {
    state.balance = 50;
    const res = await POST(makeRequest(120));
    expect(res.status).toBeLessThan(400); // close-out NOT blocked

    const rows = overspendRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.entity_type).toBe('transaction');
    expect(row.entity_id).toBe('tx-q2-co');
    expect(row.source).toBe('system');
    expect(row.details).toMatchObject({
      customer_id: '11111111-1111-4111-8111-111111111111',
      appointment_id: 'appt-q2-co',
      requested_points: 120,
      available_balance: 50,
      overspend_delta: 70,
    });
    expect(row.details.detected_at).toBeDefined();
  });

  it('redemption within balance → no overspend audit_log row', async () => {
    state.balance = 200;
    const res = await POST(makeRequest(120));
    expect(res.status).toBeLessThan(400);
    expect(overspendRows()).toHaveLength(0);
  });

  it('redemption EXACTLY equal to balance → no overspend row (boundary)', async () => {
    state.balance = 120;
    const res = await POST(makeRequest(120));
    expect(res.status).toBeLessThan(400);
    expect(overspendRows()).toHaveLength(0);
  });

  it('balance drained to 0 between booking and close-out → full-amount overspend flagged', async () => {
    // The canonical double-spend: the first appointment closed out (balance now
    // 0); the second close-out still carries its booking-time redemption.
    state.balance = 0;
    const res = await POST(makeRequest(50));
    expect(res.status).toBeLessThan(400);

    const rows = overspendRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toMatchObject({
      requested_points: 50,
      available_balance: 0,
      overspend_delta: 50,
    });
  });
});
