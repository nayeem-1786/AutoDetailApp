import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────────
// Regression test for Session 42X-1-followup: caller-side 'your vehicle' literal
// at src/app/api/pos/jobs/[id]/complete/route.ts:246. The job_complete chip call
// previously passed `vehicleDisplay` (which fell back to the literal 'your vehicle')
// — same bug class as the auto-receipt incident SD-006223.
//
// Post-fix: line 249 reads `vehicle_description: vehicleMakeModel || ''`, leaving
// `vehicleDisplay` (line 233) intact for the disaster-recovery `smsFallback` string.
// ──────────────────────────────────────────────────────────────────────────────

interface RenderInvocation { slug: string; vars: Record<string, string | undefined> }

const recorder = {
  renderInvocations: [] as RenderInvocation[],
  smsSendCalls: [] as Array<{ to: string; body: string }>,
};

const state = {
  vehicleAttached: true,
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

vi.mock('@/lib/utils/sms', () => ({
  sendSms: async (to: string, body: string) => {
    recorder.smsSendCalls.push({ to, body });
    return { success: true, sid: 'SM-test' };
  },
}));

vi.mock('@/lib/utils/email', () => ({
  sendEmail: async () => ({ success: true, id: 'em-test' }),
}));

vi.mock('@/lib/email/send-templated-email', () => ({
  sendTemplatedEmail: async () => ({ success: true, id: 'em-templated' }),
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

vi.mock('@/lib/data/business-hours', () => ({
  getBusinessHours: async () => null,
}));

vi.mock('@/lib/utils/short-link', () => ({
  createShortLink: async (url: string) => `https://short/${url.length}`,
}));

vi.mock('@/lib/utils/format', () => ({
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: async () => {},
  getRequestIp: () => '127.0.0.1',
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

// Chainable Supabase admin client mock — same pattern as auto-receipt-interlock.test.ts
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminClient(),
}));

function makeAdminClient() {
  return {
    from: (table: string) => makeBuilder(table),
  };
}

type ChainCtx = { table: string; op: 'select' | 'insert' | 'update' | null; payload?: unknown };

function makeBuilder(table: string): unknown {
  const ctx: ChainCtx = { table, op: null };

  async function resolve(): Promise<{ data: unknown; error: unknown }> {
    // Both select(...) and update(...).select(...) chains end in .single() — return
    // the job row regardless of op so update-returning works the same as a pure select.
    if (table === 'jobs') {
      const jobRow = {
        id: 'job-1',
        status: 'in_progress',
        timer_seconds: 60,
        work_started_at: null,
        timer_paused_at: null,
        customer: {
          id: 'cust-1',
          first_name: 'Sarah',
          last_name: 'Smith',
          phone: '+15558881111',
          email: 'sarah@example.com',
        },
        vehicle: state.vehicleAttached
          ? { id: 'veh-1', year: 2024, make: 'Tesla', model: 'Model 3', color: 'White' }
          : null,
        // Route uses BOTH `assigned_staff` (line 100) and `assigned_employee` aliases
        // depending on the query. The first SELECT (line 41) uses `assigned_employee`;
        // the UPDATE-RETURNING SELECT (line 100) uses `assigned_staff`. Provide both.
        assigned_employee: { id: 'emp-1', first_name: 'Mike' },
        assigned_staff: { id: 'emp-1', first_name: 'Mike', last_name: 'D' },
        addons: [],
      };
      return { data: jobRow, error: null };
    }
    if (table === 'job_photos') {
      return { data: [], error: null };
    }
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: (_cols?: string) => { ctx.op = ctx.op || 'select'; return builder; },
    insert: (payload: unknown) => { ctx.op = 'insert'; ctx.payload = payload; return builder; },
    update: (payload: unknown) => { ctx.op = 'update'; ctx.payload = payload; return builder; },
    eq: () => builder,
    neq: () => builder,
    is: () => builder,
    in: () => builder,
    contains: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => resolve(),
    maybeSingle: async () => resolve(),
    then: (onfulfilled: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
      resolve().then(onfulfilled, onrejected),
  };

  return builder;
}

import { POST } from '../route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/pos/jobs/job-1/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

const ctx = { params: Promise.resolve({ id: 'job-1' }) };

beforeEach(() => {
  recorder.renderInvocations = [];
  recorder.smsSendCalls = [];
  state.vehicleAttached = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("job_complete vehicle_description caller-side literal (Session 42X-1-followup)", () => {
  it("passes empty string (not 'your vehicle' literal) when no vehicle attached to job", async () => {
    state.vehicleAttached = false;

    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBeLessThan(400);

    // Notification is fire-and-forget; let microtasks drain
    await new Promise((r) => setImmediate(r));

    const jobCompleteCall = recorder.renderInvocations.find((i) => i.slug === 'job_complete');
    expect(jobCompleteCall).toBeDefined();

    // The fix: caller now passes empty string; engine line-removal handles it.
    expect(jobCompleteCall!.vars.vehicle_description).toBe('');
    expect(jobCompleteCall!.vars.vehicle_description).not.toBe('your vehicle');
  });

  it("passes the real make+model (no year) when vehicle is attached", async () => {
    state.vehicleAttached = true;

    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBeLessThan(400);
    await new Promise((r) => setImmediate(r));

    const jobCompleteCall = recorder.renderInvocations.find((i) => i.slug === 'job_complete');
    expect(jobCompleteCall).toBeDefined();
    // job_complete uses make+model only (no year) — line 232 of route.ts
    expect(jobCompleteCall!.vars.vehicle_description).toBe('Tesla Model 3');
  });

  // Note: a body-level "no 'your your'" assertion is intentionally NOT included for
  // job_complete. The route preserves a disaster-recovery `smsFallback` string that
  // legitimately uses `vehicleDisplay` (with literal 'your vehicle' fallback) for the
  // rare case where the chip template is missing/inactive. That fallback contains
  // "your your vehicle" by design (only fires if the chip system is unreachable).
  // The vars-level assertion above proves the caller-side fix at line 249 — that's
  // the leaf invariant. The engine's empty-fallback line-removal handles the rest.
});
