import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────────
// Test harness for the auto-receipt setTimeout status interlock (Session 42X-1, Phase 4 D).
//
// The interlock lives inside POST handler in src/app/api/pos/transactions/route.ts at
// lines 448-559. We mock the entire collaborator surface, drive POST through to the
// setTimeout schedule, advance fake timers by 30s, and assert the setTimeout body's
// branching:
//   - voided / refunded / partial_refund → audit_log insert + skip send
//   - completed / open → SMS send proceeds (no audit_log skip row)
//   - txRefresh returns null → skip send + audit_log row with original_status='not_found'
// ──────────────────────────────────────────────────────────────────────────────

interface AuditLogRow { action: string; entity_type: string; entity_id: string; source: string; details: Record<string, unknown> }
interface MessageInsert { conversation_id?: string; body: string; metadata?: Record<string, unknown> }
interface RenderInvocation { slug: string; vars: Record<string, string | undefined> }

const recorder = {
  auditLogInserts: [] as AuditLogRow[],
  smsSendCalls: [] as Array<{ to: string; body: string }>,
  messagesInserts: [] as MessageInsert[],
  renderInvocations: [] as RenderInvocation[],
};

const state = {
  txStatus: 'completed' as 'open' | 'completed' | 'voided' | 'refunded' | 'partial_refund',
  txRefreshReturnsNull: false,
  alreadySent: null as { id: string } | null,
  loyaltyPointsEarned: 0,
  vehicleAttached: true,
};

// ───── Mocks ─────────────────────────────────────────────────────────────────

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

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async () => true,
}));

vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: async () => false,
}));

vi.mock('@/lib/qbo/settings', () => ({
  isQboSyncEnabled: async () => false,
  getQboSetting: async () => null,
}));

vi.mock('@/lib/qbo/sync-transaction', () => ({
  syncTransactionToQbo: async () => {},
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: async () => {},
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/utils/sms', () => ({
  sendSms: async (to: string, body: string) => {
    recorder.smsSendCalls.push({ to, body });
    return { success: true, sid: 'SM-test' };
  },
}));

vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: async (slug: string, vars: Record<string, string | undefined>, fallback: string) => {
    recorder.renderInvocations.push({ slug, vars });
    return {
      body: fallback,
      isActive: true,
      canSilence: true,
      recipientType: 'customer' as const,
      recipientPhones: null,
    };
  },
}));

vi.mock('@/lib/utils/short-link', () => ({
  createShortLink: async (url: string) => `https://short/${url.length}`,
}));

vi.mock('@/lib/utils/vehicle-helpers', () => ({
  cleanVehicleDescription: (v: { year?: number; make?: string; model?: string }) =>
    [v.year, v.make, v.model].filter(Boolean).join(' '),
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

vi.mock('@/lib/utils/stock-adjustments', () => ({
  logStockAdjustment: async () => {},
}));

// Validation: pass-through (we control the request body shape directly)
vi.mock('@/lib/utils/validation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/validation')>('@/lib/utils/validation');
  return actual;
});

// The big one — admin client. Returns a chainable fake that records inserts and
// answers select queries based on `state` above.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminClient(),
}));

// Chainable query builder — recursively returns itself for builder calls
// (.select, .eq, .is, .in, .order, .limit, .contains, .update). Terminal calls
// (.single, .maybeSingle, await on the builder) resolve based on the table+context
// recorded during the chain. INSERT into audit_log/messages records to the recorder.
type ChainCtx = { table: string; op: 'select' | 'insert' | 'update' | null; payload?: unknown };

function makeBuilder(table: string): unknown {
  const ctx: ChainCtx = { table, op: null };

  async function resolve(): Promise<{ data: unknown; error: unknown }> {
    if (ctx.op === 'select') {
      if (table === 'transactions') {
        if (state.txRefreshReturnsNull) return { data: null, error: { message: 'not found' } };
        return {
          data: { status: state.txStatus, loyalty_points_earned: state.loyaltyPointsEarned },
          error: null,
        };
      }
      if (table === 'customers') return { data: { phone: '+15558881111', first_name: 'Sarah' }, error: null };
      if (table === 'vehicles') {
        return state.vehicleAttached
          ? { data: { year: 2024, make: 'Tesla', model: 'Model 3' }, error: null }
          : { data: null, error: null };
      }
      if (table === 'employees') return { data: { id: 'emp-1', role: 'cashier' }, error: null };
      if (table === 'messages') return { data: state.alreadySent, error: null };
      if (table === 'jobs') return { data: null, error: null };
      if (table === 'coupons') return { data: null, error: null };
      if (table === 'campaigns') return { data: null, error: null };
      if (table === 'business_settings') return { data: null, error: null };
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
      if (table === 'messages') {
        const payload = ctx.payload;
        if (Array.isArray(payload)) {
          for (const p of payload) recorder.messagesInserts.push(p as MessageInsert);
        } else if (payload) {
          recorder.messagesInserts.push(payload as MessageInsert);
        }
        return { data: null, error: null };
      }
      if (table === 'transactions') {
        return {
          data: {
            id: 'tx-1',
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
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: (_cols?: string) => { ctx.op = ctx.op || 'select'; return builder; },
    insert: (payload: unknown) => { ctx.op = 'insert'; ctx.payload = payload; return builder; },
    update: (payload: unknown) => { ctx.op = 'update'; ctx.payload = payload; return builder; },
    delete: () => { ctx.op = 'update'; return builder; },
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
    // PromiseLike — supports `await admin.from('x').insert(y)` directly
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

// ───── Test fixture: build a valid transaction-create POST request ───────────

function makeRequest(opts: { withVehicle?: boolean; withService?: boolean } = {}): NextRequest {
  const withVehicle = opts.withVehicle ?? true;
  const withService = opts.withService ?? false;
  const items: Array<Record<string, unknown>> = [
    {
      item_type: withService ? 'service' : 'product',
      item_name: withService ? 'Test Service' : 'Test Product',
      quantity: 1,
      unit_price: 100,
      total_price: 100,
      tax_amount: 0,
      is_taxable: false,
    },
  ];
  const body: Record<string, unknown> = {
    customer_id: '11111111-1111-4111-8111-111111111111',
    payment_method: 'cash',
    items,
    subtotal: 100,
    tax_amount: 0,
    tip_amount: 0,
    discount_amount: 0,
    total_amount: 100,
    payments: [{ method: 'cash', amount: 100 }],
  };
  if (withVehicle) {
    body.vehicle_id = '22222222-2222-4222-8222-222222222222';
  }
  return new NextRequest('http://localhost/api/pos/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Imported AFTER mocks
import { POST } from '../route';

beforeEach(() => {
  recorder.auditLogInserts = [];
  recorder.smsSendCalls = [];
  recorder.messagesInserts = [];
  recorder.renderInvocations = [];
  state.txStatus = 'completed';
  state.txRefreshReturnsNull = false;
  state.alreadySent = null;
  state.loyaltyPointsEarned = 0;
  state.vehicleAttached = true;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Auto-receipt status interlock (Session 42X-1, Phase 4 D)', () => {
  it('voided transaction → receipt skipped, audit_log row written with source=system', async () => {
    state.txStatus = 'voided';

    const res = await POST(makeRequest());
    expect(res.status).toBeLessThan(400);  // POST itself succeeds

    // Fire the setTimeout
    await vi.advanceTimersByTimeAsync(30_000);

    // No SMS sent
    expect(recorder.smsSendCalls).toHaveLength(0);

    // Audit log written
    expect(recorder.auditLogInserts).toHaveLength(1);
    const row = recorder.auditLogInserts[0];
    expect(row.action).toBe('auto_receipt_skipped');
    expect(row.entity_type).toBe('transaction');
    expect(row.entity_id).toBe('tx-1');
    expect(row.source).toBe('system');
    expect(row.details).toMatchObject({
      reason: 'auto_receipt_skipped_due_to_status_change',
      original_status: 'voided',
    });
    expect(row.details.skipped_at).toBeDefined();
  });

  it('refunded transaction → receipt skipped + audit_log row', async () => {
    state.txStatus = 'refunded';

    await POST(makeRequest());
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recorder.smsSendCalls).toHaveLength(0);
    expect(recorder.auditLogInserts).toHaveLength(1);
    expect(recorder.auditLogInserts[0].details.original_status).toBe('refunded');
  });

  it('partial_refund transaction → receipt skipped + audit_log row', async () => {
    state.txStatus = 'partial_refund';

    await POST(makeRequest());
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recorder.smsSendCalls).toHaveLength(0);
    expect(recorder.auditLogInserts).toHaveLength(1);
    expect(recorder.auditLogInserts[0].details.original_status).toBe('partial_refund');
  });

  it('txRefresh returns null (deleted transaction) → receipt skipped, audit_log original_status=not_found', async () => {
    state.txRefreshReturnsNull = true;

    await POST(makeRequest());
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recorder.smsSendCalls).toHaveLength(0);
    expect(recorder.auditLogInserts).toHaveLength(1);
    expect(recorder.auditLogInserts[0].details.original_status).toBe('not_found');
  });

  it('completed transaction → receipt SMS sends; no skip audit_log row', async () => {
    state.txStatus = 'completed';

    await POST(makeRequest());
    await vi.advanceTimersByTimeAsync(30_000);

    // SMS sent
    expect(recorder.smsSendCalls.length).toBeGreaterThanOrEqual(1);
    expect(recorder.smsSendCalls[0].to).toBe('+15558881111');

    // No skip-audit-log row
    const skipRows = recorder.auditLogInserts.filter((r) => r.action === 'auto_receipt_skipped');
    expect(skipRows).toHaveLength(0);
  });

  it('open transaction (e.g. partial-pay state) → receipt sends; status not in skip list', async () => {
    state.txStatus = 'open';

    await POST(makeRequest());
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recorder.smsSendCalls.length).toBeGreaterThanOrEqual(1);
    const skipRows = recorder.auditLogInserts.filter((r) => r.action === 'auto_receipt_skipped');
    expect(skipRows).toHaveLength(0);
  });

  it('dedup short-circuits BEFORE status interlock (no audit_log row when receipt already sent)', async () => {
    state.alreadySent = { id: 'msg-existing' };
    state.txStatus = 'voided';  // would trip the interlock if dedup didn't fire first

    await POST(makeRequest());
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recorder.smsSendCalls).toHaveLength(0);
    // Critically: NO audit_log skip row, because dedup returned before status check ran
    const skipRows = recorder.auditLogInserts.filter((r) => r.action === 'auto_receipt_skipped');
    expect(skipRows).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Session 42AB: payment_receipt composite-chip contract
//
// The chip body is now "Thank you {first_name}! {transaction_greeting} View your
// receipt: {receipt_link}\n\n{business_name}" with 4 required vars. The template
// no longer fabricates prose around {vehicle_description}; the caller assembles
// {transaction_greeting} as a complete grammatical sentence in all 3 states
// (services+vehicle, services-only, product-only) plus optional loyalty suffix.
//
// vehicle_description and loyalty_points_earned are NO LONGER passed as vars —
// both have been folded into the caller-built {transaction_greeting} composite.
// This section locks the new contract via vars-shape assertions plus body-prose
// regression checks.
// ──────────────────────────────────────────────────────────────────────────────

function getPaymentReceiptVars() {
  const call = recorder.renderInvocations.find((i) => i.slug === 'payment_receipt');
  expect(call).toBeDefined();
  return call!.vars;
}

describe('Auto-receipt payment_receipt composite-chip contract (Session 42AB)', () => {
  it('product-only sale (no service items, no vehicle) → transaction_greeting = "We appreciate your purchase."', async () => {
    state.vehicleAttached = false;

    await POST(makeRequest({ withVehicle: false, withService: false }));
    await vi.advanceTimersByTimeAsync(30_000);

    const vars = getPaymentReceiptVars();
    expect(vars.transaction_greeting).toBe('We appreciate your purchase.');
  });

  it('service sale with vehicle → transaction_greeting = "Your <year make model> is all set."', async () => {
    state.vehicleAttached = true;

    await POST(makeRequest({ withVehicle: true, withService: true }));
    await vi.advanceTimersByTimeAsync(30_000);

    const vars = getPaymentReceiptVars();
    expect(vars.transaction_greeting).toBe('Your 2024 Tesla Model 3 is all set.');
  });

  it('service sale without vehicle → transaction_greeting = "Your service is complete."', async () => {
    state.vehicleAttached = false;

    await POST(makeRequest({ withVehicle: false, withService: true }));
    await vi.advanceTimersByTimeAsync(30_000);

    const vars = getPaymentReceiptVars();
    expect(vars.transaction_greeting).toBe('Your service is complete.');
  });

  it('loyalty points earned → " You earned X loyalty points today." appended to greeting', async () => {
    state.vehicleAttached = true;
    state.loyaltyPointsEarned = 23;

    await POST(makeRequest({ withVehicle: true, withService: true }));
    await vi.advanceTimersByTimeAsync(30_000);

    const vars = getPaymentReceiptVars();
    expect(vars.transaction_greeting).toBe('Your 2024 Tesla Model 3 is all set. You earned 23 loyalty points today.');
  });

  it('zero loyalty points → no loyalty suffix appended', async () => {
    state.vehicleAttached = true;
    state.loyaltyPointsEarned = 0;

    await POST(makeRequest({ withVehicle: true, withService: true }));
    await vi.advanceTimersByTimeAsync(30_000);

    const vars = getPaymentReceiptVars();
    expect(vars.transaction_greeting).not.toContain('loyalty points');
    expect(vars.transaction_greeting).toBe('Your 2024 Tesla Model 3 is all set.');
  });

  it('vars contract: exactly 4 keys (first_name, transaction_greeting, receipt_link, business_name); no vehicle_description or loyalty_points_earned', async () => {
    await POST(makeRequest({ withVehicle: true, withService: true }));
    await vi.advanceTimersByTimeAsync(30_000);

    const vars = getPaymentReceiptVars();
    expect(Object.keys(vars).sort()).toEqual([
      'business_name',
      'first_name',
      'receipt_link',
      'transaction_greeting',
    ]);
    // Removed by 42AB — folded into composite {transaction_greeting}
    expect(vars).not.toHaveProperty('vehicle_description');
    expect(vars).not.toHaveProperty('loyalty_points_earned');
  });

  it('first_name defaults to "there" when customer record has no first_name (defensive — engine would otherwise hard-skip)', async () => {
    // The mocked customer always returns first_name='Sarah', so this test mainly
    // documents the caller-side default that prevents hard-skip on missing names.
    // The actual default kicks in when cust.first_name is null/empty — covered by
    // the `cust.first_name || 'there'` expression in the route. We assert the var
    // is always non-empty regardless.
    await POST(makeRequest({ withVehicle: true, withService: true }));
    await vi.advanceTimersByTimeAsync(30_000);

    const vars = getPaymentReceiptVars();
    expect(vars.first_name).toBeTruthy();
    expect(vars.first_name!.length).toBeGreaterThan(0);
  });

  it('regression: auto-receipt SMS body never contains the "your your" double-noun signature (SD-006223 origin)', async () => {
    state.vehicleAttached = false;

    await POST(makeRequest({ withVehicle: false, withService: false }));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recorder.smsSendCalls.length).toBeGreaterThanOrEqual(1);
    const body = recorder.smsSendCalls[0].body;
    expect(body.toLowerCase()).not.toContain('your your');
    // Defensive: also catch the original "Your  is all set." double-space artifact
    expect(body).not.toMatch(/Your\s{2,}is all set/);
  });

  it('regression: product-only sale body has no orphan punctuation or double spaces from the new composite', async () => {
    state.vehicleAttached = false;

    await POST(makeRequest({ withVehicle: false, withService: false }));
    await vi.advanceTimersByTimeAsync(30_000);

    const body = recorder.smsSendCalls[0].body;
    // Disaster-recovery fallback path (engine returns fallback when template missing) —
    // the test mock always returns the fallback as body. Validate it's clean.
    expect(body).toContain('We appreciate your purchase.');
    expect(body).not.toMatch(/  /); // no double spaces
    expect(body).not.toMatch(/[!?.] [.?!]/); // no orphan punctuation pairs
  });
});

