/**
 * Coupon enforcement mode — canonical read with defensive double-encoding
 * unwrap.
 *
 * Background. Until commit XXX (this branch), the admin form's save handler
 * at `src/app/admin/settings/coupon-enforcement/page.tsx` called
 * `JSON.stringify(mode)` before passing the value to a Supabase upsert into
 * the JSONB column `business_settings.value`. The Supabase JS client
 * serializes for JSONB itself, so pre-stringifying caused immediate
 * double-encoding on every save (a clean `"soft"` became a JSONB string
 * whose deserialized JS form was `'"soft"'` with literal quote chars).
 *
 * The two consumers (`pos/coupons/validate` and `pos/promotions/available`)
 * compensated differently — validate stripped all `"` chars with a regex,
 * promotions/available did nothing — which caused cross-consumer drift
 * (a hard-restricted coupon would be hard-blocked at apply-time but appear
 * eligible in the promotions list). See
 * `docs/dev/AUDIT_VOICE_POLL_AND_COUPON_ENFORCEMENT_2026-05-19.md`.
 *
 * This helper is the single canonical reader. Both consumers + the admin
 * form load route through it. The defensive unwrap below is a transition
 * shim: once the backfill migration `20260519XXXXXX_normalize_coupon_type_
 * enforcement_double_encoding.sql` has run, all rows are clean strings and
 * the unwrap is a no-op. Keep it as belt-and-suspenders.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type CouponEnforcementMode = 'soft' | 'hard';

export const COUPON_ENFORCEMENT_SETTING_KEY = 'coupon_type_enforcement';
const DEFAULT_MODE: CouponEnforcementMode = 'soft';

/**
 * Read the coupon enforcement mode from business_settings. Returns the
 * default `'soft'` for any missing row, null value, error, or unrecognized
 * setting (i.e. anything that isn't an exact `'hard'` after defensive unwrap).
 *
 * Defensive unwrap handles the legacy double-encoded form (`'"hard"'` /
 * `'"soft"'` with literal quote chars) so this helper returns the right
 * mode regardless of whether the row has been migrated yet.
 */
export async function getCouponEnforcementMode(
  supabase: SupabaseClient
): Promise<CouponEnforcementMode> {
  const { data, error } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', COUPON_ENFORCEMENT_SETTING_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_MODE;

  const unwrapped = unwrapPossibleDoubleEncoding(data.value);
  return unwrapped === 'hard' ? 'hard' : DEFAULT_MODE;
}

/**
 * If `value` is a JS string that itself parses as a valid JSON string,
 * return the inner string. Otherwise return the value unchanged.
 *
 * This handles the legacy double-encoded shape `'"hard"'` (where Supabase
 * deserialized a JSONB string whose content is the 6-char JS string
 * `"hard"`) by JSON.parsing the outer quotes off. A clean `'hard'` value
 * does NOT start/end with `"` chars, so the parse path is skipped and the
 * raw value is returned.
 */
function unwrapPossibleDoubleEncoding(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Not actually JSON — fall through to return the raw value
    }
  }
  return value;
}
