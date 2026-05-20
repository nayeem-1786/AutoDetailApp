/**
 * SMS AI v2 — agent runner core (Layer 3a).
 *
 * Constructs the Anthropic API call, runs the tool-use loop, caches the
 * system prompt per-conversation, respects the 6-iteration cap, handles
 * `end_turn` + API errors, and dispatches each `tool_use` to the
 * `dispatchTool` stub from `./tool-dispatcher`. Layer 3b replaces the
 * dispatcher body (not this file) with real per-tool routing.
 *
 * Public surface: `runSmsAiV2Agent({...})` → `RunAgentResult`. The Twilio
 * webhook (Layer 4) calls this inside a return-early background task per
 * audit §4.2.
 *
 * Loop semantics (audit §4.4 / §B.2.5):
 *   - "6 iterations" = tool-use round-trips. One round-trip = the model
 *     emits a `tool_use` block AND we feed its `tool_result` back into
 *     the next inference cycle.
 *   - On hitting the cap, we make ONE final call with `tools` omitted and
 *     an injected user-turn nudging the model to summarize using what it
 *     already knows. That extra call is NOT counted as iteration 7.
 *
 * Retry policy (audit §4.4): NO library-level retries — `create_appointment`
 * and the other side-effecting tools are not idempotent. The model is the
 * authority on whether to retry, based on the `is_error` tool_result.
 *
 * Caching (audit §4.5 / §B.2.6): system prompt passed as
 *   `system: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]`
 * Array form is required to attach `cache_control`. Per-conversation
 * substitution of `{CUSTOMER_CONTEXT}` keeps the cached body stable across
 * turns within the ~5-minute cache TTL.
 */

import { APIError } from '@anthropic-ai/sdk';
import type {
  ContentBlock,
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';

import {
  getAnthropicClient,
  MODELS,
} from '@/lib/anthropic/client';

import {
  CUSTOMER_CONTEXT_PLACEHOLDER,
  buildV2SystemPrompt,
} from '@/lib/sms-ai/system-prompt';
import { SMS_AI_V2_TOOLS } from '@/lib/sms-ai/tools';
import {
  dispatchTool,
  __resetForAgentRun as resetDispatcherForAgentRun,
} from '@/lib/sms-ai/tool-dispatcher';

import {
  getCustomerContext,
  type CustomerContext,
} from '@/lib/services/customer-context';
import {
  getConversationHistory,
  type ConversationMessage,
} from '@/lib/services/conversation-history';

const MAX_ITERATIONS = 6;
const MAX_TOKENS = 1024;
const ITERATION_CAP_NUDGE =
  'Tool budget exhausted. Provide a final response to the customer using only what you already know.';

export interface RunAgentInput {
  inboundMessageBody: string;
  conversationId: string;
  /** Customer E.164 phone — must already be normalized by the caller. */
  phone: string;
  businessName: string;
  businessHours: string;
  /** ISO date in America/Los_Angeles, e.g. "2026-05-19". */
  currentDate: string;
}

export interface ToolCallRecord {
  iteration: number;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  /** Stringified tool_result content forwarded back to the model. */
  output: string;
  isError: boolean;
  latencyMs: number;
}

export type RunAgentStopReason =
  | 'end_turn'
  | 'max_iterations'
  | 'api_error'
  | 'unknown';

export interface RunAgentResult {
  /** Final assistant text. Null on `api_error` or unexpected `stop_reason`. */
  assistantText: string | null;
  /** Number of tool-use round-trips consumed (NOT counting the forced final call). */
  iterations: number;
  stopReason: RunAgentStopReason;
  toolCalls: ToolCallRecord[];
  errorMessage?: string;
}

/**
 * Render the canonical `CustomerContext` bundle into a plain-text block the
 * model can read. Kept inside the runner module since it is the only
 * consumer — the cached system prompt has a single `{CUSTOMER_CONTEXT}`
 * placeholder that this output replaces.
 */
function renderCustomerContextBundle(ctx: CustomerContext): string {
  const lines: string[] = [];

  if (ctx.customer) {
    const fullName = [ctx.customer.first_name, ctx.customer.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    lines.push(
      `Customer: ${fullName || 'Unknown'} (${ctx.customer.phone})${
        ctx.customer.email ? ` <${ctx.customer.email}>` : ''
      }`,
    );
    lines.push(
      `SMS consent: ${ctx.customer.sms_consent ? 'yes' : 'no'} | Loyalty: ${
        ctx.customer.loyalty_points_balance
      } pts | AI enabled: ${ctx.customer.is_ai_enabled ? 'yes' : 'no'}`,
    );
  } else {
    lines.push('Customer: UNKNOWN — no record on file for this phone.');
  }

  if (ctx.vehicles.length > 0) {
    lines.push('Vehicles on file:');
    for (const v of ctx.vehicles) {
      const desc = [v.year, v.make, v.model, v.color].filter(Boolean).join(' ');
      const tier = [v.size_class, v.vehicle_type].filter(Boolean).join(' / ');
      lines.push(`  - ${desc || 'unknown vehicle'}${tier ? ` [${tier}]` : ''}`);
    }
  }

  if (ctx.upcoming_appointments.length > 0) {
    lines.push('Upcoming appointments:');
    for (const a of ctx.upcoming_appointments) {
      lines.push(
        `  - ${a.scheduled_date} ${a.scheduled_time} (${a.status}): ${
          a.services.join(', ') || 'no services listed'
        }`,
      );
    }
  }

  if (ctx.recent_quotes.length > 0) {
    lines.push('Recent quotes:');
    for (const q of ctx.recent_quotes) {
      lines.push(
        `  - ${q.quote_number} ${q.status} $${(q.total_amount_cents / 100).toFixed(2)}: ${
          q.services.join(', ') || 'no items'
        }`,
      );
    }
  }

  if (ctx.recent_transactions.length > 0) {
    lines.push('Recent transactions:');
    for (const t of ctx.recent_transactions) {
      lines.push(
        `  - ${t.completed_at} $${(t.total_amount_cents / 100).toFixed(2)}: ${
          t.services.join(', ') || 'no items'
        }`,
      );
    }
  }

  if (ctx.pending_addons.length > 0) {
    lines.push('PENDING ADDON AUTHORIZATIONS:');
    for (const a of ctx.pending_addons) {
      const priceDollars = (a.price_cents / 100).toFixed(2);
      const discountSuffix =
        a.discount_amount_cents > 0
          ? ` (saves $${(a.discount_amount_cents / 100).toFixed(2)})`
          : '';
      const serviceLabel = a.service_name ?? 'Service Add-on';
      lines.push(
        `  - Addon id ${a.id}: "${serviceLabel}" — $${priceDollars}${discountSuffix}. ${a.pickup_delay_minutes} extra min. Expires ${a.expires_at}.`,
      );
      lines.push(
        `    Operator message: ${a.message_to_customer ?? '(none)'}`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Map a stored conversation message to an Anthropic `MessageParam`.
 *
 * - `customer` (inbound) → `user`
 * - `staff` or `ai` (outbound) → `assistant`
 * - `system` messages are DROPPED. The Anthropic `messages` channel only
 *   accepts `user` / `assistant`; system banners (e.g. "AI was toggled off
 *   by staff") belong in the system prompt context, not the message history.
 */
function messageToParam(msg: ConversationMessage): MessageParam | null {
  if (msg.sender_type === 'customer') {
    return { role: 'user', content: msg.body };
  }
  if (msg.sender_type === 'staff' || msg.sender_type === 'ai') {
    return { role: 'assistant', content: msg.body };
  }
  // sender_type === 'system' → drop.
  return null;
}

/** Stringify a dispatcher `content` payload defensively (model always sees a string). */
function ensureString(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Pull the joined text from a Message's content blocks. */
function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function isToolUseBlock(b: ContentBlock): b is ToolUseBlock {
  return b.type === 'tool_use';
}

export async function runSmsAiV2Agent(
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const {
    inboundMessageBody,
    conversationId,
    phone,
    businessName,
    businessHours,
    currentDate,
  } = input;

  const toolCalls: ToolCallRecord[] = [];

  // Per-inbound dispatcher reset — drops the Bearer-key cache so an
  // operator key rotation takes effect on the next inbound without an
  // in-process restart. Cheap call (just two field resets).
  resetDispatcherForAgentRun();

  // 1. Build cached system body. Substitution happens BEFORE the cache_control
  //    block is attached so the substituted text becomes the cache key.
  const promptShell = buildV2SystemPrompt({ businessName, businessHours, currentDate });

  const ctx = await getCustomerContext({
    phone,
    conversationId,
    maxHistoryMessages: 20,
    includeTransactions: true,
  });
  const contextBundle = renderCustomerContextBundle(ctx);
  const systemText = promptShell.split(CUSTOMER_CONTEXT_PLACEHOLDER).join(contextBundle);

  // 2. Load conversation history and convert to MessageParam[]. The current
  //    inbound message may or may not already be the last record — the
  //    webhook may have inserted it before invoking the runner. Append the
  //    current inbound iff it is not already the trailing user message.
  const history = await getConversationHistory({
    conversationId,
    limit: 20,
    excludeSystemMessages: false,
  });

  const messages: MessageParam[] = [];
  for (const msg of history) {
    const param = messageToParam(msg);
    if (param) messages.push(param);
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || last.content !== inboundMessageBody) {
    messages.push({ role: 'user', content: inboundMessageBody });
  }

  const client = getAnthropicClient();
  // Tool definitions cast: SMS_AI_V2_TOOLS uses a structural type that mirrors
  // the SDK's Tool shape but is wire-compatible — the JSON shape matches and
  // the foundation deliberately avoided coupling tools.ts to the SDK.
  const tools = SMS_AI_V2_TOOLS as unknown as Tool[];

  const systemBlocks = [
    {
      type: 'text' as const,
      text: systemText,
      cache_control: { type: 'ephemeral' as const },
    },
  ];

  // 3. Tool-use loop. `iter` starts at 1 and increments on each successful
  //    tool round-trip. Bail on end_turn, on the iteration cap (via forced
  //    final call), on an unknown stop_reason, or on an APIError.
  let iter = 0;
  try {
    while (iter < MAX_ITERATIONS) {
      iter += 1;
      const callStart = Date.now();
      const response: Message = await client.messages.create({
        model: MODELS.SONNET,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        messages,
        tools,
      });
      const latency = Date.now() - callStart;

      const toolUseBlocks = response.content.filter(isToolUseBlock);

      console.log(
        `[SmsAiV2 runner] iter=${iter} conv=${conversationId} stop=${response.stop_reason} tool_calls=${toolUseBlocks.length} latency=${latency}ms`,
      );

      if (response.stop_reason === 'end_turn') {
        const finalText = extractText(response.content);
        console.log(
          `[SmsAiV2 runner] done conv=${conversationId} iterations=${iter} stop=end_turn tool_calls_total=${toolCalls.length}`,
        );
        return {
          assistantText: finalText,
          iterations: iter,
          stopReason: 'end_turn',
          toolCalls,
        };
      }

      if (response.stop_reason !== 'tool_use') {
        console.log(
          `[SmsAiV2 runner] done conv=${conversationId} iterations=${iter} stop=unknown(${response.stop_reason}) tool_calls_total=${toolCalls.length}`,
        );
        return {
          assistantText: null,
          iterations: iter,
          stopReason: 'unknown',
          toolCalls,
        };
      }

      // stop_reason === 'tool_use': append assistant turn and dispatch each
      // tool_use IN PARALLEL via Promise.all (audit §4.3 — independent
      // tools should not serialize; each tool already enforces its own
      // per-tool timeout in the dispatcher, so no outer race needed).
      // Tool-result blocks are reassembled in original tool_use order.
      messages.push({ role: 'assistant', content: response.content });

      const dispatchStart = Date.now();
      const dispatchResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const toolInput =
            (block.input as Record<string, unknown> | null) ?? {};
          const t0 = Date.now();
          const result = await dispatchTool({
            name: block.name,
            input: toolInput,
          });
          return {
            block,
            toolInput,
            result,
            latencyMs: Date.now() - t0,
          };
        }),
      );
      const parallelLatency = Date.now() - dispatchStart;

      const toolResultBlocks: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
        is_error: boolean;
      }> = [];

      for (const { block, toolInput, result, latencyMs } of dispatchResults) {
        const output = ensureString(result.content);
        toolCalls.push({
          iteration: iter,
          toolName: block.name,
          toolUseId: block.id,
          input: toolInput,
          output,
          isError: result.isError,
          latencyMs,
        });
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output,
          is_error: result.isError,
        });
      }

      console.log(
        `[SmsAiV2 runner] iter=${iter} conv=${conversationId} dispatched=${toolUseBlocks.length} parallel_latency=${parallelLatency}ms errors=${toolResultBlocks.filter((b) => b.is_error).length}`,
      );

      messages.push({ role: 'user', content: toolResultBlocks });
    }

    // 4. Iteration cap reached without end_turn — force a final, tools-omitted
    //    inference so the customer always gets a coherent reply. The injected
    //    user nudge tells the model the budget is gone. This forced call is
    //    NOT counted as iteration 7; `iterations` stays at MAX_ITERATIONS.
    messages.push({ role: 'user', content: ITERATION_CAP_NUDGE });
    const forcedStart = Date.now();
    const forced: Message = await client.messages.create({
      model: MODELS.SONNET,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages,
    });
    const forcedLatency = Date.now() - forcedStart;
    const forcedText = extractText(forced.content);
    console.log(
      `[SmsAiV2 runner] iter=${iter}+final conv=${conversationId} stop=${forced.stop_reason} tool_calls=0 latency=${forcedLatency}ms`,
    );
    console.log(
      `[SmsAiV2 runner] done conv=${conversationId} iterations=${iter} stop=max_iterations tool_calls_total=${toolCalls.length}`,
    );
    return {
      assistantText: forcedText,
      iterations: iter,
      stopReason: 'max_iterations',
      toolCalls,
    };
  } catch (err) {
    const message =
      err instanceof APIError
        ? err.message
        : err instanceof Error
        ? err.message
        : String(err);
    console.error(
      `[SmsAiV2 runner] api error: ${message}`,
      { conversationId, iteration: iter },
    );
    return {
      assistantText: null,
      iterations: iter,
      stopReason: 'api_error',
      toolCalls,
      errorMessage: message,
    };
  }
}
