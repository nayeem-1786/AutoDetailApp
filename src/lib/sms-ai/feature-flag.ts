/**
 * SMS AI v2 feature-flag routing.
 *
 * Layer 4 (webhook integration) will consult `shouldUseSmsAiV2()` on each
 * inbound SMS to decide whether to route to the new tool-using agent or the
 * legacy single-shot responder. This module is the SINGLE source of routing
 * truth — both files are kept small and self-contained so the decision logic
 * is auditable.
 *
 * Three flags backing the decision (seeded by migration
 * `20260518215003_add_sms_ai_v2_settings.sql`):
 *
 *   sms_ai_v2_kill_switch       — emergency override. When true, ALWAYS
 *                                 returns false. Wins everything.
 *   sms_ai_v2_globally_enabled  — when true, v2 for all (except kill_switch).
 *   sms_ai_v2_enabled_phones    — E.164 allowlist. Phones here route to v2
 *                                 even when globally_enabled is false.
 *
 * Decision is a pure function over the loaded flags so we can unit-test
 * exhaustively without touching the DB. `loadSmsAiV2Flags()` is the only
 * I/O surface; everything else is data-in / data-out.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';

export interface SmsAiV2FeatureFlags {
  killSwitch: boolean;
  enabledPhones: string[];
  globallyEnabled: boolean;
}

export const SMS_AI_V2_FLAG_KEYS = {
  KILL_SWITCH: 'sms_ai_v2_kill_switch',
  ENABLED_PHONES: 'sms_ai_v2_enabled_phones',
  GLOBALLY_ENABLED: 'sms_ai_v2_globally_enabled',
} as const;

export const SAFE_DEFAULT_FLAGS: SmsAiV2FeatureFlags = {
  killSwitch: false,
  enabledPhones: [],
  globallyEnabled: false,
};

/**
 * Decide whether the given customer phone should route to SMS AI v2.
 * Pure function over the flags + a phone string — no I/O.
 *
 * Order matters:
 *   1. Kill switch (always wins)
 *   2. Global toggle (universal enable)
 *   3. Allowlist match (per-phone enable; phone normalized to E.164 on
 *      both sides of the comparison)
 *
 * Unparseable phones return false. The legacy responder is the safe default;
 * v2 is opt-in by allowlist or global toggle.
 */
export function shouldUseSmsAiV2(
  phone: string,
  flags: SmsAiV2FeatureFlags,
): boolean {
  if (flags.killSwitch) return false;
  if (flags.globallyEnabled) return true;

  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  // Normalize allowlist entries for an apples-to-apples comparison. The
  // admin UI is expected to store E.164 already, but we don't trust it —
  // a single trailing space or formatted display string would otherwise
  // silently fail to match.
  return flags.enabledPhones.some((entry) => {
    const normalizedEntry = normalizePhone(entry);
    return normalizedEntry !== null && normalizedEntry === normalized;
  });
}

/**
 * Coerce a JSONB value from business_settings into a boolean. Accepts:
 *   - native booleans (true / false)
 *   - JSON-encoded strings ('true' / '"true"')
 *   - anything else → falsy.
 */
function coerceBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const stripped = value.trim().replace(/^"|"$/g, '').toLowerCase();
    return stripped === 'true';
  }
  return false;
}

/**
 * Coerce a JSONB value into an array of E.164 strings. Accepts:
 *   - native arrays (filtered to string entries, normalized)
 *   - JSON-encoded array strings ('["+1..."]')
 *   - anything else → [].
 */
function coercePhoneArray(value: unknown): string[] {
  let candidate: unknown = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(candidate)) return [];
  const out: string[] = [];
  for (const entry of candidate) {
    if (typeof entry !== 'string') continue;
    const normalized = normalizePhone(entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

/**
 * Read the three flags from business_settings. Missing keys default to the
 * safe state (`SAFE_DEFAULT_FLAGS`) so a fresh install or a partial seed
 * leaves v2 disabled.
 */
export async function loadSmsAiV2Flags(): Promise<SmsAiV2FeatureFlags> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('business_settings')
      .select('key, value')
      .in('key', [
        SMS_AI_V2_FLAG_KEYS.KILL_SWITCH,
        SMS_AI_V2_FLAG_KEYS.ENABLED_PHONES,
        SMS_AI_V2_FLAG_KEYS.GLOBALLY_ENABLED,
      ]);

    if (error || !data) {
      console.warn('[SmsAiV2 flag] load failed — defaulting to disabled:', error?.message);
      return { ...SAFE_DEFAULT_FLAGS };
    }

    const map = new Map<string, unknown>();
    for (const row of data) map.set(row.key, row.value);

    return {
      killSwitch: coerceBool(map.get(SMS_AI_V2_FLAG_KEYS.KILL_SWITCH)),
      enabledPhones: coercePhoneArray(map.get(SMS_AI_V2_FLAG_KEYS.ENABLED_PHONES)),
      globallyEnabled: coerceBool(map.get(SMS_AI_V2_FLAG_KEYS.GLOBALLY_ENABLED)),
    };
  } catch (err) {
    console.warn('[SmsAiV2 flag] load threw — defaulting to disabled:', err);
    return { ...SAFE_DEFAULT_FLAGS };
  }
}
