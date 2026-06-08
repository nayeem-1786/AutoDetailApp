import { describe, it, expect, beforeEach, vi } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 Theme C.2 (AC-12) — orchestrator-level unit tests for
// `processCustomerAccept`. These are unit-style tests with stubbed Supabase
// and SMS/email/business-hours collaborators. Live-DB integration coverage
// belongs in a separate session under `gsd:add-tests`.
//
// Coverage targets (per session prompt):
//   1. Happy path — quote validation, status flip, convertQuote call,
//      customer SMS, business-hours-gated SLA SMS, staff email, audit log
//   2. Race condition — `convertQuote` returns `already_converted=true`
//      (F.7 idempotency) → orchestrator returns existing appointment ID
//      without duplicate SMS/email side effects
//   3. UNIQUE constraint backstop — handled at the DB layer; orchestrator
//      surfaces convertQuote's error response (5xx) cleanly
//   4. Business hours: inline SLA SMS fires during 8am–8pm
//   5. Outside business hours: inline SLA SMS does NOT fire (cron picks up)
//   6. Quote expired: orchestrator rejects per existing validation
//   7. Quote already accepted (idempotent re-call): orchestrator does NOT
//      re-flip status but DOES still call convertQuote (F.7 handles the
//      conversion-level idempotency)
//   8. Customer SMS still dispatched on the happy path
//   9. Audit log written
//  10. NO fireWebhook called — regression test for Theme G subtraction
// ──────────────────────────────────────────────────────────────────────────────

// Mock the convertQuote seam — the orchestrator's contract with it is what
// we're testing, not convertQuote's internals (those live in convert-service.test.ts).
const convertQuoteMock = vi.fn();
vi.mock('../convert-service', () => ({
  convertQuote: (...args: unknown[]) => convertQuoteMock(...args),
}));

// Mock SMS dispatch. The renderSmsTemplate cache is module-level + reads the
// DB; bypass it with a stub that returns a deterministic active result.
const renderSmsTemplateMock = vi.fn();
vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: (...args: unknown[]) => renderSmsTemplateMock(...args),
}));

const sendSmsMock = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/utils/sms', () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
}));

const sendEmailMock = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/utils/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

// Business info and business hours — both default to "set", with the
// business-hours predicate flipped per-test to drive the SLA branch.
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: vi.fn(async () => ({
    name: 'Smart Details',
    phone: '+14244010094',
    address: '2021 Lomita Blvd., Lomita, CA 90717',
    streetAddress: '2021 Lomita Blvd.',
    city: 'Lomita',
    state: 'CA',
    zip: '90717',
    email: 'owner@example.com',
    website: null,
    logo_url: null,
  })),
  BUSINESS_DEFAULTS: { phone: '+14244010094' },
}));

const isWithinBusinessHoursMock = vi.fn(() => true);
vi.mock('@/lib/data/business-hours', () => ({
  getBusinessHours: vi.fn(async () => ({ monday: { open: '08:00', close: '20:00' } })),
  isWithinBusinessHours: (...args: unknown[]) => isWithinBusinessHoursMock(...args),
}));

// Tier-meta enricher — fall through to the empty path; the test fixtures
// have no service_id-bearing items so the enricher is structurally a no-op.
vi.mock('../services-summary', () => ({
  enrichItemsWithTierMeta: vi.fn(async (_supabase: unknown, items: unknown[]) => items),
  formatServicesSummary: vi.fn(() => 'Services'),
}));

const logAuditMock = vi.fn();
vi.mock('@/lib/services/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

import { processCustomerAccept, humanizeAcceptedAgo } from '../customer-accept-service';

// ──────────────────────────────────────────────────────────────────────────────
// Supabase stub — supports the orchestrator's read/update/insert calls.
// Mirrors the convert-service.test pattern; tests can override specific
// table behavior by post-mutating returned shapes.
// ──────────────────────────────────────────────────────────────────────────────

interface CallRecord {
  table: string;
  op: 'select' | 'update' | 'insert';
  payload?: unknown;
}

function makeSupabase(opts: {
  quote: Record<string, unknown>;
  calls: CallRecord[];
}) {
  return {
    from(table: string) {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: vi.fn(async () => {
                  opts.calls.push({ table, op: 'select' });
                  return { data: opts.quote, error: null };
                }),
              }),
            }),
          }),
          update: (payload: unknown) => ({
            eq: vi.fn(async () => {
              opts.calls.push({ table, op: 'update', payload });
              return { error: null };
            }),
          }),
        };
      }
      if (table === 'quote_communications') {
        return {
          insert: vi.fn(async (payload: unknown) => {
            opts.calls.push({ table, op: 'insert', payload });
            return { error: null };
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const BASE_CUSTOMER = {
  id: 'cust-1',
  first_name: 'Alice',
  last_name: 'Anderson',
  phone: '+13105551234',
  email: 'alice@example.com',
};

const BASE_QUOTE = {
  id: 'quote-1',
  quote_number: 'Q-100001',
  customer_id: 'cust-1',
  status: 'sent',
  total_amount: 218,
  valid_until: '2026-06-17',
  customer: BASE_CUSTOMER,
  items: [{ service_id: null, item_name: 'Premium Detail' }],
};

beforeEach(() => {
  convertQuoteMock.mockReset();
  renderSmsTemplateMock.mockReset();
  sendSmsMock.mockClear();
  sendEmailMock.mockClear();
  isWithinBusinessHoursMock.mockReset();
  logAuditMock.mockClear();

  // Default: happy convertQuote return.
  convertQuoteMock.mockResolvedValue({
    success: true,
    appointment: { id: 'appt-1' },
    serviceNames: 'Premium Detail',
  });
  // Default: template renders active with seeded recipient phones.
  renderSmsTemplateMock.mockImplementation(async (slug: string, _vars: unknown, fallback: string) => ({
    isActive: true,
    body: fallback,
    recipientPhones: slug === 'pending_appointment_sla_alert' ? ['+15555550100'] : null,
  }));
  isWithinBusinessHoursMock.mockReturnValue(true);
});

describe('processCustomerAccept — happy path', () => {
  it('flips quote status, calls convertQuote with customer_accept channel + placeholder', async () => {
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, calls });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.appointment_id).toBe('appt-1');
      expect(result.already_converted).toBe(false);
      expect(result.sla_alert_fired_immediately).toBe(true);
    }

    // Quote was status-flipped before convertQuote.
    const update = calls.find((c) => c.table === 'quotes' && c.op === 'update');
    expect(update).toBeDefined();
    expect((update!.payload as { status: string }).status).toBe('accepted');

    // convertQuote called with the right channel + placeholderDate + status.
    expect(convertQuoteMock).toHaveBeenCalledTimes(1);
    const [, , data, options] = convertQuoteMock.mock.calls[0];
    expect(data.date).toBe('2026-06-17'); // valid_until placeholder
    expect(data.time).toBe('09:00');
    expect(options.channel).toBe('customer_accept');
    expect(options.appointmentStatus).toBe('pending');
    expect(options.placeholderDate).toBe(true);
  });

  it('dispatches customer SMS + SLA staff SMS + staff email + audit log', async () => {
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, calls });

    await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    // Customer SMS dispatched (quote_accepted_single — single-item branch).
    expect(renderSmsTemplateMock).toHaveBeenCalledWith(
      'quote_accepted_single',
      expect.objectContaining({ first_name: 'Alice', item_name: 'Premium Detail' }),
      expect.any(String)
    );
    // SLA staff SMS dispatched.
    expect(renderSmsTemplateMock).toHaveBeenCalledWith(
      'pending_appointment_sla_alert',
      expect.objectContaining({
        quote_number: 'Q-100001',
        customer_name: 'Alice Anderson',
      }),
      expect.any(String)
    );
    // SendSms invoked for both (customer + at least one staff recipient).
    expect(sendSmsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Staff email dispatched.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // Audit row written with event=customer_accept.
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'quote',
        entityId: 'quote-1',
        details: expect.objectContaining({ event: 'customer_accept' }),
      })
    );
  });

  it('falls back to today when quote has no valid_until', async () => {
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({
      quote: { ...BASE_QUOTE, valid_until: null },
      calls,
    });

    await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    const [, , data] = convertQuoteMock.mock.calls[0];
    // Should be ISO date YYYY-MM-DD (today)
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('processCustomerAccept — race condition (F.7 already_converted)', () => {
  it('returns existing appointment_id WITHOUT duplicate SMS/email side effects', async () => {
    convertQuoteMock.mockResolvedValue({
      success: true,
      appointment: { id: 'appt-race-winner' },
      serviceNames: '',
      already_converted: true,
    });
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, calls });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.appointment_id).toBe('appt-race-winner');
      expect(result.already_converted).toBe(true);
      expect(result.sla_alert_fired_immediately).toBe(false);
    }

    // NO customer SMS, NO SLA SMS, NO staff email — the race-winner already
    // fired them on the original-accept path.
    expect(renderSmsTemplateMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();

    // Audit log still written — observability of the race-loss is valuable.
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          event: 'customer_accept',
          already_converted: true,
        }),
      })
    );
  });
});

describe('processCustomerAccept — convertQuote DB-layer failure', () => {
  it('surfaces convertQuote error response cleanly', async () => {
    convertQuoteMock.mockResolvedValue({
      success: false,
      error: 'Concurrent conversion detected; please retry',
      status: 409,
    });
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, calls });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/Concurrent conversion/);
    }
  });
});

describe('processCustomerAccept — business hours gate', () => {
  it('does NOT fire inline SLA SMS outside business hours', async () => {
    isWithinBusinessHoursMock.mockReturnValue(false);
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, calls });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sla_alert_fired_immediately).toBe(false);
    }

    // Customer SMS still dispatched (it's not gated by hours).
    expect(renderSmsTemplateMock).toHaveBeenCalledWith(
      'quote_accepted_single',
      expect.anything(),
      expect.any(String)
    );
    // SLA template NOT rendered.
    expect(renderSmsTemplateMock).not.toHaveBeenCalledWith(
      'pending_appointment_sla_alert',
      expect.anything(),
      expect.any(String)
    );
  });

  it('logs business_hours_now=false on audit row when out-of-hours', async () => {
    isWithinBusinessHoursMock.mockReturnValue(false);
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, calls });

    await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          business_hours_now: false,
          sla_alert_fired_immediately: false,
        }),
      })
    );
  });
});

describe('processCustomerAccept — recipient_phones empty (self-send safe)', () => {
  it('drops SLA SMS + logs warning when template has no recipient_phones', async () => {
    // Mirror the seed migration's recipient_phones=NULL behavior — staff
    // hasn't configured recipients yet.
    renderSmsTemplateMock.mockImplementation(async (_slug, _vars, fallback) => ({
      isActive: true,
      body: fallback,
      recipientPhones: null,
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, calls });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // SLA SMS attempt happened but dropped due to empty recipients.
      expect(result.sla_alert_fired_immediately).toBe(false);
    }
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SLA alert dropped'),
    );
    warnSpy.mockRestore();
  });
});

describe('processCustomerAccept — quote status guards', () => {
  it('rejects expired quote with 400', async () => {
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({
      quote: { ...BASE_QUOTE, status: 'expired' },
      calls,
    });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(400);
    }
    expect(convertQuoteMock).not.toHaveBeenCalled();
  });

  it('rejects converted quote with 400', async () => {
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({
      quote: { ...BASE_QUOTE, status: 'converted' },
      calls,
    });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(400);
    }
  });

  it('rejects missing quote with 404', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            }),
          }),
        }),
      }),
    };

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'missing' }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(404);
    }
  });

  it('handles idempotent re-call on already-accepted quote (skips status flip; still calls convertQuote)', async () => {
    const calls: CallRecord[] = [];
    const supabase = makeSupabase({
      quote: { ...BASE_QUOTE, status: 'accepted' },
      calls,
    });

    const result = await processCustomerAccept(
      supabase as unknown as Parameters<typeof processCustomerAccept>[0],
      { quoteId: 'quote-1' }
    );

    expect(result.success).toBe(true);
    // No status flip update issued (already 'accepted').
    const updates = calls.filter((c) => c.table === 'quotes' && c.op === 'update');
    expect(updates).toHaveLength(0);
    // convertQuote still invoked — F.7 handles convert-level idempotency.
    expect(convertQuoteMock).toHaveBeenCalledTimes(1);
  });
});

describe('humanizeAcceptedAgo', () => {
  it('returns "just now" for sub-minute deltas', () => {
    expect(humanizeAcceptedAgo(0)).toBe('just now');
    expect(humanizeAcceptedAgo(30 * 1000)).toBe('just now');
  });

  it('returns minute-granularity for sub-hour deltas', () => {
    expect(humanizeAcceptedAgo(60 * 1000)).toBe('1 minute ago');
    expect(humanizeAcceptedAgo(12 * 60 * 1000)).toBe('12 minutes ago');
  });

  it('returns hour-granularity for sub-day deltas', () => {
    expect(humanizeAcceptedAgo(60 * 60 * 1000)).toBe('1 hour ago');
    expect(humanizeAcceptedAgo(3 * 60 * 60 * 1000)).toBe('3 hours ago');
  });

  it('returns day-granularity for multi-day deltas', () => {
    expect(humanizeAcceptedAgo(2 * 24 * 60 * 60 * 1000)).toBe('2 days ago');
  });
});
