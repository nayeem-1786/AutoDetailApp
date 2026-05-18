import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  shouldUseSmsAiV2,
  SAFE_DEFAULT_FLAGS,
  type SmsAiV2FeatureFlags,
} from '@/lib/sms-ai/feature-flag';

describe('shouldUseSmsAiV2 — pure routing decision', () => {
  describe('kill switch precedence', () => {
    it('kill switch beats global enable', () => {
      expect(
        shouldUseSmsAiV2('+14245551234', {
          killSwitch: true,
          globallyEnabled: true,
          enabledPhones: ['+14245551234'],
        }),
      ).toBe(false);
    });

    it('kill switch beats allowlist match', () => {
      expect(
        shouldUseSmsAiV2('+14245551234', {
          killSwitch: true,
          globallyEnabled: false,
          enabledPhones: ['+14245551234'],
        }),
      ).toBe(false);
    });
  });

  describe('global enable', () => {
    it('returns true for any phone when globally enabled', () => {
      expect(
        shouldUseSmsAiV2('+14245550001', {
          killSwitch: false,
          globallyEnabled: true,
          enabledPhones: [],
        }),
      ).toBe(true);
    });

    it('returns true even for unparseable phone when globally enabled', () => {
      // Global enable short-circuits — phone normalization is skipped.
      expect(
        shouldUseSmsAiV2('garbage', {
          killSwitch: false,
          globallyEnabled: true,
          enabledPhones: [],
        }),
      ).toBe(true);
    });
  });

  describe('allowlist', () => {
    it('returns true for an allowlisted phone (exact E.164 match)', () => {
      expect(
        shouldUseSmsAiV2('+14245551234', {
          killSwitch: false,
          globallyEnabled: false,
          enabledPhones: ['+14245551234'],
        }),
      ).toBe(true);
    });

    it('returns true when input phone is non-E.164 but allowlist is E.164 — normalization is symmetric', () => {
      expect(
        shouldUseSmsAiV2('(424) 555-1234', {
          killSwitch: false,
          globallyEnabled: false,
          enabledPhones: ['+14245551234'],
        }),
      ).toBe(true);
    });

    it('returns true when allowlist entry is non-E.164 but input is E.164 — normalization is symmetric', () => {
      expect(
        shouldUseSmsAiV2('+14245551234', {
          killSwitch: false,
          globallyEnabled: false,
          enabledPhones: ['(424) 555-1234'],
        }),
      ).toBe(true);
    });

    it('returns false when phone is not in allowlist', () => {
      expect(
        shouldUseSmsAiV2('+14245559999', {
          killSwitch: false,
          globallyEnabled: false,
          enabledPhones: ['+14245551234'],
        }),
      ).toBe(false);
    });

    it('returns false when allowlist is empty', () => {
      expect(
        shouldUseSmsAiV2('+14245551234', SAFE_DEFAULT_FLAGS),
      ).toBe(false);
    });

    it('returns false for unparseable phone (allowlist path requires normalization)', () => {
      expect(
        shouldUseSmsAiV2('garbage', {
          killSwitch: false,
          globallyEnabled: false,
          enabledPhones: ['+14245551234'],
        }),
      ).toBe(false);
    });

    it('skips allowlist entries that fail normalization', () => {
      // Bogus entry doesn't crash the check; valid entry still matches.
      expect(
        shouldUseSmsAiV2('+14245551234', {
          killSwitch: false,
          globallyEnabled: false,
          enabledPhones: ['not-a-phone', '+14245551234'],
        }),
      ).toBe(true);
    });
  });

  describe('safe default state', () => {
    it('SAFE_DEFAULT_FLAGS routes everyone to legacy', () => {
      expect(shouldUseSmsAiV2('+14245551234', SAFE_DEFAULT_FLAGS)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// loadSmsAiV2Flags — DB read with coercion + safe defaults on missing keys
// ---------------------------------------------------------------------------

const mockState = {
  rows: [] as Array<{ key: string; value: unknown }>,
  error: null as { message: string } | null,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: (_col: string, _keys: string[]) =>
          Promise.resolve({ data: mockState.rows, error: mockState.error }),
      }),
    }),
  }),
}));

beforeEach(() => {
  mockState.rows = [];
  mockState.error = null;
});

describe('loadSmsAiV2Flags — DB read', () => {
  it('returns SAFE_DEFAULT_FLAGS when no rows exist', async () => {
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags).toEqual(SAFE_DEFAULT_FLAGS);
  });

  it('coerces native boolean values', async () => {
    mockState.rows = [
      { key: 'sms_ai_v2_kill_switch', value: false },
      { key: 'sms_ai_v2_globally_enabled', value: true },
      { key: 'sms_ai_v2_enabled_phones', value: [] },
    ];
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags.killSwitch).toBe(false);
    expect(flags.globallyEnabled).toBe(true);
    expect(flags.enabledPhones).toEqual([]);
  });

  it('coerces JSON-encoded string booleans', async () => {
    mockState.rows = [
      { key: 'sms_ai_v2_kill_switch', value: 'true' },
      { key: 'sms_ai_v2_globally_enabled', value: '"false"' },
      { key: 'sms_ai_v2_enabled_phones', value: '[]' },
    ];
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags.killSwitch).toBe(true);
    expect(flags.globallyEnabled).toBe(false);
  });

  it('normalizes phones in the allowlist to E.164', async () => {
    mockState.rows = [
      { key: 'sms_ai_v2_enabled_phones', value: ['(424) 555-1234', '4245555678'] },
    ];
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags.enabledPhones).toEqual(['+14245551234', '+14245555678']);
  });

  it('drops unparseable phones from the allowlist', async () => {
    mockState.rows = [
      { key: 'sms_ai_v2_enabled_phones', value: ['+14245551234', 'garbage', null] },
    ];
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags.enabledPhones).toEqual(['+14245551234']);
  });

  it('parses JSON-encoded array string in allowlist value', async () => {
    mockState.rows = [
      { key: 'sms_ai_v2_enabled_phones', value: '["+14245551234"]' },
    ];
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags.enabledPhones).toEqual(['+14245551234']);
  });

  it('returns safe defaults when supabase errors', async () => {
    mockState.error = { message: 'db down' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags).toEqual(SAFE_DEFAULT_FLAGS);
    warn.mockRestore();
  });

  it('returns safe defaults for malformed allowlist values', async () => {
    // Non-array, non-parseable string → coercePhoneArray returns []
    mockState.rows = [
      { key: 'sms_ai_v2_enabled_phones', value: 42 as unknown },
    ];
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags.enabledPhones).toEqual([]);
  });

  it('falls back to safe defaults for non-boolean non-string flag values', async () => {
    mockState.rows = [
      { key: 'sms_ai_v2_kill_switch', value: { unexpected: 'shape' } },
      { key: 'sms_ai_v2_globally_enabled', value: null },
    ];
    const { loadSmsAiV2Flags } = await import('@/lib/sms-ai/feature-flag');
    const flags = await loadSmsAiV2Flags();
    expect(flags.killSwitch).toBe(false);
    expect(flags.globallyEnabled).toBe(false);
  });
});

// Type-only smoke test
describe('SmsAiV2FeatureFlags type', () => {
  it('SAFE_DEFAULT_FLAGS is assignable to SmsAiV2FeatureFlags', () => {
    const flags: SmsAiV2FeatureFlags = SAFE_DEFAULT_FLAGS;
    expect(flags).toBeDefined();
  });
});
