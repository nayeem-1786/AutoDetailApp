import { describe, it, expect, beforeEach, vi } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 Theme C.2 (AC-12) — Phase 4 SLA cron unit tests. Covers the
// business-hours gate, threshold filter, audit-log cooldown dedup, and the
// no-recipients-configured drop-with-warn path.
//
// The lifecycle engine GET handler runs five phases (drip enroll, drip stop,
// schedule, execute, drip execute) BEFORE the SLA phase. These tests stub
// those collaborators to no-op so only Phase 4 behavior is asserted.
// ──────────────────────────────────────────────────────────────────────────────

// Default-mock the schedule/execute collaborators so the engine's Phase 0-3
// passes are no-op + the only behavior under test is Phase 4 SLA.
vi.mock('@/lib/email/drip-engine', () => ({
  runAutoEnrollments: vi.fn(async () => 0),
  checkAllStopConditions: vi.fn(async () => 0),
  processEnrollments: vi.fn(async () => ({ processed: 0, sent: 0 })),
}));

vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: vi.fn(async () => true),
}));

// renderSmsTemplate + sendSms — drives the SLA fire path.
const renderSmsTemplateMock = vi.fn();
vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: (...args: unknown[]) => renderSmsTemplateMock(...args),
}));

const sendSmsMock = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/utils/sms', () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
  sendMarketingSms: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/utils/email', () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
}));

// Business hours predicate — flipped per-test.
const isWithinBusinessHoursMock = vi.fn(() => true);
vi.mock('@/lib/data/business-hours', () => ({
  getBusinessHours: vi.fn(async () => ({ monday: { open: '08:00', close: '20:00' } })),
  isWithinBusinessHours: (...args: unknown[]) => isWithinBusinessHoursMock(...args),
}));

vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: vi.fn(async () => ({
    name: 'Smart Details',
    phone: '+14244010094',
    address: '...',
    streetAddress: '...',
    city: 'Lomita',
    state: 'CA',
    zip: '90717',
    email: null,
    website: null,
    logo_url: null,
  })),
  BUSINESS_DEFAULTS: { phone: '+14244010094', name: 'Smart Details' },
}));

vi.mock('@/lib/email/send-templated-email', () => ({
  sendTemplatedEmail: vi.fn(async () => ({ success: true, usedTemplate: false })),
  renderFromBlocks: vi.fn(),
}));

vi.mock('@/lib/utils/short-link', () => ({
  createShortLink: vi.fn(async (url: string) => url),
}));

// Tier-meta enricher — no-op.
vi.mock('@/lib/quotes/services-summary', () => ({
  enrichItemsWithTierMeta: vi.fn(async (_supabase: unknown, items: unknown[]) => items),
  formatServicesSummary: vi.fn(() => 'Services'),
}));

const logAuditMock = vi.fn();
vi.mock('@/lib/services/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

// Supabase admin client — drives the appointments query + audit_log dedup query.
// Tests mutate `state` to inject fixtures per-test.
interface SupabaseState {
  pendingAppointments: Record<string, unknown>[];
  recentAuditRows: Array<{ entity_id: string }>;
}

const supabaseState: SupabaseState = {
  pendingAppointments: [],
  recentAuditRows: [],
};

const createAdminClientMock = vi.fn(() => {
  function makeBuilder(rows: unknown[]) {
    // Chain stub — every call returns `this` until awaited; awaiting
    // resolves to `{ data, error }`. Both .lte() / .is() / .not() / .gte()
    // return `this` for the chainability; .limit() is terminal-ish but we
    // resolve on it.
    const builder: Record<string, unknown> = {
      eq: () => builder,
      is: () => builder,
      lte: () => builder,
      not: () => builder,
      gte: () => builder,
      in: () => builder,
      order: () => builder,
      select: () => builder,
      limit: () => Promise.resolve({ data: rows, error: null }),
      // For audit_log dedup query which awaits directly after `.gte()`.
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === 'appointments') return makeBuilder(supabaseState.pendingAppointments);
      if (table === 'audit_log') return makeBuilder(supabaseState.recentAuditRows);
      // Phase 1 (scheduleFrom*) — return empty so no executions get inserted.
      if (table === 'lifecycle_rules') return makeBuilder([]);
      if (table === 'lifecycle_executions') return makeBuilder([]);
      if (table === 'business_settings') return makeBuilder([]);
      return makeBuilder([]);
    },
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import { GET } from '../route';

const APP_URL = 'http://localhost:3000/api/cron/lifecycle-engine';
const VALID_KEY = process.env.CRON_API_KEY ?? 'test-cron-key';

function makeRequest(): Parameters<typeof GET>[0] {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-api-key' ? VALID_KEY : null),
    },
    url: APP_URL,
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  process.env.CRON_API_KEY = VALID_KEY;
  supabaseState.pendingAppointments = [];
  supabaseState.recentAuditRows = [];
  renderSmsTemplateMock.mockReset();
  sendSmsMock.mockClear();
  isWithinBusinessHoursMock.mockReset();
  logAuditMock.mockClear();

  renderSmsTemplateMock.mockResolvedValue({
    isActive: true,
    body: 'SLA alert body',
    recipientPhones: ['+15555550100'],
  });
  isWithinBusinessHoursMock.mockReturnValue(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test cases — each one mutates supabaseState + the predicates, calls GET,
// and asserts on the JSON response shape OR the dispatch mock invocations.
// ──────────────────────────────────────────────────────────────────────────────

describe('lifecycle-engine Phase 4 SLA — business hours gate', () => {
  it('skips SLA scan entirely outside business hours (no fire even when candidates exist)', async () => {
    isWithinBusinessHoursMock.mockReturnValue(false);
    supabaseState.pendingAppointments = [
      makePendingAppt('appt-1', 'quote-1', { hoursAgo: 3 }),
    ];

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.sla.fired).toBe(0);
    expect(body.sla.skipped_hours).toBe(1);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('fires alert inside business hours when threshold met', async () => {
    isWithinBusinessHoursMock.mockReturnValue(true);
    supabaseState.pendingAppointments = [
      makePendingAppt('appt-1', 'quote-1', { hoursAgo: 3 }),
    ];

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.sla.fired).toBe(1);
    expect(sendSmsMock).toHaveBeenCalled();
    // Audit row written with sla_alert_fired event.
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'quote',
        entityId: 'quote-1',
        details: expect.objectContaining({ event: 'sla_alert_fired' }),
      })
    );
  });
});

describe('lifecycle-engine Phase 4 SLA — cooldown dedup', () => {
  it('skips appointments whose quote has a recent audit_log row in the cooldown window', async () => {
    isWithinBusinessHoursMock.mockReturnValue(true);
    supabaseState.pendingAppointments = [
      makePendingAppt('appt-1', 'quote-1', { hoursAgo: 3 }),
    ];
    supabaseState.recentAuditRows = [{ entity_id: 'quote-1' }];

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.sla.fired).toBe(0);
    expect(body.sla.skipped_cooldown).toBe(1);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe('lifecycle-engine Phase 4 SLA — no recipients configured', () => {
  it('drops alert + logs warn when template has empty recipient_phones', async () => {
    isWithinBusinessHoursMock.mockReturnValue(true);
    supabaseState.pendingAppointments = [
      makePendingAppt('appt-1', 'quote-1', { hoursAgo: 3 }),
    ];
    renderSmsTemplateMock.mockResolvedValue({
      isActive: true,
      body: 'SLA alert body',
      recipientPhones: null,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.sla.fired).toBe(0);
    expect(body.sla.skipped_no_recipients).toBe(1);
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Alert dropped — no recipient_phones')
    );
    warnSpy.mockRestore();
  });
});

describe('lifecycle-engine Phase 4 SLA — empty candidate set', () => {
  it('returns sla.fired=0 with no side effects when no pending appointments match', async () => {
    isWithinBusinessHoursMock.mockReturnValue(true);
    supabaseState.pendingAppointments = [];

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.sla.fired).toBe(0);
    expect(body.sla.skipped_hours).toBe(0);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────────

function makePendingAppt(
  id: string,
  quoteId: string,
  opts: { hoursAgo: number }
): Record<string, unknown> {
  const createdAt = new Date(Date.now() - opts.hoursAgo * 60 * 60 * 1000).toISOString();
  return {
    id,
    quote_id: quoteId,
    customer_id: 'cust-1',
    created_at: createdAt,
    customer: {
      id: 'cust-1',
      first_name: 'Alice',
      last_name: 'Anderson',
    },
    quote: {
      id: quoteId,
      quote_number: 'Q-100001',
      items: [],
    },
  };
}
