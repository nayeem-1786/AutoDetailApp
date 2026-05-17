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

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-v — pins modifier rendering on the customer-facing
// email (both templated path + fallback HTML/text). Coupon / loyalty /
// manual rows appear above the Total line when the persisted modifier
// columns are populated; receipt looks identical to pre-15g-v for
// unmodified quotes. Audit: §2 (4 customer-facing surfaces missed
// modifier rows pre-fix).
// ──────────────────────────────────────────────────────────────────────────────

const MODIFIER_QUOTE = {
  ...BASE_QUOTE,
  subtotal: 200,
  tax_amount: 0,
  total_amount: 155, // 200 - 25 - 5 - 15
  coupon_code: 'SAVE25',
  coupon_discount: 25,
  loyalty_points_to_redeem: 100,
  loyalty_discount: 5,
  manual_discount_type: 'dollar' as const,
  manual_discount_value: 15,
  manual_discount_label: 'Cashier override',
};

describe('sendQuote — Layer 15g-v modifier rendering (templated email path)', () => {
  it('passes composite quote_modifier_block + 6 individual modifier variables to sendTemplatedEmail', async () => {
    const { supabase } = makeSupabase({ quote: MODIFIER_QUOTE });
    await sendQuote(supabase as never, 'quote-1', 'email');

    expect(sendTemplatedEmail).toHaveBeenCalledOnce();
    const vars = vi.mocked(sendTemplatedEmail).mock.calls[0][2] as Record<
      string,
      string
    >;
    // Composite block — each row on its own line + trailing newline so
    // **Total** stays separate.
    expect(vars.quote_modifier_block).toContain('**Coupon (SAVE25):** -$25.00');
    expect(vars.quote_modifier_block).toContain('**Loyalty (100 pts):** -$5.00');
    expect(vars.quote_modifier_block).toContain('**Cashier override:** -$15.00');
    expect(vars.quote_modifier_block?.endsWith('\n')).toBe(true);

    // Individual variables exposed for operator-customized template bodies.
    expect(vars.quote_coupon_code).toBe('SAVE25');
    expect(vars.quote_coupon_discount).toBe('$25.00');
    expect(vars.quote_loyalty_pts).toBe('100');
    expect(vars.quote_loyalty_discount).toBe('$5.00');
    expect(vars.quote_manual_label).toBe('Cashier override');
    expect(vars.quote_manual_discount).toBe('$15.00');
  });

  it('passes empty strings for modifier variables when no modifier applied', async () => {
    const { supabase } = makeSupabase({ quote: BASE_QUOTE });
    await sendQuote(supabase as never, 'quote-1', 'email');

    const vars = vi.mocked(sendTemplatedEmail).mock.calls[0][2] as Record<
      string,
      string
    >;
    // Empty composite — template renders Subtotal/Tax/Total only.
    expect(vars.quote_modifier_block).toBe('');
    // Individual vars empty so renderer doesn't leave literal `{var}` in output.
    expect(vars.quote_coupon_code).toBe('');
    expect(vars.quote_coupon_discount).toBe('');
    expect(vars.quote_loyalty_pts).toBe('');
    expect(vars.quote_loyalty_discount).toBe('');
    expect(vars.quote_manual_label).toBe('');
    expect(vars.quote_manual_discount).toBe('');
  });
});

describe('sendQuote — Layer 15g-v modifier rendering (fallback HTML + text)', () => {
  // Force the fallback path by making sendTemplatedEmail return
  // usedTemplate: false so sendEmail(htmlBody, textBody) is called instead.
  it('fallback path includes modifier rows in BOTH html + text bodies when modifiers applied', async () => {
    vi.mocked(sendTemplatedEmail).mockResolvedValueOnce({
      usedTemplate: false,
      success: false,
    } as never);
    const { supabase } = makeSupabase({ quote: MODIFIER_QUOTE });
    await sendQuote(supabase as never, 'quote-1', 'email');

    expect(sendEmail).toHaveBeenCalledOnce();
    const [, , textBody, htmlBody] = vi.mocked(sendEmail).mock.calls[0];
    // Text body — plain-text rows between Tax and Total.
    expect(textBody).toContain('Coupon (SAVE25): -$25.00');
    expect(textBody).toContain('Loyalty (100 pts): -$5.00');
    expect(textBody).toContain('Cashier override: -$15.00');
    // HTML body — display:flex rows with the modifier label + amount.
    expect(htmlBody).toContain('Coupon (SAVE25)');
    expect(htmlBody).toContain('-$25.00');
    expect(htmlBody).toContain('Loyalty (100 pts)');
    expect(htmlBody).toContain('-$5.00');
    expect(htmlBody).toContain('Cashier override');
    expect(htmlBody).toContain('-$15.00');
  });

  it('fallback path omits modifier rows entirely when no modifier applied', async () => {
    vi.mocked(sendTemplatedEmail).mockResolvedValueOnce({
      usedTemplate: false,
      success: false,
    } as never);
    const { supabase } = makeSupabase({ quote: BASE_QUOTE });
    await sendQuote(supabase as never, 'quote-1', 'email');

    const [, , textBody, htmlBody] = vi.mocked(sendEmail).mock.calls[0];
    // No "Coupon"/"Loyalty"/manual labels anywhere in the bodies.
    expect(textBody).not.toContain('Coupon');
    expect(textBody).not.toContain('Loyalty');
    // HTML body still has Subtotal/Tax/Total; modifier rows absent.
    expect(htmlBody).not.toContain('Coupon (');
    expect(htmlBody).not.toContain('Loyalty (');
  });
});
