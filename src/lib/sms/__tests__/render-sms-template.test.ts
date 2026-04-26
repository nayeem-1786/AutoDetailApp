import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocked Supabase template rows — adjust per-test.
// Session 2A: variables column → required_variables + optional_variables.
// Engine no longer reads the variables column.
type MockTemplate = {
  slug: string;
  body_template: string;
  is_active: boolean;
  can_silence: boolean;
  recipient_type: 'customer' | 'staff' | 'detailer';
  recipient_phones: string[] | null;
  required_variables: unknown;
  optional_variables: unknown;
};

const state = {
  templates: [] as MockTemplate[],
  phoneOverride: null as string | null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (_cols: string) => {
        if (table === 'sms_templates') {
          return Promise.resolve({ data: state.templates, error: null });
        }
        // business_settings phone override
        return {
          eq: (_col: string, key: string) => ({
            maybeSingle: async () => {
              if (key === 'sms_business_phone_override') {
                return { data: state.phoneOverride !== null ? { value: state.phoneOverride } : null, error: null };
              }
              return { data: null, error: null };
            },
          }),
        };
      },
    }),
  }),
}));

vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({
    name: 'Smart Details',
    phone: '+15551234567',
    address: '123 Main St',
    email: 'hi@smartdetails.example',
    logo_url: null,
  }),
}));

import { renderSmsTemplate, invalidateSmsTemplateCache } from '../render-sms-template';

beforeEach(() => {
  state.templates = [];
  state.phoneOverride = null;
  invalidateSmsTemplateCache();
});

// ─────────────────────────────────────────────────────────────────────────────
// C1 — empty fallbacks + line removal (post-render fallback pass)
// Engine still has the post-render scan; tests use empty contracts so the scan
// is exercised on body chips that aren't in required/optional.
// ─────────────────────────────────────────────────────────────────────────────

describe('C1 — empty noun-phrase fallbacks', () => {
  it('drops the line containing {first_name} when not provided (multi-line template)', async () => {
    state.templates = [{
      slug: 't_multi',
      body_template: 'Header line\nHi {first_name}, your appointment is set.\nFooter line',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: [],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_multi', {}, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Header line\nFooter line');
    expect(result.body).not.toContain('{first_name}');
    expect(result.body).not.toContain('there'); // OLD fallback string must NOT appear
  });

  it('does not produce "your your vehicle" when vehicle_description is empty', async () => {
    // The smoking gun from Session 42W: template prose "Your {vehicle_description}"
    // + old fallback "your vehicle" produced "Your your vehicle".
    state.templates = [{
      slug: 'payment_receipt',
      body_template: 'Thank you {first_name}!\nYour {vehicle_description} is all set.\nReceipt: {receipt_link}',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: [],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('payment_receipt', {
      first_name: 'Sarah',
      receipt_link: 'https://sd.co/r1',
    }, 'fb');

    expect(result.body).not.toContain('your your');
    expect(result.body).not.toContain('your vehicle');
    expect(result.body).toContain('Thank you Sarah!');
    expect(result.body).toContain('Receipt: https://sd.co/r1');
    // The "Your {vehicle_description} is all set." line is removed entirely.
    expect(result.body).not.toContain('is all set');
  });

  it('preserves already-empty fallback behavior for service_total (line removal)', async () => {
    state.templates = [{
      slug: 't_total',
      body_template: 'Booking confirmed.\nTotal: {service_total}\n\nQuestions?',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: [],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_total', {}, 'fb');
    expect(result.body).toBe('Booking confirmed.\n\nQuestions?');
  });

  it('substitutes provided values normally (non-empty path unchanged)', async () => {
    state.templates = [{
      slug: 't_normal',
      body_template: 'Hi {first_name}, your {vehicle_description} is ready.',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: [],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_normal', {
      first_name: 'Sarah',
      vehicle_description: 'Tesla Model 3',
    }, 'fb');

    expect(result.body).toBe('Hi Sarah, your Tesla Model 3 is ready.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C2 — required-variable hard skip
// Session 2A: source-of-truth is required_variables column. Tests below assert
// the same semantic against the new column.
// ─────────────────────────────────────────────────────────────────────────────

describe('C2 — required-variable hard skip', () => {
  it('hard-skips and returns isActive:false when a required variable is missing', async () => {
    state.templates = [{
      slug: 't_required',
      body_template: 'Hi {first_name}, your service is confirmed.',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_required', {}, 'fb');
    expect(result.isActive).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('missing_required_variable');
    expect(result.missingVars).toEqual(['first_name']);
    expect(result.body).toBe('');
  });

  it('treats empty string the same as missing for hard-skip', async () => {
    state.templates = [{
      slug: 't_empty_string',
      body_template: 'Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_empty_string', { first_name: '' }, 'fb');
    expect(result.isActive).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.missingVars).toEqual(['first_name']);
  });

  it('treats undefined the same as missing for hard-skip', async () => {
    state.templates = [{
      slug: 't_undef',
      body_template: 'Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_undef', { first_name: undefined }, 'fb');
    expect(result.isActive).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('proceeds normally when all required vars are provided', async () => {
    state.templates = [{
      slug: 't_ok',
      body_template: 'Hi {first_name}, your {vehicle_description} is ready.',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name', 'vehicle_description'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_ok', {
      first_name: 'Sarah',
      vehicle_description: 'Tesla Model 3',
    }, 'fb');

    expect(result.isActive).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.body).toBe('Hi Sarah, your Tesla Model 3 is ready.');
  });

  it('reports all missing vars in a single skip', async () => {
    state.templates = [{
      slug: 't_multi_missing',
      body_template: 'Hi {first_name}, your {vehicle_description} on {appointment_date}',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name', 'vehicle_description', 'appointment_date'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_multi_missing', {
      first_name: 'Sarah',
    }, 'fb');

    expect(result.isActive).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.missingVars).toEqual(['vehicle_description', 'appointment_date']);
  });

  it('does not skip when business_name is auto-injected but not passed by caller', async () => {
    // Auto-injection populates business_name/phone/address before the hard-skip check runs.
    state.templates = [{
      slug: 't_business',
      body_template: '{business_name} — Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['business_name', 'first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_business', { first_name: 'Sarah' }, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toContain('Smart Details');
    expect(result.body).toContain('Hi Sarah!');
  });
});
