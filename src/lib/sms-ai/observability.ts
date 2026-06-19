/**
 * SMS AI v2 — observability seam.
 *
 * Single source of truth for:
 *   - SmsAiV2ErrorClass enum + `isV2ErrorClass` type guard
 *   - CacheStats accumulator type + `emptyCacheStats` factory
 *   - `formatLogFields` shared `key=value` formatter
 *   - `formatErrorMessage` defensive `unknown → string` normalizer
 *
 * Three stable PM2-tail grep prefixes:
 *
 *   - `[SmsAiV2]`          — general (routing, prompt, flag, lifecycle, errors)
 *   - `[SmsAiV2 runner]`   — agent-loop per-iter activity
 *   - `[SmsAiV2 dispatch]` — per-tool dispatch summaries + auto_send_trigger
 *
 * Every emission carries an `event=<name>` field as primary discriminator,
 * so PM2 grep works against an event vocabulary rather than an ad-hoc mix
 * of natural-language verbs. Error-path emissions carry `error_class=<enum>`
 * so operator can aggregate by category via `grep error_class=<value>`.
 *
 * Cache stats — every `client.messages.create` response carries
 * `usage.cache_read_input_tokens` + `usage.cache_creation_input_tokens`.
 * The runner accumulates these into `CacheStats` across all iters in one
 * conversation; the conversation_close line emits the totals so operator
 * can verify the cached system prompt is actually getting cache hits.
 *
 * Future audit_log persistence will mirror each conversation_close line as
 * a structured row. The 10-11 field set chosen for that line IS the
 * canonical schema for that future work — don't expand it past 11 casually
 * (PM2-tail readability ceiling).
 */

export const SMS_AI_V2_ERROR_CLASSES = [
  'api_error',           // Anthropic SDK threw (network / rate-limit / 5xx)
  'max_iterations',      // Tool-budget exhausted; forced-final fired
  'unknown_stop',        // Anthropic returned a stop_reason we don't handle
  'no_reply',            // end_turn but empty text after the Issue-35 retry nudge
  'flag_load_error',     // feature-flag DB read failed/threw → defaulted to disabled
  'flag_dispatch_threw', // v2Err caught in webhook routing block
  'dispatch_thrown',     // background-dispatch outer try/catch fired
  'tool_key_missing',    // voice_agent_api_key not configured
  'prompt_load_error',   // system-prompt DB read threw (fallback still fires)
] as const;

export type SmsAiV2ErrorClass = (typeof SMS_AI_V2_ERROR_CLASSES)[number];

/**
 * Type guard for `SmsAiV2ErrorClass`. Use at any layer that receives an
 * `unknown`-shaped error category (test fixtures, log parsers, audit_log
 * reads in future Tier 2 work). Prevents type-coercion drift between the
 * enum source-of-truth and downstream code paths.
 */
export function isV2ErrorClass(value: unknown): value is SmsAiV2ErrorClass {
  return (
    typeof value === 'string' &&
    (SMS_AI_V2_ERROR_CLASSES as readonly string[]).includes(value)
  );
}

/**
 * Cache stats accumulated across all iters of one runner call. Both fields
 * are TOKEN sums (not iter counts). Per-iter values come from the Anthropic
 * `Message.usage.cache_*_input_tokens` fields; the runner sums them so the
 * conversation_close line can emit a single rollup.
 *
 * - `reads`   — sum of `usage.cache_read_input_tokens`. High = cache reused.
 * - `creates` — sum of `usage.cache_creation_input_tokens`. High = cache filled
 *               fresh (one-time per cache window) OR cache invalidated and
 *               re-created (operationally suspect — investigate prompt drift).
 */
export interface CacheStats {
  reads: number;
  creates: number;
}

export function emptyCacheStats(): CacheStats {
  return { reads: 0, creates: 0 };
}

/**
 * Render a payload object as stable `key=value key=value` text.
 *
 * - Strings containing whitespace, `=`, or `"` are JSON-quoted so the line
 *   stays grep-friendly (a quoted value never breaks a key=value parser).
 * - Booleans render as `true`/`false`.
 * - Numbers render via `String(n)`.
 * - `null` / `undefined` values are SKIPPED — caller can pass `errorClass`
 *   on success paths as `undefined` and the field won't emit. This is the
 *   primary mechanism for the optional `error_class` field on the
 *   conversation_close line.
 * - Field order matches the object literal's insertion order. JS guarantees
 *   stable string-key order, so the caller controls log-field ordering by
 *   how they write the object literal.
 *
 * NOT exhaustive on edge cases (NaN, Infinity, Symbol, BigInt, nested
 * objects) — current callers stick to string/number/boolean/null/undefined.
 * If a future caller needs richer shapes, add the case here rather than
 * coercing at the call site.
 */
export type LogFieldValue = string | number | boolean | null | undefined;

export function formatLogFields(record: Record<string, LogFieldValue>): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (raw === null || raw === undefined) continue;
    parts.push(`${key}=${renderValue(raw)}`);
  }
  return parts.join(' ');
}

function renderValue(v: string | number | boolean): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (/[\s="]/.test(v)) return JSON.stringify(v);
  return v;
}

/**
 * Defensive `unknown → string` normalizer for log payloads. Use at every
 * `catch (err)` site that emits a log so the error message is consistently
 * shaped regardless of whether the throw was a real Error, a string, or a
 * structured object.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
