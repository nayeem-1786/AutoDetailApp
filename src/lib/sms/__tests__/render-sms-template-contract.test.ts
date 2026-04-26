// Engine contract behavior tests (Session 2A).
//
// Covers the 5+1 contract semantics added in Phase 4:
//   1. Hard-skip when a required chip is missing or empty.
//   2. REMOVE_LINE strips the line referencing an absent or empty optional chip.
//   3. Render succeeds when all required + optional chips are supplied.
//   4. Render succeeds with required-only (no optional supplied → REMOVE_LINE).
//   5. Invalid contract (e.g., chip not in SMS_PALETTE) → fail-safe inactive.
//   6. business_* auto-injection still works regardless of contract shape.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { __renderSmsTemplateForTesting as renderSmsTemplate, invalidateSmsTemplateCache } from '../render-sms-template';

beforeEach(() => {
  state.templates = [];
  state.phoneOverride = null;
  invalidateSmsTemplateCache();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Hard-skip on missing required chip
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — required hard-skip', () => {
  it('hard-skips when a required chip is undefined', async () => {
    state.templates = [{
      slug: 't_required_undef',
      body_template: 'Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_required_undef', {}, 'fb');
    expect(result.isActive).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('missing_required_variable');
    expect(result.missingVars).toEqual(['first_name']);
  });

  it('hard-skips when a required chip is empty string', async () => {
    state.templates = [{
      slug: 't_required_empty',
      body_template: 'Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_required_empty', { first_name: '' }, 'fb');
    expect(result.isActive).toBe(false);
    expect(result.missingVars).toEqual(['first_name']);
  });

  it('reports all missing required vars in a single skip', async () => {
    state.templates = [{
      slug: 't_required_multi',
      body_template: '{a} {b} {c}',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name', 'service_name', 'short_url'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_required_multi', { first_name: 'John' }, 'fb');
    expect(result.isActive).toBe(false);
    expect(result.missingVars?.sort()).toEqual(['service_name', 'short_url']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REMOVE_LINE on absent / empty optional chip
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — optional REMOVE_LINE', () => {
  it('strips a line referencing an absent optional chip', async () => {
    state.templates = [{
      slug: 't_opt_absent',
      body_template: 'Header\nHi {first_name}, your order is ready.\nFooter',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: [],
      optional_variables: ['first_name'],
    }];

    const result = await renderSmsTemplate('t_opt_absent', {}, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Header\nFooter');
    expect(result.body).not.toContain('{first_name}');
  });

  it('strips a line referencing an empty-string optional chip', async () => {
    state.templates = [{
      slug: 't_opt_empty',
      body_template: 'Header\nHi {first_name}!\nFooter',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: [],
      optional_variables: ['first_name'],
    }];

    const result = await renderSmsTemplate('t_opt_empty', { first_name: '' }, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Header\nFooter');
  });

  it('substitutes provided optional value normally (non-empty path)', async () => {
    state.templates = [{
      slug: 't_opt_present',
      body_template: 'Header\nHi {first_name}!\nFooter',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: [],
      optional_variables: ['first_name'],
    }];

    const result = await renderSmsTemplate('t_opt_present', { first_name: 'Sarah' }, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Header\nHi Sarah!\nFooter');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Full render with required + optional supplied
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — full render', () => {
  it('renders cleanly when every required and every optional is supplied', async () => {
    state.templates = [{
      slug: 't_full',
      body_template: 'Hi {first_name}!\nYour {service_name} is ready.\nVehicle: {vehicle_description}',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name', 'service_name'],
      optional_variables: ['vehicle_description'],
    }];

    const result = await renderSmsTemplate('t_full', {
      first_name: 'Sarah',
      service_name: 'Ceramic Coating',
      vehicle_description: '2024 Tesla Model 3',
    }, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Hi Sarah!\nYour Ceramic Coating is ready.\nVehicle: 2024 Tesla Model 3');
  });

  it('renders required-only (optional absent → line stripped, send still fires)', async () => {
    state.templates = [{
      slug: 't_req_only',
      body_template: 'Hi {first_name}!\nYour {service_name} is ready.\nVehicle: {vehicle_description}',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name', 'service_name'],
      optional_variables: ['vehicle_description'],
    }];

    const result = await renderSmsTemplate('t_req_only', {
      first_name: 'Sarah',
      service_name: 'Ceramic Coating',
    }, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Hi Sarah!\nYour Ceramic Coating is ready.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Invalid contract → fail-safe (template treated as inactive)
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — fail-safe on invalid contract', () => {
  it('treats a template with an unknown chip in required as inactive', async () => {
    state.templates = [{
      slug: 't_invalid_unknown',
      body_template: 'Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['this_chip_does_not_exist_in_palette'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_invalid_unknown', { first_name: 'Sarah' }, 'fb');
    expect(result.isActive).toBe(false);
  });

  it('treats a contract with required+optional overlap as inactive', async () => {
    state.templates = [{
      slug: 't_invalid_overlap',
      body_template: 'Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name'],
      optional_variables: ['first_name'],
    }];

    const result = await renderSmsTemplate('t_invalid_overlap', { first_name: 'Sarah' }, 'fb');
    expect(result.isActive).toBe(false);
  });

  it('treats a contract with duplicate keys in required as inactive', async () => {
    state.templates = [{
      slug: 't_invalid_dups',
      body_template: 'Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['first_name', 'first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_invalid_dups', { first_name: 'Sarah' }, 'fb');
    expect(result.isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. business_* auto-injection preserved
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — business_* auto-inject preserved', () => {
  it('does not hard-skip when business_name is auto-injected (caller did not pass)', async () => {
    state.templates = [{
      slug: 't_auto_inject',
      body_template: '{business_name} — Hi {first_name}!',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['business_name', 'first_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_auto_inject', { first_name: 'Sarah' }, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toContain('Smart Details');
    expect(result.body).toContain('Hi Sarah!');
  });

  it('uses business_phone override when configured', async () => {
    state.phoneOverride = '+15558881234';
    state.templates = [{
      slug: 't_phone_override',
      body_template: 'Call {business_phone}',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['business_phone'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_phone_override', {}, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Call +15558881234');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Caller-passed business_name takes precedence over auto-inject
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — caller business_name overrides auto-inject', () => {
  it('uses caller-supplied business_name even when getBusinessInfo would auto-fill', async () => {
    state.templates = [{
      slug: 't_caller_biz',
      body_template: '{business_name} test',
      is_active: true,
      can_silence: true,
      recipient_type: 'customer',
      recipient_phones: null,
      required_variables: ['business_name'],
      optional_variables: [],
    }];

    const result = await renderSmsTemplate('t_caller_biz', { business_name: 'Custom Name' }, 'fb');
    expect(result.isActive).toBe(true);
    expect(result.body).toBe('Custom Name test');
  });
});
