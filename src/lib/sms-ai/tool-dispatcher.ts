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
 */

import type { SmsAiV2ToolName } from '@/lib/sms-ai/tools';
import { TOOL_NAMES } from '@/lib/sms-ai/tools';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  notifyStaff,
  isStaffNotificationReason,
} from '@/lib/services/staff-notification';
import { approveAddon, declineAddon } from '@/lib/services/job-addons';

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
};

/** Per-agent-run Bearer key cache. Reset between inbounds via __resetForAgentRun. */
let _cachedApiKey: string | null = null;
let _apiKeyLoadFailed = false;

/**
 * Reset the per-run cache. The agent runner calls this once at the start
 * of every inbound. Module-global state survives between agent runs by
 * default — that's a bug for operator key rotation, hence the explicit
 * reset hook.
 */
export function __resetForAgentRun(): void {
  _cachedApiKey = null;
  _apiKeyLoadFailed = false;
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
      console.warn('[SmsAiV2 dispatch] voice_agent_api_key not configured — HTTP-bound tools will fail');
      return null;
    }
    const raw = typeof data.value === 'string' ? data.value : String(data.value);
    _cachedApiKey = raw.replace(/^"|"$/g, '').trim();
    return _cachedApiKey;
  } catch (err) {
    _apiKeyLoadFailed = true;
    console.warn(
      '[SmsAiV2 dispatch] voice_agent_api_key load threw — HTTP-bound tools will fail:',
      err instanceof Error ? err.message : String(err),
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

async function callLookupCustomer(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  const phone = typeof input.phone === 'string' ? input.phone : '';
  if (!phone) return errResult('lookup_customer: missing required input "phone"');
  return voiceAgentFetch(
    `/api/voice-agent/customers${qs({ phone })}`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.lookup_customer,
    key,
  );
}

async function callGetServices(_input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  return voiceAgentFetch(
    `/api/voice-agent/services`,
    { method: 'GET' },
    TOOL_TIMEOUT_MS.get_services,
    key,
  );
}

async function callClassifyVehicle(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  const make = typeof input.make === 'string' ? input.make : '';
  if (!make) return errResult('classify_vehicle: missing required input "make"');
  return voiceAgentFetch(
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
  return voiceAgentFetch(
    `/api/voice-agent/appointments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    TOOL_TIMEOUT_MS.create_appointment,
    key,
  );
}

async function callSendInfoSms(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  return voiceAgentFetch(
    `/api/voice-agent/send-info-sms`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
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
  return voiceAgentFetch(
    `/api/voice-agent/send-quote-sms`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    TOOL_TIMEOUT_MS.send_quote_sms,
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
  const customerName =
    typeof input.customer_name === 'string' && input.customer_name.trim()
      ? input.customer_name
      : 'Unknown';
  const customerPhone =
    typeof input.customer_phone === 'string' ? input.customer_phone : '';
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
      `[SmsAiV2 dispatch] tool=${name} latency=${Date.now() - t0}ms error=${r.isError}`,
    );
    return r;
  }
  if (name === 'approve_addon') {
    const r = await callAddonAction('approve', input.input);
    console.log(
      `[SmsAiV2 dispatch] tool=${name} latency=${Date.now() - t0}ms error=${r.isError}`,
    );
    return r;
  }
  if (name === 'decline_addon') {
    const r = await callAddonAction('decline', input.input);
    console.log(
      `[SmsAiV2 dispatch] tool=${name} latency=${Date.now() - t0}ms error=${r.isError}`,
    );
    return r;
  }

  const key = await loadVoiceAgentApiKey();
  if (!key) {
    const r = errResult('Tool call failed: voice_agent_api_key not configured');
    console.log(
      `[SmsAiV2 dispatch] tool=${name} latency=${Date.now() - t0}ms error=true key=missing`,
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
    `[SmsAiV2 dispatch] tool=${name} latency=${Date.now() - t0}ms error=${result.isError}`,
  );
  return result;
}
