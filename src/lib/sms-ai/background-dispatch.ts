/**
 * SMS AI v2 — background dispatch wrapper (Layer 4).
 *
 * The Twilio inbound webhook returns an empty 200 TwiML response to Twilio
 * as soon as it decides the inbound should be handled by v2 (audit §4.2 —
 * fire-and-forget pattern). The actual agent run + outbound SMS happens
 * inside this module, running on the Node event loop after the HTTP
 * response has been flushed.
 *
 * Contract:
 *   - Caller MUST NOT `await` the returned promise — the Twilio handler
 *     has already responded. Errors are swallowed and logged with the
 *     `[SmsAiV2 background]` prefix.
 *   - Outbound chunks are split via the shared `splitSmsMessage` helper
 *     from `@/lib/utils/sms` (same chunker the legacy auto-reply uses) so
 *     v2 output is shape-identical to legacy output.
 *   - Each chunk is sent via `sendSms()` AND logged to `messages` with
 *     `sender_type='ai'`, `channel='sms'` (matches legacy outbounds; the
 *     `messages_channel_check` constraint allows only `('sms', 'voice')`,
 *     so agent identity is captured via `sender_type='ai'` rather than
 *     a v2-specific channel value).
 *   - On `api_error` / `unknown` stop reason or null `assistantText`:
 *     logs the failure, does NOT send any SMS, does NOT retry. The
 *     customer gets no reply for this inbound; the operator sees the
 *     error in logs. Matches audit §4.4 no-retry policy.
 *
 * The dispatcher loads `businessName` / `businessHours` / `currentDate`
 * itself rather than accepting them from the webhook — the webhook
 * shouldn't have to know which inputs the runner needs, and the extra
 * lookup is free since we've already returned to Twilio.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms, splitSmsMessage } from '@/lib/utils/sms';
import { getBusinessInfo } from '@/lib/data/business';
import {
  getBusinessHours,
  formatBusinessHoursText,
} from '@/lib/data/business-hours';
import { runSmsAiV2Agent } from '@/lib/sms-ai/agent-runner';

const LOG_PREFIX = '[SmsAiV2 background]';

export interface BackgroundDispatchInput {
  inboundMessageBody: string;
  conversationId: string;
  /** Customer phone, already normalized to E.164 by the caller. */
  phone: string;
}

/**
 * Run the v2 agent in the background and deliver the result to the customer.
 * Returns a promise the caller does NOT await (fire-and-forget).
 *
 * All paths are wrapped in try/catch so this function never throws — Twilio
 * has already received its 200 response by the time we run.
 */
export async function runV2AgentInBackground(
  input: BackgroundDispatchInput,
): Promise<void> {
  const { inboundMessageBody, conversationId, phone } = input;

  try {
    const [businessInfo, hours] = await Promise.all([
      safeGetBusinessInfo(),
      safeGetBusinessHours(),
    ]);

    const businessName = businessInfo.name;
    const businessHours = hours
      ? formatBusinessHoursText(hours)
      : 'Hours unavailable';
    const currentDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Los_Angeles',
    });

    const result = await runSmsAiV2Agent({
      inboundMessageBody,
      conversationId,
      phone,
      businessName,
      businessHours,
      currentDate,
    });

    if (
      (result.stopReason === 'end_turn' ||
        result.stopReason === 'max_iterations') &&
      result.assistantText &&
      result.assistantText.trim().length > 0
    ) {
      const chunks = splitSmsMessage(result.assistantText);
      await sendAndLogChunks(conversationId, phone, chunks);
      console.log(
        `${LOG_PREFIX} conv=${conversationId} stopReason=${result.stopReason} iterations=${result.iterations} toolCalls=${result.toolCalls.length} chunks=${chunks.length}`,
      );
      return;
    }

    // No SMS sent — log and exit. api_error / unknown / empty text all land here.
    console.log(
      `${LOG_PREFIX} conv=${conversationId} stopReason=${result.stopReason} iterations=${result.iterations} toolCalls=${result.toolCalls.length} chunks=0 noReply=true${
        result.errorMessage ? ` errorMessage="${result.errorMessage}"` : ''
      }`,
    );
  } catch (err) {
    // The runner itself or one of the helpers threw. Log; do NOT propagate.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `${LOG_PREFIX} runner failed conv=${conversationId}: ${msg}`,
    );
  }
}

/**
 * Send each chunk via sendSms() and INSERT a corresponding outbound row
 * into `messages`. Mirrors the legacy webhook's chunk-loop shape (lines
 * 905-919 of `twilio/inbound/route.ts`) so admin UI renders both paths
 * consistently.
 *
 * Schema constraint: messages_channel_check allows ('sms', 'voice') only.
 * v2 outbound rows use 'sms' to match legacy outbounds — agent identity
 * is captured via sender_type='ai' rather than the channel column.
 *
 * INSERT error handling: supabase-js does NOT throw on PG-side errors
 * (CHECK violations, constraint failures, etc.); it resolves with
 * `{ data, error }`. We MUST check the returned `error` field — a bare
 * `await admin.from(...).insert(...)` would silently drop the row and
 * leak only as "customer got SMS but row not in admin UI". Same applies
 * to the conversations.update below.
 */
async function sendAndLogChunks(
  conversationId: string,
  phone: string,
  chunks: string[],
): Promise<void> {
  const admin = createAdminClient();
  let lastChunk = '';

  for (const chunk of chunks) {
    try {
      const smsResult = await sendSms(phone, chunk);
      const { error: insertError } = await admin.from('messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        body: chunk,
        sender_type: 'ai',
        twilio_sid: smsResult.success ? smsResult.sid : null,
        status: smsResult.success ? 'sent' : 'failed',
        channel: 'sms',
      });
      if (insertError) {
        console.error(
          `${LOG_PREFIX} message INSERT failed conv=${conversationId} ` +
            `code=${insertError.code ?? 'unknown'} ` +
            `message=${insertError.message} ` +
            `details=${insertError.details ?? 'n/a'}`,
        );
      }
      lastChunk = chunk;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${LOG_PREFIX} chunk send/log failed conv=${conversationId}: ${msg}`,
      );
    }
  }

  if (lastChunk) {
    try {
      const { error: updateError } = await admin
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: lastChunk.substring(0, 100),
        })
        .eq('id', conversationId);
      if (updateError) {
        console.error(
          `${LOG_PREFIX} conversation UPDATE failed conv=${conversationId} ` +
            `code=${updateError.code ?? 'unknown'} ` +
            `message=${updateError.message} ` +
            `details=${updateError.details ?? 'n/a'}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${LOG_PREFIX} conversation last-message update failed conv=${conversationId}: ${msg}`,
      );
    }
  }
}

async function safeGetBusinessInfo(): Promise<{ name: string }> {
  try {
    const info = await getBusinessInfo();
    return { name: info.name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${LOG_PREFIX} getBusinessInfo failed: ${msg}`);
    return { name: 'Smart Details Auto Spa' };
  }
}

async function safeGetBusinessHours(): Promise<
  Awaited<ReturnType<typeof getBusinessHours>>
> {
  try {
    return await getBusinessHours();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${LOG_PREFIX} getBusinessHours failed: ${msg}`);
    return null;
  }
}
