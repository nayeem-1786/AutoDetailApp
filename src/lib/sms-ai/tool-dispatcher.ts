/**
 * SMS AI v2 — tool dispatcher (Layer 3b).
 *
 * Replaces Layer 3a's stub. Routes each `tool_use` block from the agent
 * runner to its backing implementation:
 *   - `notify_staff` calls the in-process `notifyStaff()` helper directly
 *     (no self-HTTP indirection — see discovery §7 follow-up: "HTTP no-retry
 *     contract is irrelevant inside the agent loop").
 *   - The other 9 tools HTTP-call the corresponding `/api/voice-agent/*`
 *     endpoints with a Bearer header drawn from
 *     `business_settings.voice_agent_api_key` (audit §6.3 — same key the
 *     voice agent uses).
 *
 * Public interface contract (unchanged from Layer 3a):
 *   - `DispatchToolInput = { name: string; input: Record<string, unknown> }`
 *   - `DispatchToolResult = { content: string; isError: boolean }`
 *   - `dispatchTool(input): Promise<DispatchToolResult>`
 *
 * The agent runner clocks each `dispatchTool` call externally, so the
 * result type intentionally does NOT carry latency — keeping the 3a wire
 * shape so callers compile without churn.
 *
 * Retry policy (audit §4.4 / §B.2.4): NO automatic retries. On HTTP
 * non-2xx, throw, or per-tool timeout, return
 * `{ content: '<reason>', isError: true }` so the model can decide
 * whether to give up, escalate to `notify_staff`, or try a different
 * tool. Side-effecting tools (`create_appointment`, `send_info_sms`,
 * `send_quote_sms`) are NOT idempotent — silent retry would cause
 * duplicate bookings/SMS.
 *
 * Timeouts: each HTTP tool wraps `fetch` with an `AbortController` and a
 * per-tool budget from `TOOL_TIMEOUT_MS`. The in-process `notify_staff`
 * call (which has no abort signal of its own) uses `Promise.race` against
 * the same budget. Voice-agent endpoints currently carry zero internal
 * timeouts (discovery §H — no `AbortController` / `signal:` anywhere), so
 * the dispatcher's per-tool budget is the only line of defense.
 *
 * Bearer key cache: scoped to a single agent run via `__resetForAgentRun`.
 * The runner calls this at the start of each inbound so a recently-rotated
 * key takes effect on the next message without an in-process restart. We
 * deliberately avoid a module-global cache to keep operator key rotation
 * cheap.
 *
 * Runtime phone injection (Workstream J Session 2 — Issue 26 root cause):
 * The system prompt (per D19 / Issue 22 resolution) forbids the LLM from
 * asking the customer for their phone on SMS. For new customers (no row
 * in `customers` yet, customer-context bundle has no phone), the LLM has
 * no source of phone — yet `send_quote_sms`, `create_appointment`,
 * `send_info_sms`, `lookup_customer`, and `notify_staff` all REQUIRE phone
 * server-side. The webhook captures `From` as E.164 and passes it through
 * `runV2AgentInBackground`; the runner forwards it into
 * `__resetForAgentRun({ phone, conversationId })`. Phone-bearing helpers
 * read from the module-private `runtimeContext` and inject the value into
 * the HTTP body (or query string for `lookup_customer`) BEFORE dispatch,
 * always OVERRIDING any LLM-provided value. The LLM never sees the phone
 * and cannot get it wrong. Endpoint contracts stay unchanged — they still
 * require `phone` / `customer_phone`; the dispatcher just supplies it.
 *
 * Defensive: any phone-injecting helper called without `runtimeContext`
 * set returns `errResult('Internal: runtime phone not set …')`. Production
 * runner always sets it at the start of every inbound; this guard catches
 * regressions in test or future callers that bypass the runner.
 */

import type { SmsAiV2ToolName } from '@/lib/sms-ai/tools';
import { TOOL_NAMES } from '@/lib/sms-ai/tools';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  notifyStaff,
  isStaffNotificationReason,
} from '@/lib/services/staff-notification';
import { approveAddon, declineAddon } from '@/lib/services/job-addons';
import { formatErrorMessage, formatLogFields } from '@/lib/sms-ai/observability';

export interface DispatchToolInput {
  name: string;
  input: Record<string, unknown>;
}

export interface DispatchToolResult {
  content: string;
  isError: boolean;
}

/**
 * Per-tool timeout budgets in ms. Five-second default for read/classify
 * tools; ten seconds for tools that fan out to Twilio / webhooks / multi-
 * write paths (audit §4.3 latency table — SLOW + MEDIUM-SLOW classes).
 */
const TOOL_TIMEOUT_MS: Record<SmsAiV2ToolName, number> = {
  lookup_customer: 5000,
  get_services: 5000,
  classify_vehicle: 5000,
  check_availability: 5000,
  get_products: 5000,
  get_product_details: 5000,
  create_appointment: 10000,
  send_info_sms: 10000,
  send_quote_sms: 10000,
  notify_staff: 10000,
  approve_addon: 10000,
  decline_addon: 10000,
  upsert_customer: 5000,
  // send_payment_link fans out to Twilio + Mailgun behind the helper (same
  // classes as send_info_sms / send_quote_sms), so it shares their 10-second
  // MEDIUM-SLOW budget. The dispatcher's per-tool budget is the only line of
  // defense — voice-agent endpoints currently carry zero internal timeouts
  // (file-header §Timeouts).
  send_payment_link: 10000,
};

/** Per-agent-run Bearer key cache. Reset between inbounds via __resetForAgentRun. */
let _cachedApiKey: string | null = null;
let _apiKeyLoadFailed = false;

/**
 * Runtime context for the in-flight agent run. Carries values the
 * dispatcher needs but the LLM should never be responsible for (phone
 * in particular — see file header for the design rationale). Set by the
 * runner via `__resetForAgentRun({...})`; consumed by phone-injecting
 * helpers.
 */
export interface RuntimeContext {
  /** Customer E.164 phone — already normalized upstream by the webhook. */
  phone: string;
  /** Conversation UUID for the in-flight inbound. Reserved for future use. */
  conversationId: string;
  /**
   * Vehicle size_class captured from the most recent classify_vehicle
   * response within this agent run. Auto-injected into get_services
   * calls if the LLM doesn't explicitly pass it (LLM value, if any,
   * always wins).
   *
   * D40 (2026-05-24, post-Issue 36 + D39): architectural enforcement
   * of the size-aware pricing flow. D39's prompt+schema strengthening
   * (Critical Rule 6 + imperative description + recall directive)
   * proved empirically insufficient — PM2 logs verified 6 get_services
   * calls in the post-D39 test conversation all returned the identical
   * 21909-byte size-unaware payload, confirming size_class was never
   * passed despite the prompt rules. This injection mirrors the
   * phone-injection pattern (Issue 26 precedent at 6 sites in this
   * file).
   *
   * Undefined when no classify_vehicle call has occurred yet in this
   * agent run, OR when the most recent classify_vehicle returned
   * without a string size_class (defensive type guard).
   *
   * Reset between agent runs along with phone — the runner's
   * `__resetForAgentRun({ phone, conversationId })` call passes a
   * fresh context object that does NOT carry size_class, so each
   * inbound starts with this field undefined.
   */
  size_class?: string | null;
}

let _runtimeContext: RuntimeContext | null = null;

/**
 * Reset the per-run caches. The agent runner calls this once at the start
 * of every inbound. Module-global state survives between agent runs by
 * default — that's a bug for operator key rotation AND for runtime phone
 * leakage across conversations, hence the explicit reset hook.
 *
 * The `context` parameter is optional in the function signature so the
 * existing test corpus (which exercises non-phone tools like `get_services`)
 * can keep calling `__resetForAgentRun()` without arguments. Production
 * callers (the runner) MUST always pass a context; phone-injecting helpers
 * return `errResult(...)` when the context is unset.
 */
export function __resetForAgentRun(context?: RuntimeContext): void {
  _cachedApiKey = null;
  _apiKeyLoadFailed = false;
  _runtimeContext = context ?? null;
}

async function loadVoiceAgentApiKey(): Promise<string | null> {
  if (_cachedApiKey) return _cachedApiKey;
  if (_apiKeyLoadFailed) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('business_settings')
      .select('value')
      .eq('key', 'voice_agent_api_key')
      .maybeSingle();
    if (error || !data?.value) {
      _apiKeyLoadFailed = true;
      console.warn(
        `[SmsAiV2 dispatch] ${formatLogFields({
          event: 'key_load_error',
          error_class: 'tool_key_missing',
          reason: 'not_configured',
        })}`,
      );
      return null;
    }
    const raw = typeof data.value === 'string' ? data.value : String(data.value);
    _cachedApiKey = raw.replace(/^"|"$/g, '').trim();
    return _cachedApiKey;
  } catch (err) {
    _apiKeyLoadFailed = true;
    console.warn(
      `[SmsAiV2 dispatch] ${formatLogFields({
        event: 'key_load_error',
        error_class: 'tool_key_missing',
        reason: 'load_threw',
        message: formatErrorMessage(err),
      })}`,
    );
    return null;
  }
}

function isToolName(name: string): name is SmsAiV2ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function appUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL;
  if (u && u.length > 0) return u.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function errResult(message: string): DispatchToolResult {
  return { content: message, isError: true };
}

function okResult(payload: unknown): DispatchToolResult {
  const content =
    typeof payload === 'string' ? payload : safeStringify(payload);
  return { content, isError: false };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Self-API fetch with Bearer auth + per-tool AbortController timeout.
 * Returns either a parsed-JSON success result or an `isError: true`
 * normalized error message.
 */
async function voiceAgentFetch(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  bearerKey: string,
): Promise<DispatchToolResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${appUrl()}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${bearerKey}`,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // Structured-error passthrough (Workstream J Session 3 — instructional
      // errors). If the response body parses to JSON carrying an
      // `instructions_for_agent` field, return the full JSON to the agent
      // so it can react conversationally without leaking system details.
      // Legacy non-instructional errors keep their truncated-snippet format.
      try {
        const parsed: unknown = JSON.parse(text);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof (parsed as { instructions_for_agent?: unknown }).instructions_for_agent ===
            'string'
        ) {
          return { content: text, isError: true };
        }
      } catch {
        // fall through to legacy snippet
      }
      const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
      return errResult(`Tool call returned ${res.status}: ${snippet}`);
    }
    if (!text) return okResult('');
    try {
      return okResult(JSON.parse(text));
    } catch {
      return okResult(text);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return errResult(`Tool call timed out after ${timeoutMs}ms`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return errResult(`Tool call failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wrap an arbitrary in-process promise with the same per-tool timeout
 * budget the HTTP path uses. The helper has no abort signal, so the slow
 * promise keeps running in the background — but the dispatcher returns
 * the timeout error to the runner without waiting.
 */
async function withTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<DispatchToolResult | { __ok: true; value: T }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<DispatchToolResult>((resolve) => {
    timer = setTimeout(() => {
      resolve(errResult(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const winner = await Promise.race([
      p.then((value): { __ok: true; value: T } => ({ __ok: true, value })),
      timeoutP,
    ]);
    return winner;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ----- per-tool dispatchers ---------------------------------------------

function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function callLookupCustomer(_input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  // Phone injection: runtime phone is the source of truth (see file header).
  // The LLM's `input.phone`, if any, is ignored — `lookup_customer` only
  // ever runs against the conversation's own phone.
  if (!_runtimeContext?.phone) {
    return errResult('lookup_customer: internal — runtime phone not set');
  }
  const phone = _runtimeContext.phone;
  return voiceAgentFetch(
    `/api/voice-agent/customers${qs({ phone })}`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.lookup_customer,
    key,
  );
}

async function callGetServices(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  // Issue 33 Layer 2: forward `size_class` so the endpoint can
  // resolve standalone prices + savings for size-aware addons. The
  // endpoint silently ignores invalid values, so we don't need to
  // validate here.
  //
  // D40 (2026-05-24): if the LLM didn't explicitly pass size_class,
  // inject it from RuntimeContext (captured during the most recent
  // classify_vehicle response). LLM-passed value, if any, always
  // takes precedence — same precedence ordering as a CLI flag
  // overriding a default.
  //
  // This is the architectural fix for Issue 36. D39's prompt+schema
  // strengthening proved empirically insufficient (PM2-verified: 6
  // get_services calls post-D39 returned the same 21909-byte
  // size-unaware payload). Mirrors the phone-injection pattern.
  const llmProvidedSizeClass = typeof input.size_class === 'string'
    ? input.size_class
    : undefined;
  const contextSizeClass = _runtimeContext?.size_class ?? undefined;
  const effectiveSizeClass = llmProvidedSizeClass ?? contextSizeClass;

  return voiceAgentFetch(
    `/api/voice-agent/services${qs({ size_class: effectiveSizeClass })}`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.get_services,
    key,
  );
}

async function callClassifyVehicle(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  const make = typeof input.make === 'string' ? input.make : '';
  if (!make) return errResult('classify_vehicle: missing required input "make"');
  const result = await voiceAgentFetch(
    `/api/voice-agent/vehicle-classify${qs({
      make,
      model: typeof input.model === 'string' ? input.model : undefined,
      year: typeof input.year === 'number' ? input.year : undefined,
      color: typeof input.color === 'string' ? input.color : undefined,
    })}`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.classify_vehicle,
    key,
  );

  // D40 (2026-05-24): capture size_class from the successful response
  // into RuntimeContext for automatic injection on subsequent
  // get_services calls. Mirrors the phone-injection pattern.
  //
  // The LLM-facing response is unchanged — it still receives the full
  // JSON payload including size_class. The capture is a side-effect.
  //
  // Defensive: only capture on success (isError=false); only when
  // size_class is a non-empty string (the API returns it at the top
  // level — see vehicle-classify/route.ts:82). Multiple
  // classify_vehicle calls in a single agent run overwrite the
  // captured value (most-recent-wins, matches what the LLM sees).
  if (!result.isError && _runtimeContext && typeof result.content === 'string') {
    try {
      const parsed: unknown = JSON.parse(result.content);
      const sizeClass = (parsed as { size_class?: unknown } | null)?.size_class;
      if (typeof sizeClass === 'string' && sizeClass.length > 0) {
        _runtimeContext.size_class = sizeClass;
      }
    } catch {
      // Defensive: if response shape changes or parsing fails, do not
      // crash the agent run. Skip the capture; the LLM still gets the
      // unchanged response.
    }
  }

  return result;
}

async function callCheckAvailability(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  const date = typeof input.date === 'string' ? input.date : '';
  if (!date) return errResult('check_availability: missing required input "date"');
  return voiceAgentFetch(
    `/api/voice-agent/availability${qs({
      date,
      service_id: typeof input.service_id === 'string' ? input.service_id : undefined,
      expected_day: typeof input.expected_day === 'string' ? input.expected_day : undefined,
    })}`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.check_availability,
    key,
  );
}

async function callCreateAppointment(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  // Phone injection: endpoint requires `customer_phone`. Runtime overrides
  // any LLM-provided value (see file header).
  if (!_runtimeContext?.phone) {
    return errResult('create_appointment: internal — runtime phone not set');
  }
  const injectedBody = { ...input, customer_phone: _runtimeContext.phone };
  return voiceAgentFetch(
    `/api/voice-agent/appointments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(injectedBody),
    },
    TOOL_TIMEOUT_MS.create_appointment,
    key,
  );
}

async function callSendInfoSms(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  // Phone injection: endpoint requires `phone`. Runtime overrides any
  // LLM-provided value (see file header).
  if (!_runtimeContext?.phone) {
    return errResult('send_info_sms: internal — runtime phone not set');
  }
  const injectedBody = { ...input, phone: _runtimeContext.phone };
  return voiceAgentFetch(
    `/api/voice-agent/send-info-sms`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(injectedBody),
    },
    TOOL_TIMEOUT_MS.send_info_sms,
    key,
  );
}

async function callGetProducts(_input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  return voiceAgentFetch(
    `/api/voice-agent/products`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.get_products,
    key,
  );
}

async function callGetProductDetails(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  const search = typeof input.search === 'string' ? input.search : '';
  if (!search) return errResult('get_product_details: missing required input "search"');
  return voiceAgentFetch(
    `/api/voice-agent/products/details${qs({ search })}`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.get_product_details,
    key,
  );
}

async function callSendQuoteSms(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  // Phone injection: endpoint requires `phone`. Runtime overrides any
  // LLM-provided value (see file header). THE fix for Issue 26 —
  // new-customer test runs were failing here with sub-300ms 400 responses
  // because the LLM had no phone source for unknown customers.
  if (!_runtimeContext?.phone) {
    return errResult('send_quote_sms: internal — runtime phone not set');
  }
  // Issue 45 D49 (2026-05-27): observability log for auto-send trigger
  // detection. Informational only — does NOT gate dispatch. Captures
  // what the LLM thinks counts as "configuration finalized" per Critical
  // Rule 17 preconditions. Post-deploy, operator greps PM2 logs for
  // `[SmsAiV2 dispatch] event=auto_send_trigger` to monitor:
  //   1. How often auto-send fires per conversation
  //   2. Whether services/tiers/quantities are threaded correctly
  //   3. False-fire candidates (audit Pattern 1/3/4/6/7 misclassifications)
  // RuntimeContext shape (`phone`, `conversationId`, `size_class`) does NOT
  // include last in/outbound messages — extending it would require runner
  // refactor (out of D49 scope). The tool args + conversation_id are
  // sufficient for post-deploy false-fire monitoring; cross-reference
  // against the persisted message history via conversationId for full
  // context.
  console.log(
    `[SmsAiV2 dispatch] ${formatLogFields({
      event: 'auto_send_trigger',
      conv: _runtimeContext.conversationId,
      services_count: typeof input.services === 'string'
        ? input.services.split(',').filter((s) => s.trim().length > 0).length
        : 0,
      services: typeof input.services === 'string' ? input.services : null,
      tiers: typeof input.tiers === 'string' ? input.tiers : null,
      quantities: typeof input.quantities === 'string' ? input.quantities : null,
      size_class: _runtimeContext.size_class ?? null,
    })}`,
  );
  // Issue 46 refinement (2026-05-26): tag the request with the originating
  // agent path so the route can branch `notificationType` between
  // `sms_agent_quote_sent` (this dispatcher) and `voice_quote_sent` (the
  // ElevenLabs voice-agent webhook caller, which doesn't pass `source`).
  // Visible operator-side only — Admin Messages log labels each path
  // distinctly via the override map in `message-bubble.tsx`. The voice
  // webhook caller doesn't need to be modified — the route defaults to
  // 'voice_quote_sent' when `source` is missing or invalid.
  const injectedBody = { ...input, phone: _runtimeContext.phone, source: 'sms_agent' as const };
  return voiceAgentFetch(
    `/api/voice-agent/send-quote-sms`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(injectedBody),
    },
    TOOL_TIMEOUT_MS.send_quote_sms,
    key,
  );
}

/**
 * upsert_customer — POST /api/voice-agent/customers. Workstream J
 * Session 3. Persists the customer record AS SOON AS the agent learns the
 * customer's first name, eliminating the orphan-conversation class of
 * bugs (Issues 26-28) that resulted from the prior send_quote_sms
 * side-effect path. Phone AND conversation_id are runtime-injected — the
 * LLM never sees them and cannot get them wrong.
 */
async function callUpsertCustomer(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  if (!_runtimeContext?.phone) {
    return errResult('upsert_customer: internal — runtime phone not set');
  }
  const injectedBody = {
    ...input,
    phone: _runtimeContext.phone,
    conversation_id: _runtimeContext.conversationId,
  };
  return voiceAgentFetch(
    `/api/voice-agent/customers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(injectedBody),
    },
    TOOL_TIMEOUT_MS.upsert_customer,
    key,
  );
}

/**
 * send_payment_link — POST /api/voice-agent/send-payment-link. Phase 3
 * Theme B.2 (AC-11 completion). Forwards the LLM-supplied
 * `appointment_id` / optional `amount_cents` / optional `channels` array
 * directly. No phone injection (the endpoint resolves the destination
 * from the appointment's customer record — agent-supplied phone would
 * be ambiguous on a transferred-call or proxy-conversation flow).
 */
async function callSendPaymentLink(
  input: Record<string, unknown>,
  key: string,
): Promise<DispatchToolResult> {
  return voiceAgentFetch(
    `/api/voice-agent/send-payment-link`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    TOOL_TIMEOUT_MS.send_payment_link,
    key,
  );
}

/**
 * approve_addon / decline_addon — in-process calls. Wrap
 * `approveAddon` / `declineAddon` from `@/lib/services/job-addons` with the
 * same 10-second timeout class as `notify_staff` (both send a confirmation
 * SMS to the customer as a side effect). Helper return shape:
 *   `{ success: true }` → mapped to status='approved'|'declined', isError=false
 *   `{ success: false, expired: true }` → mapped to status='expired', isError=true
 *   `{ success: false, error }` → mapped to status='failed', isError=true
 * The model reads isError and adjusts its customer-facing reply.
 */
async function callAddonAction(
  action: 'approve' | 'decline',
  input: Record<string, unknown>,
): Promise<DispatchToolResult> {
  const addonId = typeof input.addon_id === 'string' ? input.addon_id : '';
  if (!addonId) {
    return errResult(
      `${action}_addon: missing required input "addon_id"`,
    );
  }
  const label = `${action}_addon`;
  const timeout =
    action === 'approve'
      ? TOOL_TIMEOUT_MS.approve_addon
      : TOOL_TIMEOUT_MS.decline_addon;
  const helper = action === 'approve' ? approveAddon : declineAddon;
  const race = await withTimeout(helper(addonId), timeout, label);
  if ('__ok' in race) {
    const r = race.value;
    if (r.success) {
      const successStatus = action === 'approve' ? 'approved' : 'declined';
      const message =
        action === 'approve'
          ? 'Addon approved. Confirmation SMS sent to customer.'
          : 'Addon declined. Confirmation SMS sent to customer.';
      return okResult({
        status: successStatus,
        addon_id: addonId,
        message,
      });
    }
    if (r.expired) {
      return {
        content: safeStringify({
          status: 'expired',
          addon_id: addonId,
          message: 'This addon authorization has expired.',
        }),
        isError: true,
      };
    }
    return {
      content: safeStringify({
        status: 'failed',
        addon_id: addonId,
        error: r.error ?? 'unknown error',
      }),
      isError: true,
    };
  }
  return race;
}

/**
 * notify_staff — in-process call. Skips the HTTP wrapper entirely; the
 * voice-agent endpoint's "200 + { success: false } on bad input" no-retry
 * contract is a Twilio-agent concern, not an SMS-AI-loop concern.
 */
async function callNotifyStaff(input: Record<string, unknown>): Promise<DispatchToolResult> {
  const reason = input.reason;
  if (!isStaffNotificationReason(reason)) {
    return errResult(`notify_staff: invalid reason "${String(reason)}"`);
  }
  // Phone injection: notifyStaff needs `customerPhone` for the audit log
  // lookup (`conversations.phone_number` → message INSERT). Runtime
  // overrides any LLM-provided value so the audit log always lands on the
  // correct conversation thread.
  if (!_runtimeContext?.phone) {
    return errResult('notify_staff: internal — runtime phone not set');
  }
  const customerName =
    typeof input.customer_name === 'string' && input.customer_name.trim()
      ? input.customer_name
      : 'Unknown';
  const customerPhone = _runtimeContext.phone;
  const details =
    typeof input.details === 'string' ? input.details : '';

  const race = await withTimeout(
    notifyStaff({
      reason,
      customerName,
      customerPhone,
      details,
      source: 'sms_ai_v2',
    }),
    TOOL_TIMEOUT_MS.notify_staff,
    'notify_staff',
  );
  if ('__ok' in race) {
    // Propagate the helper's success flag as isError. A success=false result
    // (template inactive, no recipient phones, partial Twilio failures)
    // means the escalation did NOT reach staff — the model needs to know
    // it cannot rely on the handoff and should adjust its reply.
    return {
      content: safeStringify(race.value),
      isError: race.value.success === false,
    };
  }
  // Timed out — race resolved with a DispatchToolResult error.
  return race;
}

// ----- public surface ---------------------------------------------------

export async function dispatchTool(
  input: DispatchToolInput,
): Promise<DispatchToolResult> {
  const t0 = Date.now();
  const { name } = input;

  if (!isToolName(name)) {
    return errResult(`unknown tool: ${name}`);
  }

  // notify_staff / approve_addon / decline_addon are in-process —
  // no Bearer key needed.
  if (name === 'notify_staff') {
    const r = await callNotifyStaff(input.input);
    console.log(
      `[SmsAiV2 dispatch] ${formatLogFields({
        event: 'tool',
        tool: name,
        latency_ms: Date.now() - t0,
        error: r.isError,
      })}`,
    );
    return r;
  }
  if (name === 'approve_addon') {
    const r = await callAddonAction('approve', input.input);
    console.log(
      `[SmsAiV2 dispatch] ${formatLogFields({
        event: 'tool',
        tool: name,
        latency_ms: Date.now() - t0,
        error: r.isError,
      })}`,
    );
    return r;
  }
  if (name === 'decline_addon') {
    const r = await callAddonAction('decline', input.input);
    console.log(
      `[SmsAiV2 dispatch] ${formatLogFields({
        event: 'tool',
        tool: name,
        latency_ms: Date.now() - t0,
        error: r.isError,
      })}`,
    );
    return r;
  }

  const key = await loadVoiceAgentApiKey();
  if (!key) {
    const r = errResult('Tool call failed: voice_agent_api_key not configured');
    console.log(
      `[SmsAiV2 dispatch] ${formatLogFields({
        event: 'tool',
        tool: name,
        latency_ms: Date.now() - t0,
        error: true,
        error_class: 'tool_key_missing',
        reason: 'key_missing',
      })}`,
    );
    return r;
  }

  let result: DispatchToolResult;
  switch (name) {
    case 'lookup_customer':
      result = await callLookupCustomer(input.input, key);
      break;
    case 'get_services':
      result = await callGetServices(input.input, key);
      break;
    case 'classify_vehicle':
      result = await callClassifyVehicle(input.input, key);
      break;
    case 'check_availability':
      result = await callCheckAvailability(input.input, key);
      break;
    case 'create_appointment':
      result = await callCreateAppointment(input.input, key);
      break;
    case 'send_info_sms':
      result = await callSendInfoSms(input.input, key);
      break;
    case 'get_products':
      result = await callGetProducts(input.input, key);
      break;
    case 'get_product_details':
      result = await callGetProductDetails(input.input, key);
      break;
    case 'send_quote_sms':
      result = await callSendQuoteSms(input.input, key);
      break;
    case 'upsert_customer':
      result = await callUpsertCustomer(input.input, key);
      break;
    case 'send_payment_link':
      result = await callSendPaymentLink(input.input, key);
      break;
    default: {
      // Exhaustiveness guard. `name` is `never` here if the switch covers
      // the union; if a new tool is added to SmsAiV2ToolName without a
      // case, this assignment fails to compile.
      const _exhaust: never = name;
      void _exhaust;
      result = errResult(`unhandled tool: ${String(name)}`);
      break;
    }
  }

  console.log(
    `[SmsAiV2 dispatch] ${formatLogFields({
      event: 'tool',
      tool: name,
      latency_ms: Date.now() - t0,
      error: result.isError,
    })}`,
  );
  return result;
}
