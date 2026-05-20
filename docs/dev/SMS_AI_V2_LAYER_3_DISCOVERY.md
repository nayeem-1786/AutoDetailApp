# SMS AI v2 — Layer 3 Discovery Audit

**Date:** 2026-05-19
**Scope:** Read-only discovery audit (zero source changes) of all inputs Layer 3 (agent runner) needs to draft from.
**Branch:** `audit/sms-ai-v2-layer-3-discovery`
**Status:** Discovery only — no code, tests, migrations, or `package.json` changes. Facts only; no design recommendations.
**Companion docs (full content):**
- `docs/dev/SMS_AI_AUTOREPLY_AUDIT_2026-05-19.md` (526 lines) — auto-reply pipeline analysis
- `docs/dev/SMS_AI_V2_AUDIT_2026-05-19.md` (1121 lines) — voice-agent endpoint catalog + v2 design audit

Both companion docs are full content and version-controlled. This discovery doc references them by section rather than duplicating them in full; the specific extracts Layer 3 needs are reproduced verbatim in §B below.

---

## TL;DR for Layer 3 drafter

### 1. Locked decisions (from §B's Layer 1+2 commits + design audit answers)

Decisions encoded by Layer 1+2 implementation choices (per CHANGELOG `2026-05-18` + audit §7 recommendations):

- **Replace, not coexist** — Layer 5 deletes the specialty-pivot block + `staff_notification_inbound_specialty` template (audit §7.2 / §7.3).
- **Tool surface = full 10** — `lookup_customer`, `get_services`, `classify_vehicle`, `check_availability`, `create_appointment`, `send_info_sms`, `get_products`, `get_product_details`, `notify_staff`, `send_quote_sms` (audit §7.6).
- **`notify_staff` reason codes = 7** — voice-agent's six (`appointment_change`, `custom_quote`, `beyond_scope`, `transfer_request`, `mobile_distance`, `other`) + new `human_handoff` added by Layer 1+2 helper (audit §7.5).
- **Customer context includes transactions** — capped to last 5 for known customers only (audit §7.4); also caps conversation history at last 20 (down from 100) per audit §6.7 token-budget rationale.
- **Reuse voice-agent endpoints as-is** — all 14 endpoints share Bearer auth via `business_settings.voice_agent_api_key`; SMS AI v2 reuses the same key (audit §1.1, §6.3).
- **Return-early Twilio pattern (Layer 4)** — Layer 4 mirrors `voice-agent/finalize-call`: ACK Twilio immediately with empty TwiML, run tool loop in background (audit §4.2). Layer 3 itself runs INSIDE the background task, not inside the webhook.
- **Feature flag = 3-key router** — `sms_ai_v2_kill_switch` (wins all), `sms_ai_v2_globally_enabled`, `sms_ai_v2_enabled_phones` (E.164 allowlist). All default false. Seeded by migration `20260518215003_add_sms_ai_v2_settings.sql`. Routing in `src/lib/sms-ai/feature-flag.ts`.
- **Channel attribution = version-free** — Layer 1+2 helper `notifyStaff()` writes audit-log channel `'sms_ai'` (not `'sms_ai_v2'`) so column survives v3+ runtime changes (see `staff-notification.ts:90-96`).
  > **Errata 2026-05-20:** This design decision specified `channel='sms_ai'` for version-neutrality, but the production `messages_channel_check` constraint allows only `('sms', 'voice')` — migration `20260324000003_cross_channel_bridge.sql:4`. v2 outbounds in `background-dispatch.ts` now use `channel='sms'` to match legacy outbounds; agent identity is captured via `sender_type='ai'`. The `staff-notification.ts:94-95` `channelForSource()` helper still returns `'sms_ai'` and would also violate the CHECK if a v2 customer triggered `notify_staff` — tracked as a follow-up (see roadmap session ledger #42). Future widening of the CHECK to include `'sms_ai'` is deferred to Layer 5+.
  >
  > **Errata 2026-05-20 (sessions #42 + #43):** This design decision specified `channel='sms_ai'` for version-neutrality, but the production CHECK constraints `messages_channel_check` and `conversations_last_channel_check` allow only `('sms', 'voice')` — migration `20260324000003_cross_channel_bridge.sql`. Both `background-dispatch.ts` (session #42) and `staff-notification.ts` `channelForSource()` (session #43) now return `'sms'` for v2 callers to match legacy outbounds; agent identity is captured via `sender_type='ai'` (background dispatcher outbounds) and `sender_type='system'` + the structured `source` parameter (staff-notification audit rows). Future widening of either CHECK to include `'sms_ai'` (or a separate structured column for agent runtime) is deferred to Layer 5+. Both fixes also added destructured-error handling on every supabase write so any future PG-side failure surfaces in pm2 logs immediately instead of dropping rows silently.
- **`{CUSTOMER_CONTEXT}` placeholder** — system prompt is static across turns; runner substitutes per-conversation context at this single token. Token is `'{CUSTOMER_CONTEXT}'` (exported as `CUSTOMER_CONTEXT_PLACEHOLDER`).

### 2. Open questions still requiring user input

The following design-audit §7 questions were **not** locked by Layer 1+2 (its implementation deferred the choice to Layer 3 or did not encode an answer):

- **§7.1 Anthropic model selection** — `claude-sonnet-4-20250514` is current production. Audit recommends Sonnet 4.6 for main loop + Haiku 4.5 for helper classifications. **No code reflects a choice yet — Layer 3 selects.** Note: workspace CLAUDE.md states latest model family is Claude 4.X with Opus 4.7 / Sonnet 4.6 / Haiku 4.5 as canonical IDs.
- **§7.7 Rollout strategy ordering** — feature-flag infra supports (a) per-phone, (b) global, (c) kill switch. The audit's recommended sequencing (a → b → full) is not encoded in code; both per-phone and global are usable from day one.
- **`is_ai_enabled = false` side effect** (audit §6.6) — does `notify_staff` flip `is_ai_enabled` automatically inside the tool, or does the calling webhook handler do it after the tool returns? Not yet decided in code; `notifyStaff()` does NOT currently mutate `conversations.is_ai_enabled` (see staff-notification.ts:170-219 — only writes message+conversation update for last_message_at/preview/channel).
- **Per-turn outbound dedup / `MessageSid` unique index** (audit §4.6) — explicit out-of-scope-for-v2 in the design audit.
- **`sender_type` overload** (audit §6.2) — whether tool-driven sends get a distinct `sender_type` or just metadata. Not decided in code.

### 3. Foundation file inventory (Layer 1+2 — full source in §A)

| File | One-line export summary |
|---|---|
| `src/lib/sms-ai/feature-flag.ts` | `shouldUseSmsAiV2(phone, flags)` pure router + `loadSmsAiV2Flags()` DB reader. Constants: `SMS_AI_V2_FLAG_KEYS`, `SAFE_DEFAULT_FLAGS`. Type: `SmsAiV2FeatureFlags`. |
| `src/lib/sms-ai/system-prompt.ts` | `buildV2SystemPrompt(inputs)` returns full prompt string with `{CUSTOMER_CONTEXT}` placeholder. Type: `SystemPromptInputs`. Constant: `CUSTOMER_CONTEXT_PLACEHOLDER`. |
| `src/lib/sms-ai/tools.ts` | Declarative `SMS_AI_V2_TOOLS` (readonly 10 entries), `TOOL_NAMES` const, type `SmsAiV2ToolName` (union), type `SmsAiV2Tool`. **No runner.** No `@anthropic-ai/sdk` dependency. |
| `src/lib/services/customer-context.ts` | `getCustomerContext({phone, conversationId?, maxHistoryMessages?, includeTransactions?})` → unified snapshot. Types: `CustomerContext`, `CustomerContextCustomer/Vehicle/Appointment/Quote/Transaction`. Caps: 20 history / 5 txns / 5 appts / 3 quotes. |
| `src/lib/services/conversation-history.ts` | `getConversationHistory({conversationId?, phone?, limit?, excludeSystemMessages?})` → `ConversationMessage[]`. Default limit 20, chronological. Type: `ConversationMessage`. |
| `src/lib/services/staff-notification.ts` | `notifyStaff({reason, customerId?, customerName, customerPhone, details, source})` → `NotifyStaffResult`. Reason union: 7 values. Constants: `STAFF_NOTIFICATION_REASONS`, `REASON_LABELS`. `source: 'voice_agent' \| 'sms_ai_v2'` controls audit channel ('voice' vs 'sms_ai'). |

Test files added by merge `0147c3c5` (Layer 1+2 — names only, no source dump):

- `src/lib/sms-ai/__tests__/feature-flag.test.ts`
- `src/lib/sms-ai/__tests__/tools.test.ts`
- `src/lib/sms-ai/__tests__/system-prompt.test.ts`
- `src/lib/services/__tests__/conversation-history.test.ts`
- `src/lib/services/__tests__/customer-context.test.ts`
- `src/lib/services/__tests__/staff-notification.test.ts`
- `src/app/api/voice-agent/notify-staff/__tests__/route.test.ts` (route refactor pinning tests)

No `TODO`, `LAYER 3`, `FIXME`, or `XXX` markers exist in either the 6 source files or their tests (grep verified).

### 4. Tool latency table (copy from §H)

| Tool | Wraps | Latency class | Evidence | Has internal timeout |
|---|---|---|---|---|
| `lookup_customer` | GET `/api/voice-agent/customers` | FAST | 3 sequential Supabase queries; no external API. `customers/route.ts:37-72`. | none |
| `get_services` | GET `/api/voice-agent/services` | MEDIUM | 1 query + addon/prerequisite joins + canonical-engine pricing pass over all rows. Target response ~18KB. `services/route.ts:29-59` (317 lines total). | none |
| `classify_vehicle` | GET `/api/voice-agent/vehicle-classify` | FAST | DB-driven classifier; no external. `vehicle-classify/route.ts` (91 lines). | none |
| `check_availability` | GET `/api/voice-agent/availability` | FAST–MEDIUM | 3 Supabase queries (service, business_settings, appointments) + slot-generation in process. `availability/route.ts:84-160`. | none |
| `create_appointment` | POST `/api/voice-agent/appointments` | SLOW | Find-or-create customer + vehicle, INSERT appointment + appointment_services, fire booking webhook (`fireWebhook` at `appointments/route.ts:610`), `sendSms` for appointment-confirmed template (fire-and-forget `.catch` at `appointments/route.ts:346,597`), insert system message. Quote-conversion branch calls `convertQuote()`. Two side-effecting external APIs (webhook + Twilio). `appointments/route.ts` is 720 lines. | none |
| `send_info_sms` | POST `/api/voice-agent/send-info-sms` | MEDIUM–SLOW | Customer lookup + business info + `createShortLink` + `renderSmsTemplate` + `sendSms` (Twilio external). 6 type branches with varied work; `quote_link` does additional quote-lookup. `send-info-sms/route.ts:62-353` (369 lines). | none |
| `get_products` | GET `/api/voice-agent/products` | MEDIUM | Single Supabase query for all active products + in-process variant dedup. Response target ~38KB. `products/route.ts:27-43`. | none |
| `get_product_details` | GET `/api/voice-agent/products/details` | FAST | Single ILIKE query against name + description, max 5 results. `products/details/route.ts` (160 lines). | none |
| `notify_staff` | POST `/api/voice-agent/notify-staff` → `notifyStaff()` helper | MEDIUM–SLOW | `renderSmsTemplate` + `getBusinessInfo` (in-process cached) + N sequential `sendSms` calls (Twilio, one per recipient) + audit-log message+conversation update. Helper `staff-notification.ts:122-235`. | none |
| `send_quote_sms` | POST `/api/voice-agent/send-quote-sms` | SLOW | Resolves comma-separated service names (loop of `resolveServiceByName` queries), find-or-create customer + vehicle, `createQuote()`, `createShortLink`, `renderSmsTemplate`, `sendSms` (Twilio). `send-quote-sms/route.ts:84-309` (309 lines). | none |

**No tool currently carries an `AbortController` or any `signal:` parameter on its internal fetches** (grep across all 14 voice-agent route files returned zero hits). External APIs (Twilio, webhooks) rely on their own underlying default fetch behavior with no explicit deadline.

### 5. Logger module to import

**There is no canonical logger module in `src/lib/`.** Convention is `console.log` / `console.warn` / `console.error` with a bracketed prefix string. Examples:

- API route: `console.error('[NotifyStaff] Error:', err)` (`src/app/api/voice-agent/notify-staff/route.ts:65`)
- Cron handler: `console.log('[CRON] Starting ${name}')` (`src/lib/cron/scheduler.ts:80`)
- Lib module: `console.error('[notifyStaff] audit log failed:', err)` (`src/lib/services/staff-notification.ts:222`)

Output is plain text (not structured JSON). Structured fields like `traceId` / `requestId` / `conversationId` are **not** conventionally attached; per-call context is interpolated into the prefix string instead. The closest thing to a perf-trace primitive is `createPerfTimer()` in `src/lib/utils/voice-perf.ts` (referenced by every voice-agent route) which emits a single trailing log line per call with mark timings — see `notify-staff/route.ts:23` and `availability/route.ts:18,74,89,160,163` for examples. No SMS AI v2 file currently uses `createPerfTimer`.

### 6. Typecheck errors to zero at Layer 3 start

**Baseline at this discovery's HEAD: 29 errors.**

The 2 CC-introduced Layer 1+2 errors (roadmap line 127 — "vi.fn arity issue and sendSmsMock type issue") are:

- **`src/app/api/voice-agent/notify-staff/__tests__/route.test.ts:42:86`** — error TS2554: `Expected 0 arguments, but got 1.` (`vi.fn` arity — the variadic spread doesn't match the declared `vi.fn()` signature.)
- **`src/lib/services/__tests__/staff-notification.test.ts:299:52`** — error TS2322: `Type 'Promise<{ success: false; error: string; }>' is not assignable to type 'Promise<{ success: true; sid: string; }>'.` (`sendSmsMock` type — the test passes a failure-shape result but the mock was declared with only the success-shape return type at module scope on line 21-24.)

The remaining 27 are pre-existing on `main` per roadmap entry, distributed in `src/lib/quotes/__tests__/quote-service.modifiers.test.ts` and (per roadmap) `catalog-browser-custom-routing.test.tsx`. Verified count via `npx tsc --noEmit 2>&1 | grep -c "error TS"` = 29.

### 7. Follow-ups surfaced (not fixed in this session)

- Two pre-existing test-file typecheck error clusters (27 errors) remain — scheduled per roadmap for Layer 3 start cleanup. Discovery did not touch them.
- `notifyStaff()` does NOT currently mutate `conversations.is_ai_enabled = false` (audit §6.6 question is unresolved in code) — Layer 3 (or Layer 4 / Layer 5 cutover) needs to decide whether the v2 specialty handoff path reuses the legacy webhook's inline `is_ai_enabled = false` write at `route.ts:672` or moves the side effect into the tool helper.
- `messages.twilio_sid` has no UNIQUE constraint (audit §4.6) — out of scope for v2 but worth filing.
- No internal `AbortController` exists on any voice-agent tool — Layer 3's per-tool timeout policy (audit §4.4 recommends 5s Promise.race) will be the FIRST line of latency-bound enforcement for these endpoints.
- The `[SMS DEBUG]` log line at `src/lib/utils/sms.ts:95` is a temporary diagnostic from Twilio 30034 work — comment says "Revert in follow-up session." Independent of Layer 3 but worth noting because it pollutes every SMS send log line.
- The voice-agent `notify-staff` HTTP endpoint preserves a "200 + `{success: false}`" no-retry contract for invalid input (`notify-staff/route.ts:42-46`). Layer 3's in-process tool dispatcher does NOT call this endpoint — it calls the `notifyStaff()` helper directly. The HTTP no-retry contract is irrelevant inside the agent loop.

---

## §A — Layer 1+2 foundation files (full source)

### `src/lib/sms-ai/feature-flag.ts` (152 lines)

**Imports:**
- `createAdminClient` from `@/lib/supabase/admin`
- `normalizePhone` from `@/lib/utils/format`

**Exports:**
- `interface SmsAiV2FeatureFlags { killSwitch: boolean; enabledPhones: string[]; globallyEnabled: boolean }`
- `const SMS_AI_V2_FLAG_KEYS = { KILL_SWITCH, ENABLED_PHONES, GLOBALLY_ENABLED }` (as const)
- `const SAFE_DEFAULT_FLAGS: SmsAiV2FeatureFlags`
- `function shouldUseSmsAiV2(phone: string, flags: SmsAiV2FeatureFlags): boolean`
- `async function loadSmsAiV2Flags(): Promise<SmsAiV2FeatureFlags>`

**What it does:** Pure-function router (`shouldUseSmsAiV2`) + async DB reader (`loadSmsAiV2Flags`). Kill switch beats global enable beats allowlist match. Allowlist phones normalized to E.164 on both sides. Defaults safe (v2 disabled) on missing keys / DB error.

**Handoff markers:** none.

```ts
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
```

### `src/lib/sms-ai/system-prompt.ts` (195 lines)

**Imports:** none (pure data + string builder).

**Exports:**
- `interface SystemPromptInputs { businessName: string; businessHours: string; currentDate: string }`
- `const CUSTOMER_CONTEXT_PLACEHOLDER = '{CUSTOMER_CONTEXT}'`
- `function buildV2SystemPrompt(inputs: SystemPromptInputs): string`

**What it does:** Returns the v2 system prompt as a single string with 13 critical rules, 7 reason codes named, 10 tools named, cross-channel awareness, and a `{CUSTOMER_CONTEXT}` placeholder that the runner substitutes per-conversation. Static across turns of a conversation (the three dynamic inputs are stable per conversation, trailing at the bottom for cache stability).

**Handoff markers:** none.

```ts
/**
 * SMS AI v2 — system prompt builder.
 *
 * Single source of truth for the SMS AI agent's behavior. Used in two places:
 *
 *   1. Active runtime prompt: Layer 3 runner calls buildV2SystemPrompt() once
 *      per inbound to assemble the system message. {CUSTOMER_CONTEXT}
 *      placeholder is replaced by the runner with per-conversation context
 *      (preserving cacheability of everything else).
 *
 *   2. "Apply Standard Template" source in the admin panel. Operators can
 *      override the active prompt via business_settings.messaging_ai_instructions;
 *      clicking the reset link in admin pulls THIS file's output verbatim.
 *
 * Structured for prompt caching (audit §4.5): no per-customer interpolation in
 * the cached body. Three dynamic inputs (businessName, businessHours,
 * currentDate) are stable per-conversation and trail at the bottom so they
 * invalidate cache only when needed.
 *
 * The prompt merges the voice agent's structural rigor (critical rules,
 * tool-decision guide, notify_staff escalation) with the legacy SMS responder's
 * casual texting voice. Cross-channel awareness section makes the agent aware
 * that voice + SMS share a single conversation thread.
 */

export interface SystemPromptInputs {
  businessName: string;
  /** Human-readable business hours line, e.g. "Mon-Fri 8am-5pm, Sat-Sun by appointment". */
  businessHours: string;
  /** ISO date in America/Los_Angeles, e.g. "2026-05-18". */
  currentDate: string;
}

export const CUSTOMER_CONTEXT_PLACEHOLDER = '{CUSTOMER_CONTEXT}';

export function buildV2SystemPrompt(inputs: SystemPromptInputs): string {
  // [full body — 158 lines — preserved verbatim. See src/lib/sms-ai/system-prompt.ts]
  // The function returns a backticked template literal containing:
  //   # Identity (Tom persona, channel rules)
  //   # Channel rules (SMS-specific)
  //   # Critical rules (13 numbered)
  //   # Cross-channel awareness
  //   # Vehicle size mapping (for pricing lookup)
  //   # Tool usage guide
  //   # Vehicle info requirement
  //   # Escalation guide (notify_staff reasons — all 7 listed)
  //   # Conversation flow (new / returning / after-hours)
  //   # RO Water
  //   # Multi-language support
  //   # What you cannot do
  //   # Context for this conversation         (← {CUSTOMER_CONTEXT} placeholder)
  //   # Grounding                              (← currentDate + businessHours)
}
```

> **NOTE on the body:** The system-prompt body is 158 lines of literal text. Reproducing it inline would duplicate canonical content that already lives at `src/lib/sms-ai/system-prompt.ts:39-193`. Layer 3 drafters should `cat` that file. The 16 vitest cases in `__tests__/system-prompt.test.ts` pin every invariant (8 sections present, all 10 tools named, all 7 reasons listed, STOP/UNSUBSCRIBE rule, exactly 13 critical rules, single `{CUSTOMER_CONTEXT}` occurrence, deterministic output, multi-language list, cross-channel mention of Q-0023, etc.). Run those tests instead of re-reading the prompt for structural confidence.

### `src/lib/sms-ai/tools.ts` (234 lines)

**Imports:** none (pure declarative data + structural types).

**Exports:**
- `type SmsAiV2ToolName = 'lookup_customer' | 'get_services' | 'classify_vehicle' | 'check_availability' | 'create_appointment' | 'send_info_sms' | 'get_products' | 'get_product_details' | 'notify_staff' | 'send_quote_sms'`
- `const TOOL_NAMES: readonly SmsAiV2ToolName[]` (same 10, in dispatch order)
- `interface SmsAiV2Tool { name: SmsAiV2ToolName; description: string; input_schema: {...} }`
- `const SMS_AI_V2_TOOLS: readonly SmsAiV2Tool[]` (10 entries — full Anthropic-compatible Tool shape)

**What it does:** Static array of 10 Anthropic-compatible tool definitions. Each has a `name`, a `description` (model's primary tool-selection signal — terse, declarative, prescriptive about WHEN), and a JSON-schema `input_schema` (object root, properties, required). Side-effecting tools (`create_appointment`, `send_info_sms`, `notify_staff`, `send_quote_sms`) each carry an "Only call this when the customer has explicitly confirmed they want to take this action." sentence in their description.

**Handoff markers:** none. (Inline comment at lines 18-21 explicitly notes: "The `@anthropic-ai/sdk` dependency is NOT yet installed (Layer 3 brings it). We define a minimal structural type that matches the Anthropic `Tool` shape so we don't depend on the SDK for declarative data.")

> **NOTE on the body:** The 10 tool-definition objects (lines 58-233) are 175 lines of declarative JSON-schema data. Layer 3 drafters consume them by `import { SMS_AI_V2_TOOLS } from '@/lib/sms-ai/tools'`. The 18 vitest cases in `__tests__/tools.test.ts` pin every invariant. See the table in §3 (TL;DR) for tool-by-tool latency mapping.

### `src/lib/services/customer-context.ts` (311 lines)

**Imports:**
- `createAdminClient` from `@/lib/supabase/admin`
- `normalizePhone` from `@/lib/utils/format`
- `getConversationHistory`, `type ConversationMessage` from `@/lib/services/conversation-history`

**Exports:**
- Interfaces: `CustomerContextCustomer`, `CustomerContextVehicle`, `CustomerContextAppointment`, `CustomerContextQuote`, `CustomerContextTransaction`, `CustomerContext`, `GetCustomerContextParams`
- `async function getCustomerContext(params: GetCustomerContextParams): Promise<CustomerContext>`

**What it does:** Single-call unified customer snapshot (customer + vehicles + upcoming_appointments + recent_quotes + recent_transactions in cents + conversation_history). Defaults: 20 history messages, 5 transactions for known customers only, 5 upcoming appointments, 3 recent quotes. Unknown phone returns `customer: null` + empty arrays + still-populated `conversation_history` keyed by phone. Money values converted from NUMERIC(10,2) dollars in DB to integer cents in output. Field aliases: `appointments.scheduled_start_time` → output `scheduled_time`; `transactions.transaction_date` → output `completed_at`.

**Handoff markers:** none. JSDoc at lines 10-15 explicitly notes the `vehicles[].is_primary` field is OUT OF SCOPE for Layer 1+2 (DB has no such column).

> **NOTE on the body:** Function body is 178 lines of Supabase chain calls + result shaping. Layer 3 consumes via `import { getCustomerContext } from '@/lib/services/customer-context'`. See `__tests__/customer-context.test.ts` for the 15 invariants it pins.

### `src/lib/services/conversation-history.ts` (78 lines)

**Imports:**
- `createAdminClient` from `@/lib/supabase/admin`
- `normalizePhone` from `@/lib/utils/format`

**Exports:**
- `type ConversationMessageSenderType = 'customer' | 'staff' | 'ai' | 'system'`
- `interface ConversationMessage { id, sender_type, direction: 'inbound'|'outbound', body, channel: string|null, created_at }`
- `interface GetConversationHistoryParams { conversationId?, phone?, limit?, excludeSystemMessages? }`
- `async function getConversationHistory(params): Promise<ConversationMessage[]>`

**What it does:** Lightweight messages fetcher. Resolves by `conversationId` (wins) or falls back to phone lookup. Default `limit = 20`, returns chronological (oldest-first) order. Optional `excludeSystemMessages` filter (default false — keeps `sender_type='system'` messages).

**Handoff markers:** none.

```ts
/**
 * getConversationHistory — fetch messages from a conversation thread.
 *
 * Small helper for callers that need ONLY message history, not the full
 * customer-context bundle. `getCustomerContext` (this directory) uses this
 * internally for its conversation_history field; the SMS AI v2 runner and
 * any other caller that needs JUST messages can use it directly.
 *
 * Resolution order: conversationId wins over phone. If neither is provided,
 * returns []. If phone is provided but doesn't map to a conversation,
 * returns [].
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';

export type ConversationMessageSenderType =
  | 'customer'
  | 'staff'
  | 'ai'
  | 'system';

export interface ConversationMessage {
  id: string;
  sender_type: ConversationMessageSenderType;
  direction: 'inbound' | 'outbound';
  body: string;
  channel: string | null;
  created_at: string;
}

export interface GetConversationHistoryParams {
  conversationId?: string;
  phone?: string;
  /** Max messages to return. Default 20. Returned in chronological order (oldest first). */
  limit?: number;
  /** When true, drop sender_type='system' messages from the result. Default false. */
  excludeSystemMessages?: boolean;
}

export async function getConversationHistory(
  params: GetConversationHistoryParams,
): Promise<ConversationMessage[]> {
  const limit = params.limit ?? 20;
  const admin = createAdminClient();

  let conversationId = params.conversationId;
  if (!conversationId && params.phone) {
    const normalized = normalizePhone(params.phone);
    if (!normalized) return [];
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('phone_number', normalized)
      .maybeSingle();
    if (!conv) return [];
    conversationId = conv.id;
  }

  if (!conversationId) return [];

  // Fetch newest-first to honor `limit` against the latest messages, then
  // reverse so callers consume in chronological order.
  const { data, error } = await admin
    .from('messages')
    .select('id, sender_type, direction, body, channel, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const chronological = [...data].reverse() as ConversationMessage[];
  return params.excludeSystemMessages
    ? chronological.filter((m) => m.sender_type !== 'system')
    : chronological;
}
```

### `src/lib/services/staff-notification.ts` (236 lines)

**Imports:**
- `createAdminClient` from `@/lib/supabase/admin`
- `sendSms` from `@/lib/utils/sms`
- `renderSmsTemplate` from `@/lib/sms/render-sms-template`
- `getBusinessInfo` from `@/lib/data/business`
- `normalizePhone`, `formatPhone` from `@/lib/utils/format`

**Exports:**
- `type StaffNotificationReason = 'appointment_change' | 'custom_quote' | 'beyond_scope' | 'transfer_request' | 'mobile_distance' | 'human_handoff' | 'other'` (7 values)
- `const STAFF_NOTIFICATION_REASONS: readonly StaffNotificationReason[]` (same 7)
- `const REASON_LABELS: Record<StaffNotificationReason, string>` (human-readable labels — `human_handoff` uses the `🤚` emoji)
- `interface NotifyStaffParams { reason, customerId?, customerName, customerPhone, details, source: 'voice_agent' | 'sms_ai_v2' }`
- `interface NotifyStaffResult { success, recipientsNotified, errors, templateInactive?, noRecipients? }`
- `function isStaffNotificationReason(value: unknown): value is StaffNotificationReason`
- `async function notifyStaff(params: NotifyStaffParams): Promise<NotifyStaffResult>`

**What it does:** Single canonical staff-alert dispatcher used by the voice-agent `/notify-staff` HTTP wrapper today AND (by future v2) the SMS AI v2 `notify_staff` tool. Renders `staff_notification` template (not the `_inbound_specialty` sub-slug — that's being deleted in Layer 5). Recipient chain: `sms_templates.recipient_phones` → `business_settings.business_phone` (via `getBusinessInfo()`) → `BUSINESS_DEFAULTS.phone`. Sequential per-recipient sends with structured `{success, recipientsNotified, errors}` outcome (does NOT swallow individual failures). Inserts audit log message into customer's conversation thread with channel `'sms_ai'` when `source: 'sms_ai_v2'`, channel `'voice'` when `source: 'voice_agent'`. Does NOT mutate `conversations.is_ai_enabled` (audit §6.6 question).

**Handoff markers:** none. JSDoc on `channelForSource` (lines 87-93) explicitly explains "Audit-log rows (`messages.channel`, `conversations.last_channel`) outlive any specific agent version, so storing `'sms_ai_v2'` literally would lock the column to today's runtime. When v3 of the SMS agent ships, the channel stays `'sms_ai'`; only the runner's source identifier changes." — i.e., the channel value is **`'sms_ai'`** for SMS AI v2 use (and any v3+), not `'sms_ai_v2'`.

> **NOTE on the body:** Helper body is 136 lines. Layer 3's tool dispatcher imports `notifyStaff` directly — does NOT call the voice-agent HTTP endpoint. See `__tests__/staff-notification.test.ts` for 15 pinning invariants (reason completeness, template-inactive skip path, fallback recipient chain, no-recipient = success:false, partial-failure error aggregation, source-driven channel attribution).

---

## §B — SMS AI v2 audit + design docs

Both docs exist on disk and are version-controlled. Layer 3 should read each in full. Below: the specific extracts called out by the discovery prompt.

### B.1 Autoreply audit (`docs/dev/SMS_AI_AUTOREPLY_AUDIT_2026-05-19.md` — 526 lines)

The autoreply audit is a focused root-cause analysis of the Ferrari-loop production bug. Its main contributions to Layer 3 context:

- **Specialty pivot is the root cause** — `webhooks/twilio/inbound/route.ts:612-674`. Pre-AI gate fires for any customer with a `vehicles.size_class IN ('exotic','classic')` row. Sends hardcoded text built from vehicle record. Body of inbound message is ignored. After sending, sets `conversations.is_ai_enabled = false` on line 672.
- **The Anthropic key rotation is NOT responsible.** Code path is reached BEFORE any Anthropic call.
- **`is_ai_enabled` lifecycle** — 8 write paths documented (audit §2 — STOP/START, regular create, specialty pivot, staff manual reply, voice post-call, admin UI toggle, conversation-helper default).
- **Anthropic call shape (today)** — `messaging-ai.ts:482-495`. Direct `fetch` to `api.anthropic.com/v1/messages`. Model `claude-sonnet-4-20250514`. `max_tokens: 1000`. No `cache_control`. System prompt + up to last 100 history messages.

The full audit lives at `docs/dev/SMS_AI_AUTOREPLY_AUDIT_2026-05-19.md` and is not re-dumped here — file is line-numbered, immediately accessible via `Read` tool, and remains the canonical source. Layer 3's relevant inputs from this doc are the call-shape facts above (already used by Layer 1+2) and the §1 "Architecture / Phases" 11-phase table that maps Twilio inbound flow.

### B.2 Design audit (`docs/dev/SMS_AI_V2_AUDIT_2026-05-19.md` — 1121 lines)

Below: only the specific extracts the discovery prompt requested.

#### B.2.1 The 7 design questions + answers (verbatim from audit §7, plus the answers as locked by Layer 1+2 implementation)

> **§7.1 Which Anthropic model?**
> `claude-sonnet-4-20250514` today. v2 implementation lines up nicely with a move to `claude-sonnet-4-6` (latest GA Sonnet) for the tool-using loop, and optionally `claude-haiku-4-5-20251001` for cheap pre-classification calls (e.g. "is this inbound about a specialty vehicle?"). **Recommendation:** Sonnet 4.6 for the main loop, Haiku 4.5 for any helper classifications. **Confirm with user.**

**Answer (status):** NOT YET LOCKED. Layer 1+2 did not install `@anthropic-ai/sdk` and did not encode a model string. Layer 3 selects. (Note: codebase comment at `src/lib/sms-ai/tools.ts:18-21` says "Layer 3 brings @anthropic-ai/sdk".)

> **§7.2 Does v2 replace OR coexist with the current AI?**
> Two paths: Replace — Delete the single-shot `getAIResponse` path entirely; all SMS AI traffic flows through the tool-using agent. Coexist — Keep `getAIResponse` for short / cheap replies, add a "router" step that picks tool-loop vs single-shot. Adds complexity without obvious value. **Recommendation:** Replace.

**Answer (locked by Layer 1+2 design intent, encoded in Layer 5 plan):** **REPLACE.** Layer 5 deletes the specialty pivot + `staff_notification_inbound_specialty` template, and the roadmap describes v2 as the canonical SMS AI surface post-Layer-5. (Workstream A table in `ROADMAP-13-ITEMS.md:74-81`.)

> **§7.3 Cutover plan for the specialty-vehicle pivot**
> Three options: (a) Delete the pivot block when v2 ships. v2 handles specialty via context + `notify_staff`. (b) Keep the pivot block but feature-flag it; v2 ships behind another flag, both coexist briefly. (c) Migrate pivot to use the v2 tool path immediately (Fix path 3 from the prior audit, but earlier). **Recommendation:** (a) bundled with the v2 cutover.

**Answer (locked):** **(a) — delete bundled with Layer 5.** Workstream A Layer 5 line: "Cutover (delete specialty pivot block, delete `staff_notification_inbound_specialty` template)" (`ROADMAP-13-ITEMS.md:80`).

> **§7.4 Should the v2 system prompt include transaction history?**
> Today's handler does (last 10 transactions). Voice agent's `context` endpoint does NOT. **Recommendation:** include for known customers only, capped at last 5. Confirm with user.

**Answer (locked):** **YES — capped to last 5 for known customers only.** Encoded in `getCustomerContext`: `RECENT_TRANSACTIONS_LIMIT = 5`, gated on `includeTransactions !== false` AND `customer != null`. See `customer-context.ts:48,231-244`.

> **§7.5 Which `notify_staff` reason codes does SMS AI v2 use?**
> Voice agent's six: `appointment_change`, `custom_quote`, `beyond_scope`, `transfer_request`, `mobile_distance`, `other`. SMS context overlaps but adds e.g. "STOP message arrived" or "explicit human handoff". **Confirm which reason codes are in scope.**

**Answer (locked):** **7 reasons.** The 6 voice-agent reasons + new `human_handoff`. Encoded as `STAFF_NOTIFICATION_REASONS` in `staff-notification.ts:41-49`. Voice-agent endpoint accepts the new value forward-compatibly via the `isStaffNotificationReason` guard.

> **§7.6 Tool surface — start narrow or wide?**
> The brief lists 10 tool names. We could start v2 with a NARROWER set (6 tools) and add 4 in a follow-up. **Recommendation:** start with the full 10.

**Answer (locked):** **FULL 10.** All 10 tool definitions present in `SMS_AI_V2_TOOLS` (`tools.ts:58-233`).

> **§7.7 What's the test/rollout strategy?**
> (a) Feature-flag v2 per-customer (e.g., test on the owner's own phone number first). (b) Feature-flag v2 globally with kill-switch. (c) A/B by phone-number hash. **Recommendation:** (a) → (b) → full rollout.

**Answer (status):** **Infrastructure encoded — sequencing is operator's choice.** The 3-key flag schema supports all of (a) per-phone allowlist via `sms_ai_v2_enabled_phones`, (b) global via `sms_ai_v2_globally_enabled`, and (kill-switch) via `sms_ai_v2_kill_switch`. Defaults safe (all off). Layer 4 wires routing; the audit recommendation of a→b→full is the documented sequence but operator decides on ramp.

#### B.2.2 The 14 voice-agent endpoint catalogue (verbatim from audit §1.1)

| # | Brief's tool name | Repo path | Method | Notes (audit) |
|---|---|---|---|---|
| 1 | `lookup_customer` | `src/app/api/voice-agent/customers/route.ts` | GET | Phone-based lookup. Returns customer + vehicles + upcoming-appt count. |
| 2 | `get_services` | `src/app/api/voice-agent/services/route.ts` | GET | Full service catalog with pricing tiers + addons + prerequisites. ~18KB. |
| 3 | `classify_vehicle` | `src/app/api/voice-agent/vehicle-classify/route.ts` | GET | Returns `size_class`, `vehicle_category`, `tier_name`, `needs_year_confirmation`. |
| 4 | `check_availability` | `src/app/api/voice-agent/availability/route.ts` | GET | 30-min slots for a date, given service duration + business hours. |
| 5 | `create_appointment` | `src/app/api/voice-agent/appointments/route.ts` | POST | Two paths: direct booking OR quote_id conversion. Writes appointments + appointment_services + fires webhook + sends appointment_confirmed SMS. |
| 6 | `send_info_sms` | `src/app/api/voice-agent/send-info-sms/route.ts` | POST | 6 info types: `store_info`, `product_link`, `category_link`, `service_page`, `booking_link`, `quote_link`. |
| 7 | `finalize_call` | `src/app/api/voice-agent/finalize-call/route.ts` | POST | **Voice-only.** Background-processes the transcript. SMS AI v2 skips this. |
| 8 | `get_products` | `src/app/api/voice-agent/products/route.ts` | GET | Lightweight catalog — dedupes variant groups to cheapest. ~38KB. |
| 9 | `get_product_details` | `src/app/api/voice-agent/products/details/route.ts` | GET | Detailed lookup by `search=`. Max 5 results. ~1-6KB. |
| 10 | `notify_staff` | `src/app/api/voice-agent/notify-staff/route.ts` | POST | Renders `staff_notification` template + sends to `recipient_phones`. |
| — (not in brief) | — | `src/app/api/voice-agent/context/route.ts` | GET | Unified single-call snapshot — voice agent's primary context primer. (Replaced for SMS AI v2 by `getCustomerContext()` Layer 1+2 helper.) |
| — (not in brief) | — | `src/app/api/voice-agent/quotes/route.ts` | POST | Creates a quote from a `services[]` array. |
| — (not in brief) | — | `src/app/api/voice-agent/initiation/route.ts` | GET | ElevenLabs call-initiation handler. Voice-only — SMS AI v2 skips. |
| — (not in brief) | — | `src/app/api/voice-agent/send-quote-sms/route.ts` | POST | Resolves comma-separated service names → creates quote → texts the link. |

**Common shape:** Bearer auth via `business_settings.voice_agent_api_key` (validated by `validateApiKey` in `src/lib/auth/api-key.ts:1-43`); admin Supabase client (service role, bypasses RLS); JSON content type for POST / query params for GET; `createPerfTimer()` on every endpoint emitting a console log per call.

#### B.2.3 Endpoints the audit flags as slow / external-API / timeout-prone

- **`create_appointment`** — write-heavy: customer find-or-create + vehicle find-or-create + INSERT appointments + INSERT appointment_services + `fireWebhook()` (external HTTP, fire-and-forget) + `sendSms()` to Twilio (fire-and-forget `.catch`). Quote-conversion branch also calls `convertQuote()` (further writes).
- **`send_info_sms`** — every branch creates a short link (DB write) + `renderSmsTemplate` + `sendSms` (Twilio external API).
- **`send_quote_sms`** — service-name resolution loop + customer/vehicle find-or-create + `createQuote()` + `createShortLink` + Twilio external.
- **`get_services`** (~18KB response) and **`get_products`** (~38KB response) — large payloads; not slow per se but token-heavy when stuffed into agent context.
- **`finalize_call`** — voice-only, NOT in SMS AI v2 tool surface. Listed by audit as the *demonstration* of the "return-early" pattern Layer 4 will mirror at the webhook level (audit §4.2). Layer 3 itself does NOT touch this endpoint.

#### B.2.4 Retry policy decision (audit §4.4 verbatim)

> **Retry policy.** Default to NO automatic retries on tool failures inside the loop. The model can decide to retry or not based on the `{ is_error: true, content: '…' }` tool_result. Adding library-level retries causes double-execution surprises for endpoints that have side effects (e.g., `create_appointment` is not idempotent).

#### B.2.5 What "6 iterations" counts (audit §4.4 verbatim)

> **Cap tool iterations.** Hard-cap at e.g. 6 tool-use round-trips per turn to bound worst-case latency and prevent loops. If the model hits the cap, inject a `stop_sequence` or force a final inference.

"6 iterations" = tool-use round-trips (one round-trip = one `tool_use` block returned by the model + its `tool_result` reply back into the model). Audit also describes per-tool round-trip timing as "0.5-1s typical, 2-3s cold-start worst case" (audit §4.3 table).

#### B.2.6 Prompt-caching strategy (audit §4.5 verbatim)

> The system prompt for SMS AI v2 will be 5-10× larger than today's (tool definitions + per-tool docstrings + service catalog). It's static across all turns of a conversation. Anthropic's prompt caching (`cache_control` blocks) amortizes the cost: first turn pays full prompt-tokens, subsequent turns pay ~10% of that. Highly recommended for v2.
>
> (The `claude-api` skill in this workspace has the canonical guidance for caching strategy. Consult it during v2 implementation, per the skill's trigger criteria.)

Layer 1+2's system-prompt builder is structured for caching: per-conversation variables (`businessName`, `businessHours`, `currentDate`) trail at the bottom; `{CUSTOMER_CONTEXT}` placeholder is the only per-conversation interpolation point (substituted by the runner). The system-prompt JSDoc says: "Structured for prompt caching (audit §4.5): no per-customer interpolation in the cached body."

---

## §C — Existing Anthropic SDK usage in the codebase

### Package status

`@anthropic-ai/sdk`: **NOT INSTALLED.** `grep -i anthropic package.json` returns zero hits. Layer 3 brings the dependency (per `tools.ts:18-21` inline comment).

### Existing usage (10 files via direct `fetch`)

All current Anthropic API calls go through direct `fetch('https://api.anthropic.com/v1/messages', ...)` with `'anthropic-version': '2023-06-01'`. No `@anthropic-ai/sdk` import anywhere. **No `cache_control` block in use anywhere** (grep for `cache_control|cacheControl` matches only Supabase storage `cacheControl: '3600'` etc. — never Anthropic). **No `tools: [...]` parameter passed in any call** (current architecture is single-shot system-prompt + messages).

| File | Model | max_tokens | System? | Tools? | Cache? |
|---|---|---|---|---|---|
| `src/lib/services/messaging-ai.ts:482-495` | `claude-sonnet-4-20250514` | 1000 | yes | no | no |
| `src/lib/services/conversation-summary.ts:62-78` | `claude-haiku-4-5-20251001` | 500 | yes (`SUMMARY_SYSTEM_PROMPT`) | no | no |
| `src/lib/services/ai-content-writer.ts:134-147` | `claude-sonnet-4-20250514` | dynamic (param) | yes | no | no |
| `src/lib/services/ai-content-writer.ts:462-475` | `claude-sonnet-4-20250514` | dynamic | yes (`SPECIALIZED_SYSTEM_PROMPT`) | no | no |
| `src/lib/services/ai-seo.ts:121-134` | `claude-sonnet-4-20250514` | 1500 | yes (`SEO_SYSTEM_PROMPT`) | no | no |
| `src/lib/services/ai-product-enrichment.ts:62-75` | `ENRICHMENT_MODEL = 'claude-haiku-4-5-20251001'` | 2000 | yes (`JSON_REPAIR_PROMPT`) | no | no |
| `src/app/api/admin/cms/pages/ai-draft/route.ts:60-78` | `claude-sonnet-4-20250514` | 4096 | yes | no | no |
| `src/app/api/admin/cms/products/ai-enrich/route.ts:125-133` | (per-batch) | (per-batch) | (per-batch) | no | no |
| `src/app/api/admin/cms/products/ai-enrich/status/route.ts:52` | — | — | — | (GET batch status) | n/a |
| `src/app/api/admin/cms/products/ai-enrich/results/route.ts:49` | — | — | — | (GET batch results) | n/a |

The Message Batches API (`/v1/messages/batches`) is used by the products AI-enrichment flow (admin-driven, offline) — that's the only batch-API usage. Live messaging paths (messaging-ai, conversation-summary, ai-content-writer, ai-seo, ai-product-enrichment, ai-draft) all use the synchronous `/v1/messages` endpoint.

### "AI messaging" module per CLAUDE.md

`src/lib/services/messaging-ai.ts` (511 lines) is the live SMS auto-responder. Direct-fetch pattern. Single-shot — no tool loop, no caching, no SDK. Layer 3 either calls a new module that does have the SDK + tools + caching, or extends this one. Layer 5 deletes the specialty-pivot inline block in the Twilio webhook; the `getAIResponse` function in this file remains until full replacement.

---

## §D — Current Twilio inbound webhook

### File: `src/app/api/webhooks/twilio/inbound/route.ts` (948 lines, single `POST(request)` function)

For Layer 3-relevant facts only. Full file at the cited path.

#### Specialty-pivot block (Layer 5 deletion target)

- **Block boundaries:** `route.ts:612-674` (lines 612-630 = vehicle query + flag set; lines 633-684 = if-branch that builds `autoReply`, fires staff notification, disables AI; the explicit "else { call AI }" closes at line 684). Per the prior audit's citation, the byte-boundary the cutover plan treats as the unit of deletion is **L_start = 612, L_end = 674** (matching audit §1).
- **Trigger condition:** `isCustomer && conversation.customer_id` true (line 617) AND the customer has at least one `vehicles` row with `size_class IN ('exotic', 'classic')` (lines 619-625). When matched, sets `hasSpecialtyVehicle = true` and `specialtyVehicleDesc` from the matched vehicle (line 626-630).
- **Outbound built at:** line 634 (hardcoded string interpolating `specialtyVehicleDesc` + `specialtyVehicleWord`).
- **Staff notification path:** lines 636-669 — renders `staff_notification_inbound_specialty` template + falls back to hand-built `staffMsg` on render failure + recipient chain `templateResult?.recipientPhones || [biz.phone]`.
- **`is_ai_enabled = false` write:** line 672.

#### Where `is_ai_enabled` is read

The PRIMARY gate is at **line 483** — `conversation.is_ai_enabled` inside the `shouldAiReply` predicate (482-487):

```ts
const shouldAiReply =
  conversation.is_ai_enabled &&
  aiMasterEnabled &&
  (!duringBusinessHours ||
    (isUnknown && aiEnabledForUnknown) ||
    (isCustomer && aiEnabledForCustomers));
```

**After this read, the flag is NEVER re-checked before the outbound send.** The send loop at lines 916-941 (`for (const chunk of smsChunks) { ... sendSms(...) }`) runs unconditionally if `autoReply` is non-null. This is the bug Layer 4 fixes (mid-conversation operator-toggle protection).

#### How conversation history is currently assembled

`route.ts:502-507`: direct Supabase query for `messages` where `conversation_id = conversation.id`, ordered ascending, limit 100. Then filtered in code (lines 511-513) to drop `sender_type='system' AND channel='voice'` messages (so voice-channel system banners don't bleed into AI context). The filtered list is passed as the `history` argument to `getAIResponse()` at lines 675-683.

For SMS AI v2 (Layer 3): the canonical replacement is `getConversationHistory({conversationId})` (Layer 1+2 helper at `src/lib/services/conversation-history.ts`) — default limit 20 (down from 100 per audit §6.7 token budget).

#### How staff notifications are currently triggered

Two distinct paths in the inbound webhook (and both call `sendSms` directly — no helper):

1. **Specialty pivot (Layer 5 deletion target):** `route.ts:636-669` — slug `staff_notification_inbound_specialty`. Fallback recipients: `[biz.phone]`.
2. **Quote-block auto-quote success / addon authorization** (separate code paths later in the same file) — call `renderSmsTemplate` + `sendSms` inline.

The Layer 1+2 helper `notifyStaff()` (in `staff-notification.ts`) is the canonical replacement and uses slug `staff_notification` (NOT the `_inbound_specialty` sub-slug). Layer 5 deletes the sub-slug.

#### Composites file: `src/lib/sms/composites.ts`

9 exported composite builders (caller-built strings the SMS template engine treats as chip values):

- `buildJobSummary`, `buildTransactionGreeting`, `buildPaymentInfo`, `buildDepositInfo`, `buildSummaryLine`, `buildFirstNameGreeting`, `buildJobCancelledLine`, `buildReasonLine`, `buildAppointmentSummary`.

None are directly relevant to AI-driven replies — these compose chip values for the legacy template-driven SMS flows (job complete, payment links, etc.). Layer 3 does NOT need to wire any composite into the v2 system prompt; the agent generates body text directly.

#### `staff_notification_inbound_specialty` template (DB)

Queried live:

```json
{
  "slug": "staff_notification_inbound_specialty",
  "required_variables": ["customer_name", "customer_phone", "vehicle_description"],
  "optional_variables": ["customer_email", "size_class", "customer_message_excerpt"],
  "is_active": true,
  "recipient_phones": ["+14242370913", "+14243637450"]
}
```

Note: row exists, is active, and has two recipient phones configured (NOT the NULL-fallback state the audit §3.2 reported as the most likely staff-notification failure mode). Whatever the v1 audit's symptom was, the current DB state has the template configured. Layer 5 deletes this row.

---

## §E — Logging convention

**Canonical logger module:** none. No `src/lib/utils/logger.ts` or similar exists (`fd -t f "logger" src/lib` returns zero hits).

**Convention:** `console.log` / `console.warn` / `console.error` with a **bracketed-prefix string**.

**Output format:** plain text. Not structured JSON.

**Structured fields (traceId / requestId / conversationId):** NOT conventionally attached. Per-call context is interpolated into the message string itself. Examples:

- `console.log('[notifyStaff] reason=${reason} customer=${displayCustomerName} recipients=${notified}/${recipients.length} source=${source}')` (`staff-notification.ts:226-228`)
- `console.log('[Messaging] Disabled AI for conversation ${conversation.id} — specialty vehicle detected')` (`webhooks/twilio/inbound/route.ts:673`)

**Performance-tracing primitive:** `createPerfTimer(label)` in `src/lib/utils/voice-perf.ts` — every voice-agent route uses it (`perf.mark('query:services', t1)` etc.). Emits a single trailing log line per call summarizing all marks. No SMS AI v2 file currently uses it; Layer 3 may want to instrument the tool loop with this primitive to maintain convention parity with the voice-agent code.

**Example by surface:**

| Surface | Example call |
|---|---|
| API route | `console.error('[NotifyStaff] Error:', err)` — `notify-staff/route.ts:65` |
| Cron handler | `console.log('[CRON] Starting ${name}')` — `cron/scheduler.ts:80` |
| Lib module | `console.warn('[SmsAiV2 flag] load failed — defaulting to disabled:', error?.message)` — `feature-flag.ts:136` |

**Implication for Layer 3's "structured logging at each iteration":** the conventional shape is a single-line bracketed-prefix log per iteration with field=value pairs interpolated into the message string. Switching to JSON output (`console.log(JSON.stringify({...}))`) would be a departure from the existing convention.

---

## §F — Test conventions + typecheck baseline

### Vitest setup

Tests are vitest-based. Standard import shape:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

`vi.mock(...)` for module-level mocks (executed before any `import` from that module — vitest hoists). `vi.fn(...)` for callable mock factories. `mockImplementationOnce` for per-test return shapes.

### Mocking `createAdminClient`

The canonical pattern (used by `staff-notification.test.ts:62-103`):

```ts
const adminState = {
  conversation: null as { id: string } | null,
  messageInsertCalled: false,
  // ...
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'conversations') {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: adminState.conversation, error: null }),
          update(payload: Record<string, unknown>) {
            adminState.conversationUpdateCalled = true;
            adminState.lastConversationUpdate = payload;
            return { eq: async () => ({ error: null }) };
          },
        };
        return chain;
      }
      if (table === 'messages') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            adminState.messageInsertCalled = true;
            adminState.lastMessageInsert = payload;
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));
```

This is the chained-stub pattern. There is **no msw**, **no @supabase/supabase-js mock library** — tests build mock chains inline. The `throw new Error('Unexpected table: ...')` ensures any DB call the helper makes that the test didn't mock is loud rather than silent.

### Mocking external HTTP (e.g., Twilio)

`sendSms` is mocked at the module boundary, not at the Twilio HTTP boundary:

```ts
const sendSmsMock = vi.fn(async (_to: string, _body: string) => ({
  success: true as const,
  sid: 'mock-sid',
}));

vi.mock('@/lib/utils/sms', () => ({
  sendSms: (...args: [string, string]) => sendSmsMock(...args),
}));
```

Tests then call `sendSmsMock.mockImplementationOnce(...)` to drive per-test outcomes.

### Mocking Anthropic SDK

**No existing test mocks the Anthropic SDK or `fetch('https://api.anthropic.com...')`.** None of the 10 Anthropic-using files have a test file that mocks the call — the entire AI-call layer is untested at unit level today (live tests via production traffic only). This is a Layer 6 (Tests + observability) gap, NOT a Layer 3 blocker — Layer 3 needs to introduce the first such pattern.

### Layer 1+2 typecheck errors (the 2 CC-introduced ones)

Both verified by running `npx tsc --noEmit` at this discovery's HEAD:

1. **`src/app/api/voice-agent/notify-staff/__tests__/route.test.ts:42:86`** — `error TS2554: Expected 0 arguments, but got 1.`

   Location: inside the `vi.mock('@/lib/services/staff-notification', ...)` factory, line 42:
   ```ts
   notifyStaff: (...args: Parameters<typeof actual.notifyStaff>) => notifyStaffMock(...args),
   ```
   The `notifyStaffMock` declaration (above this line) was declared as `vi.fn()` (zero-arg signature inferred); spreading `args` into it produces the arity mismatch. The roadmap calls this the **"vi.fn arity issue."**

2. **`src/lib/services/__tests__/staff-notification.test.ts:299:52`** — `error TS2322: Type 'Promise<{ success: false; error: string; }>' is not assignable to type 'Promise<{ success: true; sid: string; }>'.`

   Location: inside a `mockImplementationOnce` that returns the failure shape:
   ```ts
   sendSmsMock.mockImplementationOnce(async () => ({
     success: false as const,
     error: 'Twilio 30034',
   }));
   ```
   The `sendSmsMock` was declared with only the success-shape return type at lines 21-24, so the `vi.fn<>` type inference excluded the failure variant. The roadmap calls this the **"sendSmsMock type issue."**

### Baseline typecheck error count

```
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
29
```

Per roadmap entry (line 127): 27 pre-existing on `main` (in `quote-service.modifiers.test.ts` and `catalog-browser-custom-routing.test.tsx`) + 2 CC-introduced during SMS AI v2 Layer 1+2 = 29 total. Confirmed.

Of those 29, today's tsc run shows:

- 27 errors in `src/lib/quotes/__tests__/quote-service.modifiers.test.ts` (TS2352 — Supabase mock-to-real type assertion mismatch repeated 27 times across the file's lines 168-585)
- 1 error in `src/app/api/voice-agent/notify-staff/__tests__/route.test.ts:42` (vi.fn arity)
- 1 error in `src/lib/services/__tests__/staff-notification.test.ts:299` (sendSmsMock type)

The pre-existing 27 are all in a single test file (not the `catalog-browser-custom-routing.test.tsx` listed in the roadmap — that file may have been fixed in an intermediate session, or the roadmap line is conflating two different historical states). Either way, **the baseline at this HEAD is 29.**

---

## §G — Voice-agent endpoint catalogue

All 14 files under `src/app/api/voice-agent/**/route.ts`. Auth: all use `validateApiKey(request)` checking `Authorization: Bearer <voice_agent_api_key>`. No per-tool scoping. Admin Supabase client (service role).

| Path | HTTP methods | Auth | What it returns | Heavy work |
|---|---|---|---|---|
| `customers/route.ts` (104 lines) | GET | Bearer | Customer + vehicles + upcoming-appt count | 3 sequential DB queries (customers, vehicles, appointments count); no external API. |
| `services/route.ts` (317 lines) | GET | Bearer | Full service catalog ~18KB | 1 query with joins (`services` → `service_categories`, `service_pricing`); canonical pricing engine pass per row. |
| `vehicle-classify/route.ts` (91 lines) | GET | Bearer | size_class + vehicle_category + tier_name | Classifier logic + DB lookups against a small table. |
| `availability/route.ts` (200 lines) | GET | Bearer | 30-min slot array OR day_mismatch error | 3 sequential queries (service duration, business_settings business_hours/booking_config, existing appointments for date); in-process slot generation. |
| `appointments/route.ts` (720 lines) | GET + POST | Bearer | GET: upcoming appts; POST: created appointment | POST is the heaviest endpoint: customer find-or-create, vehicle find-or-create, INSERT appointments + appointment_services, `fireWebhook(booking_created)` external HTTP, `sendSms(appointment_confirmed)` Twilio external (fire-and-forget `.catch`), insert system message into conversation. Quote-conversion branch calls `convertQuote()`. |
| `send-info-sms/route.ts` (369 lines) | POST | Bearer | `{success, type}` | Customer lookup + `getBusinessInfo` + `createShortLink` (DB write) + `renderSmsTemplate` + `sendSms` Twilio external. 6 type-specific branches. |
| `finalize-call/route.ts` (116 lines) | POST | Bearer | `{success}` returned immediately | Returns 200 immediately at line 76; runs `processVoiceCallEnd()` in background (no `await`). Demonstrates the return-early pattern Layer 4 will mirror at the SMS webhook. **NOT in SMS AI v2 tool surface.** |
| `initiation/route.ts` (~330 lines) | POST | Bearer | ElevenLabs dynamic variables + initial prompt | Voice-only. **NOT in SMS AI v2 tool surface.** |
| `notify-staff/route.ts` (68 lines) | POST | Bearer | `{success: boolean}` (200 even on invalid input — no-retry contract) | Thin HTTP wrapper around `notifyStaff()` helper. Layer 1+2 refactored this; helper does the work. |
| `products/route.ts` (130 lines) | GET | Bearer | Lightweight catalog ~38KB | 1 query for all active products + in-process variant dedup. |
| `products/details/route.ts` (160 lines) | GET | Bearer | Up to 5 product details | Single ILIKE query on name + description. |
| `quotes/route.ts` (400 lines) | POST | Bearer | Created quote | Customer find-or-create, vehicle find-or-create, INSERT quotes, INSERT quote_items, fire webhook, insert system message. |
| `send-quote-sms/route.ts` (309 lines) | POST | Bearer | `{success, quote_number, quote_link}` | Service-name resolution loop, customer/vehicle find-or-create, `createQuote()`, `createShortLink`, `renderSmsTemplate`, `sendSms` Twilio. Sedan default for size class until vehicle classified. |
| `context/route.ts` (156 lines) | GET | Bearer | Unified customer + conversation snapshot | Voice agent's bootstrapper. SMS AI v2 replaces with Layer 1+2 helper `getCustomerContext()`. |

---

## §H — Tool latency classification

Trace-derived for each of the 10 SMS AI v2 tools. Per-row evidence is the file path + the line of the slowest operation in the call path (typically the external API or the last `await` in the route). `has_internal_timeout` confirmed by `grep -rn "AbortController\|signal:" src/app/api/voice-agent/` → **zero hits** — no tool carries its own deadline.

| `tool_name` | `wraps` | `latency_class` | `evidence` | `has_internal_timeout` |
|---|---|---|---|---|
| `lookup_customer` | GET `/api/voice-agent/customers` | FAST (<500ms) | 3 sequential Supabase queries, no external API. `customers/route.ts:37-72` (customer SELECT, vehicles SELECT, appointments COUNT). | none |
| `get_services` | GET `/api/voice-agent/services` | MEDIUM (~500ms–1s) | Single complex SELECT with two-level joins + in-process pricing engine pass over all rows. Response target ~18KB. `services/route.ts:29-59`. | none |
| `classify_vehicle` | GET `/api/voice-agent/vehicle-classify` | FAST (<500ms) | Classifier with small-table lookups. `vehicle-classify/route.ts` (91 lines total). | none |
| `check_availability` | GET `/api/voice-agent/availability` | FAST–MEDIUM (~300–800ms) | 3 sequential SELECTs + slot generation in process. `availability/route.ts:84-160`. | none |
| `create_appointment` | POST `/api/voice-agent/appointments` | SLOW (>2s realistic) | External HTTP `fireWebhook()` at `appointments/route.ts:610` + Twilio `sendSms` (fire-and-forget but still launched). 720-line file with quote-conversion branching. | none |
| `send_info_sms` | POST `/api/voice-agent/send-info-sms` | MEDIUM–SLOW (1–2s) | Twilio external (`sendSms` at `send-info-sms/route.ts:347`). Customer lookup + business info + short-link creation + template render preceed. | none |
| `get_products` | GET `/api/voice-agent/products` | MEDIUM (~500ms–1s) | Single SELECT over all active products + in-process variant dedup. ~38KB response. `products/route.ts:27-43`. | none |
| `get_product_details` | GET `/api/voice-agent/products/details` | FAST (<500ms) | Single ILIKE-limited query (max 5 results). `products/details/route.ts` (160 lines). | none |
| `notify_staff` | POST `/api/voice-agent/notify-staff` → `notifyStaff()` helper | MEDIUM–SLOW (~1–2s, scales with N recipients) | Helper sends sequentially: `renderSmsTemplate` + `getBusinessInfo` (cached in-process) + N × `sendSms` Twilio external + audit-log message insert + conversation update. `staff-notification.ts:122-235`. | none |
| `send_quote_sms` | POST `/api/voice-agent/send-quote-sms` | SLOW (>2s realistic) | Service-name resolution loop (N × `resolveServiceByName` queries) + customer/vehicle find-or-create + `createQuote()` write + `createShortLink` write + `renderSmsTemplate` + Twilio `sendSms`. `send-quote-sms/route.ts:84-309`. | none |

**Observations for Layer 3's per-tool timeout policy:**

- No tool currently enforces its own deadline. Any per-tool `Promise.race([call, timeoutAfter(N)])` policy at the dispatcher level will be the only line of defense.
- The audit's recommended default (audit §4.4) is 5000ms per tool. With no internal timeouts, that's safe — a 5s dispatcher timeout won't pre-empt any existing internal deadline (none exist).
- The 4 SLOW tools (`create_appointment`, `send_quote_sms`) and MEDIUM–SLOW tools (`send_info_sms`, `notify_staff`) trigger Twilio external calls. Twilio's per-request latency is independent of repo code; cold-path values per Twilio docs are typically <1s but tail >2s is possible.
- The 2 large-payload tools (`get_services` ~18KB, `get_products` ~38KB) are not latency-slow but are **token-expensive** for the agent context. Layer 3 may want to scope a "call once per turn, reuse result" hint in the system prompt (audit also notes this — `tools.ts` description for `get_services` says "Response is large (~18KB); call once per conversation and reuse.")

---

## Verification (pre-commit)

```
$ npx tsc --noEmit 2>&1 | grep -c "error TS"     # 29 (baseline preserved)
$ git status                                       # only docs/ files appear
```

This discovery added one file (`docs/dev/SMS_AI_V2_LAYER_3_DISCOVERY.md`), one CHANGELOG entry, and one roadmap ledger row. Zero `src/` changes.
