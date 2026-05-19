/**
 * getCouponEnforcementMode — canonical read with defensive double-encoding
 * unwrap.
 *
 * Pins the contract used by:
 *   - src/app/admin/settings/coupon-enforcement/page.tsx (admin form LOAD)
 *   - src/app/api/pos/coupons/validate/route.ts (apply-time gate)
 *   - src/app/api/pos/promotions/available/route.ts (eligible list)
 *
 * The helper must:
 *   1. Return 'hard' for any input that resolves (after unwrap) to 'hard'.
 *   2. Return 'soft' for any other input (default), including: missing row,
 *      null value, Supabase error, unrecognized string, non-string value.
 *   3. Handle the legacy double-encoded form `'"hard"'` / `'"soft"'`.
 *   4. Handle the clean post-fix form `'hard'` / `'soft'`.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCouponEnforcementMode,
  COUPON_ENFORCEMENT_SETTING_KEY,
  type CouponEnforcementMode,
} from '@/lib/utils/coupon-enforcement';

interface FakeRow {
  value: unknown;
}

interface FakeResponse {
  data: FakeRow | null;
  error: { message: string } | null;
}

function makeSupabase(response: FakeResponse): SupabaseClient {
  const captured: { calls: Array<{ key: string }> } = { calls: [] };
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, key: string) => {
          captured.calls.push({ key });
          return {
            maybeSingle: () => Promise.resolve(response),
          };
        },
      }),
    }),
    // Test escape: surface the captured calls if a test wants to assert on
    // the SELECT key (without leaking any other supabase-js surface).
    __captured: captured,
  } as unknown as SupabaseClient;
}

describe('getCouponEnforcementMode — happy path with clean values', () => {
  it('returns hard for clean "hard"', async () => {
    const supabase = makeSupabase({ data: { value: 'hard' }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe<CouponEnforcementMode>('hard');
  });

  it('returns soft for clean "soft"', async () => {
    const supabase = makeSupabase({ data: { value: 'soft' }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe<CouponEnforcementMode>('soft');
  });
});

describe('getCouponEnforcementMode — legacy double-encoded values', () => {
  it('unwraps legacy double-encoded "hard" (the production bug shape)', async () => {
    // Pre-fix shape: Supabase deserialized the JSONB string `"\"hard\""`
    // to a JS string `'"hard"'` with literal quote chars.
    const supabase = makeSupabase({ data: { value: '"hard"' }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('hard');
  });

  it('unwraps legacy double-encoded "soft"', async () => {
    const supabase = makeSupabase({ data: { value: '"soft"' }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });
});

describe('getCouponEnforcementMode — defaults to soft', () => {
  it('returns soft when the row is missing', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });

  it('returns soft when value is null', async () => {
    const supabase = makeSupabase({ data: { value: null }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });

  it('returns soft when Supabase returns an error', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'boom' } });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });

  it('returns soft for an unrecognized string value', async () => {
    const supabase = makeSupabase({ data: { value: 'strict' }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });

  it('returns soft for an unrecognized double-encoded string value', async () => {
    const supabase = makeSupabase({ data: { value: '"strict"' }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });

  it('returns soft when value is a non-string (defensive — should not happen post-fix)', async () => {
    const supabase = makeSupabase({ data: { value: { mode: 'hard' } }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });

  it('returns soft when value is the literal JSON string "null"', async () => {
    // Edge case: a JS string `'null'` deserialized from JSONB. JSON.parse
    // succeeds (yields the JS value null), but null is not a string, so
    // the helper falls through and the raw 'null' fails the 'hard' check.
    const supabase = makeSupabase({ data: { value: 'null' }, error: null });
    expect(await getCouponEnforcementMode(supabase)).toBe('soft');
  });
});

describe('getCouponEnforcementMode — query shape', () => {
  it('queries business_settings with key = coupon_type_enforcement', async () => {
    const supabase = makeSupabase({ data: { value: 'soft' }, error: null });
    await getCouponEnforcementMode(supabase);
    const captured = (supabase as unknown as { __captured: { calls: Array<{ key: string }> } }).__captured;
    expect(captured.calls).toHaveLength(1);
    expect(captured.calls[0].key).toBe(COUPON_ENFORCEMENT_SETTING_KEY);
    expect(captured.calls[0].key).toBe('coupon_type_enforcement');
  });
});
