import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks must be declared before importing the SUT.
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: vi.fn(async () => ({
    name: 'Smart Details',
    phone: '+15555550100',
    address: '123 Test St',
    email: 'biz@example.com',
    website: 'https://example.com',
  })),
}));
vi.mock('@/lib/utils/webhook', () => ({ fireWebhook: vi.fn(async () => undefined) }));
vi.mock('@/lib/utils/short-link', () => ({
  createShortLink: vi.fn(async (u: string) => u),
}));
vi.mock('@/lib/utils/sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/utils/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email/send-templated-email', () => ({ sendTemplatedEmail: vi.fn() }));
vi.mock('@/lib/sms/render-sms-template', () => ({ renderSmsTemplate: vi.fn() }));

import { sendQuote } from '../send-service';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';

// Minimal Supabase mock — only the chains send-service touches. Stores
// inserted quote_communications rows on the returned object so tests can
// assert the side effects.
function makeSupabase(opts: {
  quote: Record<string, unknown> | null;
  inserts?: Record<string, unknown>[];
}) {
  const inserts: Record<string, unknown>[] = opts.inserts ?? [];
  const supabase = {
    from(table: string) {
      if (table === 'quote_communications') {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            inserts.push(row);
            return { error: null };
          }),
        };
      }
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: vi.fn(async () => ({ data: opts.quote, error: null })),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: vi.fn(async () => ({
                  data: { ...(opts.quote ?? {}), updated_at: new Date().toISOString() },
                  error: null,
                })),
              }),
            }),
          }),
        };
      }
      if (table === 'business_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn(async () => ({ data: { value: '10' }, error: null })),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { supabase, inserts };
}

const BASE_QUOTE = {
  id: 'quote-1',
  quote_number: 'Q-0001',
  status: 'draft',
  access_token: 'tok',
  total_amount: 100,
  subtotal: 90,
  tax_amount: 10,
  created_at: '2026-05-01T00:00:00Z',
  customer: {
    id: 'cust-1',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+15551112222',
    email: 'jane@example.com',
  },
  vehicle: { id: 'veh-1', year: 2020, make: 'Tesla', model: 'Model 3' },
  items: [{ item_name: 'Wash', quantity: 1, unit_price: 100, total_price: 100, tier_name: null }],
  is_mobile: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Production-shaped URL so localhost SMS guard doesn't fire by default.
  process.env.NEXT_PUBLIC_APP_URL = 'https://smartdetailsautospa.com';
  vi.mocked(renderSmsTemplate).mockResolvedValue({
    isActive: true,
    body: 'Estimate Q-0001 https://x',
    usedTemplate: true,
  } as never);
  vi.mocked(sendTemplatedEmail).mockResolvedValue({
    usedTemplate: true,
    success: true,
  } as never);
  vi.mocked(sendEmail).mockResolvedValue({ success: true } as never);
  vi.mocked(sendSms).mockResolvedValue({ success: true, sid: 'SM_abc' } as never);
});

describe('sendQuote — happy paths', () => {
  it('all channels succeed → success:true, errors empty, twilio_sid captured', async () => {
    const { supabase, inserts } = makeSupabase({ quote: BASE_QUOTE });
    const result = await sendQuote(supabase as never, 'quote-1', 'both');

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.sent_via).toEqual(['email', 'sms']);
    expect(result.failed_via).toEqual([]);
    expect(result.blocked_via).toEqual([]);
    expect(result.errors).toEqual([]);

    const smsRow = inserts.find((r) => r.channel === 'sms');
    expect(smsRow).toMatchObject({ status: 'sent', twilio_sid: 'SM_abc' });
    const emailRow = inserts.find((r) => r.channel === 'email');
    expect(emailRow).toMatchObject({ status: 'sent', twilio_sid: null });
  });
});

describe('sendQuote — partial outcomes (success:true with errors)', () => {
  it('email succeeds, sms infrastructure fails → partial success', async () => {
    vi.mocked(sendSms).mockResolvedValueOnce({ success: false, error: 'Twilio 21610' } as never);
    const { supabase, inserts } = makeSupabase({ quote: BASE_QUOTE });

    const result = await sendQuote(supabase as never, 'quote-1', 'both');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.sent_via).toEqual(['email']);
    expect(result.failed_via).toEqual(['sms']);
    expect(result.errors).toEqual([
      { channel: 'sms', reason: 'Twilio 21610', status: 'failed' },
    ]);
    const smsRow = inserts.find((r) => r.channel === 'sms');
    expect(smsRow).toMatchObject({ status: 'failed', error_message: 'Twilio 21610' });
  });
});

describe('sendQuote — total failure paths return success:false', () => {
  it('method=both with no email + no phone → success:false, both blocked', async () => {
    const quote = {
      ...BASE_QUOTE,
      customer: { ...BASE_QUOTE.customer, email: null, phone: null },
    };
    const { supabase, inserts } = makeSupabase({ quote });
    const result = await sendQuote(supabase as never, 'quote-1', 'both');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    if ('status' in result) throw new Error('expected outcome failure not fatal');
    expect(result.sent_via).toEqual([]);
    expect(result.blocked_via).toEqual(['email', 'sms']);
    expect(result.errors.map((e) => e.status)).toEqual(['blocked', 'blocked']);
    expect(inserts).toHaveLength(2);
    expect(inserts.every((r) => r.status === 'blocked')).toBe(true);
  });

  it('method=sms with localhost guard → success:false, blocked', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    const { supabase, inserts } = makeSupabase({ quote: BASE_QUOTE });
    const result = await sendQuote(supabase as never, 'quote-1', 'sms');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    if ('status' in result) throw new Error('expected outcome failure');
    expect(result.blocked_via).toEqual(['sms']);
    expect(inserts[0]).toMatchObject({
      channel: 'sms',
      status: 'blocked',
      error_message: expect.stringContaining('public URL'),
    });
  });

  it('method=sms template inactive → success:false, blocked', async () => {
    vi.mocked(renderSmsTemplate).mockResolvedValueOnce({
      isActive: false,
      body: null,
    } as never);
    const { supabase, inserts } = makeSupabase({ quote: BASE_QUOTE });
    const result = await sendQuote(supabase as never, 'quote-1', 'sms');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    if ('status' in result) throw new Error('expected outcome failure');
    expect(inserts[0]).toMatchObject({
      channel: 'sms',
      status: 'blocked',
      error_message: expect.stringContaining('template inactive'),
    });
  });
});

describe('sendQuote — exception paths still log', () => {
  it('email send throws → row inserted with status=failed', async () => {
    vi.mocked(sendTemplatedEmail).mockRejectedValueOnce(new Error('mailgun timeout'));
    const { supabase, inserts } = makeSupabase({ quote: BASE_QUOTE });
    const result = await sendQuote(supabase as never, 'quote-1', 'email');

    expect(result.success).toBe(false);
    const emailRow = inserts.find((r) => r.channel === 'email');
    expect(emailRow).toMatchObject({ status: 'failed', error_message: 'mailgun timeout' });
  });

  it('sms send throws → row inserted with status=failed', async () => {
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('twilio outage'));
    const { supabase, inserts } = makeSupabase({ quote: BASE_QUOTE });
    const result = await sendQuote(supabase as never, 'quote-1', 'sms');

    expect(result.success).toBe(false);
    const smsRow = inserts.find((r) => r.channel === 'sms');
    expect(smsRow).toMatchObject({ status: 'failed', error_message: 'twilio outage' });
  });
});

describe('sendQuote — fatal early-exits keep prior shape', () => {
  it('quote not found → success:false with status:404', async () => {
    const { supabase } = makeSupabase({ quote: null });
    const result = await sendQuote(supabase as never, 'missing', 'both');
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect('status' in result && result.status).toBe(404);
  });
});
